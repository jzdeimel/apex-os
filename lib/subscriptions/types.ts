import type { LocationId } from "@/lib/types";

/**
 * RECURRING REFILLS.
 *
 * A hormone or GLP-1 protocol is not a purchase, it is a schedule. The member
 * runs out on a known day and the clinic either got ahead of it or did not.
 * Apex models that schedule as a first-class record instead of as a coach's
 * calendar reminder.
 *
 * WHAT WE KEPT FROM THE AUDITED SYSTEM (credit where it is due):
 *   Its refill job did ADVANCE-BEFORE-PLACE with an optimistic claim, and that
 *   is genuinely the correct pattern — see `claimRefill` in ./engine.ts. It is
 *   the single best piece of engineering in that codebase and we copied it
 *   deliberately.
 *
 * WHAT WE FIXED:
 *   1. CADENCE ROLLED FROM "TODAY", NOT FROM THE SCHEDULED DATE. If a refill was
 *      held for three days over a payment problem, the next date became
 *      today + cadence, permanently shifting the member's schedule later. Over a
 *      year a 28-day protocol drifted into a 31-day one and members ran dry.
 *      Here the roll is always from `nextRefillOn`. See `rollFrom`.
 *   2. AUTO-REFILLS WERE INVISIBLE. The job placed fulfillment records but wrote
 *      no purchase row and no staff-facing event, so refill revenue was missing
 *      from every report and a coach could not tell a member what had shipped.
 *      Here a refill produces a real Order AND a ledger draft, both required.
 *   3. A HOLD HAD NO REASON. `heldReason` and `holdAmountCents` are on the
 *      record, so the subscriptions board can say *why* something is stuck.
 */

export type SubscriptionStatus = "Active" | "Paused" | "Lapsed" | "Ended";

export interface Subscription {
  id: string;
  clientId: string;
  /**
   * Catalog SKU, not a free-text product name. If the item is retired the
   * refill fails loudly at validation rather than shipping something else.
   */
  catalogItemId: string;
  /** Days between refills. The member's actual protocol interval. */
  cadenceDays: number;
  /** ISO date the next refill is due. The claim key — see claimRefill. */
  nextRefillOn: string;
  status: SubscriptionStatus;
  /** ISO date the last refill order was actually created. */
  lastPlacedOn?: string;
  /** Price at the time of enrollment, integer cents. Honoured over list price. */
  priceCents: number;
  locationId: LocationId;
  shipping: "ship" | "pickup";
  /** Why this subscription is not currently refilling. Required when held. */
  heldReason?: string;
  /** Outstanding balance blocking the refill, integer cents. */
  holdAmountCents?: number;
  startedOn: string;
  /** Count of refills successfully placed — the audit trail of a schedule. */
  refillsPlaced: number;
}

/**
 * The result of an optimistic claim.
 *
 * `claimed: false` is not an error. It is the normal, expected outcome when two
 * workers race for the same subscription, and returning it as data rather than
 * throwing is what makes the caller handle it correctly.
 */
export interface RefillClaim {
  claimed: boolean;
  /** The subscription with `nextRefillOn` already advanced, when claimed. */
  next: Subscription;
  /** Why the claim failed, when it did. Safe to log or surface. */
  reason?: string;
}
