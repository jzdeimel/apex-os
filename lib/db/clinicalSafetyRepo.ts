import { and, desc, eq, isNull, or, sql as raw } from "drizzle-orm";

import { requireDb } from "@/lib/db/client";
import {
  adverseEvent,
  client,
  consult,
  consultAddendum,
  escalation,
} from "@/lib/db/schema";
import { appendLedgerInTx } from "@/lib/db/repo";
import type { AdverseEventSeverity } from "@/lib/clinical-safety/lifecycle";
import type { LedgerDraft } from "@/lib/trace/ledger";

export async function readConsultSafetyScope(consultId: string) {
  const db = requireDb();
  const [row] = await db
    .select({
      consult,
      assignedCoachId: client.assignedCoachId,
      assignedProviderId: client.assignedProviderId,
      locationId: client.homeLocationId,
      clientStatus: client.status,
    })
    .from(consult)
    .innerJoin(client, eq(consult.clientId, client.id))
    .where(eq(consult.id, consultId))
    .limit(1);
  return row ?? null;
}

export async function appendSignedConsultAddendumWithLedger(input: {
  id: string;
  consultId: string;
  body: string;
  reason: string;
  attestation: string;
  signerCredential?: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4280)`);
    const [note] = await tx.select().from(consult).where(eq(consult.id, input.consultId)).limit(1);
    if (!note) return { status: "missing" as const, reason: "Unknown consult." };
    if (note.status !== "Signed") return { status: "conflict" as const, reason: "Only a signed consult can receive an addendum." };
    const [existing] = await tx.select().from(consultAddendum).where(eq(consultAddendum.id, input.id)).limit(1);
    if (existing) {
      const same = existing.consultId === input.consultId && existing.authorId === input.actorId &&
        existing.body === input.body && existing.reason === input.reason && existing.attestation === input.attestation;
      return { status: same ? "ok" as const : "conflict" as const, addendum: same ? existing : null, duplicate: same, ledger: null };
    }
    const at = new Date(input.at);
    const ledger = await appendLedgerInTx(tx, {
      actorId: input.actorId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "sign",
      entity: "note",
      entityId: input.id,
      subjectId: note.clientId,
      reason: `Signed addendum to consult ${note.id}: ${input.reason}`,
      after: { consultId: note.id, addendumId: input.id, immutable: true, signerCredential: input.signerCredential ?? null },
    }, input.at);
    const [addendum] = await tx.insert(consultAddendum).values({
      id: input.id,
      consultId: input.consultId,
      authorId: input.actorId,
      body: input.body,
      reason: input.reason,
      attestation: input.attestation,
      signerCredential: input.signerCredential ?? null,
      signedAt: at,
      createdAt: at,
      ledgerId: ledger.id,
    }).returning();
    return { status: "ok" as const, addendum, duplicate: false, ledger };
  });
}

export async function readAdverseEvents(input: { clientId?: string; assignedProviderId?: string; unreviewedOnly?: boolean }) {
  const db = requireDb();
  return db
    .select()
    .from(adverseEvent)
    .innerJoin(client, eq(adverseEvent.clientId, client.id))
    .where(and(
      input.clientId ? eq(adverseEvent.clientId, input.clientId) : undefined,
      input.assignedProviderId ? eq(client.assignedProviderId, input.assignedProviderId) : undefined,
      input.unreviewedOnly ? isNull(adverseEvent.reviewedAt) : undefined,
    ))
    .orderBy(desc(adverseEvent.reportedAt));
}

export async function readAdverseEventScope(id: string) {
  const db = requireDb();
  const [row] = await db
    .select({
      event: adverseEvent,
      assignedCoachId: client.assignedCoachId,
      assignedProviderId: client.assignedProviderId,
      locationId: client.homeLocationId,
      clientStatus: client.status,
    })
    .from(adverseEvent)
    .innerJoin(client, eq(adverseEvent.clientId, client.id))
    .where(eq(adverseEvent.id, id))
    .limit(1);
  return row ?? null;
}

export async function reportAdverseEventWithLedger(input: {
  id: string;
  clientId: string;
  reporterKind: string;
  suspectSku?: string;
  description: string;
  severity: AdverseEventSeverity;
  actorId: string;
  actorName: string;
  actorRole: string;
  locationId?: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4281)`);
    const [existing] = await tx.select().from(adverseEvent).where(eq(adverseEvent.id, input.id)).limit(1);
    if (existing) {
      const same = existing.clientId === input.clientId && existing.reportedBy === input.actorId &&
        existing.reporterKind === input.reporterKind && existing.description === input.description &&
        existing.severity === input.severity && (existing.suspectSku ?? "") === (input.suspectSku ?? "");
      return { status: same ? "ok" as const : "conflict" as const, event: same ? existing : null, duplicate: same, ledger: null };
    }
    const at = new Date(input.at);
    const urgent = input.severity === "severe" || input.severity === "life-threatening";
    const ledger = await appendLedgerInTx(tx, {
      actorId: input.actorId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "create",
      entity: "adverse-event",
      entityId: input.id,
      subjectId: input.clientId,
      locationId: input.locationId as LedgerDraft["locationId"],
      reason: "Recorded a suspected adverse event for licensed review.",
      after: { severity: input.severity, reporterKind: input.reporterKind, suspectSku: input.suspectSku ?? null, reviewed: false, autoEscalated: urgent },
    }, input.at);
    const [event] = await tx.insert(adverseEvent).values({
      id: input.id,
      clientId: input.clientId,
      reportedAt: at,
      reportedBy: input.actorId,
      reporterKind: input.reporterKind,
      suspectSku: input.suspectSku ?? null,
      description: input.description,
      severity: input.severity,
      ledgerId: ledger.id,
    }).returning();
    let escalationId: string | null = null;
    if (urgent) {
      escalationId = `esc-${event.id}`;
      const dueAt = new Date(at.getTime() + (input.severity === "life-threatening" ? 15 : 60) * 60_000);
      await tx.insert(escalation).values({
        id: escalationId,
        clientId: input.clientId,
        raisedByStaffId: input.actorId,
        raisedAt: at,
        kind: "Adverse event",
        priority: "Urgent",
        question: `Review suspected adverse event: ${input.description}`,
        memberQuote: input.description,
        dueAt,
        ledgerId: ledger.id,
      });
    }
    return { status: "ok" as const, event, escalationId, duplicate: false, ledger };
  });
}

export async function reviewAdverseEventWithLedger(input: {
  id: string;
  outcome: string;
  actionTaken: string;
  externalReportRef?: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  locationId?: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4281)`);
    const [current] = await tx.select().from(adverseEvent).where(eq(adverseEvent.id, input.id)).limit(1);
    if (!current) return { status: "missing" as const };
    if (current.reviewedAt) return { status: "conflict" as const, reason: "This adverse event already has a signed review. Record later facts as a consult addendum." };
    const at = new Date(input.at);
    const ledger = await appendLedgerInTx(tx, {
      actorId: input.actorId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "sign",
      entity: "adverse-event",
      entityId: current.id,
      subjectId: current.clientId,
      locationId: input.locationId as LedgerDraft["locationId"],
      reason: "Licensed adverse-event review signed.",
      before: { reviewed: false, severity: current.severity },
      after: { reviewed: true, outcome: input.outcome, actionTaken: input.actionTaken, externalReportRef: input.externalReportRef ?? null, immutableReview: true },
    }, input.at);
    const [event] = await tx.update(adverseEvent).set({
      outcome: input.outcome,
      actionTaken: input.actionTaken,
      reviewedBy: input.actorId,
      reviewedAt: at,
      externalReportRef: input.externalReportRef ?? null,
      ledgerId: ledger.id,
    }).where(and(eq(adverseEvent.id, input.id), isNull(adverseEvent.reviewedAt))).returning();
    if (!event) return { status: "conflict" as const, reason: "This adverse event was reviewed by someone else. Refresh the queue." };
    return { status: "ok" as const, event, ledger };
  });
}
