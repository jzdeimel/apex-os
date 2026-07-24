import { and, asc, desc, eq, inArray, sql as raw } from "drizzle-orm";

import type { Actor } from "@/lib/authz/capabilities";
import { requireDb } from "@/lib/db/client";
import {
  client,
  clinicLocation,
  fulfillmentOrder,
  fulfillmentOrderEvent,
  fulfillmentOrderLine,
  fulfillmentOutbox,
  staff,
} from "@/lib/db/schema";
import { appendLedgerInTx } from "@/lib/db/repo";
import { canAdvance } from "@/lib/orders/lifecycle";
import { orderOutboxRequestId, partnerMemberRef } from "@/lib/orders/authoritative";
import type { Order, OrderStatus } from "@/lib/orders/types";
import type { PriceBreakdown, ShippingAddress, ShippingMode } from "@/lib/orders/place";
import type { LedgerDraft } from "@/lib/trace/ledger";

function actorClientFilter(actor: Actor) {
  if (actor.accessProfile === "coach") return eq(client.assignedCoachId, actor.id);
  if (actor.accessProfile === "provider") return eq(client.assignedProviderId, actor.id);
  if (actor.locationIds.length) return inArray(client.homeLocationId, actor.locationIds);
  return raw`false`;
}

export async function readOrderPatient(id: string) {
  const db = requireDb();
  const [row] = await db.select({
    id: client.id, mrn: client.mrn, firstName: client.firstName, lastName: client.lastName,
    preferredName: client.preferredName, email: client.email, phone: client.phone,
    address1: client.address1, address2: client.address2, city: client.city,
    state: client.state, zip: client.zip, status: client.status, isProspect: client.isProspect,
    homeLocationId: client.homeLocationId, assignedCoachId: client.assignedCoachId,
    assignedProviderId: client.assignedProviderId,
  }).from(client).where(eq(client.id, id)).limit(1);
  return row ?? null;
}

export async function readOrderReference(actor: Actor) {
  const db = requireDb();
  const filter = actorClientFilter(actor);
  const [people, staffRows, locationRows] = await Promise.all([
    db.select({
      id: client.id, mrn: client.mrn, firstName: client.firstName, lastName: client.lastName,
      preferredName: client.preferredName, email: client.email, phone: client.phone,
      address1: client.address1, address2: client.address2, city: client.city, state: client.state, zip: client.zip,
      homeLocationId: client.homeLocationId, assignedCoachId: client.assignedCoachId,
      assignedProviderId: client.assignedProviderId,
    }).from(client).where(and(eq(client.status, "active"), eq(client.isProspect, false), filter))
      .orderBy(client.lastName, client.firstName),
    db.select({ id: staff.id, name: staff.name }).from(staff).where(eq(staff.active, true)).orderBy(staff.name),
    actor.locationIds.length
      ? db.select({ id: clinicLocation.id, name: clinicLocation.name, timezone: clinicLocation.timezone })
        .from(clinicLocation).where(and(eq(clinicLocation.active, true), inArray(clinicLocation.id, actor.locationIds))).orderBy(clinicLocation.name)
      : Promise.resolve([]),
  ]);
  return { clients: people, staff: staffRows, locations: locationRows };
}

export async function readOrderScope(id: string) {
  const db = requireDb();
  const [row] = await db.select({
    order: fulfillmentOrder,
    coachId: client.assignedCoachId,
    providerId: client.assignedProviderId,
    clientStatus: client.status,
  }).from(fulfillmentOrder).innerJoin(client, eq(fulfillmentOrder.clientId, client.id))
    .where(eq(fulfillmentOrder.id, id)).limit(1);
  return row ?? null;
}

export async function readOrders(actor: Actor, clientId?: string) {
  const db = requireDb();
  const filters = [actorClientFilter(actor)];
  if (clientId) filters.push(eq(fulfillmentOrder.clientId, clientId));
  const orders = await db.select({
    order: fulfillmentOrder,
    patientId: client.id,
    patientMrn: client.mrn,
    patientFirstName: client.firstName,
    patientLastName: client.lastName,
    patientPreferredName: client.preferredName,
  })
    .from(fulfillmentOrder).innerJoin(client, eq(fulfillmentOrder.clientId, client.id))
    .where(and(...filters)).orderBy(desc(fulfillmentOrder.lastActivity));
  const ids = orders.map((row) => row.order.id);
  if (!ids.length) return [];
  const [lines, events, outbox] = await Promise.all([
    db.select().from(fulfillmentOrderLine).where(inArray(fulfillmentOrderLine.orderId, ids)).orderBy(asc(fulfillmentOrderLine.id)),
    db.select().from(fulfillmentOrderEvent).where(inArray(fulfillmentOrderEvent.orderId, ids)).orderBy(asc(fulfillmentOrderEvent.at)),
    db.select({
      id: fulfillmentOutbox.id, orderId: fulfillmentOutbox.orderId, kind: fulfillmentOutbox.kind,
      status: fulfillmentOutbox.status, attempts: fulfillmentOutbox.attempts,
      nextAttemptAt: fulfillmentOutbox.nextAttemptAt, lastAttemptAt: fulfillmentOutbox.lastAttemptAt,
      deliveredAt: fulfillmentOutbox.deliveredAt, lastError: fulfillmentOutbox.lastError,
    }).from(fulfillmentOutbox).where(inArray(fulfillmentOutbox.orderId, ids)),
  ]);
  return orders.map(({ order, ...patient }) => ({
    ...order,
    patient,
    shipTo: undefined,
    lines: lines.filter((line) => line.orderId === order.id),
    events: events.filter((event) => event.orderId === order.id),
    outbox: outbox.filter((entry) => entry.orderId === order.id),
  }));
}

export async function createOrderWithLedger(input: {
  order: Order;
  pricing: PriceBreakdown;
  shipping: ShippingMode;
  shipTo?: ShippingAddress;
  discountReason?: string;
  origin: "coach" | "refill";
  actorId: string;
  actorName: string;
  actorRole: string;
  patientName: string;
  at: string;
  ledgerDraft: LedgerDraft;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4310)`);
    const [existing] = await tx.select().from(fulfillmentOrder).where(eq(fulfillmentOrder.id, input.order.id)).limit(1);
    if (existing) {
      const existingLines = await tx.select().from(fulfillmentOrderLine).where(eq(fulfillmentOrderLine.orderId, existing.id)).orderBy(fulfillmentOrderLine.id);
      const requestedLines = input.order.lines.map((line) => ({ sku: line.sku, quantity: line.qty, unitPriceCents: line.unitPriceCents }));
      const storedLines = existingLines.map((line) => ({ sku: line.sku, quantity: line.quantity, unitPriceCents: line.unitPriceCents }));
      const same = existing.clientId === input.order.clientId && existing.totalCents === input.pricing.totalCents &&
        JSON.stringify(storedLines) === JSON.stringify(requestedLines);
      return { status: same ? "ok" as const : "conflict" as const, duplicate: same, order: same ? existing : null, ledger: null };
    }

    const [person] = await tx.select().from(client).where(eq(client.id, input.order.clientId)).limit(1);
    if (!person || person.status !== "active" || person.isProspect) return { status: "missing" as const, reason: "Unknown active patient." };
    if (!person.homeLocationId || person.homeLocationId !== input.order.locationId) return { status: "conflict" as const, reason: "Order clinic does not match the patient's authoritative home clinic." };
    if (!person.assignedCoachId || person.assignedCoachId !== input.order.coachId) return { status: "conflict" as const, reason: "Order must remain owned by the patient's assigned coach." };

    const ledger = await appendLedgerInTx(tx, input.ledgerDraft, input.at);
    const lastEvent = input.order.statusHistory[input.order.statusHistory.length - 1];
    const [created] = await tx.insert(fulfillmentOrder).values({
      id: input.order.id, clientId: input.order.clientId, coachId: input.order.coachId,
      locationId: input.order.locationId, status: input.order.status, placedAt: new Date(input.order.placedAt),
      shippingMode: input.shipping, shipTo: input.shipping === "ship" ? input.shipTo as never : null,
      fulfillmentPartner: input.order.fulfillmentPartner, idempotencyKey: input.order.idempotencyKey,
      visibleToClient: input.order.visibleToClient, subtotalCents: input.pricing.subtotalCents,
      creditAppliedCents: input.pricing.creditAppliedCents, discountCents: input.pricing.discountCents,
      discountReason: input.discountReason?.trim() || null, totalCents: input.pricing.totalCents,
      tracking: input.order.tracking ?? null, carrier: input.order.carrier ?? null,
      estDelivery: input.order.estDelivery ?? null, lastActivity: new Date(lastEvent?.at ?? input.at),
      delayed: input.order.delayed ?? false, delayReason: input.order.delayReason ?? null,
      medsourceRef: input.order.medsourceRef ?? null, origin: input.origin,
      createdBy: input.actorId, ledgerId: ledger.id,
    }).returning();
    await tx.insert(fulfillmentOrderLine).values(input.order.lines.map((line) => ({
      id: line.id, orderId: input.order.id, sku: line.sku, name: line.name,
      quantity: line.qty, unitPriceCents: line.unitPriceCents, isAddon: line.isAddon,
      lotRef: line.lotRef ?? null,
    })));
    await tx.insert(fulfillmentOrderEvent).values(input.order.statusHistory.map((event, index) => ({
      id: `${input.order.id}-event-${index + 1}`, orderId: input.order.id,
      fromStatus: index === 0 ? null : input.order.statusHistory[index - 1]?.status ?? null,
      toStatus: event.status, applied: true, at: new Date(event.at), actorId: input.actorId,
      actorName: event.actor, actorRole: event.actorRole, source: event.source,
      note: event.note ?? null, ledgerId: ledger.id,
    })));
    if (input.order.fulfillmentPartner === "MedSource") {
      await tx.insert(fulfillmentOutbox).values({
        id: orderOutboxRequestId(input.order.id, "submit-order"), orderId: input.order.id,
        kind: "submit-order", status: "pending", attempts: 0, nextAttemptAt: new Date(input.at),
        payload: {
          apexOrderId: input.order.id, idempotencyKey: input.order.idempotencyKey,
          memberRef: partnerMemberRef(input.order.clientId), patientName: input.patientName,
          shipTo: input.shipTo, originLocationId: input.order.locationId,
          lines: input.order.lines.map((line) => ({ apexLineId: line.id, sku: line.sku, qty: line.qty })),
          placedAt: input.order.placedAt,
        },
        ledgerId: ledger.id, createdAt: new Date(input.at),
      });
    }
    return { status: "ok" as const, duplicate: false, order: created, ledger };
  });
}

export async function transitionOrderWithLedger(input: {
  eventId: string;
  orderId: string;
  toStatus: OrderStatus;
  reason: string;
  tracking?: string;
  carrier?: string;
  estDelivery?: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4310)`);
    const [existingEvent] = await tx.select().from(fulfillmentOrderEvent).where(eq(fulfillmentOrderEvent.id, input.eventId)).limit(1);
    if (existingEvent) {
      const same = existingEvent.orderId === input.orderId && existingEvent.toStatus === input.toStatus;
      return { status: same && existingEvent.applied ? "ok" as const : "conflict" as const, duplicate: same, event: existingEvent, order: null, ledger: null };
    }
    const [current] = await tx.select().from(fulfillmentOrder).where(eq(fulfillmentOrder.id, input.orderId)).limit(1);
    if (!current) return { status: "missing" as const, reason: "Unknown order." };
    const allowed = canAdvance(current.status as OrderStatus, input.toStatus);
    const rejectionReason = allowed ? null : current.status === input.toStatus
      ? `Order is already ${input.toStatus}.`
      : `Order cannot move from ${current.status} to ${input.toStatus}.`;
    const ledger = await appendLedgerInTx(tx, {
      actorId: input.actorId, actorName: input.actorName, actorRole: input.actorRole,
      action: allowed ? "update" : "deny", entity: "order", entityId: input.orderId,
      subjectId: current.clientId, locationId: current.locationId as LedgerDraft["locationId"],
      reason: allowed ? input.reason : rejectionReason!, before: { status: current.status },
      after: { status: input.toStatus, applied: allowed, tracking: input.tracking, carrier: input.carrier },
    }, input.at);
    const [event] = await tx.insert(fulfillmentOrderEvent).values({
      id: input.eventId, orderId: input.orderId, fromStatus: current.status,
      toStatus: input.toStatus, applied: allowed, at: new Date(input.at),
      actorId: input.actorId, actorName: input.actorName, actorRole: input.actorRole,
      source: "apex", note: input.reason, rejectionReason, ledgerId: ledger.id,
    }).returning();
    if (!allowed) return { status: "conflict" as const, reason: rejectionReason!, duplicate: false, event, order: current, ledger };
    const [updated] = await tx.update(fulfillmentOrder).set({
      status: input.toStatus, lastActivity: new Date(input.at), delayed: false, delayReason: null,
      tracking: input.tracking ?? current.tracking, carrier: input.carrier ?? current.carrier,
      estDelivery: input.estDelivery ?? current.estDelivery,
    }).where(and(eq(fulfillmentOrder.id, input.orderId), eq(fulfillmentOrder.status, current.status))).returning();
    if (!updated) throw new Error("Concurrent order transition lost its compare-and-set.");
    return { status: "ok" as const, duplicate: false, event, order: updated, ledger };
  });
}
