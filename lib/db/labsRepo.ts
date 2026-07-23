import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, ne, sql as raw } from "drizzle-orm";

import { requireDb } from "@/lib/db/client";
import {
  client,
  clinicLocation,
  labCriticalAlert,
  labObservation,
  labOrder,
  labResult,
  labResultRelease,
  labReview,
  labSpecimen,
} from "@/lib/db/schema";
import { appendLedgerInTx } from "@/lib/db/repo";
import {
  isObservationFlag,
  labOrderTransitionAllowed,
  patientReleaseVerdict,
  resultRisk,
  type LabObservationFlag,
  type LabResultStatus,
} from "@/lib/labs/lifecycle";
import type { LedgerDraft } from "@/lib/trace/ledger";

type DbTx = Parameters<Parameters<ReturnType<typeof requireDb>["transaction"]>[0]>[0];

export type LabObservationInput = {
  codeSystem?: string;
  code?: string;
  name: string;
  valueText?: string;
  valueNumeric?: number;
  unit?: string;
  referenceRange?: string;
  flag: LabObservationFlag;
  critical?: boolean;
  sourcePage?: number;
  sourceRegion?: unknown;
};

const locationFor = (locationId: string) => locationId as LedgerDraft["locationId"];

export async function readLabOrders(input: { clientId?: string; locationId?: string } = {}) {
  const db = requireDb();
  return db
    .select({
      order: labOrder,
      clientFirstName: client.firstName,
      clientLastName: client.lastName,
      clientPreferredName: client.preferredName,
      locationName: clinicLocation.name,
    })
    .from(labOrder)
    .innerJoin(client, eq(labOrder.clientId, client.id))
    .innerJoin(clinicLocation, eq(labOrder.locationId, clinicLocation.id))
    .where(and(
      input.clientId ? eq(labOrder.clientId, input.clientId) : undefined,
      input.locationId ? eq(labOrder.locationId, input.locationId) : undefined,
    ))
    .orderBy(desc(labOrder.orderedAt));
}

export async function readLabOrderScope(orderId: string) {
  const db = requireDb();
  const [row] = await db
    .select({
      order: labOrder,
      assignedCoachId: client.assignedCoachId,
      assignedProviderId: client.assignedProviderId,
      homeLocationId: client.homeLocationId,
      clientStatus: client.status,
    })
    .from(labOrder)
    .innerJoin(client, eq(labOrder.clientId, client.id))
    .where(eq(labOrder.id, orderId))
    .limit(1);
  return row ?? null;
}

export async function readLabResultScope(resultId: string) {
  const db = requireDb();
  const [row] = await db
    .select({
      result: labResult,
      order: labOrder,
      assignedCoachId: client.assignedCoachId,
      assignedProviderId: client.assignedProviderId,
      homeLocationId: client.homeLocationId,
      clientStatus: client.status,
    })
    .from(labResult)
    .innerJoin(labOrder, eq(labResult.labOrderId, labOrder.id))
    .innerJoin(client, eq(labResult.clientId, client.id))
    .where(eq(labResult.id, resultId))
    .limit(1);
  return row ?? null;
}

export async function readLabResults(clientId: string) {
  const db = requireDb();
  const results = await db.select().from(labResult).where(eq(labResult.clientId, clientId)).orderBy(desc(labResult.resultedAt));
  if (!results.length) return [];
  const ids = results.map((row) => row.id);
  const [observations, reviews, releases, alerts] = await Promise.all([
    db.select().from(labObservation).where(inArray(labObservation.labResultId, ids)).orderBy(labObservation.name),
    db.select().from(labReview).where(inArray(labReview.labResultId, ids)),
    db.select().from(labResultRelease).where(inArray(labResultRelease.labResultId, ids)),
    db.select().from(labCriticalAlert).where(inArray(labCriticalAlert.labResultId, ids)),
  ]);
  return results.map((result) => ({
    result,
    observations: observations.filter((row) => row.labResultId === result.id),
    review: reviews.find((row) => row.labResultId === result.id) ?? null,
    release: releases.find((row) => row.labResultId === result.id) ?? null,
    criticalAlert: alerts.find((row) => row.labResultId === result.id) ?? null,
  }));
}

export async function readPendingLabReviews(locationIds: string[], providerId: string) {
  const db = requireDb();
  if (!locationIds.length) return [];
  const pending = await db
    .select({
      result: labResult,
      order: labOrder,
      clientFirstName: client.firstName,
      clientLastName: client.lastName,
      clientPreferredName: client.preferredName,
      assignedProviderId: client.assignedProviderId,
    })
    .from(labResult)
    .innerJoin(labOrder, eq(labResult.labOrderId, labOrder.id))
    .innerJoin(client, eq(labResult.clientId, client.id))
    .leftJoin(labReview, eq(labReview.labResultId, labResult.id))
    .where(and(
      inArray(labOrder.locationId, locationIds),
      eq(client.assignedProviderId, providerId),
      isNull(labReview.id),
      ne(labResult.status, "preliminary"),
    ))
    .orderBy(desc(labResult.critical), desc(labResult.resultedAt));
  if (!pending.length) return [];
  const ids = pending.map((row) => row.result.id);
  const observations = await db.select().from(labObservation).where(inArray(labObservation.labResultId, ids)).orderBy(labObservation.name);
  return pending.map((row) => ({ ...row, observations: observations.filter((observation) => observation.labResultId === row.result.id) }));
}

export async function readHeldLabReleases(locationIds: string[], providerId: string) {
  const db = requireDb();
  if (!locationIds.length) return [];
  return db
    .select({
      result: labResult,
      order: labOrder,
      review: labReview,
      clientFirstName: client.firstName,
      clientLastName: client.lastName,
      clientPreferredName: client.preferredName,
    })
    .from(labReview)
    .innerJoin(labResult, eq(labReview.labResultId, labResult.id))
    .innerJoin(labOrder, eq(labResult.labOrderId, labOrder.id))
    .innerJoin(client, eq(labResult.clientId, client.id))
    .leftJoin(labResultRelease, eq(labResultRelease.labResultId, labResult.id))
    .where(and(
      inArray(labOrder.locationId, locationIds),
      eq(client.assignedProviderId, providerId),
      eq(labReview.patientReleaseStatus, "held"),
      isNull(labResultRelease.id),
    ))
    .orderBy(desc(labReview.reviewedAt));
}

export async function createLabOrderWithLedger(input: {
  id: string;
  clientId: string;
  encounterId?: string;
  appointmentId?: string;
  locationId: string;
  panelCode: string;
  panelName: string;
  vendor?: string;
  priority: "routine" | "urgent";
  fastingRequired: boolean;
  indications: string;
  instructions?: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4260)`);
    const [existing] = await tx.select().from(labOrder).where(eq(labOrder.id, input.id)).limit(1);
    if (existing) {
      const same = existing.clientId === input.clientId && existing.locationId === input.locationId && existing.panelCode === input.panelCode
        && existing.panelName === input.panelName && existing.priority === input.priority && existing.fastingRequired === input.fastingRequired
        && existing.indications === input.indications && (existing.vendor ?? "") === (input.vendor ?? "");
      return same
        ? { status: "ok" as const, duplicate: true, order: existing, ledger: null }
        : { status: "conflict" as const, reason: "That idempotency key was already used for a different lab order." };
    }
    const [[patient], [clinic]] = await Promise.all([
      tx.select({ status: client.status, homeLocationId: client.homeLocationId }).from(client).where(eq(client.id, input.clientId)).limit(1),
      tx.select({ active: clinicLocation.active }).from(clinicLocation).where(eq(clinicLocation.id, input.locationId)).limit(1),
    ]);
    if (!patient || patient.status !== "active") return { status: "invalid" as const, reason: "The patient is not active in Apex." };
    if (!clinic?.active) return { status: "invalid" as const, reason: "The ordering clinic is not active." };
    if (patient.homeLocationId !== input.locationId) return { status: "conflict" as const, reason: "The lab order clinic must match the patient's owning clinic." };

    const ledger = await appendLedgerInTx(tx, {
      actorId: input.actorId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "create",
      entity: "lab-order",
      entityId: input.id,
      subjectId: input.clientId,
      locationId: locationFor(input.locationId),
      reason: "Licensed provider ordered laboratory testing",
      after: { panelCode: input.panelCode, priority: input.priority, fastingRequired: input.fastingRequired, status: "ordered" },
    }, input.at);
    const [order] = await tx.insert(labOrder).values({
      id: input.id,
      clientId: input.clientId,
      encounterId: input.encounterId ?? null,
      appointmentId: input.appointmentId ?? null,
      locationId: input.locationId,
      panelCode: input.panelCode,
      panelName: input.panelName,
      vendor: input.vendor ?? null,
      priority: input.priority,
      fastingRequired: input.fastingRequired,
      indications: input.indications,
      instructions: input.instructions ?? null,
      status: "ordered",
      orderedBy: input.actorId,
      orderedAt: new Date(input.at),
      ledgerId: ledger.id,
    }).returning();
    return { status: "ok" as const, duplicate: false, order, ledger };
  });
}

export async function cancelLabOrderWithLedger(input: {
  orderId: string;
  reason: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4260)`);
    const [order] = await tx.select().from(labOrder).where(eq(labOrder.id, input.orderId)).limit(1);
    if (!order) return { status: "missing" as const, reason: "Unknown lab order." };
    if (order.status === "cancelled") return { status: "ok" as const, duplicate: true, order, ledger: null };
    if (!labOrderTransitionAllowed(order.status, "cancelled")) return { status: "conflict" as const, reason: `A ${order.status} order can no longer be cancelled.` };
    if (!input.reason.trim()) return { status: "invalid" as const, reason: "A cancellation reason is required." };
    const at = new Date(input.at);
    const ledger = await appendLedgerInTx(tx, {
      actorId: input.actorId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "update",
      entity: "lab-order",
      entityId: order.id,
      subjectId: order.clientId,
      locationId: locationFor(order.locationId),
      reason: `Lab order cancelled: ${input.reason.trim()}`,
      before: { status: order.status },
      after: { status: "cancelled" },
    }, input.at);
    const [cancelled] = await tx.update(labOrder).set({
      status: "cancelled",
      cancelledBy: input.actorId,
      cancelledAt: at,
      cancelReason: input.reason.trim(),
    }).where(eq(labOrder.id, order.id)).returning();
    return { status: "ok" as const, duplicate: false, order: cancelled, ledger };
  });
}

export async function collectLabSpecimenWithLedger(input: {
  id: string;
  orderId: string;
  accession: string;
  vendor: string;
  specimenType: string;
  collectedAt: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4260)`);
    const [existing] = await tx.select().from(labSpecimen).where(eq(labSpecimen.id, input.id)).limit(1);
    if (existing) {
      const same = existing.labOrderId === input.orderId && existing.accession === input.accession && existing.vendor === input.vendor
        && existing.specimenType === input.specimenType;
      return same
        ? { status: "ok" as const, duplicate: true, specimen: existing, ledger: null }
        : { status: "conflict" as const, reason: "That idempotency key was already used for a different specimen." };
    }
    const [order] = await tx.select().from(labOrder).where(eq(labOrder.id, input.orderId)).limit(1);
    if (!order) return { status: "missing" as const, reason: "Unknown lab order." };
    if (!labOrderTransitionAllowed(order.status, "collected")) return { status: "conflict" as const, reason: `A ${order.status} order cannot accept a new collection.` };
    const [accessionOwner] = await tx.select({ id: labSpecimen.id }).from(labSpecimen)
      .where(and(eq(labSpecimen.vendor, input.vendor), eq(labSpecimen.accession, input.accession))).limit(1);
    if (accessionOwner) return { status: "conflict" as const, reason: "That vendor accession is already attached to another specimen." };
    const collectedAt = new Date(input.collectedAt);
    if (Number.isNaN(collectedAt.getTime())) return { status: "invalid" as const, reason: "The collection time is invalid." };

    const ledger = await appendLedgerInTx(tx, {
      actorId: input.actorId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "update",
      entity: "lab-order",
      entityId: order.id,
      subjectId: order.clientId,
      locationId: locationFor(order.locationId),
      reason: "Specimen identity and collection recorded",
      before: { status: order.status },
      after: { status: "collected", specimenId: input.id, vendor: input.vendor },
    }, input.at);
    const [specimen] = await tx.insert(labSpecimen).values({
      id: input.id,
      labOrderId: input.orderId,
      accession: input.accession,
      vendor: input.vendor,
      specimenType: input.specimenType,
      status: "collected",
      collectedBy: input.actorId,
      collectedAt,
      ledgerId: ledger.id,
    }).returning();
    await tx.update(labOrder).set({ status: "collected" }).where(eq(labOrder.id, order.id));
    return { status: "ok" as const, duplicate: false, specimen, ledger };
  });
}

function contentHash(observations: LabObservationInput[]) {
  return createHash("sha256").update(JSON.stringify(observations)).digest("hex");
}

async function validateCorrection(tx: DbTx, input: { status: LabResultStatus; supersedesId?: string; orderId: string }) {
  if (input.status !== "corrected") return input.supersedesId ? "Only a corrected result may supersede another result." : null;
  if (!input.supersedesId) return "A corrected result must identify the result it supersedes.";
  const [prior] = await tx.select().from(labResult).where(eq(labResult.id, input.supersedesId)).limit(1);
  return !prior || prior.labOrderId !== input.orderId || prior.status === "preliminary"
    ? "The superseded final result was not found on this order."
    : null;
}

export async function recordLabResultWithLedger(input: {
  id: string;
  orderId: string;
  clientId: string;
  vendor: string;
  externalResultId: string;
  status: LabResultStatus;
  resultedAt: string;
  sourceArtifactId?: string;
  supersedesId?: string;
  observations: LabObservationInput[];
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}) {
  const db = requireDb();
  const sourceHash = contentHash(input.observations);
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4260)`);
    const [existing] = await tx.select().from(labResult).where(eq(labResult.id, input.id)).limit(1);
    if (existing) {
      const same = existing.labOrderId === input.orderId && existing.clientId === input.clientId && existing.sourceHash === sourceHash
        && existing.vendor === input.vendor && existing.externalResultId === input.externalResultId && existing.status === input.status;
      return same
        ? { status: "ok" as const, duplicate: true, result: existing, ledger: null }
        : { status: "conflict" as const, reason: "That idempotency key was already used for different lab result content." };
    }
    const [order] = await tx.select().from(labOrder).where(eq(labOrder.id, input.orderId)).limit(1);
    if (!order || order.clientId !== input.clientId) return { status: "missing" as const, reason: "The lab order does not belong to this patient." };
    if (!input.observations.length) return { status: "invalid" as const, reason: "At least one observation is required." };
    if (input.observations.some((row) => !isObservationFlag(row.flag))) return { status: "invalid" as const, reason: "An observation has an unsupported result flag." };
    const correctionError = await validateCorrection(tx, { status: input.status, supersedesId: input.supersedesId, orderId: order.id });
    if (correctionError) return { status: "conflict" as const, reason: correctionError };
    if (!["collected", "in-transit", "partial", "resulted", "reviewed"].includes(order.status)) {
      return { status: "conflict" as const, reason: `A result cannot be attached while the order is ${order.status}.` };
    }
    if (order.status === "resulted" && input.status !== "corrected") {
      return { status: "conflict" as const, reason: "This order already has a final result; a later version must be recorded as corrected and identify the result it supersedes." };
    }
    const nextOrderState = input.status === "preliminary" ? "partial" as const : "resulted" as const;
    if (order.status !== nextOrderState && !labOrderTransitionAllowed(order.status, nextOrderState)) {
      return { status: "conflict" as const, reason: `The order cannot move from ${order.status} to ${nextOrderState}.` };
    }
    const resultedAt = new Date(input.resultedAt);
    if (Number.isNaN(resultedAt.getTime())) return { status: "invalid" as const, reason: "The result time is invalid." };
    const risk = resultRisk(input.observations);

    const ledger = await appendLedgerInTx(tx, {
      actorId: input.actorId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "create",
      entity: "lab-result",
      entityId: input.id,
      subjectId: input.clientId,
      locationId: locationFor(order.locationId),
      reason: input.status === "corrected" ? "Corrected vendor result recorded; provider re-review required" : "Vendor result recorded; provider review required",
      after: { orderId: order.id, status: input.status, observationCount: input.observations.length, abnormal: risk.abnormal, critical: risk.critical, sourceHash },
    }, input.at);
    const [result] = await tx.insert(labResult).values({
      id: input.id,
      labOrderId: order.id,
      clientId: input.clientId,
      vendor: input.vendor,
      externalResultId: input.externalResultId,
      status: input.status,
      resultedAt,
      receivedAt: new Date(input.at),
      abnormal: risk.abnormal,
      critical: risk.critical,
      sourceHash,
      sourceArtifactId: input.sourceArtifactId ?? null,
      supersedesId: input.supersedesId ?? null,
      recordedBy: input.actorId,
      ledgerId: ledger.id,
    }).returning();
    await tx.insert(labObservation).values(input.observations.map((row, index) => ({
      id: `${input.id}-obs-${String(index + 1).padStart(3, "0")}`,
      labResultId: input.id,
      codeSystem: row.codeSystem ?? null,
      code: row.code ?? null,
      name: row.name,
      valueText: row.valueText ?? null,
      valueNumeric: row.valueNumeric ?? null,
      unit: row.unit ?? null,
      referenceRange: row.referenceRange ?? null,
      flag: row.flag,
      critical: row.critical || row.flag === "critical-low" || row.flag === "critical-high",
      sourcePage: row.sourcePage ?? null,
      sourceRegion: row.sourceRegion ?? null,
    })));
    if (risk.critical) {
      await tx.insert(labCriticalAlert).values({
        id: `lbc-${input.id.slice(4)}`,
        labResultId: input.id,
        status: "open",
        openedAt: new Date(input.at),
        ledgerId: ledger.id,
      });
    }
    await tx.update(labOrder).set({ status: nextOrderState }).where(eq(labOrder.id, order.id));
    return { status: "ok" as const, duplicate: false, result, risk, ledger };
  });
}

export async function reviewLabResultWithLedger(input: {
  id: string;
  resultId: string;
  summary: string;
  followUp?: string;
  criticalAcknowledged: boolean;
  releaseToPatient: boolean;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4260)`);
    const [existing] = await tx.select().from(labReview).where(eq(labReview.id, input.id)).limit(1);
    if (existing) {
      const expectedRelease = input.releaseToPatient ? "released" : "held";
      const same = existing.labResultId === input.resultId && existing.reviewerId === input.actorId
        && existing.summary === input.summary.trim() && (existing.followUp ?? "") === (input.followUp?.trim() ?? "")
        && existing.criticalAcknowledged === input.criticalAcknowledged && existing.patientReleaseStatus === expectedRelease;
      return same
        ? { status: "ok" as const, duplicate: true, review: existing, ledger: null }
        : { status: "conflict" as const, reason: "That idempotency key was already used for a different lab review." };
    }
    const [result] = await tx.select().from(labResult).where(eq(labResult.id, input.resultId)).limit(1);
    if (!result) return { status: "missing" as const, reason: "Unknown lab result." };
    if (result.status === "preliminary") return { status: "conflict" as const, reason: "A preliminary result cannot receive final provider sign-off." };
    const [order] = await tx.select().from(labOrder).where(eq(labOrder.id, result.labOrderId)).limit(1);
    if (!order) return { status: "missing" as const, reason: "The result's lab order is missing." };
    const [priorReview] = await tx.select().from(labReview).where(eq(labReview.labResultId, result.id)).limit(1);
    if (priorReview) return { status: "conflict" as const, reason: "This immutable result version was already reviewed." };
    if (!input.summary.trim()) return { status: "invalid" as const, reason: "A provider review summary is required." };
    if (result.critical && (!input.criticalAcknowledged || !input.followUp?.trim())) {
      return { status: "invalid" as const, reason: "Critical results require explicit acknowledgement and a documented follow-up action." };
    }
    const release = patientReleaseVerdict({ isCritical: result.critical, criticalAcknowledged: input.criticalAcknowledged, releaseRequested: input.releaseToPatient });
    if (!release.allowed) return { status: "invalid" as const, reason: release.reason };
    if (order.status !== "resulted" && !labOrderTransitionAllowed(order.status, "reviewed")) {
      return { status: "conflict" as const, reason: `The order cannot be reviewed while it is ${order.status}.` };
    }

    const ledger = await appendLedgerInTx(tx, {
      actorId: input.actorId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "sign",
      entity: "lab-result",
      entityId: result.id,
      subjectId: result.clientId,
      locationId: locationFor(order.locationId),
      reason: result.critical ? "Licensed provider acknowledged and reviewed critical lab result" : "Licensed provider reviewed lab result",
      before: { reviewStatus: "pending", patientReleaseStatus: "held" },
      after: { reviewStatus: "reviewed", criticalAcknowledged: input.criticalAcknowledged, patientReleaseStatus: release.status },
    }, input.at);
    const reviewedAt = new Date(input.at);
    const [review] = await tx.insert(labReview).values({
      id: input.id,
      labResultId: result.id,
      reviewerId: input.actorId,
      summary: input.summary.trim(),
      criticalAcknowledged: input.criticalAcknowledged,
      followUp: input.followUp?.trim() ?? null,
      patientReleaseStatus: release.status,
      reviewedAt,
      releasedAt: release.status === "released" ? reviewedAt : null,
      ledgerId: ledger.id,
    }).returning();
    if (result.critical) {
      await tx.update(labCriticalAlert).set({
        status: "acknowledged",
        acknowledgedBy: input.actorId,
        acknowledgedAt: reviewedAt,
        resolution: input.followUp!.trim(),
      }).where(eq(labCriticalAlert.labResultId, result.id));
    }
    await tx.update(labOrder).set({ status: "reviewed" }).where(eq(labOrder.id, order.id));
    return { status: "ok" as const, duplicate: false, review, ledger };
  });
}

export async function releaseReviewedLabResultWithLedger(input: {
  id: string;
  resultId: string;
  reason: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4260)`);
    const [existingById] = await tx.select().from(labResultRelease).where(eq(labResultRelease.id, input.id)).limit(1);
    if (existingById) {
      const same = existingById.labResultId === input.resultId && existingById.releasedBy === input.actorId && existingById.reason === input.reason.trim();
      return same
        ? { status: "ok" as const, duplicate: true, release: existingById, ledger: null }
        : { status: "conflict" as const, reason: "That idempotency key was already used for a different release." };
    }
    const [result] = await tx.select().from(labResult).where(eq(labResult.id, input.resultId)).limit(1);
    if (!result) return { status: "missing" as const, reason: "Unknown lab result." };
    const [[order], [review], [existingRelease]] = await Promise.all([
      tx.select().from(labOrder).where(eq(labOrder.id, result.labOrderId)).limit(1),
      tx.select().from(labReview).where(eq(labReview.labResultId, result.id)).limit(1),
      tx.select().from(labResultRelease).where(eq(labResultRelease.labResultId, result.id)).limit(1),
    ]);
    if (!order || !review) return { status: "conflict" as const, reason: "A signed provider review is required before release." };
    if (review.patientReleaseStatus === "released" || existingRelease) return { status: "conflict" as const, reason: "This result was already released to the patient." };
    if (result.critical && !review.criticalAcknowledged) return { status: "conflict" as const, reason: "The critical result review was not explicitly acknowledged." };
    if (!input.reason.trim()) return { status: "invalid" as const, reason: "A later-release reason is required." };
    const ledger = await appendLedgerInTx(tx, {
      actorId: input.actorId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "deliver",
      entity: "lab-result",
      entityId: result.id,
      subjectId: result.clientId,
      locationId: locationFor(order.locationId),
      reason: `Reviewed lab result released later: ${input.reason.trim()}`,
      before: { patientReleaseStatus: "held" },
      after: { patientReleaseStatus: "released" },
    }, input.at);
    const [release] = await tx.insert(labResultRelease).values({
      id: input.id,
      labResultId: result.id,
      releasedBy: input.actorId,
      releasedAt: new Date(input.at),
      reason: input.reason.trim(),
      ledgerId: ledger.id,
    }).returning();
    return { status: "ok" as const, duplicate: false, release, ledger };
  });
}
