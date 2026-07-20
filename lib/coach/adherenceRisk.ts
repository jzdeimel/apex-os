import type { Client } from "@/lib/types";
import { clients, clientName } from "@/lib/mock/clients";
import { absolute, clamp } from "@/lib/utils";
import { ms, NOW } from "@/lib/changes/since";
import { lastTouchFor, lastInboundFor, contactLogForClient } from "@/lib/mock/contactLog";
import { journalFor } from "@/lib/symptoms/journal";
import { ringHistory } from "@/lib/daily/today";
import { runwayFor } from "@/lib/protocol/runway";
import { subscriptionsForClient } from "@/lib/mock/subscriptions";
import { appointmentsForClient } from "@/lib/mock/appointments";
import {
  contactSource,
  journalSource,
  subscriptionSource,
  appointmentSource,
  NO_SOURCE,
  type SourceRef,
} from "@/lib/coach/provenance";

/**
 * The adherence-risk worklist.
 *
 * ── What this is NOT ──────────────────────────────────────────────────────
 * It is not an engagement score. The audited system had one of those: a number
 * between 0 and 100, recomputed nightly, displayed next to every member, and
 * universally ignored — because a coach shown "Marcus: 34" has been told
 * precisely nothing they can act on. They cannot tell whether Marcus is at 34
 * because he stopped logging, because his vial ran out, or because the number
 * itself is broken. So they learn to distrust it, and the one week it is right
 * they scroll straight past it.
 *
 * ── The inversion this file makes ─────────────────────────────────────────
 * THE REASONS ARE THE PRODUCT. THE SCORE IS ONLY A SORT KEY.
 *
 * Every row carries the full list of signals that fired, each with its own
 * contribution, its own definition, and the record it was read from. A coach
 * can look at any row and see "23 days since they replied to anything" and
 * "ran out of supply 4 days ago" — and now they know what the call is about
 * before they dial. The integer at the top exists to put that row above the
 * others and for no other purpose; nothing in the UI should treat it as a
 * measurement of the member.
 *
 * The corollary: `checked` records the signals that were examined and came back
 * CLEAN. Without it a short reason list is ambiguous — a coach cannot tell
 * whether the member is fine or the engine did not look. Showing the negative
 * results is what makes the positive ones credible.
 *
 * ── On weights ────────────────────────────────────────────────────────────
 * The point values below are a PRIORITISATION POLICY, not a clinical finding,
 * and they are written as plain constants so they can be argued with in a
 * review rather than reverse-engineered from behaviour. They encode one belief:
 * a member who has physically run out of product outranks a member who is
 * merely quiet, because the first is a protocol already broken and the second
 * is a relationship that might be. Nothing here diagnoses anyone.
 */

const DAY_MS = 86_400_000;

export type RiskSignal =
  | "supply"
  | "refill-blocked"
  | "silence"
  | "missed-doses"
  | "journal-silence"
  | "followup";

/**
 * Maximum contribution per signal.
 *
 * Capped individually so no single axis can carry a row to the top on its own.
 * An uncapped "days since contact" term put every dormant member above every
 * actively-failing one — technically the highest number, and exactly the wrong
 * list to work through on a Monday morning.
 */
const MAX_POINTS: Record<RiskSignal, number> = {
  supply: 30,
  "refill-blocked": 20,
  silence: 25,
  "missed-doses": 25,
  "journal-silence": 12,
  followup: 18,
};

export const SIGNAL_LABEL: Record<RiskSignal, string> = {
  supply: "Supply runway",
  "refill-blocked": "Refill blocked",
  silence: "No contact",
  "missed-doses": "Missed protocol days",
  "journal-silence": "Journal silence",
  followup: "Follow-up overdue",
};

export interface RiskReason {
  signal: RiskSignal;
  /** The finding, in the fewest words that stay true. */
  label: string;
  /** How this was computed, so a coach can disagree with it precisely. */
  detail: string;
  points: number;
  source: SourceRef;
}

export interface RiskRow {
  client: Client;
  name: string;
  /** Sort key ONLY. See the file header — never render this as a verdict. */
  score: number;
  band: "high" | "medium" | "low";
  /** Descending by contribution. The first one is what the call is about. */
  reasons: RiskReason[];
  /** Signals examined that came back clean. Renders as reassurance, not noise. */
  checked: string[];
  /** The headline reason, or an explicit all-clear. */
  topReason: string;
}

/** Above this a row is worth interrupting the day for. */
const HIGH_AT = 45;
/** Below this the row is on the list for completeness, not for action. */
const MEDIUM_AT = 20;

/**
 * A member is "quiet" past this many days without any recorded contact.
 *
 * Matches STALE_TOUCH_DAYS in components/coach/TodayQueue.tsx deliberately. Two
 * surfaces in one console disagreeing about what "gone quiet" means is how a
 * coach ends up with a member flagged stale in one panel and healthy in the
 * next — and concludes that neither is worth reading.
 */
const QUIET_DAYS = 21;

/** Window for the missed-dose count. Long enough to see a pattern, short enough to be current. */
const ADHERENCE_WINDOW_DAYS = 14;

/** Journal entries in the last 30 days below this reads as disengagement. */
const JOURNAL_SPARSE_AT = 4;

function daysAgo(iso: string, nowIso: string): number {
  return Math.floor((ms(nowIso) - ms(iso)) / DAY_MS);
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

/**
 * Compute every signal for one member.
 *
 * Each block either pushes a reason or pushes a `checked` string. There is no
 * third path: a signal that is silently skipped is a signal the coach cannot
 * know was considered.
 */
export function adherenceRisk(client: Client, nowIso: string = NOW): RiskRow {
  const reasons: RiskReason[] = [];
  const checked: string[] = [];

  // ── Supply runway ───────────────────────────────────────────────────────
  // Reuses lib/protocol/runway.ts rather than recomputing days-of-supply. That
  // module's header explains why a second implementation of refill timing is a
  // defect and not a convenience; this is the same rule applied one layer up.
  const runway = runwayFor(client.id, nowIso);
  const tightest = runway.lines[0];
  if (tightest && (tightest.status === "out" || tightest.status === "at risk")) {
    const out = tightest.status === "out";
    reasons.push({
      signal: "supply",
      label: out
        ? `Out of ${tightest.itemName} for ${Math.abs(tightest.daysLeft)}d`
        : `${tightest.daysLeft}d of ${tightest.itemName} left`,
      detail: out
        ? "Days of supply went negative. The protocol is already interrupted, whatever else is true."
        : `At or under the ${tightest.daysLeft === 0 ? "last day" : "shipping transit window"} — a refill sent today may not arrive in time.`,
      points: out ? MAX_POINTS.supply : Math.round(MAX_POINTS.supply * 0.55),
      source: subscriptionSource(tightest.subscriptionId, tightest.itemName, tightest.nextRefillOn),
    });
  } else if (tightest) {
    checked.push(`Supply comfortable — ${tightest.daysLeft}d of ${tightest.itemName} left`);
  } else {
    checked.push("No active auto-refill, so there is no runway to run out");
  }

  // ── Refill blocked ──────────────────────────────────────────────────────
  // Distinct from runway on purpose. A hold is the CLINIC's failure, not the
  // member's, and it is fixable in one phone call — which makes it the highest
  // value-per-minute row on this whole list.
  const held = subscriptionsForClient(client.id).find((s) => s.status === "Active" && s.heldReason);
  if (held) {
    reasons.push({
      signal: "refill-blocked",
      label: "Refill on hold",
      detail: `Nothing ships until this clears: ${held.heldReason}`,
      points: MAX_POINTS["refill-blocked"],
      source: subscriptionSource(held.id, held.sku, held.nextRefillOn),
    });
  } else {
    checked.push("No refill holds");
  }

  // ── Contact silence ─────────────────────────────────────────────────────
  const touch = lastTouchFor(client.id);
  const inbound = lastInboundFor(client.id);
  if (touch) {
    const quiet = daysAgo(touch.at, nowIso);
    if (quiet >= QUIET_DAYS) {
      // Scaled from the threshold rather than from zero: at exactly 21 days
      // this should contribute a little, not two thirds of its ceiling.
      const points = Math.round(
        clamp((quiet - QUIET_DAYS) / QUIET_DAYS, 0, 1) * MAX_POINTS.silence,
      );
      reasons.push({
        signal: "silence",
        label: `${quiet}d since any contact`,
        detail:
          `Last recorded touch was ${touch.direction} by ${touch.channel.toLowerCase()}.` +
          (inbound
            ? ` Last time THEY reached out: ${daysAgo(inbound.at, nowIso)}d ago.`
            : " Nothing inbound from them on record at all."),
        points: Math.max(4, points),
        source: contactSource(touch.id, touch.channel, touch.at, touch.body),
      });
    } else {
      checked.push(`Contacted ${quiet}d ago`);
    }
  } else {
    reasons.push({
      signal: "silence",
      label: "No contact on record",
      detail: "The contact log has no entry for this member in either direction.",
      points: MAX_POINTS.silence,
      source: NO_SOURCE,
    });
  }

  // ── Missed protocol days ────────────────────────────────────────────────
  // `ringHistory` distinguishes a held day from a missed one. Counting held
  // days as misses would penalise a member for correctly following a provider
  // instruction, which is the opposite of what this list is for.
  const history = ringHistory(client, ADHERENCE_WINDOW_DAYS);
  const missed = history.filter((d) => !d.closed && !d.protectedDay).length;
  const heldDays = history.filter((d) => d.protectedDay).length;
  if (missed >= 3) {
    reasons.push({
      signal: "missed-doses",
      label: `${missed} missed days in ${ADHERENCE_WINDOW_DAYS}`,
      detail:
        `Days the member did not mark their protocol complete.` +
        (heldDays ? ` ${heldDays} further day${heldDays === 1 ? "" : "s"} held for a recorded reason and not counted.` : "") +
        " A closed ring is a self-report, not confirmation a dose was taken.",
      points: Math.round(clamp(missed / ADHERENCE_WINDOW_DAYS, 0, 1) * MAX_POINTS["missed-doses"]),
      // Derived from a seeded series with no stored row behind it. Saying so
      // beats citing an id that does not exist.
      source: NO_SOURCE,
    });
  } else {
    checked.push(`${missed} missed protocol day${missed === 1 ? "" : "s"} in the last ${ADHERENCE_WINDOW_DAYS}`);
  }

  // ── Journal silence ─────────────────────────────────────────────────────
  const entries = journalFor(client.id);
  const cutoff = absolute(ms(nowIso) - 30 * DAY_MS).toISOString().slice(0, 10);
  const recent = entries.filter((e) => e.date >= cutoff);
  if (recent.length < JOURNAL_SPARSE_AT) {
    const newest = entries[entries.length - 1];
    reasons.push({
      signal: "journal-silence",
      label: recent.length === 0 ? "No journal entries in 30d" : `Only ${recent.length} entries in 30d`,
      detail: newest
        ? `Last entry ${newest.date}. Members who stop logging usually stop before they say anything.`
        : "Nothing has ever been logged in their journal.",
      points: recent.length === 0 ? MAX_POINTS["journal-silence"] : Math.round(MAX_POINTS["journal-silence"] * 0.5),
      source: newest ? journalSource(newest.id, newest.date, newest.note) : NO_SOURCE,
    });
  } else {
    checked.push(`${recent.length} journal entries in the last 30d`);
  }

  // ── Follow-up overdue ───────────────────────────────────────────────────
  const upcoming = appointmentsForClient(client.id).filter((a) => ms(a.start) > ms(nowIso));
  const noShow = appointmentsForClient(client.id).filter(
    (a) => a.status === "No Show" && ms(a.start) <= ms(nowIso),
  );
  if (!upcoming.length && (client.status === "Follow-Up Due" || client.status === "Active Protocol")) {
    reasons.push({
      signal: "followup",
      label: "Nothing booked",
      detail: `Status is "${client.status}" and there is no future appointment on the calendar.`,
      points: client.status === "Follow-Up Due" ? MAX_POINTS.followup : Math.round(MAX_POINTS.followup * 0.6),
      source: NO_SOURCE,
    });
  } else if (upcoming.length) {
    checked.push(`Next appointment ${upcoming[0].start.slice(0, 10)}`);
  }
  if (noShow.length) {
    const last = noShow[noShow.length - 1];
    reasons.push({
      signal: "followup",
      label: `${noShow.length} no-show${noShow.length === 1 ? "" : "s"}`,
      detail: `Most recent: ${last.type} on ${last.start.slice(0, 10)}. A missed appointment is a withdrawal nobody announced.`,
      points: Math.round(MAX_POINTS.followup * 0.75),
      source: appointmentSource(last.id, last.type, last.start, last.status),
    });
  }

  reasons.sort((a, b) => b.points - a.points || a.signal.localeCompare(b.signal));

  // Capped at 100 so the band thresholds stay meaningful. A member firing every
  // signal at once is "as bad as it gets" — there is no useful distinction
  // between 104 and 118, and pretending there is invites false precision.
  const score = Math.min(100, reasons.reduce((n, r) => n + r.points, 0));

  return {
    client,
    name: clientName(client),
    score,
    band: score >= HIGH_AT ? "high" : score >= MEDIUM_AT ? "medium" : "low",
    reasons,
    checked,
    topReason: reasons[0]?.label ?? "Nothing flagged",
  };
}

/**
 * The ranked worklist for one coach's book.
 *
 * Rows scoring below `MEDIUM_AT` are dropped rather than shown greyed out. A
 * worklist that contains everyone is a roster, and the coach already has one of
 * those — the whole value here is that the list ENDS.
 */
export function adherenceWorklist(
  coachId: string,
  nowIso: string = NOW,
  limit = 12,
): RiskRow[] {
  return clients
    .filter((c) => c.coachId === coachId && c.status !== "Inactive")
    .map((c) => adherenceRisk(c, nowIso))
    .filter((r) => r.score >= MEDIUM_AT)
    // Tiebreak on id so the order is byte-identical across server and client.
    .sort((a, b) => b.score - a.score || a.client.id.localeCompare(b.client.id))
    .slice(0, limit);
}

/** Totals for the worklist header. */
export function worklistSummary(rows: RiskRow[]) {
  return {
    total: rows.length,
    high: rows.filter((r) => r.band === "high").length,
    // The most common leading signal across the list — tells a coach whether
    // this is a supply problem or a relationship problem before they read a row.
    dominant: dominantSignal(rows),
  };
}

function dominantSignal(rows: RiskRow[]): string | undefined {
  const counts = new Map<RiskSignal, number>();
  for (const r of rows) {
    const top = r.reasons[0];
    if (!top) continue;
    counts.set(top.signal, (counts.get(top.signal) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best ? SIGNAL_LABEL[best[0]] : undefined;
}
