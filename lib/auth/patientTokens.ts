import { createHash, randomBytes, randomUUID } from "node:crypto";

export const PATIENT_SESSION_COOKIE = "apex_patient_session";
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
export const PATIENT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const PATIENT_SESSION_IDLE_TTL_MS = 15 * 60 * 1000;

export function opaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function tokenSha256(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function authRecordId(prefix: "identity" | "link" | "session"): string {
  return `${prefix}-${randomUUID()}`;
}

export function normalizePatientEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Server-side sliding-idle plus absolute-lifetime decision. */
export function patientSessionIsActive(
  lastSeenAt: Date,
  expiresAt: Date,
  now = new Date(),
): boolean {
  return expiresAt.getTime() > now.getTime() &&
    lastSeenAt.getTime() > now.getTime() - PATIENT_SESSION_IDLE_TTL_MS;
}

/** The token lives in the fragment, so proxies and server access logs never see it. */
export function patientSignInUrl(origin: string, token: string): string {
  const url = new URL("/patient-sign-in", origin);
  url.hash = `token=${encodeURIComponent(token)}`;
  return url.toString();
}
