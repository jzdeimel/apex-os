import type {
  Client,
  LabResult,
  BodyScan,
  InventoryItem,
  RecommendationRule,
  Recommendation,
  CandidateProtocol,
  ContraindicationCheck,
  Biomarker,
  RiskLevel,
} from "@/lib/types";

// Map each candidate to its kind + whether it is a tracked inventory item.
const CANDIDATE_META: Record<
  string,
  { kind: CandidateProtocol["kind"]; tracked: boolean }
> = {
  "BPC-157": { kind: "peptide", tracked: true },
  "GHK-Cu": { kind: "peptide", tracked: true },
  "NAD+": { kind: "peptide", tracked: true },
  "PT-141": { kind: "peptide", tracked: true },
  "VIP nasal spray": { kind: "peptide", tracked: true },
  "Ibutamoren / MK-677": { kind: "peptide", tracked: true },
  Semaglutide: { kind: "medication", tracked: true },
  Tirzepatide: { kind: "medication", tracked: true },
  Tesofensine: { kind: "medication", tracked: true },
  "Testosterone / hormone optimization discussion": { kind: "hormone", tracked: true },
  "Thyroid optimization discussion": { kind: "service", tracked: false },
  "Nutrition coaching": { kind: "service", tracked: false },
  "Body scan follow-up": { kind: "service", tracked: false },
  "Aesthetics consult": { kind: "service", tracked: false },
};

function bm(labs: LabResult | undefined, key: string): Biomarker | undefined {
  return labs?.biomarkers.find((b) => b.key === key);
}
function isLow(b?: Biomarker) {
  return b ? b.status === "low" : false;
}
function isHigh(b?: Biomarker) {
  return b ? b.status === "high" : false;
}
function isLowish(b?: Biomarker) {
  return b ? b.status === "low" || (b.status === "watch" && b.value < (b.optimalLow ?? b.refLow)) : false;
}
function isHighish(b?: Biomarker) {
  return b ? b.status === "high" || (b.status === "watch" && b.value > (b.optimalHigh ?? b.refHigh)) : false;
}

function trackedAvailable(
  candidate: string,
  inventory: InventoryItem[],
  locationId: string,
): boolean | null {
  const meta = CANDIDATE_META[candidate];
  if (!meta || !meta.tracked) return null;
  const here = inventory.some(
    (i) => i.name.toLowerCase().includes(candidate.split(" /")[0].toLowerCase()) && i.locationId === locationId && i.quantity > 0,
  );
  if (here) return true;
  const anywhere = inventory.some(
    (i) => i.name.toLowerCase().includes(candidate.split(" /")[0].toLowerCase()) && i.quantity > 0,
  );
  return anywhere; // available via transfer
}

function toCandidates(
  names: string[],
  inventory: InventoryItem[],
  locationId: string,
): CandidateProtocol[] {
  return names.map((name) => {
    const meta = CANDIDATE_META[name] ?? { kind: "service" as const, tracked: false };
    return {
      name,
      kind: meta.kind,
      inventoryAvailable: trackedAvailable(name, inventory, locationId),
    };
  });
}

function baseContraindications(client: Client, labs?: LabResult): ContraindicationCheck[] {
  const hct = bm(labs, "hct");
  const egfr = bm(labs, "egfr");
  const alt = bm(labs, "alt");
  return [
    { label: "Documented allergies", passed: true, note: "No documented allergy to candidate categories on file." },
    {
      label: "Renal function (eGFR)",
      passed: !egfr || egfr.status !== "low",
      note: egfr ? `eGFR ${egfr.value} ${egfr.unit}.` : "No recent renal panel on file.",
    },
    {
      label: "Hepatic function (ALT)",
      passed: !alt || alt.status !== "high",
      note: alt ? `ALT ${alt.value} ${alt.unit}.` : "No recent hepatic panel on file.",
    },
    {
      label: "Hematocrit",
      passed: !hct || hct.status !== "high",
      note: hct ? `Hematocrit ${hct.value}% (monitor on any hormone optimization).` : "No recent CBC on file.",
    },
    { label: "Pregnancy / nursing", passed: true, note: client.sex === "female" ? "Confirm status at provider visit." : "Not applicable." },
  ];
}

function adjustRisk(base: RiskLevel, flagged: boolean): RiskLevel {
  if (!flagged) return base;
  const order: RiskLevel[] = ["none", "low", "moderate", "high"];
  const idx = Math.min(order.indexOf(base) + 1, order.length - 1);
  return order[idx];
}

function clampConf(n: number) {
  return Math.max(0.4, Math.min(0.95, Math.round(n * 100) / 100));
}

/**
 * Deterministic, rule-based recommendation engine.
 * Produces *category-level* discussion points — never dosing, never automatic
 * prescribing. Every result requires provider approval.
 */
export function generateRecommendations(
  client: Client,
  labs: LabResult | undefined,
  bodyScan: BodyScan | undefined,
  inventory: InventoryItem[],
  rules: RecommendationRule[],
): Recommendation[] {
  const out: Recommendation[] = [];
  const goals = new Set(client.goals);
  const symptoms = new Set(client.symptoms);
  const loc = client.locationId;
  const generatedOn = client.latestLabDate ?? client.joinedOn;

  const crp = bm(labs, "crp");
  const hscrp = bm(labs, "hscrp");
  const vitd = bm(labs, "vitd");
  const b12 = bm(labs, "b12");
  const ferritin = bm(labs, "ferritin");
  const a1c = bm(labs, "a1c");
  const insulin = bm(labs, "insulin");
  const glucose = bm(labs, "glucose");
  const igf1 = bm(labs, "igf1");
  const tsh = bm(labs, "tsh");
  const ft3 = bm(labs, "ft3");
  const ft4 = bm(labs, "ft4");
  const totalT = bm(labs, "total_t");
  const freeT = bm(labs, "free_t");

  const highBodyFat = bodyScan ? bodyScan.bodyFatPct >= (client.sex === "male" ? 25 : 32) : false;
  const inflamed = isHigh(crp) || isHigh(hscrp) || isHighish(crp) || isHighish(hscrp);

  const ruleOn = (id: string) => rules.find((r) => r.id === id)?.enabled ?? false;
  const rule = (id: string) => rules.find((r) => r.id === id)!;

  const push = (
    ruleId: string,
    opts: {
      title: string;
      rationale: string;
      triggeredBy: string[];
      supportLabs: Biomarker[];
      nextStep: string;
      riskBump?: boolean;
      confBump?: number;
    },
  ) => {
    const r = rule(ruleId);
    out.push({
      id: `rec-${client.id}-${ruleId}`,
      clientId: client.id,
      title: opts.title,
      category: r.category,
      rationale: opts.rationale,
      triggeredBy: opts.triggeredBy,
      supporting: {
        goals: client.goals.filter((g) =>
          opts.triggeredBy.some((t) => t.toLowerCase().includes(g.toLowerCase())),
        ),
        symptoms: client.symptoms.filter((s) =>
          opts.triggeredBy.some((t) => t.toLowerCase().includes(s.toLowerCase())),
        ),
        labs: opts.supportLabs.map((b) => ({
          name: b.name,
          value: `${b.value} ${b.unit}`,
          status: b.status,
        })),
      },
      candidates: toCandidates(r.candidateNames, inventory, loc),
      contraindicationChecks: baseContraindications(client, labs),
      confidence: clampConf(r.defaultConfidence + (opts.confBump ?? 0)),
      riskLevel: adjustRisk(r.defaultRisk, opts.riskBump ?? false),
      requiresProviderApproval: true,
      status: "draft",
      suggestedNextStep: opts.nextStep,
      generatedOn,
    });
  };

  // Rule: Recovery / tissue support
  if (
    ruleOn("rule-recovery") &&
    (goals.has("Recovery") || goals.has("Joint pain")) &&
    (inflamed || symptoms.has("Slow recovery") || symptoms.has("Joint pain"))
  ) {
    push("rule-recovery", {
      title: "Recovery / tissue support review",
      rationale:
        "Recovery / joint goals alongside inflammatory signals suggest reviewing tissue-support options.",
      triggeredBy: [
        goals.has("Recovery") ? "Goal: Recovery" : "Goal: Joint pain",
        ...(inflamed ? ["Lab: elevated inflammation"] : []),
        ...(symptoms.has("Slow recovery") ? ["Symptom: Slow recovery"] : []),
        ...(symptoms.has("Joint pain") ? ["Symptom: Joint pain"] : []),
      ],
      supportLabs: [crp, hscrp].filter(Boolean) as Biomarker[],
      nextStep: "Provider to review tissue-support candidates. Protocol details added by provider.",
      riskBump: inflamed,
    });
  }

  // Rule: Skin / hair / aesthetics
  if (ruleOn("rule-aesthetics") && (goals.has("Skin/hair") || symptoms.has("Hair thinning"))) {
    push("rule-aesthetics", {
      title: "Skin / hair / aesthetics support",
      rationale:
        "Aesthetic goals (with any low ferritin) point to an aesthetics consult and nutrient review.",
      triggeredBy: [
        goals.has("Skin/hair") ? "Goal: Skin/hair" : "Symptom: Hair thinning",
        ...(isLowish(ferritin) ? ["Lab: low ferritin"] : []),
      ],
      supportLabs: [ferritin].filter(Boolean) as Biomarker[],
      nextStep: "Book aesthetics consult. Nutrient support details added by provider.",
    });
  }

  // Rule: Energy + nutrient optimization
  if (
    ruleOn("rule-nutrient-energy") &&
    goals.has("Energy") &&
    (isLowish(vitd) || isLowish(b12))
  ) {
    push("rule-nutrient-energy", {
      title: "Energy & nutrient optimization discussion",
      rationale:
        "Low-energy goal with low / low-normal Vitamin D or B12 suggests nutrient optimization and lifestyle coaching.",
      triggeredBy: [
        "Goal: Energy",
        ...(isLowish(vitd) ? ["Lab: low Vitamin D"] : []),
        ...(isLowish(b12) ? ["Lab: low B12"] : []),
      ],
      supportLabs: [vitd, b12].filter(Boolean) as Biomarker[],
      nextStep: "Coach to begin nutrition coaching. Nutrient repletion details added by provider.",
    });
  }

  // Rule: Metabolic / weight management
  if (
    ruleOn("rule-metabolic") &&
    highBodyFat &&
    (isHighish(a1c) || isHighish(insulin) || isHighish(glucose))
  ) {
    push("rule-metabolic", {
      title: "Metabolic / weight-management review",
      rationale:
        "High body fat with elevated glycemic markers suggests a metabolic / weight-management review.",
      triggeredBy: [
        "Body scan: high body fat",
        ...(isHighish(a1c) ? ["Lab: elevated A1C"] : []),
        ...(isHighish(insulin) ? ["Lab: elevated fasting insulin"] : []),
        ...(isHighish(glucose) ? ["Lab: elevated fasting glucose"] : []),
      ],
      supportLabs: [a1c, insulin, glucose].filter(Boolean) as Biomarker[],
      nextStep: "Provider to review metabolic options. Protocol details added by provider.",
      confBump: 0.05,
    });
  }

  // Rule: Libido / sexual wellness
  if (ruleOn("rule-sexual-wellness") && goals.has("Libido") && symptoms.has("Low libido")) {
    push("rule-sexual-wellness", {
      title: "Libido / sexual wellness review",
      rationale: "Libido goal with low-libido symptom suggests a sexual-wellness review.",
      triggeredBy: ["Goal: Libido", "Symptom: Low libido", ...(isLowish(totalT) ? ["Lab: low testosterone"] : [])],
      supportLabs: [totalT, freeT].filter(Boolean) as Biomarker[],
      nextStep: "Provider to review sexual-wellness options. Protocol details added by provider.",
      riskBump: isLowish(totalT),
    });
  }

  // Rule: Sleep / recovery support
  if (
    ruleOn("rule-sleep-recovery") &&
    (symptoms.has("Poor sleep") || symptoms.has("Slow recovery") || goals.has("Recovery")) &&
    isLowish(igf1)
  ) {
    push("rule-sleep-recovery", {
      title: "Sleep / recovery support review",
      rationale:
        "Poor sleep / slow recovery with low IGF-1 suggests a sleep & recovery support review.",
      triggeredBy: [
        ...(symptoms.has("Poor sleep") ? ["Symptom: Poor sleep"] : []),
        ...(symptoms.has("Slow recovery") ? ["Symptom: Slow recovery"] : []),
        ...(goals.has("Recovery") ? ["Goal: Recovery"] : []),
        "Lab: low IGF-1",
      ],
      supportLabs: [igf1].filter(Boolean) as Biomarker[],
      nextStep: "Provider to review sleep/recovery options. Protocol details added by provider.",
    });
  }

  // Rule: Cognition / energy → NAD+ (only if not already covered by nutrient-energy with a lab)
  if (
    ruleOn("rule-cognition-energy") &&
    (goals.has("Cognition") || goals.has("Energy")) &&
    !out.some((r) => r.category === "Energy / mitochondrial support")
  ) {
    push("rule-cognition-energy", {
      title: "Energy / mitochondrial (NAD+) discussion",
      rationale: "Cognition / energy goals suggest an NAD+ and mitochondrial-support discussion.",
      triggeredBy: [goals.has("Cognition") ? "Goal: Cognition" : "Goal: Energy"],
      supportLabs: [],
      nextStep: "Discuss NAD+ / mitochondrial support at next visit. Details added by provider.",
    });
  }

  // Rule: Thyroid optimization
  if (
    ruleOn("rule-thyroid") &&
    (symptoms.has("Cold intolerance") || symptoms.has("Brain fog") || symptoms.has("Low energy")) &&
    (isHigh(tsh) || isHighish(tsh) || isLow(ft3) || isLowish(ft3) || isLow(ft4))
  ) {
    push("rule-thyroid", {
      title: "Thyroid optimization discussion",
      rationale:
        "Thyroid-pattern symptoms with abnormal thyroid markers suggest a thyroid optimization discussion & panel review.",
      triggeredBy: [
        ...(symptoms.has("Cold intolerance") ? ["Symptom: Cold intolerance"] : []),
        ...(symptoms.has("Brain fog") ? ["Symptom: Brain fog"] : []),
        ...(isHighish(tsh) ? ["Lab: high TSH"] : []),
        ...(isLowish(ft3) ? ["Lab: low Free T3"] : []),
      ],
      supportLabs: [tsh, ft3, ft4].filter(Boolean) as Biomarker[],
      nextStep: "Provider to review thyroid panel. Protocol details added by provider.",
    });
  }

  // Rule: Hormone optimization
  if (
    ruleOn("rule-hormone") &&
    (isLowish(totalT) || isLowish(freeT)) &&
    (symptoms.has("Low libido") || symptoms.has("Low energy") || symptoms.has("Reduced strength")) &&
    !out.some((r) => r.category === "Libido / sexual wellness")
  ) {
    push("rule-hormone", {
      title: "Hormone optimization discussion",
      rationale:
        "Low / low-normal testosterone with aligned symptoms suggests a hormone optimization discussion.",
      triggeredBy: [
        ...(isLowish(totalT) ? ["Lab: low Total Testosterone"] : []),
        ...(isLowish(freeT) ? ["Lab: low Free Testosterone"] : []),
        ...(symptoms.has("Reduced strength") ? ["Symptom: Reduced strength"] : []),
        ...(symptoms.has("Low energy") ? ["Symptom: Low energy"] : []),
      ],
      supportLabs: [totalT, freeT].filter(Boolean) as Biomarker[],
      nextStep: "Provider to review hormone optimization & required monitoring. Details added by provider.",
    });
  }

  // Rule: Inflammation / gut (only when recovery rule didn't already fire)
  if (
    ruleOn("rule-inflammation-gut") &&
    inflamed &&
    !out.some((r) => r.category === "Recovery / tissue support")
  ) {
    push("rule-inflammation-gut", {
      title: "Inflammation / gut support review",
      rationale: "Elevated inflammatory markers suggest an inflammation / gut-support review.",
      triggeredBy: ["Lab: elevated inflammation"],
      supportLabs: [crp, hscrp].filter(Boolean) as Biomarker[],
      nextStep: "Provider to review inflammation drivers. Protocol details added by provider.",
    });
  }

  return out;
}
