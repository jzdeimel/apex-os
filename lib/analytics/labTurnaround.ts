import type { LocationId } from "@/lib/types";
import { clientMap, clientName } from "@/lib/mock/clients";
import { staffMap, staffName } from "@/lib/mock/staff";
import { labResults } from "@/lib/mock/labs";
import { seededRandom } from "@/lib/utils";

/**
 * LAB TURNAROUND — draw → resulted → REVIEWED.
 *
 * Every lab dashboard in this category measures the first leg. The first leg is
 * the reference lab's problem: it is contractual, it is stable, and no clinic
 * has ever improved it by looking at a chart.
 *
 * The leg that belongs to the clinic is RESULTED → REVIEWED, and almost nobody
 * measures it. A resulted panel that no clinician has opened is not "in
 * progress" — it is a member who has an abnormal number in their chart and does
 * not know, sitting behind a status that reads green because the lab did its
 * job. It is the quietest clinical risk a clinic carries and it is invisible by
 * construction: nothing fires, nobody complains, the record looks complete.
 *
 * So this module is built around the review leg. The draw and result legs are
 * reported because you cannot interpret the review leg without them, but the
 * ranking, the flags and the thresholds are all about review.
 *
 * ---------------------------------------------------------------------------
 * A NOTE ON THE UNDERLYING DATA
 * ---------------------------------------------------------------------------
 * In `lib/mock/labs.ts` every result carries `collectedOn === resultedOn` —
 * the source dataset stamps one date and reuses it. There is therefore no draw
 * → result interval to measure and no review timestamp at all. This module
 * derives both, deterministically and per lab, and says so on screen rather
 * than presenting a derived interval as an observed one. These are operational
 * timestamps, not clinical values: nothing below alters a biomarker, a
 * reference range or a result.
 *
 * In production `resultedAt` arrives on the HL7/FHIR observation and
 * `reviewedAt` is written when a licensed clinician opens and signs the panel;
 * the derivation below is deleted and the selectors are unchanged.
 */

/** Pinned clock. */
const NOW = new Date("2026-06-12T09:00:00");
const DAY_MS = 86_400_000;

/**
 * Hours a resulted panel may sit unreviewed before it is flagged.
 *
 * 48 hours is not a clinical standard — there isn't one for routine outpatient
 * wellness panels — it is the clinic's own service commitment, set here in one
 * place so no surface can quietly disagree with another about what "overdue"
 * means.
 */
export const REVIEW_TARGET_HOURS = 48;

/** Past this it stops being a backlog and becomes an incident. */
export const REVIEW_BREACH_HOURS = 168; // 7 days

/**
 * Panels the clinic runs.
 *
 * The source dataset labels every result "Alpha Base Panel". Panel identity is
 * scheduling metadata rather than a clinical assertion, so it is assigned here
 * deterministically to give the by-panel cut something to cut on — the base
 * panel still dominates the mix, as it does in the real book of business.
 */
const PANELS = [
  { name: "Alpha Base Panel", weight: 52, labDays: [2, 4] as [number, number] },
  { name: "Hormone Recheck", weight: 18, labDays: [1, 3] as [number, number] },
  { name: "Metabolic Recheck", weight: 13, labDays: [1, 3] as [number, number] },
  { name: "Thyroid Panel", weight: 9, labDays: [2, 5] as [number, number] },
  { name: "Lipid / ApoB", weight: 8, labDays: [1, 2] as [number, number] },
];
const PANEL_TOTAL = PANELS.reduce((s, p) => s + p.weight, 0);

function pickPanel(r: number) {
  let acc = 0;
  const target = r * PANEL_TOTAL;
  for (const p of PANELS) {
    acc += p.weight;
    if (target <= acc) return p;
  }
  return PANELS[0];
}

export type LabStage = "Awaiting result" | "Awaiting review" | "Reviewed";

export interface LabTimeline {
  labId: string;
  clientId: string;
  clientName: string;
  locationId: LocationId;
  /** The clinician who owns the review. Providers only — coaches cannot sign. */
  providerId: string;
  providerName: string;
  panelName: string;
  collectedAt: string;
  resultedAt: string;
  reviewedAt?: string;
  stage: LabStage;
  /** Draw → resulted, in hours. The reference lab's leg. */
  drawToResultHours: number;
  /** Resulted → reviewed, in hours. Undefined while unreviewed. */
  resultToReviewHours?: number;
  /** For unreviewed panels: hours it has been sitting, as of NOW. */
  waitingHours?: number;
  /** True when an unreviewed panel is past `REVIEW_TARGET_HOURS`. */
  overdue: boolean;
  /** True past `REVIEW_BREACH_HOURS`. */
  breached: boolean;
  /**
   * Count of biomarkers outside the reference range on this panel.
   *
   * Read from the real result, never derived. This is what turns the backlog
   * from a queue into a triage list: an unreviewed panel with four out-of-range
   * markers is not the same object as an unreviewed all-clear.
   */
  outOfRangeCount: number;
}

function hoursBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
}

function isoPlusHours(dateIso: string, hours: number): string {
  const d = new Date(new Date(dateIso).getTime() + hours * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

function buildTimelines(): LabTimeline[] {
  return labResults.map((lab) => {
    const rand = seededRandom(`apex-lab-tat-v1:${lab.id}`);
    const client = clientMap[lab.clientId];
    const panel = pickPanel(rand());

    // Draw is stamped at a plausible morning phlebotomy time; the source date
    // carries no clock component.
    const collectedAt = `${lab.collectedOn}T${rand() < 0.6 ? "07" : "09"}:${rand() < 0.5 ? "15" : "45"}:00`;

    const [lo, hi] = panel.labDays;
    const drawToResultHours = (lo + rand() * (hi - lo)) * 24;
    const resultedAt = isoPlusHours(collectedAt, drawToResultHours);

    const resultedMs = new Date(resultedAt).getTime();
    const ageHours = (NOW.getTime() - resultedMs) / 3_600_000;

    // Still with the lab.
    if (ageHours <= 0) {
      return {
        labId: lab.id,
        clientId: lab.clientId,
        clientName: client ? clientName(client) : lab.clientId,
        locationId: client?.locationId ?? "raleigh",
        providerId: client?.providerId ?? "st-001",
        providerName: staffName(client?.providerId),
        panelName: panel.name,
        collectedAt,
        resultedAt,
        stage: "Awaiting result" as const,
        drawToResultHours,
        overdue: false,
        breached: false,
        outOfRangeCount: lab.biomarkers.filter((b) => b.status === "low" || b.status === "high").length,
      };
    }

    /**
     * Review propensity.
     *
     * The distribution is deliberately not flat: most panels are reviewed
     * within a day or two, a real minority sits for a week, and a small set is
     * never touched at all. A dataset where everything is eventually reviewed
     * would render this page as a victory lap, which is precisely the failure
     * the page exists to prevent.
     */
    const roll = rand();
    const neverReviewed = roll < 0.11;

    if (neverReviewed) {
      const waitingHours = ageHours;
      return {
        labId: lab.id,
        clientId: lab.clientId,
        clientName: client ? clientName(client) : lab.clientId,
        locationId: client?.locationId ?? "raleigh",
        providerId: client?.providerId ?? "st-001",
        providerName: staffName(client?.providerId),
        panelName: panel.name,
        collectedAt,
        resultedAt,
        stage: "Awaiting review" as const,
        drawToResultHours,
        waitingHours,
        overdue: waitingHours > REVIEW_TARGET_HOURS,
        breached: waitingHours > REVIEW_BREACH_HOURS,
        outOfRangeCount: lab.biomarkers.filter((b) => b.status === "low" || b.status === "high").length,
      };
    }

    const reviewLagHours =
      roll < 0.55 ? 2 + rand() * 22 : roll < 0.82 ? 24 + rand() * 48 : 72 + rand() * 200;

    // A panel whose review lag has not elapsed yet is simply still waiting.
    if (reviewLagHours > ageHours) {
      return {
        labId: lab.id,
        clientId: lab.clientId,
        clientName: client ? clientName(client) : lab.clientId,
        locationId: client?.locationId ?? "raleigh",
        providerId: client?.providerId ?? "st-001",
        providerName: staffName(client?.providerId),
        panelName: panel.name,
        collectedAt,
        resultedAt,
        stage: "Awaiting review" as const,
        drawToResultHours,
        waitingHours: ageHours,
        overdue: ageHours > REVIEW_TARGET_HOURS,
        breached: ageHours > REVIEW_BREACH_HOURS,
        outOfRangeCount: lab.biomarkers.filter((b) => b.status === "low" || b.status === "high").length,
      };
    }

    const reviewedAt = isoPlusHours(resultedAt, reviewLagHours);
    return {
      labId: lab.id,
      clientId: lab.clientId,
      clientName: client ? clientName(client) : lab.clientId,
      locationId: client?.locationId ?? "raleigh",
      providerId: client?.providerId ?? "st-001",
      providerName: staffName(client?.providerId),
      panelName: panel.name,
      collectedAt,
      resultedAt,
      reviewedAt,
      stage: "Reviewed" as const,
      drawToResultHours,
      resultToReviewHours: hoursBetween(resultedAt, reviewedAt),
      overdue: false,
      breached: false,
      outOfRangeCount: lab.biomarkers.filter((b) => b.status === "low" || b.status === "high").length,
    };
  });
}

export const labTimelines: LabTimeline[] = buildTimelines();

// ---------------------------------------------------------------------------
// Rollups
// ---------------------------------------------------------------------------

/**
 * Medians, not means.
 *
 * One panel that sat for three weeks over a holiday drags a mean turnaround by
 * days and makes an otherwise healthy queue look broken. The p90 is reported
 * alongside because the tail is the clinical risk — the median tells you how
 * the process usually behaves, the p90 tells you how badly it behaves when it
 * misbehaves, and only the second one is a patient-safety number.
 */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface TurnaroundStat {
  key: string;
  label: string;
  /** Panels resulted in the window. */
  resulted: number;
  /** Of those, how many have been reviewed. */
  reviewed: number;
  medianDrawToResultHours: number;
  medianResultToReviewHours: number;
  p90ResultToReviewHours: number;
  /** Currently unreviewed, at any age. */
  awaitingReview: number;
  /** Unreviewed past the target. */
  overdue: number;
  /** Unreviewed past the breach threshold. */
  breached: number;
  /** Unreviewed AND carrying at least one out-of-range marker. */
  overdueWithAbnormal: number;
}

function statFrom(key: string, label: string, rows: LabTimeline[]): TurnaroundStat {
  const resulted = rows.filter((r) => r.stage !== "Awaiting result");
  const reviewed = resulted.filter((r) => r.stage === "Reviewed");
  const waiting = resulted.filter((r) => r.stage === "Awaiting review");

  const drawLegs = resulted.map((r) => r.drawToResultHours).sort((a, b) => a - b);
  const reviewLegs = reviewed
    .map((r) => r.resultToReviewHours ?? 0)
    .sort((a, b) => a - b);

  return {
    key,
    label,
    resulted: resulted.length,
    reviewed: reviewed.length,
    medianDrawToResultHours: quantile(drawLegs, 0.5),
    medianResultToReviewHours: quantile(reviewLegs, 0.5),
    p90ResultToReviewHours: quantile(reviewLegs, 0.9),
    awaitingReview: waiting.length,
    overdue: waiting.filter((r) => r.overdue).length,
    breached: waiting.filter((r) => r.breached).length,
    overdueWithAbnormal: waiting.filter((r) => r.overdue && r.outOfRangeCount > 0).length,
  };
}

export interface TurnaroundFilter {
  locationId?: LocationId | "all";
  panelName?: string | "all";
}

function applyFilter(rows: LabTimeline[], f: TurnaroundFilter): LabTimeline[] {
  return rows.filter(
    (r) =>
      (!f.locationId || f.locationId === "all" || r.locationId === f.locationId) &&
      (!f.panelName || f.panelName === "all" || r.panelName === f.panelName),
  );
}

export function turnaroundOverall(f: TurnaroundFilter = {}): TurnaroundStat {
  return statFrom("all", "All panels", applyFilter(labTimelines, f));
}

export function turnaroundByPanel(f: TurnaroundFilter = {}): TurnaroundStat[] {
  const rows = applyFilter(labTimelines, f);
  return PANELS.map((p) =>
    statFrom(p.name, p.name, rows.filter((r) => r.panelName === p.name)),
  )
    .filter((s) => s.resulted > 0)
    .sort((a, b) => b.overdue - a.overdue || b.p90ResultToReviewHours - a.p90ResultToReviewHours);
}

export interface ProviderTurnaround extends TurnaroundStat {
  providerId: string;
  credentials?: string;
}

/**
 * By reviewing clinician.
 *
 * Ranked by overdue COUNT, because the operational question is "whose queue do
 * we help clear", not "who is slowest on average". A provider with a fast
 * median and eleven abandoned panels is the problem; a provider with a slow
 * median and an empty queue is merely thorough.
 */
export function turnaroundByProvider(f: TurnaroundFilter = {}): ProviderTurnaround[] {
  const rows = applyFilter(labTimelines, f);
  const ids = [...new Set(rows.map((r) => r.providerId))];
  return ids
    .map((id) => ({
      ...statFrom(id, staffName(id), rows.filter((r) => r.providerId === id)),
      providerId: id,
      credentials: staffMap[id]?.credentials,
    }))
    .sort(
      (a, b) =>
        b.overdueWithAbnormal - a.overdueWithAbnormal ||
        b.overdue - a.overdue ||
        b.awaitingReview - a.awaitingReview,
    );
}

/**
 * The worklist. This is the part of the module that changes patient outcomes.
 *
 * Ordered by out-of-range markers first, then by age. An eleven-day-old normal
 * panel is an embarrassment; a three-day-old panel with an out-of-range marker
 * is a member who should have had a phone call. Sorting by age alone — which is
 * what a queue does by default — buries the second behind the first.
 */
export function unreviewedWorklist(f: TurnaroundFilter = {}): LabTimeline[] {
  return applyFilter(labTimelines, f)
    .filter((r) => r.stage === "Awaiting review")
    .sort(
      (a, b) =>
        Number(b.outOfRangeCount > 0) - Number(a.outOfRangeCount > 0) ||
        b.outOfRangeCount - a.outOfRangeCount ||
        (b.waitingHours ?? 0) - (a.waitingHours ?? 0),
    );
}

export const PANEL_NAMES: string[] = PANELS.map((p) => p.name);

/** Hours → a string an operator reads without converting. */
export function formatHours(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return "—";
  if (h < 24) return `${h.toFixed(h < 10 ? 1 : 0)}h`;
  const days = h / 24;
  return `${days.toFixed(days < 10 ? 1 : 0)}d`;
}

export function turnaroundWindow() {
  const dates = labTimelines.map((t) => t.collectedAt.slice(0, 10)).sort();
  return {
    from: dates[0] ?? "—",
    to: "2026-06-12",
    panels: labTimelines.length,
    days: dates.length
      ? Math.round((NOW.getTime() - new Date(dates[0]).getTime()) / DAY_MS)
      : 0,
  };
}
