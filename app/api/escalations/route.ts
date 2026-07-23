import { NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { nowIso } from "@/lib/clock";
import { readEscalations, transitionEscalationWithLedger } from "@/lib/db/repo";
import type { Escalation, EscalationEvent, EscalationStatus } from "@/lib/escalations/types";
import { getClient } from "@/lib/mock/clients";

export const dynamic = "force-dynamic";

const STATUSES = new Set<EscalationStatus>([
  "Open",
  "Acknowledged",
  "In review",
  "Answered",
  "Closed",
]);

type EscalationRow = Awaited<ReturnType<typeof readEscalations>>[number];

function toEscalation(row: EscalationRow): Escalation {
  const client = getClient(row.clientId);
  const status = STATUSES.has(row.status as EscalationStatus)
    ? (row.status as EscalationStatus)
    : "Open";
  const history: EscalationEvent[] = [
    { status: "Open", at: row.raisedAt.toISOString(), actor: row.raisedByStaffId },
  ];
  if (row.acknowledgedAt) {
    history.push({
      status: status === "In review" ? "In review" : "Acknowledged",
      at: row.acknowledgedAt.toISOString(),
      actor: row.acknowledgedBy ?? client?.providerId ?? "medical",
    });
  }
  if (row.answeredAt) {
    history.push({
      status: "Answered",
      at: row.answeredAt.toISOString(),
      actor: row.answeredBy ?? client?.providerId ?? "medical",
    });
  }

  return {
    id: row.id,
    clientId: row.clientId,
    raisedByStaffId: row.raisedByStaffId,
    assignedToStaffId: client?.providerId ?? "unassigned",
    kind: row.kind as Escalation["kind"],
    priority: row.priority as Escalation["priority"],
    status,
    question: row.question,
    sourceQuote: row.memberQuote ?? row.question,
    raisedAt: row.raisedAt.toISOString(),
    dueAt: row.dueAt?.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString(),
    answeredAt: row.answeredAt?.toISOString(),
    answer: row.answer ?? undefined,
    answeredByStaffId: row.answeredBy ?? undefined,
    statusHistory: history,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId") ?? undefined;
  const raisedBy = url.searchParams.get("raisedBy") ?? undefined;

  let filter: { clientId?: string; raisedByStaffId?: string } = {};
  if (clientId) {
    const client = getClient(clientId);
    if (!client) return NextResponse.json({ ok: false, error: "Unknown client." }, { status: 404 });
    const g = await guard("read:chart", {
      coachId: client.coachId,
      providerId: client.providerId,
      locationId: client.locationId,
    });
    if (!g.ok) return g.res;
    filter = { clientId };
  } else if (raisedBy) {
    const g = await guard("escalate:provider", { coachId: raisedBy });
    if (!g.ok) return g.res;
    // Never trust the query parameter as the filter after authorization. The
    // authenticated coach's id is the only id they may use here.
    filter = { raisedByStaffId: g.actor.id };
  } else {
    const g = await guard("triage:escalation");
    if (!g.ok) return g.res;
  }

  try {
    const rows = await readEscalations(filter);
    return NextResponse.json({ ok: true, now: nowIso(), escalations: rows.map(toEscalation) });
  } catch (error) {
    return unavailable("escalation.list", error, "The Medical queue is temporarily unavailable.");
  }
}

export async function PATCH(req: Request) {
  let body: { id?: string; action?: string; answer?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON." }, { status: 400 });
  }
  if (typeof body.id !== "string" || typeof body.action !== "string" || !body.id || !body.action) {
    return fail(400, "id and action are required.");
  }
  if (body.answer !== undefined && typeof body.answer !== "string") {
    return fail(400, "answer must be text.");
  }
  if ((body.answer?.length ?? 0) > 50_000) {
    return fail(400, "The Medical answer cannot exceed 50,000 characters.");
  }

  const g = await guard("triage:escalation");
  if (!g.ok) return g.res;
  const nextStatus =
    body.action === "acknowledge"
      ? "Acknowledged"
      : body.action === "start-review"
        ? "In review"
        : body.action === "answer"
          ? "Answered"
          : null;
  if (!nextStatus) {
    return NextResponse.json({ ok: false, error: "Unknown escalation action." }, { status: 400 });
  }
  if (nextStatus === "Answered" && !body.answer?.trim()) {
    return NextResponse.json({ ok: false, error: "An answer is required." }, { status: 400 });
  }

  try {
    const result = await transitionEscalationWithLedger({
      id: body.id,
      nextStatus,
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      answer: body.answer,
      at: nowIso(),
    });
    if (!result) {
      return NextResponse.json(
        { ok: false, error: "The escalation changed or is already complete. Refresh the queue." },
        { status: 409 },
      );
    }
    return NextResponse.json({
      ok: true,
      escalation: toEscalation(result.escalation),
      ledger: { id: result.ledger.id, hash: result.ledger.hash },
    });
  } catch (error) {
    return unavailable("escalation.transition", error, "The Medical queue update could not be saved.");
  }
}
