import type { Biomarker, Client } from "@/lib/types";
import { getClient } from "@/lib/mock/clients";
import { getLabsForClient } from "@/lib/mock/labs";
import { formatDate } from "@/lib/utils";

/**
 * The lab explainer — one marker, in the member's own language and numbers.
 *
 * ── What this is allowed to say ──────────────────────────────────────────
 * A member reading their own panel at 6am has no clinician in the room. That
 * constrains this file harder than any other member-facing surface:
 *
 *  - **No diagnosis.** Naming a condition from a single marker is the failure
 *    mode; "your TSH is 5.8" is a number, "you have hypothyroidism" is a
 *    diagnosis the member did not receive from a person.
 *  - **No treatment, no compound, no amount, no route, ever.** `whatMovesIt`
 *    is lifestyle only — sleep, food, training, alcohol, stress. If the honest
 *    answer to "what moves this" is a prescription, the honest answer to give
 *    the member is "this is a conversation with your provider", which is what
 *    `lifestyleAlone` encodes.
 *  - **No status jargon.** `optimal | watch | low | high` are engine words. A
 *    bare "HIGH" next to someone's own number, with nobody attached to it, is
 *    a 6am panic with no phone number. Members get three phrases only:
 *    *in range*, *worth watching*, *let's discuss*.
 *
 * ── What makes it worth reading ──────────────────────────────────────────
 * Their own trend. A textbook line about what CRP is has no value the internet
 * doesn't already provide for free; "yours has come down from 5.9 to 5.6 since
 * March" is something only we can tell them, and it is the sentence that makes
 * the rest credible. Every explanation leads with the member's data and every
 * generic line is subordinate to it.
 *
 * Deterministic: pure functions over the seeded lab fixtures.
 */

export type WhereItSits = "in range" | "worth watching" | "let's discuss";
export type TrendWord = "better" | "worse" | "steady";

export interface MarkerExplanation {
  key: string;
  name: string;
  /** Short, member-facing, leads with their situation — not a definition. */
  headline: string;
  /** Two or three sentences of plain language. No jargon, no diagnosis. */
  plain: string;
  yourValue: string;
  whereItSits: WhereItSits;
  /** Movement against their OWN history, not against a population. */
  trend: TrendWord;
  /** The sentence that carries the trend, with their real numbers and dates. */
  trendDetail: string;
  whyItMatters: string;
  /** Lifestyle only. Never a compound, never an amount. */
  whatMovesIt: string[];
  /**
   * False when lifestyle is not the main lever for this marker. The UI must
   * say so plainly rather than implying a member can walk it back on their own.
   */
  lifestyleAlone: boolean;
  /** The reference band the lab prints. */
  refBand: [number, number];
  /** The tighter band we actually aim for — the clinic's whole claim. */
  optimalBand: [number, number] | null;
  unit: string;
  /** Every point behind the trend sentence, oldest first. */
  history: { date: string; value: number }[];
  /** Where this came from, so the member can see it isn't invented. */
  source: string;
}

/** Member-facing translation of the engine's status word. */
const SITS: Record<Biomarker["status"], WhereItSits> = {
  optimal: "in range",
  watch: "worth watching",
  low: "let's discuss",
  high: "let's discuss",
};

/**
 * Which direction is "good" for each marker.
 *
 * `band` means the goal is to sit inside the optimal window — too low is as
 * much a finding as too high. Getting this wrong would tell someone their
 * falling testosterone is an improvement, so it is stated per marker rather
 * than inferred.
 */
type Goodness = "lower" | "higher" | "band";

const GOODNESS: Record<string, Goodness> = {
  total_t: "band", free_t: "band", estradiol: "band", shbg: "band", lh: "band",
  fsh: "band", igf1: "band", tsh: "lower", ft3: "higher", ft4: "band",
  rt3: "lower", vitd: "higher", b12: "higher", ferritin: "band", crp: "lower",
  hscrp: "lower", a1c: "lower", glucose: "lower", insulin: "lower", ldl: "lower",
  hdl: "higher", trig: "lower", apob: "lower", alt: "lower", ast: "lower",
  creatinine: "band", egfr: "higher", hct: "band", psa: "lower",
};

/**
 * Per-marker copy.
 *
 * `plain` and `why` are educational framing — what the marker is measuring and
 * why the clinic looks at it. They deliberately stop short of anything a member
 * could act on medically. `movers` are the levers a member controls without
 * anyone's permission; `lifestyleAlone: false` marks the markers where saying
 * "eat better" would be a quietly false promise.
 */
interface MarkerCopy {
  plain: string;
  why: string;
  movers: string[];
  lifestyleAlone?: boolean;
}

const COPY: Record<string, MarkerCopy> = {
  total_t: {
    plain: "This is the total amount of testosterone circulating in your blood — bound and unbound together.",
    why: "It sits underneath a lot of what people come to us for: energy, drive, training recovery and how easily you hold muscle.",
    movers: ["Sleep — this is the big one; short sleep shows up here fast", "Getting body fat down", "Resistance training", "Cutting back on alcohol", "Managing chronic stress"],
    lifestyleAlone: false,
  },
  free_t: {
    plain: "The fraction of your testosterone that isn't bound up and is available to your body right now.",
    why: "Two people can have the same total number and feel completely different — this is usually why.",
    movers: ["Sleep", "Body composition", "Alcohol", "Stress load"],
    lifestyleAlone: false,
  },
  estradiol: {
    plain: "An oestrogen your body makes, partly by converting testosterone. Men need some — the goal is a window, not zero.",
    why: "Sitting outside that window is often what's behind mood, water retention or libido complaints that don't match the testosterone number.",
    movers: ["Body fat, since fat tissue drives the conversion", "Alcohol"],
    lifestyleAlone: false,
  },
  shbg: {
    plain: "A protein that binds hormones and holds them out of circulation.",
    why: "It's the link between your total and free numbers — when this is high, plenty of testosterone can still leave you feeling flat.",
    movers: ["Insulin and blood-sugar control", "Body composition", "Alcohol"],
  },
  lh: { plain: "A signal from your brain telling the testes to produce testosterone.", why: "It helps tell whether a low number is coming from the signal or the response.", movers: ["Sleep", "Stress"], lifestyleAlone: false },
  fsh: { plain: "Another brain signal in the same system, more tied to fertility.", why: "Read alongside LH, it tells us where in the chain something is happening.", movers: ["Sleep", "Stress"], lifestyleAlone: false },
  igf1: {
    plain: "A growth-related marker that reflects how well your body is repairing and rebuilding.",
    why: "It tracks with recovery, lean mass and how you respond to training.",
    movers: ["Protein intake", "Resistance training", "Deep sleep"],
  },
  tsh: {
    plain: "The signal your brain sends to your thyroid. Counter-intuitively, a rising number means your body is having to shout louder.",
    why: "Thyroid drives your metabolic rate — it shows up as energy, temperature, weight and mental clarity.",
    movers: ["Not much, honestly — this one is a conversation with your provider"],
    lifestyleAlone: false,
  },
  ft3: {
    plain: "The active thyroid hormone — the one actually doing the work in your tissues.",
    why: "Plenty of people are told their thyroid is fine on TSH alone. This is the number that often explains why they don't feel fine.",
    movers: ["Adequate calories — chronic under-eating pulls this down", "Selenium- and iodine-containing foods"],
    lifestyleAlone: false,
  },
  ft4: { plain: "The storage form of thyroid hormone, waiting to be converted to the active one.", why: "Read with Free T3, it shows whether the problem is production or conversion.", movers: ["Adequate calories"], lifestyleAlone: false },
  rt3: { plain: "An inactive form your body makes more of when it's under strain.", why: "It's a useful stress signal — it climbs with illness, hard dieting and poor sleep.", movers: ["Not under-eating", "Sleep", "Reducing chronic stress"] },
  vitd: {
    plain: "A vitamin that behaves more like a hormone — involved in immune function, mood, bone and hormone production.",
    why: "It's one of the most common things we find low, and one of the most straightforward to move.",
    movers: ["Sunlight — 15–20 minutes of real daylight", "Fatty fish, eggs", "Your provider will tell you whether you need more than that"],
  },
  b12: { plain: "A vitamin your nerves and red blood cells depend on.", why: "Low levels show up as fatigue and brain fog long before anything else does.", movers: ["Meat, fish, eggs and dairy", "Cutting back on alcohol"] },
  ferritin: { plain: "Your stored iron — the reserve tank, not what's circulating today.", why: "It's often the reason for tiredness and poor training recovery when everything else looks fine.", movers: ["Iron-rich foods with a source of vitamin C", "Coffee and tea away from meals, not with them"] },
  crp: { plain: "A general marker of inflammation in the body.", why: "Chronic low-grade inflammation sits underneath most of what we're trying to improve, so we want to see it settle.", movers: ["Sleep", "Body fat", "Alcohol", "Training that you actually recover from", "Managing stress"] },
  hscrp: { plain: "A more sensitive version of CRP, picking up low-grade inflammation.", why: "It's the version worth tracking over time, because it moves before you feel anything.", movers: ["Sleep", "Body fat", "Alcohol", "Recovery between hard sessions"] },
  a1c: {
    plain: "Your average blood sugar over roughly the last three months — a long exposure, not a snapshot.",
    why: "It's the single most useful read on where your metabolic health is heading.",
    movers: ["Walking after meals", "Getting body fat down", "Protein and fibre before starch", "Sleep — one bad week moves this", "Resistance training"],
  },
  glucose: { plain: "Your blood sugar at the moment of the draw, after fasting.", why: "It's the snapshot that sits alongside A1C's long exposure.", movers: ["Walking after meals", "Sleep the night before", "Body composition"] },
  insulin: { plain: "How much insulin your body needs to keep blood sugar where it should be.", why: "This usually moves years before glucose does, which is exactly why we look at it.", movers: ["Walking after meals", "Resistance training", "Losing fat, particularly around the middle", "Sleep"] },
  ldl: { plain: "The cholesterol carrier most associated with plaque building up in arteries.", why: "It's part of the long game — the number that matters for the decades after this one.", movers: ["Saturated fat intake", "Soluble fibre — oats, beans, fruit", "Body composition", "Aerobic training"] },
  hdl: { plain: "The carrier that helps move cholesterol back out of circulation. Higher is generally better here.", why: "It's part of the same cardiovascular picture as LDL and triglycerides.", movers: ["Aerobic exercise", "Losing fat", "Not smoking"] },
  trig: { plain: "Fat circulating in your blood, strongly influenced by what you ate and drank recently.", why: "Together with insulin, it's one of the earliest signs of metabolic strain.", movers: ["Alcohol — this one is dramatic", "Refined carbs and sugary drinks", "Walking after meals", "Losing fat"] },
  apob: { plain: "A count of the actual particles that can lodge in an artery wall.", why: "It's a better read on cardiovascular risk than cholesterol alone, which is why we run it.", movers: ["Saturated fat", "Soluble fibre", "Aerobic training", "Body composition"] },
  alt: { plain: "A liver enzyme. It rises when liver cells are under strain.", why: "It's often the first place fatty liver or heavy drinking shows up.", movers: ["Alcohol", "Losing fat", "Cutting sugary drinks"] },
  ast: { plain: "Another liver enzyme, also released by muscle after hard training.", why: "Read with ALT, it separates a liver story from a heavy-leg-day story.", movers: ["Alcohol", "Not training hard right before a draw"] },
  creatinine: { plain: "A waste product from muscle that your kidneys clear.", why: "It's a routine check on kidney function — and it runs higher in muscular people, which is normal.", movers: ["Hydration before your draw", "Timing of hard training"] },
  egfr: { plain: "An estimate of how well your kidneys are filtering.", why: "It's a background safety check we watch over time.", movers: ["Hydration", "Blood pressure"], lifestyleAlone: false },
  hct: { plain: "The proportion of your blood made up of red blood cells.", why: "We watch it closely because it can climb on certain protocols, and thicker blood is a safety matter.", movers: ["Hydration", "Sleep apnoea is worth ruling out if this stays high"], lifestyleAlone: false },
  psa: { plain: "A prostate marker we track as a routine safety check.", why: "It's monitoring, not a verdict — the trend over time matters far more than any single number.", movers: ["Nothing you need to change day to day — this one is your provider's to watch"], lifestyleAlone: false },
};

const GENERIC: MarkerCopy = {
  plain: "One of the markers on your panel that we track over time.",
  why: "On its own it's one data point; it earns its place by how it moves across panels.",
  movers: ["Sleep", "Nutrition", "Training", "Alcohol", "Stress"],
};

// ---------------------------------------------------------------------------
// Trend against their own history
// ---------------------------------------------------------------------------

/** Distance outside the optimal window. 0 = inside it. */
function distanceFromGood(value: number, m: Biomarker, goodness: Goodness): number {
  const lo = m.optimalLow ?? m.refLow;
  const hi = m.optimalHigh ?? m.refHigh;
  if (goodness === "lower") return Math.max(0, value - hi);
  if (goodness === "higher") return Math.max(0, lo - value);
  return value < lo ? lo - value : value > hi ? value - hi : 0;
}

function trendFor(m: Biomarker, goodness: Goodness): { word: TrendWord; detail: string } {
  const hist = m.history ?? [];
  if (hist.length < 2) {
    return {
      word: "steady",
      detail:
        "This is your first result for this one, so there's no trend yet — the next panel is where it starts telling a story.",
    };
  }
  const first = hist[0];
  const last = hist[hist.length - 1];
  const before = distanceFromGood(first.value, m, goodness);
  const after = distanceFromGood(last.value, m, goodness);
  const moved = Math.abs(last.value - first.value);
  const span = Math.abs(m.refHigh - m.refLow) || 1;

  // Below 4% of the reference span is noise between draws, not a trend.
  if (moved / span < 0.04) {
    return {
      word: "steady",
      detail: `Yours has held around ${fmt(last.value)} ${m.unit} since ${formatDate(first.date)} — flat, which for this one is information too.`,
    };
  }
  const direction = last.value > first.value ? "up from" : "down from";
  const word: TrendWord = after < before ? "better" : after > before ? "worse" : "steady";
  const tail =
    word === "better"
      ? "moving the way we want."
      : word === "worse"
        ? "moving away from where we'd like it, which is worth raising with your coach."
        : "moving, but still in the same place relative to your target.";
  return {
    word,
    detail: `Yours has come ${direction} ${fmt(first.value)} to ${fmt(last.value)} ${m.unit} since ${formatDate(first.date)} — ${tail}`,
  };
}

function fmt(v: number) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function explainMarker(clientId: string, markerKey: string): MarkerExplanation | null {
  const client = getClient(clientId);
  const labs = getLabsForClient(clientId);
  if (!client || !labs) return null;
  const m = labs.biomarkers.find((b) => b.key === markerKey);
  if (!m) return null;

  const copy = COPY[m.key] ?? GENERIC;
  const goodness = GOODNESS[m.key] ?? "band";
  const sits = SITS[m.status];
  const { word, detail } = trendFor(m, goodness);
  const optimalBand: [number, number] | null =
    m.optimalLow !== undefined && m.optimalHigh !== undefined ? [m.optimalLow, m.optimalHigh] : null;

  return {
    key: m.key,
    name: m.name,
    headline: headlineFor(m, sits, word, client),
    plain: copy.plain,
    yourValue: `${fmt(m.value)} ${m.unit}`,
    whereItSits: sits,
    trend: word,
    trendDetail: detail,
    whyItMatters: copy.why,
    whatMovesIt: copy.movers,
    lifestyleAlone: copy.lifestyleAlone !== false,
    refBand: [m.refLow, m.refHigh],
    optimalBand,
    unit: m.unit,
    history: m.history ?? [{ date: labs.resultedOn, value: m.value }],
    source: `${labs.panelName}, drawn ${formatDate(labs.collectedOn)}`,
  };
}

/**
 * The headline.
 *
 * Two rules it exists to enforce. It never opens with a definition — the member
 * knows what they clicked. And when a marker is off, it names the next step as
 * a conversation with a person, so nobody is left holding a red number alone.
 */
function headlineFor(m: Biomarker, sits: WhereItSits, trend: TrendWord, client: Client): string {
  const name = m.name;
  if (sits === "in range") {
    return trend === "better"
      ? `Your ${name} is where we want it, and it got there.`
      : `Your ${name} is right where we want it.`;
  }
  if (sits === "worth watching") {
    return trend === "better"
      ? `Your ${name} isn't quite in the window yet — but it's heading the right way.`
      : `Your ${name} is inside the lab's normal range, but outside the tighter one we aim for.`;
  }
  return trend === "better"
    ? `Your ${name} is still outside range, though it's improved since last time. ${client.firstName}, this one's worth a conversation.`
    : `Your ${name} is outside range. That's a conversation with your provider, not something to solve on your own.`;
}

/**
 * Markers worth surfacing first, ordered so the member sees what's actionable
 * before what's fine. Off-range first, then near-misses, then the wins — a
 * member who scrolls past twenty optimal markers never reaches the one that
 * mattered.
 */
export function explainableMarkers(clientId: string): Biomarker[] {
  const labs = getLabsForClient(clientId);
  if (!labs) return [];
  const rank: Record<Biomarker["status"], number> = { low: 0, high: 0, watch: 1, optimal: 2 };
  return [...labs.biomarkers].sort(
    (a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name),
  );
}

/**
 * One-line orientation above the marker list.
 *
 * Counts only — no interpretation, because a summary sentence about a whole
 * panel is exactly where an unearned clinical claim would slip in.
 */
export function panelOverview(clientId: string): { line: string; source: string } | null {
  const labs = getLabsForClient(clientId);
  if (!labs) return null;
  const discuss = labs.biomarkers.filter((b) => b.status === "low" || b.status === "high").length;
  const watch = labs.biomarkers.filter((b) => b.status === "watch").length;
  const inRange = labs.biomarkers.length - discuss - watch;
  const parts = [`${inRange} in range`];
  if (watch) parts.push(`${watch} worth watching`);
  if (discuss) parts.push(`${discuss} to discuss`);
  return {
    line: `${labs.biomarkers.length} markers: ${parts.join(", ")}.`,
    source: `${labs.panelName}, drawn ${formatDate(labs.collectedOn)}`,
  };
}
