import type { StaffRole } from "@/lib/types";

/**
 * Operational access is not the same fact as a clinical credential.
 *
 * `StaffRole` remains the coarse authoring persona used by the existing UI.
 * This profile is the server authority used by guards. It prevents an office
 * manager, owner, nurse, and prescriber from inheriting the same powers merely
 * because older data called several of them Admin or Medical.
 */
export type AccessProfile =
  | "owner"
  | "system-admin"
  | "executive"
  | "operations"
  | "provider"
  | "nursing"
  | "coach"
  | "front-desk"
  | "billing"
  | "fulfillment"
  | "marketing"
  | "unassigned";

export const ACCESS_PROFILES: readonly AccessProfile[] = [
  "owner",
  "system-admin",
  "executive",
  "operations",
  "provider",
  "nursing",
  "coach",
  "front-desk",
  "billing",
  "fulfillment",
  "marketing",
  "unassigned",
] as const;

export function isAccessProfile(value: unknown): value is AccessProfile {
  return typeof value === "string" && ACCESS_PROFILES.includes(value as AccessProfile);
}

/**
 * One-time bridge for seeded/dev identities and the controlled V1 importer.
 * Ambiguous Medical and Admin rows return unassigned rather than guessing.
 */
export function inferAccessProfile(input: {
  id?: string;
  role: StaffRole | string;
  credentials?: string | null;
  title?: string | null;
  department?: string | null;
}): AccessProfile {
  const credential = (input.credentials ?? "").trim().toUpperCase();
  const title = `${input.title ?? ""} ${input.department ?? ""}`.toUpperCase();

  if (input.id === "st-owner" || input.id === "st-owner-matt") return "owner";
  if (input.id === "st-009" || input.id === "st-012") return "front-desk";
  if (input.id === "st-010") return "operations";
  if (input.role === "Coach") return "coach";
  if (input.role === "Medical") {
    if (/^(MD|DO|NP|PA|PA-C)$/.test(credential)) return "provider";
    if (/^(RN|LPN)$/.test(credential)) return "nursing";
    return "unassigned";
  }
  if (input.role !== "Admin") return "unassigned";

  if (/OFFICE MANAGER|FRONT DESK|PATIENT EXPERIENCE|RECEPTION/.test(title)) return "front-desk";
  if (/FULFILL|ORDER|SUPPLY|WAREHOUSE/.test(title)) return "fulfillment";
  if (/BILL|FINANCE|CFO|ACCOUNT/.test(title)) return "billing";
  if (/MARKETING|GROWTH|CAMPAIGN/.test(title)) return "marketing";
  if (/OWNER|CEO|COO|EXECUTIVE/.test(title)) return "executive";
  if (/OPERATIONS|PRODUCT MANAGER/.test(title)) return "operations";
  return "unassigned";
}
