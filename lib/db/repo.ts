import { and, desc, eq, gte, sql as raw } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  ledger as ledgerTable,
  memberDay,
  doseLog,
  contactEntry,
  escalation as escalationTable,
  dispense,
  inventoryMovement,
  staff as staffTable,
} from "@/lib/db/schema";
import { staff as seededStaff } from "@/lib/mock/staff";
import { hashRow, GENESIS_HASH, type LedgerDraft, type LedgerRow } from "@/lib/trace/ledger";

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
export async function appendLedgerRow(draft: LedgerDraft, at: string): Promise<LedgerRow> {
  const db = requireDb();

  return db.transaction(async (tx) => {
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
  });
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

export async function retractDose(id: string, byClientId: string, at: string) {
  const db = requireDb();
  await db
    .update(doseLog)
    .set({ retractedAt: new Date(at), retractedBy: byClientId })
    .where(eq(doseLog.id, id));
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

/** Open escalations, worst SLA first — the provider's queue. */
export async function readOpenEscalations() {
  const db = requireDb();
  return db
    .select()
    .from(escalationTable)
    .where(raw`${escalationTable.status} <> 'Answered'`)
    .orderBy(escalationTable.dueAt);
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
  locationId?: string;
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
        locationIds: s.locationIds ?? [],
        credentials: s.credentials ?? null,
        canApprove: s.canApprove ?? false,
        active: true,
      })
      .onConflictDoUpdate({
        target: staffTable.id,
        set: {
          email: s.email ?? `${s.id}@alphahealth.demo`,
          name: s.name,
          role: s.role,
          locationIds: s.locationIds ?? [],
          credentials: s.credentials ?? null,
          canApprove: s.canApprove ?? false,
          updatedAt: new Date(),
        },
      });
  }
  return seededStaff.length;
}

export interface StaffRow {
  id: string;
  email: string;
  name: string;
  role: string;
  locationIds: string[];
  canApprove: boolean;
  active: boolean;
}

function toRow(r: typeof staffTable.$inferSelect): StaffRow {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    locationIds: (r.locationIds as string[]) ?? [],
    canApprove: r.canApprove,
    active: r.active,
  };
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
