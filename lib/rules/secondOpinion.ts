import type { Client, Recommendation, RecommendationRule, RiskLevel } from "@/lib/types";
import { recommendationRules } from "@/lib/rules";
import { generateRecommendations } from "@/lib/recommendationEngine";
import { getLabsForClient } from "@/lib/mock/labs";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { inventory } from "@/lib/mock/inventory";

/**
 * Second Opinion — run the same engine twice under two rule-set configurations
 * and show where the two answers disagree.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * Rule versioning is normally invisible. A clinic edits a rule on Tuesday and
 * the only observable effect is that a different set of recommendations shows
 * up on Wednesday, with nothing on the screen indicating that the *engine*
 * changed rather than the *patient*. That is how a rule edit becomes an
 * unreviewed clinical policy change.
 *
 * The disagreement set is the point. A recommendation that appears under both
 * configurations is robust — it survives a change of assumptions, and a
 * clinician can spend proportionally little attention on it. A recommendation
 * that appears under exactly one configuration is, by construction, entirely
 * an artifact of that configuration. It is the recommendation a clinician
 * should look at hardest, because the case for it is the weakest thing in the
 * whole output: it rests on a rule being on rather than on the patient.
 *
 * Two divergence causes are distinguished, and the distinction matters:
 *
 *  - "rule-off" — the rule that produced it is simply disabled in the other
 *    set. Expected, legible, and usually intentional.
 *  - "displaced" — the rule is enabled in BOTH sets and still produced nothing
 *    in one of them. That only happens through the engine's cross-rule
 *    suppression (hormone yields to sexual-wellness; inflammation/gut yields to
 *    recovery; NAD+ yields to any energy rule that already fired). A rule you
 *    never touched changing its output is the failure mode nobody predicts, and
 *    it is exactly what a rules editor without this view hides from you.
 *
 * Nothing here invents clinical content. Both sides are the shipped engine over
 * the shipped rules; only the enabled map and the confidence prior differ.
 */

// ---------------------------------------------------------------------------
// Rule-set configuration
// ---------------------------------------------------------------------------

/**
 * A rule set is a configuration OVER `recommendationRules`, never a fork of it.
 *
 * Storing deltas rather than copies means a second opinion can never drift into
 * comparing two stale snapshots of the rule library against each other — both
 * sides always resolve against the rules the clinic is actually running today.
 */
export interface RuleSetConfig {
  id: string;
  label: string;
  /** One sentence a clinician can read before trusting the comparison. */
  description: string;
  /** Rule ids turned OFF in this set. Anything absent keeps its shipped state. */
  disabled: string[];
  /**
   * Additive shift applied to a rule's confidence prior, by rule id.
   * This is the "how readily do we surface this" dial — it changes how loudly a
   * finding is stated, never what the finding says.
   */
  confidenceShift?: Record<string, number>;
}

export const RULE_SET_PRESETS: RuleSetConfig[] = [
  {
    id: "production",
    label: "Production (current)",
    description: "The rule set the clinic is running right now. Every rule enabled.",
    disabled: [],
  },
  {
    id: "conservative",
    label: "Conservative review",
    description:
      "Screening-style rules that fire on a goal alone are off; the remaining rules are stated less strongly.",
    disabled: ["rule-cognition-energy", "rule-aesthetics", "rule-inflammation-gut"],
    confidenceShift: {
      "rule-recovery": -0.08,
      "rule-sleep-recovery": -0.08,
      "rule-metabolic": -0.05,
      "rule-sexual-wellness": -0.05,
    },
  },
  {
    id: "screening-forward",
    label: "Screening-forward",
    description:
      "Every rule enabled and the lab-anchored rules weighted up — surfaces more for the provider to rule out.",
    disabled: [],
    confidenceShift: {
      "rule-thyroid": 0.06,
      "rule-hormone": 0.06,
      "rule-metabolic": 0.04,
    },
  },
  {
    id: "labs-only",
    label: "Lab-anchored only",
    description:
      "Only rules that require an out-of-range biomarker. Goal-and-symptom-only rules are off.",
    disabled: ["rule-cognition-energy", "rule-aesthetics", "rule-sexual-wellness"],
  },
];

export function ruleSetById(id: string): RuleSetConfig {
  return RULE_SET_PRESETS.find((s) => s.id === id) ?? RULE_SET_PRESETS[0];
}

/** Resolve a config into the concrete rule array the engine consumes. */
export function materializeRules(config: RuleSetConfig): RecommendationRule[] {
  const off = new Set(config.disabled);
  return recommendationRules.map((r) => {
    const shift = config.confidenceShift?.[r.id] ?? 0;
    return {
      ...r,
      enabled: r.enabled && !off.has(r.id),
      // The engine clamps to [0.4, 0.95], so a shift can never produce a
      // confidence outside the range the rest of the UI is calibrated for.
      defaultConfidence: r.defaultConfidence + shift,
    };
  });
}

export function runRuleSet(client: Client, config: RuleSetConfig): Recommendation[] {
  return generateRecommendations(
    client,
    getLabsForClient(client.id),
    getScanForClient(client.id),
    inventory,
    materializeRules(config),
  );
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/** Why a recommendation exists on one side only. */
export type DivergenceCause =
  /** The producing rule is disabled in the other set. */
  | "rule-off"
  /** The rule is enabled on both sides but another rule suppressed it. */
  | "displaced";

export interface OnlyIn {
  ruleId: string;
  side: "A" | "B";
  recommendation: Recommendation;
  cause: DivergenceCause;
  /** Plain-language cause, safe to render verbatim. */
  causeLabel: string;
}

export interface Agreement {
  ruleId: string;
  title: string;
  category: string;
  /** Identical on both sides by definition of `agreed`. */
  confidence: number;
  riskLevel: RiskLevel;
}

export interface ConfidenceChange {
  ruleId: string;
  title: string;
  confidenceA: number;
  confidenceB: number;
  /** B − A, rounded to two places. Positive = the second opinion is louder. */
  delta: number;
  riskA: RiskLevel;
  riskB: RiskLevel;
  riskChanged: boolean;
}

export interface SecondOpinionResult {
  client: Client;
  setA: RuleSetConfig;
  setB: RuleSetConfig;
  agreed: Agreement[];
  onlyInA: OnlyIn[];
  onlyInB: OnlyIn[];
  changedConfidence: ConfidenceChange[];
  /** Count of findings present under exactly one configuration. */
  divergenceCount: number;
  /** 0..1 — share of the union both sets produced. 1 = the sets never disagree. */
  agreementRatio: number;
  /** Rendered sentences explaining what the disagreement means. */
  summary: string[];
}

/** The engine mints ids as `rec-{clientId}-{ruleId}`; recover the rule id. */
function ruleIdOf(rec: Recommendation, clientId: string): string {
  return rec.id.replace(`rec-${clientId}-`, "");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function causeFor(ruleId: string, missingFrom: RuleSetConfig): DivergenceCause {
  return missingFrom.disabled.includes(ruleId) ? "rule-off" : "displaced";
}

function causeLabel(cause: DivergenceCause, missingFrom: RuleSetConfig): string {
  return cause === "rule-off"
    ? `Rule is disabled in ${missingFrom.label}.`
    : `Rule is enabled in ${missingFrom.label} but another rule took precedence there.`;
}

/**
 * Compare two rule-set configurations for one client.
 *
 * Keyed by rule id rather than by title, because two rules can legitimately
 * carry the same category label and collapsing them would silently understate
 * the disagreement — the one direction this function must never err in.
 */
export function compareRuleSets(
  client: Client,
  setA: RuleSetConfig,
  setB: RuleSetConfig,
): SecondOpinionResult {
  const a = runRuleSet(client, setA);
  const b = runRuleSet(client, setB);

  const byRuleA = new Map(a.map((r) => [ruleIdOf(r, client.id), r]));
  const byRuleB = new Map(b.map((r) => [ruleIdOf(r, client.id), r]));

  const agreed: Agreement[] = [];
  const changedConfidence: ConfidenceChange[] = [];
  const onlyInA: OnlyIn[] = [];
  const onlyInB: OnlyIn[] = [];

  for (const [ruleId, recA] of byRuleA) {
    const recB = byRuleB.get(ruleId);
    if (!recB) {
      const cause = causeFor(ruleId, setB);
      onlyInA.push({
        ruleId,
        side: "A",
        recommendation: recA,
        cause,
        causeLabel: causeLabel(cause, setB),
      });
      continue;
    }

    const riskChanged = recA.riskLevel !== recB.riskLevel;
    const delta = round2(recB.confidence - recA.confidence);

    if (delta !== 0 || riskChanged) {
      changedConfidence.push({
        ruleId,
        title: recA.title,
        confidenceA: recA.confidence,
        confidenceB: recB.confidence,
        delta,
        riskA: recA.riskLevel,
        riskB: recB.riskLevel,
        riskChanged,
      });
    }

    // A finding both sets produced is "agreed" even when stated at different
    // strengths — the disagreement about *how loudly* is reported separately so
    // it never masquerades as a disagreement about *whether*.
    agreed.push({
      ruleId,
      title: recA.title,
      category: recA.category,
      confidence: recA.confidence,
      riskLevel: recA.riskLevel,
    });
  }

  for (const [ruleId, recB] of byRuleB) {
    if (byRuleA.has(ruleId)) continue;
    const cause = causeFor(ruleId, setA);
    onlyInB.push({
      ruleId,
      side: "B",
      recommendation: recB,
      cause,
      causeLabel: causeLabel(cause, setA),
    });
  }

  const divergenceCount = onlyInA.length + onlyInB.length;
  const union = agreed.length + divergenceCount;
  const agreementRatio = union === 0 ? 1 : agreed.length / union;

  return {
    client,
    setA,
    setB,
    agreed,
    onlyInA,
    onlyInB,
    changedConfidence,
    divergenceCount,
    agreementRatio,
    summary: summarize({
      agreed,
      onlyInA,
      onlyInB,
      changedConfidence,
      setA,
      setB,
      divergenceCount,
      union,
    }),
  };
}

/**
 * Plain-language reading of the comparison.
 *
 * Deliberately says nothing clinical about the member. It describes the shape
 * of the disagreement and what the reviewer should do with it — the engine is
 * entitled to an opinion about its own confidence, not about the patient.
 */
function summarize(input: {
  agreed: Agreement[];
  onlyInA: OnlyIn[];
  onlyInB: OnlyIn[];
  changedConfidence: ConfidenceChange[];
  setA: RuleSetConfig;
  setB: RuleSetConfig;
  divergenceCount: number;
  union: number;
}): string[] {
  const { agreed, onlyInA, onlyInB, changedConfidence, setA, setB, divergenceCount, union } =
    input;
  const out: string[] = [];

  if (union === 0) {
    out.push("Neither rule set produced a recommendation for this member.");
    return out;
  }

  if (divergenceCount === 0) {
    out.push(
      `Both rule sets produced the same ${agreed.length} finding${agreed.length === 1 ? "" : "s"}. The output does not depend on which configuration is running.`,
    );
  } else {
    out.push(
      `${agreed.length} of ${union} findings survive both configurations. ${divergenceCount} appear${divergenceCount === 1 ? "s" : ""} under only one — review those first, since the case for them rests on the rule set rather than on the chart.`,
    );
  }

  if (onlyInA.length) {
    out.push(
      `${onlyInA.length} finding${onlyInA.length === 1 ? "" : "s"} appear${onlyInA.length === 1 ? "s" : ""} only under ${setA.label}: ${onlyInA.map((d) => d.recommendation.title).join("; ")}.`,
    );
  }
  if (onlyInB.length) {
    out.push(
      `${onlyInB.length} finding${onlyInB.length === 1 ? "" : "s"} appear${onlyInB.length === 1 ? "s" : ""} only under ${setB.label}: ${onlyInB.map((d) => d.recommendation.title).join("; ")}.`,
    );
  }

  const displaced = [...onlyInA, ...onlyInB].filter((d) => d.cause === "displaced");
  if (displaced.length) {
    out.push(
      `${displaced.length} of the differences come from rules that are enabled on both sides — another rule took precedence. Changing an unrelated rule moved these; treat that as a change to be reviewed, not a coincidence.`,
    );
  }

  if (changedConfidence.length) {
    const louder = changedConfidence.filter((c) => c.delta > 0).length;
    const quieter = changedConfidence.filter((c) => c.delta < 0).length;
    const risky = changedConfidence.filter((c) => c.riskChanged).length;
    const parts: string[] = [];
    if (louder) parts.push(`${louder} stated more strongly under ${setB.label}`);
    if (quieter) parts.push(`${quieter} stated less strongly under ${setB.label}`);
    if (risky) parts.push(`${risky} carrying a different risk level`);
    out.push(
      `Both sets agree these findings exist, but disagree on emphasis: ${parts.join(", ")}. Same finding, different loudness — worth knowing before a confidence number is quoted to a member.`,
    );
  }

  out.push(
    "Neither column is authoritative. Both are the same engine over the same chart; only the rule configuration differs, and every finding still requires provider approval.",
  );

  return out;
}
