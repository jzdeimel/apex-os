import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/authz/capabilities";
import { readBillingAccount } from "@/lib/db/billingRepo";
import { readClientCareScope } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) return fail(400, "clientId is required.");
  const g = await guard("read:financial");
  if (!g.ok) return g.res;
  try {
    const scope = await readClientCareScope(clientId);
    if (!scope) return fail(404, "Unknown patient.");
    const subject = {
      coachId: scope.assignedCoachId ?? undefined,
      providerId: scope.assignedProviderId ?? undefined,
      locationId: scope.locationId ?? undefined,
    };
    const decision = can(g.actor, "read:financial", subject);
    if (!decision.allowed) return fail(403, decision.reason);
    const account = await readBillingAccount(clientId);
    if (!account) return fail(404, "Unknown patient.");
    return NextResponse.json({
      ok: true,
      account,
      permissions: {
        manageMembership: can(g.actor, "write:membership", subject).allowed,
        createInvoice: can(g.actor, "write:invoice", subject).allowed,
        reconcilePayment: can(g.actor, "write:payment", subject).allowed,
        refund: can(g.actor, "write:refund", subject).allowed,
      },
      // The adapter deliberately refuses money movement today. An environment
      // variable cannot turn unfinished transport into a configured processor.
      paymentTransport: "not-enabled",
    });
  } catch (error) {
    return unavailable("billing.account.read", error, "Billing history is temporarily unavailable.");
  }
}
