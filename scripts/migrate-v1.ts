import { randomUUID } from "node:crypto";
import postgres, { type Sql, type TransactionSql } from "postgres";
import {
  V1_SOURCE_SYSTEM,
  bindingId,
  exactCents,
  extractSummary,
  sameDatabase,
  sha256,
  type MappedRecord,
  type V1AppointmentRow,
  type V1ContactEntryRow,
  type V1ConsultRow,
  type V1Extract,
  type V1HistoricalFulfillmentRow,
  type V1LocationRow,
  type V1MigrationExceptionRow,
  type V1PersonRow,
  type V1SaleLineRow,
  type V1SaleRow,
  type V1StaffRow,
} from "@/lib/migration/v1";
import { ROSTER } from "@/lib/mock/roster";

type Mode = "baseline" | "delta" | "rehearsal";

interface Options {
  apply: boolean;
  reconcileOnly: boolean;
  mode: Mode;
  watermark: Date | null;
  initiatedBy: string | null;
  targetLabel: string | null;
}

interface ContinuityInventoryRow {
  domain: "clinical" | "commercial" | "operations" | "medsource" | "reference" | "discard-auth";
  entity: string;
  count: number;
}

type SourceShape = "legacy-public-2026-07" | "unified-clinic";

interface ExtractDiagnostics {
  staffNameCollisionGroups: number;
  unresolvedStaffNameCollisionGroups: number;
  staffActivationCandidates: number;
  inactiveLegacyStaffRows: number;
  syntheticRosterStaffRows: number;
  unmatchedAssignedCoaches: number;
  ambiguousAssignedCoaches: number;
  unresolvedHomeLocations: number;
  namesParsedFromDisplay: number;
  invalidDobValues: number;
  consultsExcludedMissingClient: number;
  consultsExcludedMissingAuthor: number;
  progressNotesExcludedMissingClient: number;
  progressNotesExcludedMissingAuthor: number;
  progressNotesWithSynthesizedAuthor: number;
  contactsExcludedMissingClient: number;
  contactsWithoutStaffOwner: number;
  contactAttachmentsForRehousing: number;
  routedOrdersExcludedMissingClient: number;
  routedOrderClientKeyConflicts: number;
  routedOrdersMissingSaleLink: number;
  routedOrdersMissingCoach: number;
  shipmentsExcludedLinkage: number;
  purchasesExcludedMissingClient: number;
  purchaseClientKeyConflicts: number;
  purchasesMissingCoach: number;
  purchaseItemCountMismatches: number;
  purchaseLineMathMismatches: number;
}

function parseDate(value: string, flag: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${flag} must be an ISO-8601 timestamp`);
  return date;
}

export function parseOptions(argv: string[]): Options {
  const value = (name: string) => argv.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
  const mode = (value("--mode") ?? "rehearsal") as Mode;
  if (!(["baseline", "delta", "rehearsal"] as string[]).includes(mode)) {
    throw new Error("--mode must be baseline, delta, or rehearsal");
  }
  const watermarkRaw = value("--watermark");
  const options: Options = {
    apply: argv.includes("--apply"),
    reconcileOnly: argv.includes("--reconcile-only"),
    mode,
    watermark: watermarkRaw ? parseDate(watermarkRaw, "--watermark") : null,
    initiatedBy: value("--initiated-by") ?? process.env.MIGRATION_INITIATED_BY ?? null,
    targetLabel: value("--confirm-target") ?? null,
  };
  if (options.mode === "delta" && !options.watermark) {
    throw new Error("delta mode requires --watermark=<last successful nextWatermark>");
  }
  if (options.apply && options.reconcileOnly) {
    throw new Error("--apply and --reconcile-only are mutually exclusive");
  }
  return options;
}

function connection(url: string) {
  const parsed = new URL(url);
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  // Prisma pool tuning parameters in Alpha's URL are not PostgreSQL startup
  // parameters. Passing them through makes a direct read-only migration client
  // fail before it can establish the protected transaction.
  for (const key of ["connection_limit", "pool_timeout"]) parsed.searchParams.delete(key);
  return postgres(parsed.toString(), {
    max: 1,
    prepare: false,
    connect_timeout: 15,
    idle_timeout: 20,
    ssl: local || process.env.MIGRATION_SSL === "disable" ? false : "require",
    onnotice: () => {},
  });
}

/**
 * Alpha remains the protected source until the cutover is separately approved.
 * A migration target must be an Apex-labelled database on a different server;
 * this guard is independent of the operator confirmation flags below.
 */
export function protectedSourceTargetViolation(
  sourceUrl: string,
  targetUrl: string,
  targetLabel: string | null,
): string | null {
  if (sameDatabase(sourceUrl, targetUrl)) return "target is the Alpha source database";
  const source = new URL(sourceUrl);
  const target = new URL(targetUrl);
  if (source.hostname.toLowerCase() === target.hostname.toLowerCase()) {
    return "target shares the protected Alpha database server";
  }
  const targetMarker = `${target.hostname}${target.pathname}:${targetLabel ?? ""}`.toLowerCase();
  if (targetMarker.includes("alphaos") || targetMarker.includes("alpha-coach") || targetMarker.includes("rg-alpha")) {
    return "target appears to be an Alpha production resource";
  }
  if (targetLabel && !targetLabel.toLowerCase().startsWith("apex-")) {
    return "target label is not an Apex environment";
  }
  return null;
}

const LEGACY_COLUMNS = {
  Appointment: ["id", "clientId", "coachId", "subType", "status", "startTime", "contactMethod", "smmDelta", "pbfDelta", "followUpDate", "noteBody", "previousNoteId", "finalizedAt", "createdAt", "updatedAt"],
  ClientTouch: ["id", "clientNameKey", "coach", "channel", "direction", "subject", "body", "sentById", "createdAt", "attachments", "ghlMessageId"],
  ClientProfile: ["id", "nameKey", "name", "email", "phone", "assignedCoach", "createdAt", "updatedAt", "address1", "address2", "city", "state", "zip", "mindbodyId", "firstName", "lastName", "dob", "gender", "isProspect", "mbActive", "allergies", "origin", "outreachStage", "lastTouchAt", "lastTouchType", "lastConnectAt", "attemptCount", "outreachMovedAt", "lastInboundAt", "lastReadAt", "ghlContactId", "leadSource", "inboxPinned", "inboxMuted", "inboxUnread", "inboxStarred", "inboxHidden"],
  Purchase: ["id", "mbSaleId", "clientMindbodyId", "clientNameKey", "saleDate", "location", "coach", "total", "itemCount", "items", "legacy", "createdAt", "orderNo"],
  RoutedOrder: ["id", "mbSaleId", "lineIndex", "clientMindbodyId", "clientNameKey", "site", "coach", "saleDate", "sku", "item", "qty", "vendor", "tag", "mdtoolbox", "pharmacy", "status", "doneAt", "doneBy", "createdAt", "source", "clientName", "dob", "gender", "address1", "address2", "city", "state", "zip", "phone", "email", "allergies", "orderNo", "placedBy", "pickup", "pickupType", "pickupSponsor", "packageDose", "vendorOrderNo", "isReplacement", "replacementReason", "replacesOrderNo", "replacementCharged", "isNutraceutical", "tracking", "carrier", "trackedAt", "trackedBy"],
  ShipmentNotification: ["id", "clientName", "items", "tracking", "carrier", "status", "coachId", "shippedAt", "readAt", "createdAt", "orderKey", "lastActivity", "trackedAt", "estDelivery", "pickup", "coachName", "reason", "clientDob", "phone", "email", "address1", "address2", "city", "state", "zip", "shippingType", "reconstitute", "specialInstructions", "saleId", "orderType", "prescriber", "location", "clientGender", "supplier", "itemsJson", "extras", "medsourceOrderId", "submittedById", "statusHistory", "employeeOrder", "delayed", "delayReason", "delayedAt", "pickupType", "pickupSponsor", "isReplacement", "replacementReason", "replacesOrderNo", "replacementCharged", "orderNo"],
  User: ["id", "name", "email", "passwordHash", "role", "birthday", "phone", "avatarUrl", "createdAt", "gender", "failedLogins", "lockoutUntil", "googleRefreshToken", "gmailConnectedAt", "location", "ghlUserId"],
} as const;

function normalizedName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function canonicalStaffLocation(name: string | null, sourceLocation: string | null): string | null {
  const roster = name
    ? ROSTER.find((entry) => normalizedName(`${entry.firstName}${entry.lastName}`) === normalizedName(name))
    : null;
  if (roster) return roster.location === "AHQ" ? null : roster.location;
  const value = (sourceLocation ?? "").toLowerCase();
  if (value.includes("southern pines")) return "southern-pines";
  if (value.includes("myrtle") || value.includes("carolina forest")) return "myrtle-beach";
  if (value.includes("raleigh")) return "raleigh";
  return null; // "Remote" is not a home clinic and must not become one.
}

function splitLegacyName(displayName: string): { firstName: string; lastName: string } {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || "Unknown", lastName: "Unknown" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1)! };
}

function continuityDomain(table: string): ContinuityInventoryRow["domain"] {
  if (["Appointment", "ProgressNote", "PlanOfCare", "IntakeForm", "IntakeTemplate", "IntakeInvite", "Consent", "MedicalProfile"].includes(table)) return "clinical";
  if (["Purchase", "PackageSubscription", "Invoice", "InvoiceLine", "Payment"].includes(table)) return "commercial";
  if (["InventoryItem", "InventoryEvent", "Lot", "RoutedOrder", "ShipmentNotification", "Vendor", "ReceivingLog"].includes(table)) return "medsource";
  if (["User", "Session", "LoginAttempt", "PasswordResetToken"].includes(table)) return "discard-auth";
  if (["Document", "Product", "Category", "FormularyItem"].includes(table)) return "reference";
  return "operations";
}

async function legacyContinuityInventory(tx: TransactionSql): Promise<ContinuityInventoryRow[]> {
  const tables = await tx<{ entity: string }[]>`
    select table_name as entity
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name
  `;
  const rows: ContinuityInventoryRow[] = [];
  for (const { entity } of tables) {
    // Entity is read from information_schema, then quoted as an identifier.
    const quoted = entity.replaceAll('"', '""');
    const [{ count }] = await tx.unsafe<{ count: number }[]>(`select count(*)::int as count from public."${quoted}"`);
    rows.push({ domain: continuityDomain(entity), entity, count: Number(count) });
  }
  return rows.sort((a, b) => a.domain.localeCompare(b.domain) || a.entity.localeCompare(b.entity));
}

async function unifiedContinuityInventory(tx: TransactionSql): Promise<ContinuityInventoryRow[]> {
  return tx<ContinuityInventoryRow[]>`
    select 'clinical' as domain, 'Encounter' as entity, count(*)::int as count from clinic."Encounter"
    union all select 'clinical', 'Assessment', count(*)::int from clinic."Assessment"
    union all select 'clinical', 'InBodyScan', count(*)::int from clinic."InBodyScan"
    union all select 'clinical', 'PlanOfCare', count(*)::int from clinic."PlanOfCare"
    union all select 'clinical', 'Prescription', count(*)::int from clinic."Prescription"
    union all select 'clinical', 'ContraindicationScreen', count(*)::int from clinic."ContraindicationScreen"
    union all select 'clinical', 'Consent', count(*)::int from clinic."Consent"
    union all select 'clinical', 'LabOrder', count(*)::int from clinic."LabOrder"
    union all select 'clinical', 'LabResult', count(*)::int from clinic."LabResult"
    union all select 'clinical', 'Document', count(*)::int from clinic."Document"
    union all select 'commercial', 'Order', count(*)::int from clinic."Order"
    union all select 'commercial', 'OrderItem', count(*)::int from clinic."OrderItem"
    union all select 'commercial', 'Invoice', count(*)::int from clinic."Invoice"
    union all select 'commercial', 'InvoiceLine', count(*)::int from clinic."InvoiceLine"
    union all select 'commercial', 'Payment', count(*)::int from clinic."Payment"
    union all select 'commercial', 'Subscription', count(*)::int from clinic."Subscription"
    union all select 'operations', 'Notification', count(*)::int from clinic."Notification"
    union all select 'operations', 'Reminder', count(*)::int from clinic."Reminder"
    union all select 'operations', 'AuditLog', count(*)::int from clinic."AuditLog"
    union all select 'operations', 'MarketingContact', count(*)::int from clinic."MarketingContact"
    union all select 'reference', 'FormularyItem', count(*)::int from clinic."FormularyItem"
    union all select 'reference', 'Product', count(*)::int from clinic."Product"
    union all select 'discard-auth', 'Session', count(*)::int from clinic."Session"
    union all select 'medsource', 'MsProduct', count(*)::int from medsource."MsProduct"
    union all select 'medsource', 'Lot', count(*)::int from medsource."Lot"
    union all select 'medsource', 'InventoryEvent', count(*)::int from medsource."InventoryEvent"
    union all select 'medsource', 'QCRecord', count(*)::int from medsource."QCRecord"
    union all select 'medsource', 'Vendor', count(*)::int from medsource."Vendor"
    union all select 'medsource', 'VendorPrice', count(*)::int from medsource."VendorPrice"
    union all select 'medsource', 'Fulfillment', count(*)::int from medsource."Fulfillment"
    union all select 'medsource', 'FulfillmentLine', count(*)::int from medsource."FulfillmentLine"
    order by domain, entity
  `;
}

async function detectSourceShape(tx: TransactionSql): Promise<SourceShape> {
  const [row] = await tx<{ legacy: boolean; unified: boolean }[]>`
    select
      to_regclass('public."ClientProfile"') is not null
        and to_regclass('public."User"') is not null
        and to_regclass('public."Appointment"') is not null as legacy,
      to_regclass('clinic."Person"') is not null
        and to_regclass('clinic."Staff"') is not null
        and to_regclass('clinic."Appointment"') is not null as unified
  `;
  if (row.legacy === row.unified) {
    throw new Error("V1 source shape is ambiguous or unsupported; migration refused");
  }
  return row.legacy ? "legacy-public-2026-07" : "unified-clinic";
}

async function validateLegacyShape(tx: TransactionSql): Promise<string> {
  const rows = await tx<{ table: string; column: string; type: string; position: number }[]>`
    select table_name as table, column_name as column, data_type as type, ordinal_position as position
    from information_schema.columns
    where table_schema = 'public' and table_name in ('Appointment', 'ClientProfile', 'ClientTouch', 'Purchase', 'RoutedOrder', 'ShipmentNotification', 'User')
    order by table_name, ordinal_position
  `;
  for (const [table, expected] of Object.entries(LEGACY_COLUMNS)) {
    const actual = rows.filter((row) => row.table === table).map((row) => row.column);
    if (actual.join("|") !== expected.join("|")) {
      throw new Error(`Alpha ${table} schema changed; source adapter review required before migration`);
    }
  }
  return sha256(rows.map((row) => [row.table, row.position, row.column, row.type]));
}

function canonicalLegacyLocations(): V1LocationRow[] {
  const createdAt = new Date(0);
  return [
    { id: "legacy-location-raleigh", targetLocationId: "raleigh", code: "RAL", name: "Alpha Health — Raleigh", address1: "701 Mutual Ct, Suite 100", city: "Raleigh", state: "NC", zip: "27615", timezone: "America/New_York", active: true, createdAt },
    { id: "legacy-location-southern-pines", targetLocationId: "southern-pines", code: "SOP", name: "Alpha Health — Southern Pines", address1: "1545 US Hwy 1", city: "Southern Pines", state: "NC", zip: null, timezone: "America/New_York", active: true, createdAt },
    { id: "legacy-location-myrtle-beach", targetLocationId: "myrtle-beach", code: "MYR", name: "Alpha Health — Myrtle Beach", address1: "4999 Carolina Forest Blvd, #9", city: "Myrtle Beach", state: "SC", zip: null, timezone: "America/New_York", active: true, createdAt },
  ];
}

async function extractUnified(
  tx: TransactionSql,
  from: Date | null,
  forceFull: boolean,
  nextWatermark: Date,
) {
  const locations = (await tx`
    select id, code, name, address1, city, state, zip, timezone, active, "createdAt"
    from clinic."Location" order by id
  `) as unknown as V1LocationRow[];
  const staff = (await tx`
    select id, name, email, role::text as role, title, npi, active, "locationId", "createdAt"
    from clinic."Staff" order by id
  `) as unknown as V1StaffRow[];
  const people = (forceFull || !from
    ? await tx`
        select id, mrn, "firstName", "lastName", "preferredName", dob, sex::text as sex,
               email, phone, address1, address2, city, state, zip, status::text as status,
               "isProspect", "assignedCoachId", "locationId", "createdAt", "updatedAt"
        from clinic."Person" where "updatedAt" <= ${nextWatermark} order by id
      `
    : await tx`
        select id, mrn, "firstName", "lastName", "preferredName", dob, sex::text as sex,
               email, phone, address1, address2, city, state, zip, status::text as status,
               "isProspect", "assignedCoachId", "locationId", "createdAt", "updatedAt"
        from clinic."Person" where "updatedAt" > ${from} and "updatedAt" <= ${nextWatermark} order by id
      `) as unknown as V1PersonRow[];
  const appointments = (forceFull || !from
    ? await tx`
        select id, "personId", "providerId", "locationId", type::text as type,
               status::text as status, "startAt", "endAt", resource, reason, notes,
               "createdAt", "updatedAt"
        from clinic."Appointment" where "updatedAt" <= ${nextWatermark} order by id
      `
    : await tx`
        select id, "personId", "providerId", "locationId", type::text as type,
               status::text as status, "startAt", "endAt", resource, reason, notes,
               "createdAt", "updatedAt"
        from clinic."Appointment" where "updatedAt" > ${from} and "updatedAt" <= ${nextWatermark} order by id
      `) as unknown as V1AppointmentRow[];
  return {
    extract: {
      locations, staff, people, appointments, consults: [], contacts: [], fulfillmentHistory: [], sales: [], saleLines: [], exceptions: [],
    } satisfies V1Extract,
    diagnostics: {
      staffNameCollisionGroups: 0, unresolvedStaffNameCollisionGroups: 0,
      staffActivationCandidates: 0, inactiveLegacyStaffRows: 0,
      syntheticRosterStaffRows: 0,
      unmatchedAssignedCoaches: 0, ambiguousAssignedCoaches: 0,
      unresolvedHomeLocations: 0, namesParsedFromDisplay: 0,
      invalidDobValues: 0, consultsExcludedMissingClient: 0, consultsExcludedMissingAuthor: 0,
      progressNotesExcludedMissingClient: 0, progressNotesExcludedMissingAuthor: 0,
      progressNotesWithSynthesizedAuthor: 0,
      contactsExcludedMissingClient: 0, contactsWithoutStaffOwner: 0, contactAttachmentsForRehousing: 0,
      routedOrdersExcludedMissingClient: 0, routedOrderClientKeyConflicts: 0,
      routedOrdersMissingSaleLink: 0,
      routedOrdersMissingCoach: 0, shipmentsExcludedLinkage: 0,
      purchasesExcludedMissingClient: 0, purchaseClientKeyConflicts: 0, purchasesMissingCoach: 0,
      purchaseItemCountMismatches: 0, purchaseLineMathMismatches: 0,
    } satisfies ExtractDiagnostics,
    continuityInventory: await unifiedContinuityInventory(tx),
    schemaFingerprint: null,
  };
}

async function extractLegacy(
  tx: TransactionSql,
  from: Date | null,
  forceFull: boolean,
  nextWatermark: Date,
) {
  interface LegacyPerson {
    id: string; displayName: string; firstName: string | null; lastName: string | null;
    email: string | null; phone: string | null; address1: string | null; address2: string | null;
    city: string | null; state: string | null; zip: string | null; mindbodyId: string | null;
    dob: string | null; gender: string | null; isProspect: boolean; mbActive: boolean | null;
    assignedCoach: string | null; assignedCoachId: string | null; assignedCoachName: string | null;
    assignedCoachLocation: string | null; assignedCoachMatches: number; createdAt: Date; updatedAt: Date;
  }
  interface LegacyProgressNote {
    id: string; personId: string; authorId: string | null; authorName: string | null; apptType: string | null;
    procedure: string | null; medications: string | null; allergies: string | null;
    hr: string | null; bp: string | null; weight: string | null; height: string | null;
    temp: string | null; vitalsNote: string | null; narrative: string | null;
    status: string; visitDate: Date | null; completedAt: Date | null;
    createdAt: Date; updatedAt: Date;
  }
  interface LegacyUnlinkedNote {
    id: string; clientId: string | null; coachId: string; subType: string | null;
    status: string; startTime: Date; contactMethod: string | null; noteBody: string;
    previousNoteId: string | null; finalizedAt: Date | null; createdAt: Date; updatedAt: Date;
    missingClient: boolean; missingAuthor: boolean;
  }
  interface LegacyPurchaseItem {
    desc: string; qty: number; returned: boolean; sku: string | null;
    total: number; unitPrice: number;
  }
  interface LegacyPurchase {
    id: string; personId: string; coachId: string | null; coachLabel: string | null;
    clientKeyConflict: boolean; mbSaleId: string;
    orderNo: string | null; saleDate: Date; location: string; locationTargetId: string | null;
    total: number; itemCount: number; items: LegacyPurchaseItem[]; legacy: boolean; createdAt: Date;
  }
  interface LegacyTouch {
    id: string; personId: string; staffId: string | null; coachLabel: string;
    assignedCoachLabel: string | null;
    channel: string; direction: string; subject: string | null; body: string;
    createdAt: Date; attachments: unknown[] | null; ghlMessageId: string | null;
  }
  interface LegacyRoutedOrder {
    id: string; personId: string; saleSourceId: string | null; coachId: string | null;
    coachLabel: string | null; clientKeyConflict: boolean; mbSaleId: string; site: string;
    saleDate: Date; sku: string | null;
    item: string; qty: number; vendor: string; tag: string; mdtoolbox: boolean;
    pharmacy: string; status: string; doneAt: Date | null; doneBy: string | null;
    createdAt: Date; source: string; dob: string | null; gender: string | null;
    address1: string | null; address2: string | null; city: string | null;
    state: string | null; zip: string | null; phone: string | null; email: string | null;
    allergies: string | null; orderNo: string | null; placedBy: string | null; pickup: boolean;
    pickupType: string | null; pickupSponsor: string | null; packageDose: string | null;
    vendorOrderNo: string | null; isReplacement: boolean; replacementReason: string | null;
    replacesOrderNo: string | null; replacementCharged: boolean; isNutraceutical: boolean;
    tracking: string | null; carrier: string | null; trackedAt: Date | null; trackedBy: string | null;
    updatedAt: Date;
  }
  interface LegacyShipment {
    id: string; personId: string; saleSourceId: string; coachId: string | null;
    clientName: string; itemsText: string | null; tracking: string | null; carrier: string;
    status: string; shippedAt: Date; readAt: Date | null; createdAt: Date; orderKey: string | null;
    lastActivity: string | null; trackedAt: Date | null; estDelivery: string | null; pickup: boolean;
    coachName: string | null; reason: string | null; clientDob: string | null; phone: string | null;
    email: string | null; address1: string | null; address2: string | null; city: string | null;
    state: string | null; zip: string | null; shippingType: string | null; reconstitute: boolean;
    specialInstructions: string | null; saleId: string | null; orderType: string | null;
    prescriber: string | null; location: string | null; clientGender: string | null; supplier: string;
    itemsJson: unknown[]; extras: Record<string, unknown>; medsourceOrderId: string | null;
    submittedById: string | null; statusHistory: unknown[]; employeeOrder: boolean; delayed: boolean;
    delayReason: string | null; delayedAt: Date | null; pickupType: string | null;
    pickupSponsor: string | null; isReplacement: boolean; replacementReason: string | null;
    replacesOrderNo: string | null; replacementCharged: boolean; orderNo: string | null;
    updatedAt: Date;
  }
  const schemaFingerprint = await validateLegacyShape(tx);
  const sourceStaff = (await tx`
    select id, name, email, role, null::text as title, null::text as npi, true as active,
           null::text as "locationId", "createdAt",
           case
             when lower(coalesce(location, '')) like '%southern pines%' then 'southern-pines'
             when lower(coalesce(location, '')) like '%myrtle%' then 'myrtle-beach'
             when lower(coalesce(location, '')) like '%raleigh%' then 'raleigh'
             else null
           end as "locationTargetId"
    from public."User" order by id
  `) as unknown as V1StaffRow[];
  const staffNameCollisions = await tx<{ normalizedName: string; officialDomainUsers: number }[]>`
    select regexp_replace(lower(name), '[^a-z0-9]', '', 'g') as "normalizedName",
           count(*) filter (where lower(trim(email)) like '%@goalphahealth.com')::int as "officialDomainUsers"
    from public."User"
    where regexp_replace(lower(name), '[^a-z0-9]', '', 'g') <> ''
    group by regexp_replace(lower(name), '[^a-z0-9]', '', 'g')
    having count(*) > 1
  `;
  const approvedRosterNames = new Set(ROSTER.map((entry) => normalizedName(`${entry.firstName}${entry.lastName}`)));
  if (staffNameCollisions.some((group) => !approvedRosterNames.has(group.normalizedName))) {
    throw new Error("Alpha contains a duplicate staff name outside the approved roster; identity review required");
  }
  const staffNameCollisionGroups = staffNameCollisions.length;
  const unresolvedStaffNameCollisionGroups = staffNameCollisions.filter((group) => group.officialDomainUsers !== 1).length;
  const officialUsersByName = new Map<string, number>();
  for (const row of sourceStaff) {
    if (!row.email.trim().toLowerCase().endsWith("@goalphahealth.com")) continue;
    const name = normalizedName(row.name);
    officialUsersByName.set(name, (officialUsersByName.get(name) ?? 0) + 1);
  }
  // Alpha's local User table is historical identity evidence, not Apex access
  // approval. An approved-roster name with exactly one current corporate email
  // is only an activation candidate; every imported user remains inactive until
  // an Entra object id and role are explicitly approved in Apex.
  let staffActivationCandidates = 0;
  for (const row of sourceStaff) {
    const name = normalizedName(row.name);
    const activationCandidate = approvedRosterNames.has(name)
      && row.email.trim().toLowerCase().endsWith("@goalphahealth.com")
      && officialUsersByName.get(name) === 1;
    if (activationCandidate) staffActivationCandidates++;
    row.active = false;
  }
  const inactiveLegacyStaffRows = sourceStaff.length;
  const sourceUsersByName = new Map<string, V1StaffRow[]>();
  for (const row of sourceStaff) {
    const name = normalizedName(row.name);
    sourceUsersByName.set(name, [...(sourceUsersByName.get(name) ?? []), row]);
  }
  const canonicalStaffByName = new Map<string, string>();
  let syntheticRosterStaffRows = 0;
  for (const roster of ROSTER) {
    const displayName = `${roster.firstName} ${roster.lastName}`;
    const name = normalizedName(displayName);
    const candidates = sourceUsersByName.get(name) ?? [];
    const official = candidates.filter((row) => row.email.trim().toLowerCase().endsWith("@goalphahealth.com"));
    const canonical = official.length === 1 ? official[0] : candidates.length === 1 ? candidates[0] : null;
    if (canonical) {
      canonicalStaffByName.set(name, canonical.id);
      continue;
    }
    const id = `Roster:${name}`;
    canonicalStaffByName.set(name, id);
    syntheticRosterStaffRows++;
    sourceStaff.push({
      id,
      name: displayName,
      email: `legacy-roster-${sha256(name).slice(0, 16)}@migration.invalid`,
      role: roster.credentialClass === "Coach" ? "COACH" : roster.department === "Medical" ? "MEDICAL" : "ADMIN",
      title: roster.notes,
      npi: null,
      active: false,
      locationId: null,
      locationTargetId: roster.location === "AHQ" ? null : roster.location,
      createdAt: new Date(0),
    });
  }
  for (const [name, candidates] of sourceUsersByName) {
    if (canonicalStaffByName.has(name)) continue;
    if (candidates.length === 1) canonicalStaffByName.set(name, candidates[0].id);
  }
  const rawPeople = (forceFull || !from
    ? await tx`
        select c.id, c.name as "displayName", c."firstName", c."lastName", c.email, c.phone,
               c.address1, c.address2, c.city, c.state, c.zip, c."mindbodyId", c.dob, c.gender,
               c."isProspect", c."mbActive", c."assignedCoach", coach.id as "assignedCoachId",
               coach.name as "assignedCoachName", coach.location as "assignedCoachLocation",
               coach.matches as "assignedCoachMatches",
               c."createdAt", c."updatedAt"
        from public."ClientProfile" c
        left join lateral (
          select case
                   when count(*) = 1 then min(u.id)
                   when count(*) filter (where lower(trim(u.email)) like '%@goalphahealth.com') = 1
                     then min(u.id) filter (where lower(trim(u.email)) like '%@goalphahealth.com')
                 end as id,
                 case
                   when count(*) = 1 then min(u.name)
                   when count(*) filter (where lower(trim(u.email)) like '%@goalphahealth.com') = 1
                     then min(u.name) filter (where lower(trim(u.email)) like '%@goalphahealth.com')
                 end as name,
                 case
                   when count(*) = 1 then min(u.location)
                   when count(*) filter (where lower(trim(u.email)) like '%@goalphahealth.com') = 1
                     then min(u.location) filter (where lower(trim(u.email)) like '%@goalphahealth.com')
                 end as location,
                 count(*)::int as matches
          from public."User" u
          where regexp_replace(lower(u.name), '[^a-z0-9]', '', 'g') =
                regexp_replace(lower(coalesce(c."assignedCoach", '')), '[^a-z0-9]', '', 'g')
            and trim(coalesce(c."assignedCoach", '')) <> ''
        ) coach on true
        where c."updatedAt" <= ${nextWatermark} order by c.id
      `
    : await tx`
        select c.id, c.name as "displayName", c."firstName", c."lastName", c.email, c.phone,
               c.address1, c.address2, c.city, c.state, c.zip, c."mindbodyId", c.dob, c.gender,
               c."isProspect", c."mbActive", c."assignedCoach", coach.id as "assignedCoachId",
               coach.name as "assignedCoachName", coach.location as "assignedCoachLocation",
               coach.matches as "assignedCoachMatches",
               c."createdAt", c."updatedAt"
        from public."ClientProfile" c
        left join lateral (
          select case
                   when count(*) = 1 then min(u.id)
                   when count(*) filter (where lower(trim(u.email)) like '%@goalphahealth.com') = 1
                     then min(u.id) filter (where lower(trim(u.email)) like '%@goalphahealth.com')
                 end as id,
                 case
                   when count(*) = 1 then min(u.name)
                   when count(*) filter (where lower(trim(u.email)) like '%@goalphahealth.com') = 1
                     then min(u.name) filter (where lower(trim(u.email)) like '%@goalphahealth.com')
                 end as name,
                 case
                   when count(*) = 1 then min(u.location)
                   when count(*) filter (where lower(trim(u.email)) like '%@goalphahealth.com') = 1
                     then min(u.location) filter (where lower(trim(u.email)) like '%@goalphahealth.com')
                 end as location,
                 count(*)::int as matches
          from public."User" u
          where regexp_replace(lower(u.name), '[^a-z0-9]', '', 'g') =
                regexp_replace(lower(coalesce(c."assignedCoach", '')), '[^a-z0-9]', '', 'g')
            and trim(coalesce(c."assignedCoach", '')) <> ''
        ) coach on true
        where c."updatedAt" > ${from} and c."updatedAt" <= ${nextWatermark} order by c.id
      `) as unknown as LegacyPerson[];
  let namesParsedFromDisplay = 0;
  let unmatchedAssignedCoaches = 0;
  let ambiguousAssignedCoaches = 0;
  let unresolvedHomeLocations = 0;
  let invalidDobValues = 0;
  const exceptions: V1MigrationExceptionRow[] = [];
  const people: V1PersonRow[] = rawPeople.map((row) => {
    const assignedCoachId = row.assignedCoachId
      ?? (row.assignedCoach ? canonicalStaffByName.get(normalizedName(row.assignedCoach)) ?? null : null);
    const parsed = splitLegacyName(row.displayName);
    if (!row.firstName?.trim() || !row.lastName?.trim()) {
      namesParsedFromDisplay++;
      exceptions.push({
        id: `ClientProfile:${row.id}:inferred-name`,
        sourceEntityType: "ClientProfile",
        reasonCode: "name-parsed-from-display",
        payload: {
          displayName: row.displayName,
          sourceFirstName: row.firstName,
          sourceLastName: row.lastName,
          proposedFirstName: row.firstName?.trim() || parsed.firstName,
          proposedLastName: row.lastName?.trim() || parsed.lastName,
        },
        sourceUpdatedAt: row.updatedAt,
      });
    }
    if (row.assignedCoach && !assignedCoachId) {
      if (row.assignedCoachMatches > 1) ambiguousAssignedCoaches++;
      else unmatchedAssignedCoaches++;
      exceptions.push({
        id: `ClientProfile:${row.id}:assigned-coach`,
        sourceEntityType: "ClientProfile",
        reasonCode: row.assignedCoachMatches > 1 ? "assigned-coach-ambiguous" : "assigned-coach-unmatched",
        payload: { assignedCoach: row.assignedCoach },
        sourceUpdatedAt: row.updatedAt,
      });
    }
    const locationTargetId = canonicalStaffLocation(row.assignedCoachName ?? row.assignedCoach, row.assignedCoachLocation);
    if (assignedCoachId && !locationTargetId) {
      unresolvedHomeLocations++;
      exceptions.push({
        id: `ClientProfile:${row.id}:home-location`,
        sourceEntityType: "ClientProfile",
        reasonCode: "home-location-unresolved",
        payload: {
          assignedCoachId,
          assignedCoachLocation: row.assignedCoachLocation,
        },
        sourceUpdatedAt: row.updatedAt,
      });
    }
    if (row.dob && !/^\d{4}-\d{2}-\d{2}/.test(row.dob) && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(row.dob)) {
      invalidDobValues++;
      exceptions.push({
        id: `ClientProfile:${row.id}:dob`,
        sourceEntityType: "ClientProfile",
        reasonCode: "date-of-birth-invalid",
        payload: { sourceValue: row.dob },
        sourceUpdatedAt: row.updatedAt,
      });
    }
    return {
      id: row.id, mrn: row.mindbodyId ?? "", firstName: row.firstName?.trim() || parsed.firstName,
      lastName: row.lastName?.trim() || parsed.lastName, preferredName: null, dob: row.dob,
      sex: row.gender ?? "unknown", email: row.email, phone: row.phone, address1: row.address1,
      address2: row.address2, city: row.city, state: row.state, zip: row.zip,
      status: row.mbActive === false ? "inactive" : "active", isProspect: row.isProspect,
      assignedCoachId, locationId: null, locationTargetId,
      createdAt: row.createdAt, updatedAt: row.updatedAt,
    };
  });
  // ClientTouch also has no updatedAt. Every run rescans the bounded ledger so
  // immutable source checksums catch edits to an older GHL communication.
  const rawTouches = (await tx`
    select 'ClientTouch:' || t.id as id, c.id as "personId",
           case when t.direction = 'outbound' then sender.id
                else coalesce(touch_coach.id, assigned_coach.id) end as "staffId",
           t.coach as "coachLabel", c."assignedCoach" as "assignedCoachLabel",
           t.channel, t.direction, t.subject, t.body,
           t."createdAt", t.attachments, t."ghlMessageId"
    from public."ClientTouch" t
    join public."ClientProfile" c on c."nameKey" = t."clientNameKey"
    left join public."User" sender on sender.id = t."sentById"
    left join lateral (
      select case
               when count(*) = 1 then min(u.id)
               when count(*) filter (where lower(trim(u.email)) like '%@goalphahealth.com') = 1
                 then min(u.id) filter (where lower(trim(u.email)) like '%@goalphahealth.com')
             end as id
      from public."User" u
      where regexp_replace(lower(u.name), '[^a-z0-9]', '', 'g') =
            regexp_replace(lower(t.coach), '[^a-z0-9]', '', 'g')
        and trim(coalesce(t.coach, '')) <> ''
    ) touch_coach on true
    left join lateral (
      select case
               when count(*) = 1 then min(u.id)
               when count(*) filter (where lower(trim(u.email)) like '%@goalphahealth.com') = 1
                 then min(u.id) filter (where lower(trim(u.email)) like '%@goalphahealth.com')
             end as id
      from public."User" u
      where regexp_replace(lower(u.name), '[^a-z0-9]', '', 'g') =
            regexp_replace(lower(coalesce(c."assignedCoach", '')), '[^a-z0-9]', '', 'g')
        and trim(coalesce(c."assignedCoach", '')) <> ''
    ) assigned_coach on true
    where t."createdAt" <= ${nextWatermark} order by t.id
  `) as unknown as LegacyTouch[];
  let contactsWithoutStaffOwner = 0;
  let contactAttachmentsForRehousing = 0;
  const contacts: V1ContactEntryRow[] = rawTouches.map((row) => {
    const staffId = row.staffId ?? (row.direction === "inbound"
      ? canonicalStaffByName.get(normalizedName(row.coachLabel ?? ""))
        ?? canonicalStaffByName.get(normalizedName(row.assignedCoachLabel ?? ""))
        ?? null
      : null);
    if (row.direction !== "inbound" && row.direction !== "outbound") {
      throw new Error("Alpha ClientTouch direction is not recognized; migration refused");
    }
    if (!staffId) {
      contactsWithoutStaffOwner++;
      exceptions.push({
        id: `${row.id}:staff-owner`, sourceEntityType: "ClientTouch",
        reasonCode: "staff-owner-unresolved", payload: { coachLabel: row.coachLabel },
        sourceUpdatedAt: row.createdAt,
      });
    }
    const hasAttachments = Array.isArray(row.attachments) && row.attachments.length > 0;
    if (hasAttachments) {
      contactAttachmentsForRehousing++;
      exceptions.push({
        id: `${row.id}:attachments`, sourceEntityType: "ClientTouch",
        reasonCode: "attachment-rehousing-required",
        payload: { attachments: row.attachments, externalId: row.ghlMessageId },
        sourceUpdatedAt: row.createdAt,
      });
    }
    return {
      id: row.id, personId: row.personId, staffId, at: row.createdAt,
      channel: row.channel, direction: row.direction, subject: row.subject, body: row.body,
      hasAttachments, externalId: row.ghlMessageId,
    };
  });
  const unresolvedTouches = (await tx`
    select 'ClientTouch:' || t.id as id, t."clientNameKey", t.coach, t.channel,
           t.direction, t.subject, t.body, t."sentById", t."createdAt", t.attachments,
           t."ghlMessageId"
    from public."ClientTouch" t
    left join public."ClientProfile" c on c."nameKey" = t."clientNameKey"
    where c.id is null and t."createdAt" <= ${nextWatermark} order by t.id
  `) as unknown as Array<Record<string, unknown> & { id: string; createdAt: Date }>;
  for (const row of unresolvedTouches) {
    const { id, createdAt, ...payload } = row;
    exceptions.push({
      id: `${id}:missing-client`, sourceEntityType: "ClientTouch",
      reasonCode: "missing-client", payload, sourceUpdatedAt: createdAt,
    });
  }
  // Purchase has no updatedAt. Rescan the full bounded ledger on every run so
  // a correction to an older source row is detected by the immutable binding
  // checksum instead of falling outside a createdAt-only delta.
  const rawPurchases = (await tx`
    select 'Purchase:' || p.id as id, person.id as "personId", coach.id as "coachId",
           p.coach as "coachLabel", person."clientKeyConflict",
           p."mbSaleId", p."orderNo", p."saleDate", p.location,
           case when upper(trim(p.location)) = 'SC' then 'myrtle-beach' else null end as "locationTargetId",
           p.total, p."itemCount", p.items, p.legacy, p."createdAt"
    from public."Purchase" p
    join lateral (
      select case
               when mb.matches = 1 then mb.id
               when mb.matches = 0 and nk.matches = 1 then nk.id
             end as id,
             (mb.matches = 1 and nk.matches = 1 and mb.id is distinct from nk.id) as "clientKeyConflict"
      from lateral (
        select count(*)::int as matches, min(c.id) as id
        from public."ClientProfile" c
        where p."clientMindbodyId" is not null and c."mindbodyId" = p."clientMindbodyId"
      ) mb
      cross join lateral (
        select count(*)::int as matches, min(c.id) as id
        from public."ClientProfile" c
        where p."clientNameKey" is not null and c."nameKey" = p."clientNameKey"
      ) nk
    ) person on person.id is not null
    left join lateral (
      select case
               when count(*) = 1 then min(u.id)
               when count(*) filter (where lower(trim(u.email)) like '%@goalphahealth.com') = 1
                 then min(u.id) filter (where lower(trim(u.email)) like '%@goalphahealth.com')
             end as id
      from public."User" u
      where regexp_replace(lower(u.name), '[^a-z0-9]', '', 'g') =
            regexp_replace(lower(coalesce(p.coach, '')), '[^a-z0-9]', '', 'g')
        and trim(coalesce(p.coach, '')) <> ''
    ) coach on true
    where p."createdAt" <= ${nextWatermark} order by p.id
  `) as unknown as LegacyPurchase[];
  const sales: V1SaleRow[] = [];
  const saleLines: V1SaleLineRow[] = [];
  let purchaseClientKeyConflicts = 0;
  let purchasesMissingCoach = 0;
  let purchaseItemCountMismatches = 0;
  let purchaseLineMathMismatches = 0;
  for (const row of rawPurchases) {
    const coachId = row.coachId
      ?? (row.coachLabel ? canonicalStaffByName.get(normalizedName(row.coachLabel)) ?? null : null);
    if (row.clientKeyConflict) {
      purchaseClientKeyConflicts++;
      exceptions.push({
        id: `${row.id}:client-key-conflict`, sourceEntityType: "Purchase",
        reasonCode: "client-key-conflict-mindbody-preferred",
        payload: { resolution: "unique-mindbody-id-preferred-over-conflicting-name-key" },
        sourceUpdatedAt: row.createdAt,
      });
    }
    if (row.coachLabel && !coachId) {
      purchasesMissingCoach++;
      exceptions.push({
        id: `${row.id}:coach-link`, sourceEntityType: "Purchase",
        reasonCode: "coach-link-unresolved-or-ambiguous", payload: { coachLabel: row.coachLabel },
        sourceUpdatedAt: row.createdAt,
      });
    }
    const sourceLineTotalCents = row.items.reduce((sum, item) => sum + exactCents(item.total), 0);
    if (sourceLineTotalCents !== exactCents(row.total)) {
      throw new Error("Alpha Purchase total does not equal its retained source lines; migration refused");
    }
    if (row.itemCount !== row.items.length) {
      purchaseItemCountMismatches++;
      exceptions.push({
        id: `${row.id}:item-count`,
        sourceEntityType: "Purchase",
        reasonCode: "item-count-mismatch",
        payload: { sourceItemCount: row.itemCount, actualItemCount: row.items.length },
        sourceUpdatedAt: row.createdAt,
      });
    }
    sales.push({
      id: row.id, personId: row.personId, externalRef: row.mbSaleId,
      orderNumber: row.orderNo, occurredAt: row.saleDate, locationLabel: row.location,
      locationTargetId: row.locationTargetId, coachId, total: row.total,
      sourceItemCount: row.itemCount, actualItemCount: row.items.length,
      legacy: row.legacy, createdAt: row.createdAt,
    });
    row.items.forEach((item, lineIndex) => {
      if (Math.abs(Number(item.total) - Number(item.qty) * Number(item.unitPrice)) > 0.009) {
        purchaseLineMathMismatches++;
      }
      saleLines.push({
        id: `${row.id}:line:${lineIndex}`, saleId: row.id, lineIndex,
        sku: item.sku, description: item.desc, quantity: item.qty,
        unitPrice: item.unitPrice, total: item.total, returned: item.returned,
      });
    });
  }
  const unresolvedPurchases = (await tx`
    select 'Purchase:' || p.id as id, p."clientMindbodyId", p."clientNameKey", p."mbSaleId",
           p."orderNo", p."saleDate", p.location, p.coach, p.total, p."itemCount", p.items,
           p.legacy, p."createdAt"
    from public."Purchase" p
    left join lateral (
      select case
               when mb.matches = 1 then mb.id
               when mb.matches = 0 and nk.matches = 1 then nk.id
             end as id
      from lateral (
        select count(*)::int as matches, min(c.id) as id
        from public."ClientProfile" c
        where p."clientMindbodyId" is not null and c."mindbodyId" = p."clientMindbodyId"
      ) mb
      cross join lateral (
        select count(*)::int as matches, min(c.id) as id
        from public."ClientProfile" c
        where p."clientNameKey" is not null and c."nameKey" = p."clientNameKey"
      ) nk
    ) person on true
    where person.id is null and p."createdAt" <= ${nextWatermark} order by p.id
  `) as unknown as Array<Record<string, unknown> & { id: string; createdAt: Date }>;
  for (const row of unresolvedPurchases) {
    const { id, createdAt, ...payload } = row;
    exceptions.push({
      id: `${id}:missing-client`, sourceEntityType: "Purchase",
      reasonCode: "missing-client", payload, sourceUpdatedAt: createdAt,
    });
  }
  // RoutedOrder and ShipmentNotification contain historical operational facts,
  // not the evidence required to advance a new Apex fulfillment order. Rescan
  // both tables fully (neither has updatedAt) into the separate immutable
  // history ledger; ambiguous patient/order linkage remains private review.
  const rawRoutedOrders = (await tx`
    select 'RoutedOrder:' || r.id as id, person.id as "personId",
           sale."saleSourceId", coach.id as "coachId", r.coach as "coachLabel",
           person."clientKeyConflict",
           r."mbSaleId", r.site, r."saleDate", r.sku, r.item, r.qty, r.vendor,
           r.tag, r.mdtoolbox, r.pharmacy, r.status, r."doneAt", r."doneBy",
           r."createdAt", r.source, r.dob, r.gender, r.address1, r.address2,
           r.city, r.state, r.zip, r.phone, r.email, r.allergies, r."orderNo",
           r."placedBy", r.pickup, r."pickupType", r."pickupSponsor", r."packageDose",
           r."vendorOrderNo", r."isReplacement", r."replacementReason",
           r."replacesOrderNo", r."replacementCharged", r."isNutraceutical",
           r.tracking, r.carrier, r."trackedAt", r."trackedBy",
           greatest(r."createdAt", r."saleDate", r."doneAt", r."trackedAt") as "updatedAt"
    from public."RoutedOrder" r
    join lateral (
      select case
               when mb.matches = 1 then mb.id
               when mb.matches = 0 and nk.matches = 1 then nk.id
             end as id,
             (mb.matches = 1 and nk.matches = 1 and mb.id is distinct from nk.id) as "clientKeyConflict"
      from lateral (
        select count(*)::int as matches, min(c.id) as id
        from public."ClientProfile" c
        where r."clientMindbodyId" is not null and c."mindbodyId" = r."clientMindbodyId"
      ) mb
      cross join lateral (
        select count(*)::int as matches, min(c.id) as id
        from public."ClientProfile" c
        where r."clientNameKey" is not null and c."nameKey" = r."clientNameKey"
      ) nk
    ) person on person.id is not null
    left join lateral (
      select case when count(*) = 1 then 'Purchase:' || min(p.id) end as "saleSourceId"
      from public."Purchase" p where p."orderNo" = r."orderNo" and r."orderNo" is not null
    ) sale on true
    left join lateral (
      select case
               when count(*) = 1 then min(u.id)
               when count(*) filter (where lower(trim(u.email)) like '%@goalphahealth.com') = 1
                 then min(u.id) filter (where lower(trim(u.email)) like '%@goalphahealth.com')
             end as id
      from public."User" u
      where regexp_replace(lower(u.name), '[^a-z0-9]', '', 'g') =
            regexp_replace(lower(coalesce(r.coach, '')), '[^a-z0-9]', '', 'g')
        and trim(coalesce(r.coach, '')) <> ''
    ) coach on true
    where r."createdAt" <= ${nextWatermark} order by r.id
  `) as unknown as LegacyRoutedOrder[];
  let routedOrderClientKeyConflicts = 0;
  let routedOrdersMissingSaleLink = 0;
  let routedOrdersMissingCoach = 0;
  const fulfillmentHistory: V1HistoricalFulfillmentRow[] = rawRoutedOrders.map((row) => {
    const coachId = row.coachId
      ?? (row.coachLabel ? canonicalStaffByName.get(normalizedName(row.coachLabel)) ?? null : null);
    if (row.clientKeyConflict) {
      routedOrderClientKeyConflicts++;
      exceptions.push({
        id: `${row.id}:client-key-conflict`, sourceEntityType: "RoutedOrder",
        reasonCode: "client-key-conflict-mindbody-preferred",
        payload: { resolution: "unique-mindbody-id-preferred-over-conflicting-name-key" },
        sourceUpdatedAt: row.updatedAt,
      });
    }
    if (!row.saleSourceId) {
      routedOrdersMissingSaleLink++;
      exceptions.push({
        id: `${row.id}:sale-link`, sourceEntityType: "RoutedOrder",
        reasonCode: "sale-link-unresolved",
        payload: { orderNumber: row.orderNo, externalSaleRef: row.mbSaleId },
        sourceUpdatedAt: row.updatedAt,
      });
    }
    if (row.coachLabel && !coachId) {
      routedOrdersMissingCoach++;
      exceptions.push({
        id: `${row.id}:coach-link`, sourceEntityType: "RoutedOrder",
        reasonCode: "coach-link-unresolved", payload: { coachLabel: row.coachLabel },
        sourceUpdatedAt: row.updatedAt,
      });
    }
    return {
      id: row.id, sourceEntityType: "RoutedOrder", recordKind: "routed-line",
      personId: row.personId, saleSourceId: row.saleSourceId, orderNumber: row.orderNo,
      externalOrderRef: row.vendorOrderNo, partner: row.vendor, status: row.status,
      sourceChannel: `${row.tag}:${row.source}`, locationTargetId: canonicalStaffLocation(null, row.site),
      sourceLocationLabel: row.site, coachId, occurredAt: row.saleDate,
      completedAt: row.doneAt, sku: row.sku, itemName: row.item, quantity: row.qty,
      items: null, pickup: row.pickup, shippingType: row.pickupType,
      tracking: row.tracking, carrier: row.carrier, estDelivery: null,
      delayed: false, delayReason: null, statusHistory: null,
      destinationSnapshot: {
        address1: row.address1, address2: row.address2, city: row.city, state: row.state,
        zip: row.zip, phone: row.phone, email: row.email,
      },
      routingSnapshot: {
        pharmacy: row.pharmacy, mdtoolbox: row.mdtoolbox, placedBy: row.placedBy,
        doneBy: row.doneBy, trackedBy: row.trackedBy, allergies: row.allergies,
        dob: row.dob, gender: row.gender, pickupSponsor: row.pickupSponsor,
        packageDose: row.packageDose, isReplacement: row.isReplacement,
        replacementReason: row.replacementReason, replacesOrderNo: row.replacesOrderNo,
        replacementCharged: row.replacementCharged, isNutraceutical: row.isNutraceutical,
      },
      updatedAt: row.updatedAt, createdAt: row.createdAt,
    };
  });
  const unresolvedRoutedOrders = (await tx`
    select 'RoutedOrder:' || r.id as id, to_jsonb(r) - 'id' as payload,
           greatest(r."createdAt", r."saleDate", r."doneAt", r."trackedAt") as "updatedAt"
    from public."RoutedOrder" r
    left join lateral (
      select case
               when mb.matches = 1 then mb.id
               when mb.matches = 0 and nk.matches = 1 then nk.id
             end as id
      from lateral (
        select count(*)::int as matches, min(c.id) as id
        from public."ClientProfile" c
        where r."clientMindbodyId" is not null and c."mindbodyId" = r."clientMindbodyId"
      ) mb
      cross join lateral (
        select count(*)::int as matches, min(c.id) as id
        from public."ClientProfile" c
        where r."clientNameKey" is not null and c."nameKey" = r."clientNameKey"
      ) nk
    ) person on true
    where person.id is null and r."createdAt" <= ${nextWatermark} order by r.id
  `) as unknown as Array<{ id: string; payload: Record<string, unknown>; updatedAt: Date }>;
  for (const row of unresolvedRoutedOrders) {
    exceptions.push({
      id: `${row.id}:missing-client`, sourceEntityType: "RoutedOrder",
      reasonCode: "client-link-not-unique", payload: row.payload, sourceUpdatedAt: row.updatedAt,
    });
  }
  const rawShipments = (await tx`
    select 'ShipmentNotification:' || s.id as id, link."personId", link."saleSourceId",
           coach.id as "coachId", s."clientName", s.items as "itemsText", s.tracking,
           s.carrier, s.status, s."shippedAt", s."readAt", s."createdAt", s."orderKey",
           s."lastActivity", s."trackedAt", s."estDelivery", s.pickup, s."coachName",
           s.reason, s."clientDob", s.phone, s.email, s.address1, s.address2, s.city,
           s.state, s.zip, s."shippingType", s.reconstitute, s."specialInstructions",
           s."saleId", s."orderType", s.prescriber, s.location, s."clientGender",
           s.supplier, s."itemsJson", s.extras, s."medsourceOrderId", s."submittedById",
           s."statusHistory", s."employeeOrder", s.delayed, s."delayReason", s."delayedAt",
           s."pickupType", s."pickupSponsor", s."isReplacement", s."replacementReason",
           s."replacesOrderNo", s."replacementCharged", s."orderNo",
           greatest(s."createdAt", s."shippedAt", s."readAt", s."trackedAt", s."delayedAt") as "updatedAt"
    from public."ShipmentNotification" s
    join lateral (
      select min(resolved."personId") as "personId", 'Purchase:' || min(resolved.id) as "saleSourceId"
      from (
        select p.id, person.id as "personId"
        from public."Purchase" p
        join lateral (
          select case
                   when mb.matches = 1 then mb.id
                   when mb.matches = 0 and nk.matches = 1 then nk.id
                 end as id
          from lateral (
            select count(*)::int as matches, min(c.id) as id
            from public."ClientProfile" c
            where p."clientMindbodyId" is not null and c."mindbodyId" = p."clientMindbodyId"
          ) mb
          cross join lateral (
            select count(*)::int as matches, min(c.id) as id
            from public."ClientProfile" c
            where p."clientNameKey" is not null and c."nameKey" = p."clientNameKey"
          ) nk
        ) person on person.id is not null
        where p."orderNo" = s."orderNo" and s."orderNo" is not null
      ) resolved
      having count(distinct resolved.id) = 1 and count(distinct resolved."personId") = 1
    ) link on true
    left join lateral (
      select case
               when direct.matches = 1 then direct.id
               when direct.matches = 0 and named.id is not null then named.id
             end as id
      from lateral (
        select count(*)::int as matches,
               case
                 when count(*) = 1 then min(u.id)
                 when count(*) filter (where lower(trim(u.email)) like '%@goalphahealth.com') = 1
                   then min(u.id) filter (where lower(trim(u.email)) like '%@goalphahealth.com')
               end as id
        from public."User" u where s."coachId" is not null and u.id = s."coachId"
      ) direct
      cross join lateral (
        select count(*)::int as matches,
               case
                 when count(*) = 1 then min(u.id)
                 when count(*) filter (where lower(trim(u.email)) like '%@goalphahealth.com') = 1
                   then min(u.id) filter (where lower(trim(u.email)) like '%@goalphahealth.com')
               end as id
        from public."User" u
        where regexp_replace(lower(u.name), '[^a-z0-9]', '', 'g') =
              regexp_replace(lower(coalesce(s."coachName", '')), '[^a-z0-9]', '', 'g')
          and trim(coalesce(s."coachName", '')) <> ''
      ) named
    ) coach on true
    where s."createdAt" <= ${nextWatermark} order by s.id
  `) as unknown as LegacyShipment[];
  rawShipments.forEach((row) => {
    const coachId = row.coachId
      ?? (row.coachName ? canonicalStaffByName.get(normalizedName(row.coachName)) ?? null : null);
    fulfillmentHistory.push({
      id: row.id, sourceEntityType: "ShipmentNotification", recordKind: "shipment",
      personId: row.personId, saleSourceId: row.saleSourceId, orderNumber: row.orderNo,
      externalOrderRef: row.medsourceOrderId ?? row.orderKey, partner: row.supplier,
      status: row.status, sourceChannel: "shipment-notification",
      locationTargetId: canonicalStaffLocation(null, row.location),
      sourceLocationLabel: row.location, coachId, occurredAt: row.shippedAt,
      completedAt: null, sku: null, itemName: row.itemsText, quantity: null,
      items: row.itemsJson, pickup: row.pickup, shippingType: row.shippingType,
      tracking: row.tracking, carrier: row.carrier, estDelivery: row.estDelivery,
      delayed: row.delayed, delayReason: row.delayReason, statusHistory: row.statusHistory,
      destinationSnapshot: {
        address1: row.address1, address2: row.address2, city: row.city, state: row.state,
        zip: row.zip, phone: row.phone, email: row.email,
      },
      routingSnapshot: {
        clientName: row.clientName, clientDob: row.clientDob, clientGender: row.clientGender,
        lastActivity: row.lastActivity, reason: row.reason, reconstitute: row.reconstitute,
        specialInstructions: row.specialInstructions, sourceSaleId: row.saleId,
        orderType: row.orderType, prescriber: row.prescriber, extras: row.extras,
        submittedById: row.submittedById, employeeOrder: row.employeeOrder,
        delayedAt: row.delayedAt, pickupType: row.pickupType, pickupSponsor: row.pickupSponsor,
        isReplacement: row.isReplacement, replacementReason: row.replacementReason,
        replacesOrderNo: row.replacesOrderNo, replacementCharged: row.replacementCharged,
      },
      updatedAt: row.updatedAt, createdAt: row.createdAt,
    });
  });
  const unresolvedShipments = (await tx`
    select 'ShipmentNotification:' || s.id as id, to_jsonb(s) - 'id' as payload,
           greatest(s."createdAt", s."shippedAt", s."readAt", s."trackedAt", s."delayedAt") as "updatedAt"
    from public."ShipmentNotification" s
    left join lateral (
      select count(distinct resolved.id)::int as purchases,
             count(distinct resolved."personId")::int as clients
      from (
        select p.id, person.id as "personId"
        from public."Purchase" p
        join lateral (
          select case
                   when mb.matches = 1 then mb.id
                   when mb.matches = 0 and nk.matches = 1 then nk.id
                 end as id
          from lateral (
            select count(*)::int as matches, min(c.id) as id
            from public."ClientProfile" c
            where p."clientMindbodyId" is not null and c."mindbodyId" = p."clientMindbodyId"
          ) mb
          cross join lateral (
            select count(*)::int as matches, min(c.id) as id
            from public."ClientProfile" c
            where p."clientNameKey" is not null and c."nameKey" = p."clientNameKey"
          ) nk
        ) person on person.id is not null
        where p."orderNo" = s."orderNo" and s."orderNo" is not null
      ) resolved
    ) link on true
    where (link.purchases <> 1 or link.clients <> 1)
      and s."createdAt" <= ${nextWatermark} order by s.id
  `) as unknown as Array<{ id: string; payload: Record<string, unknown>; updatedAt: Date }>;
  for (const row of unresolvedShipments) {
    exceptions.push({
      id: `${row.id}:linkage`, sourceEntityType: "ShipmentNotification",
      reasonCode: "client-or-sale-link-not-unique", payload: row.payload, sourceUpdatedAt: row.updatedAt,
    });
  }
  const coachConsults = (forceFull || !from
    ? await tx`
        select 'Appointment:' || a.id as id, a."clientId" as "personId", a."coachId" as "authorId",
               a."subType"::text as kind, a."contactMethod"::text as channel,
               a.status::text as status, a."startTime" as "startedAt", a."finalizedAt",
               a."noteBody",
               case when a."previousNoteId" is null then null else 'Appointment:' || a."previousNoteId" end as "previousNoteId",
               a."createdAt", a."updatedAt"
        from public."Appointment" a
        join public."ClientProfile" c on c.id = a."clientId"
        join public."User" u on u.id = a."coachId"
        where a."updatedAt" <= ${nextWatermark} order by a.id
      `
    : await tx`
        select 'Appointment:' || a.id as id, a."clientId" as "personId", a."coachId" as "authorId",
               a."subType"::text as kind, a."contactMethod"::text as channel,
               a.status::text as status, a."startTime" as "startedAt", a."finalizedAt",
               a."noteBody",
               case when a."previousNoteId" is null then null else 'Appointment:' || a."previousNoteId" end as "previousNoteId",
               a."createdAt", a."updatedAt"
        from public."Appointment" a
        join public."ClientProfile" c on c.id = a."clientId"
        join public."User" u on u.id = a."coachId"
        where a."updatedAt" > ${from} and a."updatedAt" <= ${nextWatermark} order by a.id
      `) as unknown as V1ConsultRow[];
  const [excluded] = await tx<{ missingClient: number; missingAuthor: number }[]>`
    select
      count(*) filter (where a."clientId" is null or c.id is null)::int as "missingClient",
      count(*) filter (where u.id is null)::int as "missingAuthor"
    from public."Appointment" a
    left join public."ClientProfile" c on c.id = a."clientId"
    left join public."User" u on u.id = a."coachId"
  `;
  const unlinkedNotes = (forceFull || !from
    ? await tx`
        select 'Appointment:' || a.id as id, a."clientId", a."coachId", a."subType"::text as "subType",
               a.status::text as status, a."startTime", a."contactMethod"::text as "contactMethod",
               a."noteBody", a."previousNoteId", a."finalizedAt", a."createdAt", a."updatedAt",
               (a."clientId" is null or c.id is null) as "missingClient", (u.id is null) as "missingAuthor"
        from public."Appointment" a
        left join public."ClientProfile" c on c.id = a."clientId"
        left join public."User" u on u.id = a."coachId"
        where (a."clientId" is null or c.id is null or u.id is null)
          and a."updatedAt" <= ${nextWatermark}
        order by a.id
      `
    : await tx`
        select 'Appointment:' || a.id as id, a."clientId", a."coachId", a."subType"::text as "subType",
               a.status::text as status, a."startTime", a."contactMethod"::text as "contactMethod",
               a."noteBody", a."previousNoteId", a."finalizedAt", a."createdAt", a."updatedAt",
               (a."clientId" is null or c.id is null) as "missingClient", (u.id is null) as "missingAuthor"
        from public."Appointment" a
        left join public."ClientProfile" c on c.id = a."clientId"
        left join public."User" u on u.id = a."coachId"
        where (a."clientId" is null or c.id is null or u.id is null)
          and a."updatedAt" > ${from} and a."updatedAt" <= ${nextWatermark}
        order by a.id
      `) as unknown as LegacyUnlinkedNote[];
  for (const row of unlinkedNotes) {
    const reasonCode = row.missingClient && row.missingAuthor
      ? "missing-client-and-author"
      : row.missingClient
        ? "missing-client"
        : "missing-author";
    exceptions.push({
      id: `${row.id}:${reasonCode}`,
      sourceEntityType: "Appointment",
      reasonCode,
      payload: {
        clientId: row.clientId,
        coachId: row.coachId,
        subType: row.subType,
        status: row.status,
        startTime: row.startTime,
        contactMethod: row.contactMethod,
        noteBody: row.noteBody,
        previousNoteId: row.previousNoteId,
        finalizedAt: row.finalizedAt,
        createdAt: row.createdAt,
      },
      sourceUpdatedAt: row.updatedAt,
    });
  }
  const rawProgressNotes = (forceFull || !from
    ? await tx`
        select 'ProgressNote:' || p.id as id, person.id as "personId", author.id as "authorId",
               coalesce(p.practitioner, p."createdByName") as "authorName",
               p."apptType", p.procedure, p.medications, p.allergies, p.hr, p.bp, p.weight,
               p.height, p.temp, p."vitalsNote", p.narrative, p.status, p."visitDate",
               p."completedAt", p."createdAt", p."updatedAt"
        from public."ProgressNote" p
        join lateral (
          select c.id from public."ClientProfile" c
          where (p."clientMindbodyId" is not null and c."mindbodyId" = p."clientMindbodyId")
             or (p."clientMindbodyId" is null and c."nameKey" = p."clientNameKey")
          order by case when c."mindbodyId" = p."clientMindbodyId" then 0 else 1 end, c.id
          limit 1
        ) person on true
        left join lateral (
          select case
                   when direct.matches = 1 then direct.id
                   when direct.matches = 0 and named.id is not null then named.id
                 end as id
          from lateral (
            select count(*)::int as matches,
                   case
                     when count(*) = 1 then min(u.id)
                     when count(*) filter (where lower(trim(u.email)) like '%@goalphahealth.com') = 1
                       then min(u.id) filter (where lower(trim(u.email)) like '%@goalphahealth.com')
                   end as id
            from public."User" u where p."createdById" is not null and u.id = p."createdById"
          ) direct
          cross join lateral (
            select count(*)::int as matches,
                   case
                     when count(*) = 1 then min(u.id)
                     when count(*) filter (where lower(trim(u.email)) like '%@goalphahealth.com') = 1
                       then min(u.id) filter (where lower(trim(u.email)) like '%@goalphahealth.com')
                   end as id
            from public."User" u
            where regexp_replace(lower(u.name), '[^a-z0-9]', '', 'g') =
                  regexp_replace(lower(coalesce(p.practitioner, p."createdByName")), '[^a-z0-9]', '', 'g')
              and trim(coalesce(p.practitioner, p."createdByName", '')) <> ''
          ) named
        ) author on true
        where p."updatedAt" <= ${nextWatermark} order by p.id
      `
    : await tx`
        select 'ProgressNote:' || p.id as id, person.id as "personId", author.id as "authorId",
               coalesce(p.practitioner, p."createdByName") as "authorName",
               p."apptType", p.procedure, p.medications, p.allergies, p.hr, p.bp, p.weight,
               p.height, p.temp, p."vitalsNote", p.narrative, p.status, p."visitDate",
               p."completedAt", p."createdAt", p."updatedAt"
        from public."ProgressNote" p
        join lateral (
          select c.id from public."ClientProfile" c
          where (p."clientMindbodyId" is not null and c."mindbodyId" = p."clientMindbodyId")
             or (p."clientMindbodyId" is null and c."nameKey" = p."clientNameKey")
          order by case when c."mindbodyId" = p."clientMindbodyId" then 0 else 1 end, c.id
          limit 1
        ) person on true
        left join lateral (
          select case
                   when direct.matches = 1 then direct.id
                   when direct.matches = 0 and named.id is not null then named.id
                 end as id
          from lateral (
            select count(*)::int as matches,
                   case
                     when count(*) = 1 then min(u.id)
                     when count(*) filter (where lower(trim(u.email)) like '%@goalphahealth.com') = 1
                       then min(u.id) filter (where lower(trim(u.email)) like '%@goalphahealth.com')
                   end as id
            from public."User" u where p."createdById" is not null and u.id = p."createdById"
          ) direct
          cross join lateral (
            select count(*)::int as matches,
                   case
                     when count(*) = 1 then min(u.id)
                     when count(*) filter (where lower(trim(u.email)) like '%@goalphahealth.com') = 1
                       then min(u.id) filter (where lower(trim(u.email)) like '%@goalphahealth.com')
                   end as id
            from public."User" u
            where regexp_replace(lower(u.name), '[^a-z0-9]', '', 'g') =
                  regexp_replace(lower(coalesce(p.practitioner, p."createdByName")), '[^a-z0-9]', '', 'g')
              and trim(coalesce(p.practitioner, p."createdByName", '')) <> ''
          ) named
        ) author on true
        where p."updatedAt" > ${from} and p."updatedAt" <= ${nextWatermark} order by p.id
      `) as unknown as LegacyProgressNote[];
  const synthesizedAuthorRows = new Map<string, V1StaffRow>();
  for (const row of rawProgressNotes) {
    if (!row.authorId && row.authorName) {
      row.authorId = canonicalStaffByName.get(normalizedName(row.authorName)) ?? null;
    }
    if (row.authorId) continue;
    const authorName = row.authorName?.trim() || "Unknown legacy progress-note author";
    const sourceId = `ProgressNoteAuthor:${normalizedName(authorName) || "unknown"}`;
    if (!synthesizedAuthorRows.has(sourceId)) {
      synthesizedAuthorRows.set(sourceId, {
        id: sourceId,
        name: authorName,
        email: `legacy-author-${sha256(authorName).slice(0, 16)}@migration.invalid`,
        role: "MEDICAL",
        title: "Legacy progress-note author (inactive)",
        npi: null,
        active: false,
        locationId: null,
        locationTargetId: null,
        createdAt: row.createdAt,
      });
    }
  }
  const staff = [...sourceStaff, ...synthesizedAuthorRows.values()];
  const progressConsults: V1ConsultRow[] = rawProgressNotes.map((row) => {
    const objective = [
      row.bp ? `BP: ${row.bp}` : null,
      row.hr ? `HR: ${row.hr}` : null,
      row.temp ? `Temperature: ${row.temp}` : null,
      row.weight ? `Weight: ${row.weight}` : null,
      row.height ? `Height: ${row.height}` : null,
      row.vitalsNote ? `Vitals note: ${row.vitalsNote}` : null,
    ].filter((value): value is string => Boolean(value)).join("\n");
    const noteBody = [
      row.narrative,
      row.procedure ? `Procedure: ${row.procedure}` : null,
      row.medications ? `Medications recorded in Alpha: ${row.medications}` : null,
      row.allergies ? `Allergies recorded in Alpha: ${row.allergies}` : null,
      objective || null,
    ].filter((value): value is string => Boolean(value)).join("\n\n");
    return {
      id: row.id,
      personId: row.personId,
      authorId: row.authorId ?? `ProgressNoteAuthor:${normalizedName(row.authorName?.trim() || "Unknown legacy progress-note author") || "unknown"}`,
      recordClass: "medical-progress-note", kind: row.apptType ?? row.procedure,
      channel: null, status: row.status, startedAt: row.visitDate ?? row.createdAt,
      finalizedAt: row.completedAt, noteBody: noteBody || "No narrative text was recorded in Alpha OS.",
      subjective: row.narrative, objective: objective || null, assessment: null, plan: null,
      previousNoteId: null, createdAt: row.createdAt, updatedAt: row.updatedAt,
    };
  });
  const [progressExcluded] = await tx<{ missingClient: number; missingAuthor: number }[]>`
    select
      count(*) filter (where person.id is null)::int as "missingClient",
      count(*) filter (where author.id is null)::int as "missingAuthor"
    from public."ProgressNote" p
    left join lateral (
      select c.id from public."ClientProfile" c
      where (p."clientMindbodyId" is not null and c."mindbodyId" = p."clientMindbodyId")
         or (p."clientMindbodyId" is null and c."nameKey" = p."clientNameKey")
      order by case when c."mindbodyId" = p."clientMindbodyId" then 0 else 1 end, c.id limit 1
    ) person on true
    left join lateral (
      select case
               when direct.matches = 1 then direct.id
               when direct.matches = 0 and named.id is not null then named.id
             end as id
      from lateral (
        select count(*)::int as matches,
               case
                 when count(*) = 1 then min(u.id)
                 when count(*) filter (where lower(trim(u.email)) like '%@goalphahealth.com') = 1
                   then min(u.id) filter (where lower(trim(u.email)) like '%@goalphahealth.com')
               end as id
        from public."User" u where p."createdById" is not null and u.id = p."createdById"
      ) direct
      cross join lateral (
        select count(*)::int as matches,
               case
                 when count(*) = 1 then min(u.id)
                 when count(*) filter (where lower(trim(u.email)) like '%@goalphahealth.com') = 1
                   then min(u.id) filter (where lower(trim(u.email)) like '%@goalphahealth.com')
               end as id
        from public."User" u
        where regexp_replace(lower(u.name), '[^a-z0-9]', '', 'g') =
              regexp_replace(lower(coalesce(p.practitioner, p."createdByName")), '[^a-z0-9]', '', 'g')
          and trim(coalesce(p.practitioner, p."createdByName", '')) <> ''
      ) named
    ) author on true
  `;
  const consults = [...coachConsults, ...progressConsults];
  return {
    extract: {
      locations: canonicalLegacyLocations(), staff, people, appointments: [], consults,
      contacts, fulfillmentHistory, sales, saleLines, exceptions,
    } satisfies V1Extract,
    diagnostics: {
      staffNameCollisionGroups, unresolvedStaffNameCollisionGroups,
      staffActivationCandidates, inactiveLegacyStaffRows, syntheticRosterStaffRows,
      unmatchedAssignedCoaches, ambiguousAssignedCoaches,
      unresolvedHomeLocations, namesParsedFromDisplay, invalidDobValues,
      consultsExcludedMissingClient: Number(excluded.missingClient),
      consultsExcludedMissingAuthor: Number(excluded.missingAuthor),
      progressNotesExcludedMissingClient: Number(progressExcluded.missingClient),
      progressNotesExcludedMissingAuthor: 0,
      progressNotesWithSynthesizedAuthor: rawProgressNotes.filter((row) => !row.authorId).length,
      contactsExcludedMissingClient: unresolvedTouches.length,
      contactsWithoutStaffOwner,
      contactAttachmentsForRehousing,
      routedOrdersExcludedMissingClient: unresolvedRoutedOrders.length,
      routedOrderClientKeyConflicts,
      routedOrdersMissingSaleLink,
      routedOrdersMissingCoach,
      shipmentsExcludedLinkage: unresolvedShipments.length,
      purchasesExcludedMissingClient: unresolvedPurchases.length,
      purchaseClientKeyConflicts,
      purchasesMissingCoach,
      purchaseItemCountMismatches,
      purchaseLineMathMismatches,
    } satisfies ExtractDiagnostics,
    continuityInventory: await legacyContinuityInventory(tx),
    schemaFingerprint,
  };
}

async function extractV1(source: Sql, from: Date | null, forceFull: boolean) {
  return source.begin("isolation level repeatable read read only", async (tx) => {
    const [{ nextWatermark }] = await tx<{ nextWatermark: Date }[]>`
      select transaction_timestamp() as "nextWatermark"
    `;
    const sourceShape = await detectSourceShape(tx);
    const result = sourceShape === "legacy-public-2026-07"
      ? await extractLegacy(tx, from, forceFull, new Date(nextWatermark))
      : await extractUnified(tx, from, forceFull, new Date(nextWatermark));
    return { ...result, sourceShape, nextWatermark: new Date(nextWatermark) };
  });
}

function chunks<T>(items: T[], size = 400): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

async function upsertLocations(tx: TransactionSql, records: MappedRecord<Record<string, unknown>>[]) {
  for (const batch of chunks(records.map((record) => record.data))) {
    await tx`
      insert into clinic_location ${tx(batch)}
      on conflict (id) do update set
        code = excluded.code, name = excluded.name, address1 = excluded.address1,
        city = excluded.city, state = excluded.state, zip = excluded.zip,
        timezone = excluded.timezone, active = excluded.active,
        source_system = excluded.source_system, source_id = excluded.source_id,
        source_updated_at = excluded.source_updated_at, updated_at = excluded.updated_at
    `;
  }
}

async function upsertStaff(tx: TransactionSql, records: MappedRecord<Record<string, unknown>>[]) {
  for (const batch of chunks(records.map((record) => record.data))) {
    await tx`
      insert into staff ${tx(batch)}
      on conflict (id) do update set
        email = excluded.email, name = excluded.name, department = excluded.department,
        title = excluded.title, role = excluded.role, access_profile = excluded.access_profile,
        location_ids = excluded.location_ids,
        credentials = excluded.credentials, can_approve = excluded.can_approve,
        exclude_from_scheduling = excluded.exclude_from_scheduling, active = excluded.active,
        source_system = excluded.source_system, source_id = excluded.source_id,
        source_updated_at = excluded.source_updated_at, updated_at = excluded.updated_at
    `;
  }
}

async function upsertPeople(tx: TransactionSql, records: MappedRecord<Record<string, unknown>>[]) {
  for (const batch of chunks(records.map((record) => record.data), 250)) {
    await tx`
      insert into client ${tx(batch)}
      on conflict (id) do update set
        mrn = excluded.mrn, first_name = excluded.first_name, last_name = excluded.last_name,
        preferred_name = excluded.preferred_name, date_of_birth = excluded.date_of_birth,
        sex = excluded.sex, email = excluded.email, phone = excluded.phone,
        address1 = excluded.address1, address2 = excluded.address2, city = excluded.city,
        state = excluded.state, zip = excluded.zip, status = excluded.status,
        is_prospect = excluded.is_prospect, home_location_id = excluded.home_location_id,
        assigned_coach_id = excluded.assigned_coach_id,
        source_system = excluded.source_system, source_id = excluded.source_id,
        source_updated_at = excluded.source_updated_at, updated_at = excluded.updated_at
    `;
  }
}

async function upsertAppointments(tx: TransactionSql, records: MappedRecord<Record<string, unknown>>[]) {
  for (const batch of chunks(records.map((record) => record.data), 250)) {
    await tx`
      insert into appointment ${tx(batch)}
      on conflict (id) do update set
        client_id = excluded.client_id, staff_id = excluded.staff_id,
        location_id = excluded.location_id, visit_type = excluded.visit_type,
        modality = excluded.modality, start_at = excluded.start_at, end_at = excluded.end_at,
        status = excluded.status, room = excluded.room, reason = excluded.reason,
        notes = excluded.notes, completed_at = excluded.completed_at,
        cancelled_at = excluded.cancelled_at, source_system = excluded.source_system,
        source_id = excluded.source_id, source_updated_at = excluded.source_updated_at
    `;
  }
}

async function upsertConsults(tx: TransactionSql, records: MappedRecord<Record<string, unknown>>[]) {
  for (const batch of chunks(records.map((record) => record.data), 200)) {
    await tx`
      insert into consult ${tx(batch)}
      on conflict (id) do update set
        client_id = excluded.client_id, author_id = excluded.author_id,
        kind = excluded.kind, channel = excluded.channel,
        started_at = excluded.started_at, ended_at = excluded.ended_at,
        raw_notes = excluded.raw_notes, status = excluded.status,
        signed_at = excluded.signed_at, signed_by = excluded.signed_by,
        attestation = excluded.attestation, visible_to_client = excluded.visible_to_client,
        source_system = excluded.source_system, source_id = excluded.source_id,
        source_updated_at = excluded.source_updated_at,
        supersedes_consult_id = excluded.supersedes_consult_id,
        updated_at = excluded.updated_at
      where consult.status <> 'Signed'
         or consult.source_updated_at is distinct from excluded.source_updated_at
    `;
  }
}

async function upsertMigrationExceptions(tx: TransactionSql, records: MappedRecord<Record<string, unknown>>[]) {
  for (const batch of chunks(records.map((record) => record.data), 150)) {
    await tx`
      insert into migration_exception ${tx(batch)}
      on conflict (id) do update set
        source_entity_type = excluded.source_entity_type,
        source_id = excluded.source_id,
        reason_code = excluded.reason_code,
        payload = excluded.payload,
        payload_sha256 = excluded.payload_sha256,
        source_updated_at = excluded.source_updated_at,
        updated_at = excluded.updated_at
      where migration_exception.status = 'Pending review'
    `;
  }
}

async function insertHistoricalSales(tx: TransactionSql, records: MappedRecord<Record<string, unknown>>[]) {
  for (const batch of chunks(records.map((record) => record.data), 300)) {
    await tx`
      insert into sale ${tx(batch)}
      on conflict (id) do nothing
    `;
  }
}

async function insertHistoricalSaleLines(tx: TransactionSql, records: MappedRecord<Record<string, unknown>>[]) {
  for (const batch of chunks(records.map((record) => record.data), 500)) {
    await tx`
      insert into sale_line ${tx(batch)}
      on conflict (id) do nothing
    `;
  }
}

async function insertHistoricalContacts(tx: TransactionSql, records: MappedRecord<Record<string, unknown>>[]) {
  for (const batch of chunks(records.map((record) => record.data), 300)) {
    await tx`
      insert into contact_entry ${tx(batch)}
      on conflict (id) do nothing
    `;
  }
}

async function insertHistoricalFulfillment(tx: TransactionSql, records: MappedRecord<Record<string, unknown>>[]) {
  for (const batch of chunks(records.map((record) => record.data), 300)) {
    await tx`
      insert into historical_fulfillment_record ${tx(batch)}
      on conflict (id) do nothing
    `;
  }
}

async function upsertBindings(
  tx: TransactionSql,
  runId: string,
  records: MappedRecord<Record<string, unknown>>[],
) {
  const values = records.map((record) => ({
    id: bindingId(record.entityType, record.sourceId),
    source_system: V1_SOURCE_SYSTEM,
    entity_type: record.entityType,
    source_id: record.sourceId,
    target_id: record.targetId,
    source_updated_at: record.sourceUpdatedAt,
    checksum: record.checksum,
    first_run_id: runId,
    last_run_id: runId,
    imported_at: new Date(),
  }));
  for (const batch of chunks(values, 300)) {
    await tx`
      insert into import_binding ${tx(batch)}
      on conflict (source_system, entity_type, source_id) do update set
        target_id = excluded.target_id, source_updated_at = excluded.source_updated_at,
        checksum = excluded.checksum, last_run_id = excluded.last_run_id,
        imported_at = excluded.imported_at
      where import_binding.entity_type not in ('contact-entry', 'historical-fulfillment', 'sale', 'sale-line')
         or import_binding.checksum = excluded.checksum
    `;
  }
}

async function applyExtract(
  target: Sql,
  runId: string,
  mapped: ReturnType<typeof extractSummary>["mapped"],
) {
  await target.begin("isolation level serializable read write", async (tx) => {
    await upsertLocations(tx, mapped.locations);
    await upsertStaff(tx, mapped.staff);
    await upsertPeople(tx, mapped.people);
    await upsertAppointments(tx, mapped.appointments);
    await upsertConsults(tx, mapped.consults);
    await insertHistoricalContacts(tx, mapped.contacts);
    await insertHistoricalSales(tx, mapped.sales);
    await insertHistoricalSaleLines(tx, mapped.saleLines);
    await insertHistoricalFulfillment(tx, mapped.fulfillmentHistory);
    await upsertMigrationExceptions(tx, mapped.exceptions);
    await upsertBindings(tx, runId, [
      ...mapped.locations,
      ...mapped.staff,
      ...mapped.people,
      ...mapped.appointments,
      ...mapped.consults,
      ...mapped.contacts,
      ...mapped.fulfillmentHistory,
      ...mapped.sales,
      ...mapped.saleLines,
      ...mapped.exceptions,
    ]);
  });
}

interface Reconciliation {
  scope: "full" | "delta";
  expected: number;
  bound: number;
  targetRows: number;
  missing: number;
  mismatched: number;
  extra: number;
  expectedChecksum: string;
  bindingChecksum: string;
  ok: boolean;
}

async function reconcile(
  target: Sql,
  mapped: ReturnType<typeof extractSummary>["mapped"],
  scope: "full" | "delta" = "full",
): Promise<Reconciliation> {
  const expectedRows = Object.values(mapped).flat();
  const actual = await target<{ entityType: string; sourceId: string; checksum: string }[]>`
    select entity_type as "entityType", source_id as "sourceId", checksum
    from import_binding
    where source_system = ${V1_SOURCE_SYSTEM}
  `;
  const targetCounts = await target<{ count: number }[]>`
    select sum(n)::int as count from (
      select count(*)::int as n from clinic_location where source_system = ${V1_SOURCE_SYSTEM}
      union all select count(*)::int from staff where source_system = ${V1_SOURCE_SYSTEM}
      union all select count(*)::int from client where source_system = ${V1_SOURCE_SYSTEM}
      union all select count(*)::int from appointment where source_system = ${V1_SOURCE_SYSTEM}
      union all select count(*)::int from consult where source_system = ${V1_SOURCE_SYSTEM}
      union all select count(*)::int from contact_entry where source_system = ${V1_SOURCE_SYSTEM}
      union all select count(*)::int from historical_fulfillment_record where source_system = ${V1_SOURCE_SYSTEM}
      union all select count(*)::int from migration_exception where source_system = ${V1_SOURCE_SYSTEM}
      union all select count(*)::int from sale where source_system = ${V1_SOURCE_SYSTEM}
      union all select count(*)::int from sale_line where source_system = ${V1_SOURCE_SYSTEM}
    ) counts
  `;
  const expected = new Map(expectedRows.map((row) => [`${row.entityType}:${row.sourceId}`, row.checksum]));
  const bound = new Map(actual.map((row) => [`${row.entityType}:${row.sourceId}`, row.checksum]));
  let missing = 0;
  let mismatched = 0;
  for (const [key, checksum] of expected) {
    if (!bound.has(key)) missing++;
    else if (bound.get(key) !== checksum) mismatched++;
  }
  let extra = 0;
  for (const key of bound.keys()) if (!expected.has(key)) extra++;
  const expectedChecksum = sha256([...expected.values()].sort());
  const relevantBindingChecksums = [...expected.keys()]
    .map((key) => bound.get(key))
    .filter((checksum): checksum is string => Boolean(checksum));
  const bindingChecksum = sha256(relevantBindingChecksums.sort());
  const targetRows = Number(targetCounts[0]?.count ?? 0);
  return {
    scope,
    expected: expected.size,
    bound: bound.size,
    targetRows,
    missing,
    mismatched,
    extra,
    expectedChecksum,
    bindingChecksum,
    ok:
      missing === 0 &&
      mismatched === 0 &&
      (scope === "delta" || extra === 0) &&
      (scope === "delta" || expected.size === bound.size) &&
      (scope === "delta" || expected.size === targetRows) &&
      expectedChecksum === bindingChecksum,
  };
}

function requireApplyAuthorization(options: Options) {
  if (process.env.MIGRATION_AUTHORIZED !== "true") {
    throw new Error("apply refused: set MIGRATION_AUTHORIZED=true in the controlled migration job");
  }
  if (!options.initiatedBy) throw new Error("apply refused: --initiated-by is required");
  const expectedLabel = process.env.MIGRATION_TARGET_LABEL;
  if (!expectedLabel || !options.targetLabel || options.targetLabel !== expectedLabel) {
    throw new Error("apply refused: --confirm-target must match MIGRATION_TARGET_LABEL");
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const sourceUrl = process.env.V1_DATABASE_URL;
  const targetUrl = process.env.APEX_MIGRATION_DATABASE_URL;
  if (!sourceUrl) throw new Error("V1_DATABASE_URL is required");
  if ((options.apply || options.reconcileOnly) && !targetUrl) {
    throw new Error("APEX_MIGRATION_DATABASE_URL is required for apply or reconciliation");
  }
  if (targetUrl) {
    const violation = protectedSourceTargetViolation(sourceUrl, targetUrl, options.targetLabel);
    if (violation) throw new Error(`protected Alpha source boundary: ${violation}; migration refused`);
  }
  if (options.apply) requireApplyAuthorization(options);

  const source = connection(sourceUrl);
  const target = targetUrl ? connection(targetUrl) : null;
  try {
    const forceFull = options.mode !== "delta" || options.reconcileOnly;
    const {
      extract,
      nextWatermark,
      continuityInventory,
      sourceShape,
      schemaFingerprint,
      diagnostics,
    } = await extractV1(source, options.watermark, forceFull);
    const summary = extractSummary(extract);
    if ((options.apply || options.reconcileOnly) && summary.counts.people === 0) {
      throw new Error("source contains zero people; refusing a cutover operation against an empty extract");
    }

    let runId: string | null = null;
    let reconciliation: Reconciliation | null = null;
    if (options.apply && target) {
      runId = randomUUID();
      await target`
        insert into migration_run (
          id, source_system, mode, status, source_watermark, next_watermark,
          counts, checksum, initiated_by
        ) values (
          ${runId}, ${V1_SOURCE_SYSTEM}, ${options.mode}, 'running', ${options.watermark},
          ${nextWatermark}, ${target.json(summary.counts)}, ${summary.checksum}, ${options.initiatedBy!}
        )
      `;
      try {
        await applyExtract(target, runId, summary.mapped);
        await target`
          update migration_run
          set status = 'applied', completed_at = now()
          where id = ${runId}
        `;
      } catch (error) {
        await target`
          update migration_run
          set status = 'failed', completed_at = now(), error_code = 'apply_failed'
          where id = ${runId}
        `;
        throw error;
      }
    }
    if ((options.apply || options.reconcileOnly) && target) {
      reconciliation = await reconcile(
        target,
        summary.mapped,
        options.mode === "delta" && !options.reconcileOnly ? "delta" : "full",
      );
      if (options.apply && runId) {
        await target`
          update migration_run
          set status = ${reconciliation.ok ? "reconciled" : "reconciliation_failed"},
              completed_at = now()
          where id = ${runId}
        `;
      }
    }

    const report = {
      operation: options.reconcileOnly ? "reconcile" : options.apply ? "apply" : "dry-run",
      mode: options.mode,
      runId,
      sourceShape,
      sourceSchemaFingerprint: schemaFingerprint,
      sourceWatermark: options.watermark?.toISOString() ?? null,
      nextWatermark: nextWatermark.toISOString(),
      counts: summary.counts,
      checksum: summary.checksum,
      continuityInventory,
      diagnostics,
      reconciliation,
    };
    console.log(JSON.stringify(report, null, 2));
    if (reconciliation && !reconciliation.ok) process.exitCode = 2;
  } finally {
    await source.end({ timeout: 5 });
    if (target) await target.end({ timeout: 5 });
  }
}

if (process.argv[1]?.endsWith("migrate-v1.ts")) {
  main().catch((error) => {
    console.error(JSON.stringify({ operation: "failed", error: error instanceof Error ? error.message : "unknown" }));
    process.exitCode = 1;
  });
}
