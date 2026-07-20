import { staff } from "@/lib/mock/staff";

/**
 * Prescriber credentials — DEA registration and state licence.
 *
 * WHY THIS IS SEEDED SEPARATELY
 * -----------------------------
 * A DEA number and a licence expiry are the credentials that make a controlled
 * substance dispensable, and they are the thing a clinic gets burned on: a
 * lapsed licence that nobody was watching, a DEA registration that expired
 * quietly. MindBody has no concept of them. They live here, keyed by staff id,
 * so the controlled-substance surface can check them the way it will check the
 * real credential store in production.
 *
 * The numbers are FORMAT-VALID but FAKE. A DEA number has a checksum (two
 * letters, then seven digits where the last is a check digit); these follow the
 * shape so the UI reads right, and are deliberately not any real registration.
 *
 * One provider is set to expire soon on purpose — a credential surface with
 * nothing expiring proves nothing. Dr. Elena Park's state licence lapses inside
 * the alert window relative to the demo clock, so the board has something real
 * to flag.
 */

/** The demo clock everything else is pinned to. */
export const CREDENTIAL_NOW = "2026-06-12T09:00:00";

export interface PrescriberCredential {
  staffId: string;
  /** DEA registration number. Format-valid, fake. */
  deaNumber: string;
  deaExpires: string; // ISO date
  /** State medical licence. */
  licenseState: string;
  licenseNumber: string;
  licenseExpires: string; // ISO date
}

/**
 * Only prescribers (Medical role, may approve) carry a DEA. Coaches and desk
 * staff do not, and asking this map for them returns nothing — which is the
 * correct answer, not a gap.
 */
export const prescriberCredentials: Record<string, PrescriberCredential> = {
  "st-001": {
    staffId: "st-001",
    deaNumber: "BV4172538",
    deaExpires: "2027-05-31",
    licenseState: "NC",
    licenseNumber: "NC-MD-58211",
    licenseExpires: "2027-02-28",
  },
  "st-002": {
    staffId: "st-002",
    deaNumber: "BP9930147",
    deaExpires: "2026-09-30",
    licenseState: "NC",
    licenseNumber: "NC-DO-40119",
    // Lapses inside the alert window relative to the demo clock — the board's
    // one real "act on this" case.
    licenseExpires: "2026-07-05",
  },
  "st-003": {
    staffId: "st-003",
    deaNumber: "MO4471092",
    deaExpires: "2027-11-30",
    licenseState: "NC",
    licenseNumber: "NC-NP-77340",
    licenseExpires: "2027-08-31",
  },
  "st-004": {
    staffId: "st-004",
    deaNumber: "BR2216685",
    deaExpires: "2027-01-31",
    licenseState: "SC",
    licenseNumber: "SC-MD-31905",
    licenseExpires: "2027-06-30",
  },
};

export function credentialFor(staffId: string): PrescriberCredential | undefined {
  return prescriberCredentials[staffId];
}

/** Every prescriber who carries a credential, with their staff record. */
export function credentialedPrescribers() {
  return Object.values(prescriberCredentials)
    .map((c) => ({ credential: c, staff: staff.find((s) => s.id === c.staffId) }))
    .filter((x) => x.staff);
}
