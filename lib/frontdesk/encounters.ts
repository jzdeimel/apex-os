import type { Appointment, Client, LocationId } from "@/lib/types";
import { staff, staffMap } from "@/lib/mock/staff";
import { clientName } from "@/lib/mock/clients";
import { appendLedger, type LedgerEntity, type LedgerRow } from "@/lib/trace/ledger";
import { roomLabel } from "@/lib/frontdesk/rooms";
import { deskNowIso } from "@/lib/frontdesk/clock";

/**
 * The encounter journal — the thing this persona exists to create.
 *
 * AUDIT FINDING (GAP_ANALYSIS.md, FRONT DESK, P0): `"Checked In"` appears four
 * times repo-wide — a seeded enum value on one appointment, a colour lookup, a
 * member of a type union, and a coercion in analytics. It is NEVER WRITTEN.
 * There was no setter, no arrival timestamp, no room and no check-out, which
 * means there was no encounter clock, and with no encounter clock there is no
 * wait time, no room turn and no billable-visit basis.
 *
 * This module is the setter. Every transition appends a REAL hash-chained
 * ledger row via `appendLedger` — the actor is the front-desk staff member, the
 * subject is the member — and returns that row's id and hash so the UI can show
 * what it just wrote rather than toasting a claim.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 *  · It does not mutate `lib/mock/appointments.ts`. That seed is shared by a
 *    dozen surfaces and `lib/booking/availability.ts:293` already established
 *    the rule that a demo does not scribble on someone else's fixture. The
 *    journal is a separate record keyed by appointment id.
 *
 *  · It could not fully mutate it even if it wanted to. `Appointment["status"]`
 *    is the closed union `Scheduled | Checked In | Completed | No Show` — there
 *    is no `Roomed` and no `Cancelled` in it. A front desk that cannot record a
 *    cancellation is not a front desk, so the desk state machine is its own
 *    type and the seeded status is read as an INPUT to it, never as its home.
 *
 *  · It does not persist. `lib/trace/ledger.ts` is a module-scope array and so
 *    is this. The UI says so once, quietly, on the board — because a screen
 *    that shows a hash and says nothing about durability invites exactly the
 *    wrong conclusion.
 */

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export type DeskState =
  | "Scheduled"
  | "Arrived"
  | "Roomed"
  | "Completed"
  | "No Show"
  | "Cancelled";

/**
 * Legal moves. A front desk mis-taps constantly, so every terminal state can
 * be walked back — but walking back is a CORRECTION, not an erasure: it
 * appends a new ledger row rather than removing the one that was wrong.
 */
const ALLOWED: Record<DeskState, DeskState[]> = {
  Scheduled: ["Arrived", "No Show", "Cancelled"],
  // "Cancelled" from Arrived is a real thing: left without being seen. So is
  // "Completed" — a quick lab draw at the counter never sees a room.
  Arrived: ["Roomed", "Completed", "Cancelled", "Scheduled"],
  Roomed: ["Completed", "Arrived"],
  // Every terminal state can reach BOTH of the states that precede it. That is
  // not generosity, it is what makes `undoLastStep` honest: a row checked out
  // straight from the waiting room has "Arrived" as its previous step, and an
  // undo that silently refused would leave the desk unable to fix its own
  // mis-tap while the member is still standing there.
  Completed: ["Roomed", "Arrived"],
  "No Show": ["Scheduled", "Arrived"],
  Cancelled: ["Scheduled", "Arrived"],
};

export function canTransition(from: DeskState, to: DeskState): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export interface EncounterStep {
  to: DeskState;
  /** Desk-clock time the step was recorded. */
  at: string;
  roomId?: string;
  ledgerId: string;
  ledgerHash: string;
  /** True when this step undid a mis-tap rather than moving the visit forward. */
  correction: boolean;
}

export interface Encounter {
  appointmentId: string;
  state: DeskState;
  /** Set the moment the desk records an arrival. Never inferred. */
  arrivedAt?: string;
  roomedAt?: string;
  closedAt?: string;
  roomId?: string;
  /** Every step, in order. This is the encounter's own audit trail. */
  trail: EncounterStep[];
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

const journal = new Map<string, Encounter>();

let version = 0;
const listeners = new Set<() => void>();

function bump() {
  version += 1;
  for (const fn of listeners) fn();
}

/** For `useSyncExternalStore`. A primitive snapshot, so identity is stable. */
export function encounterVersion(): number {
  return version;
}

export function subscribeEncounters(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function encounterFor(appointmentId: string): Encounter | undefined {
  return journal.get(appointmentId);
}

/** Every encounter the desk has touched this session, oldest first. */
export function recordedEncounters(): Encounter[] {
  return [...journal.values()];
}

// ---------------------------------------------------------------------------
// Who is standing at the desk
// ---------------------------------------------------------------------------

/**
 * The front-desk staff member on duty at a site.
 *
 * Resolved from the real roster rather than hardcoded, because the ledger's
 * actor has to be a person who could plausibly have been there. Raleigh has
 * Hannah Whitfield and Myrtle Beach has Gabriel Stone; Southern Pines and the
 * boutique have no dedicated Admin in `lib/mock/staff.ts`, so they fall through
 * to Owen Castellano, who covers all five sites.
 *
 * HONEST NOTE: Apex has three staff roles — Admin, Coach, Medical — and no
 * `Front Desk` role. GAP_ANALYSIS calls that out separately (OWNERSHIP/ADMIN,
 * "Staff roles", P0). Admin is the closest real record, so the ledger says
 * Admin. It does not say "Front Desk", because no such role exists to say.
 */
export function deskStaffFor(locationId: LocationId | "all"): string {
  if (locationId === "all") return "st-010";
  const onSite = staff.find((s) => s.role === "Admin" && s.locationIds.includes(locationId));
  return onSite?.id ?? "st-010";
}

// ---------------------------------------------------------------------------
// Ledger shape
// ---------------------------------------------------------------------------

/**
 * `LedgerEntity` has no `encounter` or `appointment` member, and
 * `lib/trace/ledger.ts` is owned elsewhere. `lib/booking/availability.ts:333`
 * hit the same wall for bookings and settled on `session` — "a scheduled
 * encounter" — with a note to change one constant when the union grows. Same
 * choice here, for the same reason and with the same note.
 */
const ENCOUNTER_LEDGER_ENTITY: LedgerEntity = "session";

const REASON: Record<DeskState, string> = {
  Scheduled: "Front desk — visit returned to scheduled",
  Arrived: "Front desk — member checked in; encounter clock started",
  Roomed: "Front desk — member roomed",
  Completed: "Front desk — visit closed out; encounter clock stopped",
  "No Show": "Front desk — member did not arrive",
  Cancelled: "Front desk — visit cancelled",
};

// ---------------------------------------------------------------------------
// The write
// ---------------------------------------------------------------------------

export interface TransitionInput {
  appointment: Appointment;
  client?: Client;
  to: DeskState;
  /** Room, required by the UI for a `Roomed` step at a site that has rooms. */
  roomId?: string;
  /** Desk-clock time. Defaults to now so callers cannot accidentally backdate. */
  at?: string;
  /** Front-desk staff id. Resolved from the site if omitted. */
  actorId?: string;
  /** True when the step walks a mis-tap back rather than moving forward. */
  correction?: boolean;
}

export interface TransitionResult {
  encounter: Encounter;
  row: LedgerRow;
}

/** Read the desk state of an appointment the desk has not touched yet. */
export function seededState(appt: Appointment): DeskState {
  switch (appt.status) {
    case "Checked In":
      return "Arrived";
    case "Completed":
      return "Completed";
    case "No Show":
      return "No Show";
    default:
      return "Scheduled";
  }
}

export function currentState(appt: Appointment): DeskState {
  return journal.get(appt.id)?.state ?? seededState(appt);
}

/**
 * Record a state change.
 *
 * Returns `null` on an illegal move rather than throwing — a desk surface
 * should refuse cleanly, not crash while somebody is standing at the counter.
 */
export function transitionEncounter(input: TransitionInput): TransitionResult | null {
  const { appointment: appt, client, to } = input;
  const from = currentState(appt);
  if (from === to) return null;
  if (!canTransition(from, to)) return null;

  const at = input.at ?? deskNowIso();
  const actorId = input.actorId ?? deskStaffFor(appt.locationId);
  const actor = staffMap[actorId];
  const correction = input.correction ?? false;

  const prev = journal.get(appt.id);
  const next: Encounter = {
    appointmentId: appt.id,
    state: to,
    arrivedAt: prev?.arrivedAt,
    roomedAt: prev?.roomedAt,
    closedAt: prev?.closedAt,
    roomId: prev?.roomId,
    trail: prev ? [...prev.trail] : [],
  };

  // Clock stamps. Each is set once, on the step that earns it, and cleared when
  // that step is walked back — a wait timer that keeps counting from an arrival
  // the desk just retracted is worse than no timer at all.
  if (to === "Arrived") {
    next.arrivedAt = next.arrivedAt ?? at;
    // Un-rooming: the visit has not started, so the room is released.
    next.roomedAt = undefined;
    next.roomId = undefined;
    next.closedAt = undefined;
  } else if (to === "Roomed") {
    next.roomedAt = at;
    next.roomId = input.roomId;
    next.closedAt = undefined;
  } else if (to === "Completed") {
    next.closedAt = at;
  } else if (to === "Scheduled") {
    next.arrivedAt = undefined;
    next.roomedAt = undefined;
    next.roomId = undefined;
    next.closedAt = undefined;
  } else {
    // No Show / Cancelled both close the row without starting a visit.
    next.closedAt = at;
  }

  const row = appendLedger(
    {
      actorId,
      actorName: actor?.name ?? actorId,
      actorRole: actor?.role ?? "Admin",
      action: "update",
      entity: ENCOUNTER_LEDGER_ENTITY,
      entityId: appt.id,
      subjectId: appt.clientId,
      subjectName: client ? clientName(client) : appt.clientName,
      locationId: appt.locationId,
      reason: correction ? `${REASON[to]} (correction)` : REASON[to],
      before: {
        state: from,
        ...(prev?.roomId ? { room: roomLabel(prev.roomId) } : {}),
      },
      after: {
        state: to,
        ...(next.roomId ? { room: roomLabel(next.roomId) } : {}),
        ...(next.arrivedAt ? { arrivedAt: next.arrivedAt } : {}),
        ...(next.roomedAt ? { roomedAt: next.roomedAt } : {}),
        ...(next.closedAt ? { closedAt: next.closedAt } : {}),
        // Stated, not implied — the same discipline TodayQueue's ledger rows
        // use. A reader a year from now must not have to infer which records
        // a check-in did and did not move.
        surface: "front-desk-day",
        appointmentRecordMutated: false,
        chargeCreated: false,
      },
    },
    at,
  );

  next.trail.push({ to, at, roomId: next.roomId, ledgerId: row.id, ledgerHash: row.hash, correction });
  journal.set(appt.id, next);
  bump();

  return { encounter: next, row };
}

/**
 * Walk the last step back.
 *
 * A compensating write, exactly like `components/coach/BulkBar.tsx` does for
 * bulk actions: the mistaken row stays in the chain forever and a new row
 * records the correction. Removing the original would be the one thing an
 * append-only log must refuse, and it is the thing this whole product claims
 * to prevent.
 */
export function undoLastStep(appt: Appointment, client?: Client): TransitionResult | null {
  const enc = journal.get(appt.id);
  if (!enc || enc.trail.length === 0) return null;
  const priorStep = enc.trail[enc.trail.length - 2];
  const back: DeskState = priorStep ? priorStep.to : seededState(appt);
  if (!canTransition(enc.state, back)) return null;
  return transitionEncounter({
    appointment: appt,
    client,
    to: back,
    roomId: priorStep?.roomId,
    correction: true,
  });
}

/** Test/demo escape hatch. Not wired to any control — the journal only grows. */
export function _resetEncounters() {
  journal.clear();
  bump();
}
