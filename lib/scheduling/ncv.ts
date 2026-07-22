import {
  APP,
  NURSING,
  PHYSICIAN,
  type CredentialClass,
} from "@/lib/scheduling/credentials";

/**
 * THE NEW CLIENT VISIT — Stephanie Butler's scheduling requirements, as data.
 *
 * Source: "New Client Visit — Appointment Scheduling Requirements", 2026-07-21.
 *
 * An NCV is ONE booking with THREE components, each requiring a different
 * credential, each with a preference order. It is not three appointments a
 * front desk keeps in step by hand — that arrangement is what produces the
 * failure the spec is written against: a client arrives, the coach is there,
 * and nobody can draw blood.
 *
 * ── THE PRINCIPLE ──────────────────────────────────────────────────────────
 * "Always utilize the lowest appropriate clinical license capable of safely
 * performing each task."
 *
 * Encoded as an ORDERED list of credential tiers per component. The resolver
 * exhausts tier 1 before considering tier 2, so a nurse is used for a draw
 * while a nurse exists, and an NP is used only when one does not. Reversing
 * that — or flattening the tiers into one set — silently consumes provider
 * capacity and is precisely what the current role-based booking engine does.
 *
 * ── WHAT THIS FILE DOES NOT DECIDE ─────────────────────────────────────────
 * Three constraints from the same day's call are NOT in the spec and are NOT
 * encoded here, deliberately, because inventing them would be worse than the
 * gap. They are tracked in docs/AUG7_CUTOVER.md §6 and each needs an answer:
 *
 *   1. CONTINUITY. Matt Chilson: "the H&P has to match the same guy who did the
 *      plan of care." A pure availability resolver breaks that by design.
 *      `preferProviderId` below is the hook for it — populated by the caller,
 *      honoured as a preference, never as a silent hard filter.
 *   2. SEX-BASED ROUTING. "Holly handles all local Myrtle Beach females."
 *      Absent from the spec entirely. Hard rule or convention is unanswered.
 *   3. TELEHEALTH. A remote new client cannot have an in-clinic draw or an
 *      in-person physical. The spec does not cover it; `NCV_COMPONENTS` is
 *      in-person and says so.
 */

export type NcvComponentId = "coach-intro" | "lab-draw" | "physical";

export interface NcvComponentDef {
  id: NcvComponentId;
  label: string;
  /** Why this component exists, in the spec's own terms. */
  purpose: string;
  /**
   * Credential tiers in preference order. Tier 0 is "preferred"; the resolver
   * only reaches tier 1 when tier 0 has nobody available.
   */
  tiers: readonly (readonly CredentialClass[])[];
  durationMin: number;
  /**
   * When false, there is no fallback at all — the component simply cannot
   * happen without this credential. Only the coach intro is like this, and the
   * spec says so twice ("Must always be completed by a Performance Coach. No
   * substitutions.").
   */
  substitutable: boolean;
  /** Order within the visit. The spec's sequence is not negotiable. */
  sequence: number;
}

export const NCV_COMPONENTS: readonly NcvComponentDef[] = [
  {
    id: "coach-intro",
    label: "Coach introduction",
    purpose:
      "Introduce the client to Alpha Health, review the visit flow, begin the relationship, and confirm key elements of the medical history intake form.",
    tiers: [["Coach"]],
    durationMin: 30,
    substitutable: false,
    sequence: 1,
  },
  {
    id: "lab-draw",
    label: "Lab draw",
    purpose: "Obtain required laboratory specimens prior to the provider evaluation.",
    // Priority 1 nursing, priority 2 advanced practice. This ordering IS the
    // "preserve provider availability" rationale in the spec.
    tiers: [NURSING, APP],
    durationMin: 20,
    substitutable: true,
    sequence: 2,
  },
  {
    id: "physical",
    label: "Physical examination",
    purpose:
      "History review, physical examination, review of laboratory indications, medical assessment and initial treatment planning.",
    // Priority 1 advanced practice, priority 2 physician — so physicians stay
    // available for higher-acuity visits and supervision.
    tiers: [APP, PHYSICIAN],
    durationMin: 45,
    substitutable: true,
    sequence: 3,
  },
] as const;

export const NCV_TOTAL_MINUTES = NCV_COMPONENTS.reduce((n, c) => n + c.durationMin, 0);

/* -------------------------------------------------------------------------- */
/* Resolution                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A candidate the caller has already established is on shift and unbooked.
 *
 * This module does NOT read calendars. Availability is `lib/booking/
 * availability.ts`'s job and it already enforces the rule that matters — never
 * offer a slot that does not exist. Keeping the credential decision pure means
 * it can be exercised against a roster without a clock, which is what makes the
 * priority order testable.
 */
export interface NcvCandidate {
  staffId: string;
  name: string;
  credential: CredentialClass | null;
  /** Minutes-from-midnight windows this person is free at the location. */
  freeWindows: ReadonlyArray<{ startMin: number; endMin: number }>;
}

export interface NcvAssignment {
  component: NcvComponentId;
  staffId: string;
  staffName: string;
  credential: CredentialClass;
  /** Which preference tier supplied them. 0 = preferred. */
  tier: number;
  startMin: number;
  endMin: number;
}

export type NcvResolution =
  | { ok: true; assignments: NcvAssignment[]; teamSize: number; endMin: number }
  | {
      ok: false;
      /** The first component that could not be filled. */
      blockedOn: NcvComponentId;
      /** Every credential that would have unblocked it, in preference order. */
      wouldNeed: CredentialClass[];
      /** What was assigned before the block, for a partial-booking message. */
      partial: NcvAssignment[];
    };

/**
 * Assign a team to a New Client Visit starting at `startMin`.
 *
 * ── THE TWO-TEAM-MEMBER MODEL IS A FIRST-CLASS CASE ────────────────────────
 * The spec describes it plainly: when no nurse is available, the NP/PA performs
 * BOTH the lab draw and the physical, and the visit runs with two people
 * instead of three. So the same person may hold two components — but must not
 * be double-booked against themselves, which is why assignment consumes their
 * window as it goes. A resolver that treats "already assigned" as "unavailable"
 * cannot express the two-person model at all; one that ignores the overlap
 * books someone in two rooms at once.
 *
 * ── FAILURE IS INFORMATIVE, NOT SILENT ─────────────────────────────────────
 * When a component cannot be filled the result names WHICH one and WHAT
 * credential would fix it. "No availability" is useless to a front desk;
 * "Raleigh has no nurse and no NP after 2pm" is actionable, and it is what
 * `/schedule`'s coverage view renders. Raleigh runs one coach, one nurse and
 * one NP — this path is not hypothetical there.
 */
export function resolveNcvTeam(
  candidates: readonly NcvCandidate[],
  startMin: number,
  options: {
    /**
     * Continuity hint. When this staff member is credentialed and free for a
     * component, they are preferred within their tier. Never used to exclude —
     * see the docblock; continuity vs availability is an open question and this
     * code must not decide it by silently refusing.
     */
    preferStaffId?: string;
    /** Minutes between components. Rooming, walking, notes. */
    gapMin?: number;
  } = {},
): NcvResolution {
  const gap = options.gapMin ?? 0;
  const assignments: NcvAssignment[] = [];

  // Working copy of each person's free time, consumed as components are placed.
  const remaining = new Map<string, Array<{ startMin: number; endMin: number }>>();
  for (const c of candidates) remaining.set(c.staffId, c.freeWindows.map((w) => ({ ...w })));

  let cursor = startMin;

  for (const component of [...NCV_COMPONENTS].sort((a, b) => a.sequence - b.sequence)) {
    const need = component.durationMin;
    let placed: NcvAssignment | null = null;

    for (let tier = 0; tier < component.tiers.length && !placed; tier++) {
      const accepted = component.tiers[tier];

      const eligible = candidates.filter(
        (c) => c.credential !== null && accepted.includes(c.credential),
      );

      // Continuity preference applies WITHIN a tier, never across tiers — a
      // preferred physician does not outrank an available NP, because the
      // "lowest appropriate licence" rule is the spec's and continuity is not.
      const ordered = [...eligible].sort((a, b) => {
        if (options.preferStaffId) {
          if (a.staffId === options.preferStaffId) return -1;
          if (b.staffId === options.preferStaffId) return 1;
        }
        return 0;
      });

      for (const candidate of ordered) {
        const windows = remaining.get(candidate.staffId) ?? [];
        const window = windows.find((w) => w.startMin <= cursor && w.endMin >= cursor + need);
        if (!window) continue;

        placed = {
          component: component.id,
          staffId: candidate.staffId,
          staffName: candidate.name,
          credential: candidate.credential!,
          tier,
          startMin: cursor,
          endMin: cursor + need,
        };

        // Consume the time. This is what lets one NP hold two components
        // without being booked twice in the same minutes.
        window.startMin = cursor + need;
        break;
      }
    }

    if (!placed) {
      return {
        ok: false,
        blockedOn: component.id,
        wouldNeed: component.tiers.flatMap((t) => [...t]),
        partial: assignments,
      };
    }

    assignments.push(placed);
    cursor = placed.endMin + gap;
  }

  const teamSize = new Set(assignments.map((a) => a.staffId)).size;
  return {
    ok: true,
    assignments,
    teamSize,
    endMin: assignments[assignments.length - 1].endMin,
  };
}

/**
 * Can this location run an NCV at all today, ignoring the clock?
 *
 * A pure credential-coverage check, separate from availability, because the two
 * failures need different words. "Nobody is free until Thursday" is a schedule
 * problem the desk can work around; "this location has no one who can perform a
 * physical" is a staffing problem only the owner can fix, and it should never
 * be discovered by a patient who already drove there.
 */
export function ncvCoverageGaps(
  credentialsPresent: readonly CredentialClass[],
): Array<{ component: NcvComponentId; label: string; wouldNeed: CredentialClass[] }> {
  const gaps: Array<{ component: NcvComponentId; label: string; wouldNeed: CredentialClass[] }> = [];
  for (const component of NCV_COMPONENTS) {
    const covered = component.tiers.some((tier) =>
      tier.some((c) => credentialsPresent.includes(c)),
    );
    if (!covered) {
      gaps.push({
        component: component.id,
        label: component.label,
        wouldNeed: component.tiers.flatMap((t) => [...t]),
      });
    }
  }
  return gaps;
}
