import type { LocationId } from "@/lib/types";
import type { MerchantAccountId } from "@/lib/payments/port";

/**
 * CLINIC → MERCHANT ACCOUNT.
 *
 * Four Clover merchant accounts were approved on 2026-07-21, one per clinic, so
 * that a patient's service is billed by the clinic that delivered it. This
 * module is the only place that mapping lives.
 *
 * ── IT RESOLVES FROM THE PATIENT'S HOME CLINIC ─────────────────────────────
 * Not from the appointment's location, and not from where the coach happened to
 * be sitting. A Raleigh member taking a telehealth follow-up is a Raleigh
 * member; before `Appointment.modality` existed, that visit would have been
 * filed at the "telehealth location" and billed to a clinic that never saw
 * them. The failure is silent — the charge succeeds, the money just lands in
 * the wrong account, and it surfaces at month-end reconciliation or not at all.
 *
 * ── UNMAPPED IS AN ERROR, NEVER A FALLBACK ─────────────────────────────────
 * There is no default merchant. A default would mean a new clinic opens, nobody
 * adds its account, and its revenue quietly accrues to whichever clinic is
 * first in the list. `merchantFor` throws instead — a refused charge is a phone
 * call; a misrouted one is a reconciliation nobody can unpick six months later.
 *
 * ── IDs COME FROM CONFIGURATION, NOT FROM THE REPO ─────────────────────────
 * A merchant account id is not a secret, but it is environment-specific and it
 * changes between sandbox and production. Binding it to the image would mean a
 * deploy to correct a billing route.
 */

/** `APEX_MERCHANT_<LOCATION>` with the location id upper-cased and de-hyphenated. */
function envKeyFor(locationId: LocationId): string {
  return `APEX_MERCHANT_${locationId.toUpperCase().replace(/-/g, "_")}`;
}

export interface MerchantBinding {
  locationId: LocationId;
  locationName: string;
  merchantAccountId: MerchantAccountId | null;
  envKey: string;
}

/**
 * Deployment configuration keys, not clinic records.
 *
 * This reports whether each approved merchant binding is present. Patient
 * locations and activity still come from PostgreSQL; billing code never reads
 * the seeded location fixture.
 */
const MERCHANT_CONFIG_LOCATIONS: ReadonlyArray<{
  id: Exclude<LocationId, "telehealth">;
  name: string;
}> = [
  { id: "raleigh", name: "Raleigh" },
  { id: "raleigh-boutique", name: "Raleigh Boutique" },
  { id: "southern-pines", name: "Southern Pines" },
  { id: "myrtle-beach", name: "Myrtle Beach" },
];

/** Every approved clinic merchant key and whether it is configured. */
export function merchantBindings(): MerchantBinding[] {
  return MERCHANT_CONFIG_LOCATIONS.map((location) => {
    const envKey = envKeyFor(location.id);
    return {
      locationId: location.id,
      locationName: location.name,
      merchantAccountId: process.env[envKey] ?? null,
      envKey,
    };
  });
}

/**
 * The merchant account for a patient's home clinic.
 *
 * Throws when unmapped. Callers must not catch this and continue — see the
 * docblock; there is no safe way to guess which clinic should be paid.
 */
export function merchantFor(homeLocationId: LocationId): MerchantAccountId {
  const envKey = envKeyFor(homeLocationId);
  const id = process.env[envKey];
  if (!id) {
    throw new Error(
      `No merchant account configured for ${homeLocationId}. Set ${envKey} as a Container ` +
        `App secret. Apex will not charge a card without knowing which clinic is being paid — ` +
        `a default here would route this clinic's revenue to another one, silently.`,
    );
  }
  return id;
}

/** True when every clinic has an account. The settings screen reports on this. */
export function allMerchantsConfigured(): boolean {
  return merchantBindings().every((b) => b.merchantAccountId !== null);
}

/**
 * WHICH CLINIC BILLS A TELEHEALTH-PANEL PATIENT?
 *
 * A gap that only appears once `merchantFor` exists. Paul Kennard described the
 * telehealth panel as its own clinic — "categorised as a telehealth patient as
 * though it is its own location, with its own coach who is Mark" — and the
 * roster confirms the staffing side of it: nobody sits at telehealth, Marc
 * McCully and Jerry Cattelane both work out of Myrtle Beach.
 *
 * But a panel is not a merchant account. There are four Clover accounts and
 * they belong to four physical clinics. So a telehealth patient's money has to
 * land somewhere, and nothing in the requirements says where.
 *
 * This does NOT guess. `APEX_TELEHEALTH_BILLS_TO` names the clinic, and until
 * someone sets it, a telehealth patient cannot be charged — which is the
 * correct failure. The alternative is picking a clinic on their behalf and
 * quietly crediting it with a panel's revenue, and nobody would notice until
 * the four clinics compared their numbers.
 */
export function billingLocationFor(homeLocationId: LocationId): LocationId {
  if (homeLocationId !== "telehealth") return homeLocationId;

  const configured = process.env.APEX_TELEHEALTH_BILLS_TO as LocationId | undefined;
  if (!configured) {
    throw new Error(
      "Telehealth patients have no clinic of their own and no merchant account. Set " +
        "APEX_TELEHEALTH_BILLS_TO to the clinic that should be credited (the roster " +
        "suggests Myrtle Beach — Marc McCully and Jerry Cattelane both work from there) " +
        "and confirm it with the owner. Apex will not pick a clinic to pay on its own.",
    );
  }
  if (configured === "telehealth") {
    throw new Error("APEX_TELEHEALTH_BILLS_TO must name a physical clinic, not telehealth itself.");
  }
  return configured;
}

/** The merchant account for a patient, resolving the telehealth panel first. */
export function merchantForPatient(homeLocationId: LocationId): MerchantAccountId {
  return merchantFor(billingLocationFor(homeLocationId));
}
