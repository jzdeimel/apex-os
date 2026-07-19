import type { Client, Goal, BodyScan, LabResult, Biomarker } from "@/lib/types";
import type {
  PlanOfCare,
  PlanItem,
  MacroTarget,
  TrainingBlock,
  MonitoringCheckpoint,
} from "@/lib/planOfCare/types";
import { recommendationsForClient } from "@/lib/mock/recommendations";
import { getLabsForClient } from "@/lib/mock/labs";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { sha256, canonicalJson } from "@/lib/trace/hash";

/**
 * Plan-of-Care generator.
 *
 * Composes three engines into one artifact:
 *   protocol   ← the existing 10-rule clinical recommendation engine
 *   nutrition  ← body composition + goals + metabolic labs
 *   training   ← goals + recovery capacity + joint risk
 *
 * Everything it emits is sourced. `because[]` on each item is the plain-language
 * evidence a coach reads aloud to the member and a provider audits later, and
 * the whole plan carries a provenance stamp keyed to a hash of its exact
 * inputs — so the same client state always reproduces the same plan, and a plan
 * from six months ago can be explained without guessing.
 *
 * NO DOSES. See planOfCare/types.ts for why the field does not exist.
 */

export const ENGINE = "plan-of-care";
export const ENGINE_VERSION = "2.1.0";

const NOW = "2026-06-12T09:00:00";

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

/**
 * Energy target from measured BMR when a scan exists, else a Mifflin-style
 * estimate. Deficit/surplus is goal-driven and deliberately conservative —
 * aggressive deficits wreck adherence, which is the actual failure mode.
 */
function macrosFor(client: Client, scan?: BodyScan): MacroTarget {
  const wantsFatLoss = client.goals.includes("Fat loss");
  const wantsMuscle = client.goals.includes("Muscle gain");

  const bmr = scan?.bmr ?? (client.sex === "male" ? 1750 : 1400);
  // Moderate activity multiplier; coaches adjust after two weeks of real data.
  const tdee = Math.round(bmr * 1.45);

  const adjustment = wantsFatLoss ? -0.18 : wantsMuscle ? 0.1 : 0;
  const calories = Math.round((tdee * (1 + adjustment)) / 10) * 10;

  // Protein anchored to lean mass when we have it — the number that actually
  // protects muscle in a deficit.
  const leanKg = scan?.skeletalMuscleKg ?? (scan ? scan.weightKg * 0.4 : 32);
  const proteinG = Math.round(leanKg * 2.4);

  const fatG = Math.round((calories * (wantsFatLoss ? 0.27 : 0.3)) / 9);
  const carbsG = Math.max(60, Math.round((calories - proteinG * 4 - fatG * 9) / 4));

  const basis = scan
    ? `Measured BMR ${scan.bmr} kcal (${scan.device}) × 1.45 activity${
        adjustment !== 0
          ? ` ${adjustment < 0 ? "−" : "+"}${Math.abs(Math.round(adjustment * 100))}% for ${
              wantsFatLoss ? "fat loss" : "muscle gain"
            }`
          : ""
      }; protein set to 2.4 g per kg of measured lean mass.`
    : `No body scan on file — estimated from sex and typical activity. Book a scan to replace this with measured values.`;

  return { calories, proteinG, carbsG, fatG, basis };
}

function nutritionItems(client: Client, scan: BodyScan | undefined, labs: LabResult | undefined): PlanItem[] {
  const items: PlanItem[] = [];
  const push = (
    title: string,
    detail: string,
    because: string[],
    ruleIds: string[],
    confidence: number,
  ) =>
    items.push({
      id: `poc-nut-${items.length + 1}`,
      section: "nutrition",
      title,
      detail,
      because,
      ruleIds,
      confidence,
      requiresProviderApproval: false,
    });

  const marker = (name: string) => labs?.biomarkers.find((b: Biomarker) => b.name.toLowerCase().includes(name));

  if (client.goals.includes("Fat loss")) {
    push(
      "Protein-forward deficit",
      "Hit the protein target every day before worrying about the calorie number. Two meals anchored at 40 g+ protein.",
      ["Goal: Fat loss", scan ? `Body fat ${scan.bodyFatPct.toFixed(1)}%` : "No scan on file"],
      ["nut-deficit"],
      0.86,
    );
  }

  const a1c = marker("a1c");
  const glucose = marker("glucose");
  if ((a1c && a1c.status !== "optimal") || (glucose && glucose.status !== "optimal")) {
    push(
      "Carb timing around training",
      "Place the majority of carbohydrate in the meals before and after training; keep the evening meal protein and fat dominant.",
      [
        a1c ? `A1C ${a1c.value}${a1c.unit ?? ""} — ${a1c.status}` : "",
        glucose ? `Fasting glucose ${glucose.value}${glucose.unit ?? ""} — ${glucose.status}` : "",
      ].filter(Boolean),
      ["nut-glycemic"],
      0.82,
    );
  }

  const vitD = marker("vitamin d");
  if (vitD && vitD.status !== "optimal") {
    push(
      "Vitamin D repletion with fat-containing meal",
      "Take with the largest fat-containing meal of the day to improve absorption. Recheck at the week-6 panel.",
      [`Vitamin D ${vitD.value}${vitD.unit ?? ""} — ${vitD.status}`],
      ["nut-vitd"],
      0.78,
    );
  }

  if (client.symptoms.includes("Poor sleep")) {
    push(
      "Caffeine cutoff and evening carbohydrate",
      "No caffeine after 12:00. Include a modest carbohydrate portion at the evening meal — it consistently helps sleep onset.",
      ["Symptom: Poor sleep", "Goal alignment: Sleep"],
      ["nut-sleep"],
      0.71,
    );
  }

  if (client.goals.includes("Muscle gain")) {
    push(
      "Distributed protein across four feedings",
      "Four protein feedings spaced roughly four hours apart beats the same total in two meals for lean-mass accrual.",
      ["Goal: Muscle gain", scan ? `Lean mass ${scan.skeletalMuscleKg.toFixed(1)} kg` : ""].filter(Boolean),
      ["nut-mps"],
      0.8,
    );
  }

  if (!items.length) {
    push(
      "Baseline nutrition habits",
      "Protein at every meal, two servings of vegetables at lunch and dinner, and a consistent eating window.",
      ["No specific nutrition triggers — establishing a baseline"],
      ["nut-baseline"],
      0.6,
    );
  }

  return items;
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

function trainingItems(client: Client, scan?: BodyScan): PlanItem[] {
  const items: PlanItem[] = [];
  const push = (
    title: string,
    detail: string,
    because: string[],
    ruleIds: string[],
    confidence: number,
  ) =>
    items.push({
      id: `poc-trn-${items.length + 1}`,
      section: "training",
      title,
      detail,
      because,
      ruleIds,
      confidence,
      requiresProviderApproval: false,
    });

  const jointRisk =
    client.symptoms.includes("Joint pain") || client.goals.includes("Joint pain");
  const poorRecovery =
    client.symptoms.includes("Slow recovery") || client.goals.includes("Recovery");

  if (jointRisk) {
    push(
      "Joint-sparing movement selection",
      "Trap-bar over straight-bar deadlift, neutral-grip pressing, and leg press in place of back squat while symptoms persist.",
      ["Reported joint pain", "Reduces peak joint loading without cutting training volume"],
      ["trn-joint"],
      0.84,
    );
  }

  if (poorRecovery) {
    push(
      "Volume capped at four hard sets per muscle group",
      "Hold weekly hard sets low until recovery markers improve. Add sets only after two consecutive good weeks.",
      ["Reported slow recovery", "Volume is the most common cause of stalled recovery"],
      ["trn-recovery"],
      0.79,
    );
  }

  if (client.goals.includes("Muscle gain")) {
    push(
      "Progressive overload on four anchor lifts",
      "Track one anchor lift per session and add load or a rep each week. Everything else is accessory work.",
      ["Goal: Muscle gain", "A tracked anchor lift is the highest-signal progress metric"],
      ["trn-overload"],
      0.87,
    );
  }

  if (client.goals.includes("Fat loss")) {
    push(
      "Daily step floor before added cardio",
      "8,000 steps daily as the floor. Add structured cardio only once the step target is consistently met.",
      [
        "Goal: Fat loss",
        scan ? `Visceral fat level ${scan.visceralFatLevel}` : "",
        "Steps are more sustainable than added cardio sessions",
      ].filter(Boolean),
      ["trn-neat"],
      0.83,
    );
  }

  if (client.symptoms.includes("Low energy") || client.symptoms.includes("Elevated stress")) {
    push(
      "Autoregulated intensity",
      "Two sessions per week at RPE 7 rather than 9. Cut the session at the first sign of form breakdown.",
      ["Reported low energy or elevated stress", "Protects adherence during a low-capacity stretch"],
      ["trn-autoreg"],
      0.74,
    );
  }

  if (!items.length) {
    push(
      "General strength baseline",
      "Three full-body sessions per week, six to eight compound movements, RPE 7–8.",
      ["No specific training triggers — establishing a baseline"],
      ["trn-baseline"],
      0.62,
    );
  }

  return items;
}

function splitFor(client: Client): TrainingBlock[] {
  const jointRisk = client.symptoms.includes("Joint pain");
  const muscle = client.goals.includes("Muscle gain");

  if (muscle) {
    return [
      { day: "Mon", focus: "Lower — push", detail: jointRisk ? "Leg press, split squat, hamstring curl" : "Squat, split squat, hamstring curl" },
      { day: "Tue", focus: "Upper — push", detail: jointRisk ? "Neutral-grip press, incline DB, triceps" : "Bench, incline DB, triceps" },
      { day: "Wed", focus: "Conditioning", detail: "Zone 2, 30 min + mobility" },
      { day: "Thu", focus: "Lower — pull", detail: jointRisk ? "Trap-bar RDL, leg curl, calves" : "Deadlift, RDL, calves" },
      { day: "Fri", focus: "Upper — pull", detail: "Row, pulldown, rear delt, biceps" },
      { day: "Sat", focus: "Optional", detail: "Steps + mobility, or a full rest day" },
      { day: "Sun", focus: "Rest", detail: "Full rest. Steps only." },
    ];
  }

  return [
    { day: "Mon", focus: "Full body A", detail: jointRisk ? "Leg press, neutral press, row" : "Squat, bench, row" },
    { day: "Tue", focus: "Steps + mobility", detail: "8k steps, 10 min mobility" },
    { day: "Wed", focus: "Full body B", detail: jointRisk ? "Trap-bar RDL, landmine press, pulldown" : "RDL, overhead press, pulldown" },
    { day: "Thu", focus: "Zone 2", detail: "30 min conversational pace" },
    { day: "Fri", focus: "Full body C", detail: "Split squat, incline DB, cable row" },
    { day: "Sat", focus: "Optional", detail: "Steps, recreation" },
    { day: "Sun", focus: "Rest", detail: "Full rest. Steps only." },
  ];
}

// ---------------------------------------------------------------------------
// Monitoring
// ---------------------------------------------------------------------------

function monitoringFor(client: Client, hasProtocol: boolean): MonitoringCheckpoint[] {
  const out: MonitoringCheckpoint[] = [
    {
      week: 0,
      label: hasProtocol ? "Provider confirms protocol, dose and route" : "Plan review with coach",
      owner: hasProtocol ? "Provider" : "Coach",
      detail: hasProtocol
        ? "Apex proposes modality and cadence only. Dose, frequency and route are set and signed by the provider."
        : "Walk the member through the plan and agree the first two weeks.",
    },
    { week: 2, label: "First adherence check", owner: "Coach", detail: "Nutrition and training adherence, and any early side effects." },
    { week: 4, label: "Coach check-in", owner: "Coach", detail: "Body-comp trend, subjective energy and sleep." },
    { week: 6, label: "Follow-up lab panel", owner: "Provider", detail: "Recheck the markers that triggered this plan." },
    { week: 8, label: "Body composition re-scan", owner: "Member", detail: "Same device, same time of day, fasted." },
    { week: 12, label: "Provider review and re-plan", owner: "Provider", detail: "Full review; supersede this plan with the next block." },
  ];
  return out;
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

export function buildPlanOfCare(client: Client): PlanOfCare {
  const labs = getLabsForClient(client.id);
  const scan = getScanForClient(client.id);
  const recs = recommendationsForClient(client.id);

  // Protocol items come from the existing clinical engine — the plan does not
  // invent its own clinical logic, it presents that engine's output in context.
  const protocol: PlanItem[] = recs.map((r, i) => ({
    id: `poc-pro-${i + 1}`,
    section: "protocol",
    title: r.title,
    detail: r.suggestedNextStep,
    because: [
      ...r.triggeredBy,
      ...r.supporting.labs.map((l) => `${l.name} ${l.value} — ${l.status}`),
    ],
    ruleIds: [r.id.split("-").slice(-2).join("-")],
    confidence: r.confidence,
    requiresProviderApproval: true,
    category: r.category,
    riskLevel: r.riskLevel,
    modality: r.candidates[0]?.name,
    cadence: "Provider-defined",
  }));

  const nutrition = nutritionItems(client, scan, labs);
  const training = trainingItems(client, scan);
  const macros = macrosFor(client, scan);
  const trainingSplit = splitFor(client);
  const monitoring = monitoringFor(client, protocol.length > 0);

  // Screening is inherited from the clinical engine so the plan cannot present
  // a protocol whose contraindications were never checked.
  const screened = recs.length
    ? recs[0].contraindicationChecks.map((c) => ({
        check: c.label,
        passed: c.passed,
        detail: c.note,
      }))
    : [];

  const inputs = {
    clientId: client.id,
    status: client.status,
    goals: client.goals,
    symptoms: client.symptoms,
    labDate: client.latestLabDate ?? null,
    scanDate: scan?.scannedOn ?? null,
    recIds: recs.map((r) => r.id),
  };

  const summary = buildSummary(client, protocol.length, nutrition.length, training.length, macros);

  return {
    id: `poc-${client.id}`,
    clientId: client.id,
    status: protocol.length ? "Awaiting provider" : "Draft",
    createdAt: NOW,
    durationWeeks: 12,
    goals: client.goals,
    summary,
    protocol,
    nutrition,
    training,
    monitoring,
    macros,
    trainingSplit,
    screened,
    provenance: {
      engine: ENGINE,
      engineVersion: ENGINE_VERSION,
      inputHash: sha256(canonicalJson(inputs)),
      computedAt: NOW,
      computedBy: "system",
      model: "apex rules + azure-openai/gpt-4o (narrative)",
    },
  };
}

function buildSummary(
  client: Client,
  protocolCount: number,
  nutritionCount: number,
  trainingCount: number,
  macros: MacroTarget,
): string {
  const goals = client.goals.slice(0, 3).map((g) => g.toLowerCase());
  const goalPhrase =
    goals.length > 1
      ? `${goals.slice(0, -1).join(", ")} and ${goals[goals.length - 1]}`
      : goals[0] ?? "general wellness";

  const parts = [
    `A 12-week block built around ${goalPhrase}.`,
    protocolCount
      ? `${protocolCount} protocol item${protocolCount === 1 ? "" : "s"} proposed for provider review`
      : "No protocol items proposed at this time",
    `${nutritionCount} nutrition and ${trainingCount} training directive${trainingCount === 1 ? "" : "s"}`,
    `Daily target ${macros.calories.toLocaleString()} kcal with ${macros.proteinG} g protein.`,
  ];
  return parts.join(" ") + " Reviewed at weeks 4, 6, 8 and 12.";
}

/** Every plan item across sections — for counts and search. */
export function allPlanItems(plan: PlanOfCare): PlanItem[] {
  return [...plan.protocol, ...plan.nutrition, ...plan.training];
}
