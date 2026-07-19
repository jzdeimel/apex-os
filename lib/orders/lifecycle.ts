import type {
  Order,
  OrderStatus,
  OrderEventSource,
  OrderActorRole,
  OrderStatusEvent,
  AdvanceResult,
} from "@/lib/orders/types";

/**
 * ORDER LIFECYCLE — forward-only, SLA-aware, plain-English at the edge.
 *
 * The single most valuable pattern recovered from the audited system is the
 * monotonic status rank. Webhooks arrive out of order — routinely. A carrier
 * "in transit" ping delivered after the "delivered" scan would, in a naive
 * last-write-wins model, walk a completed order backwards and re-open it on
 * every board. Rank makes that physically impossible: an event that does not
 * increase rank is recorded as rejected, not applied.
 */

/**
 * Monotonic rank. Higher = further along. Terminal states sit at the top so
 * nothing can move an order off them.
 *
 * Note the deliberate placements:
 *  - "Insufficient stock" and "QC hold" are EXCEPTIONS, not dead ends. They
 *    rank just below the step that resumes after them, so an order can be
 *    released forward once ops resolves it. The audited model could not even
 *    represent "insufficient stock", so those orders sat in "Accepted" while a
 *    warehouse email nobody read explained why.
 *  - "Cancelled" and "Failed" outrank everything. Once an order is dead it is
 *    dead; a straggling partner webhook cannot resurrect it.
 */
export const STATUS_RANK: Record<OrderStatus, number> = {
  Draft: 0,
  Submitted: 10,
  Accepted: 20,
  "Insufficient stock": 25,
  Picking: 30,
  "QC hold": 35,
  Packed: 40,
  "Label created": 50,
  "In transit": 60,
  "Out for delivery": 70,
  Delivered: 80,
  Cancelled: 900,
  Failed: 910,
};

export const TERMINAL_STATUSES: OrderStatus[] = [
  "Delivered",
  "Cancelled",
  "Failed",
];

/** Exception states: not terminal, but stalled until a human acts. */
export const EXCEPTION_STATUSES: OrderStatus[] = [
  "Insufficient stock",
  "QC hold",
];

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isException(status: OrderStatus): boolean {
  return EXCEPTION_STATUSES.includes(status);
}

/**
 * Forward-only guard. Returns true only if `to` is strictly further along than
 * `from`. Equal ranks are rejected too — a duplicate delivery of the same
 * event should be a no-op, not a second history row.
 */
export function canAdvance(from: OrderStatus, to: OrderStatus): boolean {
  if (isTerminal(from)) return false;
  return STATUS_RANK[to] > STATUS_RANK[from];
}

/**
 * Per-status SLA, in hours. Exceeding it means the order is STUCK — the exact
 * condition that stranded orders in the audited system, where a failed tracking
 * PATCH left an order in a state with no poller and no owner, and nobody found
 * out until the patient called.
 *
 * Terminal statuses have no SLA. Exception states get short clocks on purpose:
 * a QC hold nobody has touched in 12 hours is an operational failure, not a
 * normal condition.
 */
export const SLA_HOURS: Record<OrderStatus, number | null> = {
  Draft: 48,
  Submitted: 4,
  Accepted: 24,
  "Insufficient stock": 12,
  Picking: 24,
  "QC hold": 12,
  Packed: 24,
  "Label created": 36,
  "In transit": 120,
  "Out for delivery": 24,
  Delivered: null,
  Cancelled: null,
  Failed: null,
};

const HOUR_MS = 1000 * 60 * 60;

function hoursBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / HOUR_MS;
}

/** The timestamp we measure an SLA from: last movement, else placement. */
export function lastMovementAt(order: Order): string {
  if (order.lastActivity) return order.lastActivity;
  const last = order.statusHistory[order.statusHistory.length - 1];
  return last?.at ?? order.placedAt;
}

export function hoursInStatus(order: Order, nowIso: string): number {
  return hoursBetween(lastMovementAt(order), nowIso);
}

/**
 * An order is stuck if it is non-terminal and has sat past its SLA. This is the
 * detector that turns "nobody noticed" into a row on an ops board.
 */
export function isStuck(order: Order, nowIso: string): boolean {
  const sla = SLA_HOURS[order.status];
  if (sla === null) return false;
  return hoursInStatus(order, nowIso) > sla;
}

/**
 * Why it's stuck, in language an ops lead can act on. Returns null when the
 * order is healthy, so callers can use it as both predicate and copy.
 */
export function stuckReason(
  order: Order,
  nowIso = "2026-06-12T09:00:00",
): string | null {
  const sla = SLA_HOURS[order.status];
  if (sla === null) return null;
  const hours = hoursInStatus(order, nowIso);
  if (hours <= sla) return null;
  const days = Math.floor(hours / 24);
  const elapsed = days >= 1 ? `${days}d` : `${Math.floor(hours)}h`;

  switch (order.status) {
    case "Draft":
      return `Drafted ${elapsed} ago and never submitted — the member is waiting on nothing.`;
    case "Submitted":
      return `Sent to MedSource ${elapsed} ago with no acknowledgement. Check the outbox for an undelivered submit.`;
    case "Accepted":
      return `Accepted ${elapsed} ago but never entered picking. MedSource has it and has not started.`;
    case "Insufficient stock":
      return `MedSource reported insufficient stock ${elapsed} ago. Substitute, split, or cancel — nothing moves until someone decides.`;
    case "Picking":
      return `On the pick floor ${elapsed} with no completion. Likely a partial pick nobody closed out.`;
    case "QC hold":
      return `Held in QC ${elapsed}. Needs a pharmacist or ops sign-off to release.`;
    case "Packed":
      return `Packed ${elapsed} ago with no shipping label. This is the classic stranded order — the label step failed silently.`;
    case "Label created":
      return `Label created ${elapsed} ago but the carrier has never scanned it. The package is probably still on the dock.`;
    case "In transit":
      return `In transit ${elapsed} with no new carrier scan. Open a carrier trace.`;
    case "Out for delivery":
      return `Out for delivery ${elapsed} with no delivery scan. Confirm with the carrier before reshipping.`;
    default:
      return `No movement in ${elapsed}.`;
  }
}

/**
 * Apply a status change. PURE: returns a new Order, never mutates.
 *
 * On rejection the ORIGINAL order comes back untouched with ok:false and a
 * reason. The caller is expected to record the rejection — a webhook we refused
 * is exactly the kind of thing the audited system dropped on the floor.
 */
export function advanceOrder(
  order: Order,
  to: OrderStatus,
  actor: string,
  source: OrderEventSource,
  note?: string,
  at = "2026-06-12T09:00:00",
  actorRole: OrderActorRole = source === "apex"
    ? "System"
    : source === "medsource"
      ? "Partner"
      : "Carrier",
): AdvanceResult {
  if (order.status === to) {
    return {
      order,
      ok: false,
      reason: `Order is already ${to}. Duplicate event ignored.`,
    };
  }
  if (isTerminal(order.status)) {
    return {
      order,
      ok: false,
      reason: `Order is terminal (${order.status}); ${to} cannot be applied.`,
    };
  }
  if (!canAdvance(order.status, to)) {
    return {
      order,
      ok: false,
      reason: `Out-of-order event: ${to} ranks below ${order.status}. Orders never move backwards.`,
    };
  }

  const event: OrderStatusEvent = { status: to, at, actor, actorRole, source, note };
  return {
    order: {
      ...order,
      status: to,
      statusHistory: [...order.statusHistory, event],
      lastActivity: at,
      // Clearing the delay flag on real forward movement is intentional: the
      // delay was a property of the state we just left.
      delayed: false,
      delayReason: undefined,
    },
    ok: true,
  };
}

/** Plain-English label a member reads in their portal. Never internal jargon. */
export function clientFacingStatus(status: OrderStatus): string {
  switch (status) {
    case "Draft":
      return "Being prepared by your coach";
    case "Submitted":
    case "Accepted":
      return "Order received";
    case "Insufficient stock":
      return "Temporarily backordered";
    case "Picking":
    case "Packed":
      return "We're preparing your order";
    case "QC hold":
      return "Final quality check";
    case "Label created":
      return "Ready to ship";
    case "In transit":
      return "On its way";
    case "Out for delivery":
      return "Arriving today";
    case "Delivered":
      return "Delivered";
    case "Cancelled":
      return "Cancelled";
    case "Failed":
      return "There was a problem";
  }
}

/**
 * The sentence under the label. Two rules, both learned the hard way:
 * never leave a member guessing what happens next, and never say "contact us"
 * without saying who is already on it.
 */
export function clientFacingDetail(status: OrderStatus): string {
  switch (status) {
    case "Draft":
      return "Your coach is finalizing the items on this order. You'll be notified the moment it's placed.";
    case "Submitted":
      return "We've sent your order to our pharmacy partner. They typically confirm within a few hours.";
    case "Accepted":
      return "Our pharmacy partner has confirmed your order and queued it for preparation.";
    case "Insufficient stock":
      return "One item is temporarily out of stock. Your care team has been notified and is arranging a substitution or a partial ship — you don't need to do anything.";
    case "Picking":
      return "Your items are being pulled and prepared for shipment.";
    case "Packed":
      return "Your order is packed and waiting on a shipping label.";
    case "QC hold":
      return "Every order gets a final pharmacist review before it ships. This is routine and usually clears the same day.";
    case "Label created":
      return "A shipping label has been created. The carrier will pick it up on the next scheduled run.";
    case "In transit":
      return "Your package is moving through the carrier network. Tracking updates as it scans.";
    case "Out for delivery":
      return "Your package is on the delivery vehicle and should arrive today.";
    case "Delivered":
      return "Your order was delivered. If anything looks wrong, message your coach and we'll make it right.";
    case "Cancelled":
      return "This order was cancelled and you have not been charged for it. Your coach can tell you why and place a replacement.";
    case "Failed":
      return "Something went wrong with this order. Your care team has already been alerted and is resolving it.";
  }
}

/**
 * 0..100 for a progress bar. Off-path states return where the member actually
 * is, not zero — a backordered member has genuinely gotten somewhere, and
 * showing an empty bar reads as "nothing is happening."
 */
export function progressPercent(status: OrderStatus): number {
  switch (status) {
    case "Draft":
      return 5;
    case "Submitted":
      return 15;
    case "Accepted":
      return 25;
    case "Insufficient stock":
      return 25;
    case "Picking":
      return 40;
    case "QC hold":
      return 50;
    case "Packed":
      return 60;
    case "Label created":
      return 70;
    case "In transit":
      return 85;
    case "Out for delivery":
      return 95;
    case "Delivered":
      return 100;
    case "Cancelled":
    case "Failed":
      return 100;
  }
}

/** Badge tone matching the design system's Badge tones. */
export function statusTone(
  status: OrderStatus,
): "neutral" | "gold" | "optimal" | "watch" | "low" | "high" | "info" {
  switch (status) {
    case "Delivered":
      return "optimal";
    case "Failed":
    case "Cancelled":
      return "high";
    case "Insufficient stock":
    case "QC hold":
      return "watch";
    case "Draft":
      return "neutral";
    case "In transit":
    case "Out for delivery":
      return "info";
    default:
      return "gold";
  }
}

export function orderTotalCents(order: Order): number {
  return order.lines.reduce((sum, l) => sum + l.unitPriceCents * l.qty, 0);
}

/** The ordered happy path, for rendering a stepper. Exceptions live off it. */
export const HAPPY_PATH: OrderStatus[] = [
  "Draft",
  "Submitted",
  "Accepted",
  "Picking",
  "Packed",
  "Label created",
  "In transit",
  "Out for delivery",
  "Delivered",
];
