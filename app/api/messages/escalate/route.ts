import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { raiseEscalationWithLedger, readClientCareScope } from "@/lib/db/repo";
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
const MAX_QUESTION_LENGTH = 10_000;
const MAX_MEMBER_QUOTE_LENGTH = 20_000;
const MAX_SOURCE_ID_LENGTH = 256;

export async function POST(req: Request) {
  let body: {
    clientId?: string;
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

  if (typeof body.clientId !== "string" || !body.clientId) {
    return NextResponse.json({ ok: false, error: "clientId is required." }, { status: 400 });
  }
  if (body.question !== undefined && typeof body.question !== "string") {
    return fail(400, "question must be text.");
  }

  let client;
  try {
    client = await readClientCareScope(body.clientId);
  } catch (error) {
    return unavailable("escalation.scope", error, "The patient assignment could not be verified.");
  }
  if (!client || client.status !== "active") return fail(404, "Unknown active patient.");

  // Scope comes from the server-owned chart, never a coachId supplied by the
  // caller. Otherwise a coach could pair their own id with somebody else's
  // clientId and create clinical work outside their book.
  const g = await guard("escalate:provider", {
    coachId: client.assignedCoachId ?? undefined,
    providerId: client.assignedProviderId ?? undefined,
    locationId: client.locationId ?? undefined,
  });
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
  if (question.length > MAX_QUESTION_LENGTH) {
    return fail(400, `The Medical question cannot exceed ${MAX_QUESTION_LENGTH.toLocaleString()} characters.`);
  }
  if (body.memberQuote !== undefined && typeof body.memberQuote !== "string") {
    return fail(400, "memberQuote must be text.");
  }
  if ((body.memberQuote?.length ?? 0) > MAX_MEMBER_QUOTE_LENGTH) {
    return fail(400, `The quoted member message cannot exceed ${MAX_MEMBER_QUOTE_LENGTH.toLocaleString()} characters.`);
  }
  if (body.messageId !== undefined && typeof body.messageId !== "string") {
    return fail(400, "messageId must be text.");
  }
  if ((body.messageId?.length ?? 0) > MAX_SOURCE_ID_LENGTH) {
    return fail(400, "messageId is too long.");
  }

  const at = nowIso();
  const id = `esc-${randomUUID()}`;
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
    return unavailable(
      "escalation.raise",
      err,
      "The Medical handoff could not be saved. Nothing was sent; please try again.",
    );
  }
}
