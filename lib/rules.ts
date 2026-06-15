import type { RecommendationRule } from "@/lib/types";

// Editable (in local state) rule set that drives the recommendation engine.
// These describe *categories* and *candidate discussion points* — never dosing,
// never automatic prescribing. Every rule requires provider approval.
export const recommendationRules: RecommendationRule[] = [
  {
    id: "rule-recovery",
    name: "Recovery / tissue support",
    category: "Recovery / tissue support",
    description:
      "Recovery or joint-pain goals alongside elevated inflammation markers suggest a tissue-support review.",
    enabled: true,
    triggerSummary:
      "Goal includes Recovery or Joint pain AND (CRP or hs-CRP elevated OR symptom Slow recovery / Joint pain)",
    candidateNames: ["BPC-157", "Body scan follow-up"],
    defaultConfidence: 0.78,
    defaultRisk: "low",
  },
  {
    id: "rule-aesthetics",
    name: "Skin / hair / aesthetics support",
    category: "Skin / hair / aesthetics support",
    description:
      "Skin/hair goals (optionally with low ferritin) suggest an aesthetics consult and nutrient review.",
    enabled: true,
    triggerSummary: "Goal includes Skin/hair OR symptom Hair thinning",
    candidateNames: ["GHK-Cu", "Aesthetics consult", "Nutrition coaching"],
    defaultConfidence: 0.72,
    defaultRisk: "none",
  },
  {
    id: "rule-nutrient-energy",
    name: "Energy + nutrient optimization",
    category: "Energy / mitochondrial support",
    description:
      "Low-energy goals with low or low-normal Vitamin D / B12 suggest nutrient optimization and lifestyle coaching.",
    enabled: true,
    triggerSummary:
      "Goal includes Energy AND (Vitamin D low/low-normal OR B12 low/low-normal)",
    candidateNames: ["Nutrition coaching", "NAD+"],
    defaultConfidence: 0.7,
    defaultRisk: "none",
  },
  {
    id: "rule-metabolic",
    name: "Metabolic / weight management",
    category: "Metabolic / weight management",
    description:
      "High body fat with elevated A1C or fasting insulin suggests a metabolic / weight-management review.",
    enabled: true,
    triggerSummary:
      "Body fat high AND (A1C elevated OR Fasting insulin elevated OR Fasting glucose elevated)",
    candidateNames: ["Semaglutide", "Tirzepatide", "Tesofensine", "Nutrition coaching"],
    defaultConfidence: 0.82,
    defaultRisk: "moderate",
  },
  {
    id: "rule-sexual-wellness",
    name: "Libido / sexual wellness",
    category: "Libido / sexual wellness",
    description:
      "Libido goal with sexual-wellness symptoms suggests a sexual-wellness review (and possible hormone discussion).",
    enabled: true,
    triggerSummary: "Goal includes Libido AND symptom Low libido",
    candidateNames: ["PT-141", "Testosterone / hormone optimization discussion"],
    defaultConfidence: 0.75,
    defaultRisk: "moderate",
  },
  {
    id: "rule-sleep-recovery",
    name: "Sleep / recovery support",
    category: "Sleep / recovery support",
    description:
      "Poor sleep / slow recovery with low IGF-1 (or a recovery goal) suggests a sleep & recovery review.",
    enabled: true,
    triggerSummary:
      "(Symptom Poor sleep OR Slow recovery OR Goal Recovery) AND (IGF-1 low OR low-normal)",
    candidateNames: ["Ibutamoren / MK-677", "VIP nasal spray", "Body scan follow-up"],
    defaultConfidence: 0.68,
    defaultRisk: "low",
  },
  {
    id: "rule-cognition-energy",
    name: "Energy / mitochondrial (NAD+)",
    category: "Energy / mitochondrial support",
    description:
      "Cognition or energy goals suggest an NAD+ and mitochondrial-support discussion.",
    enabled: true,
    triggerSummary: "Goal includes Cognition OR Energy",
    candidateNames: ["NAD+", "Nutrition coaching"],
    defaultConfidence: 0.64,
    defaultRisk: "low",
  },
  {
    id: "rule-thyroid",
    name: "Thyroid optimization discussion",
    category: "Thyroid optimization discussion",
    description:
      "Thyroid-pattern symptoms with abnormal thyroid markers suggest a thyroid optimization panel & provider review.",
    enabled: true,
    triggerSummary:
      "(Symptom Cold intolerance OR Brain fog OR Low energy) AND (TSH high OR Free T3 low OR Free T4 low)",
    candidateNames: ["Thyroid optimization discussion", "Body scan follow-up"],
    defaultConfidence: 0.8,
    defaultRisk: "moderate",
  },
  {
    id: "rule-hormone",
    name: "Hormone optimization discussion",
    category: "Hormone optimization discussion",
    description:
      "Low testosterone (or related hormone pattern) with aligned symptoms suggests a hormone optimization discussion.",
    enabled: true,
    triggerSummary:
      "Total or Free Testosterone low/low-normal AND (symptom Low libido / Low energy / Reduced strength)",
    candidateNames: ["Testosterone / hormone optimization discussion"],
    defaultConfidence: 0.79,
    defaultRisk: "moderate",
  },
  {
    id: "rule-inflammation-gut",
    name: "Inflammation / gut support",
    category: "Inflammation / gut support",
    description:
      "Elevated inflammatory markers without a clear recovery driver suggest an inflammation / gut-support review.",
    enabled: true,
    triggerSummary: "CRP or hs-CRP elevated",
    candidateNames: ["BPC-157", "Nutrition coaching"],
    defaultConfidence: 0.6,
    defaultRisk: "low",
  },
];
