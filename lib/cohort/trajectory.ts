// =============================================================================
// Apex — Cohort trajectory ("Members like you, six months in")
//
// Aggregate outcome curves for the group a member most resembles AT THE START
// of their journey, rendered as a percentile band rather than a projection.
//
// Three rules are enforced here rather than in the UI, because a rule that
// lives only in a component is one refactor away from being gone:
//
//   1. K-ANONYMITY FLOOR (K_MIN). No cohort smaller than 20 is ever returned,
//      and the floor is re-checked AT EVERY WEEK POINT — a band that starts at
//      n=40 and thins to n=4 by week 26 is a re-identification vector at week
//      26 even though the cohort "is" 40. Sub-floor calls return a typed
//      not-ok result and the UI says so plainly.
//
//   2. TYPICAL RANGE, NEVER A PROMISE. The only outputs are p25 / p50 / p75.
//      There is deliberately no `projected`, no `expected`, no `youWillBe`.
//      If a future caller wants a single number for an individual, they will
//      have to add it on purpose and defend it.
//
//   3. NO INDIVIDUALS, EVER. `CohortMember` carries no id, no name, no
//      location — only a starting profile and a numeric series. There is no
//      field on any exported type that could render another member's identity,
//      so no UI mistake can leak one.
//
// -----------------------------------------------------------------------------
// WHY MATCHING IS ON STARTING CHARACTERISTICS ONLY
//
// It is tempting to build the comparison group out of members who did well —
// "here's how members who succeeded on this protocol progressed". That is
// survivorship bias dressed up as insight. Selecting on the outcome guarantees
// the band slopes the right way regardless of whether the program works, and
// it quietly deletes everyone who plateaued, quit, or got worse. The member
// then sees a curve that no honest process could have produced and reads it as
// a forecast of their own.
//
// So membership is decided entirely by facts that were true on day one — sex,
// age band, primary goal, starting body-fat band — and nothing that happened
// afterwards. Non-responders stay in. They are most of why the band is wide.
// -----------------------------------------------------------------------------

import type { Client, Goal } from "@/lib/types";
import { clients, getClient } from "@/lib/mock/clients";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { alphaScore } from "@/lib/alphaScore";
import { clamp, absolute } from "@/lib/utils";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/**
 * K-anonymity floor. Below this, nothing renders.
 *
 * 20 is chosen rather than the more common 5 because this surface is shown to
 * members, not analysts: a member frequently knows several other members by
 * name, so the practical attacker here has far more side information than a
 * researcher with a de-identified extract.
 */
export const K_MIN = 20;

/** Pinned demo clock. Never `new Date()` with no argument. */
const NOW_ISO = "2026-06-12T09:00:00";

/** Six months, in whole weeks — the window this surface is named after. */
const HORIZON_WEEKS = 26;

/**
 * Week points the band is sampled at. Coarse on purpose: weekly resolution
 * would imply a precision the underlying scan cadence (roughly every 6 weeks)
 * does not have.
 */
const WEEK_POINTS = [0, 4, 8, 12, 16, 20, 26] as const;

/**
 * Minimum surviving week points before we are willing to call something a
 * trajectory.
 *
 * A cohort whose members are mostly four weeks in produces a band one or two
 * points wide. Rendering that draws a line between two dots and invites the
 * member to extend it in their head — which is precisely the projection this
 * surface refuses to make. Two points is not a trend, it is a segment.
 */
const MIN_WEEK_POINTS = 3;

// The cohort population is `lib/mock/clients` itself — 500 members across the
// five locations. Nothing is synthesised here: every point in every band is a
// real member's real InBody history or real Alpha Score trend, and the width of
// the band is the width the roster actually has. If a cohort is thin, it is
// thin, and the K_MIN floor deals with it.

// -----------------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------------

export type CohortMetric = "bodyFat" | "weight" | "leanMass" | "alphaScore";

export interface Cohort {
  key: string;
  label: string;
  /** Head-count matched on starting profile. Always >= K_MIN when ok. */
  size: number;
  /** Exactly what was matched on, in plain language, for display to the member. */
  criteria: string[];
  /**
   * Which axes the ladder actually ended up using.
   *
   * This exists so the UI can write an accurate sentence instead of a flattering
   * one. On a roster this size the floor usually forces the widest level, and a
   * card that says "similar age, similar starting point" while comparing a
   * 29-year-old to a 61-year-old is lying — quietly, plausibly, and in the exact
   * register this whole surface is supposed to avoid.
   */
  matched: {
    age: "band" | "range" | "any";
    startingBodyFat: boolean;
  };
}

export type NotOkReason =
  | "cohort-too-small"
  | "no-baseline"
  | "unknown-cohort"
  | "no-data-for-metric"
  | "not-enough-history";

export interface NotOk {
  ok: false;
  reason: NotOkReason;
  /**
   * The criteria that were attempted, so the UI can still be specific about
   * what it looked for.
   *
   * Note what is NOT here: the sub-floor head-count. "Only 4 members match"
   * is itself a re-identifying signal in a small clinic, so the exact size of
   * a suppressed cohort never leaves this module.
   */
  attempted: string[];
}

export type CohortResult = ({ ok: true } & Cohort) | NotOk;

export interface TrajectoryPoint {
  week: number;
  p25: number;
  p50: number;
  p75: number;
  /** Members with data at this specific week. Always >= K_MIN. */
  n: number;
}

export interface Trajectory {
  ok: true;
  metric: CohortMetric;
  label: string;
  unit: string;
  /** Which way is improvement for this metric — for neutral phrasing, not ranking. */
  betterDirection: "up" | "down";
  points: TrajectoryPoint[];
  /** Cohort head-count at week 0. Later weeks may be smaller; see points[].n. */
  n: number;
}

export type TrajectoryResult = Trajectory | NotOk;

export interface WhereYouAre {
  ok: true;
  metric: CohortMetric;
  /** Weeks since this member joined, clamped to the 26-week window. */
  week: number;
  value: number;
  /** Position of `value` within the cohort's distribution at `week`, 0–100. */
  percentile: number;
  /** True when the member sits inside the shaded p25–p75 band. */
  inBand: boolean;
}

export type WhereYouAreResult = WhereYouAre | NotOk;

export interface MemberPoint {
  week: number;
  value: number;
}

export type MemberSeriesResult =
  | { ok: true; metric: CohortMetric; points: MemberPoint[] }
  | NotOk;

// -----------------------------------------------------------------------------
// Metric configuration
// -----------------------------------------------------------------------------

interface MetricConfig {
  label: string;
  unit: string;
  betterDirection: "up" | "down";
  decimals: number;
}

const METRICS: Record<CohortMetric, MetricConfig> = {
  bodyFat: { label: "Body fat", unit: "%", betterDirection: "down", decimals: 1 },
  weight: { label: "Weight", unit: "kg", betterDirection: "down", decimals: 1 },
  leanMass: { label: "Skeletal muscle", unit: "kg", betterDirection: "up", decimals: 1 },
  alphaScore: { label: "Alpha Score", unit: "", betterDirection: "up", decimals: 0 },
};

export function metricLabel(metric: CohortMetric): string {
  return METRICS[metric].label;
}

export const COHORT_METRICS: CohortMetric[] = ["bodyFat", "weight", "leanMass", "alphaScore"];

// -----------------------------------------------------------------------------
// Starting-profile derivation
// -----------------------------------------------------------------------------

type AgeBandKey = "25-34" | "35-44" | "45-54" | "55+";
type BfBandKey = "lean" | "moderate" | "elevated" | "high";

interface StartingProfile {
  sex: "male" | "female";
  ageBand: AgeBandKey;
  age: number;
  goal: Goal;
  /** Undefined when the member had no body scan on file at baseline. */
  bfBand?: BfBandKey;
}

function ageBandOf(age: number): AgeBandKey {
  if (age < 35) return "25-34";
  if (age < 45) return "35-44";
  if (age < 55) return "45-54";
  return "55+";
}

const AGE_BAND_LABEL: Record<AgeBandKey, string> = {
  "25-34": "Age 25–34",
  "35-44": "Age 35–44",
  "45-54": "Age 45–54",
  "55+": "Age 55 and over",
};

/**
 * Body-fat bands are sex-specific because the same percentage means different
 * things in male and female physiology. Using one set of cut-points for both
 * would put every woman in the demo in the top band and make the cohorts
 * meaningless.
 */
const BF_CUTS: Record<"male" | "female", [number, number, number]> = {
  male: [15, 22, 30],
  female: [24, 31, 38],
};

function bfBandOf(sex: "male" | "female", pct: number): BfBandKey {
  const [a, b, c] = BF_CUTS[sex];
  if (pct < a) return "lean";
  if (pct < b) return "moderate";
  if (pct < c) return "elevated";
  return "high";
}

function bfBandLabel(sex: "male" | "female", band: BfBandKey): string {
  const [a, b, c] = BF_CUTS[sex];
  if (band === "lean") return `Started under ${a}% body fat`;
  if (band === "moderate") return `Started at ${a}–${b}% body fat`;
  if (band === "elevated") return `Started at ${b}–${c}% body fat`;
  return `Started at ${c}% body fat or above`;
}

const SEX_LABEL: Record<"male" | "female", string> = { male: "Male", female: "Female" };

/**
 * The member's STARTING body fat — history[0], not the current scan. Matching
 * on the current value would be matching on the outcome.
 */
function startingBodyFat(client: Client): number | undefined {
  const scan = getScanForClient(client.id);
  if (!scan) return undefined;
  return scan.history?.[0]?.bodyFatPct ?? scan.bodyFatPct;
}

function profileOf(client: Client): StartingProfile | null {
  const goal = client.goals[0];
  if (!goal) return null; // no stated goal at intake — nothing to match on
  const bf = startingBodyFat(client);
  return {
    sex: client.sex,
    ageBand: ageBandOf(client.age),
    age: client.age,
    goal,
    bfBand: bf === undefined ? undefined : bfBandOf(client.sex, bf),
  };
}

// -----------------------------------------------------------------------------
// Time
// -----------------------------------------------------------------------------

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function weeksSince(iso: string): number {
  const then = absolute(iso).getTime();
  const now = absolute(NOW_ISO).getTime();
  return Math.max(0, Math.round((now - then) / MS_PER_WEEK));
}

/** Tenure in weeks, clamped to the six-month window this surface covers. */
function tenureWeeks(client: Client): number {
  return clamp(weeksSince(client.joinedOn), 0, HORIZON_WEEKS);
}

/** ISO date `weeks` after `iso`. Used to put the cohort axis on the member's own calendar. */
export function dateAtWeek(iso: string, weeks: number): string {
  const d = absolute(absolute(iso).getTime() + weeks * MS_PER_WEEK);
  return d.toISOString().slice(0, 10);
}

// -----------------------------------------------------------------------------
// Observed series → week-indexed series
// -----------------------------------------------------------------------------

/**
 * Pull the real observed 5-point series for one metric off the anchor client.
 * Returns null when the member has no data for that metric — they then simply
 * do not count toward that metric's n, which is why `n` is reported per metric
 * and per week rather than once per cohort.
 */
function observedSeries(client: Client, metric: CohortMetric): number[] | null {
  if (metric === "alphaScore") {
    const trend = alphaScore(client).trend;
    return trend.length ? trend.map((t) => t.value) : null;
  }
  const scan = getScanForClient(client.id);
  if (!scan?.history?.length) return null;
  const h = scan.history;
  if (metric === "bodyFat") return h.map((p) => p.bodyFatPct);
  if (metric === "weight") return h.map((p) => p.weightKg);
  return h.map((p) => p.skeletalMuscleKg);
}

/**
 * Place an observed series (evenly spaced samples across the member's own
 * observation window) onto the shared tenure axis, then read it at `week`.
 *
 * Returns null past the member's tenure. We do not extrapolate: a member who
 * joined nine weeks ago has no week-26 data, and inventing one would be
 * exactly the fabrication this whole surface exists to avoid. It is also why
 * the band legitimately narrows in n as it extends right.
 */
function sampleAt(series: number[], memberWeeks: number, week: number): number | null {
  if (week > memberWeeks) return null;
  if (series.length === 1) return series[0];
  if (memberWeeks === 0) return series[series.length - 1];
  const t = week / memberWeeks; // 0..1 through the observed window
  const pos = t * (series.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(series.length - 1, lo + 1);
  const frac = pos - lo;
  return series[lo] + (series[hi] - series[lo]) * frac;
}

// -----------------------------------------------------------------------------
// Population
// -----------------------------------------------------------------------------

/**
 * A cohort member. Note the absence of id, name, initials, location and
 * avatar: there is no field here that a component could accidentally render.
 */
interface CohortMember {
  profile: StartingProfile;
  weeks: number;
  /** Value at each WEEK_POINTS index, or null where the member has no data yet. */
  values: Record<CohortMetric, (number | null)[]>;
}

function buildPopulation(): CohortMember[] {
  const population: CohortMember[] = [];

  for (const member of clients) {
    const profile = profileOf(member);
    if (!profile) continue;

    const memberWeeks = tenureWeeks(member);
    const values = {} as Record<CohortMetric, (number | null)[]>;
    let any = false;

    for (const metric of COHORT_METRICS) {
      const series = observedSeries(member, metric);
      if (series) any = true;
      values[metric] = WEEK_POINTS.map((week) =>
        series ? sampleAt(series, memberWeeks, week) : null,
      );
    }
    if (!any) continue;

    population.push({ profile, weeks: memberWeeks, values });
  }

  return population;
}

const POPULATION: CohortMember[] = buildPopulation();

// -----------------------------------------------------------------------------
// Matching ladder
// -----------------------------------------------------------------------------

/**
 * Cohorts are built by widening, not by guessing.
 *
 * We start at the tightest match and loosen one axis at a time until the group
 * clears K_MIN, then STOP. Two axes are never loosened: sex and primary goal.
 * Widening across those does not produce a bigger cohort, it produces a
 * different question — "members like you" would quietly become "members".
 *
 * Whatever level we land on is reported verbatim in `criteria`, so a member can
 * always see the actual comparison group rather than a marketing description
 * of it.
 */
type LadderLevel = 0 | 1 | 2 | 3;

interface ResolvedCohort {
  key: string;
  label: string;
  criteria: string[];
  level: LadderLevel;
  members: CohortMember[];
}

/** Ladder level → which axes survived. Level 3 keeps only sex + goal. */
function matchedFor(level: LadderLevel): Cohort["matched"] {
  return {
    age: level <= 1 ? "band" : level === 2 ? "range" : "any",
    startingBodyFat: level === 0,
  };
}

const AGE_SPAN = 10; // ± years at the widened level

function matcher(profile: StartingProfile, level: LadderLevel) {
  return (m: CohortMember): boolean => {
    if (m.profile.sex !== profile.sex) return false;
    if (m.profile.goal !== profile.goal) return false;
    if (level <= 2 && Math.abs(m.profile.age - profile.age) > AGE_SPAN) return false;
    if (level <= 1 && m.profile.ageBand !== profile.ageBand) return false;
    if (level === 0 && m.profile.bfBand !== profile.bfBand) return false;
    return true;
  };
}

function criteriaFor(profile: StartingProfile, level: LadderLevel): string[] {
  const out = [SEX_LABEL[profile.sex], `Primary goal: ${profile.goal}`];
  if (level <= 1) out.push(AGE_BAND_LABEL[profile.ageBand]);
  else if (level === 2) {
    out.push(`Age ${profile.age - AGE_SPAN}–${profile.age + AGE_SPAN}`);
  } else {
    out.push("Any age");
  }
  if (level === 0 && profile.bfBand) out.push(bfBandLabel(profile.sex, profile.bfBand));
  return out;
}

function keyFor(profile: StartingProfile, level: LadderLevel): string {
  const parts = [profile.sex, profile.goal, `L${level}`];
  if (level <= 1) parts.push(profile.ageBand);
  else if (level === 2) parts.push(`a${profile.age}`);
  if (level === 0) parts.push(profile.bfBand ?? "nobf");
  return parts.join("|");
}

function labelFor(profile: StartingProfile, level: LadderLevel): string {
  const age =
    level <= 1
      ? AGE_BAND_LABEL[profile.ageBand].replace("Age ", "")
      : level === 2
        ? `${profile.age - AGE_SPAN}–${profile.age + AGE_SPAN}`
        : "all ages";
  return `${SEX_LABEL[profile.sex]}, ${age} · ${profile.goal}`;
}

/**
 * Resolve one client to the tightest cohort that clears the floor.
 *
 * Only levels the member can actually be placed at are tried: a member with no
 * baseline scan has no body-fat band, so level 0 is skipped for them rather
 * than silently matching them against everyone whose band is also undefined.
 */
function resolve(profile: StartingProfile): { cohort: ResolvedCohort | null; attempted: string[] } {
  const levels: LadderLevel[] = profile.bfBand ? [0, 1, 2, 3] : [1, 2, 3];
  let attempted: string[] = criteriaFor(profile, levels[0]);

  for (const level of levels) {
    attempted = criteriaFor(profile, level);
    const members = POPULATION.filter(matcher(profile, level));
    if (members.length >= K_MIN) {
      return {
        cohort: {
          key: keyFor(profile, level),
          label: labelFor(profile, level),
          criteria: attempted,
          level,
          members,
        },
        attempted,
      };
    }
  }
  // Widest level still under the floor. This is a real outcome, not a bug —
  // some starting profiles are genuinely rare, and those members get told so.
  return { cohort: null, attempted: criteriaFor(profile, levels[levels.length - 1]) };
}

/**
 * Registry, built eagerly. Resolution is a pure function of the pinned roster,
 * so precomputing keeps `trajectory(key, …)` addressable by key alone without
 * any mutable cache building up over a session.
 */
const REGISTRY = new Map<string, ResolvedCohort>();
const BY_CLIENT = new Map<string, { cohort: ResolvedCohort | null; attempted: string[] }>();

for (const c of clients) {
  const profile = profileOf(c);
  if (!profile) {
    BY_CLIENT.set(c.id, { cohort: null, attempted: [] });
    continue;
  }
  const resolved = resolve(profile);
  BY_CLIENT.set(c.id, resolved);
  if (resolved.cohort) REGISTRY.set(resolved.cohort.key, resolved.cohort);
}

// -----------------------------------------------------------------------------
// Statistics
// -----------------------------------------------------------------------------

/** Linear-interpolated percentile of a pre-sorted ascending array. */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function round(v: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

function valuesAt(cohort: ResolvedCohort, metric: CohortMetric, weekIndex: number): number[] {
  const out: number[] = [];
  for (const m of cohort.members) {
    const v = m.values[metric][weekIndex];
    if (v !== null) out.push(v);
  }
  return out.sort((a, b) => a - b);
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

function tooSmall(attempted: string[]): NotOk {
  return { ok: false, reason: "cohort-too-small", attempted };
}

/**
 * The cohort a member belongs to, matched on starting characteristics only.
 */
export function cohortFor(client: Client): CohortResult {
  const entry = BY_CLIENT.get(client.id);
  if (!entry) return { ok: false, reason: "no-baseline", attempted: [] };
  if (!entry.cohort) {
    // Distinguish "you told us no goal at intake" from "too few people match".
    if (entry.attempted.length === 0) return { ok: false, reason: "no-baseline", attempted: [] };
    return tooSmall(entry.attempted);
  }
  const { key, label, criteria, level, members } = entry.cohort;
  return { ok: true, key, label, size: members.length, criteria, matched: matchedFor(level) };
}

/**
 * The p25 / p50 / p75 band for one metric.
 *
 * There is no p50-only convenience overload and no single "expected" value by
 * design — the band IS the answer. Week points that fall below K_MIN are
 * dropped rather than rendered thin, and if none survive the whole call comes
 * back not-ok.
 */
export function trajectory(cohortKey: string, metric: CohortMetric): TrajectoryResult {
  const cohort = REGISTRY.get(cohortKey);
  if (!cohort) return { ok: false, reason: "unknown-cohort", attempted: [] };
  if (cohort.members.length < K_MIN) return tooSmall(cohort.criteria);

  const cfg = METRICS[metric];
  const points: TrajectoryPoint[] = [];

  for (let i = 0; i < WEEK_POINTS.length; i++) {
    const vals = valuesAt(cohort, metric, i);
    // Re-check the floor at every week point, not just for the cohort overall.
    if (vals.length < K_MIN) continue;
    points.push({
      week: WEEK_POINTS[i],
      p25: round(quantile(vals, 0.25), cfg.decimals),
      p50: round(quantile(vals, 0.5), cfg.decimals),
      p75: round(quantile(vals, 0.75), cfg.decimals),
      n: vals.length,
    });
  }

  if (points.length === 0) {
    const anyData = cohort.members.some((m) => m.values[metric].some((v) => v !== null));
    return anyData
      ? tooSmall(cohort.criteria)
      : { ok: false, reason: "no-data-for-metric", attempted: cohort.criteria };
  }
  if (points.length < MIN_WEEK_POINTS) {
    return { ok: false, reason: "not-enough-history", attempted: cohort.criteria };
  }

  return {
    ok: true,
    metric,
    label: cfg.label,
    unit: cfg.unit,
    betterDirection: cfg.betterDirection,
    points,
    n: points[0].n,
  };
}

/**
 * This member's own series, clipped to the weeks the band actually covers.
 *
 * Two gates, both learned the hard way:
 *
 *  - It defers to `trajectory()` rather than re-checking the floor itself. An
 *    earlier version checked only the cohort head-count, which let the member's
 *    line render for a metric whose band had been suppressed — a lone line on
 *    an empty chart, which is the single most projection-looking thing this
 *    surface could possibly draw.
 *
 *  - It emits nothing past the band's last week. A line that runs on beyond the
 *    shaded region reads as an extrapolation, and the member has no way to know
 *    it isn't one.
 */
export function memberSeries(
  client: Client,
  cohortKey: string,
  metric: CohortMetric,
): MemberSeriesResult {
  const band = trajectory(cohortKey, metric);
  if (!band.ok) return band;

  const cohort = REGISTRY.get(cohortKey)!;
  const series = observedSeries(client, metric);
  if (!series) return { ok: false, reason: "no-data-for-metric", attempted: cohort.criteria };

  const weeks = tenureWeeks(client);
  const cfg = METRICS[metric];
  const points: MemberPoint[] = [];
  for (const p of band.points) {
    const v = sampleAt(series, weeks, p.week);
    if (v !== null) points.push({ week: p.week, value: round(v, cfg.decimals) });
  }
  if (points.length === 0) return { ok: false, reason: "no-data-for-metric", attempted: cohort.criteria };
  return { ok: true, metric, points };
}

/**
 * Where this member currently sits relative to the band — their own line only.
 *
 * `percentile` is distributional position, not a rank or a grade. The UI is
 * responsible for phrasing it that way; see PeopleLikeYou.
 */
export function whereYouAre(
  client: Client,
  cohortKey: string,
  metric: CohortMetric,
): WhereYouAreResult {
  const band = trajectory(cohortKey, metric);
  if (!band.ok) return band;

  const cohort = REGISTRY.get(cohortKey)!;
  const series = observedSeries(client, metric);
  if (!series) return { ok: false, reason: "no-data-for-metric", attempted: cohort.criteria };

  const weeks = tenureWeeks(client);
  const cfg = METRICS[metric];

  // Latest week point the member has reached that also survived the floor.
  for (let i = WEEK_POINTS.length - 1; i >= 0; i--) {
    const week = WEEK_POINTS[i];
    if (week > weeks) continue;
    const vals = valuesAt(cohort, metric, i);
    if (vals.length < K_MIN) continue;

    const value = sampleAt(series, weeks, week);
    if (value === null) continue;

    const below = vals.filter((v) => v <= value).length;
    const percentile = Math.round((below / vals.length) * 100);
    const p25 = quantile(vals, 0.25);
    const p75 = quantile(vals, 0.75);

    return {
      ok: true,
      metric,
      week,
      value: round(value, cfg.decimals),
      percentile,
      inBand: value >= p25 && value <= p75,
    };
  }

  return tooSmall(cohort.criteria);
}

/**
 * Convenience for the chart: the member's calendar date at a cohort week.
 * The band is drawn against the member's own timeline so "week 12" reads as a
 * date they recognise rather than an abstract index.
 */
export function memberWeekDate(client: Client, week: number): string {
  return dateAtWeek(client.joinedOn, week);
}

/** Tenure, exported so the UI can say "you are 14 weeks in" without recomputing. */
export function weeksIn(client: Client): number {
  return tenureWeeks(client);
}

/** Lookup helper so callers holding only an id don't reach into lib/mock directly. */
export function cohortForClientId(clientId: string): CohortResult {
  const c = getClient(clientId);
  if (!c) return { ok: false, reason: "no-baseline", attempted: [] };
  return cohortFor(c);
}
