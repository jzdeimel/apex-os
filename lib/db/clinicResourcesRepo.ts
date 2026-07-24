import { and, asc, eq, gt, inArray, lt, ne, or, sql as raw } from "drizzle-orm";

import { requireDb } from "@/lib/db/client";
import {
  appointment,
  clinicResource,
  encounter,
  resourceReservation,
} from "@/lib/db/schema";
import { appendLedgerInTx } from "@/lib/db/repo";
import {
  reservationTransitionAllowed,
  resourceSuitableForVisit,
  type ReservationStatus,
} from "@/lib/clinic-resources/lifecycle";
import type { LedgerDraft } from "@/lib/trace/ledger";

const ACTIVE_RESERVATIONS = ["reserved", "in-use"];

export async function readClinicResourceScope(id: string) {
  const db = requireDb();
  const [resource] = await db.select().from(clinicResource).where(eq(clinicResource.id, id)).limit(1);
  return resource ?? null;
}

export async function readResourceReservationScope(id: string) {
  const db = requireDb();
  const [row] = await db
    .select({ reservation: resourceReservation, locationId: clinicResource.locationId })
    .from(resourceReservation)
    .innerJoin(clinicResource, eq(resourceReservation.resourceId, clinicResource.id))
    .where(eq(resourceReservation.id, id))
    .limit(1);
  return row ?? null;
}

export async function readClinicResources(input: {
  locationIds: string[];
  from?: Date;
  to?: Date;
}) {
  const db = requireDb();
  if (!input.locationIds.length) return { resources: [], reservations: [] };
  const resources = await db
    .select()
    .from(clinicResource)
    .where(inArray(clinicResource.locationId, input.locationIds))
    .orderBy(asc(clinicResource.locationId), asc(clinicResource.label));
  const ids = resources.map((row) => row.id);
  if (!ids.length || !input.from || !input.to) return { resources, reservations: [] };
  const reservations = await db
    .select()
    .from(resourceReservation)
    .where(and(
      inArray(resourceReservation.resourceId, ids),
      lt(resourceReservation.startAt, input.to),
      gt(resourceReservation.endAt, input.from),
      ne(resourceReservation.status, "cancelled"),
    ))
    .orderBy(asc(resourceReservation.startAt));
  return { resources, reservations };
}

export async function createClinicResourceWithLedger(input: {
  id: string;
  locationId: string;
  label: string;
  resourceType: string;
  kind: string;
  capacity: number;
  note?: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4270)`);
    const [existing] = await tx.select().from(clinicResource).where(eq(clinicResource.id, input.id)).limit(1);
    if (existing) {
      const same = existing.locationId === input.locationId && existing.label === input.label &&
        existing.resourceType === input.resourceType && existing.kind === input.kind &&
        existing.capacity === input.capacity && (existing.note ?? "") === (input.note ?? "");
      return { status: same ? "ok" as const : "conflict" as const, resource: same ? existing : null, duplicate: same, ledger: null };
    }
    const [sameLabel] = await tx.select({ id: clinicResource.id }).from(clinicResource).where(and(
      eq(clinicResource.locationId, input.locationId),
      eq(clinicResource.label, input.label),
    )).limit(1);
    if (sameLabel) return { status: "conflict" as const, resource: null, duplicate: false, ledger: null };
    const [resource] = await tx.insert(clinicResource).values({
      id: input.id,
      locationId: input.locationId,
      label: input.label,
      resourceType: input.resourceType,
      kind: input.kind,
      capacity: input.capacity,
      note: input.note ?? null,
      createdAt: new Date(input.at),
      updatedAt: new Date(input.at),
    }).returning();
    const ledger = await appendLedgerInTx(tx, {
      actorId: input.actorId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "create",
      entity: "clinic-resource",
      entityId: resource.id,
      locationId: input.locationId as LedgerDraft["locationId"],
      reason: "Configured a schedulable clinic resource.",
      after: { label: resource.label, resourceType: resource.resourceType, kind: resource.kind, capacity: resource.capacity, status: resource.status },
    }, input.at);
    return { status: "ok" as const, resource, duplicate: false, ledger };
  });
}

export async function updateClinicResourceWithLedger(input: {
  id: string;
  status?: string;
  label?: string;
  kind?: string;
  capacity?: number;
  note?: string | null;
  reason: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4270)`);
    const [current] = await tx.select().from(clinicResource).where(eq(clinicResource.id, input.id)).limit(1);
    if (!current) return { status: "missing" as const };
    if ((input.status && input.status !== "active") || (input.kind && input.kind !== current.kind)) {
      const active = await tx.select({ id: resourceReservation.id }).from(resourceReservation).where(and(
        eq(resourceReservation.resourceId, current.id),
        inArray(resourceReservation.status, ACTIVE_RESERVATIONS),
        gt(resourceReservation.endAt, new Date(input.at)),
      )).limit(1);
      if (active.length) return { status: "conflict" as const, reason: "Release or move active reservations before changing this resource's service state or clinical use." };
    }
    if (input.label && input.label !== current.label) {
      const duplicate = await tx.select({ id: clinicResource.id }).from(clinicResource).where(and(
        eq(clinicResource.locationId, current.locationId),
        eq(clinicResource.label, input.label),
        ne(clinicResource.id, current.id),
      )).limit(1);
      if (duplicate.length) return { status: "conflict" as const, reason: "Another resource at this clinic already uses that label." };
    }
    const changes = {
      status: input.status ?? current.status,
      label: input.label ?? current.label,
      kind: input.kind ?? current.kind,
      capacity: input.capacity ?? current.capacity,
      note: input.note === undefined ? current.note : input.note,
      updatedAt: new Date(input.at),
    };
    const [resource] = await tx.update(clinicResource).set(changes).where(eq(clinicResource.id, input.id)).returning();
    const ledger = await appendLedgerInTx(tx, {
      actorId: input.actorId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "update",
      entity: "clinic-resource",
      entityId: current.id,
      locationId: current.locationId as LedgerDraft["locationId"],
      reason: input.reason,
      before: { label: current.label, kind: current.kind, capacity: current.capacity, status: current.status, note: current.note },
      after: { label: resource.label, kind: resource.kind, capacity: resource.capacity, status: resource.status, note: resource.note },
    }, input.at);
    return { status: "ok" as const, resource, ledger };
  });
}

export async function reserveClinicResourceWithLedger(input: {
  id: string;
  resourceId: string;
  appointmentId?: string;
  encounterId?: string;
  startAt: Date;
  endAt: Date;
  status?: "reserved" | "in-use";
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4271)`);
    const [resource] = await tx.select().from(clinicResource).where(eq(clinicResource.id, input.resourceId)).limit(1);
    if (!resource) return { status: "missing" as const, reason: "Unknown clinic resource." };
    if (resource.status !== "active") return { status: "conflict" as const, reason: "This resource is not in service." };
    if (!input.appointmentId && !input.encounterId) return { status: "invalid" as const, reason: "A reservation must belong to an appointment or encounter." };
    if (input.endAt <= input.startAt) return { status: "invalid" as const, reason: "Reservation end must be after its start." };
    if (input.endAt.getTime() - input.startAt.getTime() > 24 * 3_600_000) return { status: "invalid" as const, reason: "A resource reservation cannot exceed 24 hours." };
    let subjectId: string | undefined;
    if (input.appointmentId) {
      const [appt] = await tx.select().from(appointment).where(eq(appointment.id, input.appointmentId)).limit(1);
      if (!appt) return { status: "missing" as const, reason: "Unknown appointment." };
      if (appt.locationId !== resource.locationId) return { status: "conflict" as const, reason: "The resource belongs to a different clinic." };
      if (!resourceSuitableForVisit(resource.kind, appt.visitType)) return { status: "conflict" as const, reason: `${resource.label} is not configured for ${appt.visitType}.` };
      subjectId = appt.clientId;
    }
    if (input.encounterId) {
      const [visit] = await tx.select().from(encounter).where(eq(encounter.id, input.encounterId)).limit(1);
      if (!visit) return { status: "missing" as const, reason: "Unknown encounter." };
      if (visit.locationId !== resource.locationId) return { status: "conflict" as const, reason: "The resource belongs to a different clinic than the encounter." };
      if (input.appointmentId && visit.appointmentId && visit.appointmentId !== input.appointmentId) return { status: "conflict" as const, reason: "The encounter does not belong to that appointment." };
      subjectId = visit.clientId;
    }
    const [existing] = await tx.select().from(resourceReservation).where(eq(resourceReservation.id, input.id)).limit(1);
    if (existing) {
      const same = existing.resourceId === input.resourceId && existing.appointmentId === (input.appointmentId ?? null) &&
        existing.encounterId === (input.encounterId ?? null) && existing.startAt.getTime() === input.startAt.getTime() &&
        existing.endAt.getTime() === input.endAt.getTime() && existing.status === (input.status ?? "reserved");
      return { status: same ? "ok" as const : "conflict" as const, reservation: same ? existing : null, duplicate: same, ledger: null };
    }
    const overlap = await tx.select({ id: resourceReservation.id }).from(resourceReservation).where(and(
      eq(resourceReservation.resourceId, input.resourceId),
      inArray(resourceReservation.status, ACTIVE_RESERVATIONS),
      lt(resourceReservation.startAt, input.endAt),
      gt(resourceReservation.endAt, input.startAt),
    )).limit(1);
    if (overlap.length) return { status: "conflict" as const, reason: "This resource is already reserved during that time." };
    const [reservation] = await tx.insert(resourceReservation).values({
      id: input.id,
      resourceId: input.resourceId,
      appointmentId: input.appointmentId ?? null,
      encounterId: input.encounterId ?? null,
      status: input.status ?? "reserved",
      startAt: input.startAt,
      endAt: input.endAt,
      reservedBy: input.actorId,
      reservedAt: new Date(input.at),
      checkedInAt: input.status === "in-use" ? new Date(input.at) : null,
    }).returning();
    const ledger = await appendLedgerInTx(tx, {
      actorId: input.actorId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "create",
      entity: "resource-reservation",
      entityId: reservation.id,
      subjectId,
      locationId: resource.locationId as LedgerDraft["locationId"],
      reason: input.status === "in-use" ? "Assigned resource during rooming." : "Reserved clinic resource.",
      after: { resourceId: resource.id, appointmentId: input.appointmentId, encounterId: input.encounterId, startAt: input.startAt.toISOString(), endAt: input.endAt.toISOString(), status: reservation.status },
    }, input.at);
    await tx.update(resourceReservation).set({ ledgerId: ledger.id }).where(eq(resourceReservation.id, reservation.id));
    return { status: "ok" as const, reservation: { ...reservation, ledgerId: ledger.id }, duplicate: false, ledger };
  });
}

export async function releaseClinicResourceWithLedger(input: {
  id: string;
  reason: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4271)`);
    const [current] = await tx.select().from(resourceReservation).where(eq(resourceReservation.id, input.id)).limit(1);
    if (!current) return { status: "missing" as const };
    const from = current.status as ReservationStatus;
    if (!reservationTransitionAllowed(from, "released")) return { status: "conflict" as const, reason: `${current.status} reservations cannot be released.` };
    const [resource] = await tx.select().from(clinicResource).where(eq(clinicResource.id, current.resourceId)).limit(1);
    const releasedAt = new Date(input.at);
    const candidateEnd = current.endAt > releasedAt ? releasedAt : current.endAt;
    const actualEnd = candidateEnd > current.startAt ? candidateEnd : new Date(current.startAt.getTime() + 1);
    const [reservation] = await tx.update(resourceReservation).set({
      status: "released",
      releasedAt,
      endAt: actualEnd,
      releaseReason: input.reason,
    }).where(eq(resourceReservation.id, input.id)).returning();
    const ledger = await appendLedgerInTx(tx, {
      actorId: input.actorId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "update",
      entity: "resource-reservation",
      entityId: current.id,
      locationId: resource?.locationId as LedgerDraft["locationId"],
      reason: input.reason,
      before: { status: current.status, endAt: current.endAt.toISOString() },
      after: { status: "released", endAt: reservation.endAt.toISOString(), releasedAt: releasedAt.toISOString() },
    }, input.at);
    return { status: "ok" as const, reservation, ledger };
  });
}
