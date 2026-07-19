import type { LocationId } from "@/lib/types";

/**
 * ORDERS — the Apex↔MedSource seam.
 *
 * MedSource is a separate fulfillment system: its own database, its own
 * warehouse floor, reachable only over HTTPS. Apex places the order; MedSource
 * picks, QCs and ships it. Everything below exists because of a specific
 * failure we watched happen in the audited system.
 *
 * DECISION 1 — ONE ID, END TO END.
 *   The audited integration carried three key formats (an internal numeric id,
 *   a partner-side reference, and a human "order number" printed on the pick
 *   sheet). Nothing joined cleanly, so when an order went sideways nobody could
 *   answer "is this the same order?" without a human eyeballing a spreadsheet.
 *   Apex issues exactly one id (`Order.id`) at draft time and that id is the
 *   correlation key on every request, every webhook, every ledger row and every
 *   screen. `medsourceRef` is kept ONLY as an opaque, display-and-support
 *   value — it is never a join key, never looked up by, never trusted.
 *
 * DECISION 2 — ONE STATUS VOCABULARY.
 *   Status crossed the wire as an unvalidated string. A single typo
 *   ("in_transit" vs "in transit") wrote a value no view filtered on, and the
 *   order silently vanished from every board — still real, still owed to a
 *   patient, invisible to staff. `OrderStatus` is a closed union, and the only
 *   way a partner string becomes one is `parseMedSourceStatus`, which returns
 *   null for anything it does not recognize. Unknown input is an incident, not
 *   a new status.
 *
 * DECISION 3 — THE OUTBOX EXISTS BECAUSE THE WEBHOOK LIED.
 *   The "ready to ship" webhook fired exactly once, inside a swallowed catch,
 *   with no retry. If that one HTTP call was lost — deploy, timeout, 503 — the
 *   order froze forever, because the tracking poller skipped orders in that
 *   status. There was no queue, no dead-letter, no alarm. `OutboxEntry` is the
 *   durable at-least-once record of an intent to tell the other side something:
 *   it is written in the same transaction as the state change, retried on a
 *   deterministic backoff, and never silently dropped. An undelivered outbox
 *   entry is a visible, alertable row — not a lost log line.
 *
 * DECISION 4 — EVERY STATE CHANGE CARRIES AN ACTOR.
 *   The audited status history recorded status + timestamp and nothing else.
 *   You could see an order was cancelled; you could not see who cancelled it,
 *   or whether "who" was even a person. `OrderStatusEvent.actor`,
 *   `actorRole` and `source` are required. "medsource" and "carrier" are
 *   actors too — machines are accountable here the same as people.
 */

export type OrderStatus =
  | "Draft"
  | "Submitted"
  | "Accepted"
  | "Insufficient stock"
  | "Picking"
  | "QC hold"
  | "Packed"
  | "Label created"
  | "In transit"
  | "Out for delivery"
  | "Delivered"
  | "Cancelled"
  | "Failed";

/** Where a status change came from. Machines are accountable too. */
export type OrderEventSource = "apex" | "medsource" | "carrier";

export type OrderActorRole =
  | "Coach"
  | "Provider"
  | "Operations"
  | "Front Desk"
  | "System"
  | "Partner"
  | "Carrier";

export type FulfillmentPartner = "MedSource" | "In-clinic";

export type Carrier = "UPS" | "FedEx" | "USPS" | "Courier";

export interface OrderLine {
  id: string;
  /** Matches the inventory SKU vocabulary so lot↔patient traceability binds. */
  sku: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  /** Add-ons are member-elected extras, priced separately from the protocol. */
  isAddon: boolean;
  /**
   * Lot actually dispensed, once MedSource reports it. Undefined until the
   * line is physically picked — this is the hook that makes a recall answerable
   * ("which patients received lot BPC-2604A?") without a phone call.
   */
  lotRef?: string;
}

export interface OrderStatusEvent {
  status: OrderStatus;
  at: string;
  /** Display name or system identity. Never optional — see DECISION 4. */
  actor: string;
  actorRole: OrderActorRole;
  source: OrderEventSource;
  note?: string;
}

/** What kind of intent an outbox entry represents. */
export type OutboxKind =
  | "submit-order"
  | "cancel-order"
  | "notify-client"
  | "request-restock";

export interface OutboxEntry {
  id: string;
  orderId: string;
  kind: OutboxKind;
  /** Serialized intent. Frozen at write time so a later code change cannot
   *  retroactively alter what we promised to send. */
  payload: Record<string, unknown>;
  attempts: number;
  lastAttemptAt?: string;
  nextAttemptAt?: string;
  /** Set once, on confirmed acknowledgement. Undefined = still owed. */
  deliveredAt?: string;
  lastError?: string;
}

export interface Order {
  /** The one Apex-issued id, used end to end. See DECISION 1. */
  id: string;
  clientId: string;
  coachId: string;
  locationId: LocationId;
  status: OrderStatus;
  lines: OrderLine[];
  placedAt: string;
  /** Append-only. Index 0 is always the Draft/creation event. */
  statusHistory: OrderStatusEvent[];
  tracking?: string;
  carrier?: Carrier;
  estDelivery?: string;
  /** Last time ANYTHING moved — the input to stuck-order detection. */
  lastActivity?: string;
  delayed?: boolean;
  delayReason?: string;
  /** Opaque partner reference. Display and support only, never a join key. */
  medsourceRef?: string;
  fulfillmentPartner: FulfillmentPartner;
  /**
   * Stable per-order key sent on every submit attempt. At-least-once delivery
   * means MedSource WILL see duplicates; this is what makes the duplicate a
   * no-op instead of a second shipment.
   */
  idempotencyKey: string;
  /**
   * Whether the member sees this order in their portal. Drafts and internal
   * restock orders are false; anything the member is waiting on is true.
   * The audited system had no client portal at all, so this flag is the
   * explicit, auditable answer to "what did we show the patient?"
   */
  visibleToClient: boolean;
}

export interface AdvanceResult {
  order: Order;
  ok: boolean;
  /** Populated only when ok === false. Human-readable, safe to surface. */
  reason?: string;
}
