import type { LocationId } from "@/lib/types";
import type { VisitTypeId } from "@/lib/booking/availability";

/**
 * The rooms behind the front desk.
 *
 * Alpha Health has four clinics and they are NOT the same building. Raleigh is
 * the flagship — four exam rooms, a dedicated draw bay, two infusion chairs and
 * a scan room. The boutique on Falls of Neuse is a small suite with two consult
 * rooms and a single draw chair: no infusion, no scanner, and pretending
 * otherwise is how a desk books an IV into a room that does not exist. Southern
 * Pines and Myrtle Beach sit in between and differ from each other.
 *
 * Modelling rooms per-site rather than "Room 1..4 everywhere" is the whole
 * point. A generic room list would let the rooming control offer a Scan room at
 * the boutique, and the first time it did, the person at the counter would stop
 * believing anything else on the screen.
 *
 * TELEHEALTH HAS NO ROOMS, deliberately and not as an oversight. A member on a
 * video visit is sitting in their own kitchen. `roomsAt("telehealth")` returns
 * an empty array and the desk surface skips the rooming step entirely rather
 * than inventing a "Virtual Room 1" to keep the state machine tidy.
 *
 * This is demo data. In production it is a facilities table the clinic manager
 * edits, with a room that goes out of service disappearing from the picker the
 * same day.
 */

export type RoomKind = "exam" | "consult" | "draw" | "infusion" | "scan";

export interface Room {
  id: string;
  locationId: LocationId;
  /** What the staff call it out loud. */
  label: string;
  kind: RoomKind;
  /** One line of site-specific truth — why this room is what it is. */
  note?: string;
}

export const ROOMS: Room[] = [
  // ── Raleigh (flagship, 701 Mutual Ct) ───────────────────────────────────
  { id: "rm-ral-e1", locationId: "raleigh", label: "Exam 1", kind: "exam" },
  { id: "rm-ral-e2", locationId: "raleigh", label: "Exam 2", kind: "exam" },
  { id: "rm-ral-e3", locationId: "raleigh", label: "Exam 3", kind: "exam" },
  {
    id: "rm-ral-e4",
    locationId: "raleigh",
    label: "Exam 4",
    kind: "exam",
    note: "Doubles as the overflow consult room",
  },
  { id: "rm-ral-dr", locationId: "raleigh", label: "Draw bay", kind: "draw" },
  { id: "rm-ral-i1", locationId: "raleigh", label: "Infusion A", kind: "infusion" },
  { id: "rm-ral-i2", locationId: "raleigh", label: "Infusion B", kind: "infusion" },
  { id: "rm-ral-sc", locationId: "raleigh", label: "Scan room", kind: "scan" },

  // ── Raleigh Boutique (Falls of Neuse, Suite 27) ─────────────────────────
  // Three rooms, no infusion chair and no scanner. The site is a consult suite.
  {
    id: "rm-bou-a",
    locationId: "raleigh-boutique",
    label: "Suite A",
    kind: "consult",
    note: "Front suite, street side",
  },
  { id: "rm-bou-b", locationId: "raleigh-boutique", label: "Suite B", kind: "consult" },
  {
    id: "rm-bou-dr",
    locationId: "raleigh-boutique",
    label: "Draw chair",
    kind: "draw",
    note: "Single chair — one draw at a time",
  },

  // ── Southern Pines ──────────────────────────────────────────────────────
  { id: "rm-sop-e1", locationId: "southern-pines", label: "Exam 1", kind: "exam" },
  { id: "rm-sop-e2", locationId: "southern-pines", label: "Exam 2", kind: "exam" },
  { id: "rm-sop-e3", locationId: "southern-pines", label: "Exam 3", kind: "exam" },
  { id: "rm-sop-dr", locationId: "southern-pines", label: "Draw bay", kind: "draw" },
  { id: "rm-sop-i1", locationId: "southern-pines", label: "Infusion chair", kind: "infusion" },

  // ── Myrtle Beach ────────────────────────────────────────────────────────
  { id: "rm-myr-e1", locationId: "myrtle-beach", label: "Exam 1", kind: "exam" },
  { id: "rm-myr-e2", locationId: "myrtle-beach", label: "Exam 2", kind: "exam" },
  { id: "rm-myr-dr", locationId: "myrtle-beach", label: "Draw bay", kind: "draw" },
  { id: "rm-myr-i1", locationId: "myrtle-beach", label: "Infusion A", kind: "infusion" },
  { id: "rm-myr-i2", locationId: "myrtle-beach", label: "Infusion B", kind: "infusion" },
  { id: "rm-myr-sc", locationId: "myrtle-beach", label: "Scan room", kind: "scan" },
];

export const roomMap: Record<string, Room> = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

export function roomsAt(locationId: LocationId): Room[] {
  return ROOMS.filter((r) => r.locationId === locationId);
}

export function roomLabel(roomId?: string): string {
  if (!roomId) return "—";
  return roomMap[roomId]?.label ?? roomId;
}

/**
 * The kind of room a visit type belongs in.
 *
 * `null` means the visit needs no room at all — that is telehealth, and it is
 * the only honest answer for a visit that happens in somebody's kitchen.
 */
export function roomKindFor(visitType: VisitTypeId): RoomKind | null {
  switch (visitType) {
    case "Lab Draw":
      return "draw";
    case "IV Therapy":
      return "infusion";
    case "Body Scan":
      return "scan";
    case "Telehealth":
      return null;
    default:
      // Initial Consult, Follow-Up, Plan Review. Either an exam room or a
      // consult suite works; `roomsFor` resolves whichever this site has.
      return "exam";
  }
}

export interface RoomOptions {
  /** Rooms that suit this visit type at this site, best first. */
  suited: Room[];
  /** Everything else on site — offered, but flagged. */
  other: Room[];
  /**
   * True when this site has no room of the right kind at all.
   *
   * The boutique has no scanner and no infusion chair, so a Body Scan booked
   * there produces this. The desk surface says so out loud instead of silently
   * showing a shorter list, which is the same argument
   * `lib/booking/availability.ts` makes about licensure.
   */
  noSuitableRoom: boolean;
  /** Null when the visit needs no room (telehealth). */
  kind: RoomKind | null;
}

export function roomsFor(locationId: LocationId, visitType: VisitTypeId): RoomOptions {
  const kind = roomKindFor(visitType);
  const all = roomsAt(locationId);
  if (kind === null) return { suited: [], other: [], noSuitableRoom: false, kind };

  // "exam" and "consult" are the same job with different furniture, so a site
  // that has only consult suites still satisfies an exam-shaped visit.
  const wanted: RoomKind[] = kind === "exam" ? ["exam", "consult"] : [kind];
  const suited = all.filter((r) => wanted.includes(r.kind));
  const other = all.filter((r) => !wanted.includes(r.kind));
  return { suited, other, noSuitableRoom: suited.length === 0, kind };
}
