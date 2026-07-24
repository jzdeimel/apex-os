import { and, desc, eq, inArray, sql as raw } from "drizzle-orm";

import { requireDb } from "@/lib/db/client";
import {
  client,
  clinicLocation,
  dispense,
  inventoryLot,
  inventoryMovement,
  inventoryRecall,
  pdmpCheck,
  prescription,
} from "@/lib/db/schema";
import { appendLedgerInTx } from "@/lib/db/repo";
import { lotCanLeaveStock, type InventoryLotStatus } from "@/lib/inventory/lifecycle";
import type { LedgerDraft } from "@/lib/trace/ledger";

type DbTx = Parameters<Parameters<ReturnType<typeof requireDb>["transaction"]>[0]>[0];

async function onHand(tx: DbTx, lotId: string) {
  const rows = await tx.select({ delta: inventoryMovement.quantityDelta })
    .from(inventoryMovement).where(eq(inventoryMovement.inventoryLotId, lotId));
  return rows.reduce((sum, row) => sum + row.delta, 0);
}

export async function readInventory(locationIds: string[]) {
  const db = requireDb();
  if (!locationIds.length) return { lots: [], recalls: [] };
  const lots = await db.select().from(inventoryLot)
    .where(inArray(inventoryLot.locationId, locationIds))
    .orderBy(inventoryLot.locationId, inventoryLot.sku, inventoryLot.expiryOn);
  const lotIds = lots.map((row) => row.id);
  const movements = lotIds.length
    ? await db.select().from(inventoryMovement).where(inArray(inventoryMovement.inventoryLotId, lotIds)).orderBy(desc(inventoryMovement.at))
    : [];
  const stock = new Map<string, number>();
  for (const movement of movements) {
    if (movement.inventoryLotId) stock.set(movement.inventoryLotId, (stock.get(movement.inventoryLotId) ?? 0) + movement.quantityDelta);
  }
  const recallRows = await db.select().from(inventoryRecall).orderBy(desc(inventoryRecall.initiatedAt));
  const dispenses = await db.select({ sku: dispense.sku, lotNumber: dispense.lotNumber, locationId: dispense.locationId })
    .from(dispense).where(inArray(dispense.locationId, locationIds));
  return {
    lots: lots.map((lot) => ({ ...lot, onHand: stock.get(lot.id) ?? 0, recentMovements: movements.filter((movement) => movement.inventoryLotId === lot.id).slice(0, 10) })),
    recalls: recallRows.map((recall) => ({
      ...recall,
      affectedDispenses: dispenses.filter((row) => row.sku === recall.sku && row.lotNumber === recall.lotNumber).length,
    })),
  };
}

export async function readInventoryLocations(locationIds: string[]) {
  const db = requireDb();
  if (!locationIds.length) return [];
  return db
    .select({
      id: clinicLocation.id,
      name: clinicLocation.name,
      timezone: clinicLocation.timezone,
    })
    .from(clinicLocation)
    .where(
      and(
        eq(clinicLocation.active, true),
        inArray(clinicLocation.id, locationIds),
      ),
    )
    .orderBy(clinicLocation.name);
}

export async function readInventoryLotScope(id: string) {
  const db = requireDb();
  const [lot] = await db.select().from(inventoryLot).where(eq(inventoryLot.id, id)).limit(1);
  return lot ?? null;
}

export async function receiveInventoryWithLedger(input: {
  lotId: string;
  movementId: string;
  sku: string;
  lotNumber: string;
  locationId: string;
  unitLabel: string;
  expiryOn?: string;
  unitCostCents?: number;
  vendorRef?: string;
  requiresPrescription: boolean;
  controlledSchedule?: string;
  quantity: number;
  sourceDocumentRef: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4300)`);
    const [existingMovement] = await tx.select().from(inventoryMovement).where(eq(inventoryMovement.id, input.movementId)).limit(1);
    if (existingMovement) {
      const same = existingMovement.inventoryLotId === input.lotId && existingMovement.kind === "receive" && existingMovement.quantityDelta === input.quantity;
      return { status: same ? "ok" as const : "conflict" as const, duplicate: same, movement: same ? existingMovement : null, ledger: null };
    }
    const [openRecall] = await tx.select().from(inventoryRecall).where(and(
      eq(inventoryRecall.sku, input.sku),
      eq(inventoryRecall.lotNumber, input.lotNumber),
      eq(inventoryRecall.status, "open"),
    )).limit(1);
    if (openRecall) return { status: "conflict" as const, reason: "This lot is under an open recall and cannot be received into available stock." };
    const [existingLot] = await tx.select().from(inventoryLot).where(eq(inventoryLot.id, input.lotId)).limit(1);
    if (existingLot) {
      const sameIdentity = existingLot.sku === input.sku && existingLot.lotNumber === input.lotNumber &&
        existingLot.locationId === input.locationId && existingLot.unitLabel === input.unitLabel &&
        existingLot.expiryOn === (input.expiryOn ?? null) && existingLot.requiresPrescription === input.requiresPrescription &&
        existingLot.controlledSchedule === (input.controlledSchedule ?? null) &&
        existingLot.unitCostCents === (input.unitCostCents ?? null) &&
        existingLot.vendorRef === (input.vendorRef ?? null);
      if (!sameIdentity) return { status: "conflict" as const, reason: "The same lot identity already exists with different safety facts." };
      if (existingLot.status !== "active" && existingLot.status !== "depleted") return { status: "conflict" as const, reason: `This lot is ${existingLot.status} and cannot receive available stock.` };
    } else {
      await tx.insert(inventoryLot).values({
        id: input.lotId,
        sku: input.sku,
        lotNumber: input.lotNumber,
        locationId: input.locationId,
        unitLabel: input.unitLabel,
        expiryOn: input.expiryOn ?? null,
        unitCostCents: input.unitCostCents ?? null,
        vendorRef: input.vendorRef ?? null,
        requiresPrescription: input.requiresPrescription,
        controlledSchedule: input.controlledSchedule ?? null,
        status: "active",
        receivedAt: new Date(input.at),
        createdBy: input.actorId,
      });
    }
    const before = existingLot ? await onHand(tx, input.lotId) : 0;
    const ledger = await appendLedgerInTx(tx, {
      actorId: input.actorId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "create",
      entity: "inventory-movement",
      entityId: input.movementId,
      locationId: input.locationId as LedgerDraft["locationId"],
      reason: `Received against ${input.sourceDocumentRef}.`,
      before: { lotId: input.lotId, onHand: before },
      after: { lotId: input.lotId, sku: input.sku, lotNumber: input.lotNumber, quantityReceived: input.quantity, onHand: before + input.quantity, expiryOn: input.expiryOn },
    }, input.at);
    const [movement] = await tx.insert(inventoryMovement).values({
      id: input.movementId,
      sku: input.sku,
      lotNumber: input.lotNumber,
      locationId: input.locationId,
      kind: "receive",
      quantityDelta: input.quantity,
      expiryOn: input.expiryOn ?? null,
      reason: `Received against ${input.sourceDocumentRef}.`,
      staffId: input.actorId,
      at: new Date(input.at),
      inventoryLotId: input.lotId,
      correlationId: input.movementId,
      ledgerId: ledger.id,
    }).returning();
    if (existingLot?.status === "depleted") await tx.update(inventoryLot).set({ status: "active" }).where(eq(inventoryLot.id, input.lotId));
    if (!existingLot) await tx.update(inventoryLot).set({ ledgerId: ledger.id }).where(eq(inventoryLot.id, input.lotId));
    return { status: "ok" as const, duplicate: false, movement, ledger };
  });
}

export async function adjustInventoryWithLedger(input: {
  lotId: string;
  movementId: string;
  kind: "waste" | "count-adjust";
  quantity?: number;
  countedQuantity?: number;
  reason: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4300)`);
    const [existing] = await tx.select().from(inventoryMovement).where(eq(inventoryMovement.id, input.movementId)).limit(1);
    if (existing) return { status: existing.inventoryLotId === input.lotId && existing.kind === input.kind ? "ok" as const : "conflict" as const, duplicate: true, movement: existing, ledger: null };
    const [lot] = await tx.select().from(inventoryLot).where(eq(inventoryLot.id, input.lotId)).limit(1);
    if (!lot) return { status: "missing" as const, reason: "Unknown inventory lot." };
    const before = await onHand(tx, lot.id);
    const delta = input.kind === "waste" ? -(input.quantity ?? 0) : (input.countedQuantity ?? before) - before;
    if (input.kind === "waste" && (!input.quantity || input.quantity > before)) return { status: "conflict" as const, reason: "Waste quantity exceeds stock on hand." };
    if (!Number.isSafeInteger(delta)) return { status: "invalid" as const, reason: "Inventory movement must use whole units." };
    const after = before + delta;
    if (after < 0) return { status: "conflict" as const, reason: "Inventory cannot fall below zero." };
    const ledger = await appendLedgerInTx(tx, {
      actorId: input.actorId, actorName: input.actorName, actorRole: input.actorRole,
      action: "update", entity: "inventory-movement", entityId: input.movementId,
      locationId: lot.locationId as LedgerDraft["locationId"], reason: input.reason,
      before: { lotId: lot.id, onHand: before }, after: { lotId: lot.id, onHand: after, quantityDelta: delta, kind: input.kind },
    }, input.at);
    const [movement] = await tx.insert(inventoryMovement).values({
      id: input.movementId, sku: lot.sku, lotNumber: lot.lotNumber, locationId: lot.locationId,
      kind: input.kind, quantityDelta: delta, expiryOn: lot.expiryOn, reason: input.reason,
      staffId: input.actorId, at: new Date(input.at), inventoryLotId: lot.id,
      correlationId: input.movementId, ledgerId: ledger.id,
    }).returning();
    if (after === 0 && lot.status === "active") await tx.update(inventoryLot).set({ status: "depleted" }).where(eq(inventoryLot.id, lot.id));
    return { status: "ok" as const, duplicate: false, movement, ledger };
  });
}

export async function transferInventoryWithLedger(input: {
  transferId: string;
  sourceLotId: string;
  targetLotId: string;
  targetLocationId: string;
  quantity: number;
  reason: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4300)`);
    const sourceMovementId = `${input.transferId}-out`;
    const targetMovementId = `${input.transferId}-in`;
    const [existing] = await tx.select().from(inventoryMovement).where(eq(inventoryMovement.id, sourceMovementId)).limit(1);
    if (existing) return { status: existing.correlationId === input.transferId ? "ok" as const : "conflict" as const, duplicate: true, ledger: null };
    const [source] = await tx.select().from(inventoryLot).where(eq(inventoryLot.id, input.sourceLotId)).limit(1);
    if (!source) return { status: "missing" as const, reason: "Unknown source lot." };
    if (source.locationId === input.targetLocationId) return { status: "invalid" as const, reason: "Transfer destination must be a different clinic." };
    const leave = lotCanLeaveStock(source.status as InventoryLotStatus, source.expiryOn, input.at);
    if (!leave.ok) return { status: "conflict" as const, reason: leave.reason };
    const sourceBefore = await onHand(tx, source.id);
    if (input.quantity > sourceBefore) return { status: "conflict" as const, reason: "Transfer quantity exceeds stock on hand." };
    const [targetExisting] = await tx.select().from(inventoryLot).where(eq(inventoryLot.id, input.targetLotId)).limit(1);
    if (targetExisting && (targetExisting.sku !== source.sku || targetExisting.lotNumber !== source.lotNumber || targetExisting.locationId !== input.targetLocationId ||
      targetExisting.unitLabel !== source.unitLabel || targetExisting.expiryOn !== source.expiryOn ||
      targetExisting.requiresPrescription !== source.requiresPrescription || targetExisting.controlledSchedule !== source.controlledSchedule)) {
      return { status: "conflict" as const, reason: "Destination lot identity conflicts with the source lot." };
    }
    if (targetExisting && targetExisting.status !== "active" && targetExisting.status !== "depleted") return { status: "conflict" as const, reason: `Destination lot is ${targetExisting.status}.` };
    if (!targetExisting) await tx.insert(inventoryLot).values({
      id: input.targetLotId, sku: source.sku, lotNumber: source.lotNumber, locationId: input.targetLocationId,
      unitLabel: source.unitLabel, expiryOn: source.expiryOn, unitCostCents: source.unitCostCents,
      vendorRef: source.vendorRef, requiresPrescription: source.requiresPrescription,
      controlledSchedule: source.controlledSchedule, status: "active", receivedAt: new Date(input.at), createdBy: input.actorId,
    });
    const targetBefore = targetExisting ? await onHand(tx, targetExisting.id) : 0;
    const ledger = await appendLedgerInTx(tx, {
      actorId: input.actorId, actorName: input.actorName, actorRole: input.actorRole,
      action: "update", entity: "inventory-movement", entityId: input.transferId,
      locationId: source.locationId as LedgerDraft["locationId"], reason: input.reason,
      before: { sourceLotId: source.id, sourceOnHand: sourceBefore, targetLotId: input.targetLotId, targetOnHand: targetBefore },
      after: { quantity: input.quantity, sourceOnHand: sourceBefore - input.quantity, targetOnHand: targetBefore + input.quantity, targetLocationId: input.targetLocationId },
    }, input.at);
    await tx.insert(inventoryMovement).values([
      { id: sourceMovementId, sku: source.sku, lotNumber: source.lotNumber, locationId: source.locationId, kind: "transfer-out", quantityDelta: -input.quantity, expiryOn: source.expiryOn, reason: input.reason, staffId: input.actorId, at: new Date(input.at), inventoryLotId: source.id, correlationId: input.transferId, ledgerId: ledger.id },
      { id: targetMovementId, sku: source.sku, lotNumber: source.lotNumber, locationId: input.targetLocationId, kind: "transfer-in", quantityDelta: input.quantity, expiryOn: source.expiryOn, reason: input.reason, staffId: input.actorId, at: new Date(input.at), inventoryLotId: input.targetLotId, correlationId: input.transferId, ledgerId: ledger.id },
    ]);
    if (sourceBefore === input.quantity) await tx.update(inventoryLot).set({ status: "depleted" }).where(eq(inventoryLot.id, source.id));
    if (targetExisting?.status === "depleted") await tx.update(inventoryLot).set({ status: "active" }).where(eq(inventoryLot.id, input.targetLotId));
    if (!targetExisting) await tx.update(inventoryLot).set({ ledgerId: ledger.id }).where(eq(inventoryLot.id, input.targetLotId));
    return { status: "ok" as const, duplicate: false, ledger };
  });
}

export async function dispenseInventoryWithLedger(input: {
  dispenseId: string;
  movementId: string;
  lotId: string;
  clientId: string;
  prescriptionId?: string;
  orderId?: string;
  quantity: number;
  method: "shipped" | "picked-up" | "administered-in-clinic";
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4300)`);
    const [existing] = await tx.select().from(dispense).where(eq(dispense.id, input.dispenseId)).limit(1);
    if (existing) {
      const same = existing.clientId === input.clientId && existing.inventoryLotId === input.lotId && existing.quantity === input.quantity && existing.method === input.method;
      return { status: same ? "ok" as const : "conflict" as const, duplicate: same, dispense: same ? existing : null, ledger: null };
    }
    const [person] = await tx.select().from(client).where(eq(client.id, input.clientId)).limit(1);
    if (!person || person.status !== "active" || person.isProspect) return { status: "missing" as const, reason: "Unknown active patient." };
    const [lot] = await tx.select().from(inventoryLot).where(eq(inventoryLot.id, input.lotId)).limit(1);
    if (!lot) return { status: "missing" as const, reason: "Unknown inventory lot." };
    const leave = lotCanLeaveStock(lot.status as InventoryLotStatus, lot.expiryOn, input.at);
    if (!leave.ok) return { status: "conflict" as const, reason: leave.reason };
    const before = await onHand(tx, lot.id);
    if (input.quantity > before) return { status: "conflict" as const, reason: "Dispense quantity exceeds stock on hand." };

    let rx: typeof prescription.$inferSelect | null = null;
    if (input.prescriptionId) {
      [rx] = await tx.select().from(prescription).where(eq(prescription.id, input.prescriptionId)).limit(1) as [typeof prescription.$inferSelect];
      if (!rx || rx.clientId !== input.clientId || rx.sku !== lot.sku || rx.status !== "active") return { status: "conflict" as const, reason: "An active matching prescription is required." };
      if (lot.controlledSchedule && rx.scheduleClass !== lot.controlledSchedule) return { status: "conflict" as const, reason: "The prescription schedule does not match the controlled inventory lot." };
      if (rx.expiresOn && rx.expiresOn < input.at.slice(0, 10)) return { status: "conflict" as const, reason: "The prescription has expired." };
      if (rx.quantityAuthorised !== null && input.quantity > rx.quantityAuthorised) return { status: "conflict" as const, reason: "Dispense quantity exceeds the prescription." };
      const prior = await tx.select({ id: dispense.id }).from(dispense).where(eq(dispense.prescriptionId, rx.id));
      if (rx.refillsAuthorised !== null && prior.length >= rx.refillsAuthorised + 1) return { status: "conflict" as const, reason: "Authorized fills are exhausted." };
      if (rx.scheduleClass) {
        if (!rx.prescriberDea) return { status: "conflict" as const, reason: "Controlled prescription has no identity-bound DEA evidence." };
        const cutoff = new Date(new Date(input.at).getTime() - 90 * 86_400_000);
        const [pdmp] = await tx.select().from(pdmpCheck).where(and(eq(pdmpCheck.clientId, input.clientId), eq(pdmpCheck.result, "clear"))).orderBy(desc(pdmpCheck.checkedAt)).limit(1);
        if (!pdmp || pdmp.checkedAt < cutoff) return { status: "conflict" as const, reason: "A clear PDMP check within 90 days is required." };
      }
    } else if (lot.requiresPrescription || lot.controlledSchedule) {
      return { status: "conflict" as const, reason: "This lot requires a matching prescription." };
    }

    const ledger = await appendLedgerInTx(tx, {
      actorId: input.actorId, actorName: input.actorName, actorRole: input.actorRole,
      action: "create", entity: "dispense", entityId: input.dispenseId,
      subjectId: input.clientId, locationId: lot.locationId as LedgerDraft["locationId"],
      reason: `${input.method} from verified lot stock.`,
      before: { lotId: lot.id, onHand: before },
      after: { lotId: lot.id, sku: lot.sku, lotNumber: lot.lotNumber, quantity: input.quantity, onHand: before - input.quantity, prescriptionId: input.prescriptionId, orderId: input.orderId },
    }, input.at);
    const [created] = await tx.insert(dispense).values({
      id: input.dispenseId, clientId: input.clientId, prescriptionId: input.prescriptionId ?? null,
      sku: lot.sku, lotNumber: lot.lotNumber, expiryOn: lot.expiryOn, quantity: input.quantity,
      method: input.method, locationId: lot.locationId, dispensedBy: input.actorId,
      dispensedAt: new Date(input.at), orderId: input.orderId ?? null, ledgerId: ledger.id, inventoryLotId: lot.id,
    }).returning();
    await tx.insert(inventoryMovement).values({
      id: input.movementId, sku: lot.sku, lotNumber: lot.lotNumber, locationId: lot.locationId,
      kind: "dispense", quantityDelta: -input.quantity, expiryOn: lot.expiryOn,
      reason: `${input.method} to patient.`, staffId: input.actorId, at: new Date(input.at),
      dispenseId: created.id, inventoryLotId: lot.id, correlationId: created.id, ledgerId: ledger.id,
    });
    if (rx) {
      const prior = await tx.select({ id: dispense.id }).from(dispense).where(eq(dispense.prescriptionId, rx.id));
      await tx.update(prescription).set({ refillsUsed: Math.max(0, prior.length - 1) }).where(eq(prescription.id, rx.id));
    }
    if (before === input.quantity) await tx.update(inventoryLot).set({ status: "depleted" }).where(eq(inventoryLot.id, lot.id));
    return { status: "ok" as const, duplicate: false, dispense: created, ledger };
  });
}

export async function recallInventoryWithLedger(input: {
  recallId: string;
  sku: string;
  lotNumber: string;
  noticeRef: string;
  reason: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4300)`);
    const [existing] = await tx.select().from(inventoryRecall).where(eq(inventoryRecall.id, input.recallId)).limit(1);
    if (existing) {
      const same = existing.sku === input.sku && existing.lotNumber === input.lotNumber && existing.noticeRef === input.noticeRef && existing.reason === input.reason;
      return { status: same ? "ok" as const : "conflict" as const, duplicate: same, recall: same ? existing : null, ledger: null };
    }
    const [openForLot] = await tx.select().from(inventoryRecall).where(and(
      eq(inventoryRecall.sku, input.sku),
      eq(inventoryRecall.lotNumber, input.lotNumber),
      eq(inventoryRecall.status, "open"),
    )).limit(1);
    if (openForLot) {
      const same = openForLot.noticeRef === input.noticeRef && openForLot.reason === input.reason;
      return { status: same ? "ok" as const : "conflict" as const, duplicate: same, recall: same ? openForLot : null, ledger: null };
    }
    const lots = await tx.select().from(inventoryLot).where(and(eq(inventoryLot.sku, input.sku), eq(inventoryLot.lotNumber, input.lotNumber)));
    const affected = await tx.select({ id: dispense.id }).from(dispense).where(and(eq(dispense.sku, input.sku), eq(dispense.lotNumber, input.lotNumber)));
    const ledger = await appendLedgerInTx(tx, {
      actorId: input.actorId, actorName: input.actorName, actorRole: input.actorRole,
      action: "create", entity: "inventory-recall", entityId: input.recallId,
      reason: input.reason,
      after: { sku: input.sku, lotNumber: input.lotNumber, noticeRef: input.noticeRef, lotLocations: lots.map((lot) => lot.locationId), affectedDispenses: affected.length, status: "open" },
    }, input.at);
    const [recall] = await tx.insert(inventoryRecall).values({
      id: input.recallId, sku: input.sku, lotNumber: input.lotNumber, noticeRef: input.noticeRef,
      reason: input.reason, status: "open", initiatedAt: new Date(input.at), initiatedBy: input.actorId, ledgerId: ledger.id,
    }).returning();
    if (lots.length) await tx.update(inventoryLot).set({ status: "recalled", ledgerId: ledger.id }).where(inArray(inventoryLot.id, lots.map((lot) => lot.id)));
    return { status: "ok" as const, duplicate: false, recall, affectedDispenses: affected.length, ledger };
  });
}

export async function readRecallRecipients(recallId: string, locationIds: string[]) {
  const db = requireDb();
  const [recall] = await db.select().from(inventoryRecall).where(eq(inventoryRecall.id, recallId)).limit(1);
  if (!recall || !locationIds.length) return recall ? { recall, recipients: [] } : null;
  const recipients = await db.select({
    dispenseId: dispense.id,
    clientId: client.id,
    firstName: client.firstName,
    lastName: client.lastName,
    preferredName: client.preferredName,
    email: client.email,
    phone: client.phone,
    locationId: dispense.locationId,
    quantity: dispense.quantity,
    method: dispense.method,
    dispensedAt: dispense.dispensedAt,
  }).from(dispense).innerJoin(client, eq(dispense.clientId, client.id)).where(and(
    eq(dispense.sku, recall.sku), eq(dispense.lotNumber, recall.lotNumber), inArray(dispense.locationId, locationIds),
  )).orderBy(desc(dispense.dispensedAt));
  return { recall, recipients };
}
