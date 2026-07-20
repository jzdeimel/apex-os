import { absolute } from "@/lib/utils";
import type { LocationId } from "@/lib/types";
import { staff } from "@/lib/mock/staff";
import { locations, locationName } from "@/lib/mock/locations";
import {
  WEEK_DATES,
  WEEK_LABELS,
  TODAY,
  shifts,
  shiftHours,
  type Shift,
} from "@/lib/mock/shifts";
import { visitHistory, type Visit } from "@/lib/analytics/attendance";

/**
 * CAPACITY — rostered hours against booked hours.
 *
 * Two numbers, and the gap between them is the whole business:
 *
 *   AVAILABLE — hours a clinician is rostered and paid to be present
 *   BOOKED    — hours a member is actually scheduled into
 *
 * The audited system reports "appointments per day", which cannot distinguish a
 * provider who saw nine members in a nine-hour shift from one who saw nine in
 * four hours and went home. Only the ratio tells you whether to hire, whether
 * to open a location on Saturday, or whether the 2pm bottleneck at Raleigh is a
 * room problem or a rostering problem.
 *
 * ---------------------------------------------------------------------------
 * TWO FAILURE MODES THIS MODULE REFUSES TO HIDE
 * ---------------------------------------------------------------------------
 *  1. BOOKED WITHOUT A SHIFT. A member scheduled onto a clinician who is not
 *     rostered that day. Naive utilisation maths quietly divides by the
 *     rostered hours and produces a number over 100%, or silently drops the
 *     booking. Both are wrong: it is a real rostering defect, so it is counted
 *     separately as `unrosteredMin` and surfaced as its own line.
 *  2. UTILISATION OVER 100%. Double-booked slots are legitimate at a lab draw
 *     station and a defect at a provider consult. The ratio is never clamped,
 *     because clamping it to 100% is how an overbooked provider stops being
 *     visible on the page that exists to show load.
 *
 * The window is the rostered week in `lib/mock/shifts.ts`: Mon 2026-06-08 →
 * Sun 2026-06-14, with today = Fri 2026-06-12.
 */

/**
 * Utilisation above this reads as a bottleneck: no slack for a running-late
 * visit, so every overrun cascades into the rest of the day.
 */
export const BOTTLENECK_THRESHOLD = 0.85;

/** Below this the shift is not paying for itself. */
export const UNDERUSED_THRESHOLD = 0.5;

export interface UtilisationCell {
  key: string;
  label: string;
  availableHours: number;
  bookedHours: number;
  /** bookedHours ÷ availableHours. Infinity-safe: 0 when nothing is rostered. */
  utilisation: number;
  /** Rostered hours nobody is booked into. Negative is impossible; see clamp. */
  openHours: number;
  /** Hours booked against a clinician with no shift that day. A defect count. */
  unrosteredHours: number;
  bookingCount: number;
  band: "bottleneck" | "healthy" | "underused" | "unrostered";
}

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** True when a booking falls inside a rostered shift for the same clinician. */
function coveredByShift(visit: Visit, shiftsForStaffDate: Shift[]): boolean {
  const d = absolute(visit.start);
  const startMin = d.getUTCHours() * 60 + d.getUTCMinutes();
  const endMin = startMin + visit.durationMin;
  return shiftsForStaffDate.some(
    (s) => startMin >= toMinutes(s.start) && endMin <= toMinutes(s.end),
  );
}

/**
 * Bookings that consume capacity.
 *
 * Cancellations do NOT — the slot was released and could be resold. No-shows
 * DO, because the clinician sat in the room and the slot was never resellable.
 * Getting this backwards is the single most common way a utilisation dashboard
 * lies about how busy a clinic was.
 */
function consumesCapacity(v: Visit): boolean {
  return v.status !== "Cancelled" && v.status !== "Late cancel";
}

/** Every booking in the rostered week that consumes capacity. */
const WEEK_VISITS: Visit[] = visitHistory.filter(
  (v) => WEEK_DATES.includes(v.start.slice(0, 10)) && consumesCapacity(v),
);

function band(cell: Omit<UtilisationCell, "band">): UtilisationCell["band"] {
  if (cell.availableHours === 0) return cell.bookedHours > 0 ? "unrostered" : "underused";
  if (cell.utilisation >= BOTTLENECK_THRESHOLD) return "bottleneck";
  if (cell.utilisation < UNDERUSED_THRESHOLD) return "underused";
  return "healthy";
}

function build(
  key: string,
  label: string,
  rosteredShifts: Shift[],
  visits: Visit[],
): UtilisationCell {
  const availableHours = rosteredShifts.reduce((sum, s) => sum + shiftHours(s), 0);

  let bookedMin = 0;
  let unrosteredMin = 0;
  for (const v of visits) {
    const forStaffDate = rosteredShifts.filter(
      (s) => s.staffId === v.staffId && s.date === v.start.slice(0, 10),
    );
    if (forStaffDate.length > 0 && coveredByShift(v, forStaffDate)) {
      bookedMin += v.durationMin;
    } else {
      unrosteredMin += v.durationMin;
    }
  }

  const bookedHours = bookedMin / 60;
  const partial = {
    key,
    label,
    availableHours,
    bookedHours,
    utilisation: availableHours === 0 ? 0 : bookedHours / availableHours,
    // Clamped at zero: negative open hours is not a concept, and an
    // over-booked cell already reports that through `utilisation` > 1.
    openHours: Math.max(0, availableHours - bookedHours),
    unrosteredHours: unrosteredMin / 60,
    bookingCount: visits.length,
  };
  return { ...partial, band: band(partial) };
}

// ---------------------------------------------------------------------------
// Cuts
// ---------------------------------------------------------------------------

export function utilisationByLocation(): UtilisationCell[] {
  return locations
    .map((l) =>
      build(
        l.id,
        l.short,
        shifts.filter((s) => s.locationId === l.id),
        WEEK_VISITS.filter((v) => v.locationId === l.id),
      ),
    )
    .sort((a, b) => b.utilisation - a.utilisation);
}

export interface DayCell extends UtilisationCell {
  date: string;
  weekday: string;
  isToday: boolean;
}

/** Day-by-day for one location, or the whole clinic when `locationId` is "all". */
export function utilisationByDay(locationId: LocationId | "all" = "all"): DayCell[] {
  return WEEK_DATES.map((date, i) => {
    const dayShifts = shifts.filter(
      (s) => s.date === date && (locationId === "all" || s.locationId === locationId),
    );
    const dayVisits = WEEK_VISITS.filter(
      (v) =>
        v.start.startsWith(date) &&
        (locationId === "all" || v.locationId === locationId),
    );
    return {
      ...build(date, WEEK_LABELS[i], dayShifts, dayVisits),
      date,
      weekday: WEEK_LABELS[i],
      isToday: date === TODAY,
    };
  });
}

export interface ProviderCell extends UtilisationCell {
  staffId: string;
  role: string;
  credentials?: string;
  locationIds: LocationId[];
}

/**
 * Per-clinician load.
 *
 * Admin staff are excluded: they are rostered but members are not booked into
 * them, so including them drags every clinic-level average toward zero and
 * makes the ratio unreadable. Their coverage is a rostering question, not a
 * utilisation one.
 */
export function utilisationByProvider(
  locationId: LocationId | "all" = "all",
): ProviderCell[] {
  return staff
    .filter((s) => s.role !== "Admin")
    .filter((s) => locationId === "all" || s.locationIds.includes(locationId))
    .map((s) => {
      const own = shifts.filter(
        (sh) =>
          sh.staffId === s.id &&
          (locationId === "all" || sh.locationId === locationId),
      );
      const visits = WEEK_VISITS.filter(
        (v) =>
          v.staffId === s.id &&
          (locationId === "all" || v.locationId === locationId),
      );
      return {
        ...build(s.id, s.name, own, visits),
        staffId: s.id,
        role: s.role,
        credentials: s.credentials,
        locationIds: s.locationIds,
      };
    })
    .filter((c) => c.availableHours > 0 || c.bookingCount > 0)
    .sort((a, b) => b.utilisation - a.utilisation);
}

/**
 * Hour-of-day load across the week — where the queue forms.
 *
 * Available hours per slot-hour = number of shifts covering that hour, so a
 * 2pm with four clinicians rostered has four hours of capacity in it.
 */
export interface HourCell {
  hour: number;
  label: string;
  availableHours: number;
  bookedHours: number;
  utilisation: number;
}

export function utilisationByHour(locationId: LocationId | "all" = "all"): HourCell[] {
  const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  const scopedShifts = shifts.filter(
    (s) => locationId === "all" || s.locationId === locationId,
  );
  const scopedVisits = WEEK_VISITS.filter(
    (v) => locationId === "all" || v.locationId === locationId,
  );

  return HOURS.map((hour) => {
    const covering = scopedShifts.filter(
      (s) => toMinutes(s.start) <= hour * 60 && toMinutes(s.end) > hour * 60,
    ).length;
    const bookedMin = scopedVisits
      .filter((v) => absolute(v.start).getUTCHours() === hour)
      .reduce((sum, v) => sum + v.durationMin, 0);
    const bookedHours = bookedMin / 60;
    return {
      hour,
      label: hour === 12 ? "12p" : hour > 12 ? `${hour - 12}p` : `${hour}a`,
      availableHours: covering,
      bookedHours,
      utilisation: covering === 0 ? 0 : bookedHours / covering,
    };
  });
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export interface CapacityFinding {
  id: string;
  kind: "bottleneck" | "open-capacity" | "unrostered";
  label: string;
  detail: string;
  /** Hours at stake, so findings can be ranked by size rather than by tone. */
  hours: number;
}

/**
 * Ranked by hours at stake, not by severity label.
 *
 * A dashboard that sorts by badge colour puts a two-hour bottleneck above a
 * thirty-hour hole in the Saturday roster. Hours are the currency here.
 */
export function capacityFindings(locationId: LocationId | "all" = "all"): CapacityFinding[] {
  const out: CapacityFinding[] = [];

  for (const p of utilisationByProvider(locationId)) {
    if (p.band === "bottleneck" && p.availableHours >= 4) {
      out.push({
        id: `bn-${p.staffId}`,
        kind: "bottleneck",
        label: `${p.label} is at ${Math.round(p.utilisation * 100)}% this week`,
        detail: `${p.bookedHours.toFixed(1)}h booked against ${p.availableHours.toFixed(1)}h rostered. No slack for an overrun — one long visit pushes the rest of the day.`,
        hours: p.bookedHours,
      });
    }
    if (p.band === "underused" && p.openHours >= 6) {
      out.push({
        id: `op-${p.staffId}`,
        kind: "open-capacity",
        label: `${p.openHours.toFixed(1)}h open on ${p.label}`,
        detail: `${p.bookedHours.toFixed(1)}h booked against ${p.availableHours.toFixed(1)}h rostered (${Math.round(p.utilisation * 100)}%). Either fill it or re-roster it.`,
        hours: p.openHours,
      });
    }
    if (p.unrosteredHours > 0) {
      out.push({
        id: `un-${p.staffId}`,
        kind: "unrostered",
        label: `${p.unrosteredHours.toFixed(1)}h booked onto ${p.label} outside rostered hours`,
        detail:
          "Bookings sit outside this clinician's shift for that day. Either the roster is wrong or the booking is — both need a person, not a dashboard.",
        hours: p.unrosteredHours,
      });
    }
  }

  for (const d of utilisationByDay(locationId)) {
    if (d.availableHours > 0 && d.openHours >= 12) {
      out.push({
        id: `dop-${d.date}`,
        kind: "open-capacity",
        label: `${d.weekday} has ${d.openHours.toFixed(0)}h unbooked`,
        detail: `${d.bookedHours.toFixed(1)}h booked against ${d.availableHours.toFixed(1)}h rostered across ${locationId === "all" ? "all sites" : locationName(locationId)}.`,
        hours: d.openHours,
      });
    }
  }

  return out.sort((a, b) => b.hours - a.hours);
}

/** Clinic-wide headline. Same arithmetic, one row. */
export function capacitySummary(locationId: LocationId | "all" = "all"): UtilisationCell {
  return build(
    "summary",
    locationId === "all" ? "All locations" : locationName(locationId),
    shifts.filter((s) => locationId === "all" || s.locationId === locationId),
    WEEK_VISITS.filter((v) => locationId === "all" || v.locationId === locationId),
  );
}

export function capacityWindow() {
  return { from: WEEK_DATES[0], to: WEEK_DATES[WEEK_DATES.length - 1], today: TODAY };
}

