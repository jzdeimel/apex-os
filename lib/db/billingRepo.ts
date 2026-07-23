import { and, desc, eq, inArray, sql as raw } from "drizzle-orm";

import { requireDb } from "@/lib/db/client";
import {
  client,
  invoice,
  invoiceLine,
  membership,
  membershipEvent,
  paymentAttempt,
  paymentMethod,
} from "@/lib/db/schema";
import { appendLedgerInTx } from "@/lib/db/repo";
import {
  invoiceTotals,
  isMembershipStatus,
  membershipTransitionAllowed,
  type InvoiceLineInput,
  type MembershipStatus,
} from "@/lib/billing/lifecycle";
import type { LedgerDraft } from "@/lib/trace/ledger";

export async function readMembershipScope(id: string) {
  const db = requireDb();
  const [row] = await db.select({
    membership,
    coachId: client.assignedCoachId,
    providerId: client.assignedProviderId,
    locationId: client.homeLocationId,
    clientStatus: client.status,
  }).from(membership).innerJoin(client, eq(membership.clientId, client.id)).where(eq(membership.id, id)).limit(1);
  return row ?? null;
}

export async function readBillingAccount(clientId: string) {
  const db = requireDb();
  const [person] = await db.select({
    id: client.id,
    firstName: client.firstName,
    lastName: client.lastName,
    preferredName: client.preferredName,
    status: client.status,
    homeLocationId: client.homeLocationId,
  }).from(client).where(eq(client.id, clientId)).limit(1);
  if (!person) return null;

  const memberships = await db.select().from(membership)
    .where(eq(membership.clientId, clientId)).orderBy(desc(membership.createdAt));
  const membershipIds = memberships.map((row) => row.id);
  const events = membershipIds.length
    ? await db.select().from(membershipEvent).where(inArray(membershipEvent.membershipId, membershipIds)).orderBy(desc(membershipEvent.effectiveAt))
    : [];
  // Never select the processor token into an ordinary application response.
  const paymentMethods = await db.select({
    id: paymentMethod.id,
    processor: paymentMethod.processor,
    merchantAccountId: paymentMethod.merchantAccountId,
    brand: paymentMethod.brand,
    last4: paymentMethod.last4,
    expMonth: paymentMethod.expMonth,
    expYear: paymentMethod.expYear,
    isDefault: paymentMethod.isDefault,
    createdAt: paymentMethod.createdAt,
    removedAt: paymentMethod.removedAt,
  }).from(paymentMethod).where(eq(paymentMethod.clientId, clientId));
  const invoices = await db.select().from(invoice)
    .where(eq(invoice.clientId, clientId)).orderBy(desc(invoice.issuedAt));
  const invoiceIds = invoices.map((row) => row.id);
  const lines = invoiceIds.length
    ? await db.select().from(invoiceLine).where(inArray(invoiceLine.invoiceId, invoiceIds))
    : [];
  const attempts = invoiceIds.length
    ? await db.select({
        id: paymentAttempt.id,
        invoiceId: paymentAttempt.invoiceId,
        processor: paymentAttempt.processor,
        merchantAccountId: paymentAttempt.merchantAccountId,
        processorRef: paymentAttempt.processorRef,
        originalPaymentAttemptId: paymentAttempt.originalPaymentAttemptId,
        amountCents: paymentAttempt.amountCents,
        status: paymentAttempt.status,
        failureCode: paymentAttempt.failureCode,
        failureMessage: paymentAttempt.failureMessage,
        attemptedAt: paymentAttempt.attemptedAt,
        dunningAttempt: paymentAttempt.dunningAttempt,
        nextRetryAt: paymentAttempt.nextRetryAt,
        settledAt: paymentAttempt.settledAt,
        ledgerId: paymentAttempt.ledgerId,
      }).from(paymentAttempt).where(inArray(paymentAttempt.invoiceId, invoiceIds)).orderBy(desc(paymentAttempt.attemptedAt))
    : [];

  return { person, memberships, events, paymentMethods, invoices, lines, attempts };
}

export async function createMembershipWithLedger(input: {
  id: string;
  eventId: string;
  clientId: string;
  planCode: string;
  planName: string;
  monthlyRateCents: number;
  startedOn: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  nextBillOn?: string;
  homeLocationId: string;
  merchantAccountId: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4290)`);
    const [existing] = await tx.select().from(membership).where(eq(membership.id, input.id)).limit(1);
    if (existing) {
      const same = existing.clientId === input.clientId && existing.planCode === input.planCode &&
        existing.planName === input.planName && existing.monthlyRateCents === input.monthlyRateCents &&
        existing.startedOn === input.startedOn && existing.nextBillOn === (input.nextBillOn ?? null) &&
        existing.homeLocationId === input.homeLocationId && existing.merchantAccountId === input.merchantAccountId;
      return { status: same ? "ok" as const : "conflict" as const, membership: same ? existing : null, duplicate: same, ledger: null };
    }
    const [person] = await tx.select().from(client).where(eq(client.id, input.clientId)).limit(1);
    if (!person || person.status !== "active" || person.isProspect) return { status: "missing" as const, reason: "Unknown active patient." };
    if (!person.homeLocationId || person.homeLocationId !== input.homeLocationId) {
      return { status: "conflict" as const, reason: "The billing clinic does not match the patient's authoritative home clinic." };
    }
    const [current] = await tx.select().from(membership).where(and(
      eq(membership.clientId, input.clientId),
      inArray(membership.status, ["active", "paused", "past_due"]),
    )).limit(1);
    if (current) return { status: "conflict" as const, reason: "This patient already has a current membership." };

    const [created] = await tx.insert(membership).values({
      id: input.id,
      clientId: input.clientId,
      planCode: input.planCode,
      planName: input.planName,
      status: "active",
      monthlyRateCents: input.monthlyRateCents,
      startedOn: input.startedOn,
      currentPeriodStart: input.currentPeriodStart ?? input.startedOn,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      nextBillOn: input.nextBillOn ?? null,
      homeLocationId: input.homeLocationId,
      merchantAccountId: input.merchantAccountId,
      createdAt: new Date(input.at),
      updatedAt: new Date(input.at),
    }).returning();
    const ledger = await appendLedgerInTx(tx, {
      actorId: input.actorId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "create",
      entity: "membership",
      entityId: created.id,
      subjectId: input.clientId,
      locationId: input.homeLocationId as LedgerDraft["locationId"],
      reason: "Created an active membership contract.",
      after: {
        planCode: created.planCode,
        planName: created.planName,
        status: created.status,
        monthlyRateCents: created.monthlyRateCents,
        startedOn: created.startedOn,
        nextBillOn: created.nextBillOn,
        merchantAccountId: created.merchantAccountId,
      },
    }, input.at);
    await tx.update(membership).set({ ledgerId: ledger.id }).where(eq(membership.id, created.id));
    await tx.insert(membershipEvent).values({
      id: input.eventId,
      membershipId: created.id,
      fromStatus: null,
      toStatus: "active",
      effectiveAt: new Date(input.at),
      reason: "Membership created.",
      actorId: input.actorId,
      ledgerId: ledger.id,
    });
    return { status: "ok" as const, membership: { ...created, ledgerId: ledger.id }, duplicate: false, ledger };
  });
}

export async function transitionMembershipWithLedger(input: {
  membershipId: string;
  eventId: string;
  toStatus: MembershipStatus;
  reason: string;
  nextBillOn?: string | null;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4290)`);
    const [existingEvent] = await tx.select().from(membershipEvent).where(eq(membershipEvent.id, input.eventId)).limit(1);
    if (existingEvent) {
      const [sameMembership] = await tx.select().from(membership).where(eq(membership.id, existingEvent.membershipId)).limit(1);
      const same = existingEvent.membershipId === input.membershipId && existingEvent.toStatus === input.toStatus && existingEvent.reason === input.reason;
      return { status: same ? "ok" as const : "conflict" as const, membership: same ? sameMembership : null, duplicate: same, ledger: null };
    }
    const [current] = await tx.select().from(membership).where(eq(membership.id, input.membershipId)).limit(1);
    if (!current || !isMembershipStatus(current.status)) return { status: "missing" as const, reason: "Unknown membership." };
    if (!membershipTransitionAllowed(current.status, input.toStatus)) {
      return { status: "conflict" as const, reason: `${current.status} memberships cannot transition to ${input.toStatus}.` };
    }
    const when = new Date(input.at);
    const [updated] = await tx.update(membership).set({
      status: input.toStatus,
      pausedAt: input.toStatus === "paused" ? when : input.toStatus === "active" ? null : current.pausedAt,
      pauseReason: input.toStatus === "paused" ? input.reason : input.toStatus === "active" ? null : current.pauseReason,
      cancelledAt: input.toStatus === "cancelled" ? when : current.cancelledAt,
      cancelReason: input.toStatus === "cancelled" ? input.reason : current.cancelReason,
      nextBillOn: input.toStatus === "cancelled" ? null : input.nextBillOn === undefined ? current.nextBillOn : input.nextBillOn,
      updatedAt: when,
    }).where(eq(membership.id, input.membershipId)).returning();
    const ledger = await appendLedgerInTx(tx, {
      actorId: input.actorId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "update",
      entity: "membership",
      entityId: current.id,
      subjectId: current.clientId,
      locationId: current.homeLocationId as LedgerDraft["locationId"],
      reason: input.reason,
      before: { status: current.status, nextBillOn: current.nextBillOn },
      after: { status: updated.status, nextBillOn: updated.nextBillOn },
    }, input.at);
    await tx.update(membership).set({ ledgerId: ledger.id }).where(eq(membership.id, current.id));
    await tx.insert(membershipEvent).values({
      id: input.eventId,
      membershipId: current.id,
      fromStatus: current.status,
      toStatus: input.toStatus,
      effectiveAt: when,
      reason: input.reason,
      actorId: input.actorId,
      ledgerId: ledger.id,
    });
    return { status: "ok" as const, membership: { ...updated, ledgerId: ledger.id }, duplicate: false, ledger };
  });
}

export async function createInvoiceWithLedger(input: {
  id: string;
  number: string;
  clientId: string;
  membershipId?: string;
  dueAt?: string;
  lines: InvoiceLineInput[];
  discountCents?: number;
  discountReason?: string;
  taxCents?: number;
  locationId: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}) {
  const totals = invoiceTotals(input);
  if (!totals.ok) return { status: "invalid" as const, reason: totals.reason };
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(4291)`);
    const [existing] = await tx.select().from(invoice).where(eq(invoice.id, input.id)).limit(1);
    if (existing) {
      const existingLines = await tx.select().from(invoiceLine).where(eq(invoiceLine.invoiceId, input.id));
      const requestedLines = input.lines.map((line) => ({
        sku: line.sku?.trim() || null,
        description: line.description.trim(),
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        totalCents: line.quantity * line.unitPriceCents,
        hsaEligibility: line.hsaEligibility ?? "unknown",
      }));
      const storedLines = existingLines.map((line) => ({
        sku: line.sku,
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        totalCents: line.totalCents,
        hsaEligibility: line.hsaEligibility,
      }));
      const same = existing.clientId === input.clientId && existing.number === input.number &&
        existing.membershipId === (input.membershipId ?? null) && existing.totalCents === totals.totalCents &&
        existing.subtotalCents === totals.subtotalCents && existing.discountCents === totals.discountCents &&
        existing.taxCents === totals.taxCents && existing.discountReason === (totals.discountCents ? input.discountReason!.trim() : null) &&
        existing.locationId === input.locationId &&
        (existing.dueAt?.toISOString() ?? null) === (input.dueAt ? new Date(input.dueAt).toISOString() : null) &&
        JSON.stringify(storedLines) === JSON.stringify(requestedLines);
      return { status: same ? "ok" as const : "conflict" as const, invoice: same ? existing : null, duplicate: same, ledger: null };
    }
    const [person] = await tx.select().from(client).where(eq(client.id, input.clientId)).limit(1);
    if (!person || person.status !== "active" || person.isProspect) return { status: "missing" as const, reason: "Unknown active patient." };
    if (!person.homeLocationId || person.homeLocationId !== input.locationId) {
      return { status: "conflict" as const, reason: "Invoice clinic does not match the patient's authoritative home clinic." };
    }
    if (input.membershipId) {
      const [contract] = await tx.select().from(membership).where(eq(membership.id, input.membershipId)).limit(1);
      if (!contract || contract.clientId !== input.clientId) return { status: "conflict" as const, reason: "The membership does not belong to this patient." };
    }
    const issuedAt = new Date(input.at);
    const [created] = await tx.insert(invoice).values({
      id: input.id,
      clientId: input.clientId,
      membershipId: input.membershipId ?? null,
      number: input.number,
      issuedAt,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      subtotalCents: totals.subtotalCents,
      discountCents: totals.discountCents,
      discountReason: totals.discountCents ? input.discountReason!.trim() : null,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      paidCents: 0,
      status: totals.totalCents === 0 ? "paid" : "open",
      hsaEligibleCents: totals.hsaEligibleCents,
      locationId: input.locationId,
    }).returning();
    await tx.insert(invoiceLine).values(input.lines.map((line, index) => ({
      id: `${input.id}-line-${index + 1}`,
      invoiceId: input.id,
      sku: line.sku?.trim() || null,
      description: line.description.trim(),
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      totalCents: line.quantity * line.unitPriceCents,
      hsaEligibility: line.hsaEligibility ?? "unknown",
    })));
    const ledger = await appendLedgerInTx(tx, {
      actorId: input.actorId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: "create",
      entity: "invoice",
      entityId: created.id,
      subjectId: input.clientId,
      locationId: input.locationId as LedgerDraft["locationId"],
      reason: "Issued an itemized patient invoice.",
      after: {
        number: created.number,
        membershipId: created.membershipId,
        subtotalCents: created.subtotalCents,
        discountCents: created.discountCents,
        taxCents: created.taxCents,
        totalCents: created.totalCents,
        status: created.status,
        lineCount: input.lines.length,
      },
    }, input.at);
    await tx.update(invoice).set({ ledgerId: ledger.id }).where(eq(invoice.id, created.id));
    return { status: "ok" as const, invoice: { ...created, ledgerId: ledger.id }, duplicate: false, ledger };
  });
}
