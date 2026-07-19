import type { Appointment, LocationId } from "@/lib/types";
import { clients, clientMap, clientName } from "@/lib/mock/clients";
import { staffMap } from "@/lib/mock/staff";
import { locations } from "@/lib/mock/locations";
import { appointments } from "@/lib/mock/appointments";
import { seededRandom } from "@/lib/utils";

/**
 * ATTENDANCE — no-shows and late cancels, sliced hard enough to act on.
 *
 * The question this exists to answer is not "what is our no-show rate". Every
 * scheduling system in this category prints that number and it is useless: it
 * is an average over slots that behave nothing alike. The questions an owner
 * can actually act on are narrower and all of them are cuts:
 *
 *   - "should we stop offering 8am on Mondays"       → slot-time × weekday
 *   - "is Myrtle Beach worse, or just busier"        → location, rate not count
 *   - "which members should we stop pre-booking"     → member, with a floor
 *   - "are lab draws worse than plan reviews"        → visit type
 *
 * So every rollup in this module reports a RATE with its denominator attached.
 * A 50% no-show rate on two appointments is noise, and a surface that renders
 * it the same size as a 22% rate on ninety appointments will get 8am Mondays
 * cancelled for no reason. `MIN_SLOT_N` is the floor and it is enforced here,
 * not left to the page.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE HISTORY COMES FROM
 * ---------------------------------------------------------------------------
 * `lib/mock/appointments.ts` holds fifteen appointments across four days —
 * enough to render a day view, nowhere near enough to characterise attendance.
 * This module therefore synthesises a twelve-week booking history from the real
 * member roster (real member, real coach/provider, real home location) and
 * splices the real appointment records in on top, so the days that exist in the
 * source dataset agree with what the source dataset says.
 *
 * That synthesis is operational scheduling data, not clinical fact: it invents
 * who came to an appointment, never what was done at one. It is seeded and
 * therefore identical on every render. In production this module reads the
 * appointments table and the generator below is deleted outright.
 */

/** Pinned clock. Nothing in Apex reads the wall clock. */
const NOW = new Date("2026-06-12T09:00:00");
const NOW_DATE = "2026-06-12";
const DAY_MS = 86_400_000;

/** Weeks of history the analysis covers. */
export const HISTORY_WEEKS = 12;

/**
 * Minimum appointments in a bucket before its rate is reportable.
 *
 * Twenty is not a statistical result, it is an operational one: below twenty
 * a single member's bad month moves the rate by five points, and slot-level
 * decisions get made on one person's behaviour.
 */
export const MIN_SLOT_N = 20;

/** Members are held to a lower floor — six visits is a real pattern for one person. */
export const MIN_MEMBER_N = 6;

export type VisitStatus =
  | "Completed"
  | "No Show"
  | "Late cancel"
  | "Cancelled"
  | "Scheduled";

export type VisitType = Appointment["type"];

export interface Visit {
  id: string;
  clientId: string;
  staffId: string;
  locationId: LocationId;
  type: VisitType;
  /** ISO datetime, local clinic time. */
  start: string;
  durationMin: number;
  status: VisitStatus;
}

/**
 * Late cancel vs. cancel is the distinction that matters commercially.
 *
 * A cancellation with two days' notice is a slot we resold. A cancellation at
 * 7pm the night before is a slot that stayed empty, and it costs the clinic
 * exactly what a no-show costs. Systems that fold both into "cancelled" hide
 * about a third of the lost capacity, which is why this module counts them
 * apart and reports `lostRate` (no-show + late cancel) alongside each.
 */
export const LATE_CANCEL_HOURS = 24;

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Slot times the clinic actually offers. Half-hour grid, 08:00–18:00. */
const SLOT_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

const TYPE_DURATION: Record<VisitType, number> = {
  "Initial Consult": 45,
  "Lab Draw": 20,
  "Body Scan": 20,
  "Plan Review": 45,
  "Follow-Up": 30,
  "IV Therapy": 60,
  Telehealth: 30,
};

/**
 * Baseline no-show propensity by visit type.
 *
 * Shaped from what the modality actually asks of the member rather than picked
 * to look varied: a fasted early-morning lab draw is the easiest appointment in
 * the world to sleep through and the hardest to reschedule around, and a
 * telehealth call the member takes from their desk is the hardest to miss.
 */
const TYPE_RISK: Record<VisitType, number> = {
  "Lab Draw": 0.16,
  "Body Scan": 0.13,
  "Follow-Up": 0.10,
  "Initial Consult": 0.12,
  "Plan Review": 0.07,
  "IV Therapy": 0.09,
  Telehealth: 0.05,
};

/**
 * Slot-hour multiplier. The 8am penalty is the finding this whole module is
 * built to expose, so it is a real effect in the data rather than a coincidence
 * the reader has to hunt for.
 */
function hourMultiplier(hour: number, weekday: number): number {
  let m = 1;
  if (hour === 8) m *= 1.7; // before work — the worst slot in the day
  if (hour === 9) m *= 1.2;
  if (hour === 12) m *= 1.25; // lunch collides with everything
  if (hour >= 16) m *= 1.15; // end of day, traffic, childcare
  if (weekday === 1) m *= 1.3; // Monday
  if (weekday === 5) m *= 1.15; // Friday
  if (weekday === 6) m *= 0.85; // Saturday — members chose to be there
  return m;
}

function iso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

function dateOnly(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Visit types a member of a given status plausibly books. */
function typesFor(clientId: string): VisitType[] {
  const c = clientMap[clientId];
  if (!c) return ["Follow-Up"];
  if (c.locationId === "telehealth") return ["Telehealth", "Plan Review", "Follow-Up"];
  const base: VisitType[] = ["Follow-Up", "Lab Draw", "Plan Review", "Body Scan"];
  if (c.status === "Lead" || c.status === "Consult Booked") return ["Initial Consult"];
  if (c.programs.some((p) => p.category === "Recovery / tissue support")) {
    base.push("IV Therapy");
  }
  return base;
}

/**
 * Twelve weeks of bookings, seeded per member.
 *
 * Members are not equally reliable, and modelling that is the point: a flat
 * per-appointment coin flip produces a population where nobody has a *pattern*,
 * and the by-member table — the one a front desk would actually work from —
 * comes out as pure noise. Each member gets a persistent reliability factor.
 */
function generateVisits(): Visit[] {
  const out: Visit[] = [];

  // Real records win. Anything the source dataset asserts stays exactly as
  // asserted; synthesis only fills the twelve weeks behind it.
  const realByKey = new Set(
    appointments.map((a) => `${a.clientId}|${a.start.slice(0, 16)}`),
  );

  for (const c of clients) {
    const rand = seededRandom(`apex-attendance-v1:${c.id}`);

    // Persistent per-member reliability. Most members are fine; a tail is not,
    // and that tail is who the "stop pre-booking these people" list is for.
    const reliabilityRoll = rand();
    const memberFactor =
      reliabilityRoll < 0.06 ? 3.1 : reliabilityRoll < 0.18 ? 1.9 : reliabilityRoll < 0.7 ? 0.85 : 0.45;

    // Inactive members and leads book far less. Visit count tracks engagement.
    const engagement =
      c.status === "Inactive" ? 0.2 : c.status === "Lead" ? 0.3 : c.status === "Active Protocol" ? 1 : 0.7;
    const visitCount = Math.round((2 + rand() * 7) * engagement);

    const types = typesFor(c.id);

    for (let i = 0; i < visitCount; i++) {
      const daysAgo = Math.floor(rand() * (HISTORY_WEEKS * 7));
      const at = new Date(NOW.getTime() - daysAgo * DAY_MS);
      const weekday = at.getDay();
      if (weekday === 0) continue; // closed Sunday

      const hour = SLOT_HOURS[Math.floor(rand() * SLOT_HOURS.length)];
      const minute = rand() < 0.5 ? 0 : 30;
      at.setHours(hour, minute, 0, 0);

      const type = types[Math.floor(rand() * types.length)];
      const start = iso(at);
      if (realByKey.has(`${c.id}|${start.slice(0, 16)}`)) continue;

      // Staff: coach for coaching visits, provider for clinical ones.
      const staffId =
        type === "Plan Review" || type === "Initial Consult" || type === "Telehealth"
          ? c.providerId
          : c.coachId;

      const risk = Math.min(
        0.85,
        TYPE_RISK[type] * hourMultiplier(hour, weekday) * memberFactor,
      );

      let status: VisitStatus;
      if (at.getTime() > NOW.getTime()) {
        status = "Scheduled";
      } else {
        const roll = rand();
        if (roll < risk) status = "No Show";
        else if (roll < risk + 0.06) status = "Late cancel";
        else if (roll < risk + 0.11) status = "Cancelled";
        else status = "Completed";
      }

      out.push({
        id: `vis-${c.id}-${i}`,
        clientId: c.id,
        staffId: staffMap[staffId] ? staffId : c.coachId,
        locationId: c.locationId,
        type,
        start,
        durationMin: TYPE_DURATION[type],
        status,
      });
    }
  }

  // Splice the real appointment records in. `No Show` exists in the source
  // status union, so real records can and do contribute to these rates.
  for (const a of appointments) {
    out.push({
      id: a.id,
      clientId: a.clientId,
      staffId: a.staffId,
      locationId: a.locationId,
      type: a.type,
      start: a.start,
      durationMin: a.durationMin,
      status: a.status === "Checked In" ? "Completed" : (a.status as VisitStatus),
    });
  }

  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** Every booking in the analysis window, oldest first. */
export const visitHistory: Visit[] = generateVisits();

/** Bookings on a given yyyy-mm-dd. Used by the capacity model. */
export function visitsOnDate(date: string): Visit[] {
  return visitHistory.filter((v) => v.start.startsWith(date));
}

// ---------------------------------------------------------------------------
// Rollups
// ---------------------------------------------------------------------------

export interface AttendanceRate {
  /** What this bucket is — a slot label, a location name, a member name. */
  label: string;
  /** Stable key for React and for drill-through. */
  key: string;
  /** Total *elapsed* bookings. Future `Scheduled` rows are never counted. */
  n: number;
  completed: number;
  noShow: number;
  lateCancel: number;
  cancelled: number;
  /** No-shows ÷ n. */
  noShowRate: number;
  /** No-shows + late cancels ÷ n — the slot actually lost. */
  lostRate: number;
  /**
   * False when `n` is under the floor. The bucket still renders — hiding a
   * thin bucket is how a real problem stays invisible for a year — but its
   * rate must be shown as unreportable rather than as a number.
   */
  reportable: boolean;
}

function rateFrom(label: string, key: string, rows: Visit[], floor: number): AttendanceRate {
  const elapsed = rows.filter((v) => v.status !== "Scheduled");
  const n = elapsed.length;
  const count = (s: VisitStatus) => elapsed.filter((v) => v.status === s).length;
  const noShow = count("No Show");
  const lateCancel = count("Late cancel");
  return {
    label,
    key,
    n,
    completed: count("Completed"),
    noShow,
    lateCancel,
    cancelled: count("Cancelled"),
    noShowRate: n === 0 ? 0 : noShow / n,
    lostRate: n === 0 ? 0 : (noShow + lateCancel) / n,
    reportable: n >= floor,
  };
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  return map;
}

export interface AttendanceFilter {
  locationId?: LocationId | "all";
  type?: VisitType | "all";
}

function applyFilter(rows: Visit[], filter: AttendanceFilter): Visit[] {
  return rows.filter(
    (v) =>
      (!filter.locationId || filter.locationId === "all" || v.locationId === filter.locationId) &&
      (!filter.type || filter.type === "all" || v.type === filter.type),
  );
}

/** Overall rate for the filtered window — the headline, with its denominator. */
export function overallAttendance(filter: AttendanceFilter = {}): AttendanceRate {
  return rateFrom("All bookings", "all", applyFilter(visitHistory, filter), MIN_SLOT_N);
}

/**
 * The slot grid: weekday × hour.
 *
 * Returned as a flat list rather than a matrix so the page can sort it by
 * lostRate and put the answer to "which slot should we stop offering" in the
 * first row, instead of making the reader scan a heat map for the dark square.
 */
export interface SlotCell extends AttendanceRate {
  weekday: number;
  hour: number;
}

export function attendanceBySlot(filter: AttendanceFilter = {}): SlotCell[] {
  const rows = applyFilter(visitHistory, filter);
  const grouped = groupBy(rows, (v) => {
    const d = new Date(v.start);
    return `${d.getDay()}|${d.getHours()}`;
  });

  const out: SlotCell[] = [];
  for (const [key, group] of grouped) {
    const [wd, hr] = key.split("|").map(Number);
    const hourLabel = hr === 12 ? "12pm" : hr > 12 ? `${hr - 12}pm` : `${hr}am`;
    out.push({
      ...rateFrom(`${WEEKDAY_LABELS[wd]} ${hourLabel}`, key, group, MIN_SLOT_N),
      weekday: wd,
      hour: hr,
    });
  }
  // Worst reportable slot first; unreportable buckets sink to the bottom so a
  // thin 100% bucket can never occupy the top of the list.
  return out.sort(
    (a, b) =>
      Number(b.reportable) - Number(a.reportable) ||
      b.lostRate - a.lostRate ||
      b.n - a.n,
  );
}

export function attendanceByLocation(filter: AttendanceFilter = {}): AttendanceRate[] {
  const rows = applyFilter(visitHistory, filter);
  return locations
    .map((l) =>
      rateFrom(l.short, l.id, rows.filter((v) => v.locationId === l.id), MIN_SLOT_N),
    )
    .sort((a, b) => b.lostRate - a.lostRate);
}

export function attendanceByType(filter: AttendanceFilter = {}): AttendanceRate[] {
  const rows = applyFilter(visitHistory, filter);
  const grouped = groupBy(rows, (v) => v.type);
  return [...grouped.entries()]
    .map(([type, group]) => rateFrom(type, type, group, MIN_SLOT_N))
    .sort((a, b) => b.lostRate - a.lostRate);
}

export interface MemberAttendance extends AttendanceRate {
  clientId: string;
  locationId: LocationId;
  /** Most recent missed booking, for the "when did this start" question. */
  lastMissedOn?: string;
}

/**
 * Members ranked by lost bookings.
 *
 * Deliberately ranked by COUNT of lost slots, not by rate. A member with three
 * no-shows out of six is a conversation; a member with one out of two is a
 * coincidence, and rate-ranking puts the coincidence on top.
 */
export function attendanceByMember(filter: AttendanceFilter = {}): MemberAttendance[] {
  const rows = applyFilter(visitHistory, filter);
  const grouped = groupBy(rows, (v) => v.clientId);

  const out: MemberAttendance[] = [];
  for (const [clientId, group] of grouped) {
    const c = clientMap[clientId];
    if (!c) continue;
    const base = rateFrom(clientName(c), clientId, group, MIN_MEMBER_N);
    const missed = group
      .filter((v) => v.status === "No Show" || v.status === "Late cancel")
      .sort((a, b) => b.start.localeCompare(a.start));
    out.push({
      ...base,
      clientId,
      locationId: c.locationId,
      lastMissedOn: missed[0]?.start,
    });
  }

  return out
    .filter((m) => m.noShow + m.lateCancel > 0)
    .sort(
      (a, b) =>
        b.noShow + b.lateCancel - (a.noShow + a.lateCancel) ||
        b.lostRate - a.lostRate,
    );
}

/**
 * The literal answer to "should we stop offering 8am on Mondays".
 *
 * Returns only slots that clear the floor AND sit materially above the clinic
 * baseline, with the arithmetic spelled out, because the recommendation is
 * worthless if the reader cannot check it.
 */
export interface SlotVerdict {
  slot: SlotCell;
  baselineLostRate: number;
  /** Percentage points above baseline. */
  excessPoints: number;
  /** Slots lost per quarter at current volume, if nothing changes. */
  lostPerQuarter: number;
  verdict: string;
}

export function worstSlots(filter: AttendanceFilter = {}, limit = 6): SlotVerdict[] {
  const baseline = overallAttendance(filter).lostRate;
  return attendanceBySlot(filter)
    .filter((s) => s.reportable && s.lostRate > baseline * 1.4)
    .slice(0, limit)
    .map((slot) => {
      const excessPoints = (slot.lostRate - baseline) * 100;
      // n covers HISTORY_WEEKS; a quarter is 13 weeks.
      const lostPerQuarter = Math.round(
        ((slot.noShow + slot.lateCancel) / HISTORY_WEEKS) * 13,
      );
      return {
        slot,
        baselineLostRate: baseline,
        excessPoints,
        lostPerQuarter,
        verdict:
          excessPoints > 12
            ? "Stop offering, or require a card on file to hold it."
            : "Keep, but confirm 24h ahead and overbook by one.",
      };
    });
}

/** Window description for the page header. Never fabricate the range. */
export function attendanceWindow(): { from: string; to: string; weeks: number } {
  return {
    from: dateOnly(new Date(NOW.getTime() - HISTORY_WEEKS * 7 * DAY_MS)),
    to: NOW_DATE,
    weeks: HISTORY_WEEKS,
  };
}
