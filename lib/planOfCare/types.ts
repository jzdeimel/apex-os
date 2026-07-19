import type { Goal, RiskLevel, RecommendationCategory } from "@/lib/types";
import type { ProvenanceStamp } from "@/lib/consult/types";

/**
 * Plan of Care — the single artifact a member and their care team both work from.
 *
 * It spans the three levers Alpha Health actually pulls: what goes in the body
 * (protocol), what the member eats (nutrition), and how they train. Most
 * systems model only the first and leave the other two in a coach's head or a
 * PDF nobody can query.
 *
 * Safety invariant, identical to the protocol scheduler: **this file never
 * produces a dose.** Testosterone is a Schedule III controlled substance and
 * most peptides are prescriber-directed, so Apex proposes modality, cadence
 * and monitoring, and leaves amount to the licensed provider. The dose field
 * is structurally absent rather than optional — you cannot forget to omit
 * something that does not exist in the type.
 */

export type PlanSection = "protocol" | "nutrition" | "training" | "monitoring";

export type PlanStatus = "Draft" | "Awaiting provider" | "Active" | "Superseded";

/** One proposed element of the plan, always with its reasoning. */
export interface PlanItem {
  id: string;
  section: PlanSection;
  title: string;
  detail: string;
  /** Plain-language reasons this item was proposed. Rendered as evidence chips. */
  because: string[];
  /** Rule ids that fired, for provenance. */
  ruleIds: string[];
  confidence: number;
  /** Protocol items only — everything clinical needs a provider signature. */
  requiresProviderApproval: boolean;
  /** Protocol items only. */
  category?: RecommendationCategory;
  riskLevel?: RiskLevel;
  /** Route/cadence WITHOUT dose. */
  modality?: string;
  cadence?: string;
}

export interface MacroTarget {
  /** Estimated daily energy target in kcal. */
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** How the number was reached, shown verbatim in the UI. */
  basis: string;
}

export interface TrainingBlock {
  day: string;
  focus: string;
  detail: string;
}

export interface MonitoringCheckpoint {
  week: number;
  label: string;
  owner: "Provider" | "Coach" | "Member";
  detail: string;
}

export interface PlanOfCare {
  id: string;
  clientId: string;
  status: PlanStatus;
  createdAt: string;
  /** Horizon in weeks. */
  durationWeeks: number;
  goals: Goal[];
  /** One-paragraph statement the member reads first. */
  summary: string;

  protocol: PlanItem[];
  nutrition: PlanItem[];
  training: PlanItem[];
  monitoring: MonitoringCheckpoint[];

  macros?: MacroTarget;
  trainingSplit: TrainingBlock[];

  /** Contraindications screened before proposing anything clinical. */
  screened: { check: string; passed: boolean; detail: string }[];

  provenance: ProvenanceStamp;
  /** Set once a provider signs. */
  approvedBy?: string;
  approvedAt?: string;
}
