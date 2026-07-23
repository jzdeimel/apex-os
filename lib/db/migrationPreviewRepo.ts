import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { requireDb } from "@/lib/db/client";
import {
  client,
  consult,
  contactEntry,
  historicalFulfillmentRecord,
  legacyBinaryAsset,
  legacySourceRecord,
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
    | typeof historicalFulfillmentRecord
    | typeof legacySourceRecord
    | typeof legacyBinaryAsset,
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

function isPrivateArchiveKey(key: string) {
  return (
    key === "id" ||
    key.endsWith("Id") ||
    key.endsWith("_id") ||
    /(token|password|secret|credential|hash|clientnamekey|mindbody|ghl|refresh|session)/i.test(key)
  );
}

function displaySafeArchiveValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[nested value retained in restricted archive]";
  if (Array.isArray(value)) {
    return value.slice(0, 250).map((item) => displaySafeArchiveValue(item, depth + 1));
  }
  if (!value || typeof value !== "object") {
    return typeof value === "string" && value.length > 20_000
      ? `${value.slice(0, 20_000)}…`
      : value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !isPrivateArchiveKey(key))
      .map(([key, item]) => [key, displaySafeArchiveValue(item, depth + 1)]),
  );
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
    importedArchivedRecords,
    importedBinaryAssets,
    archiveCoverage,
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
    countForSource(legacySourceRecord),
    countForSource(legacyBinaryAsset),
    db
      .select({ entity: legacySourceRecord.sourceEntityType, value: count() })
      .from(legacySourceRecord)
      .where(eq(legacySourceRecord.sourceSystem, ALPHA_SOURCE))
      .groupBy(legacySourceRecord.sourceEntityType)
      .orderBy(asc(legacySourceRecord.sourceEntityType)),
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
  const [consultCounts, contactCounts, saleCounts, fulfillmentCounts, archiveCounts, assetCounts] = ids.length
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
        db
          .select({ clientId: legacySourceRecord.clientId, value: count() })
          .from(legacySourceRecord)
          .where(
            and(
              eq(legacySourceRecord.sourceSystem, ALPHA_SOURCE),
              inArray(legacySourceRecord.clientId, ids),
            ),
          )
          .groupBy(legacySourceRecord.clientId),
        db
          .select({ clientId: legacyBinaryAsset.clientId, value: count() })
          .from(legacyBinaryAsset)
          .where(
            and(
              eq(legacyBinaryAsset.sourceSystem, ALPHA_SOURCE),
              inArray(legacyBinaryAsset.clientId, ids),
            ),
          )
          .groupBy(legacyBinaryAsset.clientId),
      ])
    : [[], [], [], [], [], []];

  const consultByClient = countMap(consultCounts);
  const contactByClient = countMap(contactCounts);
  const saleByClient = new Map(saleCounts.map((row) => [row.clientId, row]));
  const fulfillmentByClient = countMap(fulfillmentCounts);
  const archiveByClient = countMap(
    archiveCounts.filter((row): row is { clientId: string; value: number } => Boolean(row.clientId)),
  );
  const assetByClient = countMap(
    assetCounts.filter((row): row is { clientId: string; value: number } => Boolean(row.clientId)),
  );

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
      archivedRecords: importedArchivedRecords,
      binaryAssets: importedBinaryAssets,
      exceptions: exceptionRows.reduce((total, row) => total + row.value, 0),
      pendingExceptions: exceptionRows
        .filter((row) => row.status.toLowerCase().includes("pending"))
        .reduce((total, row) => total + row.value, 0),
    },
    latestRun: latestRun[0] ?? null,
    archiveCoverage,
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
        archivedRecordCount: archiveByClient.get(row.id) ?? 0,
        binaryAssetCount: assetByClient.get(row.id) ?? 0,
      };
    }),
  };
}

/**
 * One production-like chart view over facts already copied into Apex.
 *
 * The raw lossless source row stays server-side. The display projection removes
 * source identifiers and bearer/security fields before it crosses the API
 * boundary, while keeping clinical and operational content available for
 * manual validation.
 */
export async function readAlphaMigrationPatient(clientId: string) {
  const db = requireDb();
  const [patient] = await db
    .select({
      id: client.id,
      mrn: client.mrn,
      firstName: client.firstName,
      lastName: client.lastName,
      preferredName: client.preferredName,
      dateOfBirth: client.dateOfBirth,
      sex: client.sex,
      email: client.email,
      phone: client.phone,
      address1: client.address1,
      address2: client.address2,
      city: client.city,
      state: client.state,
      zip: client.zip,
      status: client.status,
      isProspect: client.isProspect,
      homeLocationId: client.homeLocationId,
      assignedCoachId: client.assignedCoachId,
      sourceUpdatedAt: client.sourceUpdatedAt,
    })
    .from(client)
    .where(and(eq(client.id, clientId), eq(client.sourceSystem, ALPHA_SOURCE)))
    .limit(1);
  if (!patient) return null;

  const [consultRows, contactRows, saleRows, fulfillmentRows, archiveRows, assetRows] =
    await Promise.all([
      db
        .select({
          id: consult.id,
          authorName: staff.name,
          kind: consult.kind,
          channel: consult.channel,
          status: consult.status,
          startedAt: consult.startedAt,
          endedAt: consult.endedAt,
          subjective: consult.subjective,
          objective: consult.objective,
          assessment: consult.assessment,
          plan: consult.plan,
          rawNotes: consult.rawNotes,
          aiSummary: consult.aiSummary,
          signedAt: consult.signedAt,
        })
        .from(consult)
        .leftJoin(staff, eq(staff.id, consult.authorId))
        .where(and(eq(consult.clientId, clientId), eq(consult.sourceSystem, ALPHA_SOURCE)))
        .orderBy(desc(consult.startedAt))
        .limit(200),
      db
        .select({
          id: contactEntry.id,
          staffName: staff.name,
          at: contactEntry.at,
          channel: contactEntry.channel,
          direction: contactEntry.direction,
          subject: contactEntry.subject,
          outcome: contactEntry.outcome,
          notes: contactEntry.notes,
          hasAttachments: contactEntry.sourceHasAttachments,
        })
        .from(contactEntry)
        .leftJoin(staff, eq(staff.id, contactEntry.staffId))
        .where(and(eq(contactEntry.clientId, clientId), eq(contactEntry.sourceSystem, ALPHA_SOURCE)))
        .orderBy(desc(contactEntry.at))
        .limit(300),
      db
        .select({
          id: sale.id,
          kind: sale.kind,
          orderNumber: sale.orderNumber,
          occurredAt: sale.occurredAt,
          location: sale.sourceLocationLabel,
          totalCents: sale.totalCents,
          itemCount: sale.actualItemCount,
        })
        .from(sale)
        .where(and(eq(sale.clientId, clientId), eq(sale.sourceSystem, ALPHA_SOURCE)))
        .orderBy(desc(sale.occurredAt))
        .limit(200),
      db
        .select({
          id: historicalFulfillmentRecord.id,
          recordKind: historicalFulfillmentRecord.recordKind,
          orderNumber: historicalFulfillmentRecord.orderNumber,
          partner: historicalFulfillmentRecord.partner,
          status: historicalFulfillmentRecord.status,
          occurredAt: historicalFulfillmentRecord.occurredAt,
          completedAt: historicalFulfillmentRecord.completedAt,
          itemName: historicalFulfillmentRecord.itemName,
          quantity: historicalFulfillmentRecord.quantity,
          items: historicalFulfillmentRecord.items,
          pickup: historicalFulfillmentRecord.pickup,
          shippingType: historicalFulfillmentRecord.shippingType,
          carrier: historicalFulfillmentRecord.carrier,
          delayed: historicalFulfillmentRecord.delayed,
          delayReason: historicalFulfillmentRecord.delayReason,
        })
        .from(historicalFulfillmentRecord)
        .where(
          and(
            eq(historicalFulfillmentRecord.clientId, clientId),
            eq(historicalFulfillmentRecord.sourceSystem, ALPHA_SOURCE),
          ),
        )
        .orderBy(desc(historicalFulfillmentRecord.occurredAt))
        .limit(200),
      db
        .select({
          id: legacySourceRecord.id,
          entity: legacySourceRecord.sourceEntityType,
          occurredAt: legacySourceRecord.occurredAt,
          sourceUpdatedAt: legacySourceRecord.sourceUpdatedAt,
          payload: legacySourceRecord.payload,
        })
        .from(legacySourceRecord)
        .where(
          and(
            eq(legacySourceRecord.clientId, clientId),
            eq(legacySourceRecord.sourceSystem, ALPHA_SOURCE),
          ),
        )
        .orderBy(desc(legacySourceRecord.sourceUpdatedAt))
        .limit(300),
      db
        .select({
          id: legacyBinaryAsset.id,
          entity: legacyBinaryAsset.sourceEntityType,
          filename: legacyBinaryAsset.filename,
          contentType: legacyBinaryAsset.contentType,
          sizeBytes: legacyBinaryAsset.sizeBytes,
          category: legacyBinaryAsset.category,
          sourceCreatedAt: legacyBinaryAsset.sourceCreatedAt,
          contentSha256: legacyBinaryAsset.contentSha256,
        })
        .from(legacyBinaryAsset)
        .where(
          and(
            eq(legacyBinaryAsset.clientId, clientId),
            eq(legacyBinaryAsset.sourceSystem, ALPHA_SOURCE),
          ),
        )
        .orderBy(desc(legacyBinaryAsset.sourceCreatedAt))
        .limit(100),
    ]);

  const saleIds = saleRows.map((row) => row.id);
  const lineRows = saleIds.length
    ? await db
        .select({
          id: saleLine.id,
          saleId: saleLine.saleId,
          sku: saleLine.sku,
          description: saleLine.description,
          quantity: saleLine.quantity,
          unitPriceCents: saleLine.unitPriceCents,
          totalCents: saleLine.totalCents,
          returned: saleLine.returned,
        })
        .from(saleLine)
        .where(and(inArray(saleLine.saleId, saleIds), eq(saleLine.sourceSystem, ALPHA_SOURCE)))
        .orderBy(asc(saleLine.saleId), asc(saleLine.lineIndex))
    : [];
  const linesBySale = new Map<string, typeof lineRows>();
  for (const line of lineRows) {
    const lines = linesBySale.get(line.saleId) ?? [];
    lines.push(line);
    linesBySale.set(line.saleId, lines);
  }

  return {
    authoritative: true,
    sourceSystem: ALPHA_SOURCE,
    patient,
    consults: consultRows,
    contacts: contactRows,
    sales: saleRows.map((row) => ({ ...row, lines: linesBySale.get(row.id) ?? [] })),
    fulfillment: fulfillmentRows,
    sourceRecords: archiveRows.map((row) => ({
      id: row.id,
      entity: row.entity,
      occurredAt: row.occurredAt,
      sourceUpdatedAt: row.sourceUpdatedAt,
      payload: displaySafeArchiveValue(row.payload),
    })),
    assets: assetRows,
  };
}
