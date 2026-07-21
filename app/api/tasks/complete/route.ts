import { NextResponse } from "next/server";
import { guard } from "@/lib/auth/guard";
import { appendLedgerRow } from "@/lib/db/repo";
import { getClient, clientName } from "@/lib/mock/clients";
import { staffMap } from "@/lib/mock/staff";

/**
 * Complete a task — a gated, durable write (audit #1/#2/#5), same shape as
 * consult sign. Gated on write:task; scoped to the client's care team + location
 * when the task concerns a member. The completion is recorded as a durable,
 * hash-chained ledger row.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { taskId?: string; clientId?: string; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed body." }, { status: 400 });
  }
  if (!body.taskId) {
    return NextResponse.json({ ok: false, error: "taskId is required." }, { status: 400 });
  }

  const client = body.clientId ? getClient(body.clientId) : undefined;
  const g = await guard(
    "write:task",
    client ? { coachId: client.coachId, providerId: client.providerId, locationId: client.locationId } : undefined,
  );
  if (!g.ok) return g.res;

  try {
    const row = await appendLedgerRow(
      {
        actorId: g.actor.id,
        actorName: staffMap[g.actor.id]?.name ?? g.actor.id,
        actorRole: g.actor.role,
        action: "update",
        entity: "note",
        entityId: body.taskId,
        subjectId: client?.id,
        subjectName: client ? clientName(client) : undefined,
        locationId: client?.locationId,
        reason: `Task completed${body.label ? `: ${body.label}` : ""}`,
        after: { taskId: body.taskId, status: "complete" },
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
