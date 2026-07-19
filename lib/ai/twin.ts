import type { Client } from "@/lib/types";
import { getClient } from "@/lib/mock/clients";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { getLabsForClient } from "@/lib/mock/labs";
import { alphaScore } from "@/lib/alphaScore";
import { buildDailyPlan } from "@/lib/daily/today";
import { seededRandom, clamp } from "@/lib/utils";

/**
 * The what-if twin — a member modelling their own next twelve weeks.
 *
 * ── THE RULE THAT SHAPES THIS ENTIRE FILE ────────────────────────────────
 * **There is no dose lever, and there never will be one.**
 *
 * It is the obvious feature request and it is the one thing this simulator must
 * refuse. A slider that reads "what if I doubled it?" is a self-titration tool
 * with a chart attached: the member gets a number, the number goes up, and the
 * decision that was supposed to require a licensed provider and a lab panel has
 * been made by a drag gesture at 11pm. Nothing downstream can un-make it — the
 * provider finds out at the next consult, if the member admits it.
 *
 * So the levers here are exactly the things a member already controls without
 * anyone's permission: sleep, protein, training, steps, alcohol, stress. Those
 * are honest to model, because the member can act on the answer tonight and the
 * worst case of over-doing them is being well rested.
 *
 * If a member wants to explore a protocol change, the only correct output of
 * this screen is `PROTOCOL_ROUTE` — send them to their provider. See
 * `protocolQuestionRouting()`.
 *
 * ── WHY THE NUMBERS ARE THE MEMBER'S OWN ─────────────────────────────────
 * Every effect below is scaled by *headroom*: how far this specific member is
 * from a good version of that lever. Someone already sleeping 8h is told sleep
 * will do very little for them, because for them it will. A simulator that
 * tells everybody "sleep is the big one" is a poster, not a model — and it
 * burns the one thing that makes the top-lever callout worth reading.
 *
 * Every lever therefore carries an `effectBasis`: one sentence naming the data
 * that produced its ranking. If a line on this screen cannot point at a number
 * in the member's record, it does not get to appear.
 *
 * Deterministic throughout — seeded from the client id, pinned clock.
 */

const NOW = "2026-06-12T09:00:00";
const WEEKS = 12;

/** What a member says when they want the thing we will not simulate. */
export const PROTOCOL_ROUTE =
  "Changes to your protocol aren't something to model on your own — the amount and timing are your provider's call, based on your labs. Send them a message and they'll walk through it with you.";

export type LeverId = "sleep" | "protein" | "training" | "steps" | "alcohol" | "stress";

export interface LeverSpec {
  id: LeverId;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  /** "up" = more is better; "down" = less is better. */
  direction: "up" | "down";
  /** The value past which extra effort stops earning much. */
  target: number;
  /** One line under the slider, in the member's language. */
  help: string;
  /** Points of composite effect per unit moved toward `target`. */
  perUnit: number;
  /** How this lever splits across the four projected outcomes. */
  weights: { fat: number; lean: number; score: number; energy: number };
}

/**
 * The lever set. Note what is absent: dose, frequency, route, compound.
 *
 * `perUnit` values are effect *weights*, not clinical coefficients — they set
 * the relative pull of each lever on a 0–100 composite, and the copy on the
 * component is required to frame the output as a typical range rather than a
 * prediction.
 */
export const LEVERS: LeverSpec[] = [
  {
    id: "sleep",
    label: "Sleep",
    unit: "hrs / night",
    min: 4,
    max: 9,
    step: 0.25,
    direction: "up",
    target: 8,
    help: "Average across the week, not your best night.",
    perUnit: 2.4,
    weights: { fat: 0.18, lean: 0.22, score: 0.3, energy: 0.42 },
  },
  {
    id: "protein",
    label: "Protein hit",
    unit: "% of days on target",
    min: 20,
    max: 100,
    step: 5,
    direction: "up",
    target: 90,
    help: "Days you actually hit your protein number.",
    perUnit: 0.1,
    weights: { fat: 0.28, lean: 0.44, score: 0.2, energy: 0.12 },
  },
  {
    id: "training",
    label: "Training",
    unit: "days / week",
    min: 0,
    max: 7,
    step: 1,
    direction: "up",
    target: 4,
    help: "Sessions you finish, not sessions you plan.",
    perUnit: 1.7,
    weights: { fat: 0.26, lean: 0.4, score: 0.24, energy: 0.16 },
  },
  {
    id: "steps",
    label: "Daily steps",
    unit: "k / day",
    min: 2,
    max: 16,
    step: 0.5,
    direction: "up",
    target: 10,
    help: "Everything outside the gym. This is the quiet one.",
    perUnit: 0.9,
    weights: { fat: 0.34, lean: 0.06, score: 0.22, energy: 0.18 },
  },
  {
    id: "alcohol",
    label: "Alcohol",
    unit: "drinks / week",
    min: 0,
    max: 21,
    step: 1,
    direction: "down",
    target: 2,
    help: "Weekends count.",
    perUnit: 0.55,
    weights: { fat: 0.24, lean: 0.16, score: 0.28, energy: 0.26 },
  },
  {
    id: "stress",
    label: "Stress",
    unit: "1–10",
    min: 1,
    max: 10,
    step: 1,
    direction: "down",
    target: 4,
    help: "How loud your week feels on average.",
    perUnit: 1.3,
    weights: { fat: 0.16, lean: 0.12, score: 0.26, energy: 0.38 },
  },
];

export const leverSpec = (id: LeverId): LeverSpec => LEVERS.find((l) => l.id === id)!;

export type LeverValues = Record<LeverId, number>;

export interface LeverEffect {
  id: LeverId;
  label: string;
  /** Where this member sits today. */
  baseline: number;
  /** Distance to a good version of this lever, in the lever's own units. */
  headroom: number;
  /** Composite points available if they closed that headroom. 0 when maxed. */
  potential: number;
  /** 0–1, `potential` normalised against this member's biggest lever. */
  share: number;
  /** ONE sentence naming the data behind the ranking. Required, never generic. */
  effectBasis: string;
}

export interface ProjectionPoint {
  week: number;
  /** Null when the member has no body scan on file — we do not invent one. */
  bodyFatPct: number | null;
  bodyFatLow: number | null;
  bodyFatHigh: number | null;
  leanMassKg: number | null;
  leanMassLow: number | null;
  leanMassHigh: number | null;
  alphaScore: number;
  alphaLow: number;
  alphaHigh: number;
  /** 0–100 self-reported-energy index, anchored on today's score + symptoms. */
  energy: number;
  energyLow: number;
  energyHigh: number;
}

export interface Simulation {
  clientId: string;
  levers: LeverValues;
  baseline: LeverValues;
  path: ProjectionPoint[];
  /** Convenience handles for the callout row. */
  start: ProjectionPoint;
  end: ProjectionPoint;
  /** The single lever with the most available upside for THIS member. */
  topLever: LeverEffect;
  ranked: LeverEffect[];
  /** 0–1. Drives how wide the band is drawn and what the caveat says. */
  confidence: number;
  confidenceBasis: string;
  hasScan: boolean;
  /** True when the sliders are still where the member actually lives. */
  atBaseline: boolean;
}

// ---------------------------------------------------------------------------
// Where the member starts
// ---------------------------------------------------------------------------

/**
 * Today's lever values, read off the member's record rather than guessed.
 *
 * Protein comes from the daily plan's actual protein-vs-target math, so the
 * slider opens where their week really is. The rest are anchored on reported
 * symptoms — someone who told intake they sleep badly does not open at 7.5h —
 * with a small seeded spread so the population isn't uniform.
 */
export function baselineLevers(clientId: string): LeverValues {
  const client = getClient(clientId);
  if (!client) return { sleep: 7, protein: 70, training: 3, steps: 7, alcohol: 4, stress: 5 };

  const rand = seededRandom(`${client.id}-twin-baseline`);
  const has = (s: string) => client.symptoms.includes(s as never);
  const onProgram = client.programs.length > 0;

  const plan = buildDailyPlan(client, NOW);
  const fuel = plan.rings.find((r) => r.id === "fuel");
  // The fuel ring is one day; widen it into a weekly adherence estimate so a
  // single strong or weak day doesn't set the whole slider.
  const proteinPct = fuel
    ? clamp(Math.round((fuel.progress * 0.7 + 0.25) * 100 + (rand() - 0.5) * 8), 25, 100)
    : 70;

  const sleep =
    7.4 - (has("Poor sleep") ? 1.5 : 0) - (has("Elevated stress") ? 0.5 : 0) + (rand() - 0.5) * 0.8;
  const training =
    (onProgram ? 3.4 : 2.1) - (has("Slow recovery") ? 0.4 : 0) + (rand() - 0.5) * 1.6;
  const steps = (onProgram ? 7.6 : 6.2) - (has("Weight gain") ? 1.2 : 0) + (rand() - 0.5) * 2.4;
  const alcohol = 3 + Math.round(rand() * 7) - (onProgram ? 1 : 0);
  const stress =
    4.6 + (has("Elevated stress") ? 2.6 : 0) + (has("Mood changes") ? 0.9 : 0) + (rand() - 0.5) * 1.6;

  return {
    sleep: round(clamp(sleep, 4, 9), 0.25),
    protein: proteinPct,
    training: round(clamp(training, 0, 7), 1),
    steps: round(clamp(steps, 2, 16), 0.5),
    alcohol: round(clamp(alcohol, 0, 21), 1),
    stress: round(clamp(stress, 1, 10), 1),
  };
}

function round(v: number, step: number) {
  return Math.round(v / step) * step;
}

/** Signed movement toward `target`, in lever units. Negative = moved backwards. */
function improvement(spec: LeverSpec, value: number, from: number): number {
  const toward = spec.direction === "up" ? 1 : -1;
  const capped = spec.direction === "up" ? Math.min(value, spec.target) : Math.max(value, spec.target);
  const cappedFrom = spec.direction === "up" ? Math.min(from, spec.target) : Math.max(from, spec.target);
  // Past target, extra effort still counts — at a quarter weight, not zero.
  const beyond =
    spec.direction === "up" ? Math.max(0, value - spec.target) : Math.max(0, spec.target - value);
  const beyondFrom =
    spec.direction === "up" ? Math.max(0, from - spec.target) : Math.max(0, spec.target - from);
  return (capped - cappedFrom) * toward + (beyond - beyondFrom) * 0.25;
}

/** How far this member is from a good version of the lever. 0 = already there. */
function headroomOf(spec: LeverSpec, value: number): number {
  return spec.direction === "up"
    ? Math.max(0, spec.target - value)
    : Math.max(0, value - spec.target);
}

// ---------------------------------------------------------------------------
// What matters most for THIS member
// ---------------------------------------------------------------------------

/**
 * Rank the levers by upside available to this member specifically.
 *
 * Ranking is `perUnit × headroom` — points on the table, not points in theory.
 * A member drinking twelve a week outranks one lying awake at 5h only if the
 * arithmetic on their own record says so.
 */
export function whatMattersMost(clientId: string, from?: LeverValues): LeverEffect[] {
  const base = from ?? baselineLevers(clientId);
  const client = getClient(clientId);

  const raw = LEVERS.map((spec) => {
    const headroom = headroomOf(spec, base[spec.id]);
    return { spec, headroom, potential: headroom * spec.perUnit };
  });
  const max = Math.max(...raw.map((r) => r.potential), 0.001);

  return raw
    .map(({ spec, headroom, potential }) => ({
      id: spec.id,
      label: spec.label,
      baseline: base[spec.id],
      headroom: Math.round(headroom * 100) / 100,
      potential: Math.round(potential * 10) / 10,
      share: clamp(potential / max, 0, 1),
      effectBasis: basisFor(spec, base[spec.id], headroom, client),
    }))
    .sort((a, b) => b.potential - a.potential);
}

/**
 * The one sentence that makes a ranking trustworthy.
 *
 * Each branch names the member's own number and, where the record supports it,
 * the symptom or goal that makes the lever matter for them. Nothing here
 * asserts a clinical mechanism — it explains why this lever is ranked where it
 * is, which is a claim about their data and nothing more.
 */
function basisFor(spec: LeverSpec, value: number, headroom: number, client?: Client): string {
  const has = (s: string) => !!client?.symptoms.includes(s as never);
  const wants = (g: string) => !!client?.goals.includes(g as never);
  const v = Math.round(value * 10) / 10;

  if (headroom <= 0.01) {
    return `You're already at or past the target here (${v} ${spec.unit}), so there's little left to gain — it's holding, not fixing.`;
  }

  switch (spec.id) {
    case "sleep":
      return has("Poor sleep")
        ? `You're averaging ${v} hrs and you flagged poor sleep at intake — that's the largest single gap on your record.`
        : `You're averaging ${v} hrs against a ${spec.target}-hr target, so there's about ${Math.round(headroom * 10) / 10} hrs on the table.`;
    case "protein":
      return `You're hitting your protein target on about ${Math.round(v)}% of days${
        wants("Muscle gain") || wants("Fat loss")
          ? " — the lever that protects lean mass while you're chasing " +
            (wants("Fat loss") ? "fat loss" : "muscle gain") +
            "."
          : ", leaving room to close the gap."
      }`;
    case "training":
      return `You're finishing about ${v} session${v === 1 ? "" : "s"} a week${
        has("Reduced strength") ? " and you reported strength dropping off" : ""
      }, ${Math.round(headroom)} short of the ${spec.target} your plan is built around.`;
    case "steps":
      return `At ${v}k a day you're ${Math.round(headroom * 10) / 10}k below target — this is the one most members underrate because it happens outside the gym.`;
    case "alcohol":
      return `You logged around ${Math.round(v)} drinks a week; bringing that toward ${spec.target} is the change with the least effort attached to it.`;
    case "stress":
      return has("Elevated stress")
        ? `You rated stress at ${Math.round(v)}/10 and flagged it at intake, so it's pulling on sleep and energy at the same time.`
        : `You rated stress at ${Math.round(v)}/10 against a target of ${spec.target}.`;
  }
}

// ---------------------------------------------------------------------------
// Simulate
// ---------------------------------------------------------------------------

/**
 * Twelve weeks under the levers as set.
 *
 * Shape of the curve: adaptation is front-loaded and then flattens, so effects
 * ease in on `1 - e^(-t/τ)` rather than marching linearly. A straight line to
 * week 12 is the single most misleading thing a projection can draw, because it
 * promises week 11 will feel like week 2 did.
 *
 * The band widens with √t. Uncertainty at week 12 is genuinely larger than at
 * week 1 and drawing a constant band hides that.
 */
export function simulate(clientId: string, levers?: Partial<LeverValues>): Simulation | null {
  const client = getClient(clientId);
  if (!client) return null;

  const base = baselineLevers(clientId);
  const values: LeverValues = { ...base, ...levers };

  const scan = getScanForClient(clientId);
  const labs = getLabsForClient(clientId);
  const score = alphaScore(client);

  // ── Composite pull per outcome ────────────────────────────────────────
  let fatPts = 0;
  let leanPts = 0;
  let scorePts = 0;
  let energyPts = 0;
  for (const spec of LEVERS) {
    const delta = improvement(spec, values[spec.id], base[spec.id]) * spec.perUnit;
    fatPts += delta * spec.weights.fat;
    leanPts += delta * spec.weights.lean;
    scorePts += delta * spec.weights.score;
    energyPts += delta * spec.weights.energy;
  }
  // ── Ceilings ──────────────────────────────────────────────────────────
  // Raw points are an internal currency; what the member sees has to be
  // bounded by what twelve weeks of lifestyle change actually does. `REF` is
  // roughly the points a comprehensive overhaul earns, so a member who fixes
  // everything lands near — not past — `MAX`. Without this the chart happily
  // draws a 20% body-fat drop for someone who dragged six sliders, which is
  // the same kind of unearned promise as a dose slider, just slower.
  const REF = 3.5;
  const norm = (pts: number) => clamp(pts / REF, -1, 1);
  const fatDelta12 = norm(fatPts) * -5.0; // percentage points of body fat
  const leanDelta12 = norm(leanPts) * 2.0; // kg
  const scoreDelta12 = norm(scorePts) * 12; // Alpha Score points
  const energyDelta12 = norm(energyPts) * 26; // energy index points

  // ── Where they start ──────────────────────────────────────────────────
  const bf0 = scan?.bodyFatPct ?? null;
  const lean0 = scan ? Math.round((scan.weightKg * (1 - scan.bodyFatPct / 100)) * 10) / 10 : null;
  const energy0 = energyBaseline(client, score.score);

  // ── Confidence ────────────────────────────────────────────────────────
  let confidence = 0.5;
  const reasons: string[] = [];
  if (scan?.history && scan.history.length >= 3) {
    confidence += 0.18;
    reasons.push(`${scan.history.length} body scans on file`);
  }
  if (labs) {
    confidence += 0.12;
    reasons.push(`a full panel from ${labs.resultedOn}`);
  }
  if (client.programs.length > 0) {
    confidence += 0.08;
    reasons.push("months of adherence history");
  }
  confidence = clamp(confidence, 0.4, 0.88);
  const confidenceBasis = reasons.length
    ? `Based on ${reasons.join(", ")}. Ranges widen the further out you look.`
    : "You don't have a scan or panel on file yet, so this is a wide first estimate — it tightens once we have your baseline.";

  const spread = 1.35 - confidence; // low confidence → wider band

  const path: ProjectionPoint[] = [];
  const denom = 1 - Math.exp(-WEEKS / 4.5);
  for (let w = 0; w <= WEEKS; w++) {
    const t = (1 - Math.exp(-w / 4.5)) / denom;
    const wobble = Math.sqrt(w / WEEKS);

    // Body fat: composite pull, plus the drift already visible in their scans.
    const bfDelta = (fatDelta12 + drift(scan)) * t;
    const bf = bf0 === null ? null : clamp(bf0 + bfDelta, 5, 55);
    const bfBand = 0.9 * spread * wobble + Math.abs(bfDelta) * 0.22;

    const leanDelta = leanDelta12 * t;
    const lean = lean0 === null ? null : clamp(lean0 + leanDelta, 25, 110);
    const leanBand = 0.7 * spread * wobble + Math.abs(leanDelta) * 0.25;

    const sc = clamp(score.score + scoreDelta12 * t, 0, 100);
    const scBand = 3.2 * spread * wobble + Math.abs(scoreDelta12 * t) * 0.2;

    const en = clamp(energy0 + energyDelta12 * t, 0, 100);
    const enBand = 4.5 * spread * wobble + Math.abs(energyDelta12 * t) * 0.22;

    path.push({
      week: w,
      bodyFatPct: bf === null ? null : r1(bf),
      bodyFatLow: bf === null ? null : r1(clamp(bf - bfBand, 4, 60)),
      bodyFatHigh: bf === null ? null : r1(clamp(bf + bfBand, 4, 60)),
      leanMassKg: lean === null ? null : r1(lean),
      leanMassLow: lean === null ? null : r1(lean - leanBand),
      leanMassHigh: lean === null ? null : r1(lean + leanBand),
      alphaScore: Math.round(sc),
      alphaLow: Math.round(clamp(sc - scBand, 0, 100)),
      alphaHigh: Math.round(clamp(sc + scBand, 0, 100)),
      energy: Math.round(en),
      energyLow: Math.round(clamp(en - enBand, 0, 100)),
      energyHigh: Math.round(clamp(en + enBand, 0, 100)),
    });
  }

  const ranked = whatMattersMost(clientId, base);

  return {
    clientId,
    levers: values,
    baseline: base,
    path,
    start: path[0],
    end: path[path.length - 1],
    topLever: ranked[0],
    ranked,
    confidence,
    confidenceBasis,
    hasScan: !!scan,
    atBaseline: LEVERS.every((l) => Math.abs(values[l.id] - base[l.id]) < 1e-6),
  };
}

function r1(v: number) {
  return Math.round(v * 10) / 10;
}

/**
 * The trend already in their scans, per week.
 *
 * Someone who has been dropping body fat for four months keeps dropping a
 * little even if every slider stays put — pretending the flat line is their
 * "do nothing" case would overstate what the levers did.
 */
function drift(scan: ReturnType<typeof getScanForClient>): number {
  const hist = scan?.history ?? [];
  if (hist.length < 2) return 0;
  const first = hist[0];
  const last = hist[hist.length - 1];
  const weeks = Math.max(
    1,
    (new Date(last.date).getTime() - new Date(first.date).getTime()) / (86_400_000 * 7),
  );
  const perWeek = (last.bodyFatPct - first.bodyFatPct) / weeks;
  // Damped: past progress is evidence, not a guarantee it continues at pace.
  return clamp(perWeek * WEEKS * 0.35, -3, 1.5);
}

/**
 * Energy index, 0–100.
 *
 * Anchored on the Alpha Score so it moves with the rest of the record, then
 * pulled down by the symptoms a member actually reported. It is a self-report
 * scale — labelled as such everywhere it renders — not a measurement.
 */
function energyBaseline(client: Client, score: number): number {
  const drag =
    (client.symptoms.includes("Low energy") ? 14 : 0) +
    (client.symptoms.includes("Poor sleep") ? 8 : 0) +
    (client.symptoms.includes("Brain fog") ? 6 : 0) +
    (client.symptoms.includes("Elevated stress") ? 5 : 0);
  return clamp(Math.round(score * 0.75 + 18 - drag), 15, 92);
}

/**
 * The answer when a member asks the question this simulator won't take.
 *
 * Exported so the component and any future assistant surface give the same
 * response, rather than each inventing its own softer version.
 */
export function protocolQuestionRouting(): { title: string; body: string; cta: string } {
  return {
    title: "Protocol changes aren't a slider",
    body: PROTOCOL_ROUTE,
    cta: "Message your provider",
  };
}
