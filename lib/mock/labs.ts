import type { Biomarker, BiomarkerStatus, LabResult } from "@/lib/types";
import { clients, clientMap } from "@/lib/mock/clients";
import { seededRandom, clamp } from "@/lib/utils";

type PanelDef = {
  key: string;
  name: string;
  unit: string;
  category: Biomarker["category"];
  ref: [number, number];
  optimal: [number, number];
  female?: { ref: [number, number]; optimal: [number, number] };
  maleOnly?: boolean;
  decimals?: number;
};

// The Alpha Base Panel — realistic biomarkers + reference / optimal windows.
const PANEL: PanelDef[] = [
  { key: "total_t", name: "Total Testosterone", unit: "ng/dL", category: "Hormones", ref: [300, 1000], optimal: [600, 900], female: { ref: [15, 70], optimal: [25, 55] } },
  { key: "free_t", name: "Free Testosterone", unit: "pg/mL", category: "Hormones", ref: [50, 200], optimal: [100, 180], female: { ref: [1, 8.5], optimal: [2.5, 6] }, decimals: 1 },
  { key: "estradiol", name: "Estradiol (E2)", unit: "pg/mL", category: "Hormones", ref: [10, 40], optimal: [20, 30], female: { ref: [30, 350], optimal: [50, 200] } },
  { key: "progesterone", name: "Progesterone", unit: "ng/mL", category: "Hormones", ref: [0.1, 0.9], optimal: [0.2, 0.7], female: { ref: [0.1, 25], optimal: [1, 20] } },
  { key: "shbg", name: "SHBG", unit: "nmol/L", category: "Hormones", ref: [16, 55], optimal: [20, 45] },
  { key: "lh", name: "LH", unit: "mIU/mL", category: "Hormones", ref: [1.5, 9.3], optimal: [2, 7], decimals: 1 },
  { key: "fsh", name: "FSH", unit: "mIU/mL", category: "Hormones", ref: [1.5, 12.4], optimal: [2, 8], decimals: 1 },
  { key: "igf1", name: "IGF-1", unit: "ng/mL", category: "Hormones", ref: [80, 280], optimal: [150, 250] },
  { key: "tsh", name: "TSH", unit: "mIU/L", category: "Thyroid", ref: [0.4, 4.5], optimal: [0.5, 2.0], decimals: 2 },
  { key: "ft3", name: "Free T3", unit: "pg/mL", category: "Thyroid", ref: [2.3, 4.2], optimal: [3.0, 4.0], decimals: 1 },
  { key: "ft4", name: "Free T4", unit: "ng/dL", category: "Thyroid", ref: [0.8, 1.8], optimal: [1.1, 1.5], decimals: 2 },
  { key: "rt3", name: "Reverse T3", unit: "ng/dL", category: "Thyroid", ref: [8, 25], optimal: [8, 15] },
  { key: "vitd", name: "Vitamin D, 25-OH", unit: "ng/mL", category: "Nutrients", ref: [30, 100], optimal: [50, 80] },
  { key: "b12", name: "Vitamin B12", unit: "pg/mL", category: "Nutrients", ref: [200, 900], optimal: [500, 900] },
  { key: "ferritin", name: "Ferritin", unit: "ng/mL", category: "Nutrients", ref: [30, 400], optimal: [80, 250], female: { ref: [15, 150], optimal: [40, 120] } },
  { key: "crp", name: "CRP", unit: "mg/L", category: "Inflammation", ref: [0, 3], optimal: [0, 1], decimals: 1 },
  { key: "hscrp", name: "hs-CRP", unit: "mg/L", category: "Inflammation", ref: [0, 3], optimal: [0, 1], decimals: 1 },
  { key: "a1c", name: "Hemoglobin A1C", unit: "%", category: "Metabolic", ref: [4, 5.6], optimal: [4.5, 5.3], decimals: 1 },
  { key: "glucose", name: "Fasting Glucose", unit: "mg/dL", category: "Metabolic", ref: [70, 99], optimal: [75, 90] },
  { key: "insulin", name: "Fasting Insulin", unit: "µIU/mL", category: "Metabolic", ref: [2, 19], optimal: [2, 6], decimals: 1 },
  { key: "ldl", name: "LDL Cholesterol", unit: "mg/dL", category: "Lipids", ref: [0, 99], optimal: [0, 90] },
  { key: "hdl", name: "HDL Cholesterol", unit: "mg/dL", category: "Lipids", ref: [40, 90], optimal: [55, 90] },
  { key: "trig", name: "Triglycerides", unit: "mg/dL", category: "Lipids", ref: [0, 149], optimal: [0, 90] },
  { key: "apob", name: "ApoB", unit: "mg/dL", category: "Lipids", ref: [40, 100], optimal: [40, 80] },
  { key: "alt", name: "ALT", unit: "U/L", category: "Organ", ref: [7, 56], optimal: [7, 30] },
  { key: "ast", name: "AST", unit: "U/L", category: "Organ", ref: [8, 48], optimal: [8, 30] },
  { key: "creatinine", name: "Creatinine", unit: "mg/dL", category: "Organ", ref: [0.7, 1.3], optimal: [0.8, 1.1], decimals: 2 },
  { key: "egfr", name: "eGFR", unit: "mL/min", category: "Organ", ref: [90, 120], optimal: [95, 120] },
  { key: "hct", name: "Hematocrit", unit: "%", category: "Blood", ref: [38.3, 48.6], optimal: [40, 48], decimals: 1 },
  { key: "psa", name: "PSA", unit: "ng/mL", category: "Prostate", ref: [0, 4], optimal: [0, 2.5], maleOnly: true, decimals: 1 },

  // --- Expanded panel: the rest of the "100+ markers" Alpha Health advertises.
  // Adrenal / additional hormones
  { key: "dheas", name: "DHEA-S", unit: "µg/dL", category: "Hormones", ref: [80, 560], optimal: [200, 400], female: { ref: [35, 430], optimal: [150, 350] } },
  { key: "cortisol_am", name: "Cortisol (AM)", unit: "µg/dL", category: "Hormones", ref: [6, 23], optimal: [10, 18], decimals: 1 },
  { key: "prolactin", name: "Prolactin", unit: "ng/mL", category: "Hormones", ref: [2, 18], optimal: [3, 12], decimals: 1 },
  { key: "pregnenolone", name: "Pregnenolone", unit: "ng/dL", category: "Hormones", ref: [10, 200], optimal: [50, 150] },
  // CBC / blood
  { key: "wbc", name: "WBC", unit: "10³/µL", category: "Blood", ref: [3.4, 10.8], optimal: [4.5, 7.5], decimals: 1 },
  { key: "rbc", name: "RBC", unit: "10⁶/µL", category: "Blood", ref: [4.2, 5.8], optimal: [4.6, 5.4], decimals: 2 },
  { key: "hemoglobin", name: "Hemoglobin", unit: "g/dL", category: "Blood", ref: [13.5, 17.5], optimal: [14, 16.5], female: { ref: [12, 15.5], optimal: [12.5, 15] }, decimals: 1 },
  { key: "platelets", name: "Platelets", unit: "10³/µL", category: "Blood", ref: [150, 400], optimal: [180, 320] },
  { key: "mcv", name: "MCV", unit: "fL", category: "Blood", ref: [80, 100], optimal: [85, 95], decimals: 1 },
  { key: "rdw", name: "RDW", unit: "%", category: "Blood", ref: [11.5, 14.5], optimal: [11.5, 13], decimals: 1 },
  // Comprehensive metabolic / organ
  { key: "sodium", name: "Sodium", unit: "mmol/L", category: "Organ", ref: [135, 145], optimal: [137, 142] },
  { key: "potassium", name: "Potassium", unit: "mmol/L", category: "Organ", ref: [3.5, 5.1], optimal: [4, 4.8], decimals: 1 },
  { key: "calcium", name: "Calcium", unit: "mg/dL", category: "Organ", ref: [8.6, 10.3], optimal: [9.2, 10], decimals: 1 },
  { key: "albumin", name: "Albumin", unit: "g/dL", category: "Organ", ref: [3.5, 5], optimal: [4.2, 4.9], decimals: 1 },
  { key: "ggt", name: "GGT", unit: "U/L", category: "Organ", ref: [8, 61], optimal: [8, 30] },
  { key: "uric_acid", name: "Uric Acid", unit: "mg/dL", category: "Metabolic", ref: [3.4, 7], optimal: [3.4, 5.5], female: { ref: [2.4, 6], optimal: [2.4, 5] }, decimals: 1 },
  // Cardiovascular / advanced lipids & inflammation
  { key: "cholesterol", name: "Total Cholesterol", unit: "mg/dL", category: "Lipids", ref: [125, 200], optimal: [140, 180] },
  { key: "lpa", name: "Lipoprotein(a)", unit: "nmol/L", category: "Lipids", ref: [0, 75], optimal: [0, 30] },
  { key: "homocysteine", name: "Homocysteine", unit: "µmol/L", category: "Inflammation", ref: [4, 15], optimal: [5, 8], decimals: 1 },
  { key: "ferritin_sat", name: "Iron Saturation", unit: "%", category: "Nutrients", ref: [15, 55], optimal: [25, 45] },
  // Nutrients
  { key: "magnesium", name: "Magnesium (RBC)", unit: "mg/dL", category: "Nutrients", ref: [4, 6.4], optimal: [5, 6.4], decimals: 1 },
  { key: "folate", name: "Folate", unit: "ng/mL", category: "Nutrients", ref: [3, 20], optimal: [10, 20], decimals: 1 },
  { key: "omega3", name: "Omega-3 Index", unit: "%", category: "Nutrients", ref: [2, 12], optimal: [8, 12], decimals: 1 },
  { key: "zinc", name: "Zinc", unit: "µg/dL", category: "Nutrients", ref: [70, 120], optimal: [90, 120] },
];

// Per-client overrides that encode each client's clinical story so the
// recommendation engine has meaningful, deterministic triggers.
const OVERRIDES: Record<string, Record<string, number>> = {
  "c-001": { a1c: 5.9, insulin: 14.2, glucose: 101, trig: 165, total_t: 520, vitd: 41 },
  "c-002": { total_t: 410, free_t: 62, shbg: 58, estradiol: 16, lh: 4.1, igf1: 132 },
  "c-003": { crp: 4.2, hscrp: 3.6, ferritin: 95, igf1: 145 },
  "c-004": { vitd: 28, ferritin: 22, b12: 340, total_t: 31 },
  "c-005": { trig: 210, apob: 108, a1c: 5.7, glucose: 104, ldl: 132, vitd: 33 },
  "c-006": { tsh: 5.8, ft3: 2.4, ft4: 0.9, rt3: 19, vitd: 34, b12: 380, fsh: 16.4, estradiol: 48, progesterone: 0.5, total_t: 22 },
  "c-007": { igf1: 158, hct: 46 },
  "c-010": { fsh: 18.6, estradiol: 58, progesterone: 0.4, total_t: 20, vitd: 39 },
  "c-008": { a1c: 6.1, glucose: 112, insulin: 16.5, trig: 158, vitd: 36, fsh: 42.0, estradiol: 21, progesterone: 0.3, total_t: 18 },
  "c-011": { hct: 50.4, total_t: 880, free_t: 175, estradiol: 42, psa: 2.1 },
  "c-012": { igf1: 118, ft3: 2.6, vitd: 38, ferritin: 38 },
  "c-013": { crp: 5.6, hscrp: 4.8, a1c: 5.7, trig: 170, vitd: 39 },
  "c-014": { insulin: 11.8, a1c: 5.6, trig: 142, vitd: 44 },
  "c-015": { igf1: 165, total_t: 610 },
  "c-016": { tsh: 5.2, ft3: 2.5, ft4: 0.95, rt3: 18, vitd: 37, fsh: 67.0, estradiol: 13, progesterone: 0.2, total_t: 14 },
  "c-019": { total_t: 690, free_t: 120, psa: 3.2, hct: 47, igf1: 140, vitd: 46 },
  "c-021": { a1c: 6.2, insulin: 17.1, glucose: 116, trig: 188, crp: 3.4, vitd: 35 },
  "c-022": { b12: 360, vitd: 27, ferritin: 34, igf1: 138 },
  "c-023": { total_t: 380, free_t: 58, shbg: 14, a1c: 5.6, trig: 152, vitd: 40 },
  "c-024": { ferritin: 18, vitd: 38, b12: 410, igf1: 152 },
};

function statusFor(value: number, ref: [number, number], optimal: [number, number]): BiomarkerStatus {
  if (value < ref[0]) return "low";
  if (value > ref[1]) return "high";
  if (value >= optimal[0] && value <= optimal[1]) return "optimal";
  return "watch";
}

function round(v: number, decimals = 0) {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

// Draw a biomarker value with a realistic distribution across status bands.
function drawValue(
  ref: [number, number],
  optimal: [number, number],
  rand: () => number,
  decimals: number,
): number {
  const [rl, rh] = ref;
  const [ol, oh] = optimal;
  const u = rand();
  let v: number;
  if (u < 0.5) {
    // optimal
    v = ol + (oh - ol) * rand();
  } else if (u < 0.78) {
    // watch — within reference but outside optimal
    if (rand() < 0.5 && ol > rl) v = rl + (ol - rl) * rand();
    else v = oh + (rh - oh) * rand();
  } else if (u < 0.93) {
    // mildly out of range (low or high)
    if (rand() < 0.45 && rl > 0) v = rl - (rh - rl) * 0.08 * rand();
    else v = rh + (rh - rl) * 0.12 * rand();
  } else {
    // back toward optimal (limit the number of extremes)
    v = ol + (oh - ol) * rand();
  }
  return round(Math.max(0, v), decimals);
}

function buildBiomarkers(clientId: string, sex: "male" | "female", resultedOn: string): Biomarker[] {
  const rand = seededRandom(clientId + "labs");
  const overrides = OVERRIDES[clientId] ?? {};
  const out: Biomarker[] = [];

  for (const def of PANEL) {
    if (def.maleOnly && sex !== "male") continue;
    const spec = sex === "female" && def.female ? def.female : { ref: def.ref, optimal: def.optimal };
    const decimals = def.decimals ?? 0;

    let value: number;
    if (overrides[def.key] !== undefined) {
      value = overrides[def.key];
    } else {
      // Deterministic draw with a realistic spread (so the population isn't all
      // "optimal"): ~50% optimal, ~28% watch, ~15% mildly out of range.
      value = drawValue(spec.ref, spec.optimal, rand, decimals);
    }
    value = clamp(value, spec.ref[0] * 0.4, spec.ref[1] * 1.8);
    value = round(value, decimals);

    const status = statusFor(value, spec.ref, spec.optimal);

    // Trend history for markers that are off-target (4 prior points easing toward current)
    let history: { date: string; value: number }[] | undefined;
    if (status !== "optimal") {
      history = [];
      const months = ["2026-01-15", "2026-02-26", "2026-04-09", "2026-05-20", resultedOn];
      for (let i = 0; i < months.length; i++) {
        const t = i / (months.length - 1);
        // start ~18% further from optimal, converge to current value
        const optimalMid = (spec.optimal[0] + spec.optimal[1]) / 2;
        const start = value + (value - optimalMid) * 0.5;
        const v = round(start + (value - start) * t + (rand() - 0.5) * span(def, spec) * 0.04, decimals);
        history.push({ date: months[i], value: v });
      }
      history[history.length - 1].value = value;
    }

    out.push({
      key: def.key,
      name: def.name,
      value,
      unit: def.unit,
      refLow: spec.ref[0],
      refHigh: spec.ref[1],
      optimalLow: spec.optimal[0],
      optimalHigh: spec.optimal[1],
      status,
      category: def.category,
      history,
    });
  }
  return out;
}

function span(def: PanelDef, spec: { ref: [number, number] }) {
  return spec.ref[1] - spec.ref[0] || 1;
}

function summaryFor(clientId: string, biomarkers: Biomarker[]): string {
  const flagged = biomarkers.filter((b) => b.status !== "optimal");
  const highs = flagged.filter((b) => b.status === "high").map((b) => b.name);
  const lows = flagged.filter((b) => b.status === "low").map((b) => b.name);
  const watch = flagged.filter((b) => b.status === "watch").map((b) => b.name);
  const parts: string[] = [];
  if (highs.length) parts.push(`elevated ${highs.slice(0, 3).join(", ")}`);
  if (lows.length) parts.push(`low ${lows.slice(0, 3).join(", ")}`);
  if (watch.length) parts.push(`sub-optimal ${watch.slice(0, 2).join(", ")}`);
  const body = parts.length
    ? `Panel shows ${parts.join("; ")}. Patterns are consistent with the client's stated goals and symptoms.`
    : "Panel is broadly within optimal ranges.";
  return `AI-assisted summary (provider review required): ${body} This is a plain-language interpretation only and does not constitute a diagnosis or treatment plan.`;
}

export const labResults: LabResult[] = clients
  .filter((c) => c.latestLabDate)
  .map((c) => {
    const collected = c.latestLabDate!;
    const biomarkers = buildBiomarkers(c.id, c.sex, collected);
    return {
      id: `lab-${c.id}`,
      clientId: c.id,
      panelName: "Alpha Base Panel",
      collectedOn: collected,
      resultedOn: collected,
      status: "Resulted" as const,
      biomarkers,
      summary: summaryFor(c.id, biomarkers),
    };
  });

export const labByClient = Object.fromEntries(labResults.map((l) => [l.clientId, l]));

export function getLabsForClient(clientId: string): LabResult | undefined {
  return labByClient[clientId];
}

export function biomarker(clientId: string, key: string): Biomarker | undefined {
  return labByClient[clientId]?.biomarkers.find((b) => b.key === key);
}

// total count exposed for dashboard KPIs
export const labsReadyCount = clients.filter((c) => c.status === "Results Ready").length;
void clientMap;
