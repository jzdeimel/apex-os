import { absolute } from "@/lib/utils";
import type { Biomarker, Client } from "@/lib/types";
import type { PlanOfCare } from "@/lib/planOfCare/types";
import { clients, getClient } from "@/lib/mock/clients";
import { getLabsForClient } from "@/lib/mock/labs";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { appointmentsForClient } from "@/lib/mock/appointments";
import { daysSinceTouch } from "@/lib/mock/contactLog";
import { buildPlanOfCare, allPlanItems } from "@/lib/planOfCare/engine";

/**
 * Care gaps — what a member is clinically MISSING.
 *
 * ===========================================================================
 * THE RULE THIS FILE EXISTS TO ENFORCE
 * A care gap is a gap in CARE, not an unsold product. Every gap below is
 * something the member's own plan of care, protocol or panel already committed
 * to and that has not happened: a recheck the plan scheduled, a scan the plan
 * tracks its outcome against, a signature a protocol is waiting on, an
 * out-of-range marker nothing in the plan addresses.
 *
 * If the only reason to surface something is revenue — an upgrade tier, an
 * add-on service, a peptide the member is a plausible buyer for — it does NOT
 * belong here. That belongs on a growth surface with a growth label on it, so
 * that a clinician reading this board can trust that everything on it is a
 * clinical obligation. The moment a board like this mixes the two, staff stop
 * believing any of it and work it as a sales queue.
 * ===========================================================================
 *
 * Everything is derived, never authored: the cadence comes from
 * `buildPlanOfCare(client).monitoring`, the markers come from the member's own
 * last panel, and the dates come from their own programs and appointments. No
 * dose, frequency or route is invented here — Apex does not prescribe, and a
 * gap board that guesses at a schedule is worse than no gap board.
 */

/** Pinned clock. Nothing in Apex reads the wall clock. */
const NOW = absolute("2026-06-12T09:00:00");
const DAY_MS = 86_400_000;

/**
 * Silence threshold, matched to the coach queue's STALE_TOUCH_DAYS so the two
 * surfaces never disagree about what "too long" means. Deliberately duplicated
 * as a constant rather than imported from a component — lib must not depend on
 * components/.
 */
const COACH_TOUCH_DAYS = 21;

/** A gap is only worth showing this far ahead of its due date. */
const LOOKAHEAD_DAYS = 14;

/** Past due by this much stops being "due" and becomes "overdue". */
const OVERDUE_AFTER_DAYS = 14;

export type GapKind =
  | "labs-overdue"
  | "safety-monitoring"
  | "no-baseline-scan"
  | "no-rescan"
  | "no-followup"
  | "plan-unapproved"
  | "unaddressed-marker"
  | "coach-silence";

export type GapSeverity = "routine" | "due" | "overdue";

export type GapOwner = "Coach" | "Provider" | "Member";

export interface Gap {
  id: string;
  clientId: string;
  kind: GapKind;
  severity: GapSeverity;
  /** The missing thing, stated as a noun phrase. */
  title: string;
  /** Why it is missing and why that matters clinically. One sentence. */
  why: string;
  /** The records that produced this gap. Auditable, never a vibe. */
  evidence: string[];
  /** The single next step, imperative. */
  suggestedAction: string;
  owner: GapOwner;
  /** Days past due. Negative = still upcoming. Used for ranking. */
  daysOverdue: number;
  /** ISO date the gap came due, where a date exists. */
  dueOn?: string;
}

export const GAP_KIND_LABEL: Record<GapKind, string> = {
  "labs-overdue": "Lab recheck",
  "safety-monitoring": "Safety monitoring",
  "no-baseline-scan": "Baseline body scan",
  "no-rescan": "Body composition re-scan",
  "no-followup": "Follow-up visit",
  "plan-unapproved": "Plan approval",
  "unaddressed-marker": "Unaddressed finding",
  "coach-silence": "Coach contact",
};

export const GAP_KINDS = Object.keys(GAP_KIND_LABEL) as GapKind[];
export const GAP_OWNERS: GapOwner[] = ["Coach", "Provider", "Member"];

const SEVERITY_RANK: Record<GapSeverity, number> = { overdue: 0, due: 1, routine: 2 };

export const SEVERITY_ORDER: GapSeverity[] = ["overdue", "due", "routine"];

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function daysBetween(fromIso: string, to: Date = NOW): number {
  return Math.floor((to.getTime() - Date.parse(fromIso)) / DAY_MS);
}

function addWeeks(iso: string, weeks: number): string {
  const d = absolute(Date.parse(iso) + weeks * 7 * DAY_MS);
  return d.toISOString().slice(0, 10);
}

/**
 * Severity from a due date. Returns null when the item is far enough out that
 * surfacing it would be noise — a board full of things that are fine is a board
 * nobody opens.
 */
function severityFor(dueIso: string): { severity: GapSeverity; daysOverdue: number } | null {
  const daysOverdue = daysBetween(dueIso);
  if (daysOverdue >= OVERDUE_AFTER_DAYS) return { severity: "overdue", daysOverdue };
  if (daysOverdue >= 0) return { severity: "due", daysOverdue };
  if (daysOverdue >= -LOOKAHEAD_DAYS) return { severity: "routine", daysOverdue };
  return null;
}

// ---------------------------------------------------------------------------
// Plan-derived cadence
// ---------------------------------------------------------------------------

/**
 * The member's monitoring cadence, read off THEIR plan rather than a constant.
 * Two members on different plans get different due dates, which is the whole
 * reason the plan carries a monitoring schedule at all.
 */
function cadence(plan: PlanOfCare) {
  const labWeek = plan.monitoring.find((m) => /lab/i.test(m.label))?.week;
  const scanWeek = plan.monitoring.find((m) => /scan|body composition/i.test(m.label))?.week;
  const coachWeek = plan.monitoring.find((m) => m.owner === "Coach" && m.week > 0)?.week;
  return {
    labWeeks: labWeek ?? 6,
    scanWeeks: scanWeek ?? 8,
    coachWeeks: coachWeek ?? 4,
  };
}

/**
 * The clinical clock starts when the protocol starts. Before that, the member's
 * join date is the only honest anchor — nothing has been prescribed to monitor.
 */
function activeProgram(client: Client) {
  return client.programs
    .filter((p) => p.status === "Active")
    .sort((a, b) => a.startedOn.localeCompare(b.startedOn))[0];
}

/** Body composition is the tracked outcome for these goals — a scan IS the measurement. */
function bodyCompIsOutcome(client: Client): boolean {
  return client.goals.includes("Fat loss") || client.goals.includes("Muscle gain");
}

/** Hormone therapy carries its own monitoring obligations. Detected from the record, not assumed. */
function onHormoneProtocol(client: Client, plan: PlanOfCare): boolean {
  const cat = "Hormone optimization discussion";
  return (
    client.programs.some((p) => p.status === "Active" && p.category === cat) ||
    plan.protocol.some((i) => i.category === cat)
  );
}

// ---------------------------------------------------------------------------
// Marker coverage
// ---------------------------------------------------------------------------

/**
 * Common short forms a plan item uses for a marker. Without these, "Hemoglobin
 * A1C" looks uncovered even when a nutrition directive names A1C explicitly,
 * and the board cries wolf on its most important gap type.
 */
const MARKER_ALIASES: Record<string, string[]> = {
  "Hemoglobin A1C": ["a1c"],
  "Fasting Glucose": ["glucose"],
  "Fasting Insulin": ["insulin"],
  "Vitamin D, 25-OH": ["vitamin d", "vit d"],
  "Vitamin B12": ["b12"],
  "Total Testosterone": ["testosterone"],
  "Free Testosterone": ["testosterone"],
  "Estradiol (E2)": ["estradiol", "e2"],
  "hs-CRP": ["crp", "inflammation"],
  CRP: ["crp", "inflammation"],
  "Free T3": ["t3", "thyroid"],
  "Free T4": ["t4", "thyroid"],
  "Reverse T3": ["thyroid"],
  TSH: ["thyroid"],
  Triglycerides: ["triglyceride", "lipid"],
  ApoB: ["apob", "lipid"],
  "LDL Cholesterol": ["ldl", "lipid"],
  "HDL Cholesterol": ["hdl", "lipid"],
  Hematocrit: ["hematocrit", "hct"],
  Ferritin: ["ferritin", "iron"],
  PSA: ["psa", "prostate"],
};

/** Every word the plan says, flattened once per client. */
function planText(plan: PlanOfCare): string {
  return allPlanItems(plan)
    .flatMap((i) => [i.title, i.detail, ...i.because])
    .join(" \n ")
    .toLowerCase();
}

function markerIsAddressed(marker: Biomarker, haystack: string): boolean {
  const needles = [marker.name.toLowerCase(), ...(MARKER_ALIASES[marker.name] ?? [])];
  return needles.some((n) => haystack.includes(n));
}

/** How far outside the reference range, normalised so markers are comparable. */
function deviation(marker: Biomarker): number {
  const span = Math.max(1e-6, marker.refHigh - marker.refLow);
  if (marker.value > marker.refHigh) return (marker.value - marker.refHigh) / span;
  if (marker.value < marker.refLow) return (marker.refLow - marker.value) / span;
  return 0;
}

function markerLine(m: Biomarker): string {
  return `${m.name} ${m.value}${m.unit ? ` ${m.unit}` : ""} — ${m.status} (ref ${m.refLow}–${m.refHigh})`;
}

/**
 * Cap on uncovered markers surfaced per member. A panel is 29 markers wide; a
 * board that lists nine of them for one person buries the other nineteen
 * members. Worst deviation first — the rest stay on the chart where they live.
 */
const MAX_MARKER_GAPS = 3;

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

/** Plans are deterministic, so build each one at most once per process. */
const planCache = new Map<string, PlanOfCare>();
function planFor(client: Client): PlanOfCare {
  const hit = planCache.get(client.id);
  if (hit) return hit;
  const plan = buildPlanOfCare(client);
  planCache.set(client.id, plan);
  return plan;
}

export function gapsFor(clientId: string): Gap[] {
  const client = getClient(clientId);
  if (!client) return [];

  // A discharged member has no open obligations; surfacing gaps for them turns
  // the board into a win-back list, which is exactly the line this file holds.
  if (client.status === "Inactive") return [];

  const plan = planFor(client);
  const { labWeeks, scanWeeks, coachWeeks } = cadence(plan);
  const labs = getLabsForClient(client.id);
  const scan = getScanForClient(client.id);
  const program = activeProgram(client);
  const anchor = program?.startedOn ?? client.joinedOn;
  const gaps: Gap[] = [];

  const push = (g: Omit<Gap, "clientId" | "id"> & { id: string }) =>
    gaps.push({ ...g, clientId: client.id, id: `${client.id}-${g.id}` });

  // -- 1. Safety monitoring on hormone therapy ------------------------------
  // Takes precedence over the generic lab recheck: it is the same blood draw,
  // and two rows for one needle is how a board loses a coach's trust.
  const hormone = onHormoneProtocol(client, plan);
  const labDue = addWeeks(anchor, labWeeks);
  const labSev = severityFor(labDue);
  const labStale = !client.latestLabDate || client.latestLabDate < labDue;

  if (hormone && program && labSev && labStale) {
    // The marker list is read off the member's OWN last panel — Apex does not
    // author a monitoring panel, it names what their plan already rechecks.
    const watchCats: Biomarker["category"][] = ["Hormones", "Blood", "Prostate"];
    const onFile = (labs?.biomarkers ?? []).filter((b) => watchCats.includes(b.category));
    push({
      id: "safety",
      kind: "safety-monitoring",
      severity: labSev.severity,
      daysOverdue: labSev.daysOverdue,
      dueOn: labDue,
      title: "Follow-up panel on hormone therapy not drawn",
      why: `Their plan sets a week-${labWeeks} recheck after protocol start and no panel has been resulted since.`,
      evidence: [
        `Active protocol: ${program.name}, started ${program.startedOn}`,
        `Plan monitoring: week ${labWeeks} follow-up lab panel (Provider)`,
        client.latestLabDate
          ? `Last panel resulted ${client.latestLabDate} — ${daysBetween(client.latestLabDate)}d ago`
          : "No panel on file",
        onFile.length
          ? `On their panel: ${onFile.slice(0, 5).map((b) => b.name).join(", ")}`
          : "No hormone or blood markers on file to recheck",
      ],
      suggestedAction: "Order the follow-up panel and book the draw",
      owner: "Provider",
    });
  } else if (program && labSev && labStale) {
    // -- 2. Lab recheck against the plan's own cadence ----------------------
    push({
      id: "labs",
      kind: "labs-overdue",
      severity: labSev.severity,
      daysOverdue: labSev.daysOverdue,
      dueOn: labDue,
      title: "Lab recheck past the plan's cadence",
      why: `The plan rechecks the markers that triggered it at week ${labWeeks}; that point has been reached without a panel.`,
      evidence: [
        `Active protocol: ${program.name}, started ${program.startedOn}`,
        `Plan monitoring: week ${labWeeks} follow-up lab panel`,
        client.latestLabDate
          ? `Last panel ${client.latestLabDate} — ${daysBetween(client.latestLabDate)}d ago`
          : "No panel on file",
      ],
      suggestedAction: "Order the recheck panel",
      owner: "Provider",
    });
  }

  // -- 3. Body composition: no baseline, or no re-scan since starting -------
  if (bodyCompIsOutcome(client)) {
    if (!scan) {
      // Without a baseline there is nothing to measure the protocol against —
      // and the plan's own energy target falls back to an estimate.
      push({
        id: "scan-baseline",
        kind: "no-baseline-scan",
        severity: program ? "overdue" : "due",
        daysOverdue: program ? daysBetween(program.startedOn) : 0,
        title: "No baseline body scan on file",
        why: "Body composition is the tracked outcome for their goals, and there is no starting measurement to compare against.",
        evidence: [
          `Goals: ${client.goals.join(", ")}`,
          program ? `Active protocol: ${program.name} since ${program.startedOn}` : "No active protocol",
          "No InBody scan recorded",
          "Plan energy target is estimated, not measured",
        ],
        suggestedAction: "Book a body scan before the next visit",
        owner: "Member",
      });
    } else if (program) {
      const startedBeforeProtocol = scan.scannedOn < program.startedOn;
      const rescanDue = addWeeks(startedBeforeProtocol ? program.startedOn : scan.scannedOn, scanWeeks);
      const sev = severityFor(rescanDue);
      if (sev && scan.scannedOn < rescanDue) {
        push({
          id: "scan-rescan",
          kind: "no-rescan",
          severity: sev.severity,
          daysOverdue: sev.daysOverdue,
          dueOn: rescanDue,
          title: startedBeforeProtocol
            ? "No re-scan since the protocol started"
            : "Body composition re-scan due",
          why: `The plan re-measures body composition at week ${scanWeeks}; the only scan on file predates that point.`,
          evidence: [
            `Last scan ${scan.scannedOn} (${scan.device}) — ${daysBetween(scan.scannedOn)}d ago`,
            `Protocol ${program.name} started ${program.startedOn}`,
            `Plan monitoring: week ${scanWeeks} body composition re-scan`,
            `Baseline body fat ${scan.bodyFatPct.toFixed(1)}%`,
          ],
          suggestedAction: "Book a re-scan — same device, same time of day, fasted",
          owner: "Member",
        });
      }
    }
  }

  // -- 4. On a protocol with nothing booked --------------------------------
  const upcoming = appointmentsForClient(client.id).filter(
    (a) => a.start > "2026-06-12T09:00:00" && a.status !== "No Show",
  );
  if (program && upcoming.length === 0) {
    const sinceStart = daysBetween(program.startedOn);
    push({
      id: "followup",
      kind: "no-followup",
      severity: sinceStart >= coachWeeks * 7 ? "overdue" : "due",
      daysOverdue: Math.max(0, sinceStart - coachWeeks * 7),
      title: "On an active protocol with no follow-up booked",
      why: "Nobody is scheduled to see whether the protocol is working or being tolerated.",
      evidence: [
        `Active protocol: ${program.name} since ${program.startedOn} (${sinceStart}d)`,
        "No future appointment of any type on the calendar",
        `Plan monitoring: week ${coachWeeks} coach check-in`,
      ],
      suggestedAction: "Book the next check-in",
      owner: "Coach",
    });
  }

  // -- 5. Plan drafted but never approved ----------------------------------
  if (client.planStatus === "Awaiting provider" || client.planStatus === "Draft") {
    // The plan artefact is regenerated on read, so its createdAt is always now.
    // The honest age is the date the plan became actionable — the panel that
    // triggered it, or failing that the member's join date.
    const pendingSince = client.latestLabDate ?? client.joinedOn;
    const waiting = daysBetween(pendingSince);
    push({
      id: "plan-approval",
      kind: "plan-unapproved",
      severity: waiting >= OVERDUE_AFTER_DAYS ? "overdue" : "due",
      daysOverdue: waiting,
      dueOn: pendingSince,
      title: `Plan sitting at "${client.planStatus}"`,
      why: "Every protocol item needs a provider signature before anything can start; until then the member is waiting on us.",
      evidence: [
        `Plan status: ${client.planStatus}`,
        `${plan.protocol.length} protocol item${plan.protocol.length === 1 ? "" : "s"} proposed, none signed`,
        `Actionable since ${pendingSince} — ${waiting}d`,
        ...plan.protocol.slice(0, 2).map((i) => `Proposed: ${i.title}`),
      ],
      suggestedAction: "Route to the provider for review and signature",
      owner: "Provider",
    });
  }

  // -- 6. Out-of-range marker nothing in the plan addresses ----------------
  // The most clinically interesting gap on the board: not "we are late", but
  // "we saw it and did nothing with it".
  if (labs) {
    const haystack = planText(plan);
    const uncovered = labs.biomarkers
      .filter((b) => b.status === "low" || b.status === "high")
      .filter((b) => !markerIsAddressed(b, haystack))
      .sort((a, b) => deviation(b) - deviation(a))
      .slice(0, MAX_MARKER_GAPS);

    const age = daysBetween(labs.resultedOn);
    for (const m of uncovered) {
      push({
        id: `marker-${m.key}`,
        kind: "unaddressed-marker",
        severity: age >= OVERDUE_AFTER_DAYS ? "overdue" : "due",
        daysOverdue: age,
        dueOn: labs.resultedOn,
        title: `${m.name} out of range with nothing in the plan addressing it`,
        why: "The finding is on file and no plan item — protocol, nutrition or training — references it.",
        evidence: [
          markerLine(m),
          `Panel: ${labs.panelName}, resulted ${labs.resultedOn} (${age}d ago)`,
          `Searched ${allPlanItems(plan).length} plan items across protocol, nutrition and training — no match`,
          `Plan status: ${plan.status}`,
        ],
        suggestedAction: `Have the provider address ${m.name} in the plan or document why no action is needed`,
        owner: "Provider",
      });
    }
  }

  // -- 7. No coach touch while on an active protocol -----------------------
  if (program) {
    const quiet = daysSinceTouch(client.id);
    if (quiet >= COACH_TOUCH_DAYS) {
      const finite = Number.isFinite(quiet);
      push({
        id: "silence",
        kind: "coach-silence",
        severity: !finite || quiet >= COACH_TOUCH_DAYS * 2 ? "overdue" : "due",
        daysOverdue: finite ? quiet - COACH_TOUCH_DAYS : 999,
        title: finite ? `${quiet}d without a coach touch` : "No contact ever recorded",
        why: "Adherence and side effects on an active protocol are only visible if somebody is talking to them.",
        evidence: [
          finite ? `Last recorded contact ${quiet}d ago` : "Nothing in the contact log",
          `Active protocol: ${program.name} since ${program.startedOn}`,
          `Threshold: ${COACH_TOUCH_DAYS}d`,
          `Plan monitoring: week ${coachWeeks} coach check-in`,
        ],
        suggestedAction: "Call or message them and log the touch",
        owner: "Coach",
      });
    }
  }

  return rankGaps(gaps);
}

/**
 * Severity first, then how long overdue. A routine item that has been routine
 * for 90 days must never outrank something overdue by a day.
 * Ties break on id so the board is byte-identical on every render.
 */
export function rankGaps(gaps: Gap[]): Gap[] {
  return [...gaps].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      b.daysOverdue - a.daysOverdue ||
      a.id.localeCompare(b.id),
  );
}

export function clientsForCoachBook(coachId: string): Client[] {
  return clients.filter((c) => c.coachId === coachId && c.status !== "Inactive");
}

export function gapsForCoach(coachId: string): Gap[] {
  return rankGaps(clientsForCoachBook(coachId).flatMap((c) => gapsFor(c.id)));
}

export interface CoverageSummary {
  /** Members in the book, excluding discharged. */
  total: number;
  /** Members with no open gap at all. */
  clear: number;
  /** Percentage clear, 0–100, rounded. */
  pct: number;
  /** Members carrying at least one overdue gap — the number to move first. */
  withOverdue: number;
}

/**
 * Coverage — the one number a coach can actually move.
 *
 * Deliberately "members with zero open gaps" rather than "gaps closed": a coach
 * who books ten scans for one member has moved nothing. Coverage only moves
 * when a whole person becomes fully covered.
 */
export function coverageForCoach(coachId: string): CoverageSummary {
  const book = clientsForCoachBook(coachId);
  const perClient = book.map((c) => gapsFor(c.id));
  const clear = perClient.filter((g) => g.length === 0).length;
  const withOverdue = perClient.filter((g) => g.some((x) => x.severity === "overdue")).length;
  return {
    total: book.length,
    clear,
    pct: book.length ? Math.round((clear / book.length) * 100) : 100,
    withOverdue,
  };
}

/** Gaps grouped by severity, in board order. */
export function groupBySeverity(gaps: Gap[]): { severity: GapSeverity; gaps: Gap[] }[] {
  return SEVERITY_ORDER.map((severity) => ({
    severity,
    gaps: gaps.filter((g) => g.severity === severity),
  })).filter((g) => g.gaps.length > 0);
}
