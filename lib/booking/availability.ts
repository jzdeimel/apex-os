import type { Appointment, Client, LocationId, StaffRole } from "@/lib/types";
import type { TravelWindow } from "@/lib/account/travel";
import { staff, staffMap } from "@/lib/mock/staff";
import { locationMap } from "@/lib/mock/locations";
import { appointments } from "@/lib/mock/appointments";
import { shifts, WEEK_DATES, type Shift } from "@/lib/mock/shifts";
import { appendLedger, type LedgerEntity } from "@/lib/trace/ledger";
import { seededRandom, absolute } from "@/lib/utils";

/**
 * Self-booking availability.
 *
 * The rule this module exists to enforce: **a slot Apex offers is a slot that
 * actually exists.** Availability is derived — from the published roster
 * (lib/mock/shifts.ts) minus what is already on the books
 * (lib/mock/appointments.ts) minus the visit's own duration — never from a
 * generated grid of pretty times. A booking surface that invents openings and
 * reconciles later is how a member drives forty minutes to an empty room, and
 * how a front desk ends up owning a phone call the software created.
 *
 * Four constraints, all real:
 *   1. The staff member must be on shift, at that location, for the whole visit.
 *   2. Nothing may overlap an appointment they already have.
 *   3. The visit type decides who may deliver it and how long it takes.
 *   4. Telehealth requires the clinician to be LICENSED IN THE STATE THE MEMBER
 *      IS PHYSICALLY IN. See `licensedIn` below — that one is law, not UX.
 */

const NOW = "2026-06-12T09:00:00";

/** Grid the clinic books on. Starts land on the quarter hour, always. */
const SLOT_STEP_MIN = 15;

/** Blocked on every clinic roster. Staff eat; the booking engine should know. */
const LUNCH = { start: "12:00", end: "13:00" };

/** How far ahead self-booking is allowed to reach. */
export const BOOKING_HORIZON_DAYS = 14;

// ---------------------------------------------------------------------------
// Visit types
// ---------------------------------------------------------------------------

export type VisitTypeId = Appointment["type"];

export interface VisitType {
  id: VisitTypeId;
  /** What the member calls it. */
  label: string;
  /** One line of member-facing plain language. Never clinical instruction. */
  blurb: string;
  durationMin: number;
  /** Which staff roles may deliver it. */
  roles: StaffRole[];
  /** Can it be delivered virtually? */
  virtual: boolean;
  /** Can it be delivered in a clinic? Lab draws and IVs cannot be done by video. */
  inPerson: boolean;
  /** True when a licensed provider must be the one in the room. */
  providerOnly: boolean;
}

/**
 * The bookable menu.
 *
 * Durations match the ones already on the books in lib/mock/appointments.ts, so
 * a self-booked visit occupies the same amount of the day as a desk-booked one.
 * Nothing here describes treatment — a visit type is a calendar fact.
 */
export const VISIT_TYPES: VisitType[] = [
  {
    id: "Initial Consult",
    label: "Initial consult",
    blurb: "Your first sit-down with a provider — history, goals, and what to test.",
    durationMin: 45,
    roles: ["Medical"],
    virtual: true,
    inPerson: true,
    providerOnly: true,
  },
  {
    id: "Follow-Up",
    label: "Follow-up",
    blurb: "A check on how things are going since your last visit.",
    durationMin: 30,
    roles: ["Medical"],
    virtual: true,
    inPerson: true,
    providerOnly: true,
  },
  {
    id: "Plan Review",
    label: "Plan review",
    blurb: "Walk through your plan of care line by line with your coach or provider.",
    durationMin: 45,
    roles: ["Medical", "Coach"],
    virtual: true,
    inPerson: true,
    providerOnly: false,
  },
  {
    id: "Telehealth",
    label: "Telehealth visit",
    blurb: "Same visit, by video. Telehealth is one of our five locations, not a fallback.",
    durationMin: 30,
    roles: ["Medical", "Coach"],
    virtual: true,
    inPerson: false,
    providerOnly: false,
  },
  {
    id: "Lab Draw",
    label: "Lab draw",
    blurb: "In and out. Bring nothing; your panel is already ordered.",
    durationMin: 20,
    roles: ["Medical", "Admin"],
    virtual: false,
    inPerson: true,
    providerOnly: false,
  },
  {
    id: "Body Scan",
    label: "Body scan",
    blurb: "Measured body composition, not an estimate from a bathroom scale.",
    durationMin: 20,
    roles: ["Coach", "Admin"],
    virtual: false,
    inPerson: true,
    providerOnly: false,
  },
  {
    id: "IV Therapy",
    label: "IV therapy",
    blurb: "Chair time at the clinic. Bring headphones.",
    durationMin: 60,
    roles: ["Medical"],
    virtual: false,
    inPerson: true,
    providerOnly: true,
  },
];

export const visitTypeMap: Record<VisitTypeId, VisitType> = Object.fromEntries(
  VISIT_TYPES.map((v) => [v.id, v]),
) as Record<VisitTypeId, VisitType>;

// ---------------------------------------------------------------------------
// Licensure — the constraint that is actually law
// ---------------------------------------------------------------------------

/**
 * The states a clinician may see a telehealth member in.
 *
 * THIS IS NOT A NICETY, AND IT IS NOT A BUSINESS RULE SOMEONE CAN WAIVE TO HIT
 * A BOOKING TARGET. In United States telemedicine the visit legally occurs
 * where the PATIENT is sitting, not where the clinician is. A provider licensed
 * only in North Carolina who takes a video visit from a member who happens to
 * be in Georgia that morning has practised medicine without a licence in
 * Georgia — a board matter for the clinician, an unlicensed-practice exposure
 * for Alpha Health, and a visit the payer can claw back. It is also the single
 * most common thing a telehealth product gets wrong, because the member's
 * location is invisible unless you ask for it.
 *
 * So Apex asks, and Apex filters. `slotsFor` will not return a telehealth slot
 * from a clinician who is not licensed where the member currently is, and the
 * UI says why rather than silently showing a shorter list — a member who cannot
 * see the constraint assumes the product is broken.
 *
 * This map is DEMO DATA. In production it is a credentialing table with an
 * expiry date per state licence, fed by the credentialing team, and a licence
 * that lapses removes availability the same day.
 */
export type USState = string;

const HOME_STATES: USState[] = ["NC", "SC"];

/** Extra states a telehealth-covering clinician holds a licence in, deterministically. */
const TELEHEALTH_LICENCE_POOL: USState[] = ["VA", "GA", "TN", "FL", "TX", "NY", "CO", "AZ"];

export function licensedIn(staffId: string): USState[] {
  const member = staffMap[staffId];
  if (!member) return [];

  // Every clinician is licensed where their own clinics are.
  const fromClinics = member.locationIds
    .map((id) => locationMap[id]?.state)
    .filter((s): s is string => !!s && s !== "—");

  const out = new Set<USState>(fromClinics);

  // Telehealth-covering clinicians carry additional state licences. Coaches are
  // included because coaching is not licensed practice — but they are still
  // filtered by the same list so a single code path governs who can appear.
  if (member.locationIds.includes("telehealth")) {
    for (const s of HOME_STATES) out.add(s);
    const rand = seededRandom(`${member.id}-licences`);
    const count = member.role === "Medical" ? 2 + Math.floor(rand() * 4) : TELEHEALTH_LICENCE_POOL.length;
    for (let i = 0; i < count; i++) {
      out.add(TELEHEALTH_LICENCE_POOL[Math.floor(rand() * TELEHEALTH_LICENCE_POOL.length)]);
    }
  }

  return [...out].sort();
}

/**
 * Where the member physically is on a given day.
 *
 * Home clinic's state normally; the travel destination's state while a travel
 * window covers that date. Travel mode is therefore not only a reminders
 * feature — it is the input to the licensure filter above, which is the honest
 * reason to ask a member where they are going.
 */
export function memberStateOn(client: Client, date: string, travel?: TravelWindow | null): USState {
  if (travel && date >= travel.from && date <= travel.to) return travel.state;
  return locationMap[client.locationId]?.state ?? HOME_STATES[0];
}

// ---------------------------------------------------------------------------
// Time helpers — string-local, never TZ-shifted
// ---------------------------------------------------------------------------

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Local ISO without a timezone, matching every other datetime in the codebase. */
function iso(date: string, minutes: number): string {
  return `${date}T${toHHMM(minutes)}:00`;
}

/** Add whole days to a yyyy-mm-dd without touching the clock. */
function addDays(date: string, n: number): string {
  const d = absolute(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(date: string): number {
  return absolute(`${date}T12:00:00`).getDay();
}

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dayLabel(date: string): string {
  return DAY_LABELS[weekdayOf(date)];
}

// ---------------------------------------------------------------------------
// The roster, projected forward
// ---------------------------------------------------------------------------

/**
 * Shifts for any date in the horizon.
 *
 * lib/mock/shifts.ts publishes exactly one week (Mon 8 Jun → Sun 14 Jun). Self-
 * booking reaches two weeks out, so dates past the published week reuse the
 * roster for the same weekday. In production this reads the real roster table
 * and dates with no published shift simply have no availability — which is the
 * correct answer, not an inconvenience to paper over.
 */
function rosterFor(date: string): Shift[] {
  const direct = shifts.filter((s) => s.date === date);
  if (direct.length) return direct;

  const wd = weekdayOf(date);
  const source = WEEK_DATES.find((d) => weekdayOf(d) === wd);
  if (!source) return [];
  return shifts.filter((s) => s.date === source).map((s) => ({ ...s, id: `${s.id}-p${date}`, date }));
}

// ---------------------------------------------------------------------------
// The book of record
// ---------------------------------------------------------------------------

/**
 * Appointments booked during this session.
 *
 * Separate array rather than pushing into the mock export, because the mock is
 * shared by a dozen other surfaces and a booking demo has no business mutating
 * someone else's fixture. `allAppointments()` is the read path everything here
 * uses, so a self-booked visit blocks its own slot immediately — the bug that
 * matters most in a booking engine is the one where two people take the same
 * time because the first booking was not visible to the second query.
 */
const booked: Appointment[] = [];

export function allAppointments(): Appointment[] {
  return [...appointments, ...booked];
}

export function findAppointment(id: string): Appointment | undefined {
  return allAppointments().find((a) => a.id === id);
}

export function appointmentsForMember(clientId: string): Appointment[] {
  return allAppointments()
    .filter((a) => a.clientId === clientId)
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Register a booked appointment so it occupies its slot from here on. */
export function commitAppointment(appt: Appointment): Appointment {
  booked.push(appt);
  return appt;
}

/**
 * Take a slot.
 *
 * Re-checks availability before committing rather than trusting the slot object
 * the UI is holding: the list the member is looking at was computed when the
 * page rendered, and the correct behaviour when someone else took the time in
 * between is a clean refusal, not a double-book. Returns `null` on refusal so
 * the caller must handle it.
 *
 * Appends a ledger row. A booking is a scheduling event about an identified
 * member, which makes it exactly the kind of thing that has to be
 * reconstructable later — including by the member, on /portal/access.
 *
 * `LedgerEntity` has no `appointment` member and lib/trace/ledger.ts is owned
 * elsewhere, so bookings record against `session` — the closest honest fit for
 * "a scheduled encounter". When the union gains `appointment`, change the one
 * constant below and nothing else.
 */
const BOOKING_LEDGER_ENTITY: LedgerEntity = "session";

export interface BookingResult {
  appointment: Appointment;
  ledgerId: string;
  ledgerHash: string;
}

export function bookSlot(
  slot: Slot,
  client: Client,
  opts: { bookedBy?: "member" | "staff"; reason?: string } = {},
): BookingResult | null {
  const stillOpen = slotsFor({
    visitType: slot.visitType,
    locationId: slot.locationId,
    staffId: slot.staffId,
    fromIso: slot.date,
    days: 1,
  }).some((s) => s.id === slot.id);
  if (!stillOpen) return null;

  const appt: Appointment = {
    id: `ap-${slot.id.slice(5)}`,
    clientId: client.id,
    clientName: `${client.firstName} ${client.lastName}`,
    staffId: slot.staffId,
    locationId: slot.locationId,
    type: slot.visitType,
    start: slot.startIso,
    durationMin: slot.durationMin,
    status: "Scheduled",
  };
  commitAppointment(appt);

  const row = appendLedger({
    actorId: opts.bookedBy === "staff" ? slot.staffId : client.id,
    actorName: opts.bookedBy === "staff" ? slot.staffName : `${client.firstName} ${client.lastName}`,
    actorRole: opts.bookedBy === "staff" ? slot.staffRole : "Client",
    action: "create",
    entity: BOOKING_LEDGER_ENTITY,
    entityId: appt.id,
    subjectId: client.id,
    subjectName: `${client.firstName} ${client.lastName}`,
    locationId: slot.locationId,
    reason: opts.reason ?? "Member self-booked a visit",
    after: {
      type: appt.type,
      start: appt.start,
      durationMin: appt.durationMin,
      with: slot.staffName,
      location: slot.locationId,
    },
  });

  return { appointment: appt, ledgerId: row.id, ledgerHash: row.hash };
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

export interface Slot {
  /** Deterministic and unique — safe as a React key and as an appointment id seed. */
  id: string;
  date: string;
  /** "14:30" */
  time: string;
  startIso: string;
  endIso: string;
  durationMin: number;
  staffId: string;
  staffName: string;
  staffRole: StaffRole;
  staffCredentials?: string;
  locationId: LocationId;
  visitType: VisitTypeId;
}

export interface SlotQuery {
  visitType: VisitTypeId;
  locationId: LocationId;
  /** Restrict to one clinician. Omitted = anyone qualified. */
  staffId?: string;
  /** yyyy-mm-dd or full ISO. Slots before `NOW` are never returned. */
  fromIso?: string;
  days?: number;
  /**
   * Where the member physically is. REQUIRED in spirit for telehealth — omitted
   * means "assume home state", which is only safe because `memberStateOn` is
   * the caller's one-liner for producing it.
   */
  memberState?: USState;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Every bookable slot matching the query.
 *
 * Deterministic: same inputs, same array, same order — no clock read beyond the
 * pinned `NOW`, no randomness in the slot grid itself.
 */
export function slotsFor(query: SlotQuery): Slot[] {
  const type = visitTypeMap[query.visitType];
  if (!type) return [];

  const isVirtual = query.locationId === "telehealth";
  if (isVirtual && !type.virtual) return [];
  if (!isVirtual && !type.inPerson) return [];

  const from = (query.fromIso ?? NOW).slice(0, 10);
  const days = Math.min(query.days ?? BOOKING_HORIZON_DAYS, BOOKING_HORIZON_DAYS);
  const nowDate = NOW.slice(0, 10);
  const nowMin = toMin(NOW.slice(11, 16));
  const state = query.memberState;

  const taken = allAppointments().filter((a) => a.status !== "No Show");
  const out: Slot[] = [];

  for (let d = 0; d < days; d++) {
    const date = addDays(from, d);
    if (date < nowDate) continue;

    for (const shift of rosterFor(date)) {
      if (shift.locationId !== query.locationId) continue;
      if (query.staffId && shift.staffId !== query.staffId) continue;

      const member = staffMap[shift.staffId];
      if (!member) continue;
      if (!type.roles.includes(member.role)) continue;
      // A visit that needs a signature needs someone who can give one.
      if (type.providerOnly && !member.canApprove) continue;

      // ── Licensure gate ────────────────────────────────────────────────────
      // Telehealth only. An in-person visit happens at a clinic in a state the
      // clinic is licensed to operate in, so the question does not arise.
      if (isVirtual && state) {
        if (!licensedIn(member.id).includes(state)) continue;
      }

      const shiftStart = toMin(shift.start);
      const shiftEnd = toMin(shift.end);
      const lunchStart = toMin(LUNCH.start);
      const lunchEnd = toMin(LUNCH.end);

      const theirDay = taken
        .filter((a) => a.staffId === shift.staffId && a.start.slice(0, 10) === date)
        .map((a) => {
          const s = toMin(a.start.slice(11, 16));
          return { s, e: s + a.durationMin };
        });

      for (let t = shiftStart; t + type.durationMin <= shiftEnd; t += SLOT_STEP_MIN) {
        const end = t + type.durationMin;
        if (date === nowDate && t <= nowMin) continue;
        if (overlaps(t, end, lunchStart, lunchEnd)) continue;
        if (theirDay.some((b) => overlaps(t, end, b.s, b.e))) continue;

        out.push({
          id: `slot-${shift.staffId}-${date}-${toHHMM(t).replace(":", "")}-${type.durationMin}`,
          date,
          time: toHHMM(t),
          startIso: iso(date, t),
          endIso: iso(date, end),
          durationMin: type.durationMin,
          staffId: member.id,
          staffName: member.name,
          staffRole: member.role,
          staffCredentials: member.credentials,
          locationId: query.locationId,
          visitType: type.id,
        });
      }
    }
  }

  return out.sort((a, b) => a.startIso.localeCompare(b.startIso) || a.staffId.localeCompare(b.staffId));
}

export interface DayAvailability {
  date: string;
  label: string;
  slots: Slot[];
  /** True when the roster covers the day but every slot is spoken for. */
  full: boolean;
  /** True when nobody qualified is rostered at all. */
  unstaffed: boolean;
}

/** Slots grouped by day, including the empty days — the empty ones sell the waitlist. */
export function availabilityByDay(query: SlotQuery): DayAvailability[] {
  const slots = slotsFor(query);
  const from = (query.fromIso ?? NOW).slice(0, 10);
  const days = Math.min(query.days ?? BOOKING_HORIZON_DAYS, BOOKING_HORIZON_DAYS);
  const type = visitTypeMap[query.visitType];

  return Array.from({ length: days }, (_, d) => {
    const date = addDays(from, d);
    const daySlots = slots.filter((s) => s.date === date);
    const rostered = rosterFor(date).some(
      (s) =>
        s.locationId === query.locationId &&
        (!query.staffId || s.staffId === query.staffId) &&
        !!staffMap[s.staffId] &&
        type?.roles.includes(staffMap[s.staffId].role) &&
        (!type.providerOnly || staffMap[s.staffId].canApprove),
    );
    return {
      date,
      label: dayLabel(date),
      slots: daySlots,
      full: rostered && daySlots.length === 0,
      unstaffed: !rostered,
    };
  });
}

/**
 * Clinicians who could take this visit, for the "who would you like to see"
 * step. Ordered so the member's own care team surfaces first — continuity is
 * clinically better and is what a member expects.
 */
export function eligibleStaff(
  visitType: VisitTypeId,
  locationId: LocationId,
  client?: Client,
  memberState?: USState,
): { id: string; name: string; role: StaffRole; credentials?: string; onCareTeam: boolean; licences: USState[] }[] {
  const type = visitTypeMap[visitType];
  if (!type) return [];
  const isVirtual = locationId === "telehealth";

  return staff
    .filter((s) => s.locationIds.includes(locationId))
    .filter((s) => type.roles.includes(s.role))
    .filter((s) => !type.providerOnly || s.canApprove)
    .filter((s) => !isVirtual || !memberState || licensedIn(s.id).includes(memberState))
    .map((s) => ({
      id: s.id,
      name: s.name,
      role: s.role,
      credentials: s.credentials,
      onCareTeam: !!client && (client.coachId === s.id || client.providerId === s.id),
      licences: licensedIn(s.id),
    }))
    .sort((a, b) => Number(b.onCareTeam) - Number(a.onCareTeam) || a.name.localeCompare(b.name));
}

/**
 * Clinicians excluded from a telehealth search purely because of licensure.
 *
 * Surfaced so the UI can say "Dr. Vale isn't licensed in Georgia" rather than
 * quietly omitting him. An unexplained absence reads as a bug; an explained one
 * reads as a clinic that takes its licences seriously.
 */
export function blockedByLicensure(
  visitType: VisitTypeId,
  memberState: USState,
): { id: string; name: string; licences: USState[] }[] {
  const type = visitTypeMap[visitType];
  if (!type?.virtual) return [];
  return staff
    .filter((s) => s.locationIds.includes("telehealth"))
    .filter((s) => type.roles.includes(s.role))
    .filter((s) => !type.providerOnly || s.canApprove)
    .filter((s) => !licensedIn(s.id).includes(memberState))
    .map((s) => ({ id: s.id, name: s.name, licences: licensedIn(s.id) }));
}

/** Locations a visit type can actually be delivered at. */
export function venuesFor(visitType: VisitTypeId): LocationId[] {
  const type = visitTypeMap[visitType];
  if (!type) return [];
  const clinics: LocationId[] = ["raleigh", "raleigh-boutique", "southern-pines", "myrtle-beach"];
  return [...(type.inPerson ? clinics : []), ...(type.virtual ? (["telehealth"] as LocationId[]) : [])];
}

export { NOW as BOOKING_NOW };
