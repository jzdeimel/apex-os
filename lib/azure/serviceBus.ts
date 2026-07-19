import { sha256 } from "@/lib/trace/hash";
import type { OutboxEntry, OutboxKind } from "@/lib/orders/types";
import { RETRY_POLICY, backoffMs, isDeadLettered } from "@/lib/orders/medsource";
import { adapterFail, adapterOk, AZURE_NOW, type AdapterResult } from "@/lib/azure/types";

/**
 * AZURE SERVICE BUS — the durable outbox.
 *
 * WHAT THE REAL SERVICE DOES
 *   Brokered messaging with at-least-once delivery. The properties Apex needs,
 *   specifically:
 *     · Durability — a message survives a broker restart, a deploy, a node loss.
 *     · Peek-lock — a consumer takes a lock, does the work, then completes. If
 *       the consumer dies mid-work the lock expires and the message reappears.
 *       Nothing is lost because a process ended at a bad moment.
 *     · Automatic retry with a delivery count, and a real dead-letter subqueue
 *       once `maxDeliveryCount` is exceeded.
 *     · Scheduled enqueue, which is how a backoff is implemented without a
 *       sleeping worker.
 *     · Sessions — ordering guaranteed within a session id. Apex sessions by
 *       order id, so two events for one order can never be applied out of order
 *       even though the queue as a whole is parallel.
 *
 * WHAT THIS FILE DOES INSTEAD
 *   An in-memory array with the same state machine and the same deterministic
 *   backoff schedule as production. No AMQP connection, no namespace, no
 *   credential. The queue resets on refresh. `deliver`/`fail` are called by the
 *   caller rather than by a broker, so the demo drives the state machine by
 *   hand — which is honest, and also makes the failure paths reachable on a page.
 *
 * WHAT WOULD HAVE TO CHANGE TO MAKE IT REAL
 *   1. Provision a Service Bus namespace with queues `apex-outbox` and
 *      `apex-notifications`, `maxDeliveryCount = 8` to match RETRY_POLICY.
 *   2. `enqueue` becomes `ServiceBusSender.sendMessages` inside the SAME database
 *      transaction as the state change — via the transactional-outbox pattern
 *      (write the row, let a relay publish it), because a broker send and a
 *      Postgres commit cannot be made atomic and pretending otherwise is how the
 *      message and the state diverge.
 *   3. The outbox drainer runs as a Container Apps Job with a queue trigger,
 *      using peek-lock and completing only after MedSource acknowledges.
 *   4. Alert on dead-letter depth > 0. Not > 10. Zero is the only correct
 *      steady-state value, and a threshold above it is a decision to not notice.
 *
 * WHY THIS SEAM EXISTS AT ALL
 *   The audited integration has no queue. Its "ready to ship" webhook fires
 *   exactly once, inside a swallowed catch, with no retry and no record. If that
 *   single HTTP call is lost — a deploy mid-flight, a 503, a timeout, a TLS
 *   hiccup — the order freezes permanently, because the tracking poller skips
 *   orders in that status. There is no queue, no dead-letter, no alarm, and no
 *   log line, because from the application's point of view nothing failed. A
 *   patient is owed a shipment that no system believes it owes them, and the
 *   only way anyone finds out is the patient calling to ask.
 *
 *   That is the whole argument for at-least-once. The failure mode of
 *   at-most-once is a silent loss you cannot detect; the failure mode of
 *   at-least-once is a duplicate, which `Order.idempotencyKey` collapses into a
 *   no-op at the partner boundary. A duplicate you can dedupe beats a loss you
 *   cannot see. The trade only holds because the key is stable per order and
 *   replayed byte-for-byte — a regenerated key turns a retry into a second real
 *   shipment to a real address.
 */

/** Queues in the namespace. Separated so a notification storm cannot starve
 *  order submission — one queue for two workloads is one outage for two. */
export type QueueName = "apex-outbox" | "apex-notifications";

export type MessageState = "queued" | "in-flight" | "delivered" | "dead-lettered";

export interface QueueMessage {
  id: string;
  queue: QueueName;
  /** Ordering key. Messages sharing a session are applied in sequence. */
  sessionId: string;
  kind: OutboxKind;
  /** Frozen at write time so a later code change cannot rewrite what we promised. */
  payload: Record<string, unknown>;
  /** Broker-side delivery count. Compared against RETRY_POLICY.maxAttempts. */
  deliveryCount: number;
  state: MessageState;
  enqueuedAt: string;
  /** Scheduled visibility — the broker hides the message until this time. */
  scheduledFor: string;
  lastError?: string;
  deadLetterReason?: string;
  /**
   * Dedupe key. Service Bus deduplicates identical MessageIds inside a
   * configurable window; Apex sets it from the order's idempotency key so a
   * double-send is dropped by the broker rather than by the partner.
   */
  messageId: string;
}

/**
 * The in-memory broker.
 *
 * Mutable, and ONLY through the functions below — same discipline as
 * lib/trace/ledger.ts. Direct splicing would break the ordering guarantees the
 * session id is supposed to provide.
 */
const queue: QueueMessage[] = [];

/** Deterministic message id. Same intent in, same id out — no counter, no clock. */
function messageIdFor(sessionId: string, kind: OutboxKind, payload: Record<string, unknown>): string {
  return `sb-${sha256(`${sessionId}:${kind}:${JSON.stringify(payload)}`).slice(0, 16)}`;
}

export interface EnqueueInput {
  queue?: QueueName;
  /** Order id, almost always. Ordering is guaranteed within this key. */
  sessionId: string;
  kind: OutboxKind;
  payload: Record<string, unknown>;
  /** Stable per intent. Absent means we cannot dedupe — see the guard below. */
  dedupeKey: string;
  at?: string;
}

/**
 * Enqueue an intent.
 *
 * Refuses without a dedupe key. That refusal is the entire lesson of the audited
 * system encoded as a precondition: at-least-once delivery is only safe when the
 * receiver can recognize a repeat, and a caller who forgets the key has silently
 * opted into duplicate shipments. Making it optional would make it forgettable.
 */
export function enqueue(input: EnqueueInput): AdapterResult<QueueMessage> {
  if (!input.dedupeKey || !input.dedupeKey.trim()) {
    return adapterFail(
      "Enqueue refused: no dedupe key. At-least-once delivery without one means a retry becomes a second real shipment.",
    );
  }
  if (!input.sessionId || !input.sessionId.trim()) {
    return adapterFail("Enqueue refused: no session id. Ordering per order cannot be guaranteed without one.");
  }

  const at = input.at ?? AZURE_NOW;
  const msg: QueueMessage = {
    id: messageIdFor(input.sessionId, input.kind, input.payload),
    queue: input.queue ?? "apex-outbox",
    sessionId: input.sessionId,
    kind: input.kind,
    payload: input.payload,
    deliveryCount: 0,
    state: "queued",
    enqueuedAt: at,
    scheduledFor: at,
    messageId: input.dedupeKey,
  };

  // Broker-side dedupe: an identical messageId inside the window is dropped.
  const duplicate = queue.find((m) => m.messageId === msg.messageId && m.state !== "dead-lettered");
  if (duplicate) {
    return adapterOk(duplicate);
  }

  queue.push(msg);
  return adapterOk(msg);
}

/**
 * Peek the next visible message without locking it.
 *
 * Peek is non-destructive on purpose — it is what an operations screen uses to
 * show queue depth. Actual consumption goes through `receive`, which locks.
 * Conflating the two is how a dashboard refresh consumes production messages.
 */
export function peek(
  queueName: QueueName = "apex-outbox",
  at: string = AZURE_NOW,
): QueueMessage | undefined {
  const now = new Date(at).getTime();
  return queue.find(
    (m) => m.queue === queueName && m.state === "queued" && new Date(m.scheduledFor).getTime() <= now,
  );
}

/** Everything currently visible in a queue, oldest first. */
export function peekAll(queueName: QueueName = "apex-outbox", at: string = AZURE_NOW): QueueMessage[] {
  const now = new Date(at).getTime();
  return queue.filter(
    (m) => m.queue === queueName && m.state === "queued" && new Date(m.scheduledFor).getTime() <= now,
  );
}

/** Peek-lock: take the message in-flight so a second consumer cannot take it. */
export function receive(
  queueName: QueueName = "apex-outbox",
  at: string = AZURE_NOW,
): QueueMessage | undefined {
  const next = peek(queueName, at);
  if (!next) return undefined;
  next.state = "in-flight";
  next.deliveryCount += 1;
  return next;
}

/** Complete: the receiver acknowledged. Terminal and irreversible. */
export function complete(messageId: string): AdapterResult<QueueMessage> {
  const msg = queue.find((m) => m.id === messageId);
  if (!msg) return adapterFail(`No message ${messageId}.`);
  msg.state = "delivered";
  return adapterOk(msg);
}

/**
 * Abandon after a failed attempt.
 *
 * Reschedules on the same deterministic backoff `lib/orders/medsource.ts` uses
 * (no jitter — a reproducible schedule is far easier to reason about during an
 * incident), or dead-letters once the delivery count is exhausted.
 */
export function abandon(
  messageId: string,
  error: string,
  at: string = AZURE_NOW,
): AdapterResult<QueueMessage> {
  const msg = queue.find((m) => m.id === messageId);
  if (!msg) return adapterFail(`No message ${messageId}.`);

  msg.lastError = error;

  if (msg.deliveryCount >= RETRY_POLICY.maxAttempts) {
    return deadLetter(messageId, `Delivery count exhausted after ${msg.deliveryCount} attempts: ${error}`);
  }

  msg.state = "queued";
  msg.scheduledFor = new Date(new Date(at).getTime() + backoffMs(msg.deliveryCount + 1)).toISOString();
  return adapterOk(msg);
}

/**
 * Move a message to the dead-letter subqueue.
 *
 * Dead-lettering is NOT deletion and must never become it. The message stays,
 * visible and re-drivable, until a human resolves it. The single most important
 * property of this queue is that an intent Apex formed can never quietly cease
 * to exist — that is the exact failure the audited webhook had.
 */
export function deadLetter(messageId: string, reason: string): AdapterResult<QueueMessage> {
  const msg = queue.find((m) => m.id === messageId);
  if (!msg) return adapterFail(`No message ${messageId}.`);
  msg.state = "dead-lettered";
  msg.deadLetterReason = reason;
  return adapterOk(msg);
}

/** The dead-letter subqueue. Steady-state length is zero; anything else is an incident. */
export function deadLetterQueue(queueName?: QueueName): QueueMessage[] {
  return queue.filter((m) => m.state === "dead-lettered" && (!queueName || m.queue === queueName));
}

/**
 * Re-drive a dead-lettered message after an operator has fixed the cause.
 *
 * Delivery count resets, the dedupe key does not. That asymmetry is the point:
 * the partner still recognizes this as the same intent, so a re-drive of an
 * order that actually did ship is a no-op rather than a second box.
 */
export function redrive(messageId: string, at: string = AZURE_NOW): AdapterResult<QueueMessage> {
  const msg = queue.find((m) => m.id === messageId);
  if (!msg) return adapterFail(`No message ${messageId}.`);
  if (msg.state !== "dead-lettered") return adapterFail(`Message ${messageId} is not dead-lettered.`);
  msg.state = "queued";
  msg.deliveryCount = 0;
  msg.scheduledFor = at;
  msg.deadLetterReason = undefined;
  return adapterOk(msg);
}

export interface QueueDepth {
  queued: number;
  inFlight: number;
  delivered: number;
  deadLettered: number;
  /** Oldest undelivered message age in minutes — the number that pages someone. */
  oldestUndeliveredMinutes: number;
}

export function queueDepth(queueName: QueueName = "apex-outbox", at: string = AZURE_NOW): QueueDepth {
  const rows = queue.filter((m) => m.queue === queueName);
  const undelivered = rows.filter((m) => m.state === "queued" || m.state === "in-flight");
  const now = new Date(at).getTime();
  const oldest = undelivered.reduce((max, m) => {
    const age = (now - new Date(m.enqueuedAt).getTime()) / 60000;
    return age > max ? age : max;
  }, 0);

  return {
    queued: rows.filter((m) => m.state === "queued").length,
    inFlight: rows.filter((m) => m.state === "in-flight").length,
    delivered: rows.filter((m) => m.state === "delivered").length,
    deadLettered: rows.filter((m) => m.state === "dead-lettered").length,
    oldestUndeliveredMinutes: Math.round(oldest),
  };
}

/**
 * Project an existing `OutboxEntry` (lib/orders/types.ts) onto a queue message.
 *
 * The outbox row is the durable record written in the same transaction as the
 * state change; the queue message is the transport. Keeping both is the
 * transactional-outbox pattern, and the projection here is what a relay job
 * would do — which is why it is a pure function and not a method.
 */
export function fromOutboxEntry(entry: OutboxEntry, dedupeKey: string): QueueMessage {
  return {
    id: `sb-${entry.id}`,
    queue: entry.kind === "notify-client" ? "apex-notifications" : "apex-outbox",
    sessionId: entry.orderId,
    kind: entry.kind,
    payload: entry.payload,
    deliveryCount: entry.attempts,
    state: entry.deliveredAt
      ? "delivered"
      : isDeadLettered(entry)
        ? "dead-lettered"
        : "queued",
    enqueuedAt: entry.lastAttemptAt ?? AZURE_NOW,
    scheduledFor: entry.nextAttemptAt ?? AZURE_NOW,
    lastError: entry.lastError,
    deadLetterReason: isDeadLettered(entry) && !entry.deliveredAt ? entry.lastError : undefined,
    messageId: dedupeKey,
  };
}

/** Reset the in-memory broker. Demo-only affordance; production has no such thing. */
export function resetQueue(): void {
  queue.length = 0;
}

/** Read-only snapshot for rendering. Never hand out the live array. */
export function allMessages(): QueueMessage[] {
  return queue.map((m) => ({ ...m }));
}
