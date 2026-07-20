import type { Client, Goal } from "@/lib/types";
import { clients, clientName } from "@/lib/mock/clients";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { trendFor, type SymptomKey } from "@/lib/symptoms/journal";
import { consultsForClient } from "@/lib/mock/consults";
import { ordersForClient } from "@/lib/mock/orders";
import { ledgerForSubject } from "@/lib/trace/ledger";
import { getLabsForClient } from "@/lib/mock/labs";
import { K_MIN } from "@/lib/cohort/trajectory";
import { ms, NOW } from "@/lib/changes/since";
import { formatDate } from "@/lib/utils";
import {
  scanSource,
  journalSource,
  consultSource,
  orderSource,
  labSource,
  ledgerSource,
  NO_SOURCE,
  type SourceRef,
} from "@/lib/coach/provenance";

/**
 * Outcome attribution for a coach.
 *
 * "Which of my members improved on the thing they came here for, over what
 * period, and what did we do before that happened?"
 *
 * ── The word this file is built around: PRECEDED ──────────────────────────
 * Every naming decision here — `precededBy`, not `causedBy`; `PRECEDED_BY_NOTE`
 * rather than a results summary — exists to stop one specific slide from being
 * made out of this data: "members on protocol X lost 4% body fat, therefore X
 * works". Nothing in this codebase can support that claim. There is no control
 * group, no randomisation, no adjustment for the fact that the members who get
 * put on an intervention are systematically the ones who were doing worse (or
 * better) to begin with, and no accounting for everyone who dropped out before
 * the second measurement.
 *
 * What the record CAN support is a chronology: this member improved on this
 * measure over this period, and these interventions are recorded as happening
 * before it. That is genuinely useful to a coach — it is how you notice a
 * pattern worth investigating — and it is not a causal claim. The UI language
 * is constrained to match, and `PRECEDED_BY_NOTE` is exported so no surface can
 * render this data without the caveat travelling with it.
 *
 * ── Why the k-anonymity floor applies to a STAFF-facing surface ───────────
 * K_MIN exists in lib/cohort/trajectory.ts to stop a member inferring another
 * member's data from a small cohort. The re-identification risk is if anything
 * higher here: a coach knows every person in their own book BY NAME, so a
 * cohort of four is not anonymised by aggregation at all — it is a roster with
 * arithmetic on top. "Your Sleep members improved 12% less than the clinic"
 * across six people is a statement about six people the coach can list.
 *
 * The second reason is plain statistics. A four-member comparison against a
 * clinic-wide rate is noise presented as feedback, and coaches will be
 * measured on it. Refusing to draw it is the honest outcome, so `compareToClinic`
 * returns a typed not-ok result and the UI says WHY rather than rendering a
 * number with an asterisk.
 */

/** Travels with every rendering of `precededBy`. Not optional. */
export const PRECEDED_BY_NOTE =
  "These interventions are recorded as happening BEFORE the change. This is a chronology, not a cause — there is no control group here, and members who improved may differ from those who did not in ways this record cannot see.";

/** Improvement is measured over this window unless the record is shorter. */
const WINDOW_DAYS = 90;

// ---------------------------------------------------------------------------
// Goal → measure
// ---------------------------------------------------------------------------

/**
 * What "improved" means for each goal, and where the number comes from.
 *
 * Two goals map to nothing, and that is recorded explicitly rather than
 * silently omitted:
 *
 *   Recovery    no recovery measure exists in this build. The journal tracks
 *               energy, sleep, mood, libido, joint pain and brain fog — none of
 *               which IS recovery, and picking the closest-looking one would be
 *               inventing a measure and then reporting results against it.
 *   Skin/hair   nothing is captured at all.
 *
 * Reporting "no measure on record" for these is the correct output. A coach
 * whose member came for recovery deserves to know the system cannot tell them
 * whether it worked, rather than being handed a proxy that looks authoritative.
 */
type Measure =
  | { via: "scan"; field: "bodyFatPct" | "skeletalMuscleKg"; label: string; unit: string; higherIsBetter: boolean }
  | { via: "journal"; key: SymptomKey; label: string; unit: string }
  | { via: "none"; why: string };

const GOAL_MEASURE: Record<Goal, Measure> = {
  "Fat loss": { via: "scan", field: "bodyFatPct", label: "Body fat", unit: "%", higherIsBetter: false },
  "Muscle gain": { via: "scan", field: "skeletalMuscleKg", label: "Skeletal muscle", unit: "kg", higherIsBetter: true },
  Energy: { via: "journal", key: "energy", label: "Energy", unit: "/5" },
  Sleep: { via: "journal", key: "sleepQuality", label: "Sleep quality", unit: "/5" },
  Libido: { via: "journal", key: "libido", label: "Libido", unit: "/5" },
  Cognition: { via: "journal", key: "brainFog", label: "Brain fog", unit: "/5" },
  "Joint pain": { via: "journal", key: "jointPain", label: "Joint pain", unit: "/5" },
  Recovery: {
    via: "none",
    why: "Apex records no recovery measure. The journal's six symptoms do not include one, and substituting the nearest would be reporting against an invented metric.",
  },
  "Skin/hair": {
    via: "none",
    why: "Nothing in the record measures skin or hair. No scan field, no lab marker, no journal symptom.",
  },
};

export type OutcomeDirection = "improved" | "unchanged" | "worse" | "not measurable";

export interface Intervention {
  at: string;
  label: string;
  detail: string;
  source: SourceRef;
}

export interface MemberOutcome {
  clientId: string;
  name: string;
  /** The goal they came for — the first on their record, not one we picked. */
  goal: Goal;
  measureLabel: string;
  direction: OutcomeDirection;
  /** Absent when direction is "not measurable". */
  from?: { at: string; value: number };
  to?: { at: string; value: number };
  /** Signed toward BETTER, so a body-fat drop is positive. */
  change?: number;
  unit?: string;
  periodDays?: number;
  /** One sentence a coach can read without decoding a sign convention. */
  summary: string;
  /** Why there is no number, when there isn't one. */
  unmeasurableReason?: string;
  source: SourceRef;
  /** Recorded BEFORE the change. Chronology only — see PRECEDED_BY_NOTE. */
  precededBy: Intervention[];
}

// ---------------------------------------------------------------------------
// Interventions
// ---------------------------------------------------------------------------

/**
 * Everything the clinic did for this member inside the measurement window.
 *
 * Ordered oldest-first, because the whole point is to read it as a sequence
 * that ran up to the outcome. Capped, because a member with fourteen contact-log
 * rows produces a wall that stops being a chronology and starts being a chart.
 */
function interventionsBetween(clientId: string, fromIso: string, toIso: string): Intervention[] {
  const within = (iso?: string) => !!iso && ms(iso) >= ms(fromIso) && ms(iso) <= ms(toIso);
  const out: Intervention[] = [];

  for (const c of consultsForClient(clientId)) {
    if (!within(c.startedAt)) continue;
    out.push({
      at: c.startedAt,
      label: `${c.kind} (${c.channel.toLowerCase()})`,
      detail: (c.finalSummary ?? c.aiSummary)?.headline ?? "No summary recorded.",
      source: consultSource(c.id, c.startedAt, c.kind),
    });
  }

  for (const o of ordersForClient(clientId)) {
    if (!within(o.placedAt)) continue;
    out.push({
      at: o.placedAt,
      label: `Order ${o.id}`,
      detail: `${o.lines.length} line${o.lines.length === 1 ? "" : "s"}, now ${o.status.toLowerCase()}.`,
      source: orderSource(o.id, o.status, o.placedAt),
    });
  }

  // Protocol changes and approvals come off the ledger rather than from current
  // entity state, for the reason lib/changes/since.ts spells out: the entity
  // tells you what is true now, the ledger tells you when it became true.
  for (const row of ledgerForSubject(clientId)) {
    if (!within(row.at)) continue;
    const isProtocol = row.entity === "protocol" && row.action === "update";
    const isApproval = row.entity === "recommendation" && row.action === "approve";
    if (!isProtocol && !isApproval) continue;
    const after = row.after ? Object.entries(row.after).map(([k, v]) => `${k}: ${String(v)}`).join(", ") : "";
    out.push({
      at: row.at,
      label: isProtocol ? "Protocol updated" : "Recommendation approved",
      detail: `${row.actorName} (${row.actorRole})${after ? ` — ${after}` : ""}`,
      source: ledgerSource(row.id, row.action, row.entity, row.at),
    });
  }

  const labs = getLabsForClient(clientId);
  if (labs && within(labs.resultedOn)) {
    out.push({
      at: labs.resultedOn,
      label: `${labs.panelName} resulted`,
      detail: `${labs.biomarkers.length} markers reported.`,
      source: labSource(labs.id, labs.panelName, labs.resultedOn),
    });
  }

  return out.sort((a, b) => ms(a.at) - ms(b.at)).slice(0, 8);
}

// ---------------------------------------------------------------------------
// One member
// ---------------------------------------------------------------------------

/**
 * Did this member improve on their primary goal, and what preceded it?
 *
 * "Primary goal" is `goals[0]` — the first thing they said at intake, not a
 * goal chosen because it happens to have moved. Selecting the metric that looks
 * best is the single easiest way to make a coach's outcomes report flattering
 * and worthless, and it is precisely the trick lib/cohort/trajectory.ts refuses
 * for the member-facing band.
 */
export function memberOutcome(client: Client, nowIso: string = NOW): MemberOutcome {
  const goal = client.goals[0];
  const base = { clientId: client.id, name: clientName(client), goal };

  if (!goal) {
    return {
      ...base,
      goal: "Energy",
      measureLabel: "—",
      direction: "not measurable",
      summary: "No goal on record, so there is nothing to measure against.",
      unmeasurableReason: "This member has no goal recorded at intake.",
      source: NO_SOURCE,
      precededBy: [],
    };
  }

  const measure = GOAL_MEASURE[goal];

  if (measure.via === "none") {
    return {
      ...base,
      measureLabel: "—",
      direction: "not measurable",
      summary: `Their goal is ${goal.toLowerCase()}, and Apex does not measure it.`,
      unmeasurableReason: measure.why,
      source: NO_SOURCE,
      precededBy: [],
    };
  }

  if (measure.via === "scan") {
    const scan = getScanForClient(client.id);
    const history = scan?.history ?? [];
    if (!scan || history.length < 2) {
      return {
        ...base,
        measureLabel: measure.label,
        direction: "not measurable",
        summary: `No body-composition trend on file — ${history.length} scan${history.length === 1 ? "" : "s"} recorded.`,
        unmeasurableReason:
          "Two scans are the minimum for a change. One reading is a starting point, not a result.",
        source: scan ? scanSource(scan.id, scan.scannedOn, scan.device) : NO_SOURCE,
        precededBy: [],
      };
    }

    const first = history[0];
    const last = history[history.length - 1];
    const raw = last[measure.field] - first[measure.field];
    // Signed toward BETTER so every outcome in the list reads the same way —
    // a body-fat drop and a muscle gain are both positive numbers here.
    const change = measure.higherIsBetter ? raw : -raw;
    const from = `${first.date}T12:00:00`;
    const to = `${last.date}T12:00:00`;
    const periodDays = Math.round((ms(to) - ms(from)) / 86_400_000);

    // 0.5 is the resolution the seeded scan history actually carries; calling a
    // 0.2kg wobble an improvement would be reading noise as signal.
    const direction: OutcomeDirection = change >= 0.5 ? "improved" : change <= -0.5 ? "worse" : "unchanged";

    return {
      ...base,
      measureLabel: measure.label,
      direction,
      from: { at: from, value: first[measure.field] },
      to: { at: to, value: last[measure.field] },
      change: Math.round(change * 10) / 10,
      unit: measure.unit,
      periodDays,
      summary: `${measure.label} ${first[measure.field].toFixed(1)} → ${last[measure.field].toFixed(1)}${measure.unit} over ${periodDays} days.`,
      source: scanSource(scan.id, scan.scannedOn, scan.device),
      precededBy: interventionsBetween(client.id, from, to),
    };
  }

  // Journal-backed goals. `trendFor` already signs `change` toward better and
  // applies a seven-day rolling mean, so an inverted symptom like brain fog
  // needs no special handling here.
  const trend = trendFor(client.id, measure.key, WINDOW_DAYS);
  if (trend.points.length < 2) {
    return {
      ...base,
      measureLabel: measure.label,
      direction: "not measurable",
      summary: `Not enough journal entries in the last ${WINDOW_DAYS} days to show a trend.`,
      unmeasurableReason: `${trend.points.length} entr${trend.points.length === 1 ? "y" : "ies"} on record for ${measure.label.toLowerCase()}.`,
      source: NO_SOURCE,
      precededBy: [],
    };
  }

  const first = trend.points[0];
  const last = trend.points[trend.points.length - 1];
  const from = `${first.date}T12:00:00`;
  const to = `${last.date}T12:00:00`;
  const periodDays = Math.round((ms(to) - ms(from)) / 86_400_000);
  const direction: OutcomeDirection =
    trend.direction === "improving" ? "improved" : trend.direction === "slipping" ? "worse" : "unchanged";

  return {
    ...base,
    measureLabel: measure.label,
    direction,
    from: { at: from, value: trend.first },
    to: { at: to, value: trend.last },
    change: trend.change,
    unit: measure.unit,
    periodDays,
    summary: `${measure.label} ${trend.first} → ${trend.last}${measure.unit} (self-reported) over ${periodDays} days.`,
    source: journalSource(`journal-${client.id}`, last.date),
    precededBy: interventionsBetween(client.id, from, to),
  };
}

/** Every member in a coach's book, ranked improvers first. */
export function coachOutcomes(coachId: string, nowIso: string = NOW): MemberOutcome[] {
  const RANK: Record<OutcomeDirection, number> = {
    improved: 0,
    unchanged: 1,
    worse: 2,
    "not measurable": 3,
  };
  return clients
    .filter((c) => c.coachId === coachId)
    .map((c) => memberOutcome(c, nowIso))
    .sort(
      (a, b) =>
        RANK[a.direction] - RANK[b.direction] ||
        (b.change ?? 0) - (a.change ?? 0) ||
        a.clientId.localeCompare(b.clientId),
    );
}

// ---------------------------------------------------------------------------
// Cohort comparison
// ---------------------------------------------------------------------------

export interface CohortSide {
  n: number;
  improved: number;
  /** Whole percent. Only meaningful once the floor is cleared. */
  improvedPct: number;
}

export type CohortComparison =
  | {
      ok: true;
      goal?: Goal;
      mine: CohortSide;
      clinic: CohortSide;
      /** Signed percentage points, coach minus clinic. */
      deltaPoints: number;
      /** The plain reading, hedged exactly as much as the data requires. */
      verdict: string;
    }
  | {
      ok: false;
      goal?: Goal;
      reason: "cohort-too-small";
      /** Which side failed, and by how much — never just "unavailable". */
      mineN: number;
      clinicN: number;
      explanation: string;
    };

/**
 * Compare a coach's improvement rate against the clinic's, or refuse to.
 *
 * The floor is checked on BOTH sides before any arithmetic is done. Checking
 * only the coach's side is the tempting shortcut and it is wrong: a 60-member
 * coach cohort compared against an 11-member clinic-wide slice is exactly as
 * re-identifying, just from the other direction.
 *
 * Members whose goal has no measure are excluded from both sides rather than
 * counted as "did not improve". Counting them would make a coach's numbers a
 * function of how many of their members came in for recovery — something they
 * do not control and which says nothing about their coaching.
 */
export function compareToClinic(
  coachId: string,
  goal?: Goal,
  nowIso: string = NOW,
): CohortComparison {
  const measurable = (o: MemberOutcome) => o.direction !== "not measurable";
  const matchesGoal = (c: Client) => !goal || c.goals[0] === goal;

  const mineRows = clients
    .filter((c) => c.coachId === coachId && matchesGoal(c))
    .map((c) => memberOutcome(c, nowIso))
    .filter(measurable);

  const clinicRows = clients
    .filter(matchesGoal)
    .map((c) => memberOutcome(c, nowIso))
    .filter(measurable);

  const side = (rows: MemberOutcome[]): CohortSide => {
    const improved = rows.filter((r) => r.direction === "improved").length;
    return {
      n: rows.length,
      improved,
      improvedPct: rows.length ? Math.round((improved / rows.length) * 100) : 0,
    };
  };

  const mine = side(mineRows);
  const clinic = side(clinicRows);

  if (mine.n < K_MIN || clinic.n < K_MIN) {
    return {
      ok: false,
      goal,
      reason: "cohort-too-small",
      mineN: mine.n,
      clinicN: clinic.n,
      explanation:
        `A comparison needs at least ${K_MIN} members with a measurable outcome on each side. ` +
        `${goal ? `For ${goal.toLowerCase()}, your` : "Your"} book has ${mine.n} and the clinic has ${clinic.n}. ` +
        `Below that the number would swing on one or two people you could name — so there is no number here rather than a misleading one.`,
    };
  }

  const deltaPoints = mine.improvedPct - clinic.improvedPct;

  return {
    ok: true,
    goal,
    mine,
    clinic,
    deltaPoints,
    // Hedged on purpose. Even above the floor this is an unadjusted comparison
    // between non-randomised groups, and the sentence should not read like a
    // performance rating.
    verdict:
      Math.abs(deltaPoints) < 5
        ? `Your improvement rate is within 5 points of the clinic's — on this data that is indistinguishable.`
        : `Your book improved at ${mine.improvedPct}% against the clinic's ${clinic.improvedPct}%, ${Math.abs(deltaPoints)} points ${deltaPoints > 0 ? "above" : "below"}. Unadjusted: members are not assigned to coaches at random.`,
  };
}

/** Goals present in a coach's book, most common first — drives the filter. */
export function goalsInBook(coachId: string): Goal[] {
  const counts = new Map<Goal, number>();
  for (const c of clients) {
    if (c.coachId !== coachId) continue;
    const g = c.goals[0];
    if (g) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([g]) => g);
}

/** Headline counts for the panel header. */
export function outcomeTotals(rows: MemberOutcome[]) {
  return {
    total: rows.length,
    improved: rows.filter((r) => r.direction === "improved").length,
    unchanged: rows.filter((r) => r.direction === "unchanged").length,
    worse: rows.filter((r) => r.direction === "worse").length,
    notMeasurable: rows.filter((r) => r.direction === "not measurable").length,
  };
}
