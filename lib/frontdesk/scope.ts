import type { LocationId } from "@/lib/types";
import { staffMap } from "@/lib/mock/staff";
import { VIEWER, PERSONAS } from "@/lib/viewer";

/**
 * Which locations a person may see.
 *
 * WHY THIS EXISTS
 * ---------------
 * The desk console shipped with `DESK_LOCATIONS` — a flat list of all five
 * sites — and a switcher that let anyone at any desk page through all of them.
 * Alpha Health runs four physical clinics with their own reception staff, and
 * the receptionist at Myrtle Beach has no business reading the Raleigh day
 * board. That is not a UI preference; it is minimum-necessary access, and it is
 * the same class of finding as the member portal exposing staff chrome.
 *
 * A location assignment already exists on the staff record (`locationIds`), so
 * the scope was always derivable — nothing was consulting it.
 *
 * THE OWNER IS THE DELIBERATE EXCEPTION
 * -------------------------------------
 * Ownership needs the cross-location view: comparing sites IS the job. So the
 * owner resolves to every location, and that is a decision recorded here rather
 * than an accident of an unfiltered list. Everyone else gets exactly what their
 * record says.
 *
 * HOW FAR THIS GOES, HONESTLY
 * ---------------------------
 * This is a CLIENT-SIDE scope over seeded data, so it shapes what the interface
 * offers, not what the process can reach. A determined user with devtools can
 * still read the seeded array — every page in Apex is a client component reading
 * lib/mock/**, and no filter written here changes that.
 *
 * Real enforcement needs the reads to move behind the server boundary that now
 * exists (lib/db/**, lib/auth/principal.ts), where the location predicate goes
 * into the query and an out-of-scope row is never sent to the browser at all.
 * `scopeFor()` is written to take a staff id precisely so that swap is
 * mechanical: the server passes the authenticated principal's staff id and the
 * same function answers.
 */

export const ALL_LOCATIONS: LocationId[] = [
  "raleigh",
  "raleigh-boutique",
  "southern-pines",
  "myrtle-beach",
  "telehealth",
];

export interface LocationScope {
  /** Locations this person may view. Never empty — see the fallback below. */
  allowed: LocationId[];
  /** True when they may see every site (ownership). */
  unrestricted: boolean;
  /** The one site they work at, when there is exactly one. Drives the default. */
  home: LocationId | null;
  /** Shown when a switcher is hidden, so the limit is explained not merely felt. */
  reason: string;
}

/**
 * Resolve the scope for a staff member.
 *
 * Telehealth is included for anyone with a physical site because a telehealth
 * visit is booked against the patient's state, not a building, and reception
 * still needs to see it on the day board — excluding it would hide real
 * appointments from the person answering the phone about them.
 */
export function scopeFor(staffId: string | null): LocationScope {
  // The owner sees everything. Checked first and by identity, so a future
  // role rename cannot silently narrow ownership.
  if (staffId && staffId === VIEWER.id) {
    return {
      allowed: ALL_LOCATIONS,
      unrestricted: true,
      home: null,
      reason: "Ownership — every location.",
    };
  }

  const s = staffId ? staffMap[staffId] : undefined;

  // No staff record means no scope. Falling back to "everything" here would
  // reproduce the exact bug this module fixes, and would do it for the least
  // identified user in the system.
  if (!s || !s.locationIds?.length) {
    return {
      allowed: [],
      unrestricted: false,
      home: null,
      reason: "No location is assigned to this account, so no day board can be shown.",
    };
  }

  const physical = s.locationIds.filter((l) => l !== "telehealth");
  const allowed: LocationId[] = [...s.locationIds];
  if (physical.length > 0 && !allowed.includes("telehealth")) allowed.push("telehealth");

  return {
    allowed,
    unrestricted: false,
    home: physical.length === 1 ? physical[0] : null,
    reason:
      physical.length === 1
        ? "You are assigned to one location, so this board shows only that site."
        : "This board shows the locations you are assigned to.",
  };
}

/** True when a person may view a given location. The single predicate to reuse. */
export function mayView(staffId: string | null, locationId: LocationId): boolean {
  return scopeFor(staffId).allowed.includes(locationId);
}

/**
 * Who is sitting at the desk right now.
 *
 * NOT `deskStaffFor("all")` — that helper answers a different question ("which
 * Admin record should own a ledger row for this location") and its "all" branch
 * is a hardcoded fallback to st-010, Myrtle Beach. Using it here silently gave
 * every desk Owen's scope regardless of who was signed in, which is precisely
 * the bug this module exists to close, reintroduced one layer up.
 *
 * The persona list is the honest source: the desk seat names a real staff
 * record. When staff identity moves behind Entra properly, this becomes the
 * authenticated principal's staffId (lib/auth/principal.ts) and nothing else
 * here changes.
 */
export function currentDeskStaffId(): string | null {
  return PERSONAS.find((p) => p.id === "desk")?.asId ?? null;
}
