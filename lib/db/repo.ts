import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, ne, or, sql as raw } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { leadTransitionAllowed } from "@/lib/crm/pipeline";
import {
  ledger as ledgerTable,
  memberDay,
  doseLog,
  contactEntry,
  escalation as escalationTable,
  dispense,
  inventoryMovement,
  staff as staffTable,
  consult as consultTable,
  consultAddendum,
  lead as leadTable,
  leadStageEvent,
  leadOwnerEvent,
  consent as consentTable,
  intakeInvite,
  intakeSubmission,
  emergencyCard,
  featureFlag,
  encounter,
  encounterSegment,
  vitals,
  historyPhysical,
  signedDocument as signedDocumentTable,
  signedDocumentArtifact,
  message as messageTable,
  client as clientTable,
  clinicLocation as clinicLocationTable,
  clinicResource,
  resourceReservation,
  appointment as appointmentTable,
  staffAvailabilityRule,
  externalCalendar,
  calendarBusyBlock,
  allergy as allergyTable,
  problem as problemTable,
  medication as medicationTable,
  staffCredential,
} from "@/lib/db/schema";
import { staff as seededStaff } from "@/lib/mock/staff";
import type { Consult } from "@/lib/consult/types";
import type {
  ClinicalNoteFields,
  ConsultChannel,
  ConsultKind,
  ConsultSummary,
} from "@/lib/consult/types";
import { normalizeConsultChannel, normalizeConsultKind } from "@/lib/consult/metadata";
import { stampFor } from "@/lib/consult/summarize";
import { hashRow, GENESIS_HASH, type LedgerDraft, type LedgerRow } from "@/lib/trace/ledger";
import {
  segmentPlanFor,
  completionVerdict,
  credentialSatisfies,
  validateVitals,
  vitalsAcceptable,
  type EncounterKind,
  type VitalsInput,
} from "@/lib/encounters/lifecycle";
import { isProvider, type CredentialClass } from "@/lib/scheduling/credentials";
import type { LocationId } from "@/lib/types";
import {
  documentSha256,
  signatureAcceptable,
  validateSignature,
  type SignableDocument,
  type SignatureEvidence,
} from "@/lib/documents/signing";
import {
  appointmentTransitionAllowed,
  normalizedAppointmentState,
  type AppointmentState,
} from "@/lib/scheduling/lifecycle";
import { inferAccessProfile } from "@/lib/authz/profiles";
import { NCV_COMPONENTS, type NcvComponentId } from "@/lib/scheduling/ncv";
import { parseCredential } from "@/lib/scheduling/credentials";
import { resourceSuitableForVisit } from "@/lib/clinic-resources/lifecycle";
import { leadFirstResponseDueAt } from "@/lib/crm/work";

/** The transaction handle drizzle hands a `db.transaction(tx => …)` callback. */
type DbTx = Parameters<Parameters<ReturnType<typeof requireDb>["transaction"]>[0]>[0];

/**
 * Repositories — the only code that touches the database.
 *
 * Every function here is server-only and every one goes through `requireDb()`,
 * so there is exactly one place that decides what "no database" means. It
 * decides to throw. See lib/db/client.ts for why that is not negotiable.
 *
 * These functions take and return the SAME shapes the existing domain code
 * already uses, so a call site swaps an in-memory helper for one of these and
 * nothing downstream changes. That was the point of keeping the domain logic
 * pure: it turns out to be portable.
 */

/* -------------------------------------------------------------------------- */
/* Ledger                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Append to the hash chain, durably.
 *
 * The previous implementation pushed onto a module array
 * (docs/audit/GAP_ANALYSIS.md, Top-10 #3), so every append died on restart and
 * each replica kept its own divergent chain — which is worse than no ledger,
 * because two replicas could each produce a self-consistent chain that
 * disagreed with the other and nothing would notice.
 *
 * CONCURRENCY IS THE WHOLE PROBLEM HERE. A hash chain needs a strict total
 * order: `prevHash` must be the hash of the row immediately before, so two
 * appends racing would both read the same tail and produce two rows claiming
 * the same predecessor. A transaction alone does not prevent that under READ
 * COMMITTED, which is Postgres's default.
 *
 * So this takes a transaction-scoped ADVISORY LOCK. Serialising appends is
 * exactly the semantics a chain requires, and the cost is acceptable because
 * the write rate is human-paced — a clinic generates hundreds of audit rows a
 * day, not thousands a second.
 *
 * Rejected: a serial column with a uniqueness constraint and retry-on-conflict.
 * It works, but a retry loop around a hash chain is subtle enough that the next
 * person to touch it would probably get it wrong.
 */
/**
 * The chain append, done inside a caller-supplied transaction.
 *
 * Extracted so a compound write — "update this consult row AND witness it in the
 * ledger" — can be ONE transaction with ONE advisory lock, rather than a durable
 * update followed by a separate ledger append that could fail on its own and
 * leave a signed row nobody witnessed. The advisory lock is transaction-scoped,
 * so taking it here under the outer tx still serialises the whole chain.
 */
export async function appendLedgerInTx(tx: DbTx, draft: LedgerDraft, at: string): Promise<LedgerRow> {
  // 4,242 is an arbitrary but fixed key. One lock for the whole chain,
  // because the chain is one sequence.
  await tx.execute(raw`SELECT pg_advisory_xact_lock(4242)`);

  const [tail] = await tx
    .select({ seq: ledgerTable.seq, hash: ledgerTable.hash })
    .from(ledgerTable)
    .orderBy(desc(ledgerTable.seq))
    .limit(1);

  const seq = (tail?.seq ?? 0) + 1;
  const prevHash = tail?.hash ?? GENESIS_HASH;
  const payload = { ...draft, seq, at };
  const hash = hashRow(prevHash, payload as never);
  const id = `led-${String(seq).padStart(5, "0")}`;

  await tx.insert(ledgerTable).values({
    id,
    seq,
    at: new Date(at),
    actorId: draft.actorId,
    actorName: draft.actorName,
    actorRole: draft.actorRole,
    action: draft.action,
    entity: draft.entity,
    entityId: draft.entityId,
    subjectId: draft.subjectId ?? null,
    subjectName: draft.subjectName ?? null,
    locationId: draft.locationId ?? null,
    reason: draft.reason ?? null,
    before: draft.before ?? null,
    after: draft.after ?? null,
    prevHash,
    hash,
  });

  return { ...payload, id, prevHash, hash } as LedgerRow;
}

export async function appendLedgerRow(draft: LedgerDraft, at: string): Promise<LedgerRow> {
  const db = requireDb();
  return db.transaction((tx) => appendLedgerInTx(tx, draft, at));
}

/** Newest first. Used by the audit trail and the member access log. */
export async function readLedger(limit = 500) {
  const db = requireDb();
  return db.select().from(ledgerTable).orderBy(desc(ledgerTable.seq)).limit(limit);
}

/**
 * The member-facing access log: who looked at this chart.
 *
 * Only the actions a member would recognise as "someone looked". A full ledger
 * dump would bury the answer in routine system rows, and the question being
 * asked is a HIPAA §164.528 question, not a debugging one.
 */
export async function readAccessLog(subjectId: string, limit = 200) {
  const db = requireDb();
  return db
    .select()
    .from(ledgerTable)
    .where(
      and(
        eq(ledgerTable.subjectId, subjectId),
        raw`${ledgerTable.action} IN ('view','export','break-glass')`,
      ),
    )
    .orderBy(desc(ledgerTable.at))
    .limit(limit);
}

/* -------------------------------------------------------------------------- */
/* Member self-logging                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Record a dose, or a deliberate skip.
 *
 * Append-only, including retraction. `undoDose` previously filtered local state
 * and left the ledger permanently asserting a dose the member had taken back
 * (docs/audit/ENGAGEMENT.md, friction #6). Here a retraction stamps
 * `retractedAt` on the original and the row survives — a chart you can silently
 * edit is not a chart.
 *
 * `source` defaults to `member-self-report` and callers should not override it
 * lightly. A closed ring is a member SAYING they took it; nothing downstream
 * may treat that as confirmation that they did.
 */
export async function logDose(input: {
  id: string;
  clientId: string;
  prescriptionId: string;
  date: string;
  takenAt: string;
  site?: string;
  skipped?: boolean;
  skipReason?: string;
}) {
  const db = requireDb();
  await db.insert(doseLog).values({
    id: input.id,
    clientId: input.clientId,
    prescriptionId: input.prescriptionId,
    date: input.date,
    takenAt: new Date(input.takenAt),
    site: input.site ?? null,
    skipped: input.skipped ?? false,
    skipReason: input.skipReason ?? null,
  });
}

/**
 * Retract a dose — SCOPED to the owning client, and idempotent.
 *
 * Previously this matched on the dose id ALONE, so a caller who could guess or
 * enumerate an id could retract a dose belonging to somebody else's chart; the
 * clientId argument was recorded as the retractor but never constrained the
 * row. It also had no guard against double retraction, so a repeat call moved
 * `retractedAt` forward and quietly rewrote when the correction happened.
 *
 * Returns true only when THIS call performed the retraction, so the caller can
 * tell "retracted" from "was already retracted" rather than reporting success
 * for a no-op.
 */
export async function retractDose(id: string, clientId: string, at: string): Promise<boolean> {
  const db = requireDb();
  const rows = await db
    .update(doseLog)
    .set({ retractedAt: new Date(at), retractedBy: clientId })
    .where(
      and(
        eq(doseLog.id, id),
        // The row must belong to this member.
        eq(doseLog.clientId, clientId),
        // …and must not already be retracted.
        isNull(doseLog.retractedAt),
      ),
    )
    .returning({ id: doseLog.id });
  return rows.length > 0;
}

/**
 * Upsert the day's weight and check-in.
 *
 * One row per member per day, so re-logging a weight corrects the day rather
 * than accumulating duplicates — that is what a member expects from a field
 * they can edit. Dose history is separate and append-only precisely because it
 * has different semantics.
 */
export async function upsertMemberDay(input: {
  clientId: string;
  date: string;
  weightLb?: number;
  feel?: Record<string, number>;
  protectedDay?: boolean;
  protectedReason?: string;
}) {
  const db = requireDb();
  await db
    .insert(memberDay)
    .values({
      clientId: input.clientId,
      date: input.date,
      weightLb: input.weightLb ?? null,
      feel: input.feel ?? null,
      protectedDay: input.protectedDay ?? false,
      protectedReason: input.protectedReason ?? null,
    })
    .onConflictDoUpdate({
      target: [memberDay.clientId, memberDay.date],
      set: {
        weightLb: input.weightLb ?? null,
        feel: input.feel ?? null,
        protectedDay: input.protectedDay ?? false,
        protectedReason: input.protectedReason ?? null,
        updatedAt: new Date(),
      },
    });
}

/**
 * Read back a member's history.
 *
 * This is the function that turns the habit loop from fiction into a record.
 * Rings, streaks and trends currently read `seededRandom` — a member can log
 * every dose for a month and nothing moves (docs/audit/ENGAGEMENT.md). Pointing
 * `ringHistory` at this is the single highest-value rewire in the product.
 */
export async function readMemberHistory(clientId: string, sinceDate: string) {
  const db = requireDb();
  const [days, doses] = await Promise.all([
    db
      .select()
      .from(memberDay)
      .where(and(eq(memberDay.clientId, clientId), gte(memberDay.date, sinceDate)))
      .orderBy(memberDay.date),
    db
      .select()
      .from(doseLog)
      .where(and(eq(doseLog.clientId, clientId), gte(doseLog.date, sinceDate)))
      .orderBy(doseLog.date),
  ]);
  return { days, doses };
}

/* -------------------------------------------------------------------------- */
/* Coach + clinician writes                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Log a coach contact, for real.
 *
 * `TodayQueue.tsx` toasted "Written to the ledger" with no write behind it and
 * `lib/mock/contactLog.ts` had no write API at all — the most-clicked button on
 * the coach home screen recorded nothing.
 */
export async function logContact(input: {
  id: string;
  clientId: string;
  staffId: string;
  at: string;
  channel: string;
  direction: string;
  outcome?: string;
  notes?: string;
  templateId?: string;
  ledgerId?: string;
}) {
  const db = requireDb();
  await db.insert(contactEntry).values({
    id: input.id,
    clientId: input.clientId,
    staffId: input.staffId,
    at: new Date(input.at),
    channel: input.channel,
    direction: input.direction,
    outcome: input.outcome ?? null,
    notes: input.notes ?? null,
    templateId: input.templateId ?? null,
    ledgerId: input.ledgerId ?? null,
  });
}

/* -------------------------------------------------------------------------- */
/* Authoritative patient <-> coach messaging                                  */
/* -------------------------------------------------------------------------- */

export async function readClientCareScope(clientId: string) {
  const db = requireDb();
  const [row] = await db
    .select({
      id: clientTable.id,
      firstName: clientTable.firstName,
      lastName: clientTable.lastName,
      preferredName: clientTable.preferredName,
      assignedCoachId: clientTable.assignedCoachId,
      assignedProviderId: clientTable.assignedProviderId,
      locationId: clientTable.homeLocationId,
      locationName: clinicLocationTable.name,
      coachName: staffTable.name,
      coachActive: staffTable.active,
      status: clientTable.status,
    })
    .from(clientTable)
    .leftJoin(clinicLocationTable, eq(clientTable.homeLocationId, clinicLocationTable.id))
    .leftJoin(staffTable, eq(clientTable.assignedCoachId, staffTable.id))
    .where(eq(clientTable.id, clientId))
    .limit(1);
  return row ?? null;
}

/** Patient message and audit witness commit together, with retry idempotency. */
export async function createPatientCoachMessageWithLedger(input: {
  id: string;
  clientId: string;
  patientName: string;
  coachId: string;
  body: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(messageTable)
      .values({
        id: input.id,
        clientId: input.clientId,
        thread: "coach",
        senderId: input.clientId,
        senderKind: "member",
        recipientId: input.coachId,
        recipientRole: "Coach",
        body: input.body,
        sentAt: new Date(input.at),
      })
      .onConflictDoNothing({ target: messageTable.id })
      .returning();

    if (!inserted) {
      const [existing] = await tx
        .select()
        .from(messageTable)
        .where(and(eq(messageTable.id, input.id), eq(messageTable.clientId, input.clientId)))
        .limit(1);
      return existing ? { message: existing, ledger: null, duplicate: true } : null;
    }

    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.clientId,
        actorName: input.patientName,
        actorRole: "Client",
        action: "deliver",
        entity: "message",
        entityId: input.id,
        subjectId: input.clientId,
        reason: "Patient sent a secure portal message to assigned coach",
        after: { thread: "coach", recipientId: input.coachId },
      },
      input.at,
    );
    return { message: inserted, ledger, duplicate: false };
  });
}

export async function createCoachPatientMessageWithLedger(input: {
  id: string;
  clientId: string;
  coachId: string;
  coachName: string;
  body: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(messageTable)
      .values({
        id: input.id,
        clientId: input.clientId,
        thread: "coach",
        senderId: input.coachId,
        senderKind: "coach",
        recipientId: input.clientId,
        recipientRole: "Client",
        body: input.body,
        sentAt: new Date(input.at),
      })
      .onConflictDoNothing({ target: messageTable.id })
      .returning();

    if (!inserted) {
      const [existing] = await tx
        .select()
        .from(messageTable)
        .where(and(eq(messageTable.id, input.id), eq(messageTable.clientId, input.clientId)))
        .limit(1);
      return existing ? { message: existing, ledger: null, duplicate: true } : null;
    }

    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.coachId,
        actorName: input.coachName,
        actorRole: "Coach",
        action: "deliver",
        entity: "message",
        entityId: input.id,
        subjectId: input.clientId,
        reason: "Assigned coach replied through secure patient messaging",
        after: { thread: "coach", recipientId: input.clientId },
      },
      input.at,
    );
    return { message: inserted, ledger, duplicate: false };
  });
}

export async function readPatientCoachMessages(clientId: string, limit = 100) {
  const db = requireDb();
  const rows = await db
    .select()
    .from(messageTable)
    .where(and(eq(messageTable.clientId, clientId), eq(messageTable.thread, "coach")))
    .orderBy(desc(messageTable.sentAt))
    .limit(Math.max(1, Math.min(limit, 250)));
  return rows.reverse();
}

export async function readCoachInbox(coachId: string, includeAll = false) {
  const db = requireDb();
  const assigned = includeAll ? undefined : eq(clientTable.assignedCoachId, coachId);
  const clientRows = await db
    .select({
      id: clientTable.id,
      firstName: clientTable.firstName,
      lastName: clientTable.lastName,
      preferredName: clientTable.preferredName,
      assignedCoachId: clientTable.assignedCoachId,
      locationId: clientTable.homeLocationId,
    })
    .from(clientTable)
    .where(assigned ? and(eq(clientTable.status, "active"), assigned) : eq(clientTable.status, "active"));

  const summaries = await Promise.all(
    clientRows.map(async (person) => {
      const [latest] = await db
        .select()
        .from(messageTable)
        .where(and(eq(messageTable.clientId, person.id), eq(messageTable.thread, "coach")))
        .orderBy(desc(messageTable.sentAt))
        .limit(1);
      if (!latest) return null;
      const [unread] = await db
        .select({ count: raw<number>`count(*)::int` })
        .from(messageTable)
        .where(
          and(
            eq(messageTable.clientId, person.id),
            eq(messageTable.thread, "coach"),
            eq(messageTable.senderKind, "member"),
            isNull(messageTable.readAt),
          ),
        );
      return { ...person, latest, unreadCount: unread?.count ?? 0 };
    }),
  );

  return summaries
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => b.latest.sentAt.getTime() - a.latest.sentAt.getTime());
}

export async function markPatientMessagesReadWithLedger(input: {
  clientId: string;
  coachId: string;
  coachName: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(messageTable)
      .set({ readAt: new Date(input.at) })
      .where(
        and(
          eq(messageTable.clientId, input.clientId),
          eq(messageTable.thread, "coach"),
          eq(messageTable.senderKind, "member"),
          isNull(messageTable.readAt),
        ),
      )
      .returning({ id: messageTable.id });
    if (!rows.length) return { count: 0, ledger: null };
    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.coachId,
        actorName: input.coachName,
        actorRole: "Coach",
        action: "view",
        entity: "message",
        entityId: rows[rows.length - 1].id,
        subjectId: input.clientId,
        reason: `Assigned coach read ${rows.length} patient message${rows.length === 1 ? "" : "s"}`,
        after: { readCount: rows.length },
      },
      input.at,
    );
    return { count: rows.length, ledger };
  });
}

/* -------------------------------------------------------------------------- */
/* Authoritative appointments and front-desk encounter clock                  */
/* -------------------------------------------------------------------------- */

type SlotInput = {
  clientId: string;
  staffId: string;
  locationId: string;
  startAt: Date;
  endAt: Date;
  excludeAppointmentId?: string;
};

function localSlot(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    weekday: weekdays[value("weekday")],
    minute: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

async function slotConflicts(tx: DbTx, input: SlotInput): Promise<string[]> {
  const issues: string[] = [];
  const [person] = await tx
    .select({ id: clientTable.id, status: clientTable.status })
    .from(clientTable)
    .where(eq(clientTable.id, input.clientId))
    .limit(1);
  if (!person || person.status !== "active") issues.push("The patient is not active in Apex.");

  const [worker] = await tx
    .select({
      id: staffTable.id,
      active: staffTable.active,
      excluded: staffTable.excludeFromScheduling,
      locationIds: staffTable.locationIds,
    })
    .from(staffTable)
    .where(eq(staffTable.id, input.staffId))
    .limit(1);
  const locations = Array.isArray(worker?.locationIds) ? worker.locationIds as string[] : [];
  if (!worker || !worker.active || worker.excluded) issues.push("The selected staff member is not schedulable.");
  else if (!locations.includes(input.locationId)) issues.push("The selected staff member does not cover this clinic.");

  const [clinic] = await tx
    .select({ timezone: clinicLocationTable.timezone, active: clinicLocationTable.active })
    .from(clinicLocationTable)
    .where(eq(clinicLocationTable.id, input.locationId))
    .limit(1);
  if (!clinic?.active) issues.push("The selected clinic is not active.");

  const omit = input.excludeAppointmentId ? ne(appointmentTable.id, input.excludeAppointmentId) : undefined;
  const activeStatus = raw`${appointmentTable.status} NOT IN ('Cancelled','Canceled','No Show')`;
  const overlap = and(lt(appointmentTable.startAt, input.endAt), gt(appointmentTable.endAt, input.startAt), activeStatus, omit);
  const [staffOverlap, patientOverlap] = await Promise.all([
    tx.select({ id: appointmentTable.id }).from(appointmentTable).where(and(eq(appointmentTable.staffId, input.staffId), overlap)).limit(1),
    tx.select({ id: appointmentTable.id }).from(appointmentTable).where(and(eq(appointmentTable.clientId, input.clientId), overlap)).limit(1),
  ]);
  if (staffOverlap.length) issues.push("The staff member already has an Apex appointment in this time.");
  if (patientOverlap.length) issues.push("The patient already has an appointment in this time.");

  const calendarOverlap = await tx
    .select({ id: calendarBusyBlock.id })
    .from(calendarBusyBlock)
    .innerJoin(externalCalendar, eq(calendarBusyBlock.calendarId, externalCalendar.id))
    .where(
      and(
        eq(externalCalendar.staffId, input.staffId),
        eq(externalCalendar.status, "connected"),
        lt(calendarBusyBlock.startAt, input.endAt),
        gt(calendarBusyBlock.endAt, input.startAt),
        ne(calendarBusyBlock.status, "cancelled"),
      ),
    )
    .limit(1);
  if (calendarOverlap.length) issues.push("The staff member's connected calendar is busy in this time.");

  if (clinic) {
    const start = localSlot(input.startAt, clinic.timezone);
    const end = localSlot(input.endAt, clinic.timezone);
    const rules = await tx
      .select()
      .from(staffAvailabilityRule)
      .where(
        and(
          eq(staffAvailabilityRule.staffId, input.staffId),
          eq(staffAvailabilityRule.locationId, input.locationId),
          eq(staffAvailabilityRule.active, true),
        ),
      );
    const covered = start.date === end.date && rules.some((rule) =>
      rule.weekday === start.weekday &&
      rule.effectiveFrom <= start.date &&
      (!rule.effectiveUntil || rule.effectiveUntil >= start.date) &&
      start.minute >= rule.startMinute &&
      end.minute <= rule.endMinute
    );
    if (!covered) issues.push("No approved working-hours rule covers this slot.");
  }
  return issues;
}

const OVERRIDEABLE_SLOT_ISSUES = new Set([
  "No approved working-hours rule covers this slot.",
]);

/** An override may document an hours exception; it may never erase a collision or invalid identity. */
function blockingSlotIssues(issues: string[], overrideReason?: string) {
  if (!overrideReason?.trim()) return issues;
  return issues.filter((issue) => !OVERRIDEABLE_SLOT_ISSUES.has(issue));
}

export async function readAppointments(input: {
  from: string;
  to: string;
  clientId?: string;
  staffId?: string;
  locationId?: string;
  locationIds?: string[];
}) {
  const db = requireDb();
  const filters = [
    gte(appointmentTable.startAt, new Date(input.from)),
    lt(appointmentTable.startAt, new Date(input.to)),
    input.clientId ? eq(appointmentTable.clientId, input.clientId) : undefined,
    input.staffId ? eq(appointmentTable.staffId, input.staffId) : undefined,
    input.locationId ? eq(appointmentTable.locationId, input.locationId) : undefined,
    input.locationIds ? (input.locationIds.length ? inArray(appointmentTable.locationId, input.locationIds) : raw`false`) : undefined,
  ];
  return db
    .select({
      id: appointmentTable.id,
      clientId: appointmentTable.clientId,
      clientFirstName: clientTable.firstName,
      clientLastName: clientTable.lastName,
      clientPreferredName: clientTable.preferredName,
      staffId: appointmentTable.staffId,
      staffName: staffTable.name,
      locationId: appointmentTable.locationId,
      locationName: clinicLocationTable.name,
      visitType: appointmentTable.visitType,
      bookingGroupId: appointmentTable.bookingGroupId,
      component: appointmentTable.component,
      modality: appointmentTable.modality,
      startAt: appointmentTable.startAt,
      endAt: appointmentTable.endAt,
      status: appointmentTable.status,
      arrivedAt: appointmentTable.arrivedAt,
      roomedAt: appointmentTable.roomedAt,
      resourceId: appointmentTable.resourceId,
      room: appointmentTable.room,
      completedAt: appointmentTable.completedAt,
      cancelledAt: appointmentTable.cancelledAt,
      cancelReason: appointmentTable.cancelReason,
      reason: appointmentTable.reason,
    })
    .from(appointmentTable)
    .innerJoin(clientTable, eq(appointmentTable.clientId, clientTable.id))
    .leftJoin(staffTable, eq(appointmentTable.staffId, staffTable.id))
    .leftJoin(clinicLocationTable, eq(appointmentTable.locationId, clinicLocationTable.id))
    .where(and(...filters))
    .orderBy(asc(appointmentTable.startAt));
}

export async function readSchedulingReference() {
  const db = requireDb();
  const [clients, staffRows, locations] = await Promise.all([
    db
      .select({
        id: clientTable.id,
        firstName: clientTable.firstName,
        lastName: clientTable.lastName,
        preferredName: clientTable.preferredName,
        homeLocationId: clientTable.homeLocationId,
      })
      .from(clientTable)
      .where(eq(clientTable.status, "active"))
      .orderBy(clientTable.lastName, clientTable.firstName),
    db
      .select({
        id: staffTable.id,
        name: staffTable.name,
        role: staffTable.role,
        title: staffTable.title,
        locationIds: staffTable.locationIds,
      })
      .from(staffTable)
      .where(and(eq(staffTable.active, true), eq(staffTable.excludeFromScheduling, false)))
      .orderBy(staffTable.name),
    db
      .select({ id: clinicLocationTable.id, name: clinicLocationTable.name, timezone: clinicLocationTable.timezone })
      .from(clinicLocationTable)
      .where(eq(clinicLocationTable.active, true))
      .orderBy(clinicLocationTable.name),
  ]);
  return { clients, staff: staffRows, locations };
}

export async function readGoogleCalendarsForSync() {
  const db = requireDb();
  return db
    .select({
      id: externalCalendar.id,
      staffId: externalCalendar.staffId,
      staffEmail: staffTable.email,
      staffName: staffTable.name,
      externalCalendarId: externalCalendar.externalCalendarId,
      status: externalCalendar.status,
      lastSyncedAt: externalCalendar.lastSyncedAt,
      lastErrorCode: externalCalendar.lastErrorCode,
    })
    .from(externalCalendar)
    .innerJoin(staffTable, eq(externalCalendar.staffId, staffTable.id))
    .where(and(eq(externalCalendar.provider, "google"), eq(staffTable.active, true)))
    .orderBy(staffTable.name);
}

export async function replaceCalendarBusyWindow(input: {
  calendarId: string;
  staffId: string;
  from: string;
  to: string;
  busy: Array<{ id: string; start: string; end: string }>;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx
      .delete(calendarBusyBlock)
      .where(
        and(
          eq(calendarBusyBlock.calendarId, input.calendarId),
          lt(calendarBusyBlock.startAt, new Date(input.to)),
          gt(calendarBusyBlock.endAt, new Date(input.from)),
        ),
      );
    if (input.busy.length) {
      await tx.insert(calendarBusyBlock).values(input.busy.map((window) => ({
        id: window.id,
        calendarId: input.calendarId,
        externalEventId: window.id,
        startAt: new Date(window.start),
        endAt: new Date(window.end),
        status: "busy",
        lastSeenAt: new Date(input.at),
      })));
    }
    await tx
      .update(externalCalendar)
      .set({ status: "connected", lastSyncedAt: new Date(input.at), lastErrorCode: null })
      .where(eq(externalCalendar.id, input.calendarId));
    return appendLedgerInTx(
      tx,
      {
        actorId: "system-google-calendar-sync",
        actorName: "Google Calendar sync",
        actorRole: "System",
        action: "update",
        entity: "calendar",
        entityId: input.calendarId,
        reason: "Refreshed busy-only Google Calendar cache",
        after: { staffId: input.staffId, from: input.from, to: input.to, busyBlockCount: input.busy.length, phiImported: false },
      },
      input.at,
    );
  });
}

export async function markCalendarSyncError(calendarId: string, code: string) {
  const db = requireDb();
  await db
    .update(externalCalendar)
    .set({ status: "error", lastErrorCode: code.slice(0, 120) })
    .where(eq(externalCalendar.id, calendarId));
}

export async function readChartFundamentals(clientId: string) {
  const db = requireDb();
  const [allergies, problems, medications] = await Promise.all([
    db.select().from(allergyTable).where(eq(allergyTable.clientId, clientId)).orderBy(desc(allergyTable.recordedAt)),
    db.select().from(problemTable).where(eq(problemTable.clientId, clientId)).orderBy(desc(problemTable.recordedAt)),
    db.select().from(medicationTable).where(eq(medicationTable.clientId, clientId)).orderBy(desc(medicationTable.recordedAt)),
  ]);
  return { allergies, problems, medications };
}

export async function changeChartFundamentalsWithLedger(input: {
  id: string;
  clientId: string;
  kind: "allergy" | "problem" | "medication" | "reconcile";
  operation: "add" | "end" | "reconcile";
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
  substance?: string;
  reaction?: string;
  severity?: string;
  noKnownAllergies?: boolean;
  label?: string;
  icd10?: string;
  onsetOn?: string;
  name?: string;
  dose?: string;
  frequency?: string;
  prescriber?: string;
  startedOn?: string;
  reason?: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    const [person] = await tx.select({ id: clientTable.id }).from(clientTable).where(and(eq(clientTable.id, input.clientId), eq(clientTable.status, "active"))).limit(1);
    if (!person) return { status: "missing" as const };
    const at = new Date(input.at);
    const day = input.at.slice(0, 10);
    let before: Record<string, unknown> = {};
    let after: Record<string, unknown> = {};
    let entityId = input.id;
    let reason = input.reason?.trim() || `${input.kind} ${input.operation}`;

    if (input.kind === "allergy" && input.operation === "add") {
      if (input.noKnownAllergies) {
        const active = await tx.select({ id: allergyTable.id }).from(allergyTable).where(and(eq(allergyTable.clientId, input.clientId), isNull(allergyTable.endedAt), eq(allergyTable.noKnownAllergies, false)));
        if (active.length) return { status: "conflict" as const, reason: "Active allergies must be ended before documenting no known allergies." };
      } else {
        await tx.update(allergyTable).set({ endedAt: at }).where(and(eq(allergyTable.clientId, input.clientId), eq(allergyTable.noKnownAllergies, true), isNull(allergyTable.endedAt)));
      }
      await tx.insert(allergyTable).values({
        id: input.id,
        clientId: input.clientId,
        substance: input.noKnownAllergies ? "No known allergies" : input.substance!.trim(),
        reaction: input.reaction?.trim() || null,
        severity: input.noKnownAllergies ? "unknown" : input.severity ?? "unknown",
        noKnownAllergies: input.noKnownAllergies ?? false,
        recordedBy: input.actorId,
        recordedAt: at,
      });
      after = { kind: "allergy", substance: input.noKnownAllergies ? "No known allergies" : input.substance, severity: input.severity ?? "unknown", active: true };
      reason = input.noKnownAllergies ? "Medical documented no known allergies" : "Medical added allergy";
    } else if (input.kind === "allergy" && input.operation === "end") {
      const [row] = await tx.update(allergyTable).set({ endedAt: at }).where(and(eq(allergyTable.id, input.id), eq(allergyTable.clientId, input.clientId), isNull(allergyTable.endedAt))).returning();
      if (!row) return { status: "conflict" as const, reason: "The allergy is missing or already inactive." };
      before = { active: true, substance: row.substance }; after = { active: false, endedAt: input.at };
      reason = input.reason?.trim() || "Medical inactivated allergy after reconciliation";
    } else if (input.kind === "problem" && input.operation === "add") {
      await tx.insert(problemTable).values({ id: input.id, clientId: input.clientId, label: input.label!.trim(), icd10: input.icd10?.trim() || null, status: "active", onsetOn: input.onsetOn || null, recordedBy: input.actorId, recordedAt: at });
      after = { kind: "problem", label: input.label, icd10: input.icd10 || null, status: "active" }; reason = "Medical added problem-list entry";
    } else if (input.kind === "problem" && input.operation === "end") {
      const [row] = await tx.update(problemTable).set({ status: "resolved", resolvedOn: day }).where(and(eq(problemTable.id, input.id), eq(problemTable.clientId, input.clientId), ne(problemTable.status, "resolved"))).returning();
      if (!row) return { status: "conflict" as const, reason: "The problem is missing or already resolved." };
      before = { status: row.status, label: row.label }; after = { status: "resolved", resolvedOn: day }; reason = input.reason?.trim() || "Medical resolved problem-list entry";
    } else if (input.kind === "medication" && input.operation === "add") {
      await tx.insert(medicationTable).values({ id: input.id, clientId: input.clientId, name: input.name!.trim(), external: true, dose: input.dose?.trim() || null, frequency: input.frequency?.trim() || null, startedOn: input.startedOn || null, prescriber: input.prescriber?.trim() || null, recordedBy: input.actorId, recordedAt: at });
      after = { kind: "medication", name: input.name, dose: input.dose || null, frequency: input.frequency || null, external: true, active: true }; reason = "Medical added outside medication";
    } else if (input.kind === "medication" && input.operation === "end") {
      const [row] = await tx.update(medicationTable).set({ stoppedOn: day }).where(and(eq(medicationTable.id, input.id), eq(medicationTable.clientId, input.clientId), isNull(medicationTable.stoppedOn))).returning();
      if (!row) return { status: "conflict" as const, reason: "The medication is missing or already stopped." };
      before = { active: true, name: row.name }; after = { active: false, stoppedOn: day }; reason = input.reason?.trim() || "Medical marked outside medication stopped";
    } else if (input.kind === "reconcile" && input.operation === "reconcile") {
      entityId = `reconciliation-${input.clientId}-${input.at}`;
      const [allergyRows, problemRows, medicationRows] = await Promise.all([
        tx.select({ id: allergyTable.id }).from(allergyTable).where(and(eq(allergyTable.clientId, input.clientId), isNull(allergyTable.endedAt))),
        tx.select({ id: problemTable.id }).from(problemTable).where(and(eq(problemTable.clientId, input.clientId), eq(problemTable.status, "active"))),
        tx.select({ id: medicationTable.id }).from(medicationTable).where(and(eq(medicationTable.clientId, input.clientId), isNull(medicationTable.stoppedOn))),
      ]);
      after = { reconciledAt: input.at, allergiesReviewed: allergyRows.length, problemsReviewed: problemRows.length, medicationsReviewed: medicationRows.length };
      reason = input.reason?.trim() || "Medical reconciled allergies, problems, and medications";
    } else return { status: "invalid" as const, reason: "Unsupported chart-fundamentals operation." };

    const ledger = await appendLedgerInTx(tx, {
      actorId: input.actorId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: input.operation === "add" ? "create" : "update",
      entity: "chart",
      entityId,
      subjectId: input.clientId,
      reason,
      before,
      after,
    }, input.at);
    return { status: "ok" as const, ledger };
  });
}

export async function readAppointmentCareScope(id: string) {
  const db = requireDb();
  const [row] = await db
    .select({
      appointment: appointmentTable,
      assignedCoachId: clientTable.assignedCoachId,
      assignedProviderId: clientTable.assignedProviderId,
      homeLocationId: clientTable.homeLocationId,
    })
    .from(appointmentTable)
    .innerJoin(clientTable, eq(appointmentTable.clientId, clientTable.id))
    .where(eq(appointmentTable.id, id))
    .limit(1);
  return row ?? null;
}

export async function readNcvGroupCareScope(groupId: string) {
  const db = requireDb();
  const [row] = await db
    .select({
      clientId: appointmentTable.clientId,
      locationId: appointmentTable.locationId,
      assignedCoachId: clientTable.assignedCoachId,
      assignedProviderId: clientTable.assignedProviderId,
      homeLocationId: clientTable.homeLocationId,
    })
    .from(appointmentTable)
    .innerJoin(clientTable, eq(appointmentTable.clientId, clientTable.id))
    .where(eq(appointmentTable.bookingGroupId, groupId))
    .limit(1);
  return row ?? null;
}

export async function bookAppointmentWithLedger(input: {
  id: string;
  clientId: string;
  staffId: string;
  locationId: string;
  visitType: string;
  modality: string;
  startAt: string;
  endAt: string;
  reason?: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
  overrideReason?: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4250)`);
    const [existing] = await tx.select().from(appointmentTable).where(eq(appointmentTable.id, input.id)).limit(1);
    if (existing) return { appointment: existing, ledger: null, duplicate: true, issues: [] as string[] };
    const issues = await slotConflicts(tx, {
      clientId: input.clientId,
      staffId: input.staffId,
      locationId: input.locationId,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
    });
    const blocking = blockingSlotIssues(issues, input.overrideReason);
    if (blocking.length) return { appointment: null, ledger: null, duplicate: false, issues: blocking };

    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: "create",
        entity: "appointment",
        entityId: input.id,
        subjectId: input.clientId,
        locationId: input.locationId as LedgerDraft["locationId"],
        reason: input.overrideReason ? `Appointment booked with operational override: ${input.overrideReason}` : "Appointment booked",
        after: { staffId: input.staffId, startAt: input.startAt, endAt: input.endAt, visitType: input.visitType, modality: input.modality, overrideIssues: issues },
      },
      input.at,
    );
    const [appointment] = await tx
      .insert(appointmentTable)
      .values({
        id: input.id,
        clientId: input.clientId,
        staffId: input.staffId,
        locationId: input.locationId,
        visitType: input.visitType,
        modality: input.modality,
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt),
        status: "Scheduled",
        reason: input.reason ?? null,
        bookedBy: input.actorId,
        bookedAt: new Date(input.at),
        ledgerId: ledger.id,
      })
      .returning();
    return { appointment, ledger, duplicate: false, issues };
  });
}

/**
 * Book the three required parts of a New Client Visit as one transaction.
 *
 * No partial booking is possible: staffing, licence, location policy, working
 * hours, Apex collisions, and Google busy time are resolved before any row is
 * inserted. A retry returns the existing group. Clinical credentials come from
 * effective staff_credential rows, never the display string on staff.
 */
export async function bookNcvWithLedger(input: {
  groupId: string;
  clientId: string;
  locationId: string;
  startAt: string;
  gapMinutes?: number;
  preferProviderId?: string;
  reason?: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
  overrideReason?: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4250)`);
    const existing = await tx
      .select()
      .from(appointmentTable)
      .where(eq(appointmentTable.bookingGroupId, input.groupId))
      .orderBy(asc(appointmentTable.startAt));
    if (existing.length) return { status: "ok" as const, duplicate: true, appointments: existing, assignments: [], ledger: null };

    const [person] = await tx
      .select({ id: clientTable.id, status: clientTable.status })
      .from(clientTable)
      .where(eq(clientTable.id, input.clientId))
      .limit(1);
    if (!person || person.status !== "active") return { status: "invalid" as const, reason: "The patient is not active in Apex." };

    const [clinic] = await tx
      .select({
        id: clinicLocationTable.id,
        active: clinicLocationTable.active,
        state: clinicLocationTable.state,
        timezone: clinicLocationTable.timezone,
        lpnLabDrawApproved: clinicLocationTable.lpnLabDrawApproved,
      })
      .from(clinicLocationTable)
      .where(eq(clinicLocationTable.id, input.locationId))
      .limit(1);
    if (!clinic?.active) return { status: "invalid" as const, reason: "The selected clinic is not active." };
    if (!clinic.state) return { status: "invalid" as const, reason: "The clinic needs a verified state before an NCV can be staffed." };

    const [workers, credentials] = await Promise.all([
      tx
        .select({
          id: staffTable.id,
          name: staffTable.name,
          accessProfile: staffTable.accessProfile,
          locationIds: staffTable.locationIds,
          active: staffTable.active,
          excluded: staffTable.excludeFromScheduling,
        })
        .from(staffTable)
        .where(and(eq(staffTable.active, true), eq(staffTable.excludeFromScheduling, false)))
        .orderBy(staffTable.name),
      tx
        .select()
        .from(staffCredential)
        .where(and(eq(staffCredential.status, "active"), eq(staffCredential.state, clinic.state))),
    ]);
    const eligibleWorkers = workers.filter((worker) =>
      Array.isArray(worker.locationIds) && (worker.locationIds as string[]).includes(input.locationId),
    );
    const localDay = localSlot(new Date(input.startAt), clinic.timezone).date;
    const credentialsByStaff = new Map<string, CredentialClass[]>();
    for (const row of credentials) {
      if (!row.licenseNumber || !row.expiresOn || row.expiresOn < localDay) continue;
      const parsed = parseCredential(row.credential);
      if (!parsed || parsed === "Coach" || parsed === "Admin") continue;
      if (parsed === "LPN" && !clinic.lpnLabDrawApproved) continue;
      const current = credentialsByStaff.get(row.staffId) ?? [];
      if (!current.includes(parsed)) current.push(parsed);
      credentialsByStaff.set(row.staffId, current);
    }

    const gap = Math.max(0, Math.min(input.gapMinutes ?? 0, 30));
    let cursor = new Date(input.startAt);
    const assignments: Array<{
      component: NcvComponentId;
      staffId: string;
      staffName: string;
      credential: CredentialClass;
      tier: number;
      startAt: Date;
      endAt: Date;
      issues: string[];
    }> = [];

    for (const component of [...NCV_COMPONENTS].sort((a, b) => a.sequence - b.sequence)) {
      const startAt = new Date(cursor);
      const endAt = new Date(startAt.getTime() + component.durationMin * 60_000);
      let chosen: (typeof assignments)[number] | null = null;
      const rejectedIssues = new Set<string>();

      for (let tier = 0; tier < component.tiers.length && !chosen; tier++) {
        const accepted = component.tiers[tier];
        const ordered = [...eligibleWorkers].sort((a, b) => {
          if (input.preferProviderId) {
            if (a.id === input.preferProviderId) return -1;
            if (b.id === input.preferProviderId) return 1;
          }
          return a.name.localeCompare(b.name);
        });
        for (const worker of ordered) {
          let credential: CredentialClass | undefined;
          if (accepted.includes("Coach") && worker.accessProfile === "coach") credential = "Coach";
          else {
            credential = (credentialsByStaff.get(worker.id) ?? []).find((item) => accepted.includes(item));
            const correctProfile = credential && (
              (["MD", "DO", "NP", "PA"] as CredentialClass[]).includes(credential)
                ? worker.accessProfile === "provider"
                : (["RN", "LPN"] as CredentialClass[]).includes(credential)
                  ? worker.accessProfile === "nursing"
                  : false
            );
            if (!correctProfile) credential = undefined;
          }
          if (!credential) continue;

          const issues = await slotConflicts(tx, {
            clientId: input.clientId,
            staffId: worker.id,
            locationId: input.locationId,
            startAt,
            endAt,
          });
          const blocking = blockingSlotIssues(issues, input.overrideReason);
          if (blocking.length) {
            blocking.forEach((issue) => rejectedIssues.add(issue));
            continue;
          }
          chosen = {
            component: component.id,
            staffId: worker.id,
            staffName: worker.name,
            credential,
            tier,
            startAt,
            endAt,
            issues,
          };
          break;
        }
      }

      if (!chosen) {
        return {
          status: "blocked" as const,
          blockedOn: component.id,
          wouldNeed: component.tiers.flatMap((tier) => [...tier]),
          issues: [...rejectedIssues],
        };
      }
      assignments.push(chosen);
      cursor = new Date(chosen.endAt.getTime() + gap * 60_000);
    }

    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: "create",
        entity: "appointment",
        entityId: input.groupId,
        subjectId: input.clientId,
        locationId: input.locationId as LedgerDraft["locationId"],
        reason: input.overrideReason
          ? `Atomic NCV booked with approved-hours exception: ${input.overrideReason}`
          : "Atomic three-component New Client Visit booked",
        after: {
          kind: "new-client-visit",
          assignments: assignments.map((row) => ({
            component: row.component,
            staffId: row.staffId,
            credential: row.credential,
            tier: row.tier,
            startAt: row.startAt.toISOString(),
            endAt: row.endAt.toISOString(),
          })),
        },
      },
      input.at,
    );

    const appointmentRows = await tx
      .insert(appointmentTable)
      .values(assignments.map((row) => ({
        id: `${input.groupId}-${row.component}`,
        bookingGroupId: input.groupId,
        component: row.component,
        clientId: input.clientId,
        staffId: row.staffId,
        locationId: input.locationId,
        visitType: `NCV - ${NCV_COMPONENTS.find((part) => part.id === row.component)!.label}`,
        modality: "in-person",
        startAt: row.startAt,
        endAt: row.endAt,
        status: "Scheduled",
        reason: input.reason ?? null,
        bookedBy: input.actorId,
        bookedAt: new Date(input.at),
        ledgerId: ledger.id,
      })))
      .returning();

    const encounterId = `enc-${input.groupId}`;
    await tx.insert(encounter).values({
      id: encounterId,
      appointmentId: `${input.groupId}-coach-intro`,
      clientId: input.clientId,
      locationId: input.locationId,
      kind: "new-client-visit",
      modality: "in-person",
      status: "open",
      startedAt: assignments[0].startAt,
      ledgerId: ledger.id,
    });
    await tx.insert(encounterSegment).values(assignments.map((row) => {
      const definition = NCV_COMPONENTS.find((part) => part.id === row.component)!;
      return {
        id: `${encounterId}-${row.component}`,
        encounterId,
        component: row.component,
        sequence: definition.sequence,
        requiredCredentials: definition.tiers as never,
        assignedStaffId: row.staffId,
        status: "pending",
        ledgerId: ledger.id,
      };
    }));

    return { status: "ok" as const, duplicate: false, appointments: appointmentRows, assignments, encounterId, ledger };
  });
}

/** Cancel or move an entire NCV; never leave one of its three parts behind. */
export async function changeNcvGroupWithLedger(input: {
  groupId: string;
  action: "cancel" | "reschedule" | "no-show";
  startAt?: string;
  reason: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
  overrideReason?: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4250)`);
    const rows = await tx
      .select()
      .from(appointmentTable)
      .where(eq(appointmentTable.bookingGroupId, input.groupId))
      .orderBy(asc(appointmentTable.startAt));
    if (!rows.length) return { status: "missing" as const };
    if (rows.length !== NCV_COMPONENTS.length || rows.some((row) => !row.component)) {
      return { status: "conflict" as const, reason: "The NCV booking group is incomplete and requires operational review." };
    }
    if (rows.some((row) => normalizedAppointmentState(row.status) !== "Scheduled")) {
      return { status: "conflict" as const, reason: "Only an entirely scheduled NCV can be cancelled or rescheduled as a group." };
    }
    const at = new Date(input.at);
    const groupReservations = await tx.select().from(resourceReservation).where(and(
      inArray(resourceReservation.appointmentId, rows.map((row) => row.id)),
      or(eq(resourceReservation.status, "reserved"), eq(resourceReservation.status, "in-use")),
    ));
    if (input.action === "reschedule" && groupReservations.length) {
      return { status: "conflict" as const, reason: "Release or move every clinic resource reservation before rescheduling this NCV." };
    }

    if (input.action === "cancel" || input.action === "no-show") {
      if (!input.reason.trim()) return { status: "invalid" as const, reason: "A reason is required." };
      const terminalStatus = input.action === "cancel" ? "Cancelled" : "No Show";
      await tx
        .update(appointmentTable)
        .set(input.action === "cancel"
          ? {
              status: terminalStatus,
              cancelledAt: at,
              cancelledBy: input.actorId,
              cancelReason: input.reason.trim(),
            }
          : { status: terminalStatus })
        .where(eq(appointmentTable.bookingGroupId, input.groupId));
      const [linkedEncounter] = await tx
        .select({ id: encounter.id })
        .from(encounter)
        .where(eq(encounter.appointmentId, `${input.groupId}-coach-intro`))
        .limit(1);
      if (linkedEncounter) {
        await tx
          .update(encounter)
          .set({ status: "abandoned", abandonedAt: at, abandonedReason: `${terminalStatus}: ${input.reason.trim()}` })
          .where(eq(encounter.id, linkedEncounter.id));
      }
      const ledger = await appendLedgerInTx(tx, {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: "update",
        entity: "appointment",
        entityId: input.groupId,
        subjectId: rows[0].clientId,
        locationId: rows[0].locationId as LedgerDraft["locationId"],
        reason: `Entire NCV ${input.action === "cancel" ? "cancelled" : "marked no-show"}: ${input.reason.trim()}`,
        before: { status: "Scheduled", components: rows.map((row) => row.component) },
        after: { status: terminalStatus, endedAt: input.at },
      }, input.at);
      for (const reservation of groupReservations) {
        const terminal = reservation.status === "in-use" ? "released" : "cancelled";
        const candidateEnd = reservation.endAt > at ? at : reservation.endAt;
        const actualEnd = candidateEnd > reservation.startAt ? candidateEnd : new Date(reservation.startAt.getTime() + 1);
        await tx.update(resourceReservation).set({
          status: terminal,
          endAt: actualEnd,
          releasedAt: at,
          releaseReason: `NCV ${input.action}`,
        }).where(eq(resourceReservation.id, reservation.id));
        await appendLedgerInTx(tx, {
          actorId: input.actorId,
          actorName: input.actorName,
          actorRole: input.actorRole,
          action: "update",
          entity: "resource-reservation",
          entityId: reservation.id,
          subjectId: rows[0].clientId,
          locationId: rows[0].locationId as LedgerDraft["locationId"],
          reason: `Released by entire NCV ${input.action}.`,
          before: { status: reservation.status, endAt: reservation.endAt.toISOString() },
          after: { status: terminal, endAt: actualEnd.toISOString(), releasedAt: at.toISOString() },
        }, input.at);
      }
      return { status: "ok" as const, appointments: rows.map((row) => ({ ...row, status: terminalStatus })), ledger };
    }

    if (!input.startAt) return { status: "invalid" as const, reason: "A new start time is required." };
    const nextStart = new Date(input.startAt);
    if (Number.isNaN(nextStart.getTime())) return { status: "invalid" as const, reason: "The new start time is invalid." };
    const delta = nextStart.getTime() - rows[0].startAt.getTime();
    const proposed = rows.map((row) => ({
      row,
      startAt: new Date(row.startAt.getTime() + delta),
      endAt: new Date(row.endAt.getTime() + delta),
    }));
    for (const item of proposed) {
      if (!item.row.staffId || !item.row.locationId) return { status: "conflict" as const, reason: "Every NCV component must have assigned staff and a clinic." };
      const definition = NCV_COMPONENTS.find((part) => part.id === item.row.component);
      if (!definition) return { status: "conflict" as const, reason: "The NCV contains an unknown component." };
      const [[clinicPolicy], [worker], credentialRows] = await Promise.all([
        tx
          .select({ state: clinicLocationTable.state, timezone: clinicLocationTable.timezone, lpnLabDrawApproved: clinicLocationTable.lpnLabDrawApproved })
          .from(clinicLocationTable)
          .where(eq(clinicLocationTable.id, item.row.locationId))
          .limit(1),
        tx
          .select({ accessProfile: staffTable.accessProfile })
          .from(staffTable)
          .where(eq(staffTable.id, item.row.staffId))
          .limit(1),
        tx
          .select()
          .from(staffCredential)
          .where(and(eq(staffCredential.staffId, item.row.staffId), eq(staffCredential.status, "active"))),
      ]);
      const required = definition.tiers.flatMap((tier) => [...tier]);
      const localDay = clinicPolicy ? localSlot(item.startAt, clinicPolicy.timezone).date : "";
      const qualified = definition.id === "coach-intro"
        ? worker?.accessProfile === "coach"
        : credentialRows.some((row) => {
            const credential = parseCredential(row.credential);
            if (!credential || !required.includes(credential)) return false;
            if (!clinicPolicy?.state || row.state !== clinicPolicy.state || !row.licenseNumber || !row.expiresOn || row.expiresOn < localDay) return false;
            if (credential === "LPN" && !clinicPolicy.lpnLabDrawApproved) return false;
            return (["MD", "DO", "NP", "PA"] as CredentialClass[]).includes(credential)
              ? worker?.accessProfile === "provider"
              : (["RN", "LPN"] as CredentialClass[]).includes(credential) && worker?.accessProfile === "nursing";
          });
      if (!qualified) {
        return { status: "blocked" as const, component: item.row.component, issues: ["The assigned staff member lacks an active, in-state credential for the new date."] };
      }
      const issues = await slotConflicts(tx, {
        clientId: item.row.clientId,
        staffId: item.row.staffId,
        locationId: item.row.locationId,
        startAt: item.startAt,
        endAt: item.endAt,
        excludeAppointmentId: item.row.id,
      });
      const blocking = blockingSlotIssues(issues, input.overrideReason);
      if (blocking.length) return { status: "blocked" as const, component: item.row.component, issues: blocking };
    }

    for (const item of proposed) {
      await tx
        .update(appointmentTable)
        .set({ startAt: item.startAt, endAt: item.endAt })
        .where(eq(appointmentTable.id, item.row.id));
    }
    const [linkedEncounter] = await tx
      .select({ id: encounter.id })
      .from(encounter)
      .where(eq(encounter.appointmentId, `${input.groupId}-coach-intro`))
      .limit(1);
    if (linkedEncounter) {
      await tx.update(encounter).set({ startedAt: nextStart }).where(eq(encounter.id, linkedEncounter.id));
    }
    const ledger = await appendLedgerInTx(tx, {
      actorId: input.actorId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "update",
      entity: "appointment",
      entityId: input.groupId,
      subjectId: rows[0].clientId,
      locationId: rows[0].locationId as LedgerDraft["locationId"],
      reason: input.overrideReason
        ? `Entire NCV rescheduled with approved-hours exception: ${input.overrideReason}`
        : `Entire NCV rescheduled: ${input.reason.trim()}`,
      before: { startAt: rows[0].startAt.toISOString() },
      after: { startAt: nextStart.toISOString() },
    }, input.at);
    return {
      status: "ok" as const,
      appointments: proposed.map((item) => ({ ...item.row, startAt: item.startAt, endAt: item.endAt })),
      ledger,
    };
  });
}

export async function changeAppointmentWithLedger(input: {
  id: string;
  action: "arrive" | "room" | "complete" | "no-show" | "cancel" | "reopen" | "reschedule" | "reassign";
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
  resourceId?: string;
  room?: string;
  reason?: string;
  startAt?: string;
  endAt?: string;
  staffId?: string;
  locationId?: string;
  overrideReason?: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4250)`);
    const [current] = await tx.select().from(appointmentTable).where(eq(appointmentTable.id, input.id)).limit(1);
    if (!current) return { status: "missing" as const };
    if (current.bookingGroupId && ["cancel", "no-show", "reopen", "reschedule", "reassign"].includes(input.action)) {
      return { status: "conflict" as const, reason: `This appointment belongs to NCV group ${current.bookingGroupId}; use the group workflow so every component stays consistent.` };
    }
    const from = normalizedAppointmentState(current.status);
    if (!from) return { status: "conflict" as const, reason: "Unknown current appointment state." };

    let to: AppointmentState = from;
    if (input.action === "arrive") to = "Arrived";
    if (input.action === "room") to = "Roomed";
    if (input.action === "complete") to = "Completed";
    if (input.action === "no-show") to = "No Show";
    if (input.action === "cancel") to = "Cancelled";
    if (input.action === "reopen") to = "Scheduled";
    const stateChange = to !== from;
    if (stateChange && !appointmentTransitionAllowed(from, to)) {
      return { status: "conflict" as const, reason: `${from} cannot move to ${to}. Refresh the appointment.` };
    }
    const at = new Date(input.at);
    let roomResource: typeof clinicResource.$inferSelect | null = null;
    if (input.action === "room") {
      if (!input.resourceId?.trim()) return { status: "invalid" as const, reason: "Choose an active clinic room." };
      [roomResource] = await tx.select().from(clinicResource).where(eq(clinicResource.id, input.resourceId.trim())).limit(1);
      if (!roomResource) return { status: "invalid" as const, reason: "The selected clinic room does not exist." };
      if (roomResource.status !== "active") return { status: "conflict" as const, reason: `${roomResource.label} is not in service.` };
      if (!current.locationId || roomResource.locationId !== current.locationId) return { status: "conflict" as const, reason: "The selected room belongs to a different clinic." };
      if (roomResource.resourceType !== "room" || !resourceSuitableForVisit(roomResource.kind, current.visitType)) {
        return { status: "conflict" as const, reason: `${roomResource.label} is not configured for ${current.visitType}.` };
      }
      const expectedEnd = current.endAt > at ? current.endAt : new Date(at.getTime() + 30 * 60_000);
      const occupied = await tx.select({ id: resourceReservation.id }).from(resourceReservation).where(and(
        eq(resourceReservation.resourceId, roomResource.id),
        or(
          eq(resourceReservation.status, "in-use"),
          and(
            eq(resourceReservation.status, "reserved"),
            lt(resourceReservation.startAt, expectedEnd),
            gt(resourceReservation.endAt, at),
          ),
        ),
      )).limit(1);
      if (occupied.length) return { status: "conflict" as const, reason: `${roomResource.label} is already occupied or reserved.` };
    }
    if ((input.action === "cancel" || input.action === "reopen") && !input.reason?.trim()) {
      return { status: "invalid" as const, reason: "A reason is required for this change." };
    }

    const scheduleChange = input.action === "reschedule" || input.action === "reassign";
    if (scheduleChange && from !== "Scheduled") {
      return { status: "conflict" as const, reason: "Only a scheduled appointment can be moved or reassigned." };
    }
    if (scheduleChange) {
      const reservation = await tx.select({ id: resourceReservation.id }).from(resourceReservation).where(and(
        eq(resourceReservation.appointmentId, current.id),
        or(eq(resourceReservation.status, "reserved"), eq(resourceReservation.status, "in-use")),
      )).limit(1);
      if (reservation.length) return { status: "conflict" as const, reason: "Release or move the clinic resource reservation before changing this appointment." };
    }
    const nextStaffId = input.staffId ?? current.staffId;
    const nextLocationId = input.locationId ?? current.locationId;
    const nextStartAt = input.startAt ? new Date(input.startAt) : current.startAt;
    const nextEndAt = input.endAt ? new Date(input.endAt) : current.endAt;
    if (scheduleChange) {
      if (!nextStaffId || !nextLocationId) return { status: "invalid" as const, reason: "Staff and clinic are required." };
      const issues = await slotConflicts(tx, {
        clientId: current.clientId,
        staffId: nextStaffId,
        locationId: nextLocationId,
        startAt: nextStartAt,
        endAt: nextEndAt,
        excludeAppointmentId: current.id,
      });
      const blocking = blockingSlotIssues(issues, input.overrideReason);
      if (blocking.length) return { status: "invalid" as const, reason: blocking.join(" "), issues: blocking };
    }

    const changes: Partial<typeof appointmentTable.$inferInsert> = {
      status: to,
      staffId: nextStaffId,
      locationId: nextLocationId,
      startAt: nextStartAt,
      endAt: nextEndAt,
    };
    if (to === "Arrived") {
      changes.arrivedAt = current.arrivedAt ?? at;
      changes.roomedAt = null;
      changes.room = null;
      changes.completedAt = null;
    } else if (to === "Roomed") {
      changes.roomedAt = at;
      changes.resourceId = roomResource!.id;
      changes.room = roomResource!.label;
    } else if (to === "Completed") changes.completedAt = at;
    else if (to === "Cancelled") {
      changes.cancelledAt = at;
      changes.cancelledBy = input.actorId;
      changes.cancelReason = input.reason!.trim();
    } else if (to === "Scheduled" && stateChange) {
      changes.arrivedAt = null;
      changes.roomedAt = null;
      changes.resourceId = null;
      changes.room = null;
      changes.completedAt = null;
      changes.cancelledAt = null;
      changes.cancelledBy = null;
      changes.cancelReason = null;
    }

    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: "update",
        entity: "appointment",
        entityId: input.id,
        subjectId: current.clientId,
        locationId: (nextLocationId ?? current.locationId ?? undefined) as LedgerDraft["locationId"],
        reason: input.overrideReason
          ? `${input.action} with operational override: ${input.overrideReason}`
          : input.reason?.trim() || `Appointment ${input.action}`,
        before: { status: from, staffId: current.staffId, locationId: current.locationId, startAt: current.startAt.toISOString(), endAt: current.endAt.toISOString(), resourceId: current.resourceId, room: current.room },
        after: { status: to, staffId: nextStaffId, locationId: nextLocationId, startAt: nextStartAt.toISOString(), endAt: nextEndAt.toISOString(), resourceId: changes.resourceId === undefined ? current.resourceId : changes.resourceId, room: changes.room === undefined ? current.room : changes.room },
      },
      input.at,
    );
    changes.ledgerId = ledger.id;
    const [appointment] = await tx.update(appointmentTable).set(changes).where(eq(appointmentTable.id, input.id)).returning();
    let resourceLedger: LedgerRow | null = null;
    if (input.action === "room" && roomResource) {
      const expectedEnd = current.endAt > at ? current.endAt : new Date(at.getTime() + 30 * 60_000);
      const reservationId = `reservation-${current.id}-${at.getTime()}`;
      await tx.insert(resourceReservation).values({
        id: reservationId,
        resourceId: roomResource.id,
        appointmentId: current.id,
        status: "in-use",
        startAt: at,
        endAt: expectedEnd,
        reservedBy: input.actorId,
        reservedAt: at,
        checkedInAt: at,
      });
      resourceLedger = await appendLedgerInTx(tx, {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: "create",
        entity: "resource-reservation",
        entityId: reservationId,
        subjectId: current.clientId,
        locationId: current.locationId as LedgerDraft["locationId"],
        reason: "Assigned an authoritative clinic room at rooming.",
        after: { resourceId: roomResource.id, resourceLabel: roomResource.label, appointmentId: current.id, status: "in-use", startAt: at.toISOString(), endAt: expectedEnd.toISOString() },
      }, input.at);
      await tx.update(resourceReservation).set({ ledgerId: resourceLedger.id }).where(eq(resourceReservation.id, reservationId));
    } else if (["complete", "cancel", "no-show"].includes(input.action)) {
      const activeReservations = await tx.select().from(resourceReservation).where(and(
        eq(resourceReservation.appointmentId, current.id),
        or(eq(resourceReservation.status, "reserved"), eq(resourceReservation.status, "in-use")),
      ));
      for (const reservation of activeReservations) {
        const terminal = reservation.status === "in-use" ? "released" : "cancelled";
        const candidateEnd = reservation.endAt > at ? at : reservation.endAt;
        const actualEnd = candidateEnd > reservation.startAt ? candidateEnd : new Date(reservation.startAt.getTime() + 1);
        await tx.update(resourceReservation).set({
          status: terminal,
          endAt: actualEnd,
          releasedAt: at,
          releaseReason: `Appointment ${input.action}`,
        }).where(eq(resourceReservation.id, reservation.id));
        resourceLedger = await appendLedgerInTx(tx, {
          actorId: input.actorId,
          actorName: input.actorName,
          actorRole: input.actorRole,
          action: "update",
          entity: "resource-reservation",
          entityId: reservation.id,
          subjectId: current.clientId,
          locationId: current.locationId as LedgerDraft["locationId"],
          reason: `Released by appointment ${input.action}.`,
          before: { status: reservation.status, endAt: reservation.endAt.toISOString() },
          after: { status: terminal, endAt: actualEnd.toISOString(), releasedAt: at.toISOString() },
        }, input.at);
      }
    }
    return { status: "ok" as const, appointment, ledger, resourceLedger };
  });
}

/**
 * Raise an escalation so a provider actually receives it.
 *
 * The prototype discarded `raiseEscalation()`'s return value and the clinician
 * queue re-seeded from a static array, so a coach raising an urgent clinical
 * concern got a toast and the provider never saw it — the highest-severity
 * broken path in the product.
 */
export async function raiseEscalation(input: {
  id: string;
  clientId: string;
  raisedByStaffId: string;
  raisedAt: string;
  kind: string;
  priority: string;
  question: string;
  memberQuote?: string;
  dueAt?: string;
  ledgerId?: string;
}) {
  const db = requireDb();
  await db.insert(escalationTable).values({
    id: input.id,
    clientId: input.clientId,
    raisedByStaffId: input.raisedByStaffId,
    raisedAt: new Date(input.raisedAt),
    kind: input.kind,
    priority: input.priority,
    question: input.question,
    memberQuote: input.memberQuote ?? null,
    dueAt: input.dueAt ? new Date(input.dueAt) : null,
    ledgerId: input.ledgerId ?? null,
  });
}

/** Escalation row and audit witness commit together or neither commits. */
export async function raiseEscalationWithLedger(input: {
  id: string;
  clientId: string;
  raisedByStaffId: string;
  raisedByName: string;
  raisedByRole: string;
  raisedAt: string;
  kind: string;
  priority: string;
  question: string;
  memberQuote?: string;
  dueAt: string;
  messageId?: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.raisedByStaffId,
        actorName: input.raisedByName,
        actorRole: input.raisedByRole,
        action: "create",
        entity: "note",
        entityId: input.id,
        subjectId: input.clientId,
        reason: `Pushed to medical: ${input.kind} (${input.priority})`,
        after: { kind: input.kind, priority: input.priority, dueAt: input.dueAt, messageId: input.messageId ?? null },
      },
      input.raisedAt,
    );
    await tx.insert(escalationTable).values({
      id: input.id,
      clientId: input.clientId,
      raisedByStaffId: input.raisedByStaffId,
      raisedAt: new Date(input.raisedAt),
      kind: input.kind,
      priority: input.priority,
      question: input.question,
      memberQuote: input.memberQuote ?? null,
      dueAt: new Date(input.dueAt),
      ledgerId: ledger.id,
    });
    if (input.messageId) {
      await tx
        .update(messageTable)
        .set({ escalatedAt: new Date(input.raisedAt), escalationId: input.id })
        .where(
          and(
            eq(messageTable.id, input.messageId),
            eq(messageTable.clientId, input.clientId),
            eq(messageTable.thread, "coach"),
          ),
        );
    }
    return { escalationId: input.id, ledger };
  });
}

/** Open escalations, worst SLA first — the provider's queue. */
export async function readOpenEscalations() {
  const db = requireDb();
  return db
    .select()
    .from(escalationTable)
    .where(raw`${escalationTable.status} <> 'Answered'`)
    .orderBy(escalationTable.dueAt);
}

/**
 * Shared durable escalation read model.
 *
 * Medical reads the full queue, while a coach/client chart supplies one of the
 * filters below. Authorization stays in the API route; the repository only
 * applies the already-authorized scope.
 */
export async function readEscalations(filter: { clientId?: string; raisedByStaffId?: string } = {}) {
  const db = requireDb();
  const clientFilter = filter.clientId ? eq(escalationTable.clientId, filter.clientId) : undefined;
  const coachFilter = filter.raisedByStaffId
    ? eq(escalationTable.raisedByStaffId, filter.raisedByStaffId)
    : undefined;
  const where = clientFilter && coachFilter ? and(clientFilter, coachFilter) : clientFilter ?? coachFilter;

  const base = db.select().from(escalationTable);
  return where
    ? base.where(where).orderBy(desc(escalationTable.raisedAt))
    : base.orderBy(desc(escalationTable.raisedAt));
}

/** A Medical queue transition and its audit witness commit together. */
export async function transitionEscalationWithLedger(input: {
  id: string;
  nextStatus: "Acknowledged" | "In review" | "Answered";
  actorId: string;
  actorName: string;
  actorRole: string;
  answer?: string;
  at: string;
}) {
  const db = requireDb();
  const at = new Date(input.at);

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(escalationTable)
      .where(eq(escalationTable.id, input.id))
      .limit(1);
    if (!current) return null;

    const allowed =
      (current.status === "Open" && input.nextStatus === "Acknowledged") ||
      ((current.status === "Open" || current.status === "Acknowledged") &&
        input.nextStatus === "In review") ||
      ((current.status === "Open" || current.status === "Acknowledged" || current.status === "In review") &&
        input.nextStatus === "Answered");
    if (!allowed) return null;
    if (input.nextStatus === "Answered" && !input.answer?.trim()) return null;

    const [updated] = await tx
      .update(escalationTable)
      .set({
        status: input.nextStatus,
        acknowledgedBy:
          input.nextStatus === "Acknowledged" || input.nextStatus === "In review"
            ? input.actorId
            : current.acknowledgedBy,
        acknowledgedAt:
          input.nextStatus === "Acknowledged" || input.nextStatus === "In review"
            ? current.acknowledgedAt ?? at
            : current.acknowledgedAt,
        answeredBy: input.nextStatus === "Answered" ? input.actorId : current.answeredBy,
        answeredAt: input.nextStatus === "Answered" ? at : current.answeredAt,
        answer: input.nextStatus === "Answered" ? input.answer!.trim() : current.answer,
      })
      .where(and(eq(escalationTable.id, input.id), eq(escalationTable.status, current.status)))
      .returning();
    if (!updated) return null;

    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: input.nextStatus === "Answered" ? "approve" : "update",
        entity: "recommendation",
        entityId: input.id,
        subjectId: current.clientId,
        reason:
          input.nextStatus === "Answered"
            ? "Medical answered escalation; guidance returned to coach"
            : `Medical moved escalation to ${input.nextStatus}`,
        before: { status: current.status },
        after: { status: input.nextStatus },
      },
      input.at,
    );

    return { escalation: updated, ledger };
  });
}

/* -------------------------------------------------------------------------- */
/* Dispensing and recall                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Record a dispense AND move the stock, in one transaction.
 *
 * These two facts must not be able to disagree. The prototype had immutable
 * `inventory.quantity` and no dispense record at all, so stock on hand was a
 * constant and in-clinic administration left no trace
 * (docs/audit/GAP_ANALYSIS.md, FRONT DESK).
 */
export async function recordDispense(input: {
  id: string;
  clientId: string;
  prescriptionId?: string;
  sku: string;
  lotNumber: string;
  expiryOn?: string;
  quantity: number;
  method: string;
  locationId?: LocationId;
  dispensedBy: string;
  dispensedAt: string;
  orderId?: string;
  ledgerId?: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.insert(dispense).values({
      id: input.id,
      clientId: input.clientId,
      prescriptionId: input.prescriptionId ?? null,
      sku: input.sku,
      lotNumber: input.lotNumber,
      expiryOn: input.expiryOn ?? null,
      quantity: input.quantity,
      method: input.method,
      locationId: input.locationId ?? null,
      dispensedBy: input.dispensedBy,
      dispensedAt: new Date(input.dispensedAt),
      orderId: input.orderId ?? null,
      ledgerId: input.ledgerId ?? null,
    });

    if (input.locationId) {
      await tx.insert(inventoryMovement).values({
        id: `mv-${input.id}`,
        sku: input.sku,
        lotNumber: input.lotNumber,
        locationId: input.locationId,
        kind: "dispense",
        // Negative: stock on hand is a SUM over movements, so a dispense must
        // subtract. This is why quantity is signed rather than paired with a
        // direction flag someone can forget to read.
        quantityDelta: -Math.abs(input.quantity),
        expiryOn: input.expiryOn ?? null,
        staffId: input.dispensedBy,
        at: new Date(input.dispensedAt),
        dispenseId: input.id,
        ledgerId: input.ledgerId ?? null,
      });
    }
  });
}

/**
 * "Who received lot BPC-2604A?"
 *
 * The question three separate comments claimed was already answerable and which
 * nothing in the codebase could answer (docs/audit/GAP_ANALYSIS.md, Top-10 #5).
 * One indexed lookup, because `dispense.lotNumber` uses the SAME vocabulary as
 * inventory — the fork into a third private lot format is what broke it before,
 * and it must never fork again.
 */
export async function whoReceivedLot(lotNumber: string) {
  const db = requireDb();
  return db
    .select()
    .from(dispense)
    .where(eq(dispense.lotNumber, lotNumber))
    .orderBy(desc(dispense.dispensedAt));
}

/** Stock on hand for a lot at a location — a sum, so it is auditable. */
export async function stockOnHand(sku: string, locationId: string) {
  const db = requireDb();
  const rows = await db
    .select({
      lotNumber: inventoryMovement.lotNumber,
      onHand: raw<number>`SUM(${inventoryMovement.quantityDelta})::int`,
    })
    .from(inventoryMovement)
    .where(and(eq(inventoryMovement.sku, sku), eq(inventoryMovement.locationId, locationId)))
    .groupBy(inventoryMovement.lotNumber);
  return rows;
}

/* -------------------------------------------------------------------------- */
/* Staff — identity and clinical authority                                     */
/* -------------------------------------------------------------------------- */

/**
 * Seed the staff roster into the DB, idempotently.
 *
 * Runs at boot after migrations. Upserts every seeded staff member so the table
 * is populated on a fresh database, and re-running is a no-op that refreshes the
 * row. This is the bridge: the roster still originates in lib/mock/staff for the
 * demo, but the AUTHORITY (who is a prescriber) is now read from the table, so a
 * real deployment adds a provider with an INSERT here rather than a code change.
 * entraObjectId starts null for the seeded rows — a real Entra tenant fills it,
 * and the lookup prefers it once set.
 */
export async function seedStaff(): Promise<number> {
  const db = requireDb();
  for (const s of seededStaff) {
    await db
      .insert(staffTable)
      .values({
        id: s.id,
        email: s.email ?? `${s.id}@alphahealth.demo`,
        name: s.name,
        role: s.role,
        accessProfile: inferAccessProfile({
          id: s.id,
          role: s.role,
          credentials: s.credentials,
          title: s.bio,
        }),
        locationIds: s.locationIds ?? [],
        credentials: s.credentials ?? null,
        canApprove: s.canApprove ?? false,
        active: true,
      })
      /**
       * DO NOTHING on conflict. The seed may CREATE a staff row; it must never
       * overwrite one that already exists.
       *
       * This previously re-applied role, locationIds and canApprove on every
       * boot, which meant the database was not actually the authority it claims
       * to be: revoke a prescriber by setting their role in the table, restart
       * the container, and the seed silently promoted them back. Authority
       * changes have to survive a deploy or they are theatre.
       *
       * Deactivation is likewise preserved — an inactive row stays inactive.
       */
      .onConflictDoNothing({ target: staffTable.id });
  }
  return seededStaff.length;
}

export interface StaffRow {
  id: string;
  entraObjectId: string | null;
  email: string;
  name: string;
  role: string;
  accessProfile: string;
  locationIds: string[];
  credentials: string | null;
  canApprove: boolean;
  active: boolean;
}

function toRow(r: typeof staffTable.$inferSelect): StaffRow {
  return {
    id: r.id,
    entraObjectId: r.entraObjectId,
    email: r.email,
    name: r.name,
    role: r.role,
    accessProfile: r.accessProfile,
    locationIds: (r.locationIds as string[]) ?? [],
    credentials: r.credentials,
    canApprove: r.canApprove,
    active: r.active,
  };
}

/**
 * Claim the stable Entra object id for a staff row that was initially matched
 * by email. This makes email fallback a one-time bridge, not the permanent
 * identity join. The unique partial index on staff.entra_object_id protects the
 * assignment if two rows race.
 */
export async function claimStaffObjectIdByEmail(email: string, objectId: string): Promise<void> {
  const db = requireDb();
  await db
    .update(staffTable)
    .set({ entraObjectId: objectId, updatedAt: new Date() })
    .where(
      and(
        eq(staffTable.email, email.toLowerCase()),
        eq(staffTable.active, true),
        isNull(staffTable.entraObjectId),
      ),
    );
}

/** Look up a staff member by email. The authority read behind mapToStaff. */
export async function staffByEmail(email: string): Promise<StaffRow | null> {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(staffTable)
    .where(and(eq(staffTable.email, email.toLowerCase()), eq(staffTable.active, true)))
    .limit(1);
  return row ? toRow(row) : null;
}

/** Look up a staff member by their stable Entra object id (preferred join). */
export async function staffByObjectId(objectId: string): Promise<StaffRow | null> {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(staffTable)
    .where(and(eq(staffTable.entraObjectId, objectId), eq(staffTable.active, true)))
    .limit(1);
  return row ? toRow(row) : null;
}

/* -------------------------------------------------------------------------- */
/* Consults — server-side drafts (PHI off the workstation) and author sign     */
/* -------------------------------------------------------------------------- */

/**
 * Save (or update) a care-team member's working draft of a consult note.
 *
 * WHY THIS IS A DATABASE ROW, NOT localStorage. The draft is unsigned clinical
 * PHI. Kept in the browser it survives sign-out on a shared clinic workstation
 * and is readable by the next person to sit down — the audit's P0 #8. Here it
 * lives server-side, keyed to (authorId, clientId), so one clinician can never
 * read another's draft and the workstation holds nothing.
 *
 * At most one live draft per (author, client): the partial unique index
 * `consult_draft_unique` (status = 'Draft') is the conflict target, so repeated
 * autosaves UPDATE the same row rather than pile up. The server owns updatedAt —
 * the "Draft saved {time}" stamp is a real write time, not a client guess.
 *
 * kind/channel/startedAt are NOT NULL. The composer supplies role-constrained
 * metadata on every autosave: Medical may document a visit or an internal
 * chart review, while a coach cannot author either Medical note type.
 */
export async function upsertConsultDraft(input: {
  clientId: string;
  authorId: string;
  kind: ConsultKind;
  channel: ConsultChannel;
  rawNotes: string;
  clinicalNote?: ClinicalNoteFields;
  aiSummary?: unknown;
  at: string;
}): Promise<{ id: string; updatedAt: string }> {
  const db = requireDb();
  const now = new Date(input.at);
  // A fresh candidate id for the INSERT path. On conflict the existing draft row
  // is updated and its id is what RETURNING gives back, so a signed note plus a
  // new draft for the same pair never collide on a reused deterministic id.
  const candidateId = `con-${input.authorId}-${input.clientId}-${now.getTime().toString(36)}`;

  const [row] = await db
    .insert(consultTable)
    .values({
      id: candidateId,
      clientId: input.clientId,
      authorId: input.authorId,
      kind: input.kind,
      channel: input.channel,
      startedAt: now,
      status: "Draft",
      subjective: input.clinicalNote?.subjective ?? null,
      objective: input.clinicalNote?.objective ?? null,
      assessment: input.clinicalNote?.assessment ?? null,
      plan: input.clinicalNote?.plan ?? null,
      rawNotes: input.rawNotes,
      aiSummary: (input.aiSummary as never) ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [consultTable.authorId, consultTable.clientId],
      targetWhere: raw`status = 'Draft'`,
      set: {
        kind: input.kind,
        channel: input.channel,
        subjective: input.clinicalNote?.subjective ?? null,
        objective: input.clinicalNote?.objective ?? null,
        assessment: input.clinicalNote?.assessment ?? null,
        plan: input.clinicalNote?.plan ?? null,
        rawNotes: input.rawNotes,
        aiSummary: (input.aiSummary as never) ?? null,
        updatedAt: now,
      },
    })
    .returning({ id: consultTable.id, updatedAt: consultTable.updatedAt });

  return { id: row.id, updatedAt: row.updatedAt.toISOString() };
}

/** The caller's single live draft for this client, or null. */
export async function getConsultDraft(
  authorId: string,
  clientId: string,
): Promise<{
  id: string;
  kind: string;
  channel: string;
  rawNotes: string;
  clinicalNote: ClinicalNoteFields;
  aiSummary: unknown;
  updatedAt: string;
} | null> {
  const db = requireDb();
  const [row] = await db
    .select({
      id: consultTable.id,
      kind: consultTable.kind,
      channel: consultTable.channel,
      subjective: consultTable.subjective,
      objective: consultTable.objective,
      assessment: consultTable.assessment,
      plan: consultTable.plan,
      rawNotes: consultTable.rawNotes,
      aiSummary: consultTable.aiSummary,
      updatedAt: consultTable.updatedAt,
    })
    .from(consultTable)
    .where(
      and(
        eq(consultTable.authorId, authorId),
        eq(consultTable.clientId, clientId),
        eq(consultTable.status, "Draft"),
      ),
    )
    .limit(1);
  return row
    ? {
        id: row.id,
        kind: row.kind,
        channel: row.channel,
        rawNotes: row.rawNotes ?? "",
        clinicalNote: {
          subjective: row.subjective ?? "",
          objective: row.objective ?? "",
          assessment: row.assessment ?? "",
          plan: row.plan ?? "",
        },
        aiSummary: row.aiSummary,
        updatedAt: row.updatedAt.toISOString(),
      }
    : null;
}

/**
 * Durable consult history for a chart.
 *
 * Signed notes are part of the shared chart. An unsigned draft is visible only
 * to its author, which keeps another staff member from reading working PHI that
 * has not been reviewed or signed. Seeded consults are merged at the UI boundary
 * until the full V1 history migration replaces them.
 */
export async function listConsultsForClient(
  clientId: string,
  viewerStaffId: string,
): Promise<Consult[]> {
  const db = requireDb();
  const rows = await db
    .select()
    .from(consultTable)
    .where(
      and(
        eq(consultTable.clientId, clientId),
        or(eq(consultTable.status, "Signed"), eq(consultTable.authorId, viewerStaffId)),
      ),
    )
    .orderBy(desc(consultTable.startedAt), desc(consultTable.updatedAt));

  const addenda = rows.length
    ? await db.select().from(consultAddendum).where(inArray(consultAddendum.consultId, rows.map((row) => row.id))).orderBy(consultAddendum.signedAt)
    : [];
  const addendaByConsult = new Map<string, typeof addenda>();
  for (const row of addenda) {
    const list = addendaByConsult.get(row.consultId) ?? [];
    list.push(row);
    addendaByConsult.set(row.consultId, list);
  }

  return rows.map((row) => {
    const rawNotes = row.rawNotes ?? "";
    const aiSummary = (row.aiSummary as ConsultSummary | null) ?? undefined;
    const signed = row.status === "Signed";
    const startedAt = row.startedAt.toISOString();

    return {
      id: row.id,
      clientId: row.clientId,
      authorId: row.authorId,
      kind: normalizeConsultKind(row.kind),
      channel: normalizeConsultChannel(row.channel),
      status: signed ? "Signed" : "In progress",
      startedAt,
      endedAt: row.endedAt?.toISOString(),
      durationMin: row.durationMin ?? undefined,
      rawNotes,
      clinicalNote:
        row.subjective || row.objective || row.assessment || row.plan
          ? {
              subjective: row.subjective ?? "",
              objective: row.objective ?? "",
              assessment: row.assessment ?? "",
              plan: row.plan ?? "",
            }
          : undefined,
      aiSummary,
      aiProvenance: aiSummary && rawNotes ? stampFor(rawNotes, startedAt) : undefined,
      finalSummary: signed ? aiSummary : undefined,
      signedAt: row.signedAt?.toISOString(),
      signedBy: row.signedBy ?? undefined,
      addenda: (addendaByConsult.get(row.id) ?? []).map((entry) => ({
        id: entry.id,
        at: entry.signedAt.toISOString(),
        authorId: entry.authorId,
        text: entry.body,
        reason: entry.reason,
      })),
      visibleToClient: row.visibleToClient,
    } satisfies Consult;
  });
}

/**
 * Author-sign the live draft: Draft → Signed, witnessed in the ledger, atomically.
 *
 * The old client-side sign forged the signer as `client.coachId` (whoever the
 * chart's coach happened to be) and wrote only an in-memory ledger row. This
 * attributes the signature to the AUTHENTICATED author and makes the consult row
 * and its ledger witness one transaction: either both land or neither does.
 *
 * Returns null when there is no live draft to sign (already signed, or never
 * saved) — the route turns that into a 409, so a double-tap can't mint a second
 * signature for a note that isn't there.
 */
export async function signConsultDraft(input: {
  authorId: string;
  clientId: string;
  signedBy: string;
  signerName: string;
  actorRole: string;
  signerCredential?: string;
  attestation: string;
  subjectName?: string;
  locationId?: string;
  at: string;
}): Promise<{ consultId: string; ledger: LedgerRow } | null> {
  const db = requireDb();
  const at = new Date(input.at);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(consultTable)
      .set({
        status: "Signed",
        signedAt: at,
        signedBy: input.signedBy,
        attestation: input.attestation,
        signerCredential: input.signerCredential ?? null,
        updatedAt: at,
      })
      .where(
        and(
          eq(consultTable.authorId, input.authorId),
          eq(consultTable.clientId, input.clientId),
          eq(consultTable.status, "Draft"),
        ),
      )
      .returning({ id: consultTable.id });

    if (!row) return null; // nothing live to sign

    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.signedBy,
        actorName: input.signerName,
        actorRole: input.actorRole,
        action: "sign",
        entity: "note",
        entityId: row.id,
        subjectId: input.clientId,
        subjectName: input.subjectName,
        locationId: input.locationId as LedgerDraft["locationId"],
        reason: "Consult authored and signed",
        before: { status: "Draft" },
        after: { status: "Signed", immutable: true, consultId: row.id },
      },
      input.at,
    );

    await tx.update(consultTable).set({ ledgerId: ledger.id }).where(eq(consultTable.id, row.id));
    return { consultId: row.id, ledger };
  });
}

/**
 * Provider co-sign of a consult that is still served from the seeded read model.
 *
 * The queue has not migrated to Postgres yet, but the signature itself must be a
 * durable clinical write. This mirrors the loaded consult into `consult`, marks
 * it signed and appends the ledger witness inside the same transaction. The
 * in-memory queue may still update after this returns, but it is no longer the
 * source of truth for whether the signature exists.
 */
export async function coSignSeededConsult(input: {
  consult: Consult;
  signedBy: string;
  signerName: string;
  actorRole: string;
  signerCredential?: string;
  attestation: string;
  subjectName?: string;
  locationId?: string;
  at: string;
}): Promise<{ consultId: string; ledger: LedgerRow } | null> {
  const db = requireDb();
  const at = new Date(input.at);
  const consult = input.consult;

  const dateOr = (value: string | undefined, fallback: Date) => {
    if (!value) return fallback;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? fallback : d;
  };

  return db.transaction(async (tx) => {
    await tx
      .insert(consultTable)
      .values({
        id: consult.id,
        clientId: consult.clientId,
        authorId: consult.authorId,
        kind: consult.kind,
        channel: consult.channel,
        startedAt: dateOr(consult.startedAt, at),
        endedAt: consult.endedAt ? dateOr(consult.endedAt, at) : null,
        durationMin: consult.durationMin ?? null,
        rawNotes: consult.rawNotes,
        aiSummary: (consult.aiSummary as never) ?? null,
        status: consult.status,
        signedAt: consult.signedAt ? dateOr(consult.signedAt, at) : null,
        signedBy: consult.signedBy ?? null,
        visibleToClient: consult.visibleToClient,
        updatedAt: at,
      })
      .onConflictDoNothing({ target: consultTable.id });

    const [existing] = await tx
      .select({ id: consultTable.id, status: consultTable.status })
      .from(consultTable)
      .where(eq(consultTable.id, consult.id))
      .limit(1);

    if (!existing || existing.status === "Signed") return null;

    const [row] = await tx
      .update(consultTable)
      .set({
        status: "Signed",
        signedAt: at,
        signedBy: input.signedBy,
        attestation: input.attestation,
        signerCredential: input.signerCredential ?? null,
        visibleToClient: true,
        updatedAt: at,
      })
      .where(and(eq(consultTable.id, consult.id), ne(consultTable.status, "Signed")))
      .returning({ id: consultTable.id, beforeStatus: consultTable.status });

    if (!row) return null;

    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.signedBy,
        actorName: input.signerName,
        actorRole: input.actorRole,
        action: "sign",
        entity: "note",
        entityId: row.id,
        subjectId: consult.clientId,
        subjectName: input.subjectName,
        locationId: input.locationId as LedgerDraft["locationId"],
        reason: "Consult co-signed by provider",
        before: { status: existing.status },
        after: { status: "Signed", immutable: true, consultId: row.id },
      },
      input.at,
    );

    await tx.update(consultTable).set({ ledgerId: ledger.id }).where(eq(consultTable.id, row.id));
    return { consultId: row.id, ledger };
  });
}

/* -------------------------------------------------------------------------- */
/* Golden path: lead -> intake invite -> submission + consents                 */
/* -------------------------------------------------------------------------- */

/**
 * Capture a lead from the public booking form and mint its intake invite.
 *
 * One transaction, because a lead without its invite is a person who filled in
 * a form and can never continue, and an invite without a lead is a link to
 * nowhere. `/book` previously created NEITHER — it minted a token client-side
 * from a seeded PRNG and discarded the name, email, phone, location and reason
 * entirely (the defect the lead table's own comment describes). This is the fix.
 *
 * Only the token HASH is stored; the caller holds the one raw copy.
 */
export async function createLeadWithInvite(input: {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  track?: string;
  preferredLocationId?: string;
  modality?: string;
  reason?: string;
  source?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  mode?: "self-serve" | "coach-guided";
  capturedBy?: string;
  tokenSha256: string;
  expiresAt: string;
  at: string;
}): Promise<{ leadId: string; inviteId: string }> {
  const db = requireDb();
  const at = new Date(input.at);
  const leadId = `lead-${at.getTime().toString(36)}-${input.tokenSha256.slice(0, 8)}`;
  const inviteId = `inv-${at.getTime().toString(36)}-${input.tokenSha256.slice(8, 16)}`;

  return db.transaction(async (tx) => {
    await tx.insert(leadTable).values({
      id: leadId,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      track: input.track ?? null,
      preferredLocationId: input.preferredLocationId ?? null,
      modality: input.modality ?? null,
      reason: input.reason ?? null,
      source: input.source ?? "website",
      utmSource: input.utmSource ?? null,
      utmMedium: input.utmMedium ?? null,
      utmCampaign: input.utmCampaign ?? null,
      stage: "new",
      createdAt: at,
      firstResponseDueAt: leadFirstResponseDueAt(at),
      updatedAt: at,
    });

    await tx.insert(leadStageEvent).values({
      id: `lse-${leadId}-new`,
      leadId,
      fromStage: null,
      toStage: "new",
      at,
      note: "Captured from the public booking form",
    });

    await tx.insert(intakeInvite).values({
      id: inviteId,
      leadId,
      tokenSha256: input.tokenSha256,
      createdAt: at,
      expiresAt: new Date(input.expiresAt),
      mode: input.mode ?? "self-serve",
      capturedBy: input.capturedBy ?? null,
      prefill: {
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        track: input.track ?? null,
        locationId: input.preferredLocationId ?? null,
      } as never,
    });

    return { leadId, inviteId };
  });
}

/** Resolve a presented token by its hash. Returns null for anything unknown. */
export async function findInviteByTokenHash(tokenSha256: string): Promise<{
  inviteId: string;
  leadId: string;
  expiresAt: string;
  usedAt: string | null;
  prefill: unknown;
} | null> {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(intakeInvite)
    .where(eq(intakeInvite.tokenSha256, tokenSha256))
    .limit(1);
  return row
    ? {
        inviteId: row.id,
        leadId: row.leadId,
        expiresAt: row.expiresAt.toISOString(),
        usedAt: row.usedAt ? row.usedAt.toISOString() : null,
        prefill: row.prefill,
      }
    : null;
}

export interface ConsentDecision {
  scope: string;
  documentVersion: string;
  textSha256?: string;
  granted: boolean;
  signatureName?: string;
}

/**
 * Record a completed intake: claim the invite, store the answers, store every
 * consent decision, advance the lead, and witness the whole thing in the ledger
 * — all in ONE transaction.
 *
 * SINGLE USE IS ENFORCED BY THE DATABASE. The invite is claimed with a
 * conditional `UPDATE ... WHERE used_at IS NULL AND expires_at > now()
 * RETURNING`. If two submissions race, exactly one UPDATE returns a row; the
 * other sees none and is rejected. A read-then-write check — which is what the
 * mock flow did — would let both through.
 *
 * Consents are ROWS, not rendered decorations. Each carries the document
 * version AND a hash of the exact wording shown, plus the IP / user-agent /
 * time tuple, without which an e-signature evidences nothing.
 */
export async function submitIntake(input: {
  tokenSha256: string;
  dateOfBirth?: string;
  sex?: string;
  goals?: unknown;
  symptoms?: unknown;
  history?: unknown;
  /** Answers keyed by question id, against `formVersion`. */
  answers?: unknown;
  formVersion?: string;
  formSha256?: string;
  consents: ConsentDecision[];
  signatureName?: string;
  signedByRole?: string;
  electronicConsentGiven?: boolean;
  attestedRead?: boolean;
  ipAddress?: string;
  userAgent?: string;
  at: string;
}): Promise<{ leadId: string; submissionId: string; ledger: LedgerRow } | null> {
  const db = requireDb();
  const at = new Date(input.at);

  return db.transaction(async (tx) => {
    // Claim the invite. Unusable (unknown / already used / expired) => no row.
    const [claimed] = await tx
      .update(intakeInvite)
      .set({ usedAt: at })
      .where(
        // Drizzle operators, not a raw template: `sql\`col > ${jsDate}\`` binds the
        // Date without the column's type mapping, and Postgres then refuses to
        // compare timestamptz with the inferred parameter type. gt()/isNull()
        // carry the column type through.
        and(
          eq(intakeInvite.tokenSha256, input.tokenSha256),
          isNull(intakeInvite.usedAt),
          gt(intakeInvite.expiresAt, at),
        ),
      )
      .returning({
        id: intakeInvite.id,
        leadId: intakeInvite.leadId,
        mode: intakeInvite.mode,
        capturedBy: intakeInvite.capturedBy,
      });

    if (!claimed) return null;

    const submissionId = `sub-${claimed.id}`;
    await tx.insert(intakeSubmission).values({
      id: submissionId,
      inviteId: claimed.id,
      leadId: claimed.leadId,
      dateOfBirth: input.dateOfBirth ?? null,
      sex: input.sex ?? null,
      goals: (input.goals as never) ?? null,
      symptoms: (input.symptoms as never) ?? null,
      history: (input.history as never) ?? null,
      answers: (input.answers as never) ?? null,
      formVersion: input.formVersion ?? null,
      formSha256: input.formSha256 ?? null,
      // Defaults to self-serve because that is what a token link IS. A
      // coach-guided intake is the staff path and says so explicitly; inferring
      // "guided" from anything else would put a coach's name on a form they
      // never sat through.
      // Mode/coach attribution comes from the staff-minted invite, never from
      // this public request body. A browser cannot put a coach's name on an
      // intake that coach did not guide.
      mode: claimed.mode,
      capturedBy: claimed.capturedBy,
      submittedAt: at,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });

    for (const [i, c] of input.consents.entries()) {
      await tx.insert(consentTable).values({
        id: `cns-${claimed.id}-${i}`,
        clientId: null,
        leadId: claimed.leadId,
        scope: c.scope,
        documentVersion: c.documentVersion,
        textSha256: c.textSha256 ?? null,
        granted: c.granted,
        signatureName: c.signatureName ?? input.signatureName ?? null,
        signedByRole: input.signedByRole ?? null,
        electronicConsentGiven: input.electronicConsentGiven ?? null,
        attestedRead: input.attestedRead ?? null,
        signedAt: at,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      });
    }

    await tx.insert(leadStageEvent).values({
      id: `lse-${claimed.leadId}-submitted`,
      leadId: claimed.leadId,
      fromStage: "new",
      toStage: "intake-submitted",
      at,
      note: `Intake submitted with ${input.consents.filter((c) => c.granted).length} consent(s) granted`,
    });
    await tx
      .update(leadTable)
      .set({ stage: "intake-submitted", updatedAt: at })
      .where(eq(leadTable.id, claimed.leadId));

    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: claimed.leadId,
        actorName: input.signatureName ?? "Prospective patient",
        actorRole: "Patient",
        action: "sign",
        entity: "consent",
        entityId: submissionId,
        subjectId: claimed.leadId,
        subjectName: input.signatureName ?? undefined,
        reason: "Intake submitted and consents signed",
        after: {
          consents: input.consents.map((c) => ({
            scope: c.scope,
            version: c.documentVersion,
            granted: c.granted,
          })),
        },
      },
      input.at,
    );

    await tx
      .update(intakeSubmission)
      .set({ ledgerId: ledger.id })
      .where(eq(intakeSubmission.id, submissionId));
    for (const [i] of input.consents.entries()) {
      await tx
        .update(consentTable)
        .set({ ledgerId: ledger.id })
        .where(eq(consentTable.id, `cns-${claimed.id}-${i}`));
    }

    return { leadId: claimed.leadId, submissionId, ledger };
  });
}

/** The funnel, for the exec pipeline board — real rows, not seeded counts. */
export async function readLeads(limit = 200) {
  const db = requireDb();
  return db.select().from(leadTable).orderBy(desc(leadTable.createdAt)).limit(limit);
}

export type LeadPipelineAction = "claim" | "release" | "advance";

/**
 * Work one CRM opportunity with an immutable stage event and ledger witness.
 *
 * Conversion is deliberately absent from the manual transition graph. A lead
 * becomes converted only in the transaction that creates/links the client;
 * allowing a pipeline button to manufacture a client relationship would make
 * the funnel lie.
 */
export async function updateLeadPipeline(input: {
  leadId: string;
  action: LeadPipelineAction;
  toStage?: string;
  note?: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}): Promise<
  | { ok: true; lead: typeof leadTable.$inferSelect; ledger: LedgerRow }
  | { ok: false; reason: "not-found" | "already-owned" | "not-owner" | "invalid-transition" | "conflict" }
> {
  const db = requireDb();
  const at = new Date(input.at);

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(leadTable)
      .where(eq(leadTable.id, input.leadId))
      .limit(1);
    if (!current) return { ok: false as const, reason: "not-found" as const };

    let updated: typeof leadTable.$inferSelect | undefined;
    let reason: string;
    let after: Record<string, unknown>;

    if (input.action === "claim") {
      if (current.ownerStaffId && current.ownerStaffId !== input.actorId) {
        return { ok: false as const, reason: "already-owned" as const };
      }
      [updated] = await tx
        .update(leadTable)
        .set({ ownerStaffId: input.actorId, updatedAt: at })
        .where(
          and(
            eq(leadTable.id, input.leadId),
            or(isNull(leadTable.ownerStaffId), eq(leadTable.ownerStaffId, input.actorId)),
          ),
        )
        .returning();
      reason = "CRM lead claimed";
      after = { ownerStaffId: input.actorId };
    } else if (input.action === "release") {
      if (current.ownerStaffId !== input.actorId) {
        return { ok: false as const, reason: "not-owner" as const };
      }
      [updated] = await tx
        .update(leadTable)
        .set({ ownerStaffId: null, updatedAt: at })
        .where(and(eq(leadTable.id, input.leadId), eq(leadTable.ownerStaffId, input.actorId)))
        .returning();
      reason = "CRM lead released";
      after = { ownerStaffId: null };
    } else {
      const toStage = input.toStage ?? "";
      if (current.ownerStaffId && current.ownerStaffId !== input.actorId) {
        return { ok: false as const, reason: "already-owned" as const };
      }
      if (!leadTransitionAllowed(current.stage, toStage)) {
        return { ok: false as const, reason: "invalid-transition" as const };
      }
      if (toStage === "lost" && !input.note?.trim()) {
        return { ok: false as const, reason: "invalid-transition" as const };
      }

      [updated] = await tx
        .update(leadTable)
        .set({
          stage: toStage,
          ownerStaffId: current.ownerStaffId ?? input.actorId,
          lostReason: toStage === "lost" ? input.note!.trim().slice(0, 1000) : null,
          firstContactedAt:
            toStage === "contacted" && !current.firstContactedAt ? at : current.firstContactedAt,
          updatedAt: at,
        })
        .where(and(eq(leadTable.id, input.leadId), eq(leadTable.stage, current.stage)))
        .returning();
      if (updated) {
        await tx.insert(leadStageEvent).values({
          id: `lse-${input.leadId}-${at.getTime().toString(36)}-${toStage}`,
          leadId: input.leadId,
          fromStage: current.stage,
          toStage,
          at,
          byStaffId: input.actorId,
          note: input.note?.trim().slice(0, 1000) || null,
        });
      }
      reason = `CRM lead advanced from ${current.stage} to ${toStage}`;
      after = {
        stage: toStage,
        ownerStaffId: current.ownerStaffId ?? input.actorId,
        note: input.note?.trim().slice(0, 1000) || null,
      };
    }

    if (!updated) return { ok: false as const, reason: "conflict" as const };

    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: "update",
        entity: "lead",
        entityId: input.leadId,
        subjectId: input.leadId,
        subjectName: [current.firstName, current.lastName].filter(Boolean).join(" ") || undefined,
        reason,
        before: {
          ownerStaffId: current.ownerStaffId,
          stage: current.stage,
          lostReason: current.lostReason,
        },
        after,
      },
      input.at,
    );
    if (current.ownerStaffId !== updated.ownerStaffId) {
      await tx.insert(leadOwnerEvent).values({
        id: `loe-${input.leadId}-${at.getTime().toString(36)}`,
        leadId: input.leadId,
        fromStaffId: current.ownerStaffId,
        toStaffId: updated.ownerStaffId,
        reason,
        byStaffId: input.actorId,
        at,
        ledgerId: ledger.id,
      });
    }
    return { ok: true as const, lead: updated, ledger };
  });
}

/* -------------------------------------------------------------------------- */
/* Emergency card — a public bearer token over real PHI                        */
/* -------------------------------------------------------------------------- */

/**
 * Issue an emergency card. Returns the raw token ONCE; only its hash is stored.
 *
 * Replaces `emergencyTokenFor(clientId)`, which derived the token from
 * seededRandom over a sequential client id — so every member's card was
 * computable by anyone who noticed. Revoking any previous card for the member is
 * part of issuing a new one: two live cards means the old wallet still works.
 */
export async function issueEmergencyCard(input: {
  clientId: string;
  tokenSha256: string;
  expiresAt: string;
  issuedBy: string;
  at: string;
}): Promise<{ cardId: string }> {
  const db = requireDb();
  const at = new Date(input.at);
  const cardId = `ec-${at.getTime().toString(36)}-${input.tokenSha256.slice(0, 8)}`;

  return db.transaction(async (tx) => {
    await tx
      .update(emergencyCard)
      .set({ revokedAt: at, revokedBy: input.issuedBy })
      .where(and(eq(emergencyCard.clientId, input.clientId), isNull(emergencyCard.revokedAt)));

    await tx.insert(emergencyCard).values({
      id: cardId,
      clientId: input.clientId,
      tokenSha256: input.tokenSha256,
      createdAt: at,
      expiresAt: new Date(input.expiresAt),
      issuedBy: input.issuedBy,
    });
    return { cardId };
  });
}

/**
 * Resolve a presented card token, and RECORD THE DISCLOSURE.
 *
 * Someone scanning this card reads a named person's medications, allergies and
 * risk flags. That is a disclosure under §164.528 whether or not the reader
 * signed in, so it is written to the ledger in the same transaction as the
 * lookup — a read that cannot be accounted for should not be possible.
 *
 * Returns null for unknown, expired and revoked alike: the caller must not be
 * able to tell which, or the endpoint becomes an oracle for valid cards.
 */
export async function readEmergencyCard(
  tokenSha256: string,
  at: string,
  context: { ip?: string; userAgent?: string },
): Promise<{ clientId: string; cardId: string } | null> {
  const db = requireDb();
  const now = new Date(at);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(emergencyCard)
      .where(eq(emergencyCard.tokenSha256, tokenSha256))
      .limit(1);

    if (!row || row.revokedAt || row.expiresAt <= now) return null;

    await appendLedgerInTx(
      tx,
      {
        actorId: "public-emergency-card",
        actorName: context.ip ? `Emergency card scan (${context.ip})` : "Emergency card scan",
        actorRole: "System",
        action: "view",
        entity: "chart",
        entityId: row.id,
        subjectId: row.clientId,
        reason: "Emergency card viewed via public link",
        after: { userAgent: context.userAgent ?? null },
      },
      at,
    );

    return { clientId: row.clientId, cardId: row.id };
  });
}

/* -------------------------------------------------------------------------- */
/* Feature flags                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Every stored flag override.
 *
 * Deliberately unfiltered and unpaginated. The registry is closed and small
 * (lib/features/catalog.ts), the scopes are few, and the only subject that can
 * multiply rows is the per-client pilot list — a table this size is cheaper to
 * read whole once per request than to query five ways, and resolution needs all
 * of it anyway to detect same-scope conflicts.
 *
 * Rows for keys that are no longer in the registry are returned as-is; the
 * evaluator ignores them. Deleting them on read would be a write inside a read
 * path, and a retired key that comes back later would silently lose its setting.
 */
export async function listFeatureFlags(): Promise<
  Array<{
    id: string;
    key: string;
    scope: string;
    targetId: string;
    enabled: boolean;
    reason: string | null;
    updatedBy: string;
    updatedAt: Date;
  }>
> {
  const db = requireDb();
  return db
    .select({
      id: featureFlag.id,
      key: featureFlag.key,
      scope: featureFlag.scope,
      targetId: featureFlag.targetId,
      enabled: featureFlag.enabled,
      reason: featureFlag.reason,
      updatedBy: featureFlag.updatedBy,
      updatedAt: featureFlag.updatedAt,
    })
    .from(featureFlag);
}

/**
 * Set an override, and witness it.
 *
 * Upsert on (key, scope, target) — the unique index makes "set it again" an
 * update rather than a second contradictory row. The ledger append shares the
 * transaction, so a flag change that is not witnessed does not happen at all:
 * the alternative is an audit trail with holes exactly where someone changed
 * what the system records.
 */
export async function setFeatureFlag(input: {
  key: string;
  scope: string;
  targetId: string;
  enabled: boolean;
  reason?: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}): Promise<{ ledger: LedgerRow }> {
  const db = requireDb();
  const at = new Date(input.at);
  const id = `ff-${input.scope}-${input.targetId}-${input.key}`;

  return db.transaction(async (tx) => {
    const [before] = await tx
      .select({ enabled: featureFlag.enabled })
      .from(featureFlag)
      .where(
        and(
          eq(featureFlag.key, input.key),
          eq(featureFlag.scope, input.scope),
          eq(featureFlag.targetId, input.targetId),
        ),
      )
      .limit(1);

    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: "update",
        entity: "feature-flag",
        entityId: id,
        reason: input.reason ?? `Feature ${input.key} set to ${input.enabled ? "on" : "off"}`,
        before: before ? { enabled: before.enabled } : { enabled: null, note: "no override" },
        after: { enabled: input.enabled, scope: input.scope, target: input.targetId },
      },
      input.at,
    );

    await tx
      .insert(featureFlag)
      .values({
        id,
        key: input.key,
        scope: input.scope,
        targetId: input.targetId,
        enabled: input.enabled,
        reason: input.reason ?? null,
        updatedBy: input.actorId,
        updatedAt: at,
        ledgerId: ledger.id,
      })
      .onConflictDoUpdate({
        target: [featureFlag.key, featureFlag.scope, featureFlag.targetId],
        set: {
          enabled: input.enabled,
          reason: input.reason ?? null,
          updatedBy: input.actorId,
          updatedAt: at,
          ledgerId: ledger.id,
        },
      });

    return { ledger };
  });
}

/**
 * Remove an override so the key falls back to the release preset.
 *
 * This is NOT the same as setting it to the preset's current value, and the
 * difference matters at a release boundary: a stored value survives a preset
 * change and a cleared key follows it. See the `featureFlag` table docblock.
 */
export async function clearFeatureFlag(input: {
  key: string;
  scope: string;
  targetId: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}): Promise<{ ledger: LedgerRow } | null> {
  const db = requireDb();

  return db.transaction(async (tx) => {
    const [row] = await tx
      .delete(featureFlag)
      .where(
        and(
          eq(featureFlag.key, input.key),
          eq(featureFlag.scope, input.scope),
          eq(featureFlag.targetId, input.targetId),
        ),
      )
      .returning({ id: featureFlag.id, enabled: featureFlag.enabled });

    if (!row) return null;

    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: "update",
        entity: "feature-flag",
        entityId: row.id,
        reason: `Override cleared; ${input.key} follows the release preset again`,
        before: { enabled: row.enabled, override: true },
        after: { override: false },
      },
      input.at,
    );

    return { ledger };
  });
}

/* -------------------------------------------------------------------------- */
/* Encounters                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Open an encounter and lay out the segments the visit kind requires.
 *
 * Segments are created UP FRONT, all of them, in `pending`. The alternative —
 * creating each part as it happens — cannot answer "what is this visit still
 * waiting on", which is the question the front desk and the lab-draw queue are
 * both built around. A pending row is the thing that makes the work visible.
 *
 * `requiredCredentials` is snapshotted onto each row rather than referenced.
 * See the table docblock: the matrix will change and old encounters must keep
 * saying what was required of them at the time.
 */
export async function openEncounter(input: {
  id: string;
  appointmentId?: string;
  clientId: string;
  clientName?: string;
  locationId: string;
  kind: EncounterKind;
  modality?: "in-person" | "virtual";
  /** Optional per-component assignment from the NCV resolver. */
  assignments?: Partial<Record<string, string>>;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}): Promise<{ encounterId: string; segments: string[]; ledger: LedgerRow }> {
  const db = requireDb();
  const at = new Date(input.at);
  const plan = segmentPlanFor(input.kind);

  return db.transaction(async (tx) => {
    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: "create",
        entity: "note",
        entityId: input.id,
        subjectId: input.clientId,
        subjectName: input.clientName,
        locationId: input.locationId as LedgerDraft["locationId"],
        reason: `Encounter opened: ${input.kind}`,
        after: { kind: input.kind, segments: plan.map((p) => p.component) },
      },
      input.at,
    );

    await tx.insert(encounter).values({
      id: input.id,
      appointmentId: input.appointmentId ?? null,
      clientId: input.clientId,
      locationId: input.locationId,
      kind: input.kind,
      modality: input.modality ?? "in-person",
      status: "open",
      startedAt: at,
      ledgerId: ledger.id,
    });

    const segmentIds: string[] = [];
    for (const p of plan) {
      const segmentId = `${input.id}-${p.component}`;
      segmentIds.push(segmentId);
      await tx.insert(encounterSegment).values({
        id: segmentId,
        encounterId: input.id,
        component: p.component,
        sequence: p.sequence,
        requiredCredentials: p.requiredCredentials as never,
        assignedStaffId: input.assignments?.[p.component] ?? null,
        status: "pending",
      });
    }

    return { encounterId: input.id, segments: segmentIds, ledger };
  });
}

/**
 * Complete a segment, and close the encounter if that was the last one.
 *
 * THE CREDENTIAL CHECK HAPPENS HERE, NOT ONLY AT ASSIGNMENT.
 * A segment assigned to a nurse and completed by whoever is logged in at the
 * shared workstation is exactly how a lab draw ends up attributed to an office
 * manager. `performedByCredential` is the credential held AT THE TIME and is
 * verified against the snapshot on the row before the write.
 *
 * COMPLETION IS OBSERVED, NOT ASSERTED.
 * The encounter's own completion is computed from its segments inside the same
 * transaction, after this one lands. Nothing may set `completedAt` directly.
 * Returns `encounterComplete` so the caller can say something true rather than
 * guessing.
 */
export async function completeSegment(input: {
  segmentId: string;
  performedBy: string;
  performedByName: string;
  performedByCredential: string | null;
  actorRole: string;
  /** Required when marking a segment `not-required`. */
  waivedReason?: string;
  waive?: boolean;
  at: string;
}): Promise<
  | {
      ok: true;
      encounterId: string;
      encounterComplete: boolean;
      outstanding: string[];
      ledger: LedgerRow;
    }
  | { ok: false; error: string }
> {
  const db = requireDb();
  const at = new Date(input.at);

  if (input.waive && !input.waivedReason?.trim()) {
    // A skipped clinical step with no stated reason is indistinguishable from a
    // forgotten one. See the column docblock.
    return { ok: false, error: "Waiving a required part of a visit needs a reason." };
  }

  return db.transaction(async (tx) => {
    const [segment] = await tx
      .select()
      .from(encounterSegment)
      .where(eq(encounterSegment.id, input.segmentId))
      .limit(1);

    if (!segment) return { ok: false as const, error: "No such segment." };
    if (segment.status === "complete") {
      return { ok: false as const, error: "That part of the visit is already complete." };
    }

    const required = segment.requiredCredentials as
      | readonly (readonly CredentialClass[])[]
      | null;

    if (
      !input.waive &&
      !credentialSatisfies(input.performedByCredential as CredentialClass | null, required)
    ) {
      return {
        ok: false as const,
        error: input.performedByCredential
          ? `A ${input.performedByCredential} cannot complete this part of the visit.`
          : "This part of the visit needs a recorded clinical credential, and yours is not on file.",
      };
    }

    await tx
      .update(encounterSegment)
      .set({
        status: input.waive ? "not-required" : "complete",
        completedAt: at,
        performedBy: input.performedBy,
        performedByCredential: input.performedByCredential,
        waivedReason: input.waive ? input.waivedReason!.trim() : null,
      })
      .where(eq(encounterSegment.id, input.segmentId));

    const siblings = await tx
      .select()
      .from(encounterSegment)
      .where(eq(encounterSegment.encounterId, segment.encounterId));

    const verdict = completionVerdict(
      siblings.map((s) => ({
        component: s.component as never,
        status: s.status as never,
        // Everything laid out at open time is required; a waiver is expressed
        // as `not-required` STATUS, which the verdict treats as settled.
        required: true,
      })),
    );

    const [enc] = await tx
      .select({ clientId: encounter.clientId, locationId: encounter.locationId })
      .from(encounter)
      .where(eq(encounter.id, segment.encounterId))
      .limit(1);

    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.performedBy,
        actorName: input.performedByName,
        actorRole: input.actorRole,
        action: "update",
        entity: "note",
        entityId: input.segmentId,
        subjectId: enc?.clientId,
        locationId: enc?.locationId as LedgerDraft["locationId"],
        reason: input.waive
          ? `${segment.component} waived: ${input.waivedReason!.trim()}`
          : `${segment.component} completed`,
        before: { status: segment.status },
        after: {
          status: input.waive ? "not-required" : "complete",
          credential: input.performedByCredential,
          encounterComplete: verdict.complete,
        },
      },
      input.at,
    );

    await tx
      .update(encounterSegment)
      .set({ ledgerId: ledger.id })
      .where(eq(encounterSegment.id, input.segmentId));

    if (verdict.complete) {
      await tx
        .update(encounter)
        .set({ status: "complete", completedAt: at })
        .where(eq(encounter.id, segment.encounterId));
    }

    return {
      ok: true as const,
      encounterId: segment.encounterId,
      encounterComplete: verdict.complete,
      outstanding: verdict.outstanding,
      ledger,
    };
  });
}

/**
 * Record vitals.
 *
 * Corrections are a NEW ROW pointing at the old one via `supersedesId`, never
 * an update — Paul Kennard's append-only rule is not limited to allergies, and
 * vitals are where the urge to just fix the number is strongest.
 */
export async function recordVitals(input: {
  id: string;
  clientId: string;
  encounterId?: string;
  segmentId?: string;
  values: VitalsInput;
  notes?: string;
  takenBy: string;
  takenByName: string;
  takenByCredential: string | null;
  actorRole: string;
  supersedesId?: string;
  correctionReason?: string;
  at: string;
}): Promise<
  | { ok: true; vitalsId: string; warnings: string[]; ledger: LedgerRow }
  | { ok: false; error: string }
> {
  const db = requireDb();
  const at = new Date(input.at);

  const problems = validateVitals(input.values);
  if (!vitalsAcceptable(problems)) {
    return {
      ok: false,
      error: problems
        .filter((p) => p.severity === "error")
        .map((p) => p.message)
        .join(" "),
    };
  }

  if (input.supersedesId && !input.correctionReason?.trim()) {
    return {
      ok: false,
      error: "A correction needs a reason. The original row is kept either way.",
    };
  }

  return db.transaction(async (tx) => {
    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.takenBy,
        actorName: input.takenByName,
        actorRole: input.actorRole,
        action: input.supersedesId ? "update" : "create",
        entity: "chart",
        entityId: input.id,
        subjectId: input.clientId,
        reason: input.supersedesId
          ? `Vitals corrected: ${input.correctionReason!.trim()}`
          : "Vitals recorded",
        after: {
          ...input.values,
          supersedes: input.supersedesId ?? null,
          warnings: problems.filter((p) => p.severity === "warning").map((p) => p.message),
        },
      },
      input.at,
    );

    await tx.insert(vitals).values({
      id: input.id,
      clientId: input.clientId,
      encounterId: input.encounterId ?? null,
      segmentId: input.segmentId ?? null,
      systolic: input.values.systolic ?? null,
      diastolic: input.values.diastolic ?? null,
      heartRate: input.values.heartRate ?? null,
      respiratoryRate: input.values.respiratoryRate ?? null,
      spo2: input.values.spo2 ?? null,
      temperatureC: input.values.temperatureC ?? null,
      weightKg: input.values.weightKg ?? null,
      heightCm: input.values.heightCm ?? null,
      notes: input.notes ?? null,
      takenBy: input.takenBy,
      takenByCredential: input.takenByCredential,
      takenAt: at,
      supersedesId: input.supersedesId ?? null,
      correctionReason: input.correctionReason?.trim() ?? null,
      ledgerId: ledger.id,
    });

    return {
      ok: true as const,
      vitalsId: input.id,
      warnings: problems.filter((p) => p.severity === "warning").map((p) => p.message),
      ledger,
    };
  });
}

/**
 * The lab-draw queue — the nurse's worklist.
 *
 * Matt Chilson: "the client's for lab draw, so this will go into a lab draw
 * queue. The nurse, Natalie in this case, would go and see the name there."
 *
 * Ordered oldest-first because a patient sitting in a chair is the unit of
 * urgency here, not clinical acuity.
 */
export async function readLabDrawQueue(locationId?: string) {
  const db = requireDb();
  const rows = await db
    .select({
      segmentId: encounterSegment.id,
      encounterId: encounter.id,
      clientId: encounter.clientId,
      locationId: encounter.locationId,
      kind: encounter.kind,
      status: encounterSegment.status,
      assignedStaffId: encounterSegment.assignedStaffId,
      startedAt: encounter.startedAt,
    })
    .from(encounterSegment)
    .innerJoin(encounter, eq(encounterSegment.encounterId, encounter.id))
    .where(
      and(
        eq(encounterSegment.component, "lab-draw"),
        ne(encounterSegment.status, "complete"),
        ne(encounterSegment.status, "not-required"),
        eq(encounter.status, "open"),
      ),
    )
    .orderBy(encounter.startedAt);

  return locationId ? rows.filter((r) => r.locationId === locationId) : rows;
}

/** Segments of one encounter, in order. The visit board's row detail. */
export async function readEncounterSegments(encounterId: string) {
  const db = requireDb();
  return db
    .select()
    .from(encounterSegment)
    .where(eq(encounterSegment.encounterId, encounterId))
    .orderBy(encounterSegment.sequence);
}

/**
 * Sign the History & Physical.
 *
 * SIGNING IS THE IMMUTABILITY BOUNDARY. There is no update path for a signed
 * row — a correction is an addendum, the same pattern `consultAddendum`
 * establishes. That is enforced by the conditional UPDATE below: it matches
 * only where `signed_at IS NULL`, so a second signature attempt returns null
 * rather than overwriting the first.
 *
 * Completing the physical SEGMENT is deliberately a separate call. The
 * signature is a clinical act and the segment is a workflow state, and a
 * provider who signs but whose segment silently closes cannot tell you which of
 * the two failed when something goes wrong.
 */
export async function signHistoryPhysical(input: {
  id: string;
  clientId: string;
  encounterId?: string;
  segmentId?: string;
  providerId: string;
  providerName: string;
  providerCredential: string | null;
  actorRole: string;
  chiefComplaint?: string;
  historyNarrative?: string;
  examNarrative?: string;
  assessment?: string;
  labIndications?: string;
  attestation: string;
  at: string;
}): Promise<{ ok: true; hpId: string; ledger: LedgerRow } | { ok: false; error: string }> {
  const db = requireDb();
  const at = new Date(input.at);

  if (!isProvider(input.providerCredential as CredentialClass | null)) {
    // The H&P is a provider act. `canApprove` on the staff row is the app's
    // authorization answer; this is the licence answer, and both must hold.
    return {
      ok: false,
      error: "A History & Physical must be signed by an NP, PA or physician.",
    };
  }

  return db.transaction(async (tx) => {
    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.providerId,
        actorName: input.providerName,
        actorRole: input.actorRole,
        action: "sign",
        entity: "note",
        entityId: input.id,
        subjectId: input.clientId,
        reason: "History & Physical signed",
        after: {
          immutable: true,
          credential: input.providerCredential,
          encounterId: input.encounterId ?? null,
        },
      },
      input.at,
    );

    await tx
      .insert(historyPhysical)
      .values({
        id: input.id,
        clientId: input.clientId,
        encounterId: input.encounterId ?? null,
        segmentId: input.segmentId ?? null,
        providerId: input.providerId,
        providerCredential: input.providerCredential,
        chiefComplaint: input.chiefComplaint ?? null,
        historyNarrative: input.historyNarrative ?? null,
        examNarrative: input.examNarrative ?? null,
        assessment: input.assessment ?? null,
        labIndications: input.labIndications ?? null,
        startedAt: at,
        signedAt: at,
        attestation: input.attestation,
        ledgerId: ledger.id,
      })
      .onConflictDoNothing({ target: historyPhysical.id });

    return { ok: true as const, hpId: input.id, ledger };
  });
}

/* -------------------------------------------------------------------------- */
/* Immutable patient/staff signed documents                                   */
/* -------------------------------------------------------------------------- */

/**
 * Retain the exact text, evidence tuple, content digest, and audit witness in
 * one transaction. The database trigger in migration 0011 refuses every later
 * UPDATE or DELETE; amendments are newly signed versions.
 */
export async function recordSignedDocument(input: {
  id: string;
  clientId: string | null;
  subjectName?: string;
  document: SignableDocument;
  evidence: SignatureEvidence;
  actor: { id: string; name: string; role: string };
  locationId?: LocationId;
}) {
  const problems = validateSignature(input.document, input.evidence);
  if (!signatureAcceptable(problems)) {
    throw new Error(`Signature refused: ${problems.map((problem) => problem.field).join(", ")}`);
  }
  const signedAt = new Date(input.evidence.signedAt);
  if (Number.isNaN(signedAt.getTime())) throw new Error("Signature refused: signedAt");
  const hash = documentSha256(input.document);
  const db = requireDb();

  return db.transaction(async (tx) => {
    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.actor.id,
        actorName: input.actor.name,
        actorRole: input.actor.role,
        action: "sign",
        entity: "document",
        entityId: input.id,
        subjectId: input.clientId ?? undefined,
        subjectName: input.subjectName,
        locationId: input.locationId,
        reason: `${input.document.kind} signed`,
        after: {
          documentId: input.document.documentId,
          version: input.document.version,
          documentSha256: hash,
          immutable: true,
        },
      },
      signedAt.toISOString(),
    );

    await tx.insert(signedDocumentTable).values({
      id: input.id,
      clientId: input.clientId,
      kind: input.document.kind,
      documentId: input.document.documentId,
      version: input.document.version,
      title: input.document.title,
      body: input.document.body,
      regime: input.document.regime,
      documentSha256: hash,
      signatureName: input.evidence.signatureName,
      signedByRole: input.evidence.signedByRole,
      signedByAccountId: input.evidence.signedByAccountId,
      signedAt,
      ipAddress: input.evidence.ipAddress!,
      userAgent: input.evidence.userAgent!,
      electronicConsentGiven: input.evidence.electronicConsentGiven,
      attestedRead: input.evidence.attestedRead,
      ledgerId: ledger.id,
    });

    return { signedDocumentId: input.id, documentSha256: hash, ledger };
  });
}

/** Append an archived render or delivery receipt; never overwrite one. */
export async function recordSignedDocumentArtifact(input: {
  id: string;
  signedDocumentId: string;
  kind: "archived-pdf" | "patient-copy";
  storageProvider: string;
  objectKey: string;
  mediaType?: string;
  artifactSha256: string;
  deliveredTo?: string;
  deliveredAt?: string;
  actor: { id: string; name: string; role: string };
  clientId?: string;
}) {
  if (!/^[a-f0-9]{64}$/i.test(input.artifactSha256)) {
    throw new Error("Artifact SHA-256 must be a 64-character hexadecimal digest.");
  }
  const deliveredAt = input.deliveredAt ? new Date(input.deliveredAt) : null;
  if (deliveredAt && Number.isNaN(deliveredAt.getTime())) throw new Error("Invalid delivery timestamp.");
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.insert(signedDocumentArtifact).values({
      id: input.id,
      signedDocumentId: input.signedDocumentId,
      kind: input.kind,
      storageProvider: input.storageProvider,
      objectKey: input.objectKey,
      mediaType: input.mediaType ?? "application/pdf",
      artifactSha256: input.artifactSha256.toLowerCase(),
      deliveredTo: input.deliveredTo ?? null,
      deliveredAt,
    });
    const at = (deliveredAt ?? new Date()).toISOString();
    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.actor.id,
        actorName: input.actor.name,
        actorRole: input.actor.role,
        action: input.kind === "patient-copy" ? "deliver" : "archive",
        entity: "document",
        entityId: input.signedDocumentId,
        subjectId: input.clientId,
        after: {
          artifactId: input.id,
          kind: input.kind,
          artifactSha256: input.artifactSha256.toLowerCase(),
        },
      },
      at,
    );
    return { artifactId: input.id, ledger };
  });
}
