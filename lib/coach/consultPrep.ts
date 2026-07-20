import { formatDate } from "@/lib/utils";
import { ms, isAfter, elapsedPhrase, NOW } from "@/lib/changes/since";
import { consultsForClient } from "@/lib/mock/consults";
import { getClient, clientName } from "@/lib/mock/clients";
import { journalFor } from "@/lib/symptoms/journal";
import { ordersForClient } from "@/lib/mock/orders";
import { getLabsForClient } from "@/lib/mock/labs";
import { appointmentsForClient } from "@/lib/mock/appointments";
import { escalationsForClient } from "@/lib/escalations/queue";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { subscriptionsForClient } from "@/lib/mock/subscriptions";
import { staffName } from "@/lib/mock/staff";
import { runwayFor } from "@/lib/protocol/runway";
import { sinceLastVisit, type SinceLastVisit } from "@/lib/coach/sinceLastVisit";
import type { Consult, ExtractedItem } from "@/lib/consult/types";
import {
  consultSource,
  journalSource,
  orderSource,
  labSource,
  scanSource,
  appointmentSource,
  escalationSource,
  subscriptionSource,
  NO_SOURCE,
  isSourced,
  type SourceRef,
} from "@/lib/coach/provenance";

/**
 * The 60-second consult prep brief.
 *
 * ── The problem it solves ─────────────────────────────────────────────────
 * A coach with eight calls booked has, realistically, about a minute between
 * each one. In that minute they need to reconstruct a relationship: what was
 * agreed last time, whether it happened, and the one thing that must not go
 * unsaid today. The system being replaced offers a chart — which is to say, it
 * offers everything, which in sixty seconds is the same as offering nothing.
 *
 * ── The rule that shapes every line below ─────────────────────────────────
 * EVERY CLAIM CARRIES ITS SOURCE, OR SAYS THERE ISN'T ONE.
 *
 * This is not decoration, and it is not for auditors — it is what makes the
 * brief usable. A coach who cannot see where a line came from has to go and
 * verify it in the chart, which costs more than the brief saved. A coach who
 * can see "we know this because the member wrote it in their journal on the
 * 4th" can open their mouth and use it.
 *
 * The corollary is the harder half: WHERE THE RECORD IS SILENT, THE BRIEF SAYS
 * SO. A commitment the system cannot verify is reported as unverifiable, never
 * quietly dropped and never optimistically assumed. `verdict: "no evidence"` is
 * the most common outcome in this file by design, and it is a true statement
 * about the record rather than a failure of the engine.
 *
 * ── What this deliberately does not do ────────────────────────────────────
 * It does not generate prose about the member's clinical picture, suggest a
 * dose, or infer a cause. `mostImportant` is chosen by a fixed priority ladder
 * over recorded facts, and the opener is assembled from the same facts — both
 * are projections of the record, not authored text. If the ladder finds nothing,
 * it returns null and the UI says the record is quiet.
 */

// ---------------------------------------------------------------------------
// Open loops — what they said they'd do, and whether they did it
// ---------------------------------------------------------------------------

/**
 * Whether the record can confirm a commitment happened.
 *
 * Three values, not two. A binary did/didn't forces the engine to guess on
 * everything it cannot machine-check — and since most of what a member promises
 * in a coaching call ("I'll cook more", "I'll get to bed earlier") leaves no
 * row anywhere, a binary would be wrong far more often than right, in the
 * direction that makes a coach look foolish on a call.
 */
export type LoopVerdict = "did" | "did not" | "no evidence";

/**
 * The classes of commitment this engine can actually verify.
 *
 * Each maps to a real store. Anything that does not match one of these is
 * classified `unverifiable` and reported as such — the honest default, and the
 * one that keeps the list of checkable classes from quietly growing into
 * keyword astrology.
 */
type LoopClass = "order" | "appointment" | "lab" | "journal" | "scan" | "unverifiable";

/**
 * Cue phrases, matched against the coach's own typing.
 *
 * These read the SAME raw note fragments that lib/consult/summarize.ts already
 * classified as action items, so the vocabulary is the vocabulary coaches
 * actually use in this codebase's seeded notes ("reorder his protocol", "rebook
 * 4 weeks", "labs recheck ordered"). They are matched case-insensitively
 * against the extracted fragment, never against a summary of it.
 */
const LOOP_CUES: { cls: Exclude<LoopClass, "unverifiable">; cues: string[] }[] = [
  { cls: "order", cues: ["reorder", "re-order", "refill", "order ", "ordering", "supply", "resupply", "ship"] },
  { cls: "appointment", cues: ["rebook", "book ", "booking", "schedule", "follow up", "follow-up", "next visit", "appointment", "come in"] },
  { cls: "lab", cues: ["labs", "lab ", "panel", "recheck", "draw", "bloodwork", "blood work"] },
  { cls: "scan", cues: ["scan", "inbody", "body fat", "weigh in", "weigh-in"] },
  { cls: "journal", cues: ["track ", "tracking", "log ", "logging", "journal", "record ", "steps", "check in", "check-in"] },
];

function classify(text: string): LoopClass {
  const t = text.toLowerCase();
  for (const { cls, cues } of LOOP_CUES) {
    if (cues.some((c) => t.includes(c))) return cls;
  }
  return "unverifiable";
}

export interface OpenLoop {
  id: string;
  /** The commitment, verbatim from the coach's note. Never paraphrased. */
  commitment: string;
  /** The consult it was made in, with the exact source quote attached. */
  source: SourceRef;
  cls: LoopClass;
  verdict: LoopVerdict;
  /** Plain sentence explaining the verdict — including "we cannot tell". */
  verdictNote: string;
  /** Records that support the verdict. Empty when the verdict is "no evidence". */
  evidence: SourceRef[];
}

/**
 * Check one commitment against the stores, within the window since it was made.
 *
 * The window matters: an order placed a month BEFORE the consult is not
 * evidence that the member acted on what was agreed at it. Every lookup below
 * is bounded by `since`.
 */
function checkLoop(clientId: string, item: ExtractedItem, consult: Consult): OpenLoop {
  const cls = classify(item.value);
  const since = consult.startedAt;
  const source = consultSource(consult.id, consult.startedAt, consult.kind, item.sourceQuote);
  const base = { id: `loop-${consult.id}-${item.sourceStart}`, commitment: item.value, source, cls };

  if (cls === "order") {
    const placed = ordersForClient(clientId).filter((o) => isAfter(o.placedAt, since));
    if (placed.length) {
      return {
        ...base,
        verdict: "did",
        verdictNote: `${placed.length} order${placed.length === 1 ? "" : "s"} placed since that consult.`,
        evidence: placed
          .slice(0, 3)
          .map((o) => orderSource(o.id, o.status, o.placedAt)),
      };
    }
    // A held subscription is a REASON, not just an absence — and it is a reason
    // the clinic owns rather than the member. Surfacing it stops a coach opening
    // with "you never reordered" when the answer is "we never let them".
    const held = subscriptionsForClient(clientId).find((s) => s.heldReason);
    if (held) {
      return {
        ...base,
        verdict: "did not",
        verdictNote: `No order placed since. Their refill is on hold: ${held.heldReason}`,
        evidence: [subscriptionSource(held.id, held.sku, held.nextRefillOn)],
      };
    }
    return {
      ...base,
      verdict: "did not",
      verdictNote: "No order has been placed since that consult.",
      evidence: [],
    };
  }

  if (cls === "appointment") {
    const booked = appointmentsForClient(clientId).filter((a) => isAfter(a.start, since));
    if (booked.length) {
      const missed = booked.filter((a) => a.status === "No Show");
      return {
        ...base,
        // Booked-then-missed is not "did". Collapsing the two is how a coach
        // congratulates someone for an appointment they did not attend.
        verdict: missed.length === booked.length ? "did not" : "did",
        verdictNote: missed.length
          ? `${booked.length} booked since, ${missed.length} not attended.`
          : `${booked.length} appointment${booked.length === 1 ? "" : "s"} booked since that consult.`,
        evidence: booked.slice(0, 3).map((a) => appointmentSource(a.id, a.type, a.start, a.status)),
      };
    }
    return {
      ...base,
      verdict: "did not",
      verdictNote: "Nothing has been booked since that consult.",
      evidence: [],
    };
  }

  if (cls === "lab") {
    const labs = getLabsForClient(clientId);
    if (labs && isAfter(labs.resultedOn, since)) {
      return {
        ...base,
        verdict: "did",
        verdictNote: `${labs.panelName} resulted ${formatDate(labs.resultedOn)}.`,
        evidence: [labSource(labs.id, labs.panelName, labs.resultedOn)],
      };
    }
    return {
      ...base,
      verdict: "did not",
      verdictNote: "No lab panel has resulted since that consult.",
      evidence: [],
    };
  }

  if (cls === "scan") {
    const scan = getScanForClient(clientId);
    if (scan && isAfter(`${scan.scannedOn}T12:00:00`, since)) {
      return {
        ...base,
        verdict: "did",
        verdictNote: `Scanned ${formatDate(`${scan.scannedOn}T12:00:00`)}.`,
        evidence: [scanSource(scan.id, scan.scannedOn, scan.device)],
      };
    }
    return {
      ...base,
      verdict: "did not",
      verdictNote: "No body scan on file since that consult.",
      evidence: [],
    };
  }

  if (cls === "journal") {
    const entries = journalFor(clientId).filter((e) => isAfter(`${e.date}T12:00:00`, since));
    if (entries.length) {
      const newest = entries[entries.length - 1];
      return {
        ...base,
        verdict: "did",
        verdictNote: `${entries.length} journal ${entries.length === 1 ? "entry" : "entries"} since, most recent ${newest.date}.`,
        evidence: [journalSource(newest.id, newest.date, newest.note)],
      };
    }
    return {
      ...base,
      verdict: "did not",
      verdictNote: "Nothing logged in their journal since that consult.",
      evidence: [],
    };
  }

  return {
    ...base,
    verdict: "no evidence",
    // The honest one. Said in full rather than abbreviated to a dash, because a
    // coach skimming needs to register that the silence is the system's, not
    // the member's.
    verdictNote:
      "Nothing in the record can confirm this either way — it is not the kind of commitment Apex stores.",
    evidence: [],
  };
}

// ---------------------------------------------------------------------------
// The brief
// ---------------------------------------------------------------------------

export interface BriefClaim {
  /** The assertion, as the UI will render it. */
  claim: string;
  /** Why it was selected — the rule that fired, in plain language. */
  why: string;
  source: SourceRef;
}

export interface ConsultPrep {
  clientId: string;
  clientName: string;
  coachId: string;
  generatedAt: string;
  /** The consult this brief is measured from. Undefined when there is none. */
  lastConsult?: {
    id: string;
    at: string;
    kind: string;
    channel: string;
    headline: string;
    elapsed: string;
    signed: boolean;
    author: string;
  };
  openLoops: OpenLoop[];
  /** The single thing to raise. Null when nothing on record qualifies. */
  mostImportant: BriefClaim | null;
  /** A first sentence, assembled from record facts. Null when there is none. */
  opener: BriefClaim | null;
  /** The diff since the last visit, reused rather than recomputed. */
  changes: SinceLastVisit;
  /**
   * Things checked and found empty. Rendered, not swallowed.
   *
   * A brief with three lines is ambiguous: did the engine find little, or did
   * it fail? Listing what was looked at and came back empty resolves that, and
   * is the difference between a coach trusting a short brief and ignoring it.
   */
  gaps: string[];
}

/**
 * Pick the one thing to raise.
 *
 * A FIXED LADDER over recorded facts, in descending order of how badly the call
 * goes if it is not said. No scoring, no weighting, no model: a coach must be
 * able to predict what this will surface, and to argue with the ordering. Every
 * rung returns the record that fired it.
 */
function pickMostImportant(
  clientId: string,
  changes: SinceLastVisit,
  loops: OpenLoop[],
): BriefClaim | null {
  // 1. An open escalation. A member waiting on a provider answer must not be
  //    asked "so how have things been?" as though nothing is outstanding.
  const openEsc = escalationsForClient(clientId).find(
    (e) => e.status !== "Answered" && e.status !== "Closed",
  );
  if (openEsc) {
    return {
      claim: `They are waiting on a provider answer: ${openEsc.question}`,
      why: `Escalation raised ${formatDate(openEsc.raisedAt)} to ${staffName(openEsc.assignedToStaffId)}, still ${openEsc.status.toLowerCase()}.`,
      source: escalationSource(openEsc.id, openEsc.kind, openEsc.raisedAt, openEsc.question),
    };
  }

  // 2. Supply that has run out or is about to. The single most common cause of
  //    a protocol lapsing (see lib/protocol/runway.ts) and entirely preventable
  //    in a call that is happening anyway.
  const runway = runwayFor(clientId);
  const tight = runway.lines.find((l) => l.status === "out" || l.status === "at risk");
  if (tight) {
    return {
      claim: `${tight.itemName}: ${tight.memberLine.toLowerCase()}`,
      why: `Refill runway is "${tight.status}" — ${tight.timing}.`,
      source: subscriptionSource(tight.subscriptionId, tight.itemName, tight.nextRefillOn),
    };
  }

  // 3. The member flagged something themselves. Their own words outrank any
  //    derived signal — they have already told you what the call is about.
  const flagged = changes.items.find((i) => i.kind === "journal" && i.importance === "high");
  if (flagged) {
    return {
      claim: flagged.headline,
      why: `The member logged this themselves. ${flagged.detail}`,
      source: flagged.source,
    };
  }

  // 4. Anything else the diff flagged — an abnormal panel, a no-show, a stuck
  //    order. Ranked by `changesSince`, so this takes its first high item.
  const high = changes.items.find((i) => i.importance === "high");
  if (high) {
    return {
      claim: high.headline,
      why: `Flagged in what changed since you last saw them. ${high.detail}`,
      source: high.source,
    };
  }

  // 5. A commitment demonstrably not kept. Last rung because it is the only one
  //    that puts the member on the back foot, and it should never displace
  //    something they are actually waiting on.
  const broken = loops.find((l) => l.verdict === "did not");
  if (broken) {
    return {
      claim: `Last time they agreed: "${broken.commitment}" — ${broken.verdictNote.toLowerCase()}`,
      why: "Cross-referenced against the record since that consult.",
      source: broken.source,
    };
  }

  return null;
}

/**
 * A suggested opener.
 *
 * Assembled from a fact the member themselves would recognise, so the call
 * starts inside their story rather than inside the software's. It is offered as
 * a SUGGESTION with its source attached — the coach can see what it is built on
 * and discard it, which is the only responsible way to put words in someone's
 * mouth.
 *
 * Where there is no fact worth opening on, this returns null rather than a
 * generic pleasantry. "How have you been?" is not something a system needs to
 * suggest.
 */
function pickOpener(clientId: string, changes: SinceLastVisit, loops: OpenLoop[]): BriefClaim | null {
  // Opening on something the member did well, when there is one, is a
  // deliberate choice: a kept commitment is the cheapest possible proof that
  // the coach was paying attention between calls.
  const kept = loops.find((l) => l.verdict === "did");
  if (kept) {
    return {
      claim: `"Last time you said you'd ${trimCommitment(kept.commitment)} — I saw that you did. How did it go?"`,
      why: kept.verdictNote,
      source: kept.evidence[0] ?? kept.source,
    };
  }

  const body = changes.items.find((i) => i.kind === "body");
  if (body) {
    return {
      claim: `"Your latest scan came back — ${body.headline.toLowerCase()}. Want to start there?"`,
      why: body.detail,
      source: body.source,
    };
  }

  const journal = changes.items.find((i) => i.kind === "journal");
  if (journal) {
    return {
      claim: `"I've been reading your check-ins. ${journal.headline}."`,
      why: journal.detail,
      source: journal.source,
    };
  }

  return null;
}

/** "we'll start tracking steps, target 8k" → "start tracking steps". */
function trimCommitment(text: string): string {
  return text
    .replace(/^(we'll|i'll|we will|i will|going to|plan to|let's|lets)\s+/i, "")
    .replace(/[.,;]\s*$/, "")
    .trim();
}

/**
 * Build the brief.
 *
 * Pure, deterministic, and reads only stored records — the same call on the
 * same seed produces the same brief on the server and in the browser, which is
 * a hydration requirement as much as a trust one.
 */
export function consultPrep(
  clientId: string,
  coachId: string,
  nowIso: string = NOW,
): ConsultPrep {
  const client = getClient(clientId);
  const changes = sinceLastVisit(clientId, coachId, nowIso);

  const last = consultsForClient(clientId).find((c) => ms(c.startedAt) < ms(nowIso));
  const summary = last?.finalSummary ?? last?.aiSummary;

  // Action items are the commitments. Escalations from the same consult are
  // handled by the `mostImportant` ladder rather than duplicated here — an open
  // clinical question is not a chore the member owes.
  const openLoops = last && summary
    ? summary.actionItems.map((item) => checkLoop(clientId, item, last))
    : [];

  const mostImportant = pickMostImportant(clientId, changes, openLoops);
  const opener = pickOpener(clientId, changes, openLoops);

  const gaps: string[] = [];
  if (!last) gaps.push("No consult on record with this member — there is no previous call to open loops from.");
  else if (!summary) gaps.push("That consult has no summary yet, so no commitments could be extracted from it.");
  else if (!summary.actionItems.length) gaps.push("No commitments were recorded at the last consult.");
  if (!changes.items.length) gaps.push(`Nothing has changed on their record since ${formatDate(changes.baseline.at)}.`);
  if (!mostImportant) gaps.push("Nothing on the record rises to a must-raise. Treat this as an open check-in.");
  if (!opener) gaps.push("No recorded fact makes a natural opener — start wherever you like.");
  const unverifiable = openLoops.filter((l) => l.verdict === "no evidence").length;
  if (unverifiable) {
    gaps.push(
      `${unverifiable} commitment${unverifiable === 1 ? "" : "s"} could not be checked against any store — Apex does not record that kind of follow-through.`,
    );
  }

  return {
    clientId,
    clientName: client ? clientName(client) : clientId,
    coachId,
    generatedAt: nowIso,
    lastConsult: last
      ? {
          id: last.id,
          at: last.startedAt,
          kind: last.kind,
          channel: last.channel,
          headline: summary?.headline ?? "No summary on this consult.",
          elapsed: elapsedPhrase(last.startedAt, nowIso),
          signed: last.status === "Signed",
          author: staffName(last.authorId),
        }
      : undefined,
    openLoops,
    mostImportant,
    opener,
    changes,
    gaps,
  };
}

/** Count of loops the record says were not kept — the number worth a badge. */
export function unkeptCount(prep: ConsultPrep): number {
  return prep.openLoops.filter((l) => l.verdict === "did not").length;
}

/** True when every claim in the brief carries an inspectable record. */
export function fullyTraceable(prep: ConsultPrep): boolean {
  const claims = [prep.mostImportant, prep.opener].filter(Boolean) as BriefClaim[];
  return claims.every((c) => isSourced(c.source));
}
