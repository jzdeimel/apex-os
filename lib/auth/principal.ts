import { headers } from "next/headers";
import type { StaffRole } from "@/lib/types";
import { staff } from "@/lib/mock/staff";
import { IS_DEMO } from "@/lib/config";
import { inferAccessProfile, isAccessProfile, type AccessProfile } from "@/lib/authz/profiles";

/**
 * The signed-in user, from Container Apps EasyAuth.
 *
 * WHY THIS FILE MATTERS MORE THAN IT LOOKS
 * ----------------------------------------
 * The audit's second-worst finding was that authorization did not merely live
 * on the client — it did not execute at all. `lib/authz/capabilities.ts` is 276
 * lines of well-reasoned RBAC with ZERO import sites, and what actually gated a
 * Schedule III signature was `role === "Medical"` read from a React state value
 * that **defaulted every user to "Medical"** and was persisted to localStorage
 * (lib/store.tsx:96, app/recommendations/page.tsx:159). Every user was a
 * prescriber by default and could self-elevate in devtools.
 *
 * This module is the first identity in Apex that a user cannot choose for
 * themselves. EasyAuth terminates the Entra sign-in at the platform edge and
 * injects `X-MS-CLIENT-PRINCIPAL` — a base64 JSON blob of validated claims —
 * into the request. The container never sees an unauthenticated request for a
 * non-excluded path, so this header cannot be forged from outside.
 *
 * SERVER ONLY. `headers()` is a server API; importing this into a client
 * component is a build error, which is the correct outcome — an identity a
 * client component can read is an identity a client component can lie about.
 *
 * WHAT THIS IS NOT
 * ----------------
 * This is STAFF auth, single-tenant, restricted to the Alpha Health directory.
 * Patients do not have @goalphahealth.com accounts and cannot sign in, so the
 * member portal is currently reachable only by staff previewing it. Patient
 * identity needs Entra External ID (CIAM) as a separate provider — a different
 * user store, a different consent posture, and a different session lifetime.
 * Do not solve it by loosening this one to multi-tenant.
 */

export interface Principal {
  /** Entra object id — stable, and the right key to map to a staff record. */
  objectId: string;
  email: string;
  name: string;
  /** The Apex staff record this identity maps to, if one exists. */
  staffId: string | null;
  /** Role from the mapped staff record. Null when unmapped — never a default. */
  role: StaffRole | null;
  /** Job-specific server authorization profile. */
  accessProfile: AccessProfile | null;
  /** Location scope from the mapped staff row. Empty means no member scope. */
  locationIds: string[];
  /** Credential text captured on the staff row, for signatures and display. */
  credentials: string | null;
  /** Whether this staff member may approve gated clinical/commercial actions. */
  canApprove: boolean;
}

interface EasyAuthClaim {
  typ: string;
  val: string;
}

interface EasyAuthPrincipal {
  auth_typ?: string;
  name_typ?: string;
  role_typ?: string;
  claims?: EasyAuthClaim[];
}

const OID_CLAIMS = [
  "http://schemas.microsoft.com/identity/claims/objectidentifier",
  "oid",
];
const EMAIL_CLAIMS = [
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
  "preferred_username",
  "email",
  "upn",
];
const NAME_CLAIMS = ["name", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"];

function claim(claims: EasyAuthClaim[], candidates: string[]): string | undefined {
  for (const c of candidates) {
    const hit = claims.find((x) => x.typ === c)?.val;
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Read the validated principal, or null when there is none.
 *
 * Returns null rather than throwing so a read-only surface can render for an
 * excluded path. Every WRITE path must call `requirePrincipal()` instead.
 */
export async function currentPrincipal(): Promise<Principal | null> {
  // `headers()` is async as of Next 15. Awaiting it keeps this correct on 15 and
  // forward-compatible with 16 (where sync access is removed).
  const raw = (await headers()).get("x-ms-client-principal");
  if (!raw) return null;

  let parsed: EasyAuthPrincipal;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    // A malformed header is not a user. Failing closed is the only safe read.
    return null;
  }

  const claims = parsed.claims ?? [];
  const objectId = claim(claims, OID_CLAIMS);
  const email = claim(claims, EMAIL_CLAIMS) ?? "";
  const name = claim(claims, NAME_CLAIMS) ?? email;
  if (!objectId) return null;

  const mapped = await mapToStaff(objectId, email);

  return {
    objectId,
    email,
    name,
    staffId: mapped?.id ?? null,
    role: mapped?.role ?? null,
    accessProfile: mapped?.accessProfile ?? null,
    locationIds: mapped?.locationIds ?? [],
    credentials: mapped?.credentials ?? null,
    canApprove: mapped?.canApprove ?? false,
  };
}

/**
 * Map an Entra identity to an Apex staff record — AUTHORITY LIVES IN THE DB.
 *
 * Resolution order:
 *   1. The staff table, by stable Entra object id (the durable join — an email
 *      rename cannot silently re-point clinical authority).
 *   2. The staff table, by email (how a row is claimed before its objectId has
 *      been filled in; the first successful sign-in could stamp it).
 *   3. The seeded roster, by email — ONLY when no database is configured, so a
 *      local build without Postgres still authenticates. When a DB exists it is
 *      authoritative: a row deactivated there is deactivated, full stop.
 *
 * This closes the audit finding that granting someone prescriber authority was
 * an edit to a TypeScript file: with a DB present, it is now an INSERT/UPDATE on
 * the staff table (auditable, reversible, no deploy).
 *
 * UNMAPPED RETURNS NULL, NOT A DEFAULT. Somebody who signs in with a valid
 * Alpha Health account but no staff row gets NO role and no capabilities.
 */
async function mapToStaff(
  objectId: string,
  email: string,
): Promise<{
  id: string;
  role: StaffRole;
  accessProfile: AccessProfile;
  locationIds: string[];
  credentials: string | null;
  canApprove: boolean;
} | null> {
  const lower = email.toLowerCase();

  // DB-first. isConfigured is false when DATABASE_URL is absent (local builds).
  const { isConfigured } = await import("@/lib/db/client");
  if (isConfigured) {
    try {
      const { staffByObjectId, staffByEmail, claimStaffObjectIdByEmail } = await import("@/lib/db/repo");
      const byOid = objectId ? await staffByObjectId(objectId) : null;
      const byEmail = byOid ? null : lower ? await staffByEmail(lower) : null;
      if (byEmail?.entraObjectId && byEmail.entraObjectId !== objectId) return null;
      if (byEmail && !byEmail.entraObjectId && objectId) {
        await claimStaffObjectIdByEmail(lower, objectId);
      }
      const row = byOid ?? byEmail;
      // With a database present it is the authority — including the answer "no".
      return row
        ? {
            id: row.id,
            role: row.role as StaffRole,
            accessProfile: isAccessProfile(row.accessProfile) ? row.accessProfile : "unassigned",
            locationIds: row.locationIds,
            credentials: row.credentials,
            canApprove: row.canApprove,
          }
        : null;
    } catch (err) {
      /**
       * FAIL CLOSED.
       *
       * This used to fall through to the seeded roster on any database error,
       * which meant a DB outage silently PROMOTED the identity model back to a
       * checked-in TypeScript file: someone deactivated in the database would
       * be authorised again, with whatever role the seed happens to carry, for
       * as long as the database was unreachable. An attacker who can induce a
       * database error can therefore choose which authority table applies.
       *
       * Losing authority when we cannot verify it is the correct failure. The
       * caller sees "no staff record", which the guard turns into a 403.
       */
      console.error(
        "[apex] staff lookup failed — failing closed:",
        err instanceof Error ? err.message : err,
      );
      if (!IS_DEMO) return null;
      // Demo builds only: fall through to the seed so a demo survives a blip.
    }
  }

  if (!lower) return null;
  const hit = staff.find((s) => s.email?.toLowerCase() === lower);
  return hit
    ? {
        id: hit.id,
        role: hit.role,
        accessProfile: inferAccessProfile({
          id: hit.id,
          role: hit.role,
          credentials: hit.credentials,
          title: hit.bio,
        }),
        locationIds: hit.locationIds ?? [],
        credentials: hit.credentials ?? null,
        canApprove: hit.canApprove ?? false,
      }
    : null;
}

/**
 * The principal, or throw.
 *
 * Every mutating server path calls this. The thrown error is deliberately
 * boring and carries no claim detail — an authorization failure should not
 * teach the caller about the identity model.
 */
export async function requirePrincipal(): Promise<Principal> {
  const p = await currentPrincipal();
  if (!p) {
    throw new Error("Not authenticated.");
  }
  return p;
}
