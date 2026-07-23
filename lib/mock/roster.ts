import type { LocationId } from "@/lib/types";
import type { CredentialClass } from "@/lib/scheduling/credentials";

/**
 * THE REAL ALPHA HEALTH ROSTER.
 *
 * Source: the staffing spreadsheet Paul Kennard shared on 2026-07-21 (first
 * name, last name, department, location, notes). 34 rows; 29 after excluding
 * Alpha Gym, which the sheet itself marks IGNORE ALPHA GYM.
 *
 * ── WHY THIS FILE EXISTS SEPARATELY FROM lib/mock/staff.ts ─────────────────
 * `staff.ts` holds 24 synthetic people (Dr. Marcus Vale et al.) whose ids are
 * referenced across the entire seeded corpus — every client carries a `coachId`
 * and `providerId`, and `/api/audit` fails loudly on a dangling reference. That
 * strictness is the point, so the roster is NOT a find-and-replace: real people
 * map ONTO existing ids, and the ids never move.
 *
 * This file is the mapping and the reference data. Applying it is a deliberate
 * step, not an import side effect, so the demo corpus stays coherent until
 * someone decides to switch it.
 *
 * ── WHAT THE ROSTER SAYS THAT THE SPREADSHEET DID NOT SET OUT TO SAY ───────
 *
 *  1. NOBODY IS LOCATED AT TELEHEALTH. Jerry Cattelane's title is "Telehealth
 *     Physician" and his location is Myrtle Beach; Marc McCully, the coach the
 *     2026-07-21 call named for telehealth patients, is also Myrtle Beach.
 *     Telehealth is a PANEL served by clinic staff, not a sixth clinic — which
 *     is exactly the distinction Paul drew on the call and the reason
 *     `Appointment.modality` is separate from `locationId`.
 *
 *  2. RALEIGH DC HAS NO STAFF. Paul asked for Raleigh to be split into Raleigh
 *     and Raleigh DC (Douglas Carroll). No row on the sheet sits there. Either
 *     the split is unstaffed, the DC people are missing, or "Raleigh DC" is a
 *     room distinction inside one team. Unresolved — see docs/AUG7_CUTOVER.md.
 *
 *  3. TWO CLINICS RUN ON ONE COACH. Raleigh has Zac Duffy and Southern Pines
 *     has Shane James, and Stephanie Butler's NCV spec makes the coach
 *     introduction non-substitutable. Those are single points of failure for
 *     new-patient revenue, surfaced at /clinic/coverage.
 *
 *  4. "NURSE" IS NOT A CREDENTIAL. The sheet says Nurse for Nathalie Callahan,
 *     Rebecca Truesdell and Regina Grimm. RN and LPN differ in scope of
 *     practice, that difference is state-specific, and Stephanie's spec makes
 *     LPN lab draws conditional on it. Those three carry `credentialClass:
 *     null` until someone confirms — and null is not schedulable for a clinical
 *     component, which is the correct behaviour for "we do not know".
 */

export interface RosterEntry {
  firstName: string;
  lastName: string;
  department: "Leadership" | "Medical" | "Coaching" | "Operations";
  /** Where they actually sit. AHQ is corporate, not a clinic. */
  location: LocationId | "AHQ";
  /** Verbatim from the sheet. */
  notes: string;
  /** Null where the sheet is not specific enough to be safe. See §4 above. */
  credentialClass: CredentialClass | null;
  /**
   * The seeded staff id this person maps onto. Null where there is no slot —
   * the seed has 24 people and the roster has 29, so five carry no mapping and
   * must not be invented into one.
   */
  mapsTo: string | null;
}

export const ROSTER: RosterEntry[] = [
  // ── AHQ — corporate. Not a clinic; excluded from clinical scheduling. ─────
  { firstName: "Paul", lastName: "Kennard", department: "Leadership", location: "AHQ", notes: "CEO", credentialClass: "Admin", mapsTo: "st-009" },
  { firstName: "Clifton", lastName: "Mack", department: "Leadership", location: "AHQ", notes: "Owner", credentialClass: "Admin", mapsTo: "st-010" },
  { firstName: "Stephanie", lastName: "Butler", department: "Leadership", location: "AHQ", notes: "COO", credentialClass: "Admin", mapsTo: "st-012" },
  { firstName: "Callip", lastName: "Hall", department: "Leadership", location: "AHQ", notes: "CFO", credentialClass: "Admin", mapsTo: null },
  { firstName: "Jeff", lastName: "Grimm", department: "Medical", location: "AHQ", notes: "Medical Director NC", credentialClass: "MD", mapsTo: "st-001" },
  { firstName: "Matt", lastName: "Chilson", department: "Coaching", location: "AHQ", notes: "Owner / Product Manager", credentialClass: "Admin", mapsTo: "st-owner-matt" },
  { firstName: "Joe", lastName: "Shue", department: "Coaching", location: "AHQ", notes: "Coaching Manager", credentialClass: "Coach", mapsTo: null },
  { firstName: "Melissa", lastName: "Ha", department: "Operations", location: "AHQ", notes: "Order Manager", credentialClass: "Admin", mapsTo: null },
  { firstName: "Aria", lastName: "Gibbons", department: "Operations", location: "AHQ", notes: "Orders", credentialClass: "Admin", mapsTo: null },
  { firstName: "Amanda", lastName: "Gibbons", department: "Operations", location: "AHQ", notes: "Stephanie Assistant", credentialClass: "Admin", mapsTo: null },
  { firstName: "Chelsea", lastName: "Robson", department: "Operations", location: "AHQ", notes: "Marketing", credentialClass: "Admin", mapsTo: null },
  // The fulfillment specialist Matt asked for a restricted role for — MedSource
  // side, not Apex, but recorded here so the name resolves.
  { firstName: "Amanda", lastName: "Pheabus", department: "Operations", location: "AHQ", notes: "Fulfillment Specialist (part time)", credentialClass: "Admin", mapsTo: null },

  // ── Myrtle Beach — the only clinic with depth at every NCV component. ─────
  { firstName: "Belal", lastName: "Khokhar", department: "Medical", location: "myrtle-beach", notes: "Medical Director — 'Bal' on the 2026-07-21 call", credentialClass: "MD", mapsTo: "st-003" },
  { firstName: "Holly", lastName: "Marlowe", department: "Medical", location: "myrtle-beach", notes: "Nurse Practitioner — named on the call for local MB female patients", credentialClass: "NP", mapsTo: "st-020" },
  { firstName: "Jerry", lastName: "Cattelane", department: "Medical", location: "myrtle-beach", notes: "Telehealth Physician — sits at MB; telehealth is a panel, not a place", credentialClass: "MD", mapsTo: "st-023" },
  { firstName: "Nathalie", lastName: "Callahan", department: "Medical", location: "myrtle-beach", notes: "Nurse — RN or LPN unconfirmed; owns the intake form review", credentialClass: null, mapsTo: null },
  { firstName: "Marc", lastName: "McCully", department: "Coaching", location: "myrtle-beach", notes: "Coach — the telehealth panel's coach", credentialClass: "Coach", mapsTo: "st-018" },
  { firstName: "Faith", lastName: "Overhultz", department: "Coaching", location: "myrtle-beach", notes: "Coach", credentialClass: "Coach", mapsTo: "st-019" },
  { firstName: "Mike", lastName: "Skinner", department: "Coaching", location: "myrtle-beach", notes: "Coach", credentialClass: "Coach", mapsTo: null },
  { firstName: "Veronica", lastName: "Webb", department: "Operations", location: "myrtle-beach", notes: "Office Manager", credentialClass: "Admin", mapsTo: null },

  // ── Raleigh — one coach, one nurse, one NP, NO physician. ─────────────────
  { firstName: "Morgan", lastName: "Gibson", department: "Medical", location: "raleigh", notes: "Nurse Practitioner", credentialClass: "NP", mapsTo: "st-015" },
  { firstName: "Rebecca", lastName: "Truesdell", department: "Medical", location: "raleigh", notes: "Nurse — RN or LPN unconfirmed", credentialClass: null, mapsTo: null },
  { firstName: "Zac", lastName: "Duffy", department: "Coaching", location: "raleigh", notes: "Coach — SINGLE POINT OF FAILURE for Raleigh new client visits", credentialClass: "Coach", mapsTo: "st-013" },
  { firstName: "Ashley", lastName: "McAleavy", department: "Operations", location: "raleigh", notes: "Office Manager", credentialClass: "Admin", mapsTo: null },

  // ── Southern Pines — one coach, part-time nurse, NP + PA, no physician. ───
  { firstName: "Jayne", lastName: "Miller", department: "Medical", location: "southern-pines", notes: "Nurse Practitioner", credentialClass: "NP", mapsTo: "st-017" },
  { firstName: "Chris", lastName: "Domingez", department: "Medical", location: "southern-pines", notes: "Physicians Assistant — spelled Dominguez on the call; sheet spelling kept", credentialClass: "PA", mapsTo: "st-004" },
  { firstName: "Regina", lastName: "Grimm", department: "Medical", location: "southern-pines", notes: "Nurse (part time) — RN or LPN unconfirmed", credentialClass: null, mapsTo: null },
  { firstName: "Shane", lastName: "James", department: "Coaching", location: "southern-pines", notes: "Coach — SINGLE POINT OF FAILURE for Southern Pines new client visits", credentialClass: "Coach", mapsTo: "st-016" },
  { firstName: "Jimmy", lastName: "Chavez", department: "Operations", location: "southern-pines", notes: "Office Manager (Temp)", credentialClass: "Admin", mapsTo: null },
];

/**
 * Alpha Gym personal trainers, excluded.
 *
 * The sheet says IGNORE ALPHA GYM against all five. That instruction lives here
 * as DATA rather than in someone's memory, because "why is Charles White not in
 * the scheduler" is a question that will otherwise be asked every few months.
 */
export const EXCLUDED_ALPHA_GYM = [
  "Charles White",
  "Joe Shanley",
  "Kirk May",
  "Spesh Robinson",
  "Tommy Casimiro",
] as const;

/** Roster entries that hold a clinical or coaching seat at a real clinic. */
export function clinicalRoster(): RosterEntry[] {
  return ROSTER.filter(
    (r) => r.location !== "AHQ" && (r.department === "Medical" || r.department === "Coaching"),
  );
}

/**
 * Credentials the roster cannot answer.
 *
 * Rendered on the roster-health screen so the gap is a work item rather than a
 * silent scheduling failure — a null credential is not schedulable, so each of
 * these is a person who cannot be assigned a lab draw until someone says RN or
 * LPN and in which state.
 */
export function unresolvedCredentials(): RosterEntry[] {
  return ROSTER.filter((r) => r.credentialClass === null);
}

/** Seeded ids with a real person mapped onto them. */
export function idMapping(): Record<string, RosterEntry> {
  const out: Record<string, RosterEntry> = {};
  for (const r of ROSTER) if (r.mapsTo) out[r.mapsTo] = r;
  return out;
}
