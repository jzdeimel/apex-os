import type { Subscription } from "@/lib/subscriptions/types";
import { subscriptionsForClient } from "@/lib/mock/subscriptions";
import { addDays, dayOf, daysBetween, refillTiming } from "@/lib/subscriptions/engine";
import { catalogItem } from "@/lib/catalog/catalog";
import { formatDate, absolute } from "@/lib/utils";

/**
 * REFILL RUNWAY — the member-facing half of the subscription engine.
 *
 * Running out is the number one reason a protocol lapses. Not side effects, not
 * cost, not motivation: the vial was empty on a Tuesday, the member waited to
 * see whether anyone would call, nobody did, and three weeks later they are a
 * churn statistic with a clinical setback attached.
 *
 * The clinic already knows this is coming. `Subscription.nextRefillOn` is a
 * date sitting in the database weeks ahead of the problem. The audited system
 * simply never showed it to the person it happens to.
 *
 * ── WHY THIS MODULE DOES NO CADENCE MATHS ─────────────────────────────────
 * Every date function here is imported from lib/subscriptions/engine. That is
 * deliberate and it is load-bearing: the single worst defect in the audited
 * refill system was a second, subtly different implementation of "when is this
 * next due", and the fix (`rollFrom`, which rolls from the scheduled date
 * rather than from today) only holds if there is exactly one implementation.
 * A member-facing countdown that disagrees with the staff board by three days
 * is not a cosmetic bug — it is the same class of defect wearing a friendlier
 * font.
 */

const NOW = "2026-06-12T09:00:00";

/**
 * Transit time for a shipped refill.
 *
 * MedSource picks same-day and ships ground; three days is the realistic door
 * time. It matters here because it sets the honest definition of "at risk": a
 * member with two days of supply and a three-day shipment is already going to
 * miss, however comfortable the countdown looks.
 */
export const SHIP_TRANSIT_DAYS = 3;

/**
 * Format a DATE-ONLY string for display.
 *
 * `formatDate` from lib/utils takes the string straight to `new Date`, and
 * `absolute("2026-06-12")` is parsed as UTC midnight — which renders as 11 June
 * for anyone west of Greenwich. Every date in this module is date-only, so
 * anchoring to midday makes the displayed day match the stored day in every
 * timezone the clinic operates in.
 */
export function formatDay(day: string): string {
  return formatDate(`${dayOf(day)}T12:00:00`);
}

/** Below this, we say something. Above it, we stay out of the way. */
export const REORDER_SOON_DAYS = 10;

export type RunwayStatus = "comfortable" | "reorder soon" | "at risk" | "out";

export interface RunwayLine {
  subscriptionId: string;
  /**
   * The product name from the catalog, exactly as it appears on the box the
   * member receives. It is a product name, not a dosing instruction — this
   * screen is about supply, and calling a vial something different from what is
   * printed on it is its own kind of unsafe.
   */
  itemName: string;
  sku: string;
  /** Whole days of supply left. Negative once the member has run out. */
  daysLeft: number;
  status: RunwayStatus;
  /** "11 days of protocol left." — the sentence, ready to render. */
  memberLine: string;
  /** What happens on its own, and when. The answer to "do I need to do anything?" */
  automatic: string;
  cadenceDays: number;
  nextRefillOn: string;
  /** When it should land, once it goes out. Same day for a clinic pickup. */
  expectedArrivalOn: string;
  shipping: "ship" | "pickup";
  /** Present when something is blocking the refill. Populated from the record. */
  held?: { reason: string; amountCents?: number };
  /** Staff-facing phrasing from the engine, kept for the ledger row. */
  timing: string;
  /** Whether the reorder affordance should do anything. */
  canReorder: boolean;
}

export interface Runway {
  clientId: string;
  asOf: string;
  /** Tightest first — the thing about to run out is the thing to read first. */
  lines: RunwayLine[];
  /** The worst status across every line. Drives the page-level banner. */
  worst?: RunwayStatus;
  headline: string;
}

const STATUS_RANK: Record<RunwayStatus, number> = {
  out: 0,
  "at risk": 1,
  "reorder soon": 2,
  comfortable: 3,
};

export const STATUS_LABEL: Record<RunwayStatus, string> = {
  out: "Out",
  "at risk": "At risk",
  "reorder soon": "Reorder soon",
  comfortable: "Comfortable",
};

/**
 * Days of supply, derived rather than stored.
 *
 * A refill schedule IS a supply schedule: the member received one cadence worth
 * of product at the last placement, so the day the next one is due is the day
 * the last one runs out. We do not invent a separate "units remaining" number —
 * there is no such field, and guessing one would be a fabricated clinical fact
 * dressed up as a countdown.
 */
function daysOfSupply(sub: Subscription, nowIso: string): number {
  return daysBetween(nowIso, sub.nextRefillOn);
}

function statusFor(sub: Subscription, daysLeft: number): RunwayStatus {
  // A hold is never "comfortable", however much runway is left: nothing is
  // going to ship until a human clears it.
  if (sub.heldReason) return daysLeft < 0 ? "out" : "at risk";
  // Zero is "due today", not "gone". The refill is scheduled for today and the
  // member still has today's supply — calling that "out" is a false alarm, and
  // false alarms are how a member learns to ignore a real one.
  if (daysLeft < 0) return "out";
  if (daysLeft <= SHIP_TRANSIT_DAYS) return "at risk";
  if (daysLeft <= REORDER_SOON_DAYS) return "reorder soon";
  return "comfortable";
}

function memberLineFor(daysLeft: number): string {
  if (daysLeft > 1) return `${daysLeft} days of protocol left.`;
  if (daysLeft === 1) return "1 day of protocol left.";
  if (daysLeft === 0) return "Today is your last day of this one.";
  if (daysLeft === -1) return "You ran out yesterday.";
  return `You ran out ${Math.abs(daysLeft)} days ago.`;
}

function automaticFor(sub: Subscription, daysLeft: number, arrivesOn: string): string {
  if (sub.heldReason) {
    return `This one is paused, so nothing ships until it is sorted: ${sub.heldReason} Call the clinic and it is usually a two-minute fix.`;
  }
  if (daysLeft >= 0) {
    const goes = formatDay(sub.nextRefillOn);
    return sub.shipping === "pickup"
      ? `It is set aside for pickup on ${goes}. You do not need to order it.`
      : `It goes out on ${goes} on its own and should reach you around ${formatDay(arrivesOn)}. You do not need to do anything.`;
  }
  return sub.shipping === "pickup"
    ? "This was due and has not been picked up. Tap reorder and we will have it waiting."
    : "This was due and has not gone out. Tap reorder and we will get it moving today.";
}

/**
 * Runway for one member.
 *
 * Only Active subscriptions appear. A paused or ended subscription has no
 * runway — showing "0 days left" against something the member deliberately
 * stopped is a false alarm, and false alarms are how a member learns to ignore
 * a real one.
 */
export function runwayFor(clientId: string, nowIso: string = NOW): Runway {
  const lines: RunwayLine[] = subscriptionsForClient(clientId)
    .filter((s) => s.status === "Active")
    .map((sub) => {
      const item = catalogItem(sub.sku);
      const daysLeft = daysOfSupply(sub, nowIso);
      const status = statusFor(sub, daysLeft);
      const arrivesOn =
        sub.shipping === "pickup"
          ? sub.nextRefillOn
          : addDays(sub.nextRefillOn, SHIP_TRANSIT_DAYS);

      return {
        subscriptionId: sub.id,
        // A SKU the catalog no longer knows is a real failure, not a blank
        // cell — say so rather than rendering an empty name.
        itemName: item?.name ?? `${sub.sku} — ask your coach about this one`,
        sku: sub.sku,
        daysLeft,
        status,
        memberLine: memberLineFor(daysLeft),
        automatic: automaticFor(sub, daysLeft, arrivesOn),
        cadenceDays: sub.cadenceDays,
        nextRefillOn: sub.nextRefillOn,
        expectedArrivalOn: arrivesOn,
        shipping: sub.shipping,
        held: sub.heldReason
          ? { reason: sub.heldReason, amountCents: sub.holdAmountCents }
          : undefined,
        timing: refillTiming(sub, nowIso),
        canReorder: !sub.heldReason,
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const worst = lines.reduce<RunwayStatus | undefined>(
    (acc, l) => (acc === undefined || STATUS_RANK[l.status] < STATUS_RANK[acc] ? l.status : acc),
    undefined,
  );

  return {
    clientId,
    asOf: dayOf(nowIso),
    lines,
    worst,
    headline: headlineFor(lines, worst),
  };
}

function headlineFor(lines: RunwayLine[], worst?: RunwayStatus): string {
  if (lines.length === 0) {
    return "You are not on an auto-refill right now, so there is nothing here to run out.";
  }
  const tightest = lines[0];
  if (worst === "out") {
    return `${tightest.itemName} has run out. Reorder it here and we will chase it today.`;
  }
  if (worst === "at risk") {
    return tightest.daysLeft === 0
      ? `${tightest.itemName} is due today. It goes out on its own, but there is no slack left in it.`
      : `${tightest.itemName} is cutting it close — ${tightest.daysLeft} day${tightest.daysLeft === 1 ? "" : "s"} left and about ${SHIP_TRANSIT_DAYS} days in transit.`;
  }
  if (worst === "reorder soon") {
    return `${tightest.itemName} is your next one, with ${tightest.daysLeft} days left. It ships on its own.`;
  }
  return `Everything is covered. Your closest refill is ${tightest.itemName}, ${tightest.daysLeft} days out.`;
}

/** The single tightest line, when the caller only has room for one. */
export function tightestLine(clientId: string, nowIso: string = NOW): RunwayLine | undefined {
  return runwayFor(clientId, nowIso).lines[0];
}
