import { absolute } from "@/lib/utils";
import {
  changesSince,
  isAfter,
  ms,
  elapsedPhrase,
  daysBetween,
  NOW,
  type ChangeItem,
  type ChangeImportance,
  type ChangeKind,
} from "@/lib/changes/since";
import { consultsForClient } from "@/lib/mock/consults";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { journalFor } from "@/lib/symptoms/journal";
import { appointmentsForClient } from "@/lib/mock/appointments";
import { getClient } from "@/lib/mock/clients";
import { ringHistory } from "@/lib/daily/today";
import {
  consultSource,
  scanSource,
  journalSource,
  appointmentSource,
  NO_SOURCE,
  type SourceRef,
} from "@/lib/coach/provenance";

/**
 * "What changed since I last saw them."
 *
 * ── How this differs from lib/changes/since.ts, and why both exist ────────
 * That file answers "what changed since you last OPENED this chart", anchored
 * on a `view` row in the ledger. This one answers "what changed since you last
 * SAW this member", anchored on the last consult the coach actually ran.
 *
 * They sound like the same feature and they are not. A coach opens a chart for
 * thirty seconds to check a phone number; that read moves the ledger baseline
 * and would silently wipe out three weeks of accumulated change from a diff the
 * coach is about to walk into a call with. The consult is the right anchor
 * because it is the last point at which the coach and the member had a shared
 * understanding of the picture — which is exactly what a pre-call diff exists
 * to reconstruct.
 *
 * ── Why this composes rather than reimplements ────────────────────────────
 * Labs, consults, orders, messages, escalations and plan/protocol movement are
 * already collected, ranked and deduplicated by `changesSince`. Rewriting those
 * six collectors here to add four more would have produced two engines that
 * drift: a lab counted as "high" in one panel and "normal" in another, on the
 * same screen, is the failure mode. So this module calls `changesSince` for
 * everything it already knows and adds ONLY the sources it does not carry:
 *
 *   body composition   scan history deltas (weight, body fat, lean mass)
 *   journal            entries logged, and any symptom the member rated badly
 *   adherence          missed protocol days inside the window
 *   appointments       booked, completed, cancelled or no-showed
 *
 * Those four are not in since.ts because that file backs a CLINICIAN's chart
 * banner, where they would be noise. They are the substance of a coach's
 * relationship, which is why they lead here.
 */

/**
 * The extra sources this module contributes on top of `ChangeKind`.
 *
 * Kept as a separate union rather than widened into `ChangeKind` itself. That
 * type is consumed by the client-facing chart banner, which exhaustively maps
 * every kind to an icon — widening it would silently make that map incomplete
 * for a set of changes that surface only in the coach console.
 */
export type CoachChangeKind = ChangeKind | "body" | "journal" | "adherence" | "appointment";

export interface VisitChange {
  id: string;
  at: string;
  kind: CoachChangeKind;
  headline: string;
  detail: string;
  importance: ChangeImportance;
  /**
   * Where this line came from. Required — see lib/coach/provenance.ts.
   *
   * Items lifted from `changesSince` carry NO_SOURCE, because that engine
   * predates the SourceRef contract and reports a rendered sentence rather than
   * the record id behind it. Marking them honestly as unsourced was the right
   * call over back-filling a plausible-looking id: the chip would then claim a
   * precision the data does not have, which is the exact failure this whole
   * mechanism exists to prevent.
   */
  source: SourceRef;
}

export interface VisitBaseline {
  /** The consult that anchors the diff, when there is one. */
  consultId?: string;
  at: string;
  /** Plain-language account of what the cut line is and why. */
  note: string;
  /**
   * How the anchor was chosen. The UI says something different for each, and a
   * coach must never mistake "we fell back to their join date" for "this is
   * everything since our last call".
   */
  kind: "consult-with-me" | "consult-with-someone-else" | "joined" | "none";
}

export interface SinceLastVisit {
  clientId: string;
  coachId: string;
  baseline: VisitBaseline;
  items: VisitChange[];
  /** How many need dealing with before the call starts. */
  needsAttention: number;
  /** The banner sentence, ready to render. */
  headline: string;
  /** The one-line form for a roster cell — no room for a sentence there. */
  inline: string;
  elapsed: string;
  days: number;
}

/**
 * How far back the fallback window reaches when there is no consult to anchor on.
 *
 * A member who joined two years ago and has never had a recorded consult would
 * otherwise produce a diff spanning their entire history, which is not a diff —
 * it is their chart. Ninety days is long enough to cover any realistic gap
 * between a coach inheriting a member and first speaking to them.
 */
const FALLBACK_WINDOW_DAYS = 90;

const DAY_MS = 86_400_000;

/**
 * A journal rating at or below this is treated as the member flagging something.
 *
 * On the 1–5 scale in lib/symptoms/journal.ts, 2 is the second-worst rung on
 * every symptom. This is a DISPLAY threshold for "the coach should read this
 * entry", not a clinical one — nothing here decides anything, it decides what
 * gets shown. Deliberately not tuned per-symptom: there is no evidence in this
 * codebase for which symptoms warrant a tighter cut, and inventing one would be
 * exactly the sort of fabricated threshold this project refuses to ship.
 */
const JOURNAL_FLAG_AT = 2;

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------

/**
 * Find the cut line: the last time this coach sat down with this member.
 *
 * The ladder is explicit about degradation rather than quietly papering over
 * it. Falling back is fine; pretending you did not is not.
 */
export function visitBaseline(
  clientId: string,
  coachId: string,
  nowIso: string = NOW,
): VisitBaseline {
  const all = consultsForClient(clientId).filter((c) => ms(c.startedAt) < ms(nowIso));

  const mine = all.find((c) => c.authorId === coachId);
  if (mine) {
    return {
      consultId: mine.id,
      at: mine.startedAt,
      kind: "consult-with-me",
      note: `Your last ${mine.kind.toLowerCase()} with them (${mine.channel.toLowerCase()}).`,
    };
  }

  // Someone else's consult is a real shared-understanding point for the member,
  // just not for this coach. Saying whose it was is the whole value of the line.
  const theirs = all[0];
  if (theirs) {
    return {
      consultId: theirs.id,
      at: theirs.startedAt,
      kind: "consult-with-someone-else",
      note: `You have no consult with this member on record. Showing changes since their last consult with another member of the team.`,
    };
  }

  const client = getClient(clientId);
  const joined = client?.joinedOn;
  const floor = absolute(ms(nowIso) - FALLBACK_WINDOW_DAYS * DAY_MS).toISOString();

  if (joined && ms(joined) > ms(floor)) {
    return {
      at: joined,
      kind: "joined",
      note: "No consult on record with anyone. Showing everything since they joined.",
    };
  }

  return {
    at: floor,
    kind: "none",
    note: `No consult on record with anyone. Showing the last ${FALLBACK_WINDOW_DAYS} days — there is no visit to measure from.`,
  };
}

// ---------------------------------------------------------------------------
// The four sources since.ts does not carry
// ---------------------------------------------------------------------------

/**
 * Body composition movement across the window.
 *
 * Reads the scan's own history array and compares the last point BEFORE the
 * baseline against the newest point after it. Comparing against the first
 * history point instead would report the member's lifetime change on every
 * call, which is a different (and much more flattering) claim than "what moved
 * since we spoke".
 *
 * Nothing here interprets the direction. A body-fat drop is reported as a drop;
 * whether that is good depends on the member's goal, and that judgement belongs
 * to the coach reading it, not to a diff engine.
 */
function bodyChanges(clientId: string, since: string): VisitChange[] {
  const scan = getScanForClient(clientId);
  if (!scan?.history?.length) return [];

  const after = scan.history.filter((h) => isAfter(`${h.date}T12:00:00`, since));
  if (!after.length) return [];

  // The reference point is the newest reading the coach would already have seen.
  const before = scan.history.filter((h) => !isAfter(`${h.date}T12:00:00`, since)).pop();
  if (!before) return [];

  const latest = after[after.length - 1];
  const at = `${latest.date}T12:00:00`;
  const source = scanSource(scan.id, latest.date, scan.device);

  const metrics: { label: string; from: number; to: number; unit: string }[] = [
    { label: "Weight", from: before.weightKg, to: latest.weightKg, unit: "kg" },
    { label: "Body fat", from: before.bodyFatPct, to: latest.bodyFatPct, unit: "%" },
    { label: "Lean mass", from: before.skeletalMuscleKg, to: latest.skeletalMuscleKg, unit: "kg" },
  ];

  // One line per metric that actually moved. A scan where nothing changed is
  // not a change, and reporting "Weight 0.0 kg" trains a coach to skim the card.
  return metrics
    .filter((m) => Math.abs(m.to - m.from) >= 0.1)
    .map((m) => {
      const delta = m.to - m.from;
      const sign = delta > 0 ? "+" : "";
      return {
        id: `vc-body-${scan.id}-${m.label.replace(/\s+/g, "").toLowerCase()}-${latest.date}`,
        at,
        kind: "body" as const,
        headline: `${m.label} ${sign}${delta.toFixed(1)} ${m.unit}`,
        detail: `${m.from.toFixed(1)} → ${m.to.toFixed(1)} ${m.unit}, measured ${after.length === 1 ? "at the scan" : `across ${after.length} scans`} since you spoke.`,
        importance: "normal" as const,
        source,
      };
    });
}

/**
 * Journal activity, and anything the member rated badly.
 *
 * Two lines, not one per entry. A member logging daily produces twenty entries
 * inside a three-week window, and twenty rows would bury the escalation the
 * card exists to surface. So: one summary line for volume, plus one line for
 * the single worst-rated entry carrying the member's own note verbatim.
 */
function journalChanges(clientId: string, since: string): VisitChange[] {
  const entries = journalFor(clientId).filter((e) => isAfter(`${e.date}T12:00:00`, since));
  if (!entries.length) return [];

  const newest = entries[entries.length - 1];
  const out: VisitChange[] = [
    {
      id: `vc-journal-count-${clientId}-${newest.date}`,
      at: `${newest.date}T12:00:00`,
      kind: "journal",
      headline: `${entries.length} journal ${entries.length === 1 ? "entry" : "entries"} logged`,
      detail: `Most recent ${newest.date}. The member is still checking in.`,
      importance: "normal",
      source: journalSource(newest.id, newest.date, newest.note),
    },
  ];

  // Worst single rating in the window, and what day it landed on.
  let worst: { entry: (typeof entries)[number]; key: string; score: number } | undefined;
  for (const entry of entries) {
    for (const [key, score] of Object.entries(entry.scores)) {
      if (score > JOURNAL_FLAG_AT) continue;
      if (!worst || score < worst.score) worst = { entry, key, score };
    }
  }

  if (worst) {
    out.push({
      id: `vc-journal-flag-${worst.entry.id}-${worst.key}`,
      at: `${worst.entry.date}T12:00:00`,
      kind: "journal",
      headline: `Rated ${worst.key} at ${worst.score}/5 on ${worst.entry.date}`,
      // The member's own note is the payload. Where they left none, we say so
      // rather than filling the space with an interpretation of the number.
      detail: worst.entry.note
        ? `They wrote: "${worst.entry.note}"`
        : "No note left with the entry — the rating is all there is.",
      // A self-reported low is the member telling you something before you ask.
      // That is the most valuable thirty seconds of pre-call reading there is.
      importance: "high",
      source: journalSource(worst.entry.id, worst.entry.date, worst.entry.note),
    });
  }

  return out;
}

/**
 * Missed protocol days inside the window.
 *
 * `ringHistory` is the only per-day adherence record in this build. It reports
 * whether all three rings closed, and distinguishes a PROTECTED day (a provider
 * hold, a logged illness, a fasting day) from a genuine miss — a distinction
 * this function preserves rather than flattening, because "you missed six days"
 * is an accusation and "you missed four, two were held" is a conversation.
 *
 * Note the honest limit: a closed ring is not proof a dose was taken, it is
 * proof the member marked the day complete. The detail line says so, because a
 * coach acting on this will be told as much by the member within ten seconds.
 */
function adherenceChanges(clientId: string, since: string): VisitChange[] {
  const client = getClient(clientId);
  if (!client) return [];

  const days = Math.min(90, Math.max(1, daysBetween(since, NOW)));
  if (days < 2) return [];

  const history = ringHistory(client, days).filter((d) => isAfter(`${d.date}T12:00:00`, since));
  const missed = history.filter((d) => !d.closed && !d.protectedDay);
  if (!missed.length) return [];

  const protectedDays = history.filter((d) => d.protectedDay).length;
  const last = missed[missed.length - 1];

  return [
    {
      id: `vc-adherence-${clientId}-${last.date}`,
      at: `${last.date}T12:00:00`,
      kind: "adherence",
      headline: `${missed.length} missed day${missed.length === 1 ? "" : "s"} of ${history.length} since you spoke`,
      detail:
        `Most recent ${last.date}.` +
        (protectedDays
          ? ` A further ${protectedDays} held for a recorded reason — those are not misses.`
          : "") +
        " Counts days the member marked complete, which is not the same as confirming a dose.",
      // A third of the window missed is a different conversation from an odd
      // Sunday. The cut is a display threshold, not a clinical one.
      importance: missed.length >= Math.max(3, history.length / 3) ? "high" : "normal",
      // ringHistory is a derived seeded series rather than a stored record, so
      // there is no row id to cite. Saying that plainly beats inventing one.
      source: NO_SOURCE,
    },
  ];
}

/**
 * Appointments booked, kept or missed inside the window.
 *
 * A no-show is the highest-signal item on this whole card: it is the member
 * withdrawing without saying so, and it is the one thing a coach must not walk
 * into the next call unaware of.
 *
 * There is no cancellation state to report. `Appointment.status` in this build
 * is Scheduled / Checked In / Completed / No Show — a member who rang ahead and
 * a member who simply did not arrive are the same row, which is a real gap in
 * the model rather than something to paper over with a guess.
 */
function appointmentChanges(clientId: string, since: string): VisitChange[] {
  return appointmentsForClient(clientId)
    .filter((a) => isAfter(a.start, since))
    .map((a) => {
      const missed = a.status === "No Show";
      return {
        id: `vc-appt-${a.id}`,
        at: a.start,
        kind: "appointment" as const,
        headline: `${a.type} — ${a.status}`,
        detail: `${a.durationMin} min, ${a.status.toLowerCase()}.`,
        importance: missed ? ("high" as const) : ("normal" as const),
        source: appointmentSource(a.id, a.type, a.start, a.status),
      };
    });
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

const IMPORTANCE_RANK: Record<ChangeImportance, number> = { high: 0, normal: 1 };

/** Lift a `changesSince` item into the coach shape, unsourced and unmodified. */
function adopt(item: ChangeItem): VisitChange {
  return {
    id: item.id,
    at: item.at,
    kind: item.kind,
    headline: item.headline,
    detail: item.detail,
    importance: item.importance,
    source: NO_SOURCE,
  };
}

/**
 * The full diff for one member, from this coach's last visit with them.
 *
 * Ranked importance-first then recency, matching `changesSince` exactly. Two
 * panels on one screen that sort by different rules is how a coach concludes
 * the software is guessing.
 */
export function sinceLastVisit(
  clientId: string,
  coachId: string,
  nowIso: string = NOW,
): SinceLastVisit {
  const baseline = visitBaseline(clientId, coachId, nowIso);
  const since = baseline.at;

  const items: VisitChange[] = [
    ...changesSince(clientId, since).map(adopt),
    ...bodyChanges(clientId, since),
    ...journalChanges(clientId, since),
    ...adherenceChanges(clientId, since),
    ...appointmentChanges(clientId, since),
  ].sort((a, b) => {
    const rank = IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance];
    if (rank !== 0) return rank;
    // Tiebreak on id so the order is byte-identical on every render — the same
    // rule TodayQueue applies, and for the same hydration reason.
    return ms(b.at) - ms(a.at) || a.id.localeCompare(b.id);
  });

  const needsAttention = items.filter((i) => i.importance === "high").length;
  const elapsed = elapsedPhrase(since, nowIso);
  const days = daysBetween(since, nowIso);

  return {
    clientId,
    coachId,
    baseline,
    items,
    needsAttention,
    headline: headlineFor(items.length, needsAttention, elapsed, baseline),
    inline: inlineFor(items, needsAttention, days),
    elapsed,
    days,
  };
}

function headlineFor(
  total: number,
  needsAttention: number,
  elapsed: string,
  baseline: VisitBaseline,
): string {
  const anchor =
    baseline.kind === "consult-with-me"
      ? `since you saw them ${elapsed}`
      : baseline.kind === "consult-with-someone-else"
        ? `since their last consult ${elapsed}`
        : `in the last ${elapsed.replace("ago", "").trim()}`;

  if (total === 0) {
    // Genuinely nothing is a useful answer, and a distinct one from "we have no
    // baseline" — which the baseline note beneath this line handles separately.
    return `Nothing on record ${anchor}.`;
  }
  const head = `${total} thing${total === 1 ? "" : "s"} ${anchor}`;
  return needsAttention
    ? `${head} · ${needsAttention} to deal with before you call.`
    : `${head} · nothing flagged.`;
}

/**
 * The roster cell. One line, no sentence, no punctuation to trim.
 *
 * A table cell has room for roughly twenty characters before it starts
 * fighting the columns either side of it, so this reports the shape of the diff
 * rather than describing it.
 */
function inlineFor(items: VisitChange[], needsAttention: number, days: number): string {
  if (!items.length) return `nothing in ${days}d`;
  if (needsAttention) return `${items.length} · ${needsAttention} flagged`;
  return `${items.length} change${items.length === 1 ? "" : "s"}`;
}

/** Labels for the kinds this module adds. `changesSince` owns the rest. */
export const COACH_CHANGE_KIND_LABEL: Record<CoachChangeKind, string> = {
  lab: "Labs",
  plan: "Plan",
  protocol: "Protocol",
  consult: "Consults",
  order: "Orders",
  message: "Messages",
  escalation: "Escalations",
  body: "Body composition",
  journal: "Journal",
  adherence: "Adherence",
  appointment: "Appointments",
};
