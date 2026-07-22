import type { StaffRole } from "@/lib/types";
import type { ConsultChannel, ConsultKind } from "@/lib/consult/types";

export const CONSULT_KINDS = [
  "Coach consult",
  "Check-in",
  "Intake",
  "Medical visit",
  "Medical follow-up",
  "Medical telehealth",
  "Medical chart review",
  "Provider visit",
  "Follow-up",
  "Telehealth",
] as const satisfies readonly ConsultKind[];

export const CONSULT_CHANNELS = [
  "In person",
  "Phone",
  "Video",
  "Messaging",
  "Chart review",
] as const satisfies readonly ConsultChannel[];

const COACH_CONSULT_KINDS = [
  "Coach consult",
  "Check-in",
  "Intake",
  "Follow-up",
  "Telehealth",
] as const satisfies readonly ConsultKind[];

const MEDICAL_CONSULT_KINDS = [
  "Medical visit",
  "Medical follow-up",
  "Medical telehealth",
  "Medical chart review",
] as const satisfies readonly ConsultKind[];

const COACH_CONSULT_CHANNELS = [
  "In person",
  "Phone",
  "Video",
  "Messaging",
] as const satisfies readonly ConsultChannel[];

const MEDICAL_CONSULT_CHANNELS = [
  "In person",
  "Phone",
  "Video",
  "Chart review",
] as const satisfies readonly ConsultChannel[];

export function isConsultKind(value: unknown): value is ConsultKind {
  return typeof value === "string" && (CONSULT_KINDS as readonly string[]).includes(value);
}

export function isConsultChannel(value: unknown): value is ConsultChannel {
  return typeof value === "string" && (CONSULT_CHANNELS as readonly string[]).includes(value);
}

/** The coach owns messaging; Medical documents clinical encounters and chart reviews. */
export function defaultConsultKind(role: StaffRole | null): ConsultKind {
  return role === "Medical" ? "Medical visit" : "Coach consult";
}

export function defaultConsultChannel(_role: StaffRole | null): ConsultChannel {
  return "In person";
}

export function consultKindsForRole(role: StaffRole | null): readonly ConsultKind[] {
  return role === "Medical" ? MEDICAL_CONSULT_KINDS : COACH_CONSULT_KINDS;
}

export function consultChannelsForRole(role: StaffRole | null): readonly ConsultChannel[] {
  return role === "Medical" ? MEDICAL_CONSULT_CHANNELS : COACH_CONSULT_CHANNELS;
}

export function isConsultKindAllowedForRole(
  value: unknown,
  role: StaffRole | null,
): value is ConsultKind {
  return consultKindsForRole(role).some((kind) => kind === value);
}

export function isConsultChannelAllowedForRole(
  value: unknown,
  role: StaffRole | null,
): value is ConsultChannel {
  return consultChannelsForRole(role).some((channel) => channel === value);
}

/**
 * Bring an unsigned legacy draft into the workflow its current author is
 * allowed to use. Signed history is normalized without this role filter.
 */
export function consultKindForRole(value: unknown, role: StaffRole | null): ConsultKind {
  const normalized = normalizeConsultKind(value, role);
  return isConsultKindAllowedForRole(normalized, role) ? normalized : defaultConsultKind(role);
}

export function consultChannelForRole(value: unknown, role: StaffRole | null): ConsultChannel {
  const normalized = normalizeConsultChannel(value, role);
  return isConsultChannelAllowedForRole(normalized, role) ? normalized : defaultConsultChannel(role);
}

/** Normalize the two legacy database values written before metadata was collected. */
export function normalizeConsultKind(value: unknown, role: StaffRole | null = null): ConsultKind {
  if (role === "Medical" && value === "Provider visit") return "Medical visit";
  if (isConsultKind(value)) return value;
  if (value === "medical") return "Medical chart review";
  if (value === "provider") return "Provider visit";
  if (value === "coaching") return "Coach consult";
  return defaultConsultKind(role);
}

export function normalizeConsultChannel(
  value: unknown,
  role: StaffRole | null = null,
): ConsultChannel {
  if (isConsultChannel(value)) return value;
  if (value === "in-person") return "In person";
  if (value === "phone") return "Phone";
  if (value === "video") return "Video";
  if (value === "messaging") return "Messaging";
  if (value === "chart-review") return "Chart review";
  return defaultConsultChannel(role);
}
