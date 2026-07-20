import type { BiomarkerStatus } from "@/lib/types";
import { clients, clientName, getClient } from "@/lib/mock/clients";
import { getLabsForClient } from "@/lib/mock/labs";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { subscriptionsForClient } from "@/lib/mock/subscriptions";
import { catalogItem } from "@/lib/catalog/catalog";
import { addDays, dayOf, daysBetween } from "@/lib/subscriptions/engine";

/**
 * MONITORING REQUIREMENT ENGINE — what a protocol obliges the clinic to check,
 * and whether anybody has.
 *
 * A protocol item is not a product, it is a commitment. Prescribing testosterone
 * commits the clinic to watching a haematocrit for as long as the member is on
 * it; starting a GLP-1 commits somebody to measuring whether it is working. In
 * the system Apex replaces, that commitment lived in a provider's memory and in
 * a coach's calendar reminder, which means it was reliably honoured for the
 * members who came in often and quietly dropped for the members who did not —
 * exactly backwards, since the member who stops coming in is the one drifting.
 *
 * So the schedule is DERIVED, not stored. Nobody has to remember to create a
 * monitoring task: the presence of an active protocol item IS the task, and the
 * only way to clear it is to have the result on file.
 *
 * ── THE HONESTY RULE, WHICH IS THE HARD PART ────────────────────────────────
 * Most of what a men's-health clinic does has no published monitoring interval.
 * Testosterone does — the Endocrine Society and the AUA both publish one, they
 * broadly agree, and it is genuinely standard of care. Anastrozole in men,
 * sermorelin, BPC-157, and most of this catalogue do not, and no amount of
 * confident UI will change that.
 *
 * A system that quietly assigned "every 90 days" to all of it would look more
 * complete and be far worse: a made-up interval rendered in the same typeface as
 * a guideline interval teaches the provider that both are guidelines. Within a
 * month nobody can tell which numbers came from the literature.
 *
 * Hence `basis` is a required field on every rule, it takes exactly three
 * values, and the UI renders it as a visible chip:
 *
 *   "published-standard"      — a named, citable guideline says this interval.
 *   "clinic-policy"           — Alpha Health's own cadence. Defensible, but
 *                               ours, and labelled as ours.
 *   "no-established-standard" — we know of no published interval. The engine
 *                               emits the requirement WITH NO DATE rather than
 *                               inventing one, and says so on screen.
 *
 * ── WHAT THIS FILE DELIBERATELY DOES NOT DO ─────────────────────────────────
 * It emits no thresholds and no actions. It never says "haematocrit is too
 * high", never says "hold the dose", and has no field to put either in. Banding
 * is left to the lab's own reference range, which already travels with every
 * `Biomarker`. Guideline cut-offs that clinicians do use are carried as
 * ATTRIBUTED PROSE on the rule (`guidelineNote`) so they are quoted rather than
 * applied — the difference between citing the Endocrine Society and silently
 * becoming it.
 */

/** Pinned clock. Matches NOW in lib/trace/ledger.ts and lib/escalations/queue.ts. */
export const NOW = "2026-06-12T09:00:00";

export type EvidenceBasis =
  | "published-standard"
  | "clinic-policy"
  | "no-established-standard";

export const BASIS_LABEL: Record<EvidenceBasis, string> = {
  "published-standard": "Published standard",
  "clinic-policy": "Clinic policy",
  "no-established-standard": "No published interval",
};

/**
 * The therapy classes Apex recognises, mapped from catalog SKU.
 *
 * Mapping is by explicit table below, never inferred from the product name.
 * Guessing from a string is how "Testosterone cypionate" and "Tesofensine" end
 * up in the same bucket — both start with "Tes", and one of them has a
 * guideline-backed monitoring schedule attached.
 */
export type TherapyClass =
  | "testosterone"
  | "glp1"
  | "aromatase-inhibitor"
  | "gonadotropin"
  | "female-hormone"
  | "peptide"
  | "investigational"
  | "none";

/** SKU → therapy class. Anything absent is `none` and implies no monitoring. */
const THERAPY_BY_SKU: Record<string, TherapyClass> = {
  "HRT-TCYP-200": "testosterone",
  "PKG-TRT-START": "testosterone",
  "GLP-SEMA-2.5": "glp1",
  "GLP-SEMA-1.0": "glp1",
  "GLP-TIRZ-5": "glp1",
  "PKG-METAB-90": "glp1",
  // Retatrutide has no FDA approval and no approved labelling to monitor
  // against. It is a GLP-1-family agent for interaction purposes but its own
  // class here, so its monitoring answer can honestly be "there isn't one".
  "GLP-RETA-10": "investigational",
  "WL-TESO-500": "investigational",
  "PEP-MELAN-10": "investigational",
  "HRT-ANAS-1MG": "aromatase-inhibitor",
  "HRT-HCG-5000": "gonadotropin",
  "HRT-ESTR-0.1": "female-hormone",
  "HRT-PROG-100": "female-hormone",
  "PEP-BPC-5MG": "peptide",
  "PEP-SERM-15": "peptide",
  "PEP-IPACJC-10": "peptide",
  "PEP-GHKCU-50": "peptide",
  "PEP-PT141-10": "peptide",
  "PEP-MK677-25": "peptide",
  "PEP-VIP-NS": "peptide",
};

export function therapyClassFor(sku: string): TherapyClass {
  return THERAPY_BY_SKU[sku] ?? "none";
}

/**
 * Program name → therapy class, for members who are on a protocol but not on
 * auto-refill.
 *
 * WHY A SECOND SOURCE AT ALL. The subscription book only knows the members who
 * enrolled in auto-ship — about a fifth of the panel. Deriving monitoring from
 * subscriptions alone would mean the members who collect in clinic, or who
 * reorder by phone, generate no monitoring obligation whatsoever. That is the
 * inverse of the truth: they are on exactly the same therapy.
 *
 * WHY IT IS KEYED ON PROGRAM NAME AND NOT ON CATEGORY. The category
 * "Metabolic / weight management" covers both "GLP Weight Management" and
 * "Metabolic Reset", and the second of those is a nutrition and coaching
 * program. Mapping the category would attach a drug's monitoring schedule to
 * members who are not on the drug — a fabricated protocol item, which is worse
 * than a missing one because it is invisible on screen and looks like data.
 *
 * A program is LESS specific evidence than a dispensed SKU: it names a service
 * line, not a molecule. That difference is carried on the item as
 * `specificity` and rendered, so a provider can see whether an obligation came
 * from something the clinic shipped or from a program a coach enrolled someone
 * in.
 */
const THERAPY_BY_PROGRAM: Record<string, TherapyClass | "by-sex"> = {
  "Hormone Optimization": "by-sex",
  "GLP Weight Management": "glp1",
  // Deliberately unmapped, and each for a reason rather than by omission:
  //   "Metabolic Reset"      — nutrition and coaching, no agent implied.
  //   "Recovery Track"       — physical therapy and peptide-adjacent services.
  //   "NAD+ Vitality"        — infusion service.
  //   "Aesthetics & Vitality"— aesthetics services.
  // If any of these later implies a dispensed agent, it should arrive as a
  // subscription or an order line, not as a guess made here.
};

export const THERAPY_LABEL: Record<TherapyClass, string> = {
  testosterone: "Testosterone therapy",
  glp1: "GLP-1 receptor agonist",
  "aromatase-inhibitor": "Aromatase inhibitor",
  gonadotropin: "Gonadotropin (hCG)",
  "female-hormone": "Oestrogen / progesterone therapy",
  peptide: "Compounded peptide",
  investigational: "Investigational / unapproved agent",
  none: "No monitoring class",
};

export interface MonitoringRule {
  id: string;
  therapy: TherapyClass;
  /** Canonical panel key (labs) or a vital key. The join to the record. */
  target: string;
  targetLabel: string;
  source: "lab" | "vital";
  basis: EvidenceBasis;
  /** Named source. Present iff basis === "published-standard". */
  citation?: string;
  /** The window in the words the guideline uses. Always rendered next to a date. */
  windowLabel: string;
  /**
   * Days from THERAPY START to the first required check, and days between
   * checks thereafter. Both null when no interval is established — which is a
   * real answer and renders as one.
   *
   * Where a guideline gives a range ("3 to 6 months"), `firstCheckDays` is the
   * OUTER edge. A due date drawn at the inner edge would mark a member overdue
   * while they are still inside the recommended window, and a worklist that
   * cries wolf is a worklist providers learn to close.
   */
  firstCheckDays: number | null;
  repeatDays: number | null;
  /** Why this is monitored at all — the physiology, not the schedule. */
  why: string;
  /** Who the rule applies to, when it is narrower than the therapy. */
  applies?: (clientId: string) => boolean;
  appliesLabel?: string;
  /** A guideline figure, quoted and attributed. Never applied by this engine. */
  guidelineNote?: string;
}

const isMale = (clientId: string) => getClient(clientId)?.sex === "male";

/**
 * THE RULE SET.
 *
 * Short on purpose. Every entry below either cites a guideline I can name, or
 * says plainly that it is ours, or says plainly that there isn't one. Items I
 * could not place in one of those three buckets with confidence are absent —
 * see the module header for why absence beats invention here.
 */
export const MONITORING_RULES: MonitoringRule[] = [
  // --- Testosterone therapy ------------------------------------------------
  {
    id: "mon.trt.hct",
    therapy: "testosterone",
    target: "hct",
    targetLabel: "Haematocrit",
    source: "lab",
    basis: "published-standard",
    citation:
      "Endocrine Society Clinical Practice Guideline (2018) and AUA Testosterone Deficiency Guideline (2018) — both advise haematocrit at baseline, again at 3–6 months, then annually.",
    windowLabel: "3–6 months after starting, then annually",
    firstCheckDays: 182,
    repeatDays: 365,
    why: "Exogenous testosterone stimulates erythropoiesis. Secondary erythrocytosis is the most common adverse effect of therapy and produces no symptoms a member would report — it exists only as a number somebody has to draw.",
    guidelineNote:
      "The Endocrine Society guideline treats a haematocrit above 54% as the level warranting evaluation. Apex quotes that figure; it does not apply it. The value and the lab's own reference band are shown and the provider decides.",
  },
  {
    id: "mon.trt.total-t",
    therapy: "testosterone",
    target: "total_t",
    targetLabel: "Total testosterone",
    source: "lab",
    basis: "published-standard",
    citation:
      "Endocrine Society Clinical Practice Guideline (2018) — measure testosterone 3–6 months after initiation to confirm the therapeutic target, then annually.",
    windowLabel: "3–6 months after starting, then annually",
    firstCheckDays: 182,
    repeatDays: 365,
    why: "The point of the check is to confirm the member is actually in the range the therapy was aimed at — under-treatment and over-treatment look identical from the outside.",
  },
  {
    id: "mon.trt.psa",
    therapy: "testosterone",
    target: "psa",
    targetLabel: "PSA",
    source: "lab",
    basis: "published-standard",
    citation:
      "Endocrine Society (2018) and AUA (2018) — prostate surveillance in men aged 40 and over: PSA 3–12 months after starting, then per age-appropriate prostate-cancer screening guidance.",
    windowLabel: "3–12 months after starting, then per screening guidance",
    firstCheckDays: 365,
    repeatDays: 365,
    why: "Testosterone therapy is not thought to cause prostate cancer, but it can unmask a cancer that was already there. Guidelines therefore ask for surveillance during therapy rather than before it only.",
    applies: (id) => isMale(id) && (getClient(id)?.age ?? 0) >= 40,
    appliesLabel: "Men aged 40 and over",
    guidelineNote:
      "Beyond the first year, both guidelines defer to general prostate-cancer screening guidance, which differs between bodies and depends on the member's risk. Apex holds the annual cadence as the clinic's default and flags that the underlying recommendation is not a single number.",
  },
  {
    id: "mon.trt.e2",
    therapy: "testosterone",
    target: "estradiol",
    targetLabel: "Estradiol (E2)",
    source: "lab",
    basis: "clinic-policy",
    windowLabel: "Every 6 months while on therapy — Alpha Health cadence",
    firstCheckDays: 182,
    repeatDays: 182,
    why: "Testosterone aromatises to oestradiol, and symptomatic members are commonly checked. We are labelling this honestly: routine oestradiol surveillance on testosterone therapy is common clinic practice, not a published standard-of-care interval, and the six months below is ours.",
  },

  // --- GLP-1 receptor agonists --------------------------------------------
  {
    id: "mon.glp1.weight",
    therapy: "glp1",
    target: "weight",
    targetLabel: "Weight / body composition",
    source: "vital",
    basis: "clinic-policy",
    windowLabel: "Every 28 days, aligned to the refill — Alpha Health cadence",
    firstCheckDays: 28,
    repeatDays: 28,
    why: "Weight change is the response measure the therapy is aimed at, so a member on a GLP-1 with no recent weight is a member nobody can say the drug is working for. The 28-day cadence is ours — it tracks the refill so the two conversations happen together. No guideline publishes a monitoring interval for this.",
  },
  {
    id: "mon.glp1.a1c",
    therapy: "glp1",
    target: "a1c",
    targetLabel: "Hemoglobin A1C",
    source: "lab",
    basis: "published-standard",
    citation:
      "ADA Standards of Care — A1C at least twice a year for people meeting glycaemic goals, and quarterly when therapy has changed or goals are not being met.",
    windowLabel: "At least twice a year; quarterly when therapy has changed",
    firstCheckDays: 182,
    repeatDays: 182,
    why: "These agents move glycaemia whether or not the member was prescribed them for it, and A1C is the marker the guidance is written against.",
    // Deliberately narrow: the ADA interval is written for people with
    // diabetes. Applying it to a normoglycaemic member on a GLP-1 for weight
    // would be borrowing a guideline's authority for a population it does not
    // cover, so the rule only fires when there is a glycaemic finding on file.
    applies: (id) => {
      const a1c = getLabsForClient(id)?.biomarkers.find((b) => b.key === "a1c");
      return a1c !== undefined && a1c.status !== "optimal";
    },
    appliesLabel: "Members with an A1C outside the optimal window on file",
    guidelineNote:
      "Routine monitoring of pancreatic enzymes is NOT recommended in members without symptoms — the labelling for these agents asks clinicians to watch for symptoms of pancreatitis, not to draw lipase on a schedule. Apex therefore schedules no such draw.",
  },

  // --- Everything else: an honest blank ------------------------------------
  //
  // These rules exist precisely so the answer is visible. Emitting nothing for
  // anastrozole would read on screen as "anastrozole needs no monitoring",
  // which is a stronger claim than the truth. Emitting a requirement with no
  // date says what is actually the case: something should probably be watched,
  // and no published schedule tells us what or when.
  {
    id: "mon.ai.none",
    therapy: "aromatase-inhibitor",
    target: "estradiol",
    targetLabel: "Estradiol (E2)",
    source: "lab",
    basis: "no-established-standard",
    windowLabel: "No published monitoring interval — clinic policy governs",
    firstCheckDays: null,
    repeatDays: null,
    why: "Anastrozole in men is off-label and there is no guideline monitoring schedule to cite. Oestradiol has a documented role in male bone health, so over-suppression is a real concern, but the interval at which to check for it is not something we can source. This is left to the provider rather than filled in.",
  },
  {
    id: "mon.hcg.none",
    therapy: "gonadotropin",
    target: "total_t",
    targetLabel: "Total testosterone",
    source: "lab",
    basis: "no-established-standard",
    windowLabel: "No published monitoring interval",
    firstCheckDays: null,
    repeatDays: null,
    why: "hCG is used in men's health largely off-label and we know of no published surveillance interval for it. Where it is co-administered with testosterone, the testosterone rules above carry the schedule.",
  },
  {
    id: "mon.female-hormone.none",
    therapy: "female-hormone",
    target: "estradiol",
    targetLabel: "Estradiol (E2)",
    source: "lab",
    basis: "no-established-standard",
    windowLabel: "Individualised — no single published interval",
    firstCheckDays: null,
    repeatDays: null,
    why: "Menopausal hormone therapy guidance is built around symptom review and individual risk rather than a fixed laboratory interval. Reducing it to a number here would misrepresent it.",
  },
  {
    id: "mon.peptide.none",
    therapy: "peptide",
    target: "—",
    targetLabel: "No defined surveillance marker",
    source: "lab",
    basis: "no-established-standard",
    windowLabel: "No published monitoring interval",
    firstCheckDays: null,
    repeatDays: null,
    why: "Compounded peptides in this catalogue have no outcome trials and no approved labelling, so there is no published schedule and no established marker to follow. Whatever the clinic does here is the clinic's own policy and should be written down as such.",
  },
  {
    id: "mon.investigational.none",
    therapy: "investigational",
    target: "—",
    targetLabel: "No defined surveillance marker",
    source: "lab",
    basis: "no-established-standard",
    windowLabel: "No approved labelling to monitor against",
    firstCheckDays: null,
    repeatDays: null,
    why: "This agent has no FDA approval, which means there is no approved labelling and therefore no monitoring section to follow. Anything scheduled against it is invented by whoever schedules it.",
  },
];

/**
 * How close to due counts as "due soon".
 *
 * Thirty days, and it is ours — no guideline speaks to lead time. It is chosen
 * to be long enough that a lab draw can actually be scheduled, drawn and
 * resulted before the due date passes, which is the only property that makes a
 * warning useful rather than decorative.
 */
export const DUE_SOON_DAYS = 30;

export type MonitoringStatus =
  | "current"
  | "due-soon"
  | "overdue"
  | "never-done"
  | "no-schedule";

export const STATUS_LABEL: Record<MonitoringStatus, string> = {
  current: "Current",
  "due-soon": "Due soon",
  overdue: "Overdue",
  "never-done": "Never done on therapy",
  "no-schedule": "No schedule to hold it to",
};

/**
 * One thing the member is actually on, normalised across both sources.
 *
 * `specificity` is the honesty field. "product" means a dispensed catalog SKU
 * — Apex knows the molecule. "program-category" means the obligation was
 * inferred from a program enrolment, which names a service line and not a
 * molecule, and the UI says so rather than presenting the two as equivalent.
 */
export interface ProtocolItem {
  source: "subscription" | "program";
  specificity: "product" | "program-category";
  /** Catalog SKU when the source is a subscription. */
  sku?: string;
  label: string;
  therapy: TherapyClass;
  startedOn: string;
}

export interface MonitoringItem {
  /** `${clientId}:${rule.id}` — stable, so React keys and ledger ids agree. */
  id: string;
  rule: MonitoringRule;
  /** The protocol item that created the obligation. */
  from: ProtocolItem;
  /** Catalog name (or program name) of the item that created the obligation. */
  therapyName: string;
  therapyClass: TherapyClass;
  /** ISO date the member started this protocol item. The interval's anchor. */
  startedOn: string;
  /**
   * When the target was last resulted. Undefined means never — which is
   * different from "done a long time ago" and is ranked differently.
   */
  lastDoneOn?: string;
  lastValue?: string;
  lastStatus?: BiomarkerStatus;
  /** True when the only result on file predates the therapy start. */
  predatesTherapy: boolean;
  nextDueOn?: string;
  /** Negative when overdue. Undefined when there is no schedule. */
  daysUntilDue?: number;
  status: MonitoringStatus;
  /** The sentence, ready to render. */
  line: string;
}

export interface MemberMonitoring {
  clientId: string;
  clientName: string;
  items: MonitoringItem[];
  overdue: MonitoringItem[];
  dueSoon: MonitoringItem[];
  /** Requirements the engine could not schedule. Counted, never hidden. */
  unscheduled: MonitoringItem[];
  /** Largest overdue figure across the member's items. 0 when nothing is overdue. */
  worstDaysOverdue: number;
  /** Ranking score — see `rankOf`. */
  rank: number;
}

// ---------------------------------------------------------------------------
// Reading the record
// ---------------------------------------------------------------------------

interface LastResult {
  on: string;
  value: string;
  status?: BiomarkerStatus;
}

/**
 * When a lab marker was last resulted for this member.
 *
 * Reads the marker's own history where it exists rather than the panel date,
 * because a marker can be carried forward from an earlier draw. Where there is
 * no history array the panel's collection date is the honest answer.
 */
function lastLab(clientId: string, key: string): LastResult | undefined {
  const labs = getLabsForClient(clientId);
  const b = labs?.biomarkers.find((m) => m.key === key);
  if (!labs || !b) return undefined;
  const on = b.history?.length ? b.history[b.history.length - 1].date : labs.collectedOn;
  return { on: dayOf(on), value: `${b.value} ${b.unit}`, status: b.status };
}

/** When weight was last measured — the InBody scan is the clinic's weight of record. */
function lastVital(clientId: string, key: string): LastResult | undefined {
  if (key !== "weight") return undefined;
  const scan = getScanForClient(clientId);
  if (!scan) return undefined;
  const on = scan.history?.length ? scan.history[scan.history.length - 1].date : scan.scannedOn;
  const kg = scan.history?.length
    ? scan.history[scan.history.length - 1].weightKg
    : scan.weightKg;
  return { on: dayOf(on), value: `${kg.toFixed(1)} kg` };
}

// ---------------------------------------------------------------------------
// The schedule
// ---------------------------------------------------------------------------

/**
 * Resolve one rule against one protocol item.
 *
 * The single clinically load-bearing decision in here: a result that PREDATES
 * the therapy start does not satisfy the first check. "Haematocrit at 3–6
 * months after initiation" means after initiation; a panel drawn the week
 * before the first injection tells you nothing about what the injection did.
 * Treating it as satisfied is the failure mode this engine exists to remove, so
 * it is called out on the item (`predatesTherapy`) rather than silently handled.
 */
function evaluate(
  clientId: string,
  rule: MonitoringRule,
  from: ProtocolItem,
  nowIso: string,
): MonitoringItem {
  const last = rule.source === "vital" ? lastVital(clientId, rule.target) : lastLab(clientId, rule.target);
  const start = dayOf(from.startedOn);
  const predatesTherapy = last !== undefined && daysBetween(start, last.on) < 0;

  const base: Omit<MonitoringItem, "status" | "line" | "nextDueOn" | "daysUntilDue"> = {
    id: `${clientId}:${rule.id}`,
    rule,
    from,
    therapyName: from.label,
    therapyClass: rule.therapy,
    startedOn: start,
    lastDoneOn: last?.on,
    lastValue: last?.value,
    lastStatus: last?.status,
    predatesTherapy,
  };

  // No published interval — we say so and stop. No date is produced because we
  // do not have one, and producing one anyway is the whole thing we are avoiding.
  if (rule.firstCheckDays === null || rule.repeatDays === null) {
    return {
      ...base,
      status: "no-schedule",
      line: `${rule.targetLabel} — ${rule.windowLabel.toLowerCase()}. Apex will not invent a due date for this one.`,
    };
  }

  const satisfiedOn = last && !predatesTherapy ? last.on : undefined;
  const nextDueOn = satisfiedOn
    ? addDays(satisfiedOn, rule.repeatDays)
    : addDays(start, rule.firstCheckDays);
  const daysUntilDue = daysBetween(dayOf(nowIso), nextDueOn);

  const status: MonitoringStatus =
    daysUntilDue < 0
      ? satisfiedOn
        ? "overdue"
        : "never-done"
      : daysUntilDue <= DUE_SOON_DAYS
        ? "due-soon"
        : "current";

  return { ...base, nextDueOn, daysUntilDue, status, line: lineFor(rule, status, daysUntilDue, last, predatesTherapy) };
}

function lineFor(
  rule: MonitoringRule,
  status: MonitoringStatus,
  daysUntilDue: number,
  last: LastResult | undefined,
  predatesTherapy: boolean,
): string {
  const overdueBy = Math.abs(daysUntilDue);
  if (status === "never-done") {
    return last && predatesTherapy
      ? `${rule.targetLabel} has not been drawn since this protocol started — the result on file predates it by design of the calendar, not of the plan. ${overdueBy} days past the first check.`
      : `${rule.targetLabel} has never been resulted for this member. ${overdueBy} days past the first check this protocol implies.`;
  }
  if (status === "overdue") {
    return `${rule.targetLabel} last resulted ${last?.on ?? "—"}. ${overdueBy} days past due on a ${rule.windowLabel.toLowerCase()} cadence.`;
  }
  if (status === "due-soon") {
    return `${rule.targetLabel} due in ${daysUntilDue} days. Enough runway to draw it before it lapses.`;
  }
  return `${rule.targetLabel} current — next due in ${daysUntilDue} days.`;
}

/**
 * Ranking, and why it is not just "most days overdue".
 *
 * A member 400 days late on a clinic-policy oestradiol check is not more urgent
 * than a member 40 days late on a guideline-mandated haematocrit, and a
 * worklist that sorts purely on elapsed time will always put the first one on
 * top. So published-standard breaches dominate the score, count of breaches
 * breaks ties above elapsed time, and elapsed time only decides between
 * otherwise equal rows.
 */
function rankOf(items: MonitoringItem[]): number {
  const late = items.filter((i) => i.status === "overdue" || i.status === "never-done");
  const published = late.filter((i) => i.rule.basis === "published-standard").length;
  const worst = late.reduce((m, i) => Math.max(m, Math.abs(i.daysUntilDue ?? 0)), 0);
  const soon = items.filter((i) => i.status === "due-soon").length;
  // Anything actually late outranks everything merely approaching, so the
  // due-soon term is capped below the smallest late contribution.
  return published * 100_000 + late.length * 1_000 + Math.min(worst, 499) + Math.min(soon, 3);
}

/**
 * Every monitoring obligation this member's active protocol implies.
 *
 * Sourced from the subscription book rather than from `Client.programs`,
 * because a subscription names an actual catalog SKU and carries the date the
 * member started it. A program carries a category ("Hormone optimization
 * discussion") which is not enough to know whether anybody is on testosterone.
 */
export function activeProtocolItems(clientId: string): ProtocolItem[] {
  const client = getClient(clientId);
  const out: ProtocolItem[] = [];

  for (const sub of subscriptionsForClient(clientId)) {
    if (sub.status !== "Active") continue;
    const therapy = therapyClassFor(sub.sku);
    if (therapy === "none") continue;
    out.push({
      source: "subscription",
      specificity: "product",
      sku: sub.sku,
      label: catalogItem(sub.sku)?.name ?? sub.sku,
      therapy,
      startedOn: dayOf(sub.startedOn),
    });
  }

  for (const program of client?.programs ?? []) {
    if (program.status !== "Active") continue;
    const mapped = THERAPY_BY_PROGRAM[program.name];
    if (!mapped) continue;
    // "Hormone Optimization" means testosterone for a male member and
    // oestrogen/progesterone for a female one. Running one rule set over both
    // would put a PSA obligation on a woman, which is not a rounding error.
    const therapy: TherapyClass =
      mapped === "by-sex" ? (client?.sex === "male" ? "testosterone" : "female-hormone") : mapped;
    out.push({
      source: "program",
      specificity: "program-category",
      label: program.name,
      therapy,
      startedOn: dayOf(program.startedOn),
    });
  }

  return out;
}

export function monitoringFor(clientId: string, nowIso: string = NOW): MemberMonitoring {
  const client = getClient(clientId);
  const items: MonitoringItem[] = [];

  for (const source of activeProtocolItems(clientId)) {
    for (const rule of MONITORING_RULES) {
      if (rule.therapy !== source.therapy) continue;
      if (rule.applies && !rule.applies(clientId)) continue;
      items.push(evaluate(clientId, rule, source, nowIso));
    }
  }

  // The same requirement can arrive twice — a testosterone SKU on auto-refill
  // AND a Hormone Optimization program enrolment describe one therapy, not two.
  // Keep the PRODUCT-level derivation where both exist (it names the molecule),
  // and otherwise the one anchored to the earlier start, since the obligation
  // dates from whenever the member actually began.
  const byRule = new Map<string, MonitoringItem>();
  for (const it of items) {
    const prior = byRule.get(it.rule.id);
    if (!prior) {
      byRule.set(it.rule.id, it);
      continue;
    }
    const betterSpecificity =
      it.from.specificity === "product" && prior.from.specificity !== "product";
    const worseSpecificity =
      prior.from.specificity === "product" && it.from.specificity !== "product";
    if (betterSpecificity || (!worseSpecificity && daysBetween(it.startedOn, prior.startedOn) > 0)) {
      byRule.set(it.rule.id, it);
    }
  }
  const deduped = [...byRule.values()];

  const overdue = deduped.filter((i) => i.status === "overdue" || i.status === "never-done");
  const dueSoon = deduped.filter((i) => i.status === "due-soon");
  const unscheduled = deduped.filter((i) => i.status === "no-schedule");

  return {
    clientId,
    clientName: client ? clientName(client) : clientId,
    items: deduped.sort((a, b) => statusOrder(a.status) - statusOrder(b.status)),
    overdue,
    dueSoon,
    unscheduled,
    worstDaysOverdue: overdue.reduce((m, i) => Math.max(m, Math.abs(i.daysUntilDue ?? 0)), 0),
    rank: rankOf(deduped),
  };
}

function statusOrder(s: MonitoringStatus): number {
  return { "never-done": 0, overdue: 1, "due-soon": 2, "no-schedule": 3, current: 4 }[s];
}

export interface WorklistOptions {
  /** Restrict to one location. Omit or "all" for every location. */
  locationId?: string;
  /** Restrict to one provider's panel. */
  providerId?: string;
  /** Only members with something actually overdue. Default true. */
  overdueOnly?: boolean;
  /**
   * Include members whose next check falls inside `DUE_SOON_DAYS`.
   *
   * On by default, and it is the more useful worklist: monitoring that is
   * merely late has already failed, whereas monitoring due in three weeks can
   * still be drawn on the visit the member already has booked. A queue that
   * only shows breaches is a queue that can only ever be worked reactively.
   */
  includeDueSoon?: boolean;
  nowIso?: string;
}

/**
 * The ranked worklist — members first, requirements second.
 *
 * Deliberately member-shaped rather than requirement-shaped. A provider does
 * not work a queue of haematocrits; they work a queue of people, and a member
 * three checks behind is one conversation, not three rows. Flattening this to
 * requirements would triple the apparent backlog and split the one phone call
 * that resolves it.
 */
export function monitoringWorklist(opts: WorklistOptions = {}): MemberMonitoring[] {
  const { locationId, providerId, overdueOnly = true, includeDueSoon = true, nowIso = NOW } = opts;
  return clients
    .filter((c) => (!locationId || locationId === "all" ? true : c.locationId === locationId))
    .filter((c) => (providerId ? c.providerId === providerId : true))
    .map((c) => monitoringFor(c.id, nowIso))
    .filter((m) =>
      overdueOnly
        ? m.overdue.length > 0 || (includeDueSoon && m.dueSoon.length > 0)
        : m.items.length > 0,
    )
    .sort((a, b) => b.rank - a.rank || a.clientName.localeCompare(b.clientName));
}

/**
 * Provenance for one requirement — the exact inputs that produced the date.
 *
 * Shaped for `ProvenanceDrawer.inputs`. Every field here is something a
 * clinician can go and check against the record; nothing is a restatement of
 * the conclusion.
 */
export function monitoringInputs(item: MonitoringItem): { label: string; value: string }[] {
  return [
    {
      label: "Protocol item",
      value: item.from.sku ? `${item.therapyName} (${item.from.sku})` : item.therapyName,
    },
    {
      label: "Derived from",
      value:
        item.from.specificity === "product"
          ? "a dispensed catalog product — the molecule is known"
          : "a program enrolment — the service line is known, the molecule is not",
    },
    { label: "Therapy class", value: THERAPY_LABEL[item.therapyClass] },
    { label: "Started on", value: item.startedOn },
    { label: "Rule", value: item.rule.id },
    { label: "Basis", value: BASIS_LABEL[item.rule.basis] },
    { label: "Interval", value: item.rule.windowLabel },
    {
      label: "First check anchored at",
      value:
        item.rule.firstCheckDays === null
          ? "no interval established"
          : `start + ${item.rule.firstCheckDays} days`,
    },
    {
      label: "Repeat interval",
      value: item.rule.repeatDays === null ? "no interval established" : `${item.rule.repeatDays} days`,
    },
    { label: "Last result on file", value: item.lastDoneOn ?? "none on file" },
    { label: "Last value", value: item.lastValue ?? "—" },
    {
      label: "Result predates therapy start",
      value: item.predatesTherapy ? "yes — does not satisfy the first check" : "no",
    },
    { label: "Next due", value: item.nextDueOn ?? "not scheduled — no published interval" },
    { label: "Status", value: STATUS_LABEL[item.status] },
    { label: "Evaluated at", value: dayOf(NOW) },
  ];
}

/** Plain-language "because" lines for the provenance drawer. */
export function monitoringBecause(item: MonitoringItem): string[] {
  return [
    `${item.therapyName} is active on this member's protocol and started ${item.startedOn}. ${
      item.from.specificity === "product"
        ? "This is a dispensed catalog product, so the agent is known exactly."
        : "This was derived from a program enrolment, which names the service line rather than the molecule — confirm the agent before acting on the schedule."
    }`,
    item.rule.why,
    item.rule.basis === "published-standard"
      ? `Interval basis: ${item.rule.citation}`
      : item.rule.basis === "clinic-policy"
        ? `Interval basis: Alpha Health clinic policy — ${item.rule.windowLabel}. This is not a published standard and is labelled as clinic policy wherever it renders.`
        : `No published monitoring interval is known for this. Apex emits the requirement without a due date rather than inventing one.`,
    ...(item.rule.appliesLabel ? [`Scope: ${item.rule.appliesLabel}.`] : []),
    ...(item.predatesTherapy
      ? ["The result on file was drawn before this protocol started, so it does not satisfy the first on-therapy check."]
      : []),
    ...(item.rule.guidelineNote ? [item.rule.guidelineNote] : []),
  ];
}

/** Practice-level counters for the command centre header. */
export interface MonitoringSummary {
  membersOverdue: number;
  membersDueSoon: number;
  requirementsOverdue: number;
  publishedStandardOverdue: number;
  clinicPolicyOverdue: number;
  unscheduledRequirements: number;
}

export function monitoringSummary(worklist: MemberMonitoring[]): MonitoringSummary {
  const all = worklist.flatMap((m) => m.overdue);
  return {
    membersOverdue: worklist.filter((m) => m.overdue.length > 0).length,
    membersDueSoon: worklist.filter((m) => m.overdue.length === 0 && m.dueSoon.length > 0).length,
    requirementsOverdue: all.length,
    publishedStandardOverdue: all.filter((i) => i.rule.basis === "published-standard").length,
    clinicPolicyOverdue: all.filter((i) => i.rule.basis === "clinic-policy").length,
    unscheduledRequirements: worklist.reduce((s, m) => s + m.unscheduled.length, 0),
  };
}
