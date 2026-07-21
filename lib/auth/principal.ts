import { headers } from "next/headers";
import type { StaffRole } from "@/lib/types";
import { staff } from "@/lib/mock/staff";

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

  const mapped = mapToStaff(email);

  return {
    objectId,
    email,
    name,
    staffId: mapped?.id ?? null,
    role: mapped?.role ?? null,
  };
}

/**
 * Map an Entra identity to an Apex staff record, by email.
 *
 * Email is a weak join key and this is explicitly an interim measure: email
 * addresses change, and a rename would silently strip someone's clinical
 * authority. The durable fix is an `entraObjectId` column on the staff record,
 * which is why `Principal.objectId` is carried even though nothing consumes it
 * yet — the column lands with the staff table, and this function switches to it.
 *
 * UNMAPPED RETURNS NULL, NOT A DEFAULT. Somebody who signs in with a valid
 * Alpha Health account but has no staff record gets NO role and therefore no
 * capabilities. That is the whole correction: the previous implementation
 * defaulted to "Medical".
 */
function mapToStaff(email: string): { id: string; role: StaffRole } | null {
  if (!email) return null;
  const lower = email.toLowerCase();
  const hit = staff.find((s) => s.email?.toLowerCase() === lower);
  return hit ? { id: hit.id, role: hit.role } : null;
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
