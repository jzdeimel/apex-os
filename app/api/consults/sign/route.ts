import { NextResponse } from "next/server";
import { guard } from "@/lib/auth/guard";
import { appendLedgerRow } from "@/lib/db/repo";
import { getClient, clientName } from "@/lib/mock/clients";
import { staffMap } from "@/lib/mock/staff";

/**
 * Sign a consult — the first real, gated, durable write in Apex.
 *
 * WHAT MAKES THIS DIFFERENT FROM EVERY OTHER "SIGN" IN THE APP
 * -----------------------------------------------------------
 * Elsewhere, "sign" flips a bit of React state and pushes onto an in-memory
 * array that dies on refresh. This one:
 *   1. resolves the caller's identity from the Entra principal (not a client
 *      claim),
 *   2. checks `sign:encounter` server-side — a coach or an unmapped user is
 *      REFUSED here, not merely hidden in the UI,
 *   3. writes a hash-chained row to Postgres through repo.appendLedgerRow, under
 *      an advisory lock, inside a transaction.
 *
 * So the traceability pitch becomes true for a signed consult: the row survives
 * a refresh, a replica swap and a restart, and the chain it joins is verifiable.
 * This is audit items #1, #2 and #5 in one endpoint.
 *
 * Reads still come from the seeded roster (the client's care team + location, to
 * scope the permission); only the WRITE is real. That split is deliberate and
 * honest — the mutation persists, the reference data does not yet.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { consultId?: string; clientId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed body." }, { status: 400 });
  }

  const { consultId, clientId } = body;
  if (!consultId || !clientId) {
    return NextResponse.json({ ok: false, error: "consultId and clientId are required." }, { status: 400 });
  }

  const client = getClient(clientId);
  if (!client) {
    return NextResponse.json({ ok: false, error: "Unknown client." }, { status: 404 });
  }

  // sign:encounter is Medical-only, and gated to this client's care team +
  // location. A coach reaching this endpoint is refused by can(), server-side.
  const g = await guard("sign:encounter", {
    coachId: client.coachId,
    providerId: client.providerId,
    locationId: client.locationId,
  });
  if (!g.ok) return g.res;

  const actorName = staffMap[g.actor.id]?.name ?? g.actor.id;

  try {
    const row = await appendLedgerRow(
      {
        actorId: g.actor.id,
        actorName,
        actorRole: g.actor.role,
        action: "sign",
        entity: "note",
        entityId: consultId,
        subjectId: clientId,
        subjectName: clientName(client),
        locationId: client.locationId,
        reason: "Consult co-signed by provider",
        after: { immutable: true, consultId },
      },
      new Date().toISOString(),
    );

    return NextResponse.json({
      ok: true,
      durable: true,
      ledger: { id: row.id, seq: row.seq, hash: row.hash, prevHash: row.prevHash },
    });
  } catch (err) {
    // requireDb throws when DATABASE_URL is absent — say so honestly rather than
    // pretend a durable write happened.
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Durable write failed." },
      { status: 503 },
    );
  }
}
