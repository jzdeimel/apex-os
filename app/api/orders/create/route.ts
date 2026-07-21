import { NextResponse } from "next/server";
import { guard } from "@/lib/auth/guard";
import { currentPrincipal } from "@/lib/auth/principal";
import { appendLedgerRow } from "@/lib/db/repo";
import { getClient, clientName } from "@/lib/mock/clients";
import { staffMap } from "@/lib/mock/staff";

/**
 * Create an order — a gated, durable write (audit #1/#2/#5). Gated on
 * write:order; scoped to the client's care team + location. Recorded as a
 * durable, hash-chained ledger row. (Full order + inventory-movement rows follow
 * the same pattern via repo.recordDispense once the ordering UI is wired; the
 * ledger row is the witnessed record that the order was placed.)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // AUTH FIRST. An unauthenticated caller learns nothing about this endpoint —
  // not its field names, not whether an id exists. The guard() below re-resolves
  // the principal for the capability decision; this precheck just fixes the
  // order so 401 always outranks 400.
  if (!(await currentPrincipal())) {
    return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
  }

  let body: { clientId?: string; sku?: string; quantity?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed body." }, { status: 400 });
  }
  if (!body.clientId || !body.sku) {
    return NextResponse.json({ ok: false, error: "clientId and sku are required." }, { status: 400 });
  }

  const client = getClient(body.clientId);
  if (!client) {
    return NextResponse.json({ ok: false, error: "Unknown client." }, { status: 404 });
  }

  const g = await guard("write:order", {
    coachId: client.coachId,
    providerId: client.providerId,
    locationId: client.locationId,
  });
  if (!g.ok) return g.res;

  try {
    const row = await appendLedgerRow(
      {
        actorId: g.actor.id,
        actorName: staffMap[g.actor.id]?.name ?? g.actor.id,
        actorRole: g.actor.role,
        action: "create",
        entity: "order",
        entityId: `ord-${body.sku}-${body.clientId}`,
        subjectId: client.id,
        subjectName: clientName(client),
        locationId: client.locationId,
        reason: `Order placed: ${body.quantity ?? 1} × ${body.sku}`,
        after: { sku: body.sku, quantity: body.quantity ?? 1 },
      },
      new Date().toISOString(),
    );
    return NextResponse.json({ ok: true, durable: true, ledger: { id: row.id, seq: row.seq, hash: row.hash } });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Durable write failed." },
      { status: 503 },
    );
  }
}
