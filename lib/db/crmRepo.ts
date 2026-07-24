import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, or, sql as raw } from "drizzle-orm";

import { requireDb } from "@/lib/db/client";
import {
  client,
  clinicLocation,
  consent,
  intakeSubmission,
  lead,
  leadNote,
  leadOwnerEvent,
  leadStageEvent,
  leadTask,
  staff,
} from "@/lib/db/schema";
import { appendLedgerInTx } from "@/lib/db/repo";
import { leadConversionAllowed } from "@/lib/crm/pipeline";
import { sha256 } from "@/lib/trace/hash";

const CRM_PROFILES = ["marketing", "operations", "owner"] as const;
type DbTx = Parameters<Parameters<ReturnType<typeof requireDb>["transaction"]>[0]>[0];

function recordId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

async function eligibleStaff(tx: DbTx, id: string) {
  const [row] = await tx
    .select({ id: staff.id, name: staff.name, accessProfile: staff.accessProfile })
    .from(staff)
    .where(and(eq(staff.id, id), eq(staff.active, true), inArray(staff.accessProfile, [...CRM_PROFILES])))
    .limit(1);
  return row;
}

export async function readLeadWorkQueue(limit = 500) {
  const db = requireDb();
  const leads = await db.select().from(lead).orderBy(desc(lead.createdAt)).limit(limit);
  const ids = leads.map((row) => row.id);
  const ownerIds = [...new Set(leads.map((row) => row.ownerStaffId).filter((id): id is string => Boolean(id)))];
  const [notes, tasks, owners, candidates, coaches] = await Promise.all([
    ids.length
      ? db.select().from(leadNote).where(inArray(leadNote.leadId, ids)).orderBy(desc(leadNote.createdAt))
      : Promise.resolve([]),
    ids.length
      ? db.select().from(leadTask).where(inArray(leadTask.leadId, ids)).orderBy(asc(leadTask.dueAt))
      : Promise.resolve([]),
    ownerIds.length
      ? db
          .select({ id: staff.id, name: staff.name })
          .from(staff)
          .where(inArray(staff.id, ownerIds))
      : Promise.resolve([]),
    db
      .select({ id: staff.id, name: staff.name, accessProfile: staff.accessProfile })
      .from(staff)
      .where(and(eq(staff.active, true), inArray(staff.accessProfile, [...CRM_PROFILES])))
      .orderBy(asc(staff.name)),
    db
      .select({ id: staff.id, name: staff.name, locationIds: staff.locationIds })
      .from(staff)
      .where(and(eq(staff.active, true), eq(staff.accessProfile, "coach")))
      .orderBy(asc(staff.name)),
  ]);
  const notesByLead = new Map<string, typeof notes>();
  const tasksByLead = new Map<string, typeof tasks>();
  for (const note of notes) notesByLead.set(note.leadId, [...(notesByLead.get(note.leadId) ?? []), note]);
  for (const task of tasks) tasksByLead.set(task.leadId, [...(tasksByLead.get(task.leadId) ?? []), task]);
  const ownerNames = new Map(owners.map((owner) => [owner.id, owner.name]));
  return {
    leads: leads.map((row) => ({
      ...row,
      ownerName: row.ownerStaffId ? ownerNames.get(row.ownerStaffId) ?? "Unknown staff" : null,
      notes: notesByLead.get(row.id) ?? [],
      tasks: tasksByLead.get(row.id) ?? [],
    })),
    candidates,
    coaches: coaches.map((coach) => ({
      ...coach,
      locationIds: Array.isArray(coach.locationIds)
        ? coach.locationIds.filter((value): value is string => typeof value === "string")
        : [],
    })),
  };
}

type ActorInput = {
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
};

export type LeadConversionResult =
  | { status: "ok"; client: typeof client.$inferSelect; ledgerId: string }
  | { status: "already-converted"; clientId: string }
  | { status: "duplicate"; matches: Array<{ id: string; mrn: string; firstName: string; lastName: string }> }
  | {
      status:
        | "missing"
        | "not-ready"
        | "invalid-location"
        | "invalid-coach"
        | "conflict";
    };

/**
 * Turn a completed-intake lead into an authoritative patient exactly once.
 *
 * The transaction claims the lead first, creates the Master Patient Index row,
 * moves intake consents from the pre-client identity to the patient identity,
 * appends the conversion event, and writes the audit witness. Existing
 * email/phone matches are returned for human merge review; Apex never guesses
 * that two people are the same patient.
 */
export async function convertLeadToClientWithLedger(
  input: ActorInput & { leadId: string; assignedCoachId: string },
): Promise<LeadConversionResult> {
  const db = requireDb();
  const at = new Date(input.at);
  return db.transaction(async (tx) => {
    const current = await leadForWork(tx, input.leadId);
    if (!current) return { status: "missing" as const };
    if (current.convertedClientId) {
      return { status: "already-converted" as const, clientId: current.convertedClientId };
    }
    if (!leadConversionAllowed(current.stage)) return { status: "not-ready" as const };
    if (!current.preferredLocationId) return { status: "invalid-location" as const };

    const [location] = await tx
      .select({ id: clinicLocation.id })
      .from(clinicLocation)
      .where(and(eq(clinicLocation.id, current.preferredLocationId), eq(clinicLocation.active, true)))
      .limit(1);
    if (!location) return { status: "invalid-location" as const };

    const [coach] = await tx
      .select({ id: staff.id, locationIds: staff.locationIds })
      .from(staff)
      .where(
        and(
          eq(staff.id, input.assignedCoachId),
          eq(staff.active, true),
          eq(staff.accessProfile, "coach"),
          eq(staff.excludeFromScheduling, false),
        ),
      )
      .limit(1);
    const coachLocations = Array.isArray(coach?.locationIds)
      ? coach.locationIds.filter((value): value is string => typeof value === "string")
      : [];
    if (!coach || !coachLocations.includes(current.preferredLocationId)) {
      return { status: "invalid-coach" as const };
    }

    const normalizedEmail = current.email?.trim().toLowerCase() ?? "";
    const normalizedPhone = current.phone?.replace(/\D/g, "") ?? "";
    const duplicatePredicates = [
      ...(normalizedEmail
        ? [raw`lower(trim(coalesce(${client.email}, ''))) = ${normalizedEmail}`]
        : []),
      ...(normalizedPhone.length >= 10
        ? [raw`regexp_replace(coalesce(${client.phone}, ''), '[^0-9]', '', 'g') = ${normalizedPhone}`]
        : []),
    ];
    if (duplicatePredicates.length) {
      const matches = await tx
        .select({
          id: client.id,
          mrn: client.mrn,
          firstName: client.firstName,
          lastName: client.lastName,
        })
        .from(client)
        .where(or(...duplicatePredicates))
        .limit(10);
      if (matches.length) return { status: "duplicate" as const, matches };
    }

    const [submittedIntake] = await tx
      .select({
        id: intakeSubmission.id,
        dateOfBirth: intakeSubmission.dateOfBirth,
        sex: intakeSubmission.sex,
      })
      .from(intakeSubmission)
      .where(eq(intakeSubmission.leadId, current.id))
      .orderBy(desc(intakeSubmission.submittedAt))
      .limit(1);

    const digest = sha256(`lead-client|${current.id}`);
    const clientId = `cl-${digest.slice(0, 40)}`;
    const mrn = `AH-APX-${digest.slice(0, 12).toUpperCase()}`;

    const [claimed] = await tx
      .update(lead)
      .set({
        stage: "converted",
        convertedClientId: clientId,
        convertedAt: at,
        ownerStaffId: current.ownerStaffId ?? input.actorId,
        updatedAt: at,
      })
      .where(
        and(
          eq(lead.id, current.id),
          eq(lead.stage, current.stage),
          isNull(lead.convertedClientId),
        ),
      )
      .returning();
    if (!claimed) return { status: "conflict" as const };

    const [created] = await tx
      .insert(client)
      .values({
        id: clientId,
        mrn,
        firstName: current.firstName?.trim() || "Unknown",
        lastName: current.lastName?.trim() || "Unknown",
        email: normalizedEmail || null,
        phone: current.phone?.trim() || null,
        dateOfBirth: submittedIntake?.dateOfBirth ?? null,
        sex:
          submittedIntake?.sex ??
          (current.track === "female" || current.track === "women"
            ? "female"
            : current.track === "male" || current.track === "men"
              ? "male"
              : null),
        homeLocationId: current.preferredLocationId,
        assignedCoachId: coach.id,
        sourceSystem: "apex-lead",
        sourceId: current.id,
        sourceUpdatedAt: at,
        createdAt: at,
        updatedAt: at,
      })
      .returning();

    await tx
      .update(consent)
      .set({ clientId, leadId: null })
      .where(eq(consent.leadId, current.id));
    await tx
      .update(intakeSubmission)
      .set({ clientId })
      .where(eq(intakeSubmission.leadId, current.id));
    await tx.insert(leadStageEvent).values({
      id: `lse-${current.id}-${at.getTime().toString(36)}-converted`,
      leadId: current.id,
      fromStage: current.stage,
      toStage: "converted",
      at,
      byStaffId: input.actorId,
      note: `Patient ${mrn} created with assigned coach ${coach.id}`,
    });
    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: "create",
        entity: "chart",
        entityId: clientId,
        subjectId: clientId,
        subjectName: [created.firstName, created.lastName].join(" "),
        reason: "Completed-intake lead converted to an authoritative Apex patient",
        after: {
          leadId: current.id,
          mrn,
          homeLocationId: current.preferredLocationId,
          assignedCoachId: coach.id,
          consentIdentityTransferred: true,
          intakeSubmissionLinked: Boolean(submittedIntake),
        },
      },
      input.at,
    );
    return { status: "ok" as const, client: created, ledgerId: ledger.id };
  });
}

async function leadForWork(tx: DbTx, leadId: string) {
  const [row] = await tx.select().from(lead).where(eq(lead.id, leadId)).limit(1);
  return row;
}

export async function addLeadNoteWithLedger(
  input: ActorInput & { leadId: string; body: string; allowAnyOwner: boolean },
) {
  const db = requireDb();
  const at = new Date(input.at);
  return db.transaction(async (tx) => {
    const current = await leadForWork(tx, input.leadId);
    if (!current) return { status: "missing" as const };
    if (current.ownerStaffId && current.ownerStaffId !== input.actorId && !input.allowAnyOwner) {
      return { status: "forbidden" as const };
    }
    const ownerStaffId = current.ownerStaffId ?? input.actorId;
    if (!current.ownerStaffId) {
      await tx.update(lead).set({ ownerStaffId, updatedAt: at }).where(eq(lead.id, current.id));
    }
    const id = recordId("ln");
    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: "create",
        entity: "lead-note",
        entityId: id,
        subjectId: current.id,
        subjectName: [current.firstName, current.lastName].filter(Boolean).join(" ") || undefined,
        reason: "CRM working note added",
        after: { leadId: current.id },
      },
      input.at,
    );
    const [note] = await tx
      .insert(leadNote)
      .values({
        id,
        leadId: current.id,
        body: input.body.trim(),
        authorStaffId: input.actorId,
        authorName: input.actorName,
        createdAt: at,
        ledgerId: ledger.id,
      })
      .returning();
    if (!current.ownerStaffId) {
      await tx.insert(leadOwnerEvent).values({
        id: recordId("loe"),
        leadId: current.id,
        fromStaffId: null,
        toStaffId: input.actorId,
        reason: "Ownership claimed by first working note",
        byStaffId: input.actorId,
        at,
        ledgerId: ledger.id,
      });
    }
    return { status: "ok" as const, note, ownerStaffId, ledger };
  });
}

export async function createLeadTaskWithLedger(
  input: ActorInput & {
    leadId: string;
    title: string;
    assigneeStaffId: string;
    dueAt: string;
    allowAnyOwner: boolean;
  },
) {
  const db = requireDb();
  const at = new Date(input.at);
  return db.transaction(async (tx) => {
    const current = await leadForWork(tx, input.leadId);
    if (!current) return { status: "missing" as const };
    if (current.ownerStaffId && current.ownerStaffId !== input.actorId && !input.allowAnyOwner) {
      return { status: "forbidden" as const };
    }
    if (!(await eligibleStaff(tx, input.assigneeStaffId))) return { status: "invalid-assignee" as const };
    const id = recordId("lt");
    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: "create",
        entity: "lead-task",
        entityId: id,
        subjectId: current.id,
        reason: "CRM follow-up task created",
        after: { title: input.title.trim(), assigneeStaffId: input.assigneeStaffId, dueAt: input.dueAt },
      },
      input.at,
    );
    const [task] = await tx
      .insert(leadTask)
      .values({
        id,
        leadId: current.id,
        title: input.title.trim(),
        assigneeStaffId: input.assigneeStaffId,
        dueAt: new Date(input.dueAt),
        status: "open",
        createdByStaffId: input.actorId,
        createdAt: at,
        ledgerId: ledger.id,
      })
      .returning();
    return { status: "ok" as const, task, ledger };
  });
}

export async function completeLeadTaskWithLedger(
  input: ActorInput & { taskId: string; completionNote?: string; allowAnyOwner: boolean },
) {
  const db = requireDb();
  const at = new Date(input.at);
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ task: leadTask, leadOwnerStaffId: lead.ownerStaffId })
      .from(leadTask)
      .innerJoin(lead, eq(lead.id, leadTask.leadId))
      .where(eq(leadTask.id, input.taskId))
      .limit(1);
    if (!current) return { status: "missing" as const };
    if (current.task.status !== "open") return { status: "conflict" as const };
    if (
      current.task.assigneeStaffId !== input.actorId &&
      current.leadOwnerStaffId !== input.actorId &&
      !input.allowAnyOwner
    ) {
      return { status: "forbidden" as const };
    }
    const [task] = await tx
      .update(leadTask)
      .set({
        status: "completed",
        completedAt: at,
        completedByStaffId: input.actorId,
        completionNote: input.completionNote?.trim().slice(0, 1_000) || null,
      })
      .where(and(eq(leadTask.id, input.taskId), eq(leadTask.status, "open")))
      .returning();
    if (!task) return { status: "conflict" as const };
    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: "update",
        entity: "lead-task",
        entityId: task.id,
        subjectId: task.leadId,
        reason: "CRM follow-up task completed",
        before: { status: "open" },
        after: { status: "completed", completionNote: task.completionNote },
      },
      input.at,
    );
    await tx.update(leadTask).set({ ledgerId: ledger.id }).where(eq(leadTask.id, task.id));
    return { status: "ok" as const, task, ledger };
  });
}

export async function assignLeadOwnerWithLedger(
  input: ActorInput & { leadId: string; assigneeStaffId: string | null; reason: string },
) {
  const db = requireDb();
  const at = new Date(input.at);
  return db.transaction(async (tx) => {
    const current = await leadForWork(tx, input.leadId);
    if (!current) return { status: "missing" as const };
    if (input.assigneeStaffId && !(await eligibleStaff(tx, input.assigneeStaffId))) {
      return { status: "invalid-assignee" as const };
    }
    if (current.ownerStaffId === input.assigneeStaffId) return { status: "conflict" as const };
    const [updated] = await tx
      .update(lead)
      .set({ ownerStaffId: input.assigneeStaffId, updatedAt: at })
      .where(and(eq(lead.id, input.leadId), eq(lead.updatedAt, current.updatedAt)))
      .returning();
    if (!updated) return { status: "conflict" as const };
    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: "update",
        entity: "lead",
        entityId: current.id,
        subjectId: current.id,
        reason: input.reason.trim(),
        before: { ownerStaffId: current.ownerStaffId },
        after: { ownerStaffId: input.assigneeStaffId },
      },
      input.at,
    );
    await tx.insert(leadOwnerEvent).values({
      id: recordId("loe"),
      leadId: current.id,
      fromStaffId: current.ownerStaffId,
      toStaffId: input.assigneeStaffId,
      reason: input.reason.trim(),
      byStaffId: input.actorId,
      at,
      ledgerId: ledger.id,
    });
    return { status: "ok" as const, lead: updated, ledger };
  });
}
