import { and, count, eq, gte, inArray, lt, ne, notInArray, sql } from "drizzle-orm";

import { requireDb } from "@/lib/db/client";
import {
  appointment,
  client,
  consult,
  fulfillmentOrder,
  invoice,
  lead,
  membership,
  operationalCase,
  sale,
  workTask,
} from "@/lib/db/schema";

function value(row: { value: number } | undefined) {
  return row?.value ?? 0;
}

/** Current operational and imported facts only; no seeded trend generation. */
export async function readExecutiveSummary(at = new Date()) {
  const db = requireDb();
  const today = new Date(at);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextSevenDays = new Date(today);
  nextSevenDays.setDate(nextSevenDays.getDate() + 7);
  const trailingThirty = new Date(at);
  trailingThirty.setDate(trailingThirty.getDate() - 30);

  const [
    totalPatients,
    activePatients,
    consults,
    salesLifetime,
    salesTrailing,
    appointmentsToday,
    appointmentsNextSeven,
    openTasks,
    overdueTasks,
    openCases,
    activeLeads,
    activeMemberships,
    invoiceBalance,
    fulfillmentBacklog,
  ] = await Promise.all([
    db.select({ value: count() }).from(client),
    db.select({ value: count() }).from(client).where(eq(client.status, "active")),
    db.select({ value: count() }).from(consult),
    db.select({
      count: count(),
      cents: sql<number>`coalesce(sum(${sale.totalCents}), 0)::bigint`,
    }).from(sale),
    db.select({
      count: count(),
      cents: sql<number>`coalesce(sum(${sale.totalCents}), 0)::bigint`,
    }).from(sale).where(gte(sale.occurredAt, trailingThirty)),
    db.select({ value: count() }).from(appointment).where(and(gte(appointment.startAt, today), lt(appointment.startAt, tomorrow))),
    db.select({ value: count() }).from(appointment).where(and(gte(appointment.startAt, today), lt(appointment.startAt, nextSevenDays))),
    db.select({ value: count() }).from(workTask).where(eq(workTask.status, "open")),
    db.select({ value: count() }).from(workTask).where(and(eq(workTask.status, "open"), lt(workTask.dueAt, at))),
    db.select({ value: count() }).from(operationalCase).where(ne(operationalCase.status, "closed")),
    db.select({ value: count() }).from(lead).where(inArray(lead.stage, ["new", "contacted", "qualified", "booked"])),
    db.select({ value: count() }).from(membership).where(eq(membership.status, "active")),
    db.select({
      count: count(),
      cents: sql<number>`coalesce(sum(${invoice.totalCents} - ${invoice.paidCents}), 0)::bigint`,
    }).from(invoice).where(notInArray(invoice.status, ["paid", "void", "cancelled"])),
    db.select({ value: count() }).from(fulfillmentOrder).where(notInArray(fulfillmentOrder.status, ["delivered", "complete", "cancelled"])),
  ]);

  return {
    asOf: at.toISOString(),
    patients: { total: value(totalPatients[0]), active: value(activePatients[0]) },
    consults: value(consults[0]),
    sales: {
      lifetimeCount: salesLifetime[0]?.count ?? 0,
      lifetimeCents: Number(salesLifetime[0]?.cents ?? 0),
      trailingThirtyCount: salesTrailing[0]?.count ?? 0,
      trailingThirtyCents: Number(salesTrailing[0]?.cents ?? 0),
    },
    appointments: {
      today: value(appointmentsToday[0]),
      nextSevenDays: value(appointmentsNextSeven[0]),
    },
    tasks: { open: value(openTasks[0]), overdue: value(overdueTasks[0]) },
    cases: { open: value(openCases[0]) },
    leads: { active: value(activeLeads[0]) },
    memberships: { active: value(activeMemberships[0]) },
    invoices: {
      openCount: invoiceBalance[0]?.count ?? 0,
      balanceCents: Number(invoiceBalance[0]?.cents ?? 0),
    },
    fulfillment: { backlog: value(fulfillmentBacklog[0]) },
  };
}
