import { runMutation, RefusedError } from "@/lib/api/gateway";
import { appendLedgerRow } from "@/lib/db/repo";
import { getClient, clientName } from "@/lib/mock/clients";
import type { Client } from "@/lib/types";
import { staffMap } from "@/lib/mock/staff";
import { membershipForClient } from "@/lib/mock/memberships";
import {
  placeOrder,
  blockingProblems,
  type PlaceOrderInput,
  type ShippingMode,
  type ShippingAddress,
} from "@/lib/orders/place";

/**
 * Create an order — through the REAL order pipeline.
 *
 * WHAT THIS USED TO DO, AND WHY IT WAS UNSAFE. It accepted `{clientId, sku,
 * quantity}`, checked only the broad `write:order` capability, and appended a
 * ledger row. That bypassed `validateOrder` entirely — including RULE 4, the
 * prescriber gate — so a COACH could place a line item marked
 * `requiresProviderApproval` (testosterone, a Schedule III drug) just by
 * POSTing to it, and the ledger would record the order as legitimately placed.
 * The UI enforced that gate; the endpoint behind the UI did not, and an endpoint
 * is not protected by the form in front of it.
 *
 * It also wrote ONLY a ledger row: an audit entry asserting an order no board,
 * portal or fulfilment path could resolve.
 *
 * Now it runs `placeOrder`, which runs `validateOrder(input, actor)` with the
 * SERVER-RESOLVED actor. Blocking problems come back as a refusal listing every
 * one of them, and only a clean order is witnessed in the durable ledger.
 *
 * STILL HONEST ABOUT ITS LIMIT: there is no `order` table yet, so the durable
 * artefact is the hash-chained ledger row, not the order itself. The order id
 * is returned so an order table can adopt it later. That gap is tracked, not
 * papered over.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  clientId: string;
  lines: { sku: string; qty: number }[];
  shipping: ShippingMode;
  /** Required when shipping === "ship"; validateOrder enforces completeness. */
  shipTo?: ShippingAddress;
  note?: string;
}

export async function POST(req: Request) {
  return runMutation<Body, Client, { orderId: string; ledger: { id: string; hash: string } }>(req, {
    context: "orders.create",
    capability: "write:order",
    unavailableMessage: "The order could not be recorded. Please try again.",

    parse: (raw) => {
      const b = (raw ?? {}) as Partial<Body> & { sku?: string; quantity?: number };
      if (typeof b.clientId !== "string" || !b.clientId) return "clientId is required.";

      // Accept the legacy single-SKU shape so existing callers keep working,
      // but normalise to lines: the pipeline is multi-line and the prescriber
      // gate is evaluated per line item.
      const lines =
        Array.isArray(b.lines) && b.lines.length
          ? b.lines
          : b.sku
            ? [{ sku: b.sku, qty: Number(b.quantity ?? 1) }]
            : [];
      if (!lines.length) return "At least one order line is required.";
      for (const l of lines) {
        if (!l || typeof l.sku !== "string" || !l.sku) return "Every line needs a sku.";
        if (!Number.isFinite(l.qty) || l.qty <= 0) return `Quantity for ${l.sku} must be positive.`;
      }
      const shipping: ShippingMode = b.shipping === "pickup" ? "pickup" : "ship";
      // shipTo is passed through rather than validated here: validateOrder owns
      // address completeness, and duplicating that rule is how the two drift.
      return { clientId: b.clientId, lines, shipping, shipTo: b.shipTo, note: b.note };
    },

    // Subject loaded server-side; scope comes off the RECORD, not the request.
    loadSubject: (body) => getClient(body.clientId) ?? null,
    scopeOf: (client) => ({
      coachId: client.coachId,
      providerId: client.providerId,
      locationId: client.locationId,
    }),

    execute: async ({ body, subject: client, actor }) => {
      const input: PlaceOrderInput = {
        clientId: client.id,
        clientName: clientName(client),
        coachId: client.coachId,
        locationId: client.locationId,
        lines: body.lines,
        shipping: body.shipping,
        shipTo: body.shipTo,
        membership: membershipForClient(client.id),
        note: body.note,
      };

      // The actor is the SERVER-RESOLVED principal — this is what makes RULE 4
      // (the prescriber gate) real rather than advisory.
      const me = staffMap[actor.id];
      const result = placeOrder(input, {
        id: actor.id,
        name: me?.name ?? actor.id,
        role: actor.role,
      });

      if (!result.ok) {
        // Every blocking problem, not just the first — a caller that learns one
        // problem per attempt is taught to retry rather than to read.
        const blocking = blockingProblems(result.problems);
        throw new RefusedError(`Order refused: ${blocking.map((p) => p.message).join(" ")}`);
      }

      const row = await appendLedgerRow(
        {
          ...result.ledgerDraft,
          // Attribute to the authenticated placer, whatever the draft carried.
          actorId: actor.id,
          actorName: me?.name ?? actor.id,
          actorRole: actor.role,
        },
        new Date().toISOString(),
      );

      return { orderId: result.order.id, ledger: { id: row.id, hash: row.hash } };
    },
  });
}
