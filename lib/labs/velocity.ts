import type { Biomarker } from "@/lib/types";
import { getLabsForClient } from "@/lib/mock/labs";
import { absolute, formatDate } from "@/lib/utils";
import { addDays, dayOf, daysBetween } from "@/lib/subscriptions/engine";

/**
 * LAB VELOCITY AND PROJECTION — how fast a marker is moving, and the honest
 * width of what happens next.
 *
 * A single lab value answers "where is this member now". Almost every clinical
 * decision worth making turns on the other question: which way is it going, and
 * how long before it matters. The audited system charted the points and left
 * the slope to eyeballing, which works fine until the marker is haematocrit,
 * the visits are ninety days apart, and the drift only becomes obvious on the
 * draw where it has already crossed.
 *
 * ── WHY THE BAND WIDENS, AND WHY THAT IS THE FEATURE ────────────────────────
 * The temptation with a projection is a clean dotted line. A clean line says
 * "this is where you will be", and from four blood draws that is a lie with a
 * date attached. What we can honestly say is narrow near the data and wide far
 * from it, so the interval here is a genuine OLS PREDICTION interval:
 *
 *     ŷ ± t(n−2, .975) · s · √(1 + 1/n + (x₀ − x̄)² / Sxx)
 *
 * The (x₀ − x̄)² term is what makes it flare as the projection travels — that
 * is not a stylistic choice, it falls out of the mathematics. With four points
 * the band a year out is embarrassingly wide, and the UI renders it that way on
 * purpose: a provider who sees how wide it really is will order the confirming
 * draw, which is the correct outcome.
 *
 * ── WHAT THIS MODULE REFUSES TO DO ──────────────────────────────────────────
 *  - It will not project from fewer than `MIN_POINTS` results. Two points
 *    define a line with zero residual and no way to express uncertainty; a
 *    projection from them looks more certain than a projection from twenty. The
 *    function returns `ok: false` with a reason, and the UI says so.
 *  - It will not report a crossing date when the slope is statistically
 *    indistinguishable from flat. "Rising 0.02/quarter, crosses in 2041" is
 *    noise wearing a date.
 *  - It emits no thresholds of its own. Every ceiling and floor used here comes
 *    off the member's own `Biomarker.refHigh` / `refLow` — the lab's reference
 *    range, travelling with the result that produced it.
 *  - It makes no clinical claim about what a crossing means. It says when the
 *    line meets the lab's own band, and stops.
 *
 * ── DETERMINISM ─────────────────────────────────────────────────────────────
 * Pure arithmetic over pinned dates. No `Date.now()`, no `Math.random()`, and
 * every date parsed through `absolute()` — this renders on the server and in
 * the browser and the two must agree exactly.
 */

/** Pinned clock. Matches NOW in lib/trace/ledger.ts. */
export const NOW = "2026-06-12T09:00:00";

/**
 * Fewest results before a projection is allowed.
 *
 * Three, because n − 2 is the residual degrees of freedom and three is the
 * smallest n that leaves any. It is a low bar and the interval at n = 3 is
 * enormous — t(1, .975) is 12.71 — which is exactly the point. The bar exists
 * to make projection possible; the width is what makes it honest.
 */
export const MIN_POINTS = 3;

/** How far forward a projection runs. Beyond a year, extrapolation is theatre. */
export const HORIZON_DAYS = 365;

/** The reporting period velocity is expressed in. One quarter, in days. */
export const QUARTER_DAYS = 91;

/**
 * Two-sided 95% t critical values by degrees of freedom.
 *
 * A statistical table, not a clinical constant — these are the same numbers in
 * any textbook. Inlined rather than approximated because the small-df values
 * (12.71 at df = 1) are precisely where an approximation would understate the
 * uncertainty, which is the one direction this module must never err in.
 */
const T_95: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365,
  8: 2.306, 9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.16, 14: 2.145,
  15: 2.131, 16: 2.12, 17: 2.11, 18: 2.101, 19: 2.093, 20: 2.086, 21: 2.08,
  22: 2.074, 23: 2.069, 24: 2.064, 25: 2.06, 26: 2.056, 27: 2.052, 28: 2.048,
  29: 2.045, 30: 2.042,
};

/** Beyond df = 30 the t distribution is within a whisker of normal. */
function tCritical(df: number): number {
  if (df <= 0) return Number.POSITIVE_INFINITY;
  return T_95[df] ?? 1.96;
}

export interface VelocityPoint {
  /** YYYY-MM-DD. */
  date: string;
  /** The observed result. Absent on projected rows. */
  value?: number;
  /** The fitted / projected central estimate. */
  fit: number;
  /** Prediction interval bounds. Equal to `fit` is impossible — see header. */
  lo: number;
  hi: number;
  projected: boolean;
}

export type VelocityRefusal =
  | "no-panel"
  | "marker-not-on-panel"
  | "too-few-points"
  | "no-time-span";

export interface VelocityRefused {
  ok: false;
  reason: VelocityRefusal;
  /** Rendered verbatim. The refusal is the product, so it explains itself. */
  message: string;
  clientId: string;
  markerKey: string;
  markerName?: string;
  /** How many results were available, so the UI can say "1 of 3". */
  points: number;
}

export interface VelocityResult {
  ok: true;
  clientId: string;
  markerKey: string;
  markerName: string;
  unit: string;
  /** Observed results used for the fit, oldest first. */
  observed: { date: string; value: number }[];
  points: number;
  /** Span of the observed series, in days. */
  spanDays: number;

  /** Change per day. Signed. */
  slopePerDay: number;
  /** Change per quarter — the number the UI actually says out loud. */
  slopePerQuarter: number;
  /** 95% confidence interval on the per-quarter slope. */
  slopeCiPerQuarter: [number, number];
  /**
   * True when the slope's confidence interval excludes zero — i.e. the trend is
   * distinguishable from noise at this sample size. When false, NO crossing
   * date is reported however tidy the line looks.
   */
  trendIsSignificant: boolean;

  /** Residual standard error of the fit, in marker units. */
  residualSe: number;
  /** Degrees of freedom, n − 2. Reported because it drives the band width. */
  df: number;

  refLow: number;
  refHigh: number;
  optimalLow?: number;
  optimalHigh?: number;

  /** Observed points followed by the projection, ready to chart. */
  series: VelocityPoint[];

  crossing?: Crossing;
  /** "Rising 0.8 %/quarter" — the headline, already worded. */
  headline: string;
  /** The caveat that must travel with the headline. Never optional. */
  caveat: string;
}

export interface Crossing {
  /** Which edge of the lab's reference band the line meets. */
  edge: "ceiling" | "floor";
  boundary: number;
  /** Central estimate. Undefined when the central line does not cross in the horizon. */
  on?: string;
  /** Earliest and latest crossing implied by the prediction band. */
  earliest?: string;
  latest?: string;
  /** True when the marker is already outside the band today. */
  alreadyOutside: boolean;
  /** The sentence, ready to render. */
  line: string;
}

export type Velocity = VelocityResult | VelocityRefused;

// ---------------------------------------------------------------------------
// Series assembly
// ---------------------------------------------------------------------------

/**
 * The full result series for a marker, oldest first.
 *
 * `Biomarker.history` already ends at the current value on the current panel
 * date, so the current reading is not appended again — doing so would duplicate
 * the most recent point, which drags the fit toward it and quietly narrows the
 * band around the newest observation. Where there is no history array the
 * marker has exactly one result and the caller gets a refusal, which is correct.
 */
function seriesFor(b: Biomarker, collectedOn: string): { date: string; value: number }[] {
  const raw = b.history?.length ? b.history : [{ date: collectedOn, value: b.value }];
  const seen = new Map<string, number>();
  for (const p of raw) seen.set(dayOf(p.date), p.value);
  return [...seen.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b2) => absolute(`${a.date}T12:00:00`).getTime() - absolute(`${b2.date}T12:00:00`).getTime());
}

// ---------------------------------------------------------------------------
// The fit
// ---------------------------------------------------------------------------

/**
 * Velocity and projection for one marker on one member's panel.
 *
 * Ordinary least squares on days-since-first-draw. OLS and not something
 * cleverer on purpose: with four to six points, a spline or a weighted fit
 * buys nothing but the appearance of sophistication, and the failure mode of a
 * flexible model on sparse data is that it fits the noise and reports a
 * confident wrong slope.
 */
export function markerVelocity(
  clientId: string,
  markerKey: string,
  nowIso: string = NOW,
): Velocity {
  const labs = getLabsForClient(clientId);
  if (!labs) {
    return {
      ok: false,
      reason: "no-panel",
      message: "No lab panel on file for this member, so there is nothing to trend.",
      clientId,
      markerKey,
      points: 0,
    };
  }

  const b = labs.biomarkers.find((m) => m.key === markerKey);
  if (!b) {
    return {
      ok: false,
      reason: "marker-not-on-panel",
      message: `${markerKey} is not on this member's panel. It has never been drawn here, which is a different thing from being normal.`,
      clientId,
      markerKey,
      points: 0,
    };
  }

  const observed = seriesFor(b, labs.collectedOn);
  const n = observed.length;

  if (n < MIN_POINTS) {
    return {
      ok: false,
      reason: "too-few-points",
      message:
        n === 1
          ? `Only one ${b.name} result on file. A single point has no direction — Apex will not draw a trend through it. ${MIN_POINTS} results are needed before a projection is offered.`
          : `${n} ${b.name} results on file. Two points always fit a line perfectly, which leaves no way to express how uncertain that line is, so no projection is offered below ${MIN_POINTS} results.`,
      clientId,
      markerKey,
      markerName: b.name,
      points: n,
    };
  }

  const first = observed[0].date;
  const xs = observed.map((p) => daysBetween(first, p.date));
  const ys = observed.map((p) => p.value);
  const spanDays = xs[xs.length - 1];

  if (spanDays <= 0) {
    return {
      ok: false,
      reason: "no-time-span",
      message: `All ${n} ${b.name} results carry the same date, so there is no elapsed time to compute a rate against.`,
      clientId,
      markerKey,
      markerName: b.name,
      points: n,
    };
  }

  const xbar = xs.reduce((s, v) => s + v, 0) / n;
  const ybar = ys.reduce((s, v) => s + v, 0) / n;
  const sxx = xs.reduce((s, v) => s + (v - xbar) ** 2, 0);
  const sxy = xs.reduce((s, v, i) => s + (v - xbar) * (ys[i] - ybar), 0);

  const slope = sxy / sxx;
  const intercept = ybar - slope * xbar;
  const df = n - 2;
  const sse = ys.reduce((s, y, i) => s + (y - (intercept + slope * xs[i])) ** 2, 0);
  const residualSe = Math.sqrt(sse / df);
  const t = tCritical(df);

  const slopeSe = residualSe / Math.sqrt(sxx);
  const slopeCi: [number, number] = [slope - t * slopeSe, slope + t * slopeSe];
  // Significant iff the interval does not straddle zero. With n = 5 and a
  // t of 3.18 this is a demanding test, and it is meant to be — the cost of a
  // spurious crossing date is a member called in for a draw they did not need
  // and, worse, a provider who stops believing the projections.
  const trendIsSignificant = slopeCi[0] > 0 || slopeCi[1] < 0;

  const fitAt = (x: number) => intercept + slope * x;
  const halfWidthAt = (x: number) =>
    t * residualSe * Math.sqrt(1 + 1 / n + (x - xbar) ** 2 / sxx);

  // --- Series ------------------------------------------------------------
  const series: VelocityPoint[] = observed.map((p, i) => ({
    date: p.date,
    value: p.value,
    fit: round(fitAt(xs[i])),
    lo: round(fitAt(xs[i]) - halfWidthAt(xs[i])),
    hi: round(fitAt(xs[i]) + halfWidthAt(xs[i])),
    projected: false,
  }));

  // Monthly projected points. Thirteen of them at 28 days is just over the
  // horizon and keeps the flare readable without a point per day.
  const lastX = xs[xs.length - 1];
  const nowX = daysBetween(first, dayOf(nowIso));
  const startX = Math.max(lastX, nowX);
  for (let d = 28; d <= HORIZON_DAYS; d += 28) {
    const x = startX + d;
    series.push({
      date: addDays(first, x),
      fit: round(fitAt(x)),
      lo: round(fitAt(x) - halfWidthAt(x)),
      hi: round(fitAt(x) + halfWidthAt(x)),
      projected: true,
    });
  }

  const slopePerQuarter = slope * QUARTER_DAYS;
  const optimalLow = b.optimalLow;
  const optimalHigh = b.optimalHigh;

  const crossing = trendIsSignificant
    ? crossingFor(b, slope, fitAt, halfWidthAt, first, nowIso)
    : undefined;

  return {
    ok: true,
    clientId,
    markerKey,
    markerName: b.name,
    unit: b.unit,
    observed,
    points: n,
    spanDays,
    slopePerDay: slope,
    slopePerQuarter,
    slopeCiPerQuarter: [slopeCi[0] * QUARTER_DAYS, slopeCi[1] * QUARTER_DAYS],
    trendIsSignificant,
    residualSe,
    df,
    refLow: b.refLow,
    refHigh: b.refHigh,
    ...(optimalLow !== undefined ? { optimalLow } : {}),
    ...(optimalHigh !== undefined ? { optimalHigh } : {}),
    series,
    ...(crossing ? { crossing } : {}),
    headline: headlineFor(b, slopePerQuarter, trendIsSignificant),
    caveat: caveatFor(n, df, residualSe, b.unit, trendIsSignificant),
  };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * When the fitted line meets the lab's own reference band.
 *
 * Solved analytically for the central line, and by scan for the band edges —
 * the band is not linear in x, so there is no closed form for where its edge
 * meets the boundary, and a day-by-day scan over a 365-day horizon is 365
 * multiplications. Precision here is a day; cleverness would buy nothing.
 */
function crossingFor(
  b: Biomarker,
  slope: number,
  fitAt: (x: number) => number,
  halfWidthAt: (x: number) => number,
  firstDate: string,
  nowIso: string,
): Crossing | undefined {
  const rising = slope > 0;
  const edge: "ceiling" | "floor" = rising ? "ceiling" : "floor";
  const boundary = rising ? b.refHigh : b.refLow;

  const nowX = daysBetween(firstDate, dayOf(nowIso));
  const alreadyOutside = rising ? b.value > boundary : b.value < boundary;

  if (alreadyOutside) {
    return {
      edge,
      boundary,
      alreadyOutside: true,
      line: `Already ${rising ? "above" : "below"} the lab's reference ${edge} of ${boundary} ${b.unit} and still moving ${rising ? "up" : "down"}. There is no crossing date to give — it has crossed.`,
    };
  }

  // Central estimate: solve intercept + slope·x = boundary.
  const centralX = solve(fitAt, boundary, nowX, nowX + HORIZON_DAYS);

  // Band edges. For a rising marker the UPPER edge reaches the ceiling first,
  // so it is the earliest date the data can support; the lower edge is the
  // latest. Reversed for a falling marker meeting the floor.
  const upper = (x: number) => fitAt(x) + halfWidthAt(x);
  const lower = (x: number) => fitAt(x) - halfWidthAt(x);
  const earliestX = solve(rising ? upper : lower, boundary, nowX, nowX + HORIZON_DAYS);
  const latestX = solve(rising ? lower : upper, boundary, nowX, nowX + HORIZON_DAYS);

  const on = centralX === undefined ? undefined : addDays(firstDate, centralX);
  const earliest = earliestX === undefined ? undefined : addDays(firstDate, earliestX);
  const latest = latestX === undefined ? undefined : addDays(firstDate, latestX);

  if (!on && !earliest) {
    return {
      edge,
      boundary,
      alreadyOutside: false,
      line: `On this trend the reference ${edge} of ${boundary} ${b.unit} is not reached within the next ${Math.round(HORIZON_DAYS / 30)} months. Apex does not project further out than that.`,
    };
  }

  const range =
    earliest && latest
      ? ` The prediction band puts it anywhere between ${formatDate(`${earliest}T12:00:00`)} and ${formatDate(`${latest}T12:00:00`)}.`
      : earliest
        ? ` The band's early edge reaches it by ${formatDate(`${earliest}T12:00:00`)}; the late edge does not reach it inside the projection window.`
        : "";

  return {
    edge,
    boundary,
    ...(on ? { on } : {}),
    ...(earliest ? { earliest } : {}),
    ...(latest ? { latest } : {}),
    alreadyOutside: false,
    line: on
      ? `Crosses the lab's reference ${edge} of ${boundary} ${b.unit} around ${formatDate(`${on}T12:00:00`)}.${range}`
      : `The central estimate does not reach the reference ${edge} of ${boundary} ${b.unit} inside the projection window, but the band does.${range}`,
  };
}

/** First integer day in [lo, hi] at which `f` reaches `boundary`. */
function solve(
  f: (x: number) => number,
  boundary: number,
  lo: number,
  hi: number,
): number | undefined {
  const startsBelow = f(lo) < boundary;
  for (let x = lo; x <= hi; x++) {
    const v = f(x);
    if (startsBelow ? v >= boundary : v <= boundary) return x;
  }
  return undefined;
}

function headlineFor(b: Biomarker, perQuarter: number, significant: boolean): string {
  if (!significant) {
    return `${b.name} is not moving in a direction this data can distinguish from noise.`;
  }
  const dir = perQuarter > 0 ? "Rising" : "Falling";
  const mag = Math.abs(perQuarter);
  const shown = mag >= 10 ? mag.toFixed(0) : mag >= 1 ? mag.toFixed(1) : mag.toFixed(2);
  return `${dir} ${shown} ${b.unit} per quarter.`;
}

function caveatFor(
  n: number,
  df: number,
  residualSe: number,
  unit: string,
  significant: boolean,
): string {
  const base = `Least-squares fit over ${n} results (${df} degree${df === 1 ? "" : "s"} of freedom, residual scatter ±${residualSe.toFixed(2)} ${unit}). The band is a 95% prediction interval and widens with distance because the arithmetic says it should — a projection a year out from ${n} blood draws is genuinely that uncertain.`;
  return significant
    ? base
    : `${base} The slope's own confidence interval includes zero, so no crossing date is offered: at this sample size the trend cannot be told apart from measurement scatter.`;
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/**
 * Every marker on a member's panel that can be projected at all, steepest
 * first — measured in reference-band widths per quarter rather than raw units,
 * because 0.8 %/quarter on haematocrit and 0.8 mg/dL per quarter on
 * triglycerides are not remotely the same amount of movement.
 */
export function projectableMarkers(clientId: string, nowIso: string = NOW): VelocityResult[] {
  const labs = getLabsForClient(clientId);
  if (!labs) return [];
  return labs.biomarkers
    .map((b) => markerVelocity(clientId, b.key, nowIso))
    .filter((v): v is VelocityResult => v.ok && v.trendIsSignificant)
    .sort((a, b) => bandFraction(b) - bandFraction(a));
}

/** Slope expressed as a fraction of the lab's reference band width, per quarter. */
export function bandFraction(v: VelocityResult): number {
  const width = v.refHigh - v.refLow || 1;
  return Math.abs(v.slopePerQuarter) / width;
}

/**
 * Markers heading for the lab's reference band soonest.
 *
 * The ranking a clinician actually wants: not "what is moving fastest" but
 * "what will be out of range first", which is a function of both the slope and
 * how much room is left.
 */
export function crossingSoonest(clientId: string, nowIso: string = NOW): VelocityResult[] {
  return projectableMarkers(clientId, nowIso)
    .filter((v) => v.crossing?.on || v.crossing?.alreadyOutside)
    .sort((a, b) => {
      const ax = a.crossing?.alreadyOutside ? -1 : daysBetween(dayOf(nowIso), a.crossing!.on!);
      const bx = b.crossing?.alreadyOutside ? -1 : daysBetween(dayOf(nowIso), b.crossing!.on!);
      return ax - bx;
    });
}

/** Provenance inputs, shaped for `ProvenanceDrawer.inputs`. */
export function velocityInputs(v: VelocityResult): { label: string; value: string }[] {
  return [
    { label: "Marker", value: `${v.markerName} (${v.markerKey})` },
    { label: "Results used", value: `${v.points}, spanning ${v.spanDays} days` },
    ...v.observed.map((p) => ({ label: p.date, value: `${p.value} ${v.unit}` })),
    { label: "Model", value: "ordinary least squares on days since first result" },
    { label: "Slope", value: `${v.slopePerQuarter.toFixed(3)} ${v.unit} / quarter` },
    {
      label: "Slope 95% CI",
      value: `${v.slopeCiPerQuarter[0].toFixed(3)} to ${v.slopeCiPerQuarter[1].toFixed(3)} ${v.unit} / quarter`,
    },
    { label: "Degrees of freedom", value: String(v.df) },
    { label: "Residual standard error", value: `${v.residualSe.toFixed(3)} ${v.unit}` },
    { label: "t critical (95%)", value: tCritical(v.df).toFixed(3) },
    { label: "Trend distinguishable from noise", value: v.trendIsSignificant ? "yes" : "no" },
    { label: "Lab reference range", value: `${v.refLow}–${v.refHigh} ${v.unit}` },
    { label: "Projection horizon", value: `${HORIZON_DAYS} days` },
    { label: "Crossing", value: v.crossing?.on ?? (v.crossing?.alreadyOutside ? "already outside" : "none in horizon") },
  ];
}
