import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, notInArray } from "drizzle-orm";

import { requireDb } from "@/lib/db/client";
import {
  operationalCase,
  operationalCaseEvent,
  staff,
} from "@/lib/db/schema";
import { appendLedgerInTx } from "@/lib/db/repo";
import {
  operationalCaseClocks,
  operationalCaseClosureAcceptable,
  operationalCaseTransitionAllowed,
  type OperationalCaseKind,
  type OperationalCasePriority,
  type OperationalCaseStatus,
} from "@/lib/operations/cases";
import type { LocationId } from "@/lib/types";

const CASE_OWNER_PROFILES = ["operations", "owner"] as const;
type DbTx = Parameters<Parameters<ReturnType<typeof requireDb>["transaction"]>[0]>[0];

function recordId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

async function validOwner(tx: DbTx, id: string) {
  const [row] = await tx
    .select({ id: staff.id, name: staff.name })
    .from(staff)
    .where(
      and(
        eq(staff.id, id),
        eq(staff.active, true),
        inArray(staff.accessProfile, [...CASE_OWNER_PROFILES]),
      ),
    )
    .limit(1);
  return row;
}

export async function readOperationalCaseQueue(input: {
  clientId?: string;
  kinds?: OperationalCaseKind[];
  includeClosed?: boolean;
  limit?: number;
} = {}) {
  const db = requireDb();
  const terminal = ["fulfilled", "denied", "closed"];
  const cases = await db
    .select()
    .from(operationalCase)
    .where(
      and(
        input.clientId ? eq(operationalCase.clientId, input.clientId) : undefined,
        input.kinds?.length ? inArray(operationalCase.kind, input.kinds) : undefined,
        input.includeClosed ? undefined : notInArray(operationalCase.status, terminal),
      ),
    )
    .orderBy(asc(operationalCase.dueAt), desc(operationalCase.createdAt))
    .limit(Math.min(Math.max(input.limit ?? 500, 1), 1_000));
  const ids = cases.map((row) => row.id);
  const ownerIds = [...new Set(cases.map((row) => row.ownerStaffId).filter((id): id is string => Boolean(id)))];
  const [events, owners, candidates] = await Promise.all([
    ids.length
      ? db
          .select()
          .from(operationalCaseEvent)
          .where(inArray(operationalCaseEvent.caseId, ids))
          .orderBy(desc(operationalCaseEvent.at))
      : Promise.resolve([]),
    ownerIds.length
      ? db.select({ id: staff.id, name: staff.name }).from(staff).where(inArray(staff.id, ownerIds))
      : Promise.resolve([]),
    input.clientId
      ? Promise.resolve([])
      : db
          .select({ id: staff.id, name: staff.name, accessProfile: staff.accessProfile })
          .from(staff)
          .where(
            and(
              eq(staff.active, true),
              inArray(staff.accessProfile, [...CASE_OWNER_PROFILES]),
            ),
          )
          .orderBy(asc(staff.name)),
  ]);
  const eventsByCase = new Map<string, typeof events>();
  for (const event of events) {
    eventsByCase.set(event.caseId, [...(eventsByCase.get(event.caseId) ?? []), event]);
  }
  const ownerNames = new Map(owners.map((owner) => [owner.id, owner.name]));
  return {
    cases: cases.map((row) => ({
      ...row,
      ownerName: row.ownerStaffId ? ownerNames.get(row.ownerStaffId) ?? "Unknown staff" : null,
      events: eventsByCase.get(row.id) ?? [],
    })),
    candidates,
  };
}

export async function createOperationalCaseWithLedger(input: {
  kind: OperationalCaseKind;
  priority: OperationalCasePriority;
  subject: string;
  detail: string;
  clientId?: string | null;
  leadId?: string | null;
  locationId?: string | null;
  requestedByKind: "patient" | "staff";
  requestedById: string;
  requestedByName: string;
  requestedByRole: string;
  recordScope?: string | null;
  requestedFormat?: string | null;
  recipient?: string | null;
  amendmentRecordReference?: string | null;
  amendmentRequestedText?: string | null;
  at: string;
}) {
  const db = requireDb();
  const at = new Date(input.at);
  const clocks = operationalCaseClocks(input.kind, input.priority, at);
  const id = recordId("case");
  return db.transaction(async (tx) => {
    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.requestedById,
        actorName: input.requestedByName,
        actorRole: input.requestedByRole,
        action: "create",
        entity: "operational-case",
        entityId: id,
        subjectId: input.clientId ?? undefined,
        locationId: (input.locationId as LocationId | null | undefined) ?? undefined,
        reason: `Opened ${input.kind} case`,
        after: {
          kind: input.kind,
          priority: input.priority,
          subject: input.subject.trim(),
          dueAt: clocks.dueAt.toISOString(),
        },
      },
      input.at,
    );
    const [created] = await tx
      .insert(operationalCase)
      .values({
        id,
        kind: input.kind,
        status: "new",
        priority: input.priority,
        subject: input.subject.trim(),
        detail: input.detail.trim(),
        clientId: input.clientId ?? null,
        leadId: input.leadId ?? null,
        locationId: input.locationId ?? null,
        requestedByKind: input.requestedByKind,
        requestedById: input.requestedById,
        requestedByName: input.requestedByName,
        firstResponseDueAt: clocks.firstResponseDueAt,
        dueAt: clocks.dueAt,
        recordScope: input.recordScope?.trim() || null,
        requestedFormat: input.requestedFormat?.trim() || null,
        recipient: input.recipient?.trim() || null,
        amendmentRecordReference: input.amendmentRecordReference?.trim() || null,
        amendmentRequestedText: input.amendmentRequestedText?.trim() || null,
        identityVerificationStatus: "pending",
        createdAt: at,
        updatedAt: at,
        retentionUntil: clocks.retentionUntil,
        ledgerId: ledger.id,
      })
      .returning();
    await tx.insert(operationalCaseEvent).values({
      id: recordId("case-event"),
      caseId: id,
      action: "created",
      fromStatus: null,
      toStatus: "new",
      note: input.detail.trim(),
      actorId: input.requestedById,
      actorName: input.requestedByName,
      actorRole: input.requestedByRole,
      at,
      ledgerId: ledger.id,
    });
    return { case: created, ledger };
  });
}

export async function workOperationalCaseWithLedger(input: {
  id: string;
  status?: OperationalCaseStatus;
  ownerStaffId?: string | null;
  note?: string | null;
  resolution?: string | null;
  denialReason?: string | null;
  identityVerificationStatus?: "pending" | "verified" | "failed";
  actorId: string;
  actorName: string;
  actorRole: string;
  allowAnyOwner: boolean;
  at: string;
}) {
  const db = requireDb();
  const at = new Date(input.at);
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(operationalCase).where(eq(operationalCase.id, input.id)).limit(1);
    if (!current) return { status: "missing" as const };
    if (current.ownerStaffId && current.ownerStaffId !== input.actorId && !input.allowAnyOwner) {
      return { status: "forbidden" as const, reason: "Only the assigned owner or operations leadership may work this case." };
    }
    const nextOwner =
      input.ownerStaffId === undefined
        ? current.ownerStaffId ?? input.actorId
        : input.ownerStaffId;
    if (nextOwner && !(await validOwner(tx, nextOwner))) {
      return { status: "invalid-owner" as const, reason: "The case owner must be an active operations or owner account." };
    }
    const nextStatus =
      input.status ??
      (current.status === "new" && nextOwner ? "assigned" : current.status);
    if (nextStatus !== current.status && !operationalCaseTransitionAllowed(current.status, nextStatus)) {
      return { status: "conflict" as const, reason: `A ${current.status} case cannot move to ${nextStatus}.` };
    }
    const resolution = input.resolution?.trim() || current.resolution;
    const denialReason = input.denialReason?.trim() || current.denialReason;
    if (!operationalCaseClosureAcceptable({ status: nextStatus as OperationalCaseStatus, resolution, denialReason })) {
      return { status: "invalid-closure" as const, reason: "Fulfilled/closed cases need a resolution; denied cases need a denial reason." };
    }
    const isSubstantiveResponse = ["in-progress", "waiting-on-patient", "fulfilled", "denied"].includes(nextStatus);
    const closes = ["fulfilled", "denied", "closed"].includes(nextStatus);
    const [updated] = await tx
      .update(operationalCase)
      .set({
        ownerStaffId: nextOwner,
        status: nextStatus,
        firstRespondedAt:
          current.firstRespondedAt ?? (isSubstantiveResponse ? at : null),
        identityVerificationStatus:
          input.identityVerificationStatus ?? current.identityVerificationStatus,
        resolution,
        denialReason,
        updatedAt: at,
        closedAt: closes ? current.closedAt ?? at : null,
      })
      .where(and(eq(operationalCase.id, current.id), eq(operationalCase.updatedAt, current.updatedAt)))
      .returning();
    if (!updated) return { status: "conflict" as const, reason: "The case changed. Refresh and try again." };
    const action =
      nextStatus !== current.status
        ? "transition"
        : nextOwner !== current.ownerStaffId
          ? "assign"
          : input.identityVerificationStatus &&
              input.identityVerificationStatus !== current.identityVerificationStatus
            ? "verify-identity"
            : "note";
    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: "update",
        entity: "operational-case",
        entityId: current.id,
        subjectId: current.clientId ?? undefined,
        locationId: (current.locationId as LocationId | null) ?? undefined,
        reason: input.note?.trim() || `Operational case ${action}`,
        before: {
          status: current.status,
          ownerStaffId: current.ownerStaffId,
          identityVerificationStatus: current.identityVerificationStatus,
        },
        after: {
          status: nextStatus,
          ownerStaffId: nextOwner,
          identityVerificationStatus:
            input.identityVerificationStatus ?? current.identityVerificationStatus,
        },
      },
      input.at,
    );
    const [event] = await tx
      .insert(operationalCaseEvent)
      .values({
        id: recordId("case-event"),
        caseId: current.id,
        action,
        fromStatus: current.status,
        toStatus: nextStatus,
        note: input.note?.trim().slice(0, 5_000) || null,
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        at,
        ledgerId: ledger.id,
      })
      .returning();
    return { status: "ok" as const, case: updated, event, ledger };
  });
}
