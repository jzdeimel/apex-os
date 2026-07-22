import { NextResponse } from "next/server";

import { guard } from "@/lib/auth/guard";
import { raiseEscalationWithLedger } from "@/lib/db/repo";
import { nowIso } from "@/lib/clock";
import { SLA_HOURS } from "@/lib/escalations/queue";
import type { EscalationKind, EscalationPriority } from "@/lib/escalations/types";

export const dynamic = "force-dynamic";

/**
 * PUSH TO MEDICAL — the coach's escalation route.
 *
 * This endpoint is the other half of switching off the member's direct-to-
 * provider thread (lib/features/catalog.ts, `member-provider-thread`). Removing
 * a channel without replacing the path it served would be a downgrade; the
 * decision on the 2026-07-21 sync was explicitly a REROUTE:
 *
 *   Paul Kennard: "the coach needs to be able to tag the doctor on a message,
 *   or go 'hey, this person wants to try this prescription, that needs to get
 *   put in their queue of things to sign off on'."
 *   Zack Deimel, demonstrating: "I could just pop up a menu right here —
 *   push to medical."
 *
 * WHAT MAKES THIS DIFFERENT FROM A MESSAGE
 * ----------------------------------------
 * An escalation has an SLA and a queue. A message has neither. The audited
 * system's worst path was a coach raising an urgent clinical concern, getting a
 * toast, and the provider never seeing it — `raiseEscalation()`'s return value
 * was discarded and the clinician queue re-seeded from a static array. So this
 * route writes a durable escalation row, computes a real due time from the
 * priority, and witnesses both in the ledger.
 *
 * AUTHORITY
 * ---------
 * `escalate:provider` — held by Coach, not by Medical. A provider does not
 * escalate to themselves, and a coach escalating is the entire point of the
 * capability. Scoped to the member so a coach cannot escalate on someone
 * outside their book.
 */

const KINDS = new Set<EscalationKind>([
  "Clinical question",
  "Dose change request",
  "Side effect",
  "Lab concern",
  "Out of scope",
  "Urgent symptom",
]);

const PRIORITIES = new Set<EscalationPriority>(["Urgent", "Prompt", "Routine"]);

export async function POST(req: Request) {
  let body: {
    clientId?: string;
    coachId?: string;
    kind?: string;
    priority?: string;
    question?: string;
    memberQuote?: string;
    messageId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON." }, { status: 400 });
  }

  if (!body.clientId) {
    return NextResponse.json({ ok: false, error: "clientId is required." }, { status: 400 });
  }

  // Guarded on the member, so scope is checked rather than assumed.
  const g = await guard("escalate:provider", { coachId: body.coachId });
  if (!g.ok) return g.res;

  const kind = (body.kind ?? "Clinical question") as EscalationKind;
  const priority = (body.priority ?? "Prompt") as EscalationPriority;

  if (!KINDS.has(kind)) {
    return NextResponse.json({ ok: false, error: "Unknown escalation kind." }, { status: 400 });
  }
  if (!PRIORITIES.has(priority)) {
    return NextResponse.json({ ok: false, error: "Unknown priority." }, { status: 400 });
  }

  const question = (body.question ?? "").trim();
  if (!question) {
    // The coach's own words are the payload. An escalation whose body is a
    // template ("please review") wastes the provider's four hours a month.
    return NextResponse.json(
      { ok: false, error: "Say what you need from medical, in your own words." },
      { status: 400 },
    );
  }

  const at = nowIso();
  const id = `esc-${g.actor.id}-${body.clientId}-${Date.parse(at)}`;
  // The SLA is a clinical commitment, not a preference — see lib/escalations/queue.ts.
  const dueAt = new Date(Date.parse(at) + SLA_HOURS[priority] * 3600_000).toISOString();

  try {
    const { ledger } = await raiseEscalationWithLedger({
      id,
      clientId: body.clientId,
      raisedByStaffId: g.actor.id,
      raisedByName: g.principal.name,
      raisedByRole: g.actor.role,
      raisedAt: at,
      kind,
      priority,
      question,
      memberQuote: body.memberQuote,
      dueAt,
      messageId: body.messageId,
    });

    return NextResponse.json({
      ok: true,
      escalationId: id,
      dueAt,
      ledger: { id: ledger.id, hash: ledger.hash },
      /**
       * Returned so the coach can tell the member something true and specific.
       * "I asked the medical team, you'll hear back by Thursday 2pm" is the
       * whole reason this is an escalation and not a message.
       */
      memberUpdate: `Your coach asked the medical team about this. They'll come back by ${new Date(dueAt).toISOString()}.`,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Escalation failed." },
      { status: 500 },
    );
  }
}
