// =============================================================================
// Apex — TRT safety monitoring
//
// This is the module a generic wellness app does not have. Testosterone
// therapy is safe when it is monitored and unsafe when it is not, and the
// difference between those two sentences is entirely operational: does someone
// look at the right marker at the right interval, and does the system make
// that impossible to forget.
//
// ---------------------------------------------------------------------------
// HARD RULE — enforced, not merely intended:
//
//   This module NEVER recommends a dose change, a stop, or a start.
//
// It surfaces what a clinician should look at, shows the evidence that made it
// worth looking at, and names who must decide. Every SafetyFlag carries
// requiresProvider: true and there is no code path that clears it. Nothing
// here emits an amount, a frequency of administration, or a route. If a future
// edit adds one, it belongs in the plan-of-care engine behind provider
// approval, not here.
//
// `memberSafe` gates member visibility. A flag is memberSafe only when reading
// it without a clinician in the room informs rather than frightens. Anything
// that would land as "something is wrong with me" stays clinician-only.
// =============================================================================

import type { Biomarker, Client } from "@/lib/types";
import { getLabsForClient } from "@/lib/mock/labs";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { clientMap } from "@/lib/mock/clients";
import { formatDate } from "@/lib/utils";

export type SafetySeverity = "watch" | "action" | "urgent";

export interface SafetyEvidence {
  label: string;
  value: string;
  /** The window this value is judged against, when one exists. */
  range?: string;
  status?: Biomarker["status"];
  /** Direction of travel from this member's own prior draws, when history exists. */
  trend?: string;
}

export interface SafetyFlag {
  id: string;
  severity: SafetySeverity;
  title: string;
  /** Why this matters physiologically — the reason the flag exists at all. */
  why: string;
  evidence: SafetyEvidence[];
  /** What monitoring this finding implies. Never a treatment instruction. */
  monitoringExpectation: string;
  requiresProvider: true;
  /** True only when a member can read this without a clinician present and be better off. */
  memberSafe: boolean;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const HORMONE_CATEGORY = "Hormone optimization discussion";

/** On testosterone therapy now, per the programs on file. */
function onTherapy(client: Client): boolean {
  return client.programs.some((p) => p.category === HORMONE_CATEGORY && p.status === "Active");
}

/**
 * In the hormone pathway but not yet started — labs drawn, plan in review, or
 * a hormone program paused. These members are exactly who the fertility
 * conversation is for, because the useful time to have it is before the first
 * dose exists.
 */
function consideringTherapy(client: Client): boolean {
  if (onTherapy(client)) return false;
  const inPathway = ["Results Ready", "Plan Review", "Labs Ordered", "Consult Booked"].includes(client.status);
  const hormoneIntent =
    client.programs.some((p) => p.category === HORMONE_CATEGORY) ||
    client.goals.some((g) => g === "Libido" || g === "Muscle gain" || g === "Energy");
  return inPathway && hormoneIntent;
}

/**
 * A biomarker with its optimal window resolved. `optimalLow`/`optimalHigh` are
 * optional on Biomarker; every comparison in this file is expressed against
 * them, so the fallback to the lab reference range is applied once here rather
 * than re-argued at each call site.
 */
type ScoredMarker = Biomarker & { optimalLow: number; optimalHigh: number };

function marker(clientId: string, key: string): ScoredMarker | undefined {
  const b = getLabsForClient(clientId)?.biomarkers.find((m) => m.key === key);
  if (!b) return undefined;
  return { ...b, optimalLow: b.optimalLow ?? b.refLow, optimalHigh: b.optimalHigh ?? b.refHigh };
}

function fmt(b: ScoredMarker): string {
  return `${b.value} ${b.unit}`;
}

function ranges(b: ScoredMarker): string {
  return `ref ${b.refLow}–${b.refHigh} · optimal ${b.optimalLow}–${b.optimalHigh} ${b.unit}`;
}

/** Change from the earliest point on this marker's own history to the current value. */
function delta(b: ScoredMarker): number | undefined {
  if (!b.history || b.history.length < 2) return undefined;
  return Math.round((b.value - b.history[0].value) * 10) / 10;
}

function trendText(b: ScoredMarker): string | undefined {
  const d = delta(b);
  if (d === undefined || !b.history) return undefined;
  const dir = d > 0 ? "up" : d < 0 ? "down" : "flat";
  return `${dir} ${Math.abs(d)} ${b.unit} since ${formatDate(b.history[0].date)} (${b.history.length} draws on file)`;
}

/**
 * Monitoring cadence is set by the treating provider and by this clinic's
 * protocol — Apex does not invent intervals and does not assert one here.
 * What Apex can say honestly is what is on file and how old it is.
 */
function lastDrawLine(client: Client): string {
  return client.latestLabDate
    ? `Most recent panel on file: ${formatDate(client.latestLabDate)}.`
    : `No panel on file in Apex.`;
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

/**
 * Haematocrit / erythrocytosis.
 *
 * Testosterone raises red cell mass; erythrocytosis is the most common real
 * complication of therapy and the one most reliably caught by simply looking.
 * A rising trend inside the reference range is worth surfacing on its own,
 * because the trajectory is the finding and a single in-range value hides it.
 */
function haematocritWatch(client: Client): SafetyFlag | undefined {
  const hct = marker(client.id, "hct");
  if (!hct) return undefined;
  if (!onTherapy(client) && hct.value <= hct.refHigh) return undefined;

  const rise = delta(hct) ?? 0;
  const aboveRef = hct.value > hct.refHigh;
  const markedly = hct.value > hct.refHigh + (hct.refHigh - hct.refLow) * 0.25;
  const aboveOptimal = hct.value > hct.optimalHigh;
  const rising = rise >= 1.5;

  if (!aboveRef && !(aboveOptimal && rising)) return undefined;

  const severity: SafetySeverity = markedly ? "urgent" : aboveRef ? "action" : "watch";

  return {
    id: "safety-haematocrit",
    severity,
    title: aboveRef ? "Haematocrit above the reference ceiling" : "Haematocrit rising toward the reference ceiling",
    why:
      "Testosterone stimulates erythropoiesis, so red cell mass rises predictably on therapy. Erythrocytosis is the most " +
      "common complication of TRT and it is silent until it is not. The trajectory matters as much as the value: a " +
      "haematocrit climbing inside the range is a different situation from one sitting still.",
    evidence: [
      {
        label: hct.name,
        value: fmt(hct),
        range: ranges(hct),
        status: hct.status,
        trend: trendText(hct),
      },
      ...(onTherapy(client)
        ? [
            {
              label: "Therapy status",
              value: "Active hormone optimization program on file",
            },
          ]
        : []),
    ],
    monitoringExpectation:
      `Haematocrit is a standing monitoring marker for anyone on testosterone therapy; the recheck interval is set by the ` +
      `treating provider and this clinic's protocol. ${lastDrawLine(client)} Hydration status and sleep-disordered ` +
      `breathing both move this number and are worth establishing before the value is interpreted. Apex surfaces the ` +
      `trend; the provider decides what follows.`,
    requiresProvider: true,
    // A member reading "your blood is too thick" without a clinician present
    // gets fear and no action. This one stays on the clinical side.
    memberSafe: false,
  };
}

/**
 * Fertility preservation.
 *
 * Exogenous testosterone suppresses LH and FSH and with them spermatogenesis.
 * This is surfaced as a conversation to have BEFORE starting, because after
 * starting it becomes an apology. Recovery is usual but not guaranteed and not
 * fast, and a 34-year-old who was never asked has a legitimate grievance.
 */
function fertilityConversation(client: Client): SafetyFlag | undefined {
  if (client.sex !== "male") return undefined;
  if (client.age >= 40) return undefined;
  const starting = consideringTherapy(client);
  const active = onTherapy(client);
  if (!starting && !active) return undefined;

  const lh = marker(client.id, "lh");
  const fsh = marker(client.id, "fsh");

  return {
    id: "safety-fertility",
    severity: starting ? "action" : "watch",
    title: starting
      ? "Fertility conversation due before therapy starts"
      : "Fertility status to confirm — member is under 40 and on therapy",
    why:
      "Exogenous testosterone suppresses LH and FSH, and spermatogenesis follows them down. Suppression is usually " +
      "reversible after stopping, but recovery is measured in months, is not guaranteed, and cannot be undone on request. " +
      "For a man under 40 this is a decision to make deliberately rather than discover later.",
    evidence: [
      { label: "Age", value: `${client.age}` },
      {
        label: "Therapy status",
        value: starting ? "In the hormone pathway, not yet started" : "Active hormone optimization program on file",
      },
      ...(lh ? [{ label: lh.name, value: fmt(lh), range: ranges(lh), status: lh.status, trend: trendText(lh) }] : []),
      ...(fsh ? [{ label: fsh.name, value: fmt(fsh), range: ranges(fsh), status: fsh.status, trend: trendText(fsh) }] : []),
    ],
    monitoringExpectation: starting
      ? "Provider to document a family-planning discussion and, where the member wants the option preserved, the baseline " +
        "semen analysis and preservation pathway — before any therapy decision is made. Apex flags the conversation; it " +
        "does not prescribe its outcome."
      : "Provider to confirm the fertility discussion is documented and revisit it if the member's plans have changed. " +
        `${lastDrawLine(client)}`,
    requiresProvider: true,
    // A member should absolutely see this one. It is a choice that belongs to
    // them, and surfacing it early is the whole point.
    memberSafe: true,
  };
}

/**
 * Sleep apnoea.
 *
 * Testosterone can worsen untreated obstructive sleep apnoea, and the risk
 * factors cluster: adiposity, high visceral fat, poor reported sleep. None of
 * these is diagnostic alone, which is why the flag requires the coincidence
 * rather than any single input.
 */
function sleepApnoeaWatch(client: Client): SafetyFlag | undefined {
  if (!onTherapy(client) && !consideringTherapy(client)) return undefined;
  const scan = getScanForClient(client.id);
  const poorSleep = client.symptoms.includes("Poor sleep");
  if (!scan) return undefined;

  const bfHigh = scan.bodyFatPct >= (client.sex === "male" ? 25 : 33);
  const visceralHigh = scan.visceralFatLevel >= 10;
  const factors = [bfHigh, visceralHigh, poorSleep].filter(Boolean).length;
  if (factors < 2) return undefined;

  return {
    id: "safety-sleep-apnoea",
    severity: factors === 3 ? "action" : "watch",
    title: "Sleep-disordered breathing risk alongside testosterone therapy",
    why:
      "Testosterone can worsen untreated obstructive sleep apnoea, and untreated apnoea independently suppresses " +
      "testosterone, raises haematocrit and drives cardiovascular risk. The two problems feed each other, so an unscreened " +
      "apnoea is a poor foundation for hormone therapy.",
    evidence: [
      { label: "Body fat", value: `${scan.bodyFatPct}%`, range: `scan ${formatDate(scan.scannedOn)} · ${scan.device}` },
      { label: "Visceral fat level", value: `${scan.visceralFatLevel}`, range: "InBody visceral index" },
      {
        label: "Reported sleep",
        value: poorSleep ? "Poor sleep reported at intake" : "No sleep complaint recorded",
      },
      {
        label: "Therapy status",
        value: onTherapy(client) ? "Active hormone optimization program on file" : "In the hormone pathway, not yet started",
      },
    ],
    monitoringExpectation:
      "Provider to consider formal apnoea screening and correlate with haematocrit, since both move together. Apex has no " +
      "sleep study on file for this member — this flag is built from body composition and reported symptoms only, and is " +
      "not a diagnosis of apnoea.",
    requiresProvider: true,
    memberSafe: true,
  };
}

/**
 * Estradiol — both extremes.
 *
 * The failure mode in this field is treating E2 as a number to minimise.
 * Over-suppressed estradiol in men causes joint pain, low libido, mood
 * disturbance and bone loss, which is the same complaint list that brought the
 * man in. Low E2 is flagged with the same seriousness as high, deliberately.
 */
function estradiolWatch(client: Client): SafetyFlag | undefined {
  if (client.sex !== "male") return undefined;
  const e2 = marker(client.id, "estradiol");
  if (!e2) return undefined;
  const high = e2.value > e2.refHigh;
  const low = e2.value < e2.refLow;
  if (!high && !low) return undefined;

  const relevantSymptoms = client.symptoms.filter((s) =>
    ["Joint pain", "Low libido", "Mood changes", "Poor sleep"].includes(s),
  );

  return {
    id: "safety-estradiol",
    severity: "action",
    title: low ? "Estradiol below the reference floor — over-suppression" : "Estradiol above the reference ceiling",
    why: low
      ? "Over-suppression is as much a problem as elevation, and it is the more commonly self-inflicted one. Men need " +
        "estradiol: too little causes joint pain, low libido, low mood and bone mineral density loss. An E2 driven under " +
        "the floor reproduces the exact symptom set the member came in to solve."
      : "Elevated estradiol in men on therapy can present with water retention, breast tenderness, mood change and blunted " +
        "libido. It is a finding to interpret against symptoms and assay method, not a number to chase downward on sight.",
    evidence: [
      { label: e2.name, value: fmt(e2), range: ranges(e2), status: e2.status, trend: trendText(e2) },
      ...(marker(client.id, "total_t")
        ? [
            {
              label: marker(client.id, "total_t")!.name,
              value: fmt(marker(client.id, "total_t")!),
              range: ranges(marker(client.id, "total_t")!),
              status: marker(client.id, "total_t")!.status,
            },
          ]
        : []),
      {
        label: "Correlating symptoms on file",
        value: relevantSymptoms.length ? relevantSymptoms.join(", ") : "None recorded",
      },
    ],
    monitoringExpectation:
      "Provider to interpret estradiol against symptoms and assay type — a sensitive assay is the only one worth reading " +
      `in men. ${lastDrawLine(client)} Apex surfaces the value and the direction; any change to therapy is the provider's ` +
      "decision alone.",
    requiresProvider: true,
    memberSafe: false,
  };
}

/**
 * PSA and prostate monitoring for men over 40 on therapy.
 *
 * Testosterone does not cause prostate cancer, but it can unmask an existing
 * one, and monitoring is the standing expectation regardless. Apex reports the
 * value, its trend and the age of the draw — not an interval it invented.
 */
function prostateMonitoring(client: Client): SafetyFlag | undefined {
  if (client.sex !== "male") return undefined;
  if (client.age < 40) return undefined;
  if (!onTherapy(client) && !consideringTherapy(client)) return undefined;

  const psa = marker(client.id, "psa");
  const rise = psa ? delta(psa) ?? 0 : 0;
  const elevated = psa ? psa.value > psa.refHigh : false;
  const aboveOptimal = psa ? psa.value > psa.optimalHigh : false;
  const rising = rise >= 0.5;

  const severity: SafetySeverity = elevated ? "urgent" : aboveOptimal || rising ? "action" : "watch";

  return {
    id: "safety-prostate",
    severity,
    title: psa
      ? elevated
        ? "PSA above the reference ceiling"
        : rising
          ? "PSA rising across draws on file"
          : "Prostate monitoring — man over 40 in the therapy pathway"
      : "No PSA on file for a man over 40 in the therapy pathway",
    why:
      "Testosterone therapy does not cause prostate cancer, but it can unmask disease that is already present, and the " +
      "velocity of change carries more information than any single value. Baseline before therapy and periodic review " +
      "after are the standing expectation for men over 40.",
    evidence: psa
      ? [
          { label: psa.name, value: fmt(psa), range: ranges(psa), status: psa.status, trend: trendText(psa) },
          { label: "Age", value: `${client.age}` },
          {
            label: "Therapy status",
            value: onTherapy(client) ? "Active hormone optimization program on file" : "In the hormone pathway, not yet started",
          },
        ]
      : [
          { label: "PSA", value: "Not on the most recent panel in Apex" },
          { label: "Age", value: `${client.age}` },
        ],
    monitoringExpectation:
      `PSA is a standing monitoring marker for men over 40 on therapy; the recheck interval is set by the treating ` +
      `provider and this clinic's protocol. ${lastDrawLine(client)} Apex reports the value, the trend and the age of the ` +
      `draw. It does not schedule, and it does not interpret a rise on the provider's behalf.`,
    requiresProvider: true,
    memberSafe: false,
  };
}

/**
 * Blood pressure and cardiovascular markers.
 *
 * Apex holds no blood-pressure readings. That absence is itself the finding
 * worth surfacing on a therapy that can raise it — the honest flag is "this is
 * not being measured", not a fabricated reading. Lipid and haematologic
 * markers that ARE on file are reported alongside.
 */
function cardiovascularWatch(client: Client): SafetyFlag | undefined {
  if (!onTherapy(client)) return undefined;

  const apob = marker(client.id, "apob");
  const trig = marker(client.id, "trig");
  const hdl = marker(client.id, "hdl");
  const hct = marker(client.id, "hct");

  const concerning = [apob, trig, hct].filter((b) => b && b.value > b.optimalHigh).length;
  const hdlLow = hdl ? hdl.value < hdl.optimalLow : false;
  if (concerning === 0 && !hdlLow) return undefined;

  const evidence: SafetyEvidence[] = [
    {
      label: "Blood pressure",
      value: "Not recorded in Apex",
      range: "No readings on file for this member",
    },
  ];
  for (const b of [apob, trig, hdl, hct]) {
    if (b) evidence.push({ label: b.name, value: fmt(b), range: ranges(b), status: b.status, trend: trendText(b) });
  }

  return {
    id: "safety-cardiovascular",
    severity: concerning >= 2 ? "action" : "watch",
    title: "Cardiovascular markers to review — no blood pressure on file",
    why:
      "Testosterone therapy can raise blood pressure and shifts haematologic and lipid parameters. Apex holds no blood " +
      "pressure readings for this member, so the cardiovascular picture here is incomplete by construction. An unmeasured " +
      "risk factor is not an absent one.",
    evidence,
    monitoringExpectation:
      "Provider to capture blood pressure at the next contact and review it alongside the markers above. Apex is reporting " +
      "what it holds and naming what it does not; it makes no cardiovascular risk estimate from an incomplete set.",
    requiresProvider: true,
    memberSafe: false,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<SafetySeverity, number> = { urgent: 0, action: 1, watch: 2 };

/**
 * Every safety flag for this member, most severe first.
 *
 * Note what this function does NOT return: a recommendation, a score, or a
 * disposition. It returns things to look at, with the evidence that made them
 * worth looking at.
 */
export function safetyFlags(clientId: string): SafetyFlag[] {
  const client = clientMap[clientId];
  if (!client) return [];

  const checks = [
    haematocritWatch,
    fertilityConversation,
    sleepApnoeaWatch,
    estradiolWatch,
    prostateMonitoring,
    cardiovascularWatch,
  ];

  return checks
    .map((check) => check(client))
    .filter((f): f is SafetyFlag => Boolean(f) && (f as SafetyFlag).evidence.length > 0)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** The subset a member may see. The default is exclusion, not inclusion. */
export function memberSafeFlags(clientId: string): SafetyFlag[] {
  return safetyFlags(clientId).filter((f) => f.memberSafe);
}

export function severityCounts(flags: SafetyFlag[]): Record<SafetySeverity, number> {
  return flags.reduce(
    (acc, f) => ({ ...acc, [f.severity]: acc[f.severity] + 1 }),
    { urgent: 0, action: 0, watch: 0 } as Record<SafetySeverity, number>,
  );
}

/**
 * The line that appears on every safety surface. Exported so it is written
 * once and cannot drift between screens.
 */
export const SAFETY_DISCLAIMER =
  "Apex surfaces findings and the evidence behind them. It never recommends starting, stopping or changing a dose — " +
  "a licensed provider makes every clinical decision.";
