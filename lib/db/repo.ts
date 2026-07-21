import { and, desc, eq, gt, gte, isNull, sql as raw } from "drizzle-orm";
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
  consult as consultTable,
  lead as leadTable,
  leadStageEvent,
  consent as consentTable,
  intakeInvite,
  intakeSubmission,
} from "@/lib/db/schema";
import { staff as seededStaff } from "@/lib/mock/staff";
import { hashRow, GENESIS_HASH, type LedgerDraft, type LedgerRow } from "@/lib/trace/ledger";

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
async function appendLedgerInTx(tx: DbTx, draft: LedgerDraft, at: string): Promise<LedgerRow> {
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

/* -------------------------------------------------------------------------- */
/* Consults — server-side drafts (PHI off the workstation) and author sign     */
/* -------------------------------------------------------------------------- */

/**
 * Save (or update) a clinician's working draft of a consult note.
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
 * kind/channel/startedAt are NOT NULL on the table but the composer collects
 * none of them; sensible defaults are supplied on first insert and never
 * touched again, so signing later can refine them without losing the draft.
 */
export async function upsertConsultDraft(input: {
  clientId: string;
  authorId: string;
  rawNotes: string;
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
      kind: "coaching",
      channel: "in-person",
      startedAt: now,
      status: "Draft",
      rawNotes: input.rawNotes,
      aiSummary: (input.aiSummary as never) ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [consultTable.authorId, consultTable.clientId],
      targetWhere: raw`status = 'Draft'`,
      set: {
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
): Promise<{ id: string; rawNotes: string; aiSummary: unknown; updatedAt: string } | null> {
  const db = requireDb();
  const [row] = await db
    .select({
      id: consultTable.id,
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
    ? { id: row.id, rawNotes: row.rawNotes ?? "", aiSummary: row.aiSummary, updatedAt: row.updatedAt.toISOString() }
    : null;
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
      stage: "new",
      createdAt: at,
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
  consents: ConsentDecision[];
  signatureName?: string;
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
      .returning({ id: intakeInvite.id, leadId: intakeInvite.leadId });

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
      .set({ stage: "intake-submitted" })
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
