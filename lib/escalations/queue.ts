import { absolute } from "@/lib/utils";
import type {
  Escalation,
  EscalationEvent,
  EscalationKind,
  EscalationPriority,
  EscalationStatus,
} from "@/lib/escalations/types";
import { escalations } from "@/lib/mock/escalations";

/**
 * The escalation queue — SLA math and pure state transitions.
 *
 * Nothing in this file touches the ledger. Transitions return a new escalation
 * and the caller appends the ledger row, so the domain logic stays testable and
 * the audit write stays impossible to do accidentally in a render pass.
 */

/**
 * The demo's acting provider. In production this is the signed-in identity.
 * Dr. Marcus Vale is the medical director and covers Raleigh + telehealth, so
 * the "Mine" filter has a meaningful, non-empty slice behind it.
 */
export const ME_PROVIDER = "st-001";

/** Pinned clock. Everything in Apex reads from this, never from a live Date. */
export const NOW = "2026-06-12T09:00:00";

/**
 * How long a provider has to answer, by priority.
 *
 * These are clinical commitments, not preferences:
 *  - Urgent (2h)   — a possible safety event: chest symptoms, breathing
 *                    trouble, an allergic reaction, syncope. Two hours is the
 *                    outside edge of "someone is actively looking at this";
 *                    anything longer and the honest answer is "go to urgent
 *                    care", which the queue should be saying, not hiding.
 *  - Prompt (24h)  — changes what the member does this week: a dose question,
 *                    a side effect they are tolerating, an off-range lab. A day
 *                    is one business cycle — the member does not miss a dose
 *                    waiting on it.
 *  - Routine (72h) — clinically interesting, not time-critical. Three days
 *                    lets a provider batch these without them going stale.
 */
export const SLA_HOURS: Record<EscalationPriority, number> = {
  Urgent: 2,
  Prompt: 24,
  Routine: 72,
};

const HOUR_MS = 60 * 60 * 1000;

/** Statuses where the clock has stopped. */
const TERMINAL: EscalationStatus[] = ["Answered", "Closed"];

export function isResolved(e: Escalation): boolean {
  return TERMINAL.includes(e.status);
}

/** When this escalation is owed an answer. */
export function dueAt(e: Escalation): string {
  if (e.dueAt) return absolute(e.dueAt).toISOString();
  const due = absolute(e.raisedAt).getTime() + SLA_HOURS[e.priority] * HOUR_MS;
  return absolute(due).toISOString();
}

/**
 * Hours left before breach — negative means overdue by that many hours.
 *
 * Answered escalations measure against the moment they were answered, not
 * against now. Otherwise every resolved item keeps sliding into the red and the
 * overdue count stops meaning "work that needs a human".
 */
export function hoursRemaining(e: Escalation, nowIso: string = NOW): number {
  const stopped = isResolved(e) ? (e.answeredAt ?? nowIso) : nowIso;
  return (absolute(dueAt(e)).getTime() - absolute(stopped).getTime()) / HOUR_MS;
}

export function isOverdue(e: Escalation, nowIso: string = NOW): boolean {
  return hoursRemaining(e, nowIso) < 0;
}

export type SlaState = "on-track" | "due-soon" | "overdue";

/**
 * "Due soon" is the last quarter of the window, floored at one hour.
 *
 * The floor exists for Urgent: a flat 25% would only warn with 30 minutes left,
 * by which point warning is useless. An hour is enough time to act.
 */
export function slaState(e: Escalation, nowIso: string = NOW): SlaState {
  const left = hoursRemaining(e, nowIso);
  if (left < 0) return "overdue";
  const warnAt = Math.max(SLA_HOURS[e.priority] * 0.25, 1);
  return left <= warnAt ? "due-soon" : "on-track";
}

// ---------------------------------------------------------------------------
// Transitions — pure. Each returns a NEW escalation; none mutate.
// ---------------------------------------------------------------------------

function withEvent(
  e: Escalation,
  status: EscalationStatus,
  actor: string,
  at: string,
  extra: Partial<Escalation> = {},
): Escalation {
  const event: EscalationEvent = { status, at, actor };
  return { ...e, status, ...extra, statusHistory: [...e.statusHistory, event] };
}

export interface RaiseEscalationInput {
  id: string;
  clientId: string;
  raisedByStaffId: string;
  assignedToStaffId: string;
  kind: EscalationKind;
  question: string;
  sourceQuote: string;
  sourceConsultId?: string;
  raisedAt: string;
  /** Omit to let the text decide — see priorityFromText. */
  priority?: EscalationPriority;
}

/** Create an escalation. Pure — the caller appends the ledger row. */
export function raiseEscalation(input: RaiseEscalationInput): Escalation {
  const priority = input.priority ?? priorityFromText(`${input.question} ${input.sourceQuote}`);
  return {
    id: input.id,
    clientId: input.clientId,
    raisedByStaffId: input.raisedByStaffId,
    assignedToStaffId: input.assignedToStaffId,
    kind: input.kind,
    priority,
    status: "Open",
    question: input.question,
    sourceQuote: input.sourceQuote,
    sourceConsultId: input.sourceConsultId,
    raisedAt: input.raisedAt,
    statusHistory: [{ status: "Open", at: input.raisedAt, actor: input.raisedByStaffId }],
  };
}

export function acknowledge(e: Escalation, staffId: string, at: string = NOW): Escalation {
  return withEvent(e, "Acknowledged", staffId, at, {
    acknowledgedAt: at,
    assignedToStaffId: staffId,
  });
}

export function startReview(e: Escalation, staffId: string, at: string = NOW): Escalation {
  return withEvent(e, "In review", staffId, at, {
    acknowledgedAt: e.acknowledgedAt ?? at,
    assignedToStaffId: staffId,
  });
}

export function answer(
  e: Escalation,
  staffId: string,
  text: string,
  at: string = NOW,
): Escalation {
  return withEvent(e, "Answered", staffId, at, {
    answer: text,
    answeredAt: at,
    answeredByStaffId: staffId,
  });
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function queueFor(providerId: string): Escalation[] {
  return escalations.filter((e) => e.assignedToStaffId === providerId);
}

export function openEscalations(): Escalation[] {
  return escalations.filter((e) => !isResolved(e));
}

export function overdueEscalations(nowIso: string = NOW): Escalation[] {
  return escalations.filter((e) => !isResolved(e) && isOverdue(e, nowIso));
}

export function escalationsForClient(clientId: string): Escalation[] {
  return escalations.filter((e) => e.clientId === clientId);
}

export function escalationsRaisedBy(coachId: string): Escalation[] {
  return escalations.filter((e) => e.raisedByStaffId === coachId);
}

// ---------------------------------------------------------------------------
// Triage
// ---------------------------------------------------------------------------

/**
 * Language that makes something Urgent regardless of what else it says.
 *
 * Matched against the coach's words and the member's quoted words together,
 * because the coach frequently under-frames what the member actually reported
 * ("probably nothing, but he mentioned chest tightness").
 */
const URGENT_PATTERNS: RegExp[] = [
  /chest (pain|tightness|pressure)/i,
  /short(ness)? of breath|can'?t breathe|trouble breathing/i,
  /severe\b/i,
  /allergic reaction|anaphyla|hives all over|swelling of (the )?(face|throat|tongue)/i,
  /faint(ed|ing)?\b|passed out|syncope|blacked out/i,
  /vision (loss|changes)|slurred speech|numbness on one side/i,
  /suicidal|self[- ]harm/i,
];

/** Language that is time-sensitive but not an emergency. */
const PROMPT_PATTERNS: RegExp[] = [
  /dose|dosage|mg\b|titrat/i,
  /side effect|nausea|vomit|rash|dizz|palpitation|headache/i,
  /out of range|elevated|flagged|hematocrit|abnormal/i,
  /stop(ped)? (taking|the)|skipped (a|the) (dose|injection)/i,
  /pregnan|new medication|started (a|an)? ?(new )?(antibiotic|medication)/i,
];

/**
 * Infer priority from the coach's words.
 *
 * Biased hard toward over-triage, deliberately. The two errors are not
 * symmetric: over-triaging costs a provider one wasted minute glancing at
 * something routine, while under-triaging costs a missed emergency. Any system
 * that tunes this classifier for precision is optimizing the wrong number.
 *
 * This is a floor, not a ceiling — a human can always raise the priority, and
 * nothing here silently downgrades a priority a human set.
 */
export function priorityFromText(text: string): EscalationPriority {
  if (URGENT_PATTERNS.some((re) => re.test(text))) return "Urgent";
  if (PROMPT_PATTERNS.some((re) => re.test(text))) return "Prompt";
  return "Routine";
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

const PRIORITY_RANK: Record<EscalationPriority, number> = {
  Urgent: 0,
  Prompt: 1,
  Routine: 2,
};

/**
 * The queue's working order: overdue first (most overdue at the top), then
 * Urgent, then whatever runs out of time soonest. Resolved items sink.
 *
 * Sorting by priority alone is the common mistake — it buries a Routine item
 * that has been rotting for two days under a Prompt item raised ten minutes
 * ago, which is how a queue quietly develops a permanent floor of neglect.
 */
export function sortQueue(list: Escalation[], nowIso: string = NOW): Escalation[] {
  return [...list].sort((a, b) => {
    const aDone = isResolved(a);
    const bDone = isResolved(b);
    if (aDone !== bDone) return aDone ? 1 : -1;

    if (aDone && bDone) {
      return (b.answeredAt ?? b.raisedAt).localeCompare(a.answeredAt ?? a.raisedAt);
    }

    const aLeft = hoursRemaining(a, nowIso);
    const bLeft = hoursRemaining(b, nowIso);
    const aOver = aLeft < 0;
    const bOver = bLeft < 0;
    if (aOver !== bOver) return aOver ? -1 : 1;
    if (aOver && bOver) return aLeft - bLeft; // most overdue first

    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (p !== 0) return p;
    return aLeft - bLeft;
  });
}

/** Answered within the trailing 7 days — the "we are keeping up" number. */
export function answeredThisWeek(list: Escalation[], nowIso: string = NOW): Escalation[] {
  const cutoff = absolute(absolute(nowIso).getTime() - 7 * 24 * HOUR_MS).toISOString();
  return list.filter((e) => e.answeredAt && e.answeredAt >= cutoff);
}

function span(hours: number): string {
  const mins = Math.round(Math.abs(hours) * 60);
  const d = Math.floor(mins / (60 * 24));
  const h = Math.floor((mins % (60 * 24)) / 60);
  const m = mins % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (!d && m) parts.push(`${m}m`);
  return parts.length ? parts.join(" ") : "0m";
}

/** Turnaround: raised → answered. The number the clinic is actually judged on. */
export function turnaroundHours(e: Escalation): number | undefined {
  if (!e.answeredAt) return undefined;
  return (absolute(e.answeredAt).getTime() - absolute(e.raisedAt).getTime()) / HOUR_MS;
}

/**
 * The clock face on the card: "1h 45m left", "19h overdue", "answered in 5h".
 *
 * Resolved items report turnaround rather than remaining time, because once the
 * question is answered the only interesting number is how long the member
 * waited — not how much slack was left on a clock that has stopped.
 */
export function formatSla(e: Escalation, nowIso: string = NOW): string {
  if (isResolved(e)) {
    const t = turnaroundHours(e);
    return t === undefined ? "answered" : `answered in ${span(t)}`;
  }
  const left = hoursRemaining(e, nowIso);
  return left < 0 ? `${span(left)} overdue` : `${span(left)} left`;
}
