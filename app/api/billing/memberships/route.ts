import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/authz/capabilities";
import {
  isMembershipStatus,
  membershipEventRequestId,
  membershipRequestId,
} from "@/lib/billing/lifecycle";
import { nowIso } from "@/lib/clock";
import {
  createMembershipWithLedger,
  readMembershipScope,
  transitionMembershipWithLedger,
} from "@/lib/db/billingRepo";
import { readClientCareScope } from "@/lib/db/repo";
import { merchantForPatient } from "@/lib/payments/merchants";
import type { LocationId } from "@/lib/types";

export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

function dateOnly(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This membership request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.clientId !== "string" || typeof body.requestId !== "string" || body.requestId.length < 8 || body.requestId.length > 200) {
    return fail(400, "clientId and a stable requestId are required.");
  }
  if (typeof body.planCode !== "string" || !body.planCode.trim() || body.planCode.length > 80 ||
      typeof body.planName !== "string" || !body.planName.trim() || body.planName.length > 200) {
    return fail(400, "A plan code and plan name are required.");
  }
  if (!Number.isSafeInteger(body.monthlyRateCents) || (body.monthlyRateCents as number) < 0 || (body.monthlyRateCents as number) > 100_000_000) {
    return fail(400, "monthlyRateCents must be a non-negative whole-cent amount.");
  }
  if (!dateOnly(body.startedOn) || (body.nextBillOn !== undefined && body.nextBillOn !== null && !dateOnly(body.nextBillOn))) {
    return fail(400, "Membership dates must use YYYY-MM-DD.");
  }
  const g = await guard("write:membership");
  if (!g.ok) return g.res;
  try {
    const scope = await readClientCareScope(body.clientId);
    if (!scope || scope.status !== "active" || !scope.locationId) return fail(404, "Unknown active patient with a home clinic.");
    const decision = can(g.actor, "write:membership", {
      coachId: scope.assignedCoachId ?? undefined,
      providerId: scope.assignedProviderId ?? undefined,
      locationId: scope.locationId,
    });
    if (!decision.allowed) return fail(403, decision.reason);
    const merchantAccountId = merchantForPatient(scope.locationId as LocationId);
    const id = membershipRequestId(body.clientId, body.requestId);
    const result = await createMembershipWithLedger({
      id,
      eventId: membershipEventRequestId(id, body.requestId),
      clientId: body.clientId,
      planCode: body.planCode.trim(),
      planName: body.planName.trim(),
      monthlyRateCents: body.monthlyRateCents as number,
      startedOn: body.startedOn as string,
      nextBillOn: typeof body.nextBillOn === "string" ? body.nextBillOn : undefined,
      homeLocationId: scope.locationId,
      merchantAccountId,
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      at: nowIso(),
    });
    if (result.status !== "ok") return fail(result.status === "missing" ? 404 : 409, result.reason ?? "Membership request conflicts with the current record.");
    return NextResponse.json({ ok: true, membership: result.membership, duplicate: result.duplicate, ledgerId: result.ledger?.id ?? result.membership?.ledgerId });
  } catch (error) {
    return unavailable("billing.membership.create", error, "The membership was not confirmed. Check merchant configuration and retry.");
  }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This membership request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.membershipId !== "string" || typeof body.requestId !== "string" || body.requestId.length < 8 || body.requestId.length > 200 ||
      typeof body.toStatus !== "string" || !isMembershipStatus(body.toStatus) || body.toStatus === "past_due" ||
      typeof body.reason !== "string" || body.reason.trim().length < 3 || body.reason.length > 1_000) {
    return fail(400, "membershipId, stable requestId, supported status, and a reason are required.");
  }
  if (body.nextBillOn !== undefined && body.nextBillOn !== null && !dateOnly(body.nextBillOn)) return fail(400, "nextBillOn must use YYYY-MM-DD.");
  const g = await guard("write:membership");
  if (!g.ok) return g.res;
  try {
    const scope = await readMembershipScope(body.membershipId);
    if (!scope) return fail(404, "Unknown membership.");
    const decision = can(g.actor, "write:membership", {
      coachId: scope.coachId ?? undefined,
      providerId: scope.providerId ?? undefined,
      locationId: scope.locationId ?? undefined,
    });
    if (!decision.allowed) return fail(403, decision.reason);
    const result = await transitionMembershipWithLedger({
      membershipId: body.membershipId,
      eventId: membershipEventRequestId(body.membershipId, body.requestId),
      toStatus: body.toStatus,
      reason: body.reason.trim(),
      nextBillOn: typeof body.nextBillOn === "string" ? body.nextBillOn : body.nextBillOn === null ? null : undefined,
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      at: nowIso(),
    });
    if (result.status !== "ok") return fail(result.status === "missing" ? 404 : 409, result.reason ?? "Membership transition conflicts with the current record.");
    return NextResponse.json({ ok: true, membership: result.membership, duplicate: result.duplicate, ledgerId: result.ledger?.id ?? result.membership?.ledgerId });
  } catch (error) {
    return unavailable("billing.membership.transition", error, "The membership transition was not confirmed. Please retry.");
  }
}
