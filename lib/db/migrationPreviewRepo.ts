import { and, asc, count, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { requireDb } from "@/lib/db/client";
import {
  client,
  consult,
  contactEntry,
  historicalFulfillmentRecord,
  migrationException,
  migrationRun,
  sale,
  saleLine,
  staff,
} from "@/lib/db/schema";

const ALPHA_SOURCE = "alpha-v1";

function boundedPage(value: number, fallback: number, maximum: number) {
  return Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 0), maximum) : fallback;
}

async function countForSource(
  table:
    | typeof client
    | typeof staff
    | typeof consult
    | typeof contactEntry
    | typeof sale
    | typeof saleLine
    | typeof historicalFulfillmentRecord,
) {
  const db = requireDb();
  const [row] = await db
    .select({ value: count() })
    .from(table)
    .where(eq(table.sourceSystem, ALPHA_SOURCE));
  return row?.value ?? 0;
}

function countMap(rows: { clientId: string; value: number }[]) {
  return new Map(rows.map((row) => [row.clientId, row.value]));
}

/**
 * Staff-only window into imported Alpha facts.
 *
 * There is intentionally no seeded fallback. If migration has not run, this
 * returns zeros and an empty list rather than making a demo patient look real.
 * Source ids and migration exception payloads remain private.
 */
export async function readAlphaMigrationPreview(input: {
  query?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const db = requireDb();
  const query = (input.query ?? "").trim().slice(0, 80);
  const pageSize = boundedPage(input.pageSize ?? 25, 25, 50) || 25;
  const page = boundedPage(input.page ?? 0, 0, 100_000);
  const match = query
    ? `%${query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`
    : null;
  const patientWhere = and(
    eq(client.sourceSystem, ALPHA_SOURCE),
    match
      ? or(
          ilike(client.firstName, match),
          ilike(client.lastName, match),
          ilike(client.preferredName, match),
          ilike(client.mrn, match),
          ilike(client.email, match),
          ilike(client.phone, match),
        )
      : undefined,
  );

  const [
    importedClients,
    importedStaff,
    importedConsults,
    importedContacts,
    importedSales,
    importedSaleLines,
    importedFulfillment,
    matchingRows,
    patients,
    exceptionRows,
    latestRun,
  ] = await Promise.all([
    countForSource(client),
    countForSource(staff),
    countForSource(consult),
    countForSource(contactEntry),
    countForSource(sale),
    countForSource(saleLine),
    countForSource(historicalFulfillmentRecord),
    db.select({ value: count() }).from(client).where(patientWhere),
    db
      .select({
        id: client.id,
        mrn: client.mrn,
        firstName: client.firstName,
        lastName: client.lastName,
        preferredName: client.preferredName,
        dateOfBirth: client.dateOfBirth,
        email: client.email,
        phone: client.phone,
        status: client.status,
        homeLocationId: client.homeLocationId,
        sourceUpdatedAt: client.sourceUpdatedAt,
      })
      .from(client)
      .where(patientWhere)
      .orderBy(asc(client.lastName), asc(client.firstName), asc(client.id))
      .limit(pageSize)
      .offset(page * pageSize),
    db
      .select({ status: migrationException.status, value: count() })
      .from(migrationException)
      .where(eq(migrationException.sourceSystem, ALPHA_SOURCE))
      .groupBy(migrationException.status),
    db
      .select({
        id: migrationRun.id,
        mode: migrationRun.mode,
        status: migrationRun.status,
        counts: migrationRun.counts,
        checksum: migrationRun.checksum,
        startedAt: migrationRun.startedAt,
        completedAt: migrationRun.completedAt,
      })
      .from(migrationRun)
      .where(eq(migrationRun.sourceSystem, ALPHA_SOURCE))
      .orderBy(sql`${migrationRun.startedAt} desc`)
      .limit(1),
  ]);

  const ids = patients.map((row) => row.id);
  const [consultCounts, contactCounts, saleCounts, fulfillmentCounts] = ids.length
    ? await Promise.all([
        db
          .select({ clientId: consult.clientId, value: count() })
          .from(consult)
          .where(and(eq(consult.sourceSystem, ALPHA_SOURCE), inArray(consult.clientId, ids)))
          .groupBy(consult.clientId),
        db
          .select({ clientId: contactEntry.clientId, value: count() })
          .from(contactEntry)
          .where(and(eq(contactEntry.sourceSystem, ALPHA_SOURCE), inArray(contactEntry.clientId, ids)))
          .groupBy(contactEntry.clientId),
        db
          .select({
            clientId: sale.clientId,
            value: count(),
            netCents: sql<number>`coalesce(sum(${sale.totalCents}), 0)::int`,
          })
          .from(sale)
          .where(and(eq(sale.sourceSystem, ALPHA_SOURCE), inArray(sale.clientId, ids)))
          .groupBy(sale.clientId),
        db
          .select({ clientId: historicalFulfillmentRecord.clientId, value: count() })
          .from(historicalFulfillmentRecord)
          .where(
            and(
              eq(historicalFulfillmentRecord.sourceSystem, ALPHA_SOURCE),
              inArray(historicalFulfillmentRecord.clientId, ids),
            ),
          )
          .groupBy(historicalFulfillmentRecord.clientId),
      ])
    : [[], [], [], []];

  const consultByClient = countMap(consultCounts);
  const contactByClient = countMap(contactCounts);
  const saleByClient = new Map(saleCounts.map((row) => [row.clientId, row]));
  const fulfillmentByClient = countMap(fulfillmentCounts);

  return {
    sourceSystem: ALPHA_SOURCE,
    authoritative: true,
    summary: {
      clients: importedClients,
      staff: importedStaff,
      consults: importedConsults,
      contacts: importedContacts,
      sales: importedSales,
      saleLines: importedSaleLines,
      fulfillment: importedFulfillment,
      exceptions: exceptionRows.reduce((total, row) => total + row.value, 0),
      pendingExceptions: exceptionRows
        .filter((row) => row.status.toLowerCase().includes("pending"))
        .reduce((total, row) => total + row.value, 0),
    },
    latestRun: latestRun[0] ?? null,
    query,
    page,
    pageSize,
    matching: matchingRows[0]?.value ?? 0,
    patients: patients.map((row) => {
      const saleRollup = saleByClient.get(row.id);
      return {
        ...row,
        consultCount: consultByClient.get(row.id) ?? 0,
        contactCount: contactByClient.get(row.id) ?? 0,
        saleCount: saleRollup?.value ?? 0,
        netSalesCents: saleRollup?.netCents ?? 0,
        fulfillmentCount: fulfillmentByClient.get(row.id) ?? 0,
      };
    }),
  };
}
