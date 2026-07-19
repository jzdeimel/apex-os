import type {
  Order,
  OrderStatus,
  OrderLine,
  Carrier,
  OutboxEntry,
} from "@/lib/orders/types";
import { STATUS_RANK, canAdvance } from "@/lib/orders/lifecycle";

/**
 * THE MEDSOURCE CONTRACT, TYPED.
 *
 * MedSource is a separate fulfillment system reachable only over HTTPS. This
 * file is the entire seam: request/response shapes, the inbound webhook, the
 * validator that stands between their vocabulary and ours, the reconciler, and
 * the retry policy.
 *
 * Everything here is a PURE FUNCTION OVER DATA. There are no fetch calls, no
 * clients, no side effects. That is deliberate — the audited integration mixed
 * transport, parsing and business rules in one file, which is why nothing about
 * it was testable and why a swallowed catch could hide a lost order for weeks.
 * Transport belongs at the edge; the rules belong here where they can be
 * exercised without a network.
 */

export const MEDSOURCE_CONTRACT_VERSION = "2026-06-01";

/* ------------------------------------------------------------------ *
 * submitOrder — POST /v1/orders
 * ------------------------------------------------------------------ */

export interface SubmitOrderRequest {
  /** The Apex order id. The ONE correlation key. */
  apexOrderId: string;
  /** Replayed verbatim on every retry. See RETRY_POLICY. */
  idempotencyKey: string;
  contractVersion: string;
  shipTo: {
    /** Pseudonymous member reference — Apex never ships PHI it doesn't owe. */
    memberRef: string;
    name: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
  };
  lines: Array<{
    apexLineId: string;
    sku: string;
    qty: number;
  }>;
  /** Apex-side location that owns the order, for partner routing. */
  originLocationId: string;
  placedAt: string;
}

export type SubmitOrderResponse =
  | {
      ok: true;
      /** Opaque partner reference. Display only — never a join key. */
      medsourceRef: string;
      status: string;
      acceptedAt: string;
    }
  | {
      ok: false;
      /** Machine-readable. `insufficient_stock` is a LEGITIMATE answer, not an
       *  error — the audited Apex-side model had no way to represent it, so
       *  those orders silently sat in "Accepted" forever. */
      errorCode:
        | "insufficient_stock"
        | "invalid_sku"
        | "duplicate"
        | "rejected"
        | "unavailable";
      message: string;
      /** Present on insufficient_stock: which lines could not be filled. */
      shortLines?: Array<{ apexLineId: string; availableQty: number }>;
    };

/* ------------------------------------------------------------------ *
 * recordTracking — PATCH /v1/orders/{apexOrderId}/tracking
 * ------------------------------------------------------------------ */

export interface RecordTrackingRequest {
  apexOrderId: string;
  idempotencyKey: string;
  tracking: string;
  carrier: string;
  estDelivery?: string;
}

export type RecordTrackingResponse =
  | { ok: true; recordedAt: string }
  | { ok: false; errorCode: "not_found" | "conflict" | "unavailable"; message: string };

/* ------------------------------------------------------------------ *
 * cancelOrder — DELETE /v1/orders/{apexOrderId}
 * ------------------------------------------------------------------ */

export interface CancelOrderRequest {
  apexOrderId: string;
  idempotencyKey: string;
  reason: string;
  /** Who asked. Cancellation in the audited system was anonymous AND one-way:
   *  no acknowledgement came back, so Apex never knew whether the warehouse had
   *  already shipped. */
  requestedBy: string;
  requestedAt: string;
}

export type CancelOrderResponse =
  | { ok: true; cancelledAt: string }
  | {
      ok: false;
      /** `too_late` is the one that matters: the box is already moving and the
       *  member must be told, not left with a "Cancelled" label on a package
       *  that is going to show up at their door. */
      errorCode: "too_late" | "not_found" | "unavailable";
      message: string;
      shippedAt?: string;
    };

/* ------------------------------------------------------------------ *
 * Inbound shipment webhook — POST (from MedSource to Apex)
 * ------------------------------------------------------------------ */

export interface MedSourceShipmentWebhook {
  /** Partner's own event id — used to dedupe replays. */
  eventId: string;
  apexOrderId: string;
  medsourceRef: string;
  /** RAW partner string. Never assigned to OrderStatus without parsing. */
  status: string;
  occurredAt: string;
  tracking?: string;
  carrier?: string;
  estDelivery?: string;
  /** Lot actually dispensed per line — this is what binds lot→patient. */
  lots?: Array<{ apexLineId: string; lotRef: string }>;
  note?: string;
  /** HMAC over the raw body. Verified at the edge, typed here so it can't be
   *  forgotten in the handler signature. */
  signature: string;
}

export interface WebhookAck {
  received: true;
  eventId: string;
  applied: boolean;
  /** Populated when applied === false. A refused webhook is still recorded. */
  rejectionReason?: string;
}

/* ------------------------------------------------------------------ *
 * The validator
 * ------------------------------------------------------------------ */

/**
 * Every partner spelling we accept, mapped to our closed vocabulary. Hand-
 * rolled on purpose (no zod dependency) and, more importantly, EXHAUSTIVE BY
 * ALLOWLIST.
 *
 * This closes the audited "unvalidated passthrough" bug: the old handler did
 * `order.status = body.status` against a free-text column. A partner typo, a
 * casing change, or a new partner state nobody told us about wrote a value that
 * matched no view filter, and the order disappeared from every board while
 * remaining owed to a patient. Nothing was logged, because nothing had failed.
 *
 * Now: unknown string → null → the caller records a rejected webhook and raises
 * it. An unrecognized status is an integration incident, and integration
 * incidents are supposed to be loud.
 */
const MEDSOURCE_STATUS_MAP: Record<string, OrderStatus> = {
  // submission / acceptance
  received: "Submitted",
  submitted: "Submitted",
  accepted: "Accepted",
  confirmed: "Accepted",
  // stock exception
  backorder: "Insufficient stock",
  backordered: "Insufficient stock",
  insufficient_stock: "Insufficient stock",
  short_pick: "Insufficient stock",
  // fulfillment
  picking: "Picking",
  in_fulfillment: "Picking",
  qc_hold: "QC hold",
  pharmacist_review: "QC hold",
  packed: "Packed",
  ready_to_ship: "Packed",
  label_created: "Label created",
  labeled: "Label created",
  // carrier
  in_transit: "In transit",
  shipped: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  // terminal
  cancelled: "Cancelled",
  canceled: "Cancelled",
  failed: "Failed",
  exception: "Failed",
  returned_to_sender: "Failed",
};

/**
 * Normalize then look up. We tolerate casing, spaces vs underscores and
 * surrounding whitespace — those are cosmetic. We do NOT tolerate an unknown
 * token, however plausible it looks.
 */
export function parseMedSourceStatus(raw: unknown): OrderStatus | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!key) return null;
  return MEDSOURCE_STATUS_MAP[key] ?? null;
}

const CARRIERS: Carrier[] = ["UPS", "FedEx", "USPS", "Courier"];

export function parseCarrier(raw: unknown): Carrier | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase();
  return CARRIERS.find((c) => c.toLowerCase() === key) ?? null;
}

/**
 * Structural validation of an inbound webhook before any of it is trusted.
 * Returns the reason it is unacceptable, or null if it is well-formed.
 * Signature verification happens at the edge; this is everything else.
 */
export function validateShipmentWebhook(
  body: Partial<MedSourceShipmentWebhook>,
): string | null {
  if (!body || typeof body !== "object") return "Body is not an object.";
  if (!body.eventId) return "Missing eventId — cannot dedupe replays.";
  if (!body.apexOrderId) return "Missing apexOrderId — cannot correlate.";
  if (!body.signature) return "Missing signature.";
  if (!body.occurredAt || Number.isNaN(new Date(body.occurredAt).getTime()))
    return "Missing or unparseable occurredAt.";
  if (parseMedSourceStatus(body.status) === null)
    return `Unrecognized status "${String(body.status)}" — refusing to write an unknown value.`;
  if (body.carrier !== undefined && parseCarrier(body.carrier) === null)
    return `Unrecognized carrier "${String(body.carrier)}".`;
  return null;
}

/**
 * Decide what a well-formed webhook should do, without doing it. Pure.
 * The forward-only rank check lives in `canAdvance`; this reports the decision
 * so the caller can write BOTH outcomes to the ledger. The audited ingest API
 * wrote no audit at all — applied and refused events were equally invisible.
 */
export function planWebhookApplication(
  order: Order,
  body: MedSourceShipmentWebhook,
): { apply: boolean; to: OrderStatus | null; reason?: string } {
  const structural = validateShipmentWebhook(body);
  if (structural) return { apply: false, to: null, reason: structural };

  const to = parseMedSourceStatus(body.status);
  if (!to) return { apply: false, to: null, reason: "Unrecognized status." };

  if (order.status === to)
    return { apply: false, to, reason: "Duplicate — order already in this status." };
  if (!canAdvance(order.status, to))
    return {
      apply: false,
      to,
      reason: `Out-of-order webhook: ${to} (rank ${STATUS_RANK[to]}) is not ahead of ${order.status} (rank ${STATUS_RANK[order.status]}).`,
    };
  return { apply: true, to };
}

/* ------------------------------------------------------------------ *
 * Retry policy
 * ------------------------------------------------------------------ */

/**
 * DETERMINISTIC exponential backoff — no jitter, because Math.random is banned
 * in this codebase and because a reproducible schedule is far easier to reason
 * about during an incident ("attempt 4 fires at T+8m, always").
 *
 * WHY AT-LEAST-ONCE + IDEMPOTENCY KEY, AND NOT AT-MOST-ONCE:
 * The audited system chose at-most-once by accident — one webhook, one attempt,
 * swallowed catch. The failure mode of at-most-once is a LOST order: a patient
 * waits indefinitely for something no system believes it owes them. The failure
 * mode of at-least-once is a DUPLICATE, which `idempotencyKey` collapses to a
 * no-op on the partner side. A duplicate we can dedupe beats a loss we cannot
 * detect. That trade is only safe because the key is stable per order and
 * replayed byte-for-byte on every attempt — a regenerated key turns a retry
 * into a second real shipment.
 */
export const RETRY_POLICY = {
  baseDelayMs: 30_000,
  factor: 2,
  maxDelayMs: 6 * 60 * 60 * 1000, // 6h ceiling
  /** After this many failures the entry stops retrying and becomes a visible
   *  dead-letter row that an ops human must resolve. It is never dropped. */
  maxAttempts: 8,
} as const;

/** Delay before attempt N (1-indexed). Pure, no jitter, no clock. */
export function backoffMs(attempt: number): number {
  if (attempt <= 1) return 0;
  const raw =
    RETRY_POLICY.baseDelayMs * Math.pow(RETRY_POLICY.factor, attempt - 2);
  return Math.min(raw, RETRY_POLICY.maxDelayMs);
}

export function nextAttemptAt(attempt: number, fromIso: string): string {
  return new Date(new Date(fromIso).getTime() + backoffMs(attempt + 1)).toISOString();
}

/** Exhausted entries are dead-lettered, not deleted. */
export function isDeadLettered(entry: OutboxEntry): boolean {
  return !entry.deliveredAt && entry.attempts >= RETRY_POLICY.maxAttempts;
}

export function outboxIsOwed(entry: OutboxEntry): boolean {
  return !entry.deliveredAt;
}

/* ------------------------------------------------------------------ *
 * Reconciliation
 * ------------------------------------------------------------------ */

/** The partner's view of one order, as returned by a bulk snapshot endpoint. */
export interface PartnerOrderSnapshotRow {
  apexOrderId: string;
  medsourceRef: string;
  status: string;
  tracking?: string;
  carrier?: string;
  updatedAt: string;
}

export interface PartnerSnapshot {
  takenAt: string;
  rows: PartnerOrderSnapshotRow[];
  /**
   * The partner asserts how many rows this snapshot SHOULD contain. If it does
   * not match rows.length the snapshot is torn (paged fetch that failed
   * halfway) and we refuse to act on it — see SAFETY RAIL 1.
   */
  expectedCount: number;
  /** Partner-declared completeness. A `false` here is an immediate abort. */
  complete: boolean;
}

export interface DriftRow {
  orderId: string;
  apexStatus: OrderStatus;
  /** Null when the partner sent a status we refuse to interpret. */
  partnerStatus: OrderStatus | null;
  partnerRaw: string;
  /** "ahead" = partner is further along (we missed a webhook — the common,
   *  expected case). "behind" = we are ahead of them. "unparseable" = their
   *  vocabulary drifted. "tracking" = statuses agree but tracking differs. */
  kind: "ahead" | "behind" | "unparseable" | "tracking";
  detail: string;
}

export interface ReconcileResult {
  /** Both sides know the order; the two views disagree. */
  drifted: DriftRow[];
  /** Partner has an order Apex has never heard of. INVESTIGATE, never import. */
  missingLocally: PartnerOrderSnapshotRow[];
  /** Apex has an order the partner does not. Usually a lost submit — the
   *  outbox entry should be re-driven, NOT the local row deleted. */
  missingRemotely: Order[];
  /** Set when the snapshot was refused. All arrays are empty in that case. */
  abortedReason?: string;
}

const EMPTY: ReconcileResult = {
  drifted: [],
  missingLocally: [],
  missingRemotely: [],
};

/**
 * Compare Apex's truth to the partner's. In the audited system this endpoint
 * existed and returned 502 — it had been dead long enough that nobody
 * remembered it was supposed to work, which is precisely why drift accumulated
 * unnoticed.
 *
 * SAFETY RAIL 1 — NEVER ACT ON AN INCOMPLETE SNAPSHOT.
 *   A truncated snapshot makes every missing order look like it vanished from
 *   the partner. Acting on that would be catastrophic. We abort loudly instead.
 *
 * SAFETY RAIL 2 — RECONCILIATION NEVER DELETES A LOCALLY-OWNED ROW.
 *   Apex is the system of record for the ORDER; MedSource is the system of
 *   record for FULFILLMENT. An order absent from their side means our submit
 *   was lost, not that the order should stop existing. This function only ever
 *   REPORTS. Nothing here mutates, and nothing downstream is permitted to
 *   delete on its output.
 *
 * SAFETY RAIL 3 — DRIFT REPORTS, IT DOES NOT AUTO-APPLY.
 *   Even a partner status that is legitimately ahead of ours goes through the
 *   normal forward-only advance path with a recorded actor, so the correction
 *   lands in the ledger like any other event.
 */
export function reconcile(
  apexOrders: Order[],
  partnerSnapshot: PartnerSnapshot,
): ReconcileResult {
  // SAFETY RAIL 1
  if (!partnerSnapshot.complete) {
    return { ...EMPTY, abortedReason: "Partner declared the snapshot incomplete." };
  }
  if (partnerSnapshot.rows.length !== partnerSnapshot.expectedCount) {
    return {
      ...EMPTY,
      abortedReason: `Torn snapshot: got ${partnerSnapshot.rows.length} rows, expected ${partnerSnapshot.expectedCount}. Refusing to reconcile.`,
    };
  }

  const byId = new Map(partnerSnapshot.rows.map((r) => [r.apexOrderId, r]));
  const localIds = new Set(apexOrders.map((o) => o.id));

  const drifted: DriftRow[] = [];
  const missingRemotely: Order[] = [];

  for (const order of apexOrders) {
    // Drafts have not been submitted yet; their absence remotely is correct.
    if (order.status === "Draft" || order.fulfillmentPartner !== "MedSource") continue;

    const row = byId.get(order.id);
    if (!row) {
      missingRemotely.push(order);
      continue;
    }

    const partnerStatus = parseMedSourceStatus(row.status);
    if (partnerStatus === null) {
      drifted.push({
        orderId: order.id,
        apexStatus: order.status,
        partnerStatus: null,
        partnerRaw: row.status,
        kind: "unparseable",
        detail: `Partner reports "${row.status}", which is not in our vocabulary. Contract drift — do not guess.`,
      });
      continue;
    }

    if (partnerStatus !== order.status) {
      const ahead = STATUS_RANK[partnerStatus] > STATUS_RANK[order.status];
      drifted.push({
        orderId: order.id,
        apexStatus: order.status,
        partnerStatus,
        partnerRaw: row.status,
        kind: ahead ? "ahead" : "behind",
        detail: ahead
          ? `Partner is at ${partnerStatus}, we still show ${order.status}. We missed an event — replay it forward.`
          : `We show ${order.status}, partner still reports ${partnerStatus}. Likely their lag; do NOT walk our order backwards.`,
      });
      continue;
    }

    if (row.tracking && order.tracking && row.tracking !== order.tracking) {
      drifted.push({
        orderId: order.id,
        apexStatus: order.status,
        partnerStatus,
        partnerRaw: row.status,
        kind: "tracking",
        detail: `Tracking mismatch: ours ${order.tracking}, theirs ${row.tracking}. The member may be watching the wrong package.`,
      });
    } else if (row.tracking && !order.tracking) {
      drifted.push({
        orderId: order.id,
        apexStatus: order.status,
        partnerStatus,
        partnerRaw: row.status,
        kind: "tracking",
        detail: `Partner has tracking ${row.tracking}; we have none. This is the failed-PATCH case — the member cannot see their package.`,
      });
    }
  }

  // SAFETY RAIL 2 — reported for investigation, never imported or deleted.
  const missingLocally = partnerSnapshot.rows.filter(
    (r) => !localIds.has(r.apexOrderId),
  );

  return { drifted, missingLocally, missingRemotely };
}

/* ------------------------------------------------------------------ *
 * Request builders (pure; transport lives at the edge)
 * ------------------------------------------------------------------ */

export function buildSubmitRequest(
  order: Order,
  shipTo: SubmitOrderRequest["shipTo"],
): SubmitOrderRequest {
  return {
    apexOrderId: order.id,
    idempotencyKey: order.idempotencyKey,
    contractVersion: MEDSOURCE_CONTRACT_VERSION,
    shipTo,
    lines: order.lines.map((l: OrderLine) => ({
      apexLineId: l.id,
      sku: l.sku,
      qty: l.qty,
    })),
    originLocationId: order.locationId,
    placedAt: order.placedAt,
  };
}

export function buildCancelRequest(
  order: Order,
  reason: string,
  requestedBy: string,
  requestedAt = "2026-06-12T09:00:00",
): CancelOrderRequest {
  return {
    apexOrderId: order.id,
    // Distinct suffix so a cancel is never deduped against the submit.
    idempotencyKey: `${order.idempotencyKey}:cancel`,
    reason,
    requestedBy,
    requestedAt,
  };
}
