import { absolute } from "@/lib/utils";
import type { Membership } from "@/lib/types";
import type { Order } from "@/lib/orders/types";
import type { LedgerDraft } from "@/lib/trace/ledger";
import type { Subscription, RefillClaim, SubscriptionStatus } from "@/lib/subscriptions/types";
import { catalogItem } from "@/lib/catalog/catalog";
import {
  placeOrder,
  validateOrder,
  type OrderProblem,
  type PlaceOrderInput,
  type PlacingActor,
  type PriceBreakdown,
} from "@/lib/orders/place";

/**
 * THE REFILL ENGINE.
 *
 * Pure. No timers, no network, no store writes. It answers "what is due", it
 * claims a due subscription safely, and it turns a claim into a real Order plus
 * the ledger row that must accompany it. Scheduling and persistence live above
 * this module; correctness lives here.
 */

const NOW = "2026-06-12T09:00:00";

// ---------------------------------------------------------------------------
// Date arithmetic (date-only, deterministic, no argless `new Date()`)
// ---------------------------------------------------------------------------

/** "2026-06-12T09:00:00" or "2026-06-12" → "2026-06-12". */
export function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

function toUtcDay(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcDay(ms: number): string {
  const d = absolute(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(day: string, n: number): string {
  return fromUtcDay(toUtcDay(dayOf(day)) + n * DAY_MS);
}

/** Whole days from `a` to `b`. Negative when `b` is in the past. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcDay(dayOf(b)) - toUtcDay(dayOf(a))) / DAY_MS);
}

/**
 * THE FIX. Roll the schedule forward FROM THE SCHEDULED DATE, never from today.
 *
 * The audited job computed `next = today + cadence`. A refill held three days
 * for a declined card moved the member's whole schedule three days later, every
 * time, forever. Members on a 28-day testosterone protocol drifted to 31+ days
 * and ran out — a real clinical defect produced by one line of date math.
 *
 * Rolling from `scheduled` preserves the PHASE of the schedule. When a hold has
 * pushed the scheduled date well into the past we advance by whole cadence
 * multiples until it is in the future, so we neither drift nor stack up a
 * backlog of missed refills the member would be billed for at once.
 */
export function rollFrom(scheduled: string, cadenceDays: number, nowIso: string = NOW): string {
  const cadence = Math.max(1, Math.floor(cadenceDays));
  const today = dayOf(nowIso);
  let next = addDays(scheduled, cadence);
  // Whole-multiple catch-up. Bounded so a corrupt record can't spin forever.
  let guard = 0;
  while (daysBetween(today, next) <= 0 && guard < 400) {
    next = addDays(next, cadence);
    guard += 1;
  }
  return next;
}

// ---------------------------------------------------------------------------
// The optimistic claim — KEPT FROM THE AUDITED SYSTEM, ON PURPOSE
// ---------------------------------------------------------------------------

/**
 * ADVANCE BEFORE PLACE, with a compare-and-set on `nextRefillOn`.
 *
 * This pattern is lifted verbatim in spirit from the system Apex replaces. It
 * is the one piece of that codebase that was unambiguously right, and it is
 * worth stating exactly why:
 *
 *   A refill job may run twice — a retry, a second worker, a redeployed
 *   container replaying a queue. If it PLACES the order and THEN advances the
 *   schedule, a crash in between ships a controlled substance twice. Placing is
 *   irreversible; advancing is not. So we advance FIRST, and we advance with a
 *   conditional write: the update only lands if `nextRefillOn` is still the
 *   value we read. Exactly one worker wins that write; every other worker sees
 *   `claimed: false` and does nothing.
 *
 *   In Postgres this is literally
 *     UPDATE subscriptions SET next_refill_on = $new
 *      WHERE id = $id AND next_refill_on = $expected
 *   and the claim succeeded if rowCount === 1. `readCurrent` below stands in for
 *   that row read; the demo store is an array, the semantics are identical.
 *
 * The worst case is now a schedule advanced with no order placed — a MISSED
 * refill, visible on the board and trivially re-placeable by a coach. That is a
 * strictly better failure than a duplicate shipment.
 */
export function claimRefill(
  sub: Subscription,
  nowIso: string = NOW,
  readCurrent?: (id: string) => Subscription | undefined,
): RefillClaim {
  if (sub.status !== "Active") {
    return {
      claimed: false,
      next: sub,
      reason: `Subscription is ${sub.status}; only Active subscriptions refill.`,
    };
  }

  if (sub.heldReason) {
    return {
      claimed: false,
      next: sub,
      reason: `On hold: ${sub.heldReason}`,
    };
  }

  if (daysBetween(nowIso, sub.nextRefillOn) > 0) {
    return {
      claimed: false,
      next: sub,
      reason: `Not due until ${sub.nextRefillOn}.`,
    };
  }

  // The compare-and-set. `sub.nextRefillOn` is the value we read; if the stored
  // value has moved, another worker already claimed this cycle.
  const current = readCurrent ? readCurrent(sub.id) : sub;
  if (!current) {
    return { claimed: false, next: sub, reason: "Subscription no longer exists." };
  }
  if (current.nextRefillOn !== sub.nextRefillOn) {
    return {
      claimed: false,
      next: current,
      reason: "Already claimed by another run — this cycle is spoken for.",
    };
  }

  return {
    claimed: true,
    next: {
      ...current,
      // Rolled from the SCHEDULED date, not from today. See rollFrom.
      nextRefillOn: rollFrom(current.nextRefillOn, current.cadenceDays, nowIso),
      lastPlacedOn: dayOf(nowIso),
      refillsPlaced: current.refillsPlaced + 1,
    },
  };
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Due now: Active, not held, scheduled today or earlier. Most overdue first. */
export function dueRefills(subs: Subscription[], nowIso: string = NOW): Subscription[] {
  return subs
    .filter((s) => s.status === "Active" && !s.heldReason && daysBetween(nowIso, s.nextRefillOn) <= 0)
    .sort((a, b) => (a.nextRefillOn < b.nextRefillOn ? -1 : 1));
}

/** Held: Active and due, but blocked. These are revenue sitting still. */
export function heldRefills(subs: Subscription[], nowIso: string = NOW): Subscription[] {
  return subs
    .filter((s) => s.status === "Active" && !!s.heldReason)
    .sort((a, b) => (a.nextRefillOn < b.nextRefillOn ? -1 : 1));
}

/** Coming up inside `days`, soonest first. Excludes anything already due. */
export function upcomingRefills(
  subs: Subscription[],
  days = 30,
  nowIso: string = NOW,
): Subscription[] {
  return subs
    .filter((s) => {
      if (s.status !== "Active" || s.heldReason) return false;
      const d = daysBetween(nowIso, s.nextRefillOn);
      return d > 0 && d <= days;
    })
    .sort((a, b) => (a.nextRefillOn < b.nextRefillOn ? -1 : 1));
}

export function inactiveSubs(subs: Subscription[]): Subscription[] {
  const rank: Record<SubscriptionStatus, number> = { Paused: 0, Lapsed: 1, Ended: 2, Active: 3 };
  return subs
    .filter((s) => s.status !== "Active")
    .sort((a, b) => rank[a.status] - rank[b.status] || (a.nextRefillOn < b.nextRefillOn ? -1 : 1));
}

/** How overdue, in plain words, for the board. */
export function refillTiming(sub: Subscription, nowIso: string = NOW): string {
  const d = daysBetween(nowIso, sub.nextRefillOn);
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  if (d > 0) return `Due in ${d}d`;
  if (d === -1) return "1 day overdue";
  return `${Math.abs(d)} days overdue`;
}

// ---------------------------------------------------------------------------
// Placing a refill
// ---------------------------------------------------------------------------

export interface RefillContext {
  coachId: string;
  clientName?: string;
  membership?: Membership;
  shipTo?: PlaceOrderInput["shipTo"];
  nowIso?: string;
  /** Stands in for the conditional row read. See claimRefill. */
  readCurrent?: (id: string) => Subscription | undefined;
}

export type RefillResult =
  | {
      ok: true;
      order: Order;
      /**
       * MUST be appended by the caller. A refill that writes no visible record
       * is the exact defect we are fixing: in the audited system auto-refills
       * left no purchase row and no staff-visible event, so refill revenue
       * simply did not appear in history and coaches could not tell a member
       * what had shipped.
       */
      ledgerDraft: LedgerDraft;
      pricing: PriceBreakdown;
      /** The advanced subscription. Persist this alongside the order. */
      nextSub: Subscription;
    }
  | { ok: false; reason: string; problems?: OrderProblem[] };

/**
 * Turn a due subscription into a submitted Order.
 *
 * Sequence, and the order matters:
 *   1. claim   — advance the schedule with a compare-and-set
 *   2. validate — the catalog is authoritative even for automation; a retired
 *                 or unavailable SKU fails LOUDLY rather than shipping anything
 *   3. place   — build the Order + ledger draft
 *
 * If step 2 or 3 fails we return the claim's `nextSub` untouched by the caller,
 * i.e. the caller should NOT persist the advance. That keeps a failed refill
 * due rather than silently skipped.
 */
export function placeRefill(
  sub: Subscription,
  actor: PlacingActor,
  ctx: RefillContext,
): RefillResult {
  const nowIso = ctx.nowIso ?? NOW;

  const claim = claimRefill(sub, nowIso, ctx.readCurrent);
  if (!claim.claimed) {
    return { ok: false, reason: claim.reason ?? "Not claimable." };
  }

  const item = catalogItem(sub.sku);
  if (!item) {
    return {
      ok: false,
      reason: `${sub.sku} is no longer in the catalog. This refill needs a coach to choose a replacement — Apex will not guess.`,
    };
  }

  const input: PlaceOrderInput = {
    clientId: sub.clientId,
    clientName: ctx.clientName,
    coachId: ctx.coachId,
    locationId: sub.locationId,
    // Honour the price the member enrolled at, not today's list price.
    // `Subscription.priceCents` is documented as locked in; reading list price
    // here would silently reprice every existing subscriber the moment the
    // catalog moved, and would split the books — the revenue tile sums
    // priceCents while the member is charged something else.
    lines: [{ sku: sub.sku, qty: 1, priceOverrideCents: sub.priceCents }],
    shipping: sub.shipping,
    shipTo: ctx.shipTo,
    membership: ctx.membership,
    at: nowIso,
    origin: "refill",
    note: `Auto-refill · ${item.name} · every ${sub.cadenceDays} days`,
  };

  const problems = validateOrder(input).filter((p) => p.severity === "error");
  if (problems.length > 0) {
    return {
      ok: false,
      reason: "The refill cannot be placed as scheduled.",
      problems,
    };
  }

  const placed = placeOrder(input, actor);
  if (!placed.ok) {
    return { ok: false, reason: "The refill cannot be placed as scheduled.", problems: placed.problems };
  }

  return {
    ok: true,
    order: placed.order,
    ledgerDraft: {
      ...placed.ledgerDraft,
      after: {
        ...(placed.ledgerDraft.after ?? {}),
        subscriptionId: sub.id,
        cadenceDays: sub.cadenceDays,
        scheduledFor: sub.nextRefillOn,
        nextRefillOn: claim.next.nextRefillOn,
      },
    },
    pricing: placed.pricing,
    nextSub: claim.next,
  };
}

// ---------------------------------------------------------------------------
// Revenue
// ---------------------------------------------------------------------------

/**
 * Refill revenue booked in the calendar month containing `nowIso`.
 *
 * Counted from `lastPlacedOn`, which only advances when a refill actually
 * produced an order. This figure existing at all is the point — in the audited
 * system refill revenue was invisible, so nobody could say whether the
 * subscription book was growing or quietly dying.
 */
export function refillRevenueThisMonthCents(
  subs: Subscription[],
  nowIso: string = NOW,
): number {
  const month = dayOf(nowIso).slice(0, 7);
  return subs
    .filter((s) => s.lastPlacedOn?.startsWith(month))
    .reduce((sum, s) => sum + s.priceCents, 0);
}

/** Annualised run-rate of the active book, integer cents per month. */
export function activeBookMonthlyCents(subs: Subscription[]): number {
  return subs
    .filter((s) => s.status === "Active")
    .reduce((sum, s) => sum + Math.round((s.priceCents * 30) / Math.max(1, s.cadenceDays)), 0);
}
