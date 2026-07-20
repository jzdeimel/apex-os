/**
 * Anniversary moments.
 *
 * Everything on this screen is the member's own record, compared only to their
 * own earlier record. There is no percentile, no cohort, no "you're in the top
 * 12% of members" — a clinic that ranks its patients against each other has
 * turned care into a leaderboard, and the member at the bottom of it is still
 * paying and still trying.
 *
 * The other decision in this file is what may leave the building. See
 * `shareCardFor`: a milestone can be shared, a measurement cannot.
 */

import type { Client } from "@/lib/types";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { membershipForClient } from "@/lib/mock/memberships";
import { formatDate, absolute } from "@/lib/utils";

const NOW = "2026-06-12T09:00:00";
const KG_TO_LB = 2.20462;

export type MilestoneKind = "tenure" | "protocol" | "streak" | "body";

export interface Milestone {
  id: string;
  kind: MilestoneKind;
  title: string;
  /** Member voice. Warm, specific, never congratulatory about a lab value. */
  detail: string;
  achievedOn: string;
  /** Their own before/after on the same measurement, when there is one. */
  metric?: { label: string; from: string; to: string };
  /**
   * Whether this milestone may be put on a shareable card. See shareCardFor —
   * body-composition milestones are deliberately false.
   */
  shareable: boolean;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}

/** Calendar-ish month count. Good enough for anniversaries, stable across runs. */
function monthsBetween(fromIso: string, toIso: string): number {
  return Math.floor(daysBetween(fromIso, toIso) / 30.44);
}

/** ISO date exactly `months` after `fromIso`, for dating the anniversary itself. */
function monthsAfter(fromIso: string, months: number): string {
  const d = absolute(fromIso.slice(0, 10) + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

const TENURE_MARKS = [1, 3, 6, 12, 18, 24, 36];
const PROTOCOL_MARKS = [3, 6, 12, 24];

function tenureLabel(months: number): string {
  if (months >= 12 && months % 12 === 0) {
    const y = months / 12;
    return y === 1 ? "One year" : `${y} years`;
  }
  return months === 1 ? "One month" : `${months} months`;
}

/**
 * Every milestone this member has actually reached, most recent first.
 *
 * Only reached ones. A milestone list that shows what is coming turns a
 * celebration into a progress bar, and a progress bar into an obligation.
 */
export function milestonesFor(client: Client, nowIso: string = NOW): Milestone[] {
  const out: Milestone[] = [];

  // --- tenure ---------------------------------------------------------------
  const tenureMonths = monthsBetween(client.joinedOn, nowIso);
  for (const mark of TENURE_MARKS) {
    if (tenureMonths < mark) continue;
    out.push({
      id: `ms-tenure-${mark}`,
      kind: "tenure",
      title: `${tenureLabel(mark)} with Alpha`,
      detail: `You walked in on ${formatDate(client.joinedOn)} and you're still at it. Most people don't get past the first month.`,
      achievedOn: monthsAfter(client.joinedOn, mark),
      shareable: true,
    });
  }

  // --- protocol / program tenure -------------------------------------------
  for (const program of client.programs) {
    const months = monthsBetween(program.startedOn, nowIso);
    for (const mark of PROTOCOL_MARKS) {
      if (months < mark) continue;
      out.push({
        id: `ms-protocol-${program.name.replace(/\s+/g, "-").toLowerCase()}-${mark}`,
        kind: "protocol",
        title: `${tenureLabel(mark)} on ${program.name}`,
        detail: `Started ${formatDate(program.startedOn)}. Consistency over that stretch is the part that actually compounds.`,
        achievedOn: monthsAfter(program.startedOn, mark),
        // Naming the program names the care. Fine inside the portal, not on a
        // card headed for a group chat.
        shareable: false,
      });
    }
  }

  // --- consistency streaks --------------------------------------------------
  // Drawn from real counters on the record (visits billed, scans taken), never
  // from a self-report we don't hold.
  const membership = membershipForClient(client.id);
  if (membership) {
    for (const mark of [5, 10, 25, 50]) {
      if (membership.visitsYTD < mark) continue;
      out.push({
        id: `ms-visits-${mark}`,
        kind: "streak",
        title: `${mark} visits this year`,
        detail: "Showing up is the only input you fully control. This is the number that made the rest of it possible.",
        achievedOn: nowIso.slice(0, 10),
        shareable: true,
      });
    }
  }

  const scan = getScanForClient(client.id);
  const history = scan?.history ?? [];
  if (history.length >= 3) {
    out.push({
      id: `ms-scans-${history.length}`,
      kind: "streak",
      title: `${history.length} scans on the same machine`,
      detail: "Same device, same conditions each time — which is what makes your before-and-after an actual comparison rather than a vibe.",
      achievedOn: history[history.length - 1].date,
      shareable: true,
    });
  }

  // --- measured body composition -------------------------------------------
  if (history.length >= 2) {
    const first = history[0];
    const last = history[history.length - 1];

    const bfDrop = Math.round((first.bodyFatPct - last.bodyFatPct) * 10) / 10;
    const muscleGain = Math.round((last.skeletalMuscleKg - first.skeletalMuscleKg) * KG_TO_LB * 10) / 10;
    const weightDrop = Math.round((first.weightKg - last.weightKg) * KG_TO_LB * 10) / 10;

    // Thresholds so a rounding wobble never gets celebrated as a result.
    if (bfDrop >= 1) {
      out.push({
        id: "ms-body-bodyfat",
        kind: "body",
        title: `${bfDrop.toFixed(1)} points of body fat gone`,
        detail: "Measured, not estimated — and the number your coach reads before any of the others.",
        achievedOn: last.date,
        metric: {
          label: "Body fat",
          from: `${first.bodyFatPct.toFixed(1)}%`,
          to: `${last.bodyFatPct.toFixed(1)}%`,
        },
        shareable: false,
      });
    }
    if (muscleGain >= 0.5) {
      out.push({
        id: "ms-body-muscle",
        kind: "body",
        title: `Up ${muscleGain.toFixed(1)} lb of muscle`,
        detail: "Keeping lean mass while the fat comes off is the outcome the whole plan is aimed at.",
        achievedOn: last.date,
        metric: {
          label: "Skeletal muscle",
          from: `${(first.skeletalMuscleKg * KG_TO_LB).toFixed(1)} lb`,
          to: `${(last.skeletalMuscleKg * KG_TO_LB).toFixed(1)} lb`,
        },
        shareable: false,
      });
    }
    if (weightDrop >= 5) {
      out.push({
        id: "ms-body-weight",
        kind: "body",
        title: `Down ${weightDrop.toFixed(1)} lb`,
        detail: "The noisiest number here — it moves with hydration and food timing. Body fat is the one worth trusting.",
        achievedOn: last.date,
        metric: {
          label: "Weight",
          from: `${(first.weightKg * KG_TO_LB).toFixed(1)} lb`,
          to: `${(last.weightKg * KG_TO_LB).toFixed(1)} lb`,
        },
        shareable: false,
      });
    }
  }

  return out.sort((a, b) => b.achievedOn.localeCompare(a.achievedOn));
}

/**
 * The one milestone worth putting at the top of a celebration screen.
 *
 * Prefers the biggest round tenure mark, because that is the moment that
 * belongs to the member rather than to the medicine.
 */
export function headlineMilestone(milestones: Milestone[]): Milestone | undefined {
  return (
    milestones.filter((m) => m.kind === "tenure").sort((a, b) => b.achievedOn.localeCompare(a.achievedOn))[0] ??
    milestones[0]
  );
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

export interface ShareCard {
  headline: string;
  subline: string;
  /** Small print on the card. Never a number from the chart. */
  footer: string;
  /** Ready-to-paste caption for whatever they post it to. */
  caption: string;
}

/**
 * The shareable card.
 *
 * WHY THIS FUNCTION REFUSES BODY-COMPOSITION MILESTONES:
 *
 * A member posting "one year at Alpha Health" is marketing — it says something
 * about their commitment and nothing about their body. A member posting "23.4%
 * → 19.2% body fat", or worse a hormone value, has made a health disclosure to
 * an audience that includes their employer, their insurer's data brokers, and
 * whoever screenshots it later. They cannot un-post it, and in the moment they
 * are proud, not calculating.
 *
 * The clinic is the party with the expertise about how that ages, so the
 * clinic carries the restraint. The member can still say whatever they like
 * about their own body — we simply decline to hand them a pre-rendered,
 * clinic-branded asset that does it for them. Refusing to *manufacture* the
 * disclosure is different from forbidding it.
 */
export function shareCardFor(milestone: Milestone, client: Client): ShareCard | null {
  if (!milestone.shareable) return null;

  return {
    headline: milestone.title,
    // First name only. A full name plus a clinic brand is an identity pairing
    // the member did not ask us to publish.
    subline: `${client.firstName} · Alpha Health`,
    footer: formatDate(milestone.achievedOn),
    caption: `${milestone.title}. Still going. @goalphahealth`,
  };
}

/** Milestones a member is offered a share card for. */
export function shareableMilestones(milestones: Milestone[]): Milestone[] {
  return milestones.filter((m) => m.shareable);
}
