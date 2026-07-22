import { createHash } from "node:crypto";
import { ROSTER } from "@/lib/mock/roster";
import { inferAccessProfile } from "@/lib/authz/profiles";

export const V1_SOURCE_SYSTEM = "alpha-v1";

export type V1EntityType = "location" | "staff" | "person" | "appointment";

type Dateish = Date | string | null;

export interface V1LocationRow {
  id: string;
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
  createdAt: Dateish;
  updatedAt: Dateish;
}

export interface V1AppointmentRow {
  id: string;
  personId: string;
  providerId: string | null;
  locationId: string | null;
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

export interface V1Extract {
  locations: V1LocationRow[];
  staff: V1StaffRow[];
  people: V1PersonRow[];
  appointments: V1AppointmentRow[];
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
  return asDate(value)?.toISOString().slice(0, 10) ?? null;
}

function role(value: string): "Admin" | "Coach" | "Medical" {
  if (value === "COACH") return "Coach";
  if (value === "PROVIDER" || value === "NURSE") return "Medical";
  return "Admin";
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
  return map[value] ?? value;
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
  return map[value] ?? value;
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

export function mapLocation(row: V1LocationRow) {
  const id = targetId("location", row.id);
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
  const roster = ROSTER.find(
    (entry) => normalizedName(`${entry.firstName}${entry.lastName}`) === normalizedName(row.name),
  );
  const rosterLocation = roster && roster.location !== "AHQ" ? roster.location : null;
  const locationIds = row.locationId
    ? [targetId("location", row.locationId)]
    : rosterLocation
      ? [rosterLocation]
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
    email: row.email.trim().toLowerCase(),
    name: row.name,
    department: roster?.department ?? (clinicalRole === "Medical" ? "Medical" : clinicalRole === "Coach" ? "Coaching" : null),
    title: row.title ?? roster?.notes ?? null,
    role: clinicalRole,
    access_profile: accessProfile,
    location_ids: locationIds,
    credentials: roster?.credentialClass ?? row.title,
    can_approve: row.role === "PROVIDER",
    exclude_from_scheduling:
      roster?.location === "AHQ" ||
      roster?.credentialClass === "Admin" ||
      roster?.credentialClass === null ||
      row.role === "EXEC" ||
      row.role === "OPERATOR" ||
      (!rosterLocation && !row.locationId),
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
    mrn: row.mrn,
    first_name: row.firstName,
    last_name: row.lastName,
    preferred_name: row.preferredName,
    date_of_birth: dateOnly(row.dob),
    sex: row.sex.toLowerCase(),
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
    home_location_id: row.locationId ? targetId("location", row.locationId) : null,
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
    location_id: row.locationId ? targetId("location", row.locationId) : null,
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

export function mapExtract(extract: V1Extract) {
  return {
    locations: extract.locations.map(mapLocation),
    staff: extract.staff.map(mapStaff),
    people: extract.people.map(mapPerson),
    appointments: extract.appointments.map(mapAppointment),
  };
}

export function extractSummary(extract: V1Extract) {
  const mappedRows = mapExtract(extract);
  const counts = {
    locations: mappedRows.locations.length,
    staff: mappedRows.staff.length,
    people: mappedRows.people.length,
    appointments: mappedRows.appointments.length,
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
