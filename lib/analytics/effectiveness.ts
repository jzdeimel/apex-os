import type { Biomarker, Client } from "@/lib/types";
import { clients } from "@/lib/mock/clients";
import { getLabsForClient } from "@/lib/mock/labs";

/**
 * PROTOCOL EFFECTIVENESS BY COHORT — what actually moved, in this population.
 *
 * =============================================================================
 * READ THIS BEFORE READING ANY NUMBER THIS MODULE PRODUCES
 * =============================================================================
 * This is an OBSERVATIONAL ANALYSIS OF ROUTINE CARE. It is not a trial. There
 * is no randomisation, no control arm, no blinding, and no pre-registered
 * endpoint. It cannot establish that a protocol caused a change, and no output
 * of this module may be presented as if it could.
 *
 * That constraint is enforced here rather than left to the page, because the
 * failure mode is specific and it is severe: a clinic reads "median A1C −0.4 on
 * Metabolic Reset", concludes Metabolic Reset lowers A1C, and starts selling
 * that claim. It would be a marketing claim about a health outcome derived from
 * a dashboard, made by an organisation that owns the dashboard. So:
 *
 *   - every result carries its `n` and is suppressed below `MIN_COHORT_N`
 *   - the confidence qualifier tops out at "moderate" and can never read
 *     "significant", "proven", "effective" or "works"
 *   - `CONFOUNDERS` is not documentation, it is a required render — see
 *     `EffectivenessReport.confounders`, which every consumer must display
 *   - the language helpers below emit "observed alongside", never "caused by"
 *
 * =============================================================================
 * THE FOUR CONFOUNDERS THAT ACTUALLY BITE HERE
 * =============================================================================
 *  1. CO-INTERVENTION. Nobody at Alpha Health is on a protocol and nothing
 *     else. They are simultaneously being coached on nutrition, training and
 *     sleep, and they are paying enough per month to be motivated. Both effects
 *     are inside every number below and this analysis cannot separate them.
 *  2. SELECTION ON BASELINE. Members are started on a protocol *because* a
 *     marker was off-target. Markers selected for being extreme move back
 *     toward the middle on retest with no intervention at all — regression to
 *     the mean produces exactly the shape of result this page renders.
 *  3. SURVIVORSHIP. Only members who came back for a second panel appear. A
 *     member who felt worse and disengaged has no follow-up draw, so they are
 *     absent from the cohort that reports how the protocol went.
 *  4. INDICATION. Cohorts are not comparable to each other. The people on
 *     GLP Weight Management are metabolically different from the people on
 *     Recovery Track, so a cross-protocol ranking of "which works best" is a
 *     comparison of populations, not of protocols.
 *
 * =============================================================================
 * WHAT IT IS GOOD FOR
 * =============================================================================
 * Generating hypotheses, sizing them, and finding the ones worth designing a
 * real study around. Alpha Health has serial biomarker data on a few hundred
 * members across five sites and nobody in this category is looking at it. That
 * is genuinely valuable — as a research input, not as evidence.
 */

/** Pinned clock. */
const NOW = new Date("2026-06-12T09:00:00");
const DAY_MS = 86_400_000;

/**
 * Minimum cohort before a result renders at all.
 *
 * Fifteen is a floor, not a threshold of validity — nothing here becomes valid
 * at sixteen. It exists so a two-person cohort cannot produce a headline. Below
 * it the cell reports the count and nothing else, deliberately: hiding the
 * cohort entirely would let a reader assume it was never run.
 */
export const MIN_COHORT_N = 15;

/**
 * Below this many days between the two draws the pair is too close together to
 * interpret, and it is dropped.
 *
 * Four weeks, which is the shortest interval at which any of these markers
 * would be rechecked in routine care. Shorter pairs are dominated by
 * day-to-day assay and biological variation rather than by anything that
 * happened in between.
 */
export const MIN_OBSERVATION_DAYS = 28;

/**
 * Markers examined per protocol.
 *
 * This is a MEASUREMENT choice — which markers we look at when a member is on
 * this protocol — not a clinical assertion that the protocol acts on them. The
 * selections follow the marker categories the protocol's own care category
 * already concerns itself with. Direction of benefit is never invented here: it
 * is read from each biomarker's own `optimalLow`/`optimalHigh` window as
 * supplied by the panel definition.
 */
const PROTOCOL_MARKERS: Record<string, string[]> = {
  "Metabolic Reset": ["a1c", "glucose", "insulin", "trig", "hscrp"],
  "GLP Weight Management": ["a1c", "glucose", "insulin", "trig", "ldl", "apob"],
  "Recovery Track": ["hscrp", "crp", "ferritin", "igf1"],
  "Hormone Optimization": ["total_t", "free_t", "shbg", "estradiol", "hct"],
  "NAD+ Vitality": ["b12", "vitd", "ferritin", "hscrp"],
  "Aesthetics & Vitality": ["ferritin", "vitd", "igf1", "tsh"],
};

export const PROTOCOL_NAMES: string[] = Object.keys(PROTOCOL_MARKERS);

export interface MarkerChange {
  clientId: string;
  markerKey: string;
  markerName: string;
  unit: string;
  baselineValue: number;
  latestValue: number;
  /** latest − baseline, in the marker's own unit. */
  delta: number;
  /** Percent of baseline. Undefined when baseline is zero. */
  deltaPercent?: number;
  /** Days between the baseline draw and the latest draw. */
  observationDays: number;
  /**
   * Distance to the optimal window, before and after. Falling distance means
   * the marker moved toward target; zero means it is inside the window.
   */
  distanceBefore: number;
  distanceAfter: number;
  movedTowardTarget: boolean;
}

/** Distance from a value to the nearest edge of its optimal window. 0 = inside. */
function distanceToOptimal(value: number, b: Biomarker): number {
  const lo = b.optimalLow ?? b.refLow;
  const hi = b.optimalHigh ?? b.refHigh;
  if (value < lo) return lo - value;
  if (value > hi) return value - hi;
  return 0;
}

/**
 * The member's baseline for a protocol is the last panel BEFORE the protocol
 * started — not the earliest panel on file.
 *
 * This distinction is the difference between an analysis and a coincidence. A
 * member who has been improving for a year and started a protocol last month
 * would, measured from their earliest draw, appear to have gained a year of
 * improvement from four weeks of protocol. Measuring from the point of exposure
 * is the minimum any observational read has to do to be worth running.
 */
function baselineFor(
  series: { date: string; value: number }[],
  startedOn: string,
): { date: string; value: number } | undefined {
  const prior = series.filter((h) => h.date <= startedOn);
  // No pre-exposure draw at all — this member cannot contribute a change for
  // this marker. Falling back to the first point would be silently wrong.
  if (prior.length === 0) return undefined;
  return prior[prior.length - 1];
}

/**
 * Serial history, sorted by draw date.
 *
 * `lib/mock/labs.ts` builds `history` as four fixed calendar points with the
 * current panel's `resultedOn` appended last — and `resultedOn` is the member's
 * own latest lab date, which for a good share of the book falls BEFORE those
 * fixed points. The array is therefore not in date order, and treating the last
 * element as "the latest draw" silently pairs a member's oldest value with a
 * newer one and reports the difference as a change. Sorting is not a nicety
 * here, it is the difference between a change and a sign error.
 */
function orderedHistory(b: Biomarker): { date: string; value: number }[] {
  return [...(b.history ?? [])].sort((x, y) => x.date.localeCompare(y.date));
}

function changesFor(
  client: Client,
  markerKeys: string[],
  startedOn: string,
): MarkerChange[] {
  const lab = getLabsForClient(client.id);
  if (!lab) return [];

  const out: MarkerChange[] = [];
  for (const key of markerKeys) {
    const b = lab.biomarkers.find((x) => x.key === key);
    // No serial history means no change to measure. In this dataset serial
    // history exists only for markers that were off-target — see confounder 2,
    // which this is the mechanism of.
    if (!b || !b.history || b.history.length < 2) continue;

    const series = orderedHistory(b);
    const base = baselineFor(series, startedOn);
    if (!base) continue;

    const last = series[series.length - 1];
    const observationDays = Math.round(
      (new Date(last.date).getTime() - new Date(base.date).getTime()) / DAY_MS,
    );
    if (observationDays < MIN_OBSERVATION_DAYS) continue;

    const distanceBefore = distanceToOptimal(base.value, b);
    const distanceAfter = distanceToOptimal(last.value, b);

    out.push({
      clientId: client.id,
      markerKey: key,
      markerName: b.name,
      unit: b.unit,
      baselineValue: base.value,
      latestValue: last.value,
      delta: last.value - base.value,
      deltaPercent: base.value === 0 ? undefined : ((last.value - base.value) / base.value) * 100,
      observationDays,
      distanceBefore,
      distanceAfter,
      movedTowardTarget: distanceAfter < distanceBefore,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Confidence qualifiers.
 *
 * The ceiling is "moderate" and that is a deliberate design constraint, not an
 * oversight. There is no evidence grade an uncontrolled retrospective chart
 * review of a self-selected paying population can earn that would justify a
 * stronger word on a screen a salesperson can screenshot.
 */
export type Confidence = "insufficient" | "weak" | "moderate";

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  insufficient: "Not reportable",
  weak: "Weak signal",
  moderate: "Consistent signal",
};

export const CONFIDENCE_NOTE: Record<Confidence, string> = {
  insufficient: `Fewer than ${MIN_COHORT_N} members with a pre-protocol and a follow-up panel. No estimate is shown.`,
  weak: "Direction is not consistent across the cohort — the middle 50% of members spans zero change. Treat as noise until the cohort grows.",
  moderate:
    "Direction is consistent across the middle 50% of the cohort. Still observational: consistency is not causation, and the confounders below apply in full.",
};

export interface MarkerResult {
  markerKey: string;
  markerName: string;
  unit: string;
  /** Members contributing a paired baseline/follow-up value for this marker. */
  n: number;
  medianDelta: number;
  medianDeltaPercent: number;
  /** Interquartile range of the change, so spread is visible next to the median. */
  q1Delta: number;
  q3Delta: number;
  /** Median days between the two draws. "Time to change" is bounded by this. */
  medianObservationDays: number;
  /** Members whose marker moved closer to its optimal window. */
  towardTarget: number;
  towardTargetShare: number;
  confidence: Confidence;
  /** True when `n` clears `MIN_COHORT_N`. Everything else is presentational. */
  reportable: boolean;
  /**
   * Same marker, over members on NO protocol in the same period.
   *
   * A comparison group, emphatically NOT a control group: they were not
   * randomised, and they are on no protocol precisely because a clinician
   * judged they did not need one. It is here because a change that shows up
   * just as strongly in the unexposed group is the single fastest way to catch
   * yourself reading regression to the mean as an effect.
   */
  comparison?: { n: number; medianDelta: number; reportable: boolean };
}

export interface ProtocolResult {
  protocol: string;
  /** Members on this protocol, before any paired-panel requirement. */
  cohortSize: number;
  /** Members contributing at least one paired marker. */
  analysedSize: number;
  medianDaysOnProtocol: number;
  markers: MarkerResult[];
  /** True when nothing in this protocol cleared the floor. */
  suppressed: boolean;
}

function summarise(
  markerKey: string,
  markerName: string,
  unit: string,
  rows: MarkerChange[],
  comparisonRows: MarkerChange[],
): MarkerResult {
  const deltas = rows.map((r) => r.delta).sort((a, b) => a - b);
  const pct = rows
    .map((r) => r.deltaPercent)
    .filter((v): v is number => v !== undefined)
    .sort((a, b) => a - b);
  const days = rows.map((r) => r.observationDays).sort((a, b) => a - b);

  const q1 = quantile(deltas, 0.25);
  const q3 = quantile(deltas, 0.75);
  const n = rows.length;
  const toward = rows.filter((r) => r.movedTowardTarget).length;

  let confidence: Confidence;
  if (n < MIN_COHORT_N) confidence = "insufficient";
  // The IQR straddling zero means half the cohort moved the other way. That is
  // not a small effect, it is an absent one, and it must not read as a result.
  else if (q1 <= 0 && q3 >= 0) confidence = "weak";
  else confidence = "moderate";

  const compDeltas = comparisonRows.map((r) => r.delta).sort((a, b) => a - b);

  return {
    markerKey,
    markerName,
    unit,
    n,
    medianDelta: median(deltas),
    medianDeltaPercent: median(pct),
    q1Delta: q1,
    q3Delta: q3,
    medianObservationDays: Math.round(median(days)),
    towardTarget: toward,
    towardTargetShare: n === 0 ? 0 : toward / n,
    confidence,
    reportable: n >= MIN_COHORT_N,
    comparison: {
      n: comparisonRows.length,
      medianDelta: median(compDeltas),
      reportable: comparisonRows.length >= MIN_COHORT_N,
    },
  };
}

/** Members with no program at all — the comparison group. See `MarkerResult.comparison`. */
const UNEXPOSED: Client[] = clients.filter((c) => c.programs.length === 0);

/**
 * Comparison-group changes are measured over the same calendar window as the
 * protocol cohort's median exposure, anchored on the same history series, so
 * the two groups are at least looking at the same stretch of time.
 */
function comparisonChanges(markerKeys: string[], windowStart: string): MarkerChange[] {
  const out: MarkerChange[] = [];
  for (const c of UNEXPOSED) {
    out.push(...changesFor(c, markerKeys, windowStart));
  }
  return out;
}

function analyseProtocol(protocol: string): ProtocolResult {
  const markerKeys = PROTOCOL_MARKERS[protocol] ?? [];
  const cohort = clients.filter((c) =>
    c.programs.some((p) => p.name === protocol && p.status !== "Completed"),
  );

  const perClient = cohort.map((c) => {
    const program = c.programs.find((p) => p.name === protocol)!;
    return { client: c, startedOn: program.startedOn, changes: changesFor(c, markerKeys, program.startedOn) };
  });

  const daysOn = cohort
    .map((c) => {
      const program = c.programs.find((p) => p.name === protocol)!;
      return Math.round((NOW.getTime() - new Date(program.startedOn).getTime()) / DAY_MS);
    })
    .sort((a, b) => a - b);

  // The comparison window is anchored at the cohort's median start date, so the
  // unexposed group is measured across a comparable stretch of calendar time
  // rather than across their entire history.
  const startDates = cohort
    .map((c) => c.programs.find((p) => p.name === protocol)!.startedOn)
    .sort();
  const windowStart = startDates[Math.floor(startDates.length / 2)] ?? "2026-01-15";
  const compAll = comparisonChanges(markerKeys, windowStart);

  const all = perClient.flatMap((p) => p.changes);

  const markers = markerKeys
    .map((key) => {
      const rows = all.filter((r) => r.markerKey === key);
      const sample = rows[0] ?? compAll.find((r) => r.markerKey === key);
      if (!sample) return null;
      return summarise(
        key,
        sample.markerName,
        sample.unit,
        rows,
        compAll.filter((r) => r.markerKey === key),
      );
    })
    .filter((m): m is MarkerResult => m !== null)
    // Reportable first, then by cohort size. Never by effect size — sorting by
    // effect size puts the noisiest small cohort at the top of the page.
    .sort((a, b) => Number(b.reportable) - Number(a.reportable) || b.n - a.n);

  return {
    protocol,
    cohortSize: cohort.length,
    analysedSize: perClient.filter((p) => p.changes.length > 0).length,
    medianDaysOnProtocol: Math.round(median(daysOn)),
    markers,
    suppressed: markers.every((m) => !m.reportable),
  };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export interface Confounder {
  id: string;
  title: string;
  detail: string;
}

/**
 * Rendered on screen, always, not collapsed behind a disclosure.
 *
 * A caveat behind a "learn more" is a caveat that does not exist. These are
 * short enough to read and specific enough to change what a reader concludes,
 * which is the only test that matters.
 */
export const CONFOUNDERS: Confounder[] = [
  {
    id: "co-intervention",
    title: "Everyone here is also being coached",
    detail:
      "No member is on a protocol and nothing else. Nutrition coaching, training programming, sleep work and the motivation of paying a monthly fee are all present in every number on this page. This analysis cannot separate the protocol from the coaching, and neither can you by looking at it harder.",
  },
  {
    id: "selection",
    title: "Members start a protocol because a marker was already off-target",
    detail:
      "Values selected for being extreme move back toward the middle on retest even with no intervention. Regression to the mean produces the same shape of result you are looking at. The comparison column exists to make that visible — where the unexposed group moves as much, assume that is what you are seeing.",
  },
  {
    id: "survivorship",
    title: "Only members who came back are counted",
    detail:
      "A member needs a pre-protocol panel and a follow-up panel to appear. Anyone who felt worse, disengaged and never returned for the second draw is absent — and they are exactly the members whose result would pull the median the other way.",
  },
  {
    id: "indication",
    title: "Cohorts are not comparable to each other",
    detail:
      "The people on GLP Weight Management are metabolically different from the people on Recovery Track before either protocol starts. Ranking protocols against each other on this page compares populations, not protocols.",
  },
  {
    id: "no-adherence",
    title: "Adherence is not measured",
    detail:
      "Being on a protocol in the record is not the same as taking it. There is no fill, injection or dose-confirmation data behind these cohorts, so the exposure itself is assumed rather than observed.",
  },
];

export interface EffectivenessReport {
  protocols: ProtocolResult[];
  /** Must be rendered by every consumer. Not optional, not collapsible. */
  confounders: Confounder[];
  minCohortN: number;
  minObservationDays: number;
  /** Members in the book of business at the time of the analysis. */
  populationSize: number;
  comparisonGroupSize: number;
  /** One sentence, rendered above the first number on the page. */
  methodStatement: string;
}

export function buildEffectivenessReport(): EffectivenessReport {
  return {
    protocols: PROTOCOL_NAMES.map(analyseProtocol).sort(
      (a, b) => Number(a.suppressed) - Number(b.suppressed) || b.cohortSize - a.cohortSize,
    ),
    confounders: CONFOUNDERS,
    minCohortN: MIN_COHORT_N,
    minObservationDays: MIN_OBSERVATION_DAYS,
    populationSize: clients.length,
    comparisonGroupSize: UNEXPOSED.length,
    methodStatement:
      "Retrospective, uncontrolled review of routine care. Paired biomarker values, baseline taken from the last panel before the protocol started. Not a trial; no randomisation, no control arm, no blinding. Nothing here establishes that a protocol caused a change.",
  };
}

/**
 * Sentence generator for a marker result.
 *
 * Every consumer goes through this rather than composing its own copy, because
 * this is the exact point where "associated with" turns into "improves" — one
 * component at a time, by someone writing a label at 6pm. Centralising it means
 * the causal-language ban is enforced in one function instead of audited across
 * a dozen JSX files.
 */
export function observationSentence(protocol: string, m: MarkerResult): string {
  if (!m.reportable) {
    return `${m.markerName}: ${m.n} member${m.n === 1 ? "" : "s"} with paired panels — below the reporting floor of ${MIN_COHORT_N}. No estimate shown.`;
  }
  const dir = m.medianDelta === 0 ? "no median change" : m.medianDelta > 0 ? "higher" : "lower";
  const mag = Math.abs(m.medianDelta);
  const share = Math.round(m.towardTargetShare * 100);
  return `Among ${m.n} members on ${protocol} with paired panels, median ${m.markerName} was ${mag.toFixed(mag < 10 ? 1 : 0)} ${m.unit} ${dir} over a median of ${m.medianObservationDays} days; ${share}% moved toward the optimal window. Observed alongside the protocol — not attributed to it.`;
}

/** Direction glyph without a value judgement attached. */
export function deltaTone(m: MarkerResult): "optimal" | "watch" | "neutral" {
  if (!m.reportable || m.confidence === "weak") return "neutral";
  return m.towardTargetShare >= 0.6 ? "optimal" : "watch";
}
