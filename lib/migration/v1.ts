import { createHash } from "node:crypto";
import { ROSTER } from "@/lib/mock/roster";
import { inferAccessProfile } from "@/lib/authz/profiles";

export const V1_SOURCE_SYSTEM = "alpha-v1";

export type V1EntityType =
  | "location"
  | "staff"
  | "person"
  | "appointment"
  | "consult"
  | "contact-entry"
  | "historical-fulfillment"
  | "sale"
  | "sale-line"
  | "migration-exception"
  | "source-record"
  | "binary-asset";

type Dateish = Date | string | null;

export interface V1LocationRow {
  id: string;
  /** Canonical Apex location id when V1 stores only a display label. */
  targetLocationId?: string;
  code: string;
  name: string;
  address1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  timezone: string;
  active: boolean;
  createdAt: Dateish;
}

export interface V1StaffRow {
  id: string;
  name: string;
  email: string;
  role: string;
  title: string | null;
  npi: string | null;
  active: boolean;
  locationId: string | null;
  /** Canonical Apex location id resolved by the production-source adapter. */
  locationTargetId?: string | null;
  createdAt: Dateish;
}

export interface V1PersonRow {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  dob: Dateish;
  sex: string;
  email: string | null;
  phone: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  status: string;
  isProspect: boolean;
  assignedCoachId: string | null;
  locationId: string | null;
  locationTargetId?: string | null;
  createdAt: Dateish;
  updatedAt: Dateish;
}

export interface V1AppointmentRow {
  id: string;
  personId: string;
  providerId: string | null;
  locationId: string | null;
  locationTargetId?: string | null;
  type: string;
  status: string;
  startAt: Dateish;
  endAt: Dateish;
  resource: string | null;
  reason: string | null;
  notes: string | null;
  createdAt: Dateish;
  updatedAt: Dateish;
}

/**
 * A historical authored note from Alpha OS.
 *
 * Alpha production calls these rows `Appointment`, but the actual columns are
 * note body, author, contact method, finalization, and prior-note provenance.
 * They are not calendar reservations. The source adapter translates them into
 * this neutral shape so Apex can store them as consult history without
 * polluting its authoritative scheduling ledger.
 */
export interface V1ConsultRow {
  id: string;
  personId: string;
  authorId: string;
  recordClass?: "coach-note" | "medical-progress-note";
  kind: string | null;
  channel: string | null;
  status: string;
  startedAt: Dateish;
  finalizedAt: Dateish;
  noteBody: string;
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  previousNoteId: string | null;
  createdAt: Dateish;
  updatedAt: Dateish;
}

/** Private, non-routed preservation of a source row that cannot be linked safely. */
export interface V1MigrationExceptionRow {
  id: string;
  sourceEntityType: string;
  reasonCode: string;
  payload: Record<string, unknown>;
  sourceUpdatedAt: Dateish;
}

export interface V1SaleRow {
  id: string;
  personId: string;
  externalRef: string;
  orderNumber: string | null;
  occurredAt: Dateish;
  locationLabel: string | null;
  locationTargetId: string | null;
  coachId: string | null;
  total: number | string;
  sourceItemCount: number;
  actualItemCount: number;
  legacy: boolean;
  createdAt: Dateish;
}

export interface V1SaleLineRow {
  id: string;
  saleId: string;
  lineIndex: number;
  sku: string | null;
  description: string;
  quantity: number | string;
  unitPrice: number | string;
  total: number | string;
  returned: boolean;
}

export interface V1ContactEntryRow {
  id: string;
  personId: string;
  staffId: string | null;
  at: Dateish;
  channel: string;
  direction: string;
  subject: string | null;
  body: string;
  hasAttachments: boolean;
  externalId: string | null;
}

export interface V1HistoricalFulfillmentRow {
  id: string;
  sourceEntityType: "RoutedOrder" | "ShipmentNotification";
  recordKind: "routed-line" | "shipment";
  personId: string;
  saleSourceId: string | null;
  orderNumber: string | null;
  externalOrderRef: string | null;
  partner: string;
  status: string;
  sourceChannel: string | null;
  locationTargetId: string | null;
  sourceLocationLabel: string | null;
  coachId: string | null;
  occurredAt: Dateish;
  completedAt: Dateish;
  sku: string | null;
  itemName: string | null;
  quantity: number | null;
  items: unknown[] | null;
  pickup: boolean;
  shippingType: string | null;
  tracking: string | null;
  carrier: string | null;
  estDelivery: string | null;
  delayed: boolean;
  delayReason: string | null;
  statusHistory: unknown[] | null;
  destinationSnapshot: Record<string, unknown>;
  routingSnapshot: Record<string, unknown>;
  updatedAt: Dateish;
  createdAt: Dateish;
}

/** Lossless Alpha business row retained outside Apex's live state machines. */
export interface V1ArchivedSourceRow {
  id: string;
  sourceEntityType: string;
  personId: string | null;
  occurredAt: Dateish;
  sourceUpdatedAt: Dateish;
  payload: Record<string, unknown>;
}

/** Exact binary evidence copied from Alpha without its bearer token. */
export interface V1BinaryAssetRow {
  id: string;
  sourceEntityType: "Document" | "OutboundMedia" | "ShippingLabel";
  personId: string | null;
  filename: string;
  contentType: string;
  sizeBytes: number;
  data: Buffer;
  category: string | null;
  sourceCreatedById: string | null;
  sourceCreatedAt: Dateish;
}

export interface V1Extract {
  locations: V1LocationRow[];
  staff: V1StaffRow[];
  people: V1PersonRow[];
  appointments: V1AppointmentRow[];
  consults: V1ConsultRow[];
  contacts: V1ContactEntryRow[];
  fulfillmentHistory: V1HistoricalFulfillmentRow[];
  sales: V1SaleRow[];
  saleLines: V1SaleLineRow[];
  exceptions: V1MigrationExceptionRow[];
  archivedRecords: V1ArchivedSourceRow[];
  binaryAssets: V1BinaryAssetRow[];
}

export interface MappedRecord<T extends Record<string, unknown>> {
  entityType: V1EntityType;
  sourceId: string;
  sourceUpdatedAt: Date | null;
  targetId: string;
  checksum: string;
  data: T;
}

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value === undefined ? null : value;
}

/** Stable JSON independent of object insertion order and Date representation. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

/** Opaque, repeatable target id. It does not reveal a V1 id in a browser URL. */
export function targetId(entityType: V1EntityType, sourceId: string): string {
  return `v1-${entityType}-${createHash("sha256").update(`${entityType}:${sourceId}`).digest("hex").slice(0, 24)}`;
}

export function bindingId(entityType: V1EntityType, sourceId: string): string {
  return `bind-${createHash("sha256").update(`${V1_SOURCE_SYSTEM}:${entityType}:${sourceId}`).digest("hex").slice(0, 28)}`;
}

function asDate(value: Dateish): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("V1 extract contained an invalid date");
  return date;
}

function dateOnly(value: Dateish): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (us) {
      const month = Number(us[1]);
      const day = Number(us[2]);
      const year = Number(us[3]);
      const candidate = new Date(Date.UTC(year, month - 1, day));
      if (candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day) {
        return candidate.toISOString().slice(0, 10);
      }
      return null;
    }
  }
  const parsed = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

function role(value: string): "Admin" | "Coach" | "Medical" {
  const normalized = value.toUpperCase();
  if (normalized === "COACH") return "Coach";
  if (normalized === "PROVIDER" || normalized === "NURSE" || normalized === "MEDICAL") return "Medical";
  return "Admin";
}

function sex(value: string): "male" | "female" | "unknown" {
  const normalized = value.trim().toLowerCase();
  if (normalized === "male" || normalized === "m") return "male";
  if (normalized === "female" || normalized === "f") return "female";
  return "unknown";
}

function normalizedName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function visitType(value: string): string {
  const map: Record<string, string> = {
    NEW_PATIENT: "Initial Consult",
    FOLLOW_UP: "Follow-Up",
    LAB_DRAW: "Lab Draw",
    INJECTION: "Injection",
    CONSULT: "Initial Consult",
    TELEHEALTH: "Telehealth",
    REGEN_PROCEDURE: "Regen Procedure",
    BODY_SCAN: "Body Scan",
  };
  return map[value.toUpperCase()] ?? value;
}

function appointmentStatus(value: string): string {
  const map: Record<string, string> = {
    SCHEDULED: "Scheduled",
    CONFIRMED: "Confirmed",
    CHECKED_IN: "Checked In",
    IN_PROGRESS: "In Progress",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
    NO_SHOW: "No Show",
  };
  return map[value.toUpperCase()] ?? value;
}

function legacyConsultKind(value: string | null): string {
  const normalized = (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (normalized.includes("intake") || normalized.includes("free_consult")) return "Intake";
  if (normalized.includes("coach_consult") || normalized.includes("performance_coaching")) return "Coach consult";
  if (normalized.includes("plan_of_care") || normalized.includes("chart")) return "Medical chart review";
  if (normalized.includes("lab") || normalized.includes("body_scan")) return "Medical visit";
  if (normalized.includes("telehealth") || normalized.includes("v2v")) return "Telehealth";
  return "Follow-up";
}

function legacyConsultChannel(value: string | null, kind: string): string {
  const normalized = (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (normalized.includes("sms") || normalized.includes("message") || normalized.includes("text")) return "Messaging";
  if (normalized.includes("v2v") || normalized.includes("video") || normalized.includes("zoom")) return "Video";
  if (normalized.includes("phone") || normalized.includes("call")) return "Phone";
  if (normalized.includes("person") || normalized.includes("clinic") || normalized.includes("office")) return "In person";
  if (kind === "Medical chart review") return "Chart review";
  return "Unspecified legacy";
}

function mapped<T extends Record<string, unknown>>(
  entityType: V1EntityType,
  sourceId: string,
  sourceUpdatedAt: Dateish,
  data: T,
): MappedRecord<T> {
  return {
    entityType,
    sourceId,
    sourceUpdatedAt: asDate(sourceUpdatedAt),
    targetId: String(data.id),
    checksum: sha256(data),
    data,
  };
}

/** Convert source decimal dollars to signed integer cents without rounding loss. */
export function exactCents(value: number | string): number {
  const numeric = typeof value === "number" ? value : Number(value);
  const cents = Math.round(numeric * 100);
  if (!Number.isFinite(numeric) || !Number.isSafeInteger(cents) || Math.abs(numeric * 100 - cents) > 0.000001) {
    throw new Error("V1 money value cannot be represented exactly in integer cents");
  }
  return cents;
}

function exactInteger(value: number | string, field: string): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(numeric)) throw new Error(`V1 ${field} is not an integer`);
  return numeric;
}

export function mapLocation(row: V1LocationRow) {
  const id = row.targetLocationId ?? targetId("location", row.id);
  return mapped("location", row.id, row.createdAt, {
    id,
    code: row.code,
    name: row.name,
    address1: row.address1,
    city: row.city,
    state: row.state,
    zip: row.zip,
    timezone: row.timezone || "America/New_York",
    active: row.active,
    source_system: V1_SOURCE_SYSTEM,
    source_id: row.id,
    source_updated_at: asDate(row.createdAt),
    created_at: asDate(row.createdAt) ?? new Date(0),
    updated_at: asDate(row.createdAt) ?? new Date(0),
  });
}

export function mapStaff(row: V1StaffRow) {
  const id = targetId("staff", row.id);
  // Alpha staff rows are historical authorship/assignment evidence, not Apex
  // login identities. Give every imported row a stable, non-routable address
  // so duplicate/retired Alpha emails cannot collide with approved Apex staff
  // or accidentally become an authentication link.
  const migrationEmail = `alpha-v1-${sha256({ sourceId: row.id }).slice(0, 24)}@migration.invalid`;
  const roster = ROSTER.find(
    (entry) => normalizedName(`${entry.firstName}${entry.lastName}`) === normalizedName(row.name),
  );
  const rosterLocation = roster && roster.location !== "AHQ" ? roster.location : null;
  // The approved roster is the current Apex operating model. Alpha's broad
  // location label is evidence only and is used as a fallback for a person who
  // is not in the approved roster.
  const locationIds = roster
    ? (rosterLocation ? [rosterLocation] : [])
    : row.locationTargetId
      ? [row.locationTargetId]
      : row.locationId
        ? [targetId("location", row.locationId)]
        : [];
  const clinicalRole = roster?.credentialClass === "Coach"
    ? "Coach"
    : roster?.department === "Medical"
      ? "Medical"
      : role(row.role);
  const accessProfile = inferAccessProfile({
    role: clinicalRole,
    credentials: roster?.credentialClass ?? row.title,
    title: row.title ?? roster?.notes ?? null,
    department: roster?.department ?? null,
  });
  return mapped("staff", row.id, row.createdAt, {
    id,
    email: migrationEmail,
    name: row.name,
    department: roster?.department ?? (clinicalRole === "Medical" ? "Medical" : clinicalRole === "Coach" ? "Coaching" : null),
    title: row.title ?? roster?.notes ?? null,
    role: clinicalRole,
    access_profile: accessProfile,
    location_ids: locationIds,
    credentials: roster?.credentialClass ?? row.title,
    can_approve:
      row.active && (
        row.role.toUpperCase() === "PROVIDER" ||
        /^(MD|DO|NP|PA|PA-C)$/.test((roster?.credentialClass ?? row.title ?? "").toUpperCase())
      ),
    exclude_from_scheduling:
      !row.active ||
      roster?.location === "AHQ" ||
      roster?.credentialClass === "Admin" ||
      roster?.credentialClass === null ||
      row.role === "EXEC" ||
      row.role === "OPERATOR" ||
      (!rosterLocation && !row.locationTargetId && !row.locationId),
    active: row.active,
    source_system: V1_SOURCE_SYSTEM,
    source_id: row.id,
    source_updated_at: asDate(row.createdAt),
    updated_at: asDate(row.createdAt) ?? new Date(0),
  });
}

export function mapPerson(row: V1PersonRow) {
  const id = targetId("person", row.id);
  return mapped("person", row.id, row.updatedAt, {
    id,
    mrn: row.mrn || `AH-V1-${targetId("person", row.id).slice(-16).toUpperCase()}`,
    first_name: row.firstName,
    last_name: row.lastName,
    preferred_name: row.preferredName,
    date_of_birth: dateOnly(row.dob),
    sex: sex(row.sex),
    email: row.email?.trim().toLowerCase() || null,
    phone: row.phone,
    address1: row.address1,
    address2: row.address2,
    city: row.city,
    state: row.state,
    zip: row.zip,
    status: row.status.toLowerCase(),
    is_prospect: row.isProspect,
    synthetic: false,
    home_location_id: row.locationTargetId ?? (row.locationId ? targetId("location", row.locationId) : null),
    assigned_coach_id: row.assignedCoachId ? targetId("staff", row.assignedCoachId) : null,
    assigned_provider_id: null,
    source_system: V1_SOURCE_SYSTEM,
    source_id: row.id,
    source_updated_at: asDate(row.updatedAt),
    created_at: asDate(row.createdAt) ?? new Date(0),
    updated_at: asDate(row.updatedAt) ?? asDate(row.createdAt) ?? new Date(0),
  });
}

export function mapAppointment(row: V1AppointmentRow) {
  const id = targetId("appointment", row.id);
  const isTelehealth = row.type === "TELEHEALTH";
  return mapped("appointment", row.id, row.updatedAt, {
    id,
    client_id: targetId("person", row.personId),
    staff_id: row.providerId ? targetId("staff", row.providerId) : null,
    location_id: row.locationTargetId ?? (row.locationId ? targetId("location", row.locationId) : null),
    visit_type: visitType(row.type),
    modality: isTelehealth ? "virtual" : "in-person",
    start_at: asDate(row.startAt),
    end_at: asDate(row.endAt),
    status: appointmentStatus(row.status),
    room: row.resource,
    reason: row.reason,
    notes: row.notes,
    completed_at: row.status === "COMPLETED" ? asDate(row.updatedAt) : null,
    cancelled_at: row.status === "CANCELLED" ? asDate(row.updatedAt) : null,
    booked_at: asDate(row.createdAt) ?? new Date(0),
    source_system: V1_SOURCE_SYSTEM,
    source_id: row.id,
    source_updated_at: asDate(row.updatedAt),
  });
}

export function mapConsult(row: V1ConsultRow) {
  const id = targetId("consult", row.id);
  const authorId = targetId("staff", row.authorId);
  const finalizedAt = asDate(row.finalizedAt);
  const kind = row.recordClass === "medical-progress-note" ? "Medical visit" : legacyConsultKind(row.kind);
  const signed = Boolean(finalizedAt) || row.status.trim().toLowerCase() === "completed";
  return mapped("consult", row.id, row.updatedAt, {
    id,
    client_id: targetId("person", row.personId),
    author_id: authorId,
    kind,
    channel: legacyConsultChannel(row.channel, kind),
    started_at: asDate(row.startedAt) ?? asDate(row.createdAt) ?? new Date(0),
    ended_at: finalizedAt,
    duration_min: null,
    subjective: row.subjective ?? null,
    objective: row.objective ?? null,
    assessment: row.assessment ?? null,
    plan: row.plan ?? null,
    raw_notes: row.noteBody,
    ai_summary: null,
    status: signed ? "Signed" : "Historical draft",
    signed_at: signed ? (finalizedAt ?? asDate(row.updatedAt)) : null,
    signed_by: signed ? authorId : null,
    attestation: signed
      ? "Finalized in Alpha OS before migration; no Apex signature attestation was created."
      : null,
    signer_credential: null,
    visible_to_client: false,
    source_system: V1_SOURCE_SYSTEM,
    source_id: row.id,
    source_updated_at: asDate(row.updatedAt),
    supersedes_consult_id: row.previousNoteId ? targetId("consult", row.previousNoteId) : null,
    updated_at: asDate(row.updatedAt) ?? asDate(row.createdAt) ?? new Date(0),
  });
}

export function mapContactEntry(row: V1ContactEntryRow) {
  return mapped("contact-entry", row.id, row.at, {
    id: targetId("contact-entry", row.id),
    client_id: targetId("person", row.personId),
    staff_id: row.staffId ? targetId("staff", row.staffId) : null,
    at: asDate(row.at) ?? new Date(0),
    channel: row.channel.trim().toLowerCase(),
    direction: row.direction.trim().toLowerCase(),
    subject: row.subject?.trim() || null,
    outcome: null,
    notes: row.body,
    template_id: null,
    ledger_id: null,
    source_has_attachments: row.hasAttachments,
    source_external_id: row.externalId,
    source_system: V1_SOURCE_SYSTEM,
    source_id: row.id,
    source_updated_at: asDate(row.at),
  });
}

export function mapHistoricalFulfillment(row: V1HistoricalFulfillmentRow) {
  return mapped("historical-fulfillment", row.id, row.updatedAt, {
    id: targetId("historical-fulfillment", row.id),
    record_kind: row.recordKind,
    client_id: targetId("person", row.personId),
    sale_id: row.saleSourceId ? targetId("sale", row.saleSourceId) : null,
    order_number: row.orderNumber,
    external_order_ref: row.externalOrderRef,
    partner: row.partner,
    status: row.status,
    source_channel: row.sourceChannel,
    location_id: row.locationTargetId,
    source_location_label: row.sourceLocationLabel,
    coach_id: row.coachId ? targetId("staff", row.coachId) : null,
    occurred_at: asDate(row.occurredAt) ?? asDate(row.createdAt) ?? new Date(0),
    completed_at: asDate(row.completedAt),
    sku: row.sku?.trim() || null,
    item_name: row.itemName?.trim() || null,
    quantity: row.quantity === null ? null : exactInteger(row.quantity, "historical fulfillment quantity"),
    items: row.items,
    pickup: row.pickup,
    shipping_type: row.shippingType,
    tracking: row.tracking,
    carrier: row.carrier,
    est_delivery: row.estDelivery,
    delayed: row.delayed,
    delay_reason: row.delayReason,
    status_history: row.statusHistory,
    destination_snapshot: row.destinationSnapshot,
    routing_snapshot: row.routingSnapshot,
    source_system: V1_SOURCE_SYSTEM,
    source_entity_type: row.sourceEntityType,
    source_id: row.id,
    source_updated_at: asDate(row.updatedAt),
    created_at: asDate(row.createdAt) ?? new Date(0),
  });
}

export function mapMigrationException(row: V1MigrationExceptionRow) {
  const id = targetId("migration-exception", row.id);
  return mapped("migration-exception", row.id, row.sourceUpdatedAt, {
    id,
    source_system: V1_SOURCE_SYSTEM,
    source_entity_type: row.sourceEntityType,
    source_id: row.id,
    reason_code: row.reasonCode,
    payload: row.payload,
    payload_sha256: sha256(row.payload),
    status: "Pending review",
    source_updated_at: asDate(row.sourceUpdatedAt),
    created_at: asDate(row.sourceUpdatedAt) ?? new Date(0),
    updated_at: asDate(row.sourceUpdatedAt) ?? new Date(0),
  });
}

export function mapSale(row: V1SaleRow) {
  const id = targetId("sale", row.id);
  const totalCents = exactCents(row.total);
  return mapped("sale", row.id, row.createdAt, {
    id,
    client_id: targetId("person", row.personId),
    kind: totalCents < 0 ? "return" : totalCents > 0 ? "sale" : "zero-value",
    external_ref: row.externalRef,
    order_number: row.orderNumber,
    occurred_at: asDate(row.occurredAt) ?? asDate(row.createdAt) ?? new Date(0),
    location_id: row.locationTargetId,
    source_location_label: row.locationLabel,
    coach_id: row.coachId ? targetId("staff", row.coachId) : null,
    total_cents: totalCents,
    source_item_count: exactInteger(row.sourceItemCount, "sale item count"),
    actual_item_count: exactInteger(row.actualItemCount, "sale line count"),
    legacy: row.legacy,
    source_system: V1_SOURCE_SYSTEM,
    source_id: row.id,
    source_updated_at: asDate(row.createdAt),
    created_at: asDate(row.createdAt) ?? new Date(0),
  });
}

export function mapSaleLine(row: V1SaleLineRow) {
  return mapped("sale-line", row.id, null, {
    id: targetId("sale-line", row.id),
    sale_id: targetId("sale", row.saleId),
    line_index: exactInteger(row.lineIndex, "sale line index"),
    sku: row.sku?.trim() || null,
    description: row.description.trim() || "(blank description in Alpha OS)",
    quantity: exactInteger(row.quantity, "sale quantity"),
    unit_price_cents: exactCents(row.unitPrice),
    total_cents: exactCents(row.total),
    returned: row.returned,
    source_system: V1_SOURCE_SYSTEM,
    source_id: row.id,
  });
}

export function mapArchivedSource(row: V1ArchivedSourceRow) {
  const sourceKey = `${row.sourceEntityType}:${row.id}`;
  const payloadSha256 = sha256(row.payload);
  return mapped("source-record", sourceKey, row.sourceUpdatedAt, {
    id: targetId("source-record", sourceKey),
    source_system: V1_SOURCE_SYSTEM,
    source_entity_type: row.sourceEntityType,
    source_id: row.id,
    client_id: row.personId ? targetId("person", row.personId) : null,
    occurred_at: asDate(row.occurredAt),
    source_updated_at: asDate(row.sourceUpdatedAt),
    payload: row.payload,
    payload_sha256: payloadSha256,
  });
}

export function mapBinaryAsset(row: V1BinaryAssetRow): MappedRecord<Record<string, unknown>> {
  const sourceKey = `${row.sourceEntityType}:${row.id}`;
  if (row.data.length !== row.sizeBytes) {
    throw new Error(
      `${row.sourceEntityType} ${row.id} byte count ${row.data.length} does not match source size ${row.sizeBytes}`,
    );
  }
  const contentSha256 = createHash("sha256").update(row.data).digest("hex");
  const data = {
    id: targetId("binary-asset", sourceKey),
    source_system: V1_SOURCE_SYSTEM,
    source_entity_type: row.sourceEntityType,
    source_id: row.id,
    client_id: row.personId ? targetId("person", row.personId) : null,
    filename: row.filename,
    content_type: row.contentType,
    size_bytes: row.sizeBytes,
    data: row.data,
    content_sha256: contentSha256,
    category: row.category,
    source_created_by_id: row.sourceCreatedById,
    source_created_at: asDate(row.sourceCreatedAt) ?? new Date(0),
  };
  return {
    entityType: "binary-asset",
    sourceId: sourceKey,
    sourceUpdatedAt: asDate(row.sourceCreatedAt),
    targetId: String(data.id),
    // Hash metadata plus the byte digest, not Buffer's enumerable byte object.
    checksum: sha256({ ...data, data: undefined, content_sha256: contentSha256 }),
    data,
  };
}

export function mapExtract(extract: V1Extract) {
  return {
    locations: extract.locations.map(mapLocation),
    staff: extract.staff.map(mapStaff),
    people: extract.people.map(mapPerson),
    appointments: extract.appointments.map(mapAppointment),
    consults: extract.consults.map(mapConsult),
    contacts: extract.contacts.map(mapContactEntry),
    fulfillmentHistory: extract.fulfillmentHistory.map(mapHistoricalFulfillment),
    sales: extract.sales.map(mapSale),
    saleLines: extract.saleLines.map(mapSaleLine),
    exceptions: extract.exceptions.map(mapMigrationException),
    archivedRecords: extract.archivedRecords.map(mapArchivedSource),
    binaryAssets: extract.binaryAssets.map(mapBinaryAsset),
  };
}

export function extractSummary(extract: V1Extract) {
  const mappedRows = mapExtract(extract);
  const counts = {
    locations: mappedRows.locations.length,
    staff: mappedRows.staff.length,
    people: mappedRows.people.length,
    appointments: mappedRows.appointments.length,
    consults: mappedRows.consults.length,
    contacts: mappedRows.contacts.length,
    fulfillmentHistory: mappedRows.fulfillmentHistory.length,
    sales: mappedRows.sales.length,
    saleLines: mappedRows.saleLines.length,
    exceptions: mappedRows.exceptions.length,
    archivedRecords: mappedRows.archivedRecords.length,
    binaryAssets: mappedRows.binaryAssets.length,
  };
  const rowDigests = Object.values(mappedRows)
    .flat()
    .map((row) => `${row.entityType}:${row.checksum}`)
    .sort();
  return { counts, checksum: sha256(rowDigests), mapped: mappedRows };
}

/** Compare database identities without ever returning credentials. */
export function sameDatabase(left: string, right: string): boolean {
  const identity = (value: string) => {
    const url = new URL(value);
    return [url.protocol, url.hostname.toLowerCase(), url.port || "5432", url.pathname].join("|");
  };
  return identity(left) === identity(right);
}
