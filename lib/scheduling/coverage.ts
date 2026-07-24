import { staff } from "@/lib/mock/staff";
import { locations } from "@/lib/mock/locations";
import { ncvCoverageGaps, NCV_COMPONENTS, type NcvComponentId } from "@/lib/scheduling/ncv";
import { CREDENTIAL_LABEL, type CredentialClass } from "@/lib/scheduling/credentials";
import type { LocationId } from "@/lib/types";

/**
 * CAN THIS LOCATION RUN A NEW CLIENT VISIT?
 *
 * WHY THIS IS A SCREEN AND NOT A REPORT
 * -------------------------------------
 * Stephanie Butler's spec requires a coach, someone who can draw blood, and a
 * provider — and the coach intro has no substitution at all. Run that against
 * the real roster and two of four clinics are one absence away from being
 * unable to see a new patient:
 *
 *   Raleigh        — one coach (Zac Duffy), one nurse, one NP, NO physician.
 *   Southern Pines — one coach (Shane James), one PART-TIME nurse, NP + PA.
 *
 * Today that failure is discovered by a patient who already drove there. The
 * whole value of this module is moving the discovery to the moment someone
 * tries to book, and naming WHICH credential is missing so it is actionable by
 * the person who can fix it.
 *
 * ── STRUCTURAL, NOT SCHEDULE-BASED ─────────────────────────────────────────
 * This asks "does anyone here hold the licence", not "is anyone free at 2pm".
 * They are different failures with different owners: an empty calendar is
 * something the front desk works around, an empty credential is something only
 * the owner can fix by hiring. Conflating them buries a staffing problem inside
 * a scheduling screen. Availability stays in lib/booking/availability.ts.
 */

export interface LocationCoverage {
  locationId: LocationId;
  name: string;
  /** False when at least one NCV component has nobody qualified. */
  canRunNcv: boolean;
  gaps: Array<{ component: NcvComponentId; label: string; wouldNeed: string[] }>;
  /**
   * Components covered by exactly ONE person. Not a gap today, but the visit
   * stops the day that person is out — and for the coach intro there is no
   * substitution at all, so a single coach is a single point of failure by
   * design rather than by accident.
   */
  singlePoints: Array<{ component: NcvComponentId; label: string; only: string }>;
  /** Credentials present at this location, for the detail panel. */
  credentials: CredentialClass[];
}

export function coverageFor(locationId: LocationId): LocationCoverage {
  const here = staff.filter(
    (s) => s.locationIds.includes(locationId) && s.credentialClass !== null,
  );
  const credentials = [...new Set(here.map((s) => s.credentialClass!))];

  const gaps = ncvCoverageGaps(credentials).map((g) => ({
    component: g.component,
    label: g.label,
    wouldNeed: g.wouldNeed.map((c) => CREDENTIAL_LABEL[c]),
  }));

  const singlePoints: LocationCoverage["singlePoints"] = [];
  for (const component of NCV_COMPONENTS) {
    // Everyone qualified at ANY tier — a component with one nurse and one NP is
    // not a single point of failure even though tier 1 has only one person.
    const qualified = here.filter((s) =>
      component.tiers.some((tier) => tier.includes(s.credentialClass!)),
    );
    if (qualified.length === 1) {
      singlePoints.push({
        component: component.id,
        label: component.label,
        only: qualified[0].name,
      });
    }
  }

  const location = locations.find((l) => l.id === locationId);

  return {
    locationId,
    name: location?.short ?? locationId,
    canRunNcv: gaps.length === 0,
    gaps,
    singlePoints,
    credentials,
  };
}

/**
 * Coverage for every clinic.
 *
 * Telehealth is EXCLUDED and that is the finding, not an oversight. Nobody on
 * the roster is located there — Jerry Cattelane is the "Telehealth Physician"
 * and sits at Myrtle Beach; Marc McCully, the telehealth coach, sits at Myrtle
 * Beach. Telehealth is a patient panel served by clinic staff, not a place with
 * a roster, so asking whether it can staff an in-person lab draw is a category
 * error. The telehealth NCV variant is genuinely unspecified — see
 * docs/AUG7_CUTOVER.md §5.2.
 */
export function allCoverage(): LocationCoverage[] {
  return locations
    .filter((l) => l.type === "clinic")
    .map((l) => coverageFor(l.id));
}
