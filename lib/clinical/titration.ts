import type { Client } from "@/lib/types";
import { getClient } from "@/lib/mock/clients";
import { biomarker } from "@/lib/mock/labs";
import { prescriptionsForClient, cadenceLabel } from "@/lib/dosing/prescriptions";
import { safetyFlags, type SafetyFlag } from "@/lib/ai/safety";

/**
 * The titration assistant — decision SUPPORT for the TRT dose loop.
 *
 * WHAT IT IS, AND THE LINE IT DOES NOT CROSS
 * ------------------------------------------
 * Managing testosterone therapy is a loop: draw a trough panel, read where the
 * hormones and the safety markers sit and which way they are moving, and decide
 * whether the dose, the frequency, or nothing at all should change. The reading
 * and the trend are arithmetic a computer should do. The decision is a licensed
 * provider's, full stop.
 *
 * So this engine does exactly two honest things and no third:
 *   1. It lays out the trajectory of the markers that drive the decision —
 *      total and free testosterone, estradiol, haematocrit, PSA — each with
 *      where it sits against its optimal window and which way it is travelling.
 *   2. It surfaces the levers a provider might WEIGH, each with the reasoning
 *      shown, and the gates that must clear first.
 *
 * It never writes an order. It never states a number to change the dose to. Its
 * output is framed as "consider / weigh / discuss", because the difference
 * between decision support and practising medicine is precisely that framing,
 * and getting it wrong is not a UI nicety.
 *
 * THE GATES ARE REUSED, NOT REINVENTED
 * ------------------------------------
 * The blocking safety findings come straight from lib/ai/safety.ts
 * (`safetyFlags`), which already encodes erythrocytosis and prostate monitoring
 * carefully. An increase suggestion that ignored a haematocrit above range would
 * be worse than no suggestion at all, so those flags gate the direction here.
 */

const TRT_CATEGORY = "Hormone optimization discussion";

/**
 * On testosterone therapy — by the ground-truth signal, a signed testosterone
 * prescription, OR an active hormone-optimization program.
 *
 * The prescription is the truer test: you titrate what is actually being dosed,
 * and a signed testosterone script IS the therapy whether or not a program row
 * was also filled in. Keying off the program alone missed members who have the
 * script but a thinner enrolment record — exactly the members a titration tool
 * is for.
 */
function onTherapy(c: Client): boolean {
  const byProgram = c.programs.some((p) => p.category === TRT_CATEGORY && p.status === "Active");
  const byRx = prescriptionsForClient(c.id).some((rx) => /testosterone/i.test(rx.name));
  return byProgram || byRx;
}

export type Position = "below" | "optimal" | "above-optimal" | "above-ref";
export type TrendDir = "rising" | "falling" | "flat";

export interface TitrationMarker {
  key: string;
  name: string;
  value: number;
  unit: string;
  refLow: number;
  refHigh: number;
  optimalLow: number;
  optimalHigh: number;
  position: Position;
  trend: TrendDir;
  /** Signed change from the earliest draw on file to now, in the marker's unit. */
  delta: number | null;
  /** Prior points, for a sparkline. Includes the current value as the last point. */
  series: { date: string; value: number }[];
  /** Plain projection IF the current trend simply held. Deliberately hedged. */
  projection: string | null;
}

export type Direction = "consider-increase" | "consider-reduce" | "maintain" | "hold-increase" | "discuss";

export interface Consideration {
  direction: Direction;
  headline: string;
  /** The reasoning, line by line, so the provider reads the argument not a verdict. */
  rationale: string[];
  /** Markers this consideration leans on, by key. */
  leansOn: string[];
}

export interface TitrationGate {
  title: string;
  severity: SafetyFlag["severity"];
  note: string;
}

export interface TitrationView {
  applicable: boolean;
  reason?: string;
  regimen: { name: string; dose: string; cadence: string } | null;
  markers: TitrationMarker[];
  gates: TitrationGate[];
  considerations: Consideration[];
  disclaimer: string;
}

const KEY_MARKERS = ["total_t", "free_t", "estradiol", "hct", "psa"];

function positionOf(v: number, optLo: number, optHi: number, refHi: number): Position {
  if (v > refHi) return "above-ref";
  if (v > optHi) return "above-optimal";
  if (v < optLo) return "below";
  return "optimal";
}

function scoreMarker(clientId: string, key: string): TitrationMarker | null {
  const b = biomarker(clientId, key);
  if (!b) return null;
  const optimalLow = b.optimalLow ?? b.refLow;
  const optimalHigh = b.optimalHigh ?? b.refHigh;
  const series = [...(b.history ?? [])];
  // Ensure the current value is the last point even when history stops short of it.
  if (!series.length || series[series.length - 1].value !== b.value) {
    series.push({ date: "now", value: b.value });
  }
  const first = series[0]?.value;
  const delta = series.length >= 2 && first !== undefined ? Math.round((b.value - first) * 10) / 10 : null;
  const trend: TrendDir =
    delta === null ? "flat" : delta > 0.1 ? "rising" : delta < -0.1 ? "falling" : "flat";

  // A projection only where there is a real trend to project. Hedged hard,
  // because biology is not linear and a provider must not read this as a promise.
  let projection: string | null = null;
  if (delta !== null && trend !== "flat" && series.length >= 2) {
    const perStep = delta / (series.length - 1);
    const next = Math.round((b.value + perStep) * 10) / 10;
    projection = `If this pace simply held, next draw ≈ ${next} ${b.unit} — trends bend, so this is a direction, not a forecast.`;
  }

  return {
    key,
    name: b.name,
    value: b.value,
    unit: b.unit,
    refLow: b.refLow,
    refHigh: b.refHigh,
    optimalLow,
    optimalHigh,
    position: positionOf(b.value, optimalLow, optimalHigh, b.refHigh),
    trend,
    delta,
    series,
    projection,
  };
}

/** Which safety flags block a dose INCREASE specifically. */
function increaseGates(flags: SafetyFlag[]): TitrationGate[] {
  return flags
    .filter(
      (f) =>
        (f.id === "safety-haematocrit" || f.id === "safety-prostate" || f.id === "safety-cardiovascular") &&
        (f.severity === "action" || f.severity === "urgent"),
    )
    .map((f) => ({
      title: f.title,
      severity: f.severity,
      note: f.monitoringExpectation,
    }));
}

export function titrationFor(clientId: string): TitrationView {
  const client = getClient(clientId);
  const disclaimer =
    "Decision support only. Apex lays out the trajectory and the levers; the treating provider makes and signs the decision. No dose is changed here.";

  if (!client) {
    return { applicable: false, reason: "No client on file.", regimen: null, markers: [], gates: [], considerations: [], disclaimer };
  }

  if (!onTherapy(client)) {
    return {
      applicable: false,
      reason: "Titration applies to an active hormone-optimization program. This member is not currently on therapy.",
      regimen: null,
      markers: [],
      gates: [],
      considerations: [],
      disclaimer,
    };
  }

  const markers = KEY_MARKERS.map((k) => scoreMarker(clientId, k)).filter(Boolean) as TitrationMarker[];
  const byKey = Object.fromEntries(markers.map((m) => [m.key, m]));
  const flags = safetyFlags(clientId);
  const gates = increaseGates(flags);

  // The testosterone regimen on file, if there is one to reference.
  const trtRx = prescriptionsForClient(clientId).find((rx) => /testosterone/i.test(rx.name));
  const regimen = trtRx
    ? { name: trtRx.name, dose: `${trtRx.doseAmount}${trtRx.doseUnit}`, cadence: cadenceLabel(trtRx.days) }
    : null;

  const considerations: Consideration[] = [];
  const totalT = byKey["total_t"];
  const freeT = byKey["free_t"];
  const e2 = byKey["estradiol"];
  const hct = byKey["hct"];

  // 1) The dose-direction consideration for testosterone itself.
  const lowT =
    (totalT && totalT.position === "below") || (freeT && freeT.position === "below");
  const highT =
    (totalT && (totalT.position === "above-ref" || totalT.position === "above-optimal")) ||
    (freeT && (freeT.position === "above-ref" || freeT.position === "above-optimal"));

  if (gates.length > 0 && lowT) {
    considerations.push({
      direction: "hold-increase",
      headline: "Symptoms may argue for more, but a safety gate is open — clear it first",
      rationale: [
        "Testosterone is sitting below the optimal window, which on its own would put a dose or frequency adjustment on the table.",
        `It should not be, while ${gates.map((g) => g.title.toLowerCase()).join(" and ")} ${gates.length === 1 ? "is" : "are"} unresolved — raising the dose pushes the same marker the wrong way.`,
        "The move a provider tends to weigh here is to address the gate (e.g. therapeutic phlebotomy for a high haematocrit), recheck, and only then revisit the hormone dose.",
      ],
      leansOn: ["total_t", "free_t", "hct"].filter((k) => byKey[k]),
    });
  } else if (gates.length === 0 && lowT) {
    considerations.push({
      direction: "consider-increase",
      headline: "Trough is below target with no safety gate open",
      rationale: [
        "Total and/or free testosterone read below the optimal window at trough, and the safety markers that would block an increase are clear.",
        "One lever is a modest dose increase. Another, often preferable, is splitting the same weekly dose into more frequent injections: it raises the trough without raising the peak, which keeps haematocrit and estradiol quieter than simply dosing more.",
        "Whether to move at all depends on symptoms, not the number alone — a member who feels well at a trough below range may not need a change.",
      ],
      leansOn: ["total_t", "free_t"].filter((k) => byKey[k]),
    });
  } else if (highT) {
    considerations.push({
      direction: "consider-reduce",
      headline: "Levels sit above the optimal window",
      rationale: [
        "Testosterone is above the optimal window. Higher is not better: the extra does little for symptoms and reliably drives haematocrit and estradiol up.",
        "The lever to weigh is easing to the lowest dose that still holds symptom control, then rechecking a trough panel.",
        hct && hct.trend === "rising"
          ? "Haematocrit is already trending up, which strengthens the case for coming down rather than holding."
          : "Watch haematocrit on the next panel regardless of the decision.",
      ].filter(Boolean) as string[],
      leansOn: ["total_t", "free_t", "hct"].filter((k) => byKey[k]),
    });
  } else if (totalT || freeT) {
    considerations.push({
      direction: "maintain",
      headline: "On target — the case is to hold, not to chase",
      rationale: [
        "Testosterone is within the optimal window. The default here is to hold the current regimen and recheck on the protocol interval.",
        "Chasing a higher number in an already-optimal, asymptomatic member adds risk without benefit.",
      ],
      leansOn: ["total_t", "free_t"].filter((k) => byKey[k]),
    });
  }

  // 2) Estradiol — the anti-over-treatment note. This is where clinics get it
  //    wrong by reflex, so the assistant argues AGAINST the reflex explicitly.
  if (e2) {
    if (e2.position === "above-optimal" || e2.position === "above-ref") {
      considerations.push({
        direction: "discuss",
        headline: "Estradiol is above the optimal window — treat the symptom, not the number",
        rationale: [
          "Modern practice manages estradiol by symptoms (water retention, nipple sensitivity, mood), not by the value on the page.",
          "An anastrozole reflex to an asymptomatic high E2 is a common error: crashing estradiol brings its own morbidity — joint pain, low libido, worse lipids and bone.",
          "If the member is asymptomatic, monitoring is reasonable. If symptomatic, easing the T dose often settles E2 without an aromatase inhibitor at all.",
        ],
        leansOn: ["estradiol", "total_t"].filter((k) => byKey[k]),
      });
    } else if (e2.position === "below") {
      considerations.push({
        direction: "discuss",
        headline: "Estradiol is low — worth checking it is not being over-suppressed",
        rationale: [
          "Estradiol below the optimal window in a man on therapy often means an aromatase inhibitor is doing too much, or the dose is too low to aromatize normally.",
          "Low E2 presents as joint pain, low libido and low mood — easy to misattribute to 'needing more testosterone'.",
          "The lever to weigh is reducing or stopping any AI before adding testosterone.",
        ],
        leansOn: ["estradiol"],
      });
    }
  }

  return {
    applicable: true,
    regimen,
    markers,
    gates,
    considerations,
    disclaimer,
  };
}
