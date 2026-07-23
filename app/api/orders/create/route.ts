import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/authz/capabilities";
import { catalog } from "@/lib/catalog/catalog";
import { nowIso } from "@/lib/clock";
import { readInventory } from "@/lib/db/inventoryRepo";
import { createOrderWithLedger, readOrderPatient } from "@/lib/db/orderRepo";
import { orderRequestId } from "@/lib/orders/authoritative";
import { blockingProblems, placeOrder, type ShippingAddress } from "@/lib/orders/place";
import type { LocationId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

function shippingAddress(value: unknown): ShippingAddress | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.line1 !== "string" || typeof row.city !== "string" || typeof row.state !== "string" || typeof row.postal !== "string") return null;
  return {
    line1: row.line1.trim(), line2: typeof row.line2 === "string" ? row.line2.trim() : undefined,
    city: row.city.trim(), state: row.state.trim().toUpperCase(), postal: row.postal.trim(),
  };
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This order came from an untrusted origin.");
  const g = await guard("write:order");
  if (!g.ok) return g.res;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.requestId !== "string" || body.requestId.length < 8 || body.requestId.length > 200 ||
      typeof body.clientId !== "string" || !Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 50 ||
      typeof body.shipping !== "string" || !["ship", "pickup"].includes(body.shipping)) {
    return fail(400, "Stable request id, patient, one to fifty lines, and shipping mode are required.");
  }
  const lines: Array<{ sku: string; qty: number }> = [];
  for (const value of body.lines) {
    if (!value || typeof value !== "object") return fail(400, "Every order line requires a SKU and positive whole quantity.");
    const line = value as Record<string, unknown>;
    if (typeof line.sku !== "string" || !line.sku.trim() || line.sku.length > 100 || !Number.isSafeInteger(line.qty) || (line.qty as number) <= 0 || (line.qty as number) > 10_000) {
      return fail(400, "Every order line requires a SKU and positive whole quantity.");
    }
    lines.push({ sku: line.sku.trim(), qty: line.qty as number });
  }
  const prescriberOnly = lines
    .map((line) => catalog.find((item) => item.sku === line.sku))
    .filter((item) => item?.requiresProviderApproval);
  if (prescriberOnly.length && g.actor.role !== "Medical") {
    return fail(422, `Order refused: ${prescriberOnly.map((item) => item!.name).join(", ")} requires a prescriber.`);
  }
  if (body.discountCents !== undefined && (!Number.isSafeInteger(body.discountCents) || (body.discountCents as number) < 0 || (body.discountCents as number) > 100_000_000)) {
    return fail(400, "discountCents must be a non-negative whole-cent amount.");
  }
  if ((body.discountCents as number | undefined) && (typeof body.discountReason !== "string" || body.discountReason.trim().length < 3 || body.discountReason.length > 1_000)) {
    return fail(400, "Every discount requires a reason.");
  }
  const address = body.shipping === "ship" ? shippingAddress(body.shipTo) : null;
  if (body.shipping === "ship" && !address) return fail(400, "A complete shipping address is required.");

  try {
    const person = await readOrderPatient(body.clientId);
    if (!person || person.status !== "active" || person.isProspect) return fail(404, "Unknown active patient.");
    if (!person.homeLocationId || !person.assignedCoachId) return fail(409, "The patient needs an authoritative home clinic and assigned coach before an order can be placed.");
    const decision = can(g.actor, "write:order", {
      coachId: person.assignedCoachId,
      providerId: person.assignedProviderId ?? undefined,
      locationId: person.homeLocationId,
    });
    if (!decision.allowed) return fail(403, decision.reason);

    const inventory = await readInventory([person.homeLocationId]);
    const quantityOnHand: Record<string, number> = Object.fromEntries(
      catalog.filter((item) => item.lifecycle === "sell-through").map((item) => [item.sku, 0]),
    );
    for (const lot of inventory.lots) {
      if (lot.status === "active") quantityOnHand[lot.sku] = (quantityOnHand[lot.sku] ?? 0) + lot.onHand;
    }
    const at = nowIso();
    const id = orderRequestId(person.id, body.requestId);
    const patientName = `${person.preferredName || person.firstName} ${person.lastName}`.trim();
    const pickupAddress: ShippingAddress = {
      line1: "Clinic pickup", city: person.city || "Clinic", state: (person.state || "").toUpperCase(), postal: person.zip || "00000",
    };
    const result = placeOrder({
      clientId: person.id, clientName: patientName, coachId: person.assignedCoachId,
      locationId: person.homeLocationId as LocationId, lines,
      shipping: body.shipping as "ship" | "pickup", shipTo: address ?? pickupAddress,
      discountCents: typeof body.discountCents === "number" ? body.discountCents : 0,
      discountReason: typeof body.discountReason === "string" ? body.discountReason.trim() : undefined,
      quantityOnHand, note: typeof body.note === "string" ? body.note.trim().slice(0, 2_000) : undefined,
      at, orderId: id, origin: "coach",
    }, { id: g.actor.id, name: g.principal.name, role: g.actor.role });
    if (!result.ok) {
      const blocking = blockingProblems(result.problems);
      return fail(422, `Order refused: ${blocking.map((problem) => problem.message).join(" ")}`);
    }
    const committed = await createOrderWithLedger({
      order: result.order, pricing: result.pricing, shipping: body.shipping as "ship" | "pickup",
      shipTo: address ?? undefined, discountReason: typeof body.discountReason === "string" ? body.discountReason : undefined,
      origin: "coach", actorId: g.actor.id, actorName: g.principal.name, actorRole: g.actor.role,
      patientName, at, ledgerDraft: result.ledgerDraft,
    });
    if (committed.status !== "ok") return fail(committed.status === "missing" ? 404 : 409, committed.reason ?? "This request conflicts with an existing order.");
    return NextResponse.json({
      ok: true, durable: true, duplicate: committed.duplicate,
      order: result.order, record: committed.order, pricing: result.pricing,
      ledger: committed.ledger ? { id: committed.ledger.id, hash: committed.ledger.hash } : { id: committed.order?.ledgerId },
      fulfillment: result.order.fulfillmentPartner === "MedSource" ? "queued-for-partner" : "in-clinic",
      warnings: result.warnings,
    });
  } catch (error) {
    return unavailable("orders.create", error, "The order was not committed. Nothing was sent to fulfillment; please retry.");
  }
}
