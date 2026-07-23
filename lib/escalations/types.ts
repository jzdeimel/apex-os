/**
 * Escalations — a coach handing a clinical question to a provider.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 * Today this handoff is a sentence said across a hallway or a text message.
 * That is not a workflow, it is a hope. Three things go wrong, every time:
 *
 *  1. NOTHING ROUTES IT. "I'll ask the doctor" resolves to whichever provider
 *     happens to be reachable, not the one who owns this member's care.
 *  2. NOTHING TIMES IT. A question about chest tightness and a question about
 *     a protein target decay at the same rate — which is to say, silently.
 *  3. NOBODY CAN SEE ITS STATE. The coach cannot tell whether it was handled,
 *     so they either re-ask (annoying the provider) or assume it was handled
 *     (which is how a member gets no answer at all).
 *
 * So an escalation record here carries three things a text message cannot:
 *
 *  - AN OWNER. `assignedToStaffId` is a specific licensed provider who covers
 *    this member's location. Unassigned work is nobody's work.
 *  - AN SLA CLOCK. `raisedAt` + priority produces a due time. The clock is the
 *    product. Without it "Open" is an indefinite state that ages invisibly,
 *    and the queue becomes a place things go to be forgotten politely.
 *  - TWO-SIDED VISIBILITY. `status` and `statusHistory` are readable by the
 *    coach who raised it, not just the provider working it. An escalation whose
 *    state only one side can see is the same as no escalation — the coach still
 *    has to interrupt someone to find out what happened, which is exactly the
 *    behavior this is meant to replace.
 *
 * ── Traceability ──────────────────────────────────────────────────────────
 * `sourceQuote` holds the exact consult text the escalation came from. The
 * consult summarizer already extracts these (ConsultSummary.escalations, each
 * an ExtractedItem with its own sourceQuote and offset) — this is the queue
 * those extractions land in. The provider reads the member's actual words, not
 * a paraphrase of a paraphrase, because the paraphrase is where the clinically
 * load-bearing detail goes missing.
 */

export type EscalationKind =
  | "Clinical question"
  | "Dose change request"
  | "Side effect"
  | "Lab concern"
  | "Adverse event"
  | "Out of scope"
  | "Urgent symptom";

export type EscalationStatus =
  /** Raised. No provider has laid eyes on it. The SLA clock is running. */
  | "Open"
  /** A provider has seen it and taken ownership. Still owes an answer. */
  | "Acknowledged"
  /** Provider is actively working it — chart open, labs pulled. */
  | "In review"
  /** Answered. The clock stops here; the answer is on the record. */
  | "Answered"
  /** Answer delivered to the member and the loop closed by the coach. */
  | "Closed";

/**
 * Priority drives the SLA window, nothing else.
 *
 * Three levels, not five — a scale with more rungs than the team can
 * meaningfully distinguish collapses into "everything is priority 3".
 */
export type EscalationPriority =
  /** Same-day-ish clinical curiosity. 72h. */
  | "Routine"
  /** Affects what the member does this week. 24h. */
  | "Prompt"
  /** Possible safety event. 2h, and it should interrupt someone. */
  | "Urgent";

/** One transition, recorded. The audit trail lives in the ledger; this is the
 *  human-readable timeline the coach and provider both read on the card. */
export interface EscalationEvent {
  status: EscalationStatus;
  at: string;
  /** Staff id who caused the transition. */
  actor: string;
}

export interface Escalation {
  id: string;
  clientId: string;
  /** The coach who raised it. They get to watch it, not just fire it off. */
  raisedByStaffId: string;
  /** A Medical staff member covering this member's location. */
  assignedToStaffId: string;
  kind: EscalationKind;
  priority: EscalationPriority;
  status: EscalationStatus;
  /** The coach's own words. Never rewritten by the system. */
  question: string;
  /** The exact consult text this came from — traceability to the source. */
  sourceQuote: string;
  /** The consult the sourceQuote lives in, when it came from one. */
  sourceConsultId?: string;
  raisedAt: string;
  /** Explicit shorter operational deadline, when safety policy requires it. */
  dueAt?: string;
  acknowledgedAt?: string;
  answeredAt?: string;
  answer?: string;
  answeredByStaffId?: string;
  statusHistory: EscalationEvent[];
}
