import type { LocationId } from "@/lib/types";
import { visitHistory, type Visit } from "@/lib/analytics/attendance";
import { absolute } from "@/lib/utils";
import { countFigure, moneyFigure, type Figure } from "@/lib/exec/provenance";
import { buildDailyOrderReport } from "@/lib/reports/dailyOrders";

/**
 * WHAT HAPPENED YESTERDAY.
 *
 * The first question an owner asks with a coffee in hand, and the one the
 * existing `app/admin/daily-report` answers in the wrong currency: it is an
 * ORDER report, so it tells him what shipped and never what happened in a room.
 *
 * ---------------------------------------------------------------------------
 * THE THIN-DAY PROBLEM, AND WHY EVERY DAILY FIGURE CARRIES A 30-DAY TWIN
 * ---------------------------------------------------------------------------
 * One clinic day in this dataset contains 19 bookings across five locations, of
 * which exactly one is an initial consult. That is a real count of real records
 * and it is also completely useless on its own: a screen that reports
 *
 *     NEW CONSULTS YESTERDAY        1
 *
 * in `text-display` invites an owner to conclude the top of the funnel has
 * collapsed, when the honest reading is that a single clinic day is below the
 * resolution at which the question can be asked at all. The same tile the next
 * morning might read 4, and the 300% swing would mean nothing.
 *
 * So every daily figure produced here carries its trailing-30-day count in the
 * caveat, computed the same way from the same records. The daily number answers
 * "did anything break yesterday"; the 30-day number is the one with enough
 * denominator to carry a decision. Neither is presented without the other, and
 * the tile renders the pair rather than making the owner hold one in his head.
 *
 * This mirrors the floor `lib/analytics/attendance.ts` already enforces with
 * `MIN_SLOT_N` — that module refuses to report a rate on a thin bucket, and the
 * reasoning is identical one level up.
 *
 * ---------------------------------------------------------------------------
 * PROVENANCE OF THE BOOKING RECORDS
 * ---------------------------------------------------------------------------
 * `visitHistory` is synthesised. `lib/analytics/attendance.ts` says so in its
 * own header: fifteen real seeded appointments are spliced into a twelve-week
 * history generated from the real member roster. The counts below are genuine
 * arithmetic over that record set — nothing here is a constant — but the
 * records are seeded rather than observed, and every figure derived from them
 * says so in its `caveat` rather than in a footnote. In production this module
 * is unchanged and the generator underneath it is deleted.
 */

/** Pinned demo clock. Nothing in Apex reads the wall clock. */
export const NOW_ISO = "2026-06-12T09:00:00";
export const TODAY = "2026-06-12";
export const YESTERDAY = "2026-06-11";

/** The comparison window. 30 days is four full weekly cycles plus a margin. */
export const TRAILING_DAYS = 30;

const DAY_MS = 86_400_000;

/** First date in the trailing window, inclusive, ending on YESTERDAY. */
export const TRAILING_FROM = new Date(
  absolute(YESTERDAY).getTime() - (TRAILING_DAYS - 1) * DAY_MS,
)
  .toISOString()
  .slice(0, 10);

export type LocationScope = LocationId | "all";

function inScope(v: Visit, scope: LocationScope): boolean {
  return scope === "all" || v.locationId === scope;
}

/**
 * A day's — or a window's — clinical activity.
 *
 * `held` counts visits the clinician actually delivered. `lost` is no-shows plus
 * late cancels, kept together because commercially they are the same event: a
 * rostered slot that could not be resold. `lib/analytics/attendance.ts` makes
 * this argument at length and this module does not re-litigate it; a plain
 * cancellation with notice is excluded from `lost` because the slot was
 * recoverable.
 */
export interface Activity {
  /** Bookings whose date falls in the window, whatever their outcome. */
  booked: number;
  held: number;
  noShow: number;
  lateCancel: number;
  cancelled: number;
  /** No-show + late cancel. The slots that were actually lost. */
  lost: number;
  /** Initial Consults in the window, by outcome. The top of the funnel. */
  consultsBooked: number;
  consultsHeld: number;
  consultsLost: number;
}

function tally(rows: Visit[]): Activity {
  const count = (s: Visit["status"]) => rows.filter((v) => v.status === s).length;
  const consults = rows.filter((v) => v.type === "Initial Consult");
  const noShow = count("No Show");
  const lateCancel = count("Late cancel");
  return {
    booked: rows.length,
    held: count("Completed"),
    noShow,
    lateCancel,
    cancelled: count("Cancelled"),
    lost: noShow + lateCancel,
    consultsBooked: consults.length,
    consultsHeld: consults.filter((v) => v.status === "Completed").length,
    consultsLost: consults.filter(
      (v) => v.status === "No Show" || v.status === "Late cancel",
    ).length,
  };
}

export function activityOn(date: string, scope: LocationScope = "all"): Activity {
  return tally(visitHistory.filter((v) => v.start.startsWith(date) && inScope(v, scope)));
}

export function activityBetween(
  from: string,
  to: string,
  scope: LocationScope = "all",
): Activity {
  return tally(
    visitHistory.filter((v) => {
      const d = v.start.slice(0, 10);
      return d >= from && d <= to && inScope(v, scope);
    }),
  );
}

export function yesterdayActivity(scope: LocationScope = "all"): Activity {
  return activityOn(YESTERDAY, scope);
}

export function trailingActivity(scope: LocationScope = "all"): Activity {
  return activityBetween(TRAILING_FROM, YESTERDAY, scope);
}

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------

const BOOKING_CAVEAT =
  "Booking records are synthesised by lib/analytics/attendance.ts — the count is real arithmetic, the underlying visits are seeded rather than observed.";

/**
 * The four "what happened yesterday" tiles.
 *
 * Ordered by what an owner does about them, not by size. Consults held is first
 * because it is the only one of the four that is a growth signal; lost slots is
 * third because it is the one with a lever attached (confirmations, cards on
 * file); order value is last because it is the number most likely to be quoted
 * and least likely to need action this morning.
 */
export function yesterdayFigures(scope: LocationScope = "all"): Figure[] {
  const y = yesterdayActivity(scope);
  const t = trailingActivity(scope);
  const perDay = (n: number) => (n / TRAILING_DAYS).toFixed(1);

  const report = buildDailyOrderReport();

  return [
    countFigure({
      id: "consults-held",
      label: "Consults held",
      value: y.consultsHeld,
      provenance: "measured",
      source:
        "Bookings of type 'Initial Consult' with status Completed on 2026-06-11 (lib/analytics/attendance.ts, visitHistory).",
      caveat: `A single clinic day is too thin to read as a trend — ${t.consultsHeld} were held in the last ${TRAILING_DAYS} days, ${perDay(t.consultsHeld)}/day. ${BOOKING_CAVEAT}`,
      hint: "First visits delivered. The only growth signal on this row.",
      tone: "optimal",
      href: "/exec/capacity",
    }),
    countFigure({
      id: "visits-held",
      label: "Visits held",
      value: y.held,
      provenance: "measured",
      source:
        "Bookings with status Completed on 2026-06-11, all visit types (lib/analytics/attendance.ts, visitHistory).",
      caveat: `${t.held} held across the last ${TRAILING_DAYS} days, ${perDay(t.held)}/day. ${BOOKING_CAVEAT}`,
      hint: "Every appointment a clinician actually delivered yesterday.",
      tone: "neutral",
    }),
    countFigure({
      id: "slots-lost",
      label: "Slots lost",
      value: y.lost,
      provenance: "measured",
      source:
        "No-shows plus late cancels on 2026-06-11 (lib/analytics/attendance.ts). Cancellations with notice are excluded — that slot was resellable.",
      caveat: `${t.lost} lost across the last ${TRAILING_DAYS} days against ${t.booked} bookings. ${BOOKING_CAVEAT}`,
      hint: "Rostered time nobody could resell. The lever is confirmation, not capacity.",
      tone: y.lost > 0 ? "watch" : "optimal",
      href: "/exec/capacity",
    }),
    moneyFigure({
      id: "order-value",
      label: "Order value, 24h",
      value: Math.round(report.totalCents / 100),
      provenance: "measured",
      source:
        "Σ (unit price × qty) over every order line touched in the 24h to 2026-06-12 09:00 (lib/reports/dailyOrders.ts:223,285). Integer cents throughout. Clinic-wide: buildDailyOrderReport takes no location filter, so this tile does not narrow with the rest of the page.",
      caveat:
        "This is what was ORDERED, not what was collected. Apex has no billing engine, no invoice and no payment record — nothing here proves money moved.",
      hint: `${report.orderCount} orders, ${report.unitCount} units. The strongest number on this console.`,
      tone: "neutral",
      href: "/admin/daily-report",
    }),
  ];
}
