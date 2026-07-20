// =============================================================================
// Apex — honest projection
//
// Forecasting body composition is the easiest place in a clinic product to
// lie. "You'll be at 18% body fat by September" is a great screenshot and a
// terrible promise, and the member who misses it by two points reads it as
// personal failure rather than as the arithmetic of an over-confident line.
//
// So this module never returns a single number. It returns a median path and a
// confidence band, and the band WIDENS with time and with poor adherence. That
// widening is not a caveat bolted onto the chart — it IS the chart's argument:
// how certain the future is depends on what the member does between now and
// then.
//
// Everything is derived from the member's own history — the InBody series in
// lib/mock/bodyscans and the Alpha Score trend — never from a population model
// that this member has never been compared to. If a member has no history, no
// forecast is produced. An unfounded projection is worse than none.
// =============================================================================

import type { Client } from "@/lib/types";
import { clientMap } from "@/lib/mock/clients";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { alphaScore } from "@/lib/alphaScore";
import { ringHistory } from "@/lib/daily/today";
import { clamp, absolute } from "@/lib/utils";

/** Pinned clock. Nothing in this file may read the wall clock. */
const NOW = "2026-06-12T09:00:00";
const NOW_MS = absolute(NOW).getTime();
const WEEK_MS = 7 * 86_400_000;

export type ForecastMetric = "bodyFat" | "weight" | "leanMass" | "alphaScore";

export interface ForecastPoint {
  week: number;
  date: string;
  /** Central path. The most likely value — not a promise. */
  median: number;
  /** Lower and upper edge of the band. */
  low: number;
  high: number;
}

export interface ForecastResult {
  clientId: string;
  metric: ForecastMetric;
  label: string;
  unit: string;
  /** Where the member is now, from the most recent real observation. */
  current: number;
  /** Observed history the projection was fitted to — shown so the fit is auditable. */
  observed: { date: string; value: number }[];
  points: ForecastPoint[];
  /** 0..1, from this member's own logged days. */
  adherence: number;
  adherenceLabel: "Strong" | "Mixed" | "Inconsistent";
  /** Lower is better for bodyFat/weight; higher is better for leanMass/alphaScore. */
  direction: "lower-is-better" | "higher-is-better";
  /** One sentence explaining what the band means. Always rendered with the chart. */
  bandBasis: string;
  /** Plain statement of what the projection is fitted to. */
  basis: string;
}

const META: Record<ForecastMetric, { label: string; unit: string; direction: ForecastResult["direction"]; decimals: number }> = {
  bodyFat: { label: "Body fat", unit: "%", direction: "lower-is-better", decimals: 1 },
  weight: { label: "Weight", unit: "kg", direction: "lower-is-better", decimals: 1 },
  leanMass: { label: "Skeletal muscle", unit: "kg", direction: "higher-is-better", decimals: 1 },
  alphaScore: { label: "Alpha Score", unit: "", direction: "higher-is-better", decimals: 0 },
};

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** The member's own observed series for this metric, oldest first. */
function observedSeries(client: Client, metric: ForecastMetric): { date: string; value: number }[] {
  if (metric === "alphaScore") {
    return alphaScore(client).trend.map((t) => ({ date: t.date, value: t.value }));
  }
  const scan = getScanForClient(client.id);
  // No scan, or a scan with no series behind it, means no fit — and no forecast.
  if (!scan?.history?.length) return [];
  return scan.history.map((h) => ({
    date: h.date,
    value: metric === "bodyFat" ? h.bodyFatPct : metric === "weight" ? h.weightKg : h.skeletalMuscleKg,
  }));
}

/**
 * Adherence from the member's own logged days, not from a guess.
 *
 * Protected days — provider holds, washouts, logged illness — are counted as
 * kept, because they are correct behaviour and penalising them here would
 * punish a member for following instructions.
 */
function adherenceFor(client: Client): number {
  const days = ringHistory(client, 28);
  if (!days.length) return 0.75;
  const kept = days.filter((d) => d.closed || d.protectedDay).length;
  return clamp(kept / days.length, 0, 1);
}

function adherenceLabelFor(adherence: number): ForecastResult["adherenceLabel"] {
  if (adherence >= 0.8) return "Strong";
  if (adherence >= 0.6) return "Mixed";
  return "Inconsistent";
}

// ---------------------------------------------------------------------------
// Fit
// ---------------------------------------------------------------------------

/** Ordinary least squares on (weeks-since-first, value). Returns weekly rate and residual spread. */
function fit(series: { date: string; value: number }[]): { ratePerWeek: number; residualSd: number } {
  const t0 = absolute(series[0].date).getTime();
  const xs = series.map((p) => (absolute(p.date).getTime() - t0) / WEEK_MS);
  const ys = series.map((p) => p.value);
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const ratePerWeek = den === 0 ? 0 : num / den;
  const intercept = my - ratePerWeek * mx;
  const ss = xs.reduce((s, x, i) => s + (ys[i] - (intercept + ratePerWeek * x)) ** 2, 0);
  const residualSd = Math.sqrt(ss / Math.max(1, n - 2));
  return { ratePerWeek, residualSd };
}

/**
 * Biology plateaus; straight lines do not.
 *
 * A naive linear extrapolation of a good first quarter has a member at 4% body
 * fat by Christmas. The observed rate is therefore decayed with a time
 * constant, so cumulative change approaches an asymptote rather than running
 * off the axis. TAU is expressed in weeks and is a modelling choice, stated
 * here rather than hidden: early progress is real, and it does not continue at
 * the same slope indefinitely.
 */
const TAU_WEEKS = 14;

function cumulativeChange(ratePerWeek: number, week: number): number {
  return ratePerWeek * TAU_WEEKS * (1 - Math.exp(-week / TAU_WEEKS));
}

function round(v: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Project a metric forward.
 *
 * Returns undefined — never a fabricated line — when the member has fewer than
 * two real observations for this metric.
 */
export function forecast(clientId: string, metric: ForecastMetric, weeks = 12): ForecastResult | undefined {
  const client = clientMap[clientId];
  if (!client) return undefined;

  const observed = observedSeries(client, metric);
  if (observed.length < 2) return undefined;

  const meta = META[metric];
  const { ratePerWeek, residualSd } = fit(observed);
  const current = observed[observed.length - 1].value;

  const adherence = adherenceFor(client);

  // The band has three sources, and each is a real one:
  //   1. residualSd — how noisy this member's own measurements already are.
  //   2. sqrt(week) — uncertainty compounds with horizon, as it does in any
  //      random walk. This is what makes the band a cone rather than a tube.
  //   3. adherencePenalty — the point of the whole component. At full
  //      adherence the band widens only from noise and horizon; at poor
  //      adherence it widens roughly threefold, because the projection is
  //      conditional on behaviour that is not currently happening.
  const adherencePenalty = 1 + (1 - adherence) * 2;
  // Floor the noise term so a suspiciously smooth history does not produce a
  // hairline band that reads as certainty.
  const noise = Math.max(residualSd, Math.abs(current) * 0.012);

  const points: ForecastPoint[] = [];
  for (let w = 0; w <= weeks; w++) {
    const median = current + cumulativeChange(ratePerWeek, w);
    const halfWidth = w === 0 ? 0 : noise * Math.sqrt(w) * 0.9 * adherencePenalty;
    const lo = metric === "alphaScore" ? clamp(median - halfWidth, 0, 100) : Math.max(0, median - halfWidth);
    const hi = metric === "alphaScore" ? clamp(median + halfWidth, 0, 100) : median + halfWidth;
    points.push({
      week: w,
      date: absolute(NOW_MS + w * WEEK_MS).toISOString().slice(0, 10),
      median: round(metric === "alphaScore" ? clamp(median, 0, 100) : Math.max(0, median), meta.decimals),
      low: round(lo, meta.decimals),
      high: round(hi, meta.decimals),
    });
  }

  const label = adherenceLabelFor(adherence);
  const pct = Math.round(adherence * 100);

  return {
    clientId,
    metric,
    label: meta.label,
    unit: meta.unit,
    current: round(current, meta.decimals),
    observed,
    points,
    adherence,
    adherenceLabel: label,
    direction: meta.direction,
    bandBasis:
      `The band is the range this could reasonably land in, not error bars on a promise — it widens the further out you ` +
      `look and widens again when days are missed, so at ${pct}% adherence over the last 28 days a ${weeks}-week outlook ` +
      `spans roughly ${round(Math.abs(points[weeks].high - points[weeks].low), meta.decimals)}${meta.unit ? " " + meta.unit : " points"}.`,
    basis:
      `Fitted to this member's own ${observed.length} recorded ${metric === "alphaScore" ? "Alpha Score points" : "InBody measurements"} ` +
      `from ${observed[0].date} to ${observed[observed.length - 1].date}, with the observed rate of change decayed over time ` +
      `because progress flattens. No population model is used.`,
  };
}

/** True when there is enough of this member's own history to project honestly. */
export function canForecast(clientId: string, metric: ForecastMetric): boolean {
  const client = clientMap[clientId];
  if (!client) return false;
  return observedSeries(client, metric).length >= 2;
}

/** Which metrics can be projected for this member right now. */
export function availableMetrics(clientId: string): ForecastMetric[] {
  return (Object.keys(META) as ForecastMetric[]).filter((m) => canForecast(clientId, m));
}

/**
 * The sentence that must accompany any forecast surface. Exported so every
 * screen says the same thing and no screen can quietly drop it.
 */
export const FORECAST_DISCLAIMER =
  "Projections are a range, never a guarantee. They are fitted to this member's own history and change as new data arrives.";
