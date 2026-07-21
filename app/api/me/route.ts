import { NextResponse } from "next/server";
import { currentPrincipal } from "@/lib/auth/principal";
import { can } from "@/lib/authz/capabilities";

/**
 * Who am I, and what may I do.
 *
 * This is the first endpoint in Apex where the answer is not something the
 * caller chose. It also gives `can()` — 276 lines of RBAC that the audit found
 * had ZERO import sites — its first real call site, resolved against an Entra
 * identity rather than a localStorage string that defaulted everyone to
 * "Medical".
 *
 * Returns the capability decisions rather than the capability list, because a
 * decision carries its reason and a list does not.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const p = await currentPrincipal();

  if (!p) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  // An authenticated user with no staff record has NO role and therefore no
  // capabilities. Reported explicitly so the state is legible rather than
  // looking like a bug.
  const actor = p.staffId && p.role ? { id: p.staffId, role: p.role } : null;

  const decide = (cap: Parameters<typeof can>[1]) =>
    actor ? can(actor as never, cap) : { allowed: false, reason: "No staff record for this sign-in." };

  return NextResponse.json({
    authenticated: true,
    email: p.email,
    name: p.name,
    staffId: p.staffId,
    role: p.role,
    mapped: actor !== null,
    may: {
      writePrescription: decide("write:prescription"),
      signPlanOfCare: decide("sign:plan-of-care"),
      writeConsult: decide("write:consult"),
      readAllClients: decide("read:all-clients"),
    },
  });
}
