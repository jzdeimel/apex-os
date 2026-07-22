/**
 * WHAT WE WERE TOLD, AND WHEN.
 *
 * The read side of the append-only rule. Paul Kennard's example on 2026-07-21
 * is the exact query this answers:
 *
 *   "I tell you in my first appointment that I'm allergic to penicillin. Six
 *    months later you ask me — I see you're allergic to penicillin — I go, no
 *    I'm not. Great, we change that, but we never lose track of the fact that
 *    you told us on this date that you were, and then you told us on another
 *    date that you were not."
 *
 * Storing that history is migration 0009 and the schema's closure columns.
 * SHOWING it is this module, and both are needed: a chart that retains every
 * version but only ever renders the current one has kept the data and lost the
 * point. The question a clinician actually asks is not "is this patient
 * allergic to penicillin" but "what have they said about it, and when, and to
 * whom" — because the answer changes what you do with a borderline reaction.
 *
 * PURE. Takes rows, returns a timeline. No database, no clock.
 */

export type FactKind = "allergy" | "problem" | "medication" | "vitals";

/** The shape every clinical fact shares once you stop caring which table it is in. */
export interface HistoricalFact {
  id: string;
  kind: FactKind;
  /** What was asserted, in one line. "Penicillin — severe" */
  summary: string;
  /** Free detail — reaction, dose, ICD-10. */
  detail?: string;
  /** When the assertion was recorded. ISO. */
  recordedAt: string;
  recordedBy?: string | null;
  /** When it stopped being true, if it has. ISO. */
  endedAt?: string | null;
  /** For facts corrected rather than closed — the row this one replaces. */
  supersedesId?: string | null;
  correctionReason?: string | null;
}

export type EntryStatus =
  /** True as far as anyone has told us. */
  | "current"
  /** Was true, then retracted or resolved. */
  | "ended"
  /** Replaced by a corrected version of the same reading. */
  | "superseded";

export interface TimelineEntry {
  fact: HistoricalFact;
  status: EntryStatus;
  /** Plain language for the UI — no clinician should have to decode a status. */
  statement: string;
  /** The entry this one replaced, when it replaced one. */
  replacesId?: string;
}

/**
 * Build the timeline for one subject, newest first.
 *
 * ── STATUS IS DERIVED, NEVER STORED ────────────────────────────────────────
 * A stored `status` column would be a fourth thing that can disagree with
 * `ended_at` and `supersedes_id`, and the disagreement would be invisible.
 * Deriving it means the timeline cannot drift from the rows it is built from.
 */
export function buildTimeline(facts: readonly HistoricalFact[]): TimelineEntry[] {
  const supersededIds = new Set(
    facts.map((f) => f.supersedesId).filter((id): id is string => !!id),
  );

  return [...facts]
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    .map((fact) => {
      const status: EntryStatus = supersededIds.has(fact.id)
        ? "superseded"
        : fact.endedAt
          ? "ended"
          : "current";

      const who = fact.recordedBy ? ` by ${fact.recordedBy}` : "";
      const on = fact.recordedAt.slice(0, 10);

      let statement: string;
      switch (status) {
        case "current":
          statement = `Recorded ${on}${who}. Still current.`;
          break;
        case "ended":
          statement = `Recorded ${on}${who}. Retracted ${fact.endedAt!.slice(0, 10)}.`;
          break;
        case "superseded":
          statement = `Recorded ${on}${who}. Corrected later${
            fact.correctionReason ? ` — ${fact.correctionReason}` : ""
          }.`;
          break;
      }

      return {
        fact,
        status,
        statement,
        replacesId: fact.supersedesId ?? undefined,
      };
    });
}

/**
 * Facts that were asserted and later withdrawn.
 *
 * The clinically interesting slice, and the one a current-state-only chart
 * cannot produce at all. A patient who reported an allergy and then denied it
 * is not the same patient as one who never reported it — the first is a
 * conversation worth having before a borderline prescription.
 */
export function contradictions(entries: readonly TimelineEntry[]): TimelineEntry[] {
  return entries.filter((e) => e.status === "ended" || e.status === "superseded");
}

/** Everything currently believed to be true. The default chart view. */
export function currentFacts(entries: readonly TimelineEntry[]): TimelineEntry[] {
  return entries.filter((e) => e.status === "current");
}

/**
 * Has this subject ever said anything about `substance`, either way?
 *
 * Substring match on a normalised summary — deliberately loose. The question is
 * "did they mention it", and a screen that answers "no" because the spelling
 * differed is worse than one that returns a near miss for a human to read.
 */
export function everMentioned(
  entries: readonly TimelineEntry[],
  substance: string,
): TimelineEntry[] {
  const needle = substance.trim().toLowerCase();
  if (!needle) return [];
  return entries.filter((e) => e.fact.summary.toLowerCase().includes(needle));
}
