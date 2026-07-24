import type { NextResponse } from "next/server";
import { fail } from "@/lib/api/respond";
import { currentPrincipal, type Principal } from "@/lib/auth/principal";
import { actorFromPrincipal } from "@/lib/auth/actor";
import { can, type Actor, type Capability } from "@/lib/authz/capabilities";

/**
 * The one gate every mutating endpoint passes through.
 *
 * Three checks, in order, each failing closed:
 *   1. Authenticated?  No principal → 401.
 *   2. A staff member? Authenticated but unmapped → 403 (no role, no writes).
 *   3. Permitted?      can() says no → 403 with the reason it gives.
 *
 * This is the thing the audit said was missing: `can()` finally guarding real
 * server mutations rather than being decoration the client could ignore. A
 * route that calls this cannot be made to write by a client that lies about its
 * role, because the role is resolved from the Entra principal here, server-side.
 */
export type GuardResult =
  | { ok: true; actor: Actor; principal: Principal }
  | { ok: false; res: NextResponse };

export async function guard(
  capability: Capability,
  subject?: { coachId?: string; providerId?: string; locationId?: string },
): Promise<GuardResult> {
  const principal = await currentPrincipal();
  if (!principal) {
    return { ok: false, res: fail(401, "Not authenticated.") };
  }
  const actor = actorFromPrincipal(principal);
  if (!actor) {
    return {
      ok: false,
      res: fail(403, "No staff record for this sign-in."),
    };
  }
  const decision = can(actor, capability, subject);
  if (!decision.allowed) {
    return { ok: false, res: fail(403, decision.reason) };
  }
  return { ok: true, actor, principal };
}
