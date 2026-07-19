// =============================================================================
// Apex — Pattern recognition across the biomarker set
//
// The clinic's own line is "we look past normal labs to find the real cause".
// Single-marker flagging is what every lab portal already does; it is also why
// a symptomatic man gets told his testosterone is normal and sent home. The
// signal lives in COMBINATIONS — a marker that is unremarkable alone and
// diagnostic in company.
//
// Two rules govern this module:
//
//   1. A pattern that cannot point at the exact markers and values that fired
//      it is never emitted. Evidence is not decoration here; it is the
//      precondition. Every branch below returns early if a required marker is
//      absent from the panel rather than assuming a value.
//   2. Thresholds are read from the panel's OWN reference and optimal windows
//      (refLow/refHigh/optimalLow/optimalHigh on each Biomarker) rather than
//      from cutoffs invented in this file. If the lab definition changes, the
//      patterns move with it, and nothing here asserts a number the data does
//      not already carry.
//
// Nothing in this module is a diagnosis and nothing here proposes treatment.
// Every pattern carries requiresProvider: true.
// =============================================================================

import type { Biomarker } from "@/lib/types";
import { getLabsForClient } from "@/lib/mock/labs";
import { clientMap } from "@/lib/mock/clients";
import { clamp } from "@/lib/utils";

/** A single marker as cited by a pattern — value plus the windows it is judged against. */
export interface PatternMarker {
  key: string;
  name: string;
  value: number;
  unit: string;
  status: Biomarker["status"];
  refLow: number;
  refHigh: number;
  optimalLow: number;
  optimalHigh: number;
  /** Why THIS marker matters to THIS pattern — the reason it was cited. */
  note: string;
}

export interface Pattern {
  id: string;
  name: string;
  /** 0..1. Derived from how far the constituent markers sit outside their windows. */
  confidence: number;
  markers: PatternMarker[];
  /** Clinician-facing. Assumes the reader knows the physiology. */
  explanation: string;
  /** Plain language. No jargon, no numbers presented as verdicts, nothing alarming without context. */
  memberExplanation: string;
  whatItSuggests: string;
  nextStep: string;
  requiresProvider: true;
}

// ---------------------------------------------------------------------------
// Evidence helpers
// ---------------------------------------------------------------------------

/**
 * A biomarker with its optimal window resolved.
 *
 * `optimalLow`/`optimalHigh` are optional on Biomarker because not every
 * marker has a tighter target than the lab reference. Every threshold in this
 * file is expressed against the optimal window, so the window is resolved once
 * here — falling back to the reference range — rather than defended at each of
 * the forty-odd comparisons below.
 */
type ScoredMarker = Biomarker & { optimalLow: number; optimalHigh: number };

type Panel = Record<string, ScoredMarker>;

function resolve(b: Biomarker): ScoredMarker {
  return { ...b, optimalLow: b.optimalLow ?? b.refLow, optimalHigh: b.optimalHigh ?? b.refHigh };
}

function panelFor(clientId: string): Panel | undefined {
  const labs = getLabsForClient(clientId);
  if (!labs) return undefined;
  return Object.fromEntries(labs.biomarkers.map((b) => [b.key, resolve(b)]));
}

function cite(b: ScoredMarker, note: string): PatternMarker {
  return {
    key: b.key,
    name: b.name,
    value: b.value,
    unit: b.unit,
    status: b.status,
    refLow: b.refLow,
    refHigh: b.refHigh,
    optimalLow: b.optimalLow,
    optimalHigh: b.optimalHigh,
    note,
  };
}

/** How far above its optimal ceiling a marker sits, as a fraction of the reference span. */
function overshoot(b: ScoredMarker): number {
  const span = b.refHigh - b.refLow || 1;
  return Math.max(0, (b.value - b.optimalHigh) / span);
}

/** How far below its optimal floor a marker sits, as a fraction of the reference span. */
function undershoot(b: ScoredMarker): number {
  const span = b.refHigh - b.refLow || 1;
  return Math.max(0, (b.optimalLow - b.value) / span);
}

/**
 * Confidence is a function of separation, not of belief.
 *
 * Floors at 0.55 because a pattern only reaches this function once every
 * constituent marker has already qualified; ceilings at 0.92 because a lab
 * panel read without a history, an exam or a symptom interview is never
 * conclusive, and a number rounder than that would imply it was.
 */
function confidenceFrom(...separations: number[]): number {
  const total = separations.reduce((s, v) => s + v, 0) / Math.max(1, separations.length);
  return Math.round(clamp(0.55 + total * 1.6, 0.55, 0.92) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Individual detectors
//
// Each returns a Pattern or undefined. Each reads only from `panel`, so an
// incomplete draw degrades to "fewer patterns" and never to a guessed one.
// ---------------------------------------------------------------------------

/**
 * Normal total testosterone WITH low free testosterone.
 *
 * The single most commonly missed pattern in men's health. Total T measures
 * everything in circulation including the fraction bound to SHBG and therefore
 * unavailable to tissue; free T measures what the receptor can actually reach.
 * A man told "your testosterone is normal" while symptomatic is usually this
 * pattern, and SHBG is usually the reason.
 */
function normalTotalLowFree(panel: Panel): Pattern | undefined {
  const total = panel["total_t"];
  const free = panel["free_t"];
  if (!total || !free) return undefined;

  const totalIsNormal = total.value >= total.refLow && total.value <= total.refHigh;
  const freeIsLow = free.value < free.optimalLow;
  if (!totalIsNormal || !freeIsLow) return undefined;

  const shbg = panel["shbg"];
  const shbgHigh = shbg ? shbg.value > shbg.optimalHigh : false;

  const markers: PatternMarker[] = [
    cite(total, "Inside the laboratory reference range — the value that gets a man told he is fine."),
    cite(free, "Below the optimal floor — the bioavailable fraction that tissue can actually use."),
  ];
  if (shbg) {
    markers.push(
      cite(
        shbg,
        shbgHigh
          ? "Above optimal — binds testosterone and is the most likely reason free T sits low against a normal total."
          : "Within optimal — does not explain the gap on its own, so the discordance needs another explanation.",
      ),
    );
  }

  return {
    id: "pattern-normal-total-low-free",
    name: "Normal total testosterone with low free testosterone",
    confidence: confidenceFrom(undershoot(free), shbgHigh && shbg ? overshoot(shbg) : 0),
    markers,
    explanation:
      `Total testosterone at ${total.value} ${total.unit} sits inside the reference range while free testosterone at ` +
      `${free.value} ${free.unit} sits below the optimal floor of ${free.optimalLow}. Total T includes the SHBG- and ` +
      `albumin-bound fractions, so a normal total can coexist with a bioavailable deficit. ` +
      (shbg
        ? `SHBG is ${shbg.value} ${shbg.unit} against an optimal window of ${shbg.optimalLow}–${shbg.optimalHigh}.`
        : `SHBG is not on this panel, which leaves the binding hypothesis untested.`),
    memberExplanation:
      "Your total testosterone reading looks normal, but the portion your body can actually use is running low. " +
      "Those are two different measurements, and the second one is the one that tracks with how you feel. " +
      "It is a common reason someone is told their labs are fine while their symptoms are not.",
    whatItSuggests:
      "A binding-protein problem rather than a production problem. SHBG is the first thing to explain; thyroid status, " +
      "liver function, insulin resistance and body composition all move it.",
    nextStep: shbg
      ? "Provider to review free T against SHBG and confirm with a repeat draw under consistent morning, fasted conditions."
      : "Provider to consider adding SHBG and albumin to the next draw so the free fraction can be interpreted rather than inferred.",
    requiresProvider: true,
  };
}

/**
 * Low testosterone with LOW/normal LH+FSH (secondary) versus HIGH LH+FSH (primary).
 *
 * These are the same complaint and completely different diseases. Primary is a
 * testicular failure with an intact pituitary shouting at it; secondary is a
 * pituitary or hypothalamic signal problem with testes that would respond if
 * asked. The workups diverge immediately, which is why the distinction belongs
 * on the first read and not the third visit.
 */
function gonadalAxis(panel: Panel): Pattern | undefined {
  const total = panel["total_t"];
  const lh = panel["lh"];
  const fsh = panel["fsh"];
  if (!total || !lh || !fsh) return undefined;
  /**
   * Gate on the REFERENCE floor, not the optimal floor.
   *
   * This previously fired for any total testosterone below the optimal floor,
   * which meant a value of 520 ng/dL — inside a 300–1000 reference range and
   * classified "watch" — produced a card titled "Low testosterone" and told the
   * member "your testosterone is low." That is reporting hypogonadism to a
   * clinician, and paraphrasing it to a patient, about a normal result.
   *
   * Sub-optimal-but-in-range is a real and useful observation for this clinic,
   * but it is a DIFFERENT finding and it does not get to borrow this language.
   */
  const genuinelyLow = total.value < total.refLow;
  if (!genuinelyLow) return undefined;

  const elevatedGonadotropins = lh.value > lh.refHigh || fsh.value > fsh.refHigh;
  const unelevated = lh.value <= lh.optimalHigh && fsh.value <= fsh.optimalHigh;
  if (!elevatedGonadotropins && !unelevated) return undefined; // mid-range: not separable, so say nothing

  const primary = elevatedGonadotropins;

  const markers: PatternMarker[] = [
    cite(total, `Below the optimal floor of ${total.optimalLow} ${total.unit} — the finding under investigation.`),
    cite(
      lh,
      primary
        ? "Elevated above the reference ceiling — the pituitary is driving hard against a gonad that is not answering."
        : "Not elevated despite low testosterone — an inappropriately normal signal is the finding, not a normal one.",
    ),
    cite(
      fsh,
      primary
        ? "Elevated alongside LH — consistent with testicular rather than central failure."
        : "Not elevated alongside LH — consistent with a central signalling problem.",
    ),
  ];

  return {
    id: primary ? "pattern-primary-hypogonadism" : "pattern-secondary-hypogonadism",
    name: primary
      ? "Low testosterone with elevated LH/FSH — primary pattern"
      : "Low testosterone with non-elevated LH/FSH — secondary pattern",
    confidence: confidenceFrom(
      undershoot(total),
      primary ? overshoot(lh) + overshoot(fsh) : undershoot(lh) * 0.5 + undershoot(fsh) * 0.5 + 0.1,
    ),
    markers,
    explanation: primary
      ? `Testosterone ${total.value} ${total.unit} with LH ${lh.value} and FSH ${fsh.value} ${fsh.unit} at or above the ` +
        `reference ceiling. The feedback loop is intact and the pituitary is compensating, which localises the problem to the gonad.`
      : `Testosterone ${total.value} ${total.unit} with LH ${lh.value} and FSH ${fsh.value} ${fsh.unit} that have NOT risen ` +
        `in response. A normal gonadotropin against a low testosterone is not reassurance — it is the abnormality, and it ` +
        `localises the problem above the gonad.`,
    memberExplanation: primary
      ? "Your body is sending a strong signal to produce testosterone and not getting the response it is asking for. " +
        "That points at where the hormone is made rather than at the signal itself."
      : "Your testosterone is low, but the signal that normally tells your body to make more has not increased. " +
        "That points at the signalling side rather than at production capacity, and it changes what is worth looking into.",
    whatItSuggests: primary
      ? "Testicular origin. History of injury, infection, chemotherapy, radiation or a genetic cause is worth establishing; " +
        "karyotype may be relevant in the right context."
      : "Central origin. Prolactin, iron studies, pituitary imaging where indicated, plus the reversible contributors — " +
        "sleep debt, opioids, glucocorticoids, prior anabolic use, obesity and untreated apnoea.",
    nextStep:
      "Provider to confirm with a repeat morning draw before any workup is ordered, and to take an exposure and medication " +
      "history alongside it.",
    requiresProvider: true,
  };
}

/**
 * Subclinical hypothyroid pattern: raised TSH with low-normal free T3,
 * strengthened when reverse T3 is elevated.
 *
 * TSH alone is the marker most likely to be read in isolation. Peripheral
 * conversion is where a man with a "normal" thyroid panel loses energy,
 * recovery and body composition.
 */
function subclinicalThyroid(panel: Panel): Pattern | undefined {
  const tsh = panel["tsh"];
  const ft3 = panel["ft3"];
  if (!tsh || !ft3) return undefined;
  if (tsh.value <= tsh.optimalHigh) return undefined;
  if (ft3.value > ft3.optimalLow) return undefined;
  /**
   * "Subclinical" means the TSH is still inside the lab's reference range —
   * that is the entire point of the pattern, and of the copy that says a
   * standard report would call it normal.
   *
   * Without this guard an overtly elevated TSH (5.8 against a 4.5 ceiling,
   * already flagged high) was being downgraded to subclinical, and the member
   * was told a flagged result reads as normal. Both statements were false.
   * An overt elevation is a different, more urgent finding and needs its own
   * pattern rather than this one's reassuring framing.
   */
  if (tsh.value > tsh.refHigh) return undefined;

  const rt3 = panel["rt3"];
  const ft4 = panel["ft4"];
  const rt3High = rt3 ? rt3.value > rt3.optimalHigh : false;

  const markers: PatternMarker[] = [
    cite(tsh, `Above the optimal ceiling of ${tsh.optimalHigh} ${tsh.unit} — the pituitary is asking for more output.`),
    cite(ft3, `At or below the optimal floor of ${ft3.optimalLow} ${ft3.unit} — the active hormone at the tissue.`),
  ];
  if (ft4) markers.push(cite(ft4, "Included because T4 is the substrate; conversion cannot be judged without it."));
  if (rt3) {
    markers.push(
      cite(
        rt3,
        rt3High
          ? "Above optimal — the inactive isomer is competing, which supports a conversion problem rather than a supply problem."
          : "Within optimal — argues against a conversion block as the main driver.",
      ),
    );
  }

  return {
    id: "pattern-subclinical-hypothyroid",
    name: "Subclinical hypothyroid pattern with low-normal free T3",
    confidence: confidenceFrom(overshoot(tsh), undershoot(ft3), rt3High && rt3 ? overshoot(rt3) : 0),
    markers,
    explanation:
      `TSH ${tsh.value} ${tsh.unit} above optimal with free T3 ${ft3.value} ${ft3.unit} at the bottom of its window` +
      (rt3 ? ` and reverse T3 ${rt3.value} ${rt3.unit}` : "") +
      `. A TSH inside the reference range with a floor-level free T3 reads as "normal thyroid" on a standard report while ` +
      `the tissue-level picture is anything but. Overlaps heavily with the fatigue, cold intolerance and stalled ` +
      `body-composition complaints that arrive labelled as low testosterone.`,
    memberExplanation:
      "Your thyroid signal is running higher than we would like while the active thyroid hormone is sitting at the bottom " +
      "of its range. A standard report calls that normal. It is worth a proper look, because it affects energy, temperature " +
      "and how your body responds to training.",
    whatItSuggests:
      "Reduced peripheral conversion or early thyroid insufficiency. Selenium, iron, cortisol load, caloric restriction and " +
      "illness all suppress conversion, and each is worth excluding before the panel is treated as fixed.",
    nextStep:
      "Provider to review with thyroid antibodies and a repeat panel; correlate with symptoms rather than treating a number.",
    requiresProvider: true,
  };
}

/**
 * Insulin resistance AHEAD of glycaemia: raised fasting insulin while glucose
 * and A1C are still normal.
 *
 * Insulin rises for years while the pancreas is still winning. By the time A1C
 * moves, the compensation has already failed. Waiting for glucose to declare
 * itself is waiting to be late.
 */
function insulinAheadOfGlucose(panel: Panel): Pattern | undefined {
  const insulin = panel["insulin"];
  const glucose = panel["glucose"];
  const a1c = panel["a1c"];
  if (!insulin || !glucose || !a1c) return undefined;
  if (insulin.value <= insulin.optimalHigh) return undefined;
  // The point of the pattern is that the downstream markers have NOT moved yet.
  if (glucose.value > glucose.refHigh || a1c.value > a1c.refHigh) return undefined;

  const trig = panel["trig"];
  const hdl = panel["hdl"];

  const markers: PatternMarker[] = [
    cite(insulin, `Above the optimal ceiling of ${insulin.optimalHigh} ${insulin.unit} — the compensation, and the earliest mover.`),
    cite(glucose, "Still inside the reference range — the reason a standard screen reads as clear."),
    cite(a1c, "Still inside the reference range — lags insulin by years, not weeks."),
  ];
  if (trig) markers.push(cite(trig, "Triglycerides track insulin resistance and are cited as corroboration."));
  if (hdl) markers.push(cite(hdl, "HDL falls as insulin resistance advances; included for the same reason."));

  return {
    id: "pattern-insulin-ahead-of-glycaemia",
    name: "Insulin resistance ahead of glycaemia",
    confidence: confidenceFrom(overshoot(insulin), trig ? overshoot(trig) : 0),
    markers,
    explanation:
      `Fasting insulin ${insulin.value} ${insulin.unit} against glucose ${glucose.value} ${glucose.unit} and A1C ` +
      `${a1c.value}${a1c.unit}, both inside reference. The pancreas is compensating successfully, which is precisely why ` +
      `the glycaemic markers look reassuring. This is the window where the problem is still cheap to reverse, and it is ` +
      `invisible on any panel that does not draw fasting insulin.`,
    memberExplanation:
      "Your blood sugar readings are normal — but your body is having to work harder than it should to keep them there. " +
      "That extra effort shows up years before blood sugar does, and it is the easiest stage to turn around.",
    whatItSuggests:
      "Early insulin resistance. Also worth weighing against testosterone, since low testosterone and insulin resistance " +
      "each worsen the other and the pair is frequently treated as one problem when it is two.",
    nextStep:
      "Provider to review with body composition and waist measurement; consider HOMA-IR from this same draw before adding tests.",
    requiresProvider: true,
  };
}

/**
 * Inflammation-driven pattern: raised hs-CRP alongside low ferritin or raised
 * homocysteine.
 *
 * Ferritin is the trap here — it is an acute-phase reactant, so an inflamed
 * man with genuinely low iron stores can present with a ferritin that has been
 * dragged up toward normal. Low ferritin WITH high CRP means the true store is
 * lower than the number reads.
 */
function inflammationDriven(panel: Panel): Pattern | undefined {
  const hscrp = panel["hscrp"] ?? panel["crp"];
  if (!hscrp) return undefined;
  if (hscrp.value <= hscrp.optimalHigh) return undefined;

  const ferritin = panel["ferritin"];
  const homocysteine = panel["homocysteine"];
  const ferritinLow = ferritin ? ferritin.value < ferritin.optimalLow : false;
  const homocysteineHigh = homocysteine ? homocysteine.value > homocysteine.optimalHigh : false;
  if (!ferritinLow && !homocysteineHigh) return undefined;

  const markers: PatternMarker[] = [
    cite(hscrp, `Above the optimal ceiling of ${hscrp.optimalHigh} ${hscrp.unit} — systemic inflammatory signal.`),
  ];
  if (ferritinLow && ferritin) {
    markers.push(
      cite(
        ferritin,
        "Below optimal despite active inflammation. Ferritin rises with inflammation, so the true iron store is likely " +
          "lower than this number reads.",
      ),
    );
  }
  if (homocysteineHigh && homocysteine) {
    markers.push(cite(homocysteine, "Above optimal — methylation and B-vitamin status are worth establishing."));
  }

  return {
    id: "pattern-inflammation-driven",
    name: "Inflammatory pattern with iron or methylation involvement",
    confidence: confidenceFrom(
      overshoot(hscrp),
      ferritinLow && ferritin ? undershoot(ferritin) : 0,
      homocysteineHigh && homocysteine ? overshoot(homocysteine) : 0,
    ),
    markers,
    explanation:
      `hs-CRP ${hscrp.value} ${hscrp.unit} above optimal` +
      (ferritinLow && ferritin ? `, with ferritin ${ferritin.value} ${ferritin.unit} below its optimal floor` : "") +
      (homocysteineHigh && homocysteine ? `, with homocysteine ${homocysteine.value} ${homocysteine.unit} above optimal` : "") +
      `. Inflammation suppresses the gonadal axis, blunts peripheral thyroid conversion and drives fatigue directly, so ` +
      `this pattern frequently sits underneath a hormone complaint rather than beside it.`,
    memberExplanation:
      "There is a background inflammatory signal in your bloodwork, and it is affecting other markers alongside it. " +
      "Inflammation drags down energy and recovery on its own, so it is worth understanding the source rather than " +
      "working around it.",
    whatItSuggests:
      "An active inflammatory driver — infection, gut, dental, visceral adiposity, overtraining or occult blood loss. " +
      "When ferritin is low against a raised CRP, iron deficiency is more likely than the number suggests, not less.",
    nextStep:
      "Provider to repeat hs-CRP outside any acute illness and pair it with a full iron panel before conclusions are drawn.",
    requiresProvider: true,
  };
}

/**
 * Lipid risk hidden by a normal LDL-C: raised ApoB (or Lp(a) where drawn).
 *
 * LDL-C measures cholesterol carried; ApoB counts the particles carrying it.
 * A man with small dense particles can carry a normal LDL-C on a high particle
 * count, which is the risk that gets discharged as "cholesterol is fine".
 */
function hiddenLipidRisk(panel: Panel): Pattern | undefined {
  const ldl = panel["ldl"];
  if (!ldl) return undefined;
  const ldlNormal = ldl.value <= ldl.refHigh;
  if (!ldlNormal) return undefined;

  const apob = panel["apob"];
  const lpa = panel["lpa"];
  const apobHigh = apob ? apob.value > apob.optimalHigh : false;
  const lpaHigh = lpa ? lpa.value > lpa.refHigh : false;
  if (!apobHigh && !lpaHigh) return undefined;

  const markers: PatternMarker[] = [
    cite(ldl, "Inside the reference range — the number that produces a clean bill of cholesterol health."),
  ];
  if (apobHigh && apob) {
    markers.push(
      cite(apob, "Above optimal — one ApoB per atherogenic particle, so this counts particles rather than their cargo."),
    );
  }
  if (lpaHigh && lpa) {
    markers.push(cite(lpa, "Above the reference ceiling — largely genetically set and independent of lifestyle."));
  }
  const trig = panel["trig"];
  if (trig) markers.push(cite(trig, "Triglycerides included because they shift particle size and are cited as context."));

  return {
    id: "pattern-hidden-lipid-risk",
    name: "Atherogenic risk hidden behind a normal LDL-C",
    confidence: confidenceFrom(apobHigh && apob ? overshoot(apob) : 0, lpaHigh && lpa ? overshoot(lpa) : 0),
    markers,
    explanation:
      `LDL-C ${ldl.value} ${ldl.unit} sits inside reference` +
      (apobHigh && apob ? ` while ApoB is ${apob.value} ${apob.unit}, above its optimal ceiling of ${apob.optimalHigh}` : "") +
      (lpaHigh && lpa ? ` and Lp(a) is ${lpa.value} ${lpa.unit}, above the reference ceiling` : "") +
      `. Particle count and cholesterol content diverge, and the discordance is the finding. Relevant here because ` +
      `haematocrit and blood pressure changes on testosterone therapy sit on top of whatever baseline risk exists.`,
    memberExplanation:
      "Your standard cholesterol number looks fine, but a more precise measure of cardiovascular risk is running higher " +
      "than we would like. They can disagree, and when they do the more precise one is the one worth acting on.",
    whatItSuggests:
      "Discordant lipid risk. Worth establishing family history and, where relevant, a one-time Lp(a) so the baseline is " +
      "known rather than assumed.",
    nextStep: "Provider to review ApoB-led risk with the member and decide whether imaging or further lipid workup is warranted.",
    requiresProvider: true,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * All patterns detectable for this member from the labs on file.
 *
 * Sorted by confidence so a clinician reading top-down reads strongest first.
 * Returns [] when there are no labs — an empty panel yields no patterns, never
 * a hedged one.
 */
export function detectPatterns(clientId: string): Pattern[] {
  const panel = panelFor(clientId);
  if (!panel) return [];
  const client = clientMap[clientId];

  const out: Pattern[] = [];

  // Free-T/SHBG discordance and the LH/FSH split are framed against male
  // physiology and male reference windows. Running them on a female panel
  // would produce confident nonsense, so they are gated rather than adapted.
  if (client?.sex === "male") {
    const a = normalTotalLowFree(panel);
    if (a) out.push(a);
    const b = gonadalAxis(panel);
    if (b) out.push(b);
  }

  for (const detector of [subclinicalThyroid, insulinAheadOfGlucose, inflammationDriven, hiddenLipidRisk]) {
    const p = detector(panel);
    if (p) out.push(p);
  }

  // Defensive: a pattern with no cited evidence must never reach the UI.
  return out.filter((p) => p.markers.length > 0).sort((a, b) => b.confidence - a.confidence);
}

/** Confidence as a display band — keeps every surface labelling it the same way. */
export function confidenceLabel(confidence: number): "Strong" | "Moderate" | "Suggestive" {
  if (confidence >= 0.8) return "Strong";
  if (confidence >= 0.68) return "Moderate";
  return "Suggestive";
}
