import { NextRequest, NextResponse } from "next/server";
import { fail, unavailable } from "@/lib/api/respond";
import { requestIsSameOrigin } from "@/lib/api/origin";
import { guard } from "@/lib/auth/guard";
import { nowIso } from "@/lib/clock";
import {
  readReferralQueue,
  transitionPatientReferral,
} from "@/lib/db/repo";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const g = await guard("read:crm");
  if (!g.ok) return g.res;
  try {
    const status = request.nextUrl.searchParams.get("status") ?? undefined;
    const referrals = await readReferralQueue(status);
    return NextResponse.json({ ok: true, authoritative: true, referrals });
  } catch (error) {
    return unavailable("referrals.queue", error, "The referral queue is temporarily unavailable.");
  }
}

export async function PATCH(request: NextRequest) {
  if (!requestIsSameOrigin(request)) {
    return fail(403, "This referral action came from an untrusted origin.");
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.id !== "string" ||
    (body.action !== "qualify" && body.action !== "reward" && body.action !== "revoke")
  ) {
    return fail(400, "id and action are required.");
  }
  const g = await guard("write:crm");
  if (!g.ok) return g.res;
  try {
    const result = await transitionPatientReferral({
      id: body.id,
      action: body.action,
      rewardDescription:
        typeof body.rewardDescription === "string"
          ? body.rewardDescription
          : undefined,
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      at: nowIso(),
    });
    if (result.status === "missing") return fail(404, "Unknown referral.");
    if (result.status === "conflict") return fail(409, result.reason);
    return NextResponse.json({
      ok: true,
      authoritative: true,
      referral: result.referral,
      ledgerId: result.ledger.id,
    });
  } catch (error) {
    return unavailable("referrals.transition", error, "The referral status was not changed.");
  }
}
