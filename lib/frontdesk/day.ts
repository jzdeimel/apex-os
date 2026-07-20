import type { Appointment, Client, LocationId } from "@/lib/types";
import { allAppointments, visitTypeMap } from "@/lib/booking/availability";
import { clientMap } from "@/lib/mock/clients";
import { staffMap } from "@/lib/mock/staff";
import { minutesBetween, DESK_PINNED_NOW } from "@/lib/frontdesk/clock";
import {
  currentState,
  encounterFor,
  seededState,
  type DeskState,
  type Encounter,
} from "@/lib/frontdesk/encounters";

/**
 * The day, as the person at the counter sees it.
 *
 * A pure read model: appointments for one site on one date, joined to the
 * encounter journal, with every clock derived from a single `now` the caller
 * passes in. Nothing here reads a clock itself — that is what makes the whole
 * board deterministic on the server and testable without freezing time.
 *
 * THE DATE IS THE PINNED DAY. Apex renders one seeded Thursday, 12 June 2026,
 * and the desk board is a today-board. Advancing the desk clock past midnight
 * would empty it, which would be technically correct and useless; the day's
 * date is therefore fixed and only the time-of-day moves.
 */

export const DESK_DATE = DESK_PINNED_NOW.slice(0, 10);

/** The scope of the board. `all` is the multi-site ops view, not the default. */
export type DeskScope = LocationId | "all";

export type DeskBand = "here" | "upcoming" | "closed";

export interface DeskRow {
  appt: Appointment;
  client?: Client;
  state: DeskState;
  band: DeskBand;

  /** Present only once the desk has recorded something against this visit. */
  encounter?: Encounter;

  /**
   * False when the state came from the seed rather than from a desk action.
   *
   * This is the audit finding rendered as a field. `ap-02` ships as
   * `status: "Checked In"` with NO arrival timestamp anywhere in the record,
   * so its wait time is unknowable — and a board that shows "waiting 0m" for
   * it would be inventing the one number the audit says does not exist.
   */
  deskRecorded: boolean;
  /** True when there is a real arrival timestamp to count from. */
  arrivalKnown: boolean;

  arrivedAt?: string;
  roomedAt?: string;
  closedAt?: string;
  roomId?: string;

  /** Minutes since arrival, stopped at the moment of rooming. */
  waitingMin?: number;
  /** Minutes the visit has been in a room, stopped at close-out. */
  inRoomMin?: number;
  /** Minutes past the booked start, for a visit still waiting to be seen. */
  lateMin: number;
  /** Minutes the in-room time exceeds the booked duration. Negative = ahead. */
  overrunMin?: number;

  /** Sort key. Fixed for the life of the row — see `deskDay` below. */
  order: string;
}

export interface DeskDay {
  date: string;
  scope: DeskScope;
  /** Everyone in the building: Arrived + Roomed. Ordered first-come. */
  here: DeskRow[];
  /** Still to come, in time order, with the NOW line running through it. */
  upcoming: DeskRow[];
  /** Completed, no-showed, cancelled. Most recently closed first. */
  closed: DeskRow[];
  all: DeskRow[];

  waitingCount: number;
  inRoomCount: number;
  /** Longest current wait among people who have not been roomed yet. */
  longestWaitMin: number;
  /** The next person expected through the door. Null once the day is done. */
  nextArrival: DeskRow | null;
  /** Minutes until `nextArrival` is due. Negative when they are already late. */
  nextArrivalInMin: number | null;
  /** Rooms currently occupied, by room id. */
  occupiedRooms: Record<string, DeskRow>;
}

const OPEN_STATES: DeskState[] = ["Arrived", "Roomed"];
const CLOSED_STATES: DeskState[] = ["Completed", "No Show", "Cancelled"];

export function bandFor(state: DeskState): DeskBand {
  if (OPEN_STATES.includes(state)) return "here";
  if (CLOSED_STATES.includes(state)) return "closed";
  return "upcoming";
}

/** Visit types this site cannot deliver at all — telehealth has no rooms. */
export function isVirtual(appt: Appointment): boolean {
  return appt.locationId === "telehealth" || appt.type === "Telehealth";
}

function buildRow(appt: Appointment, now: string): DeskRow {
  const enc = encounterFor(appt.id);
  const state = currentState(appt);
  const deskRecorded = !!enc;

  // The seeded "Checked In" row has a state but no timestamp. Anything the
  // desk recorded has both.
  const arrivedAt = enc?.arrivedAt;
  const arrivalKnown = !!arrivedAt;

  const roomedAt = enc?.roomedAt;
  const closedAt = enc?.closedAt;

  const waitingMin = arrivedAt ? Math.max(0, minutesBetween(arrivedAt, roomedAt ?? now)) : undefined;
  const inRoomMin = roomedAt ? Math.max(0, minutesBetween(roomedAt, closedAt ?? now)) : undefined;

  const lateMin =
    state === "Scheduled" || (state === "Arrived" && !roomedAt)
      ? Math.max(0, minutesBetween(appt.start, now))
      : 0;

  const booked = visitTypeMap[appt.type]?.durationMin ?? appt.durationMin;
  const overrunMin = inRoomMin === undefined ? undefined : inRoomMin - booked;

  return {
    appt,
    client: clientMap[appt.clientId],
    state,
    band: bandFor(state),
    encounter: enc,
    deskRecorded,
    arrivalKnown,
    arrivedAt,
    roomedAt,
    closedAt,
    roomId: enc?.roomId,
    waitingMin,
    inRoomMin,
    lateMin,
    overrunMin,
    // Arrival time first so the waiting band is genuinely first-come-first-
    // served; fall back to the booked start for the seeded check-in that has
    // no arrival time, and to the id so the order is byte-identical on every
    // render. See the frozen-order note in `deskDay`.
    order: `${arrivedAt ?? appt.start}|${appt.id}`,
  };
}

/**
 * Build the board.
 *
 * ORDER IS FROZEN BY CONSTRUCTION, which is the lesson
 * `components/coach/TodayQueue.tsx` paid for: a list that re-sorts when you
 * work a row moves the next row under your cursor, and people misclick and then
 * stop trusting it. Here the sort key of a row in the waiting band is its
 * ARRIVAL time — a value that never changes once set. So marking somebody
 * Roomed swaps their chip and their timer and moves them nowhere. Nothing below
 * them shifts. The band a row sits in changes only when it genuinely stops
 * being the same kind of thing (someone leaves the building), and that is a
 * change the person at the counter caused deliberately.
 */
export function deskDay(scope: DeskScope, now: string): DeskDay {
  const rows = allAppointments()
    .filter((a) => a.start.slice(0, 10) === DESK_DATE)
    .filter((a) => scope === "all" || a.locationId === scope)
    .map((a) => buildRow(a, now));

  const here = rows
    .filter((r) => r.band === "here")
    .sort((a, b) => a.order.localeCompare(b.order));

  const upcoming = rows
    .filter((r) => r.band === "upcoming")
    .sort((a, b) => a.appt.start.localeCompare(b.appt.start) || a.appt.id.localeCompare(b.appt.id));

  const closed = rows
    .filter((r) => r.band === "closed")
    // Most recently closed at the top, so an undo is where the eye already is.
    // Rows closed in the seed have no closedAt and settle underneath by start.
    .sort(
      (a, b) =>
        (b.closedAt ?? "").localeCompare(a.closedAt ?? "") ||
        b.appt.start.localeCompare(a.appt.start),
    );

  const waiting = here.filter((r) => r.state === "Arrived");
  const inRoom = here.filter((r) => r.state === "Roomed");

  const longestWaitMin = waiting.reduce((max, r) => Math.max(max, r.waitingMin ?? 0), 0);

  const nextArrival = upcoming[0] ?? null;

  const occupiedRooms: Record<string, DeskRow> = {};
  for (const r of inRoom) if (r.roomId) occupiedRooms[r.roomId] = r;

  return {
    date: DESK_DATE,
    scope,
    here,
    upcoming,
    closed,
    all: rows,
    waitingCount: waiting.length,
    inRoomCount: inRoom.length,
    longestWaitMin,
    nextArrival,
    nextArrivalInMin: nextArrival ? minutesBetween(now, nextArrival.appt.start) : null,
    occupiedRooms,
  };
}

/** Appointment counts per site for the location switcher, at a glance. */
export function dayCountsByLocation(now: string): Record<string, { total: number; here: number }> {
  const out: Record<string, { total: number; here: number }> = {};
  for (const a of allAppointments()) {
    if (a.start.slice(0, 10) !== DESK_DATE) continue;
    const bucket = (out[a.locationId] ??= { total: 0, here: 0 });
    bucket.total += 1;
    if (bandFor(currentState(a)) === "here") bucket.here += 1;
  }
  return out;
}

/** Who is delivering the visit — resolved, never a raw id. */
export function providerLabel(appt: Appointment): string {
  const s = staffMap[appt.staffId];
  if (!s) return "Unassigned";
  return s.credentials ? `${s.name}, ${s.credentials}` : s.name;
}

/**
 * Whether a row's seeded state was reachable by the seed alone.
 *
 * `seededState` is exported for the UI so a row can say "this came from the
 * fixture" rather than implying the desk did it.
 */
export { seededState };
