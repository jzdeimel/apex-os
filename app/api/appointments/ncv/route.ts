import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { hasCapability } from "@/lib/authz/capabilities";
import { nowIso } from "@/lib/clock";
import {
  bookNcvWithLedger,
  changeNcvGroupWithLedger,
  readClientCareScope,
  readNcvGroupCareScope,
} from "@/lib/db/repo";
import { ncvRequestId } from "@/lib/scheduling/lifecycle";

export const dynamic = "force-dynamic";

const REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;
const GROUP_ID = /^ncv-[a-f0-9]{40}$/;

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

function instant(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function careSubject(scope: Awaited<ReturnType<typeof readClientCareScope>>) {
  return scope ? {
    coachId: scope.assignedCoachId ?? undefined,
    providerId: scope.assignedProviderId ?? undefined,
    locationId: scope.locationId ?? undefined,
  } : undefined;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This booking request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.clientId !== "string" || typeof body.locationId !== "string") {
    return fail(400, "clientId and locationId are required.");
  }
  if (typeof body.requestId !== "string" || !REQUEST_ID.test(body.requestId)) return fail(400, "A valid requestId is required.");
  const startAt = instant(body.startAt);
  if (!startAt) return fail(400, "A valid NCV start time is required.");
  if (startAt < new Date(Date.now() - 5 * 60_000)) return fail(400, "A new NCV cannot be booked in the past.");
  const gapMinutes = body.gapMinutes === undefined ? 0 : Number(body.gapMinutes);
  if (!Number.isInteger(gapMinutes) || gapMinutes < 0 || gapMinutes > 30) return fail(400, "gapMinutes must be an integer from 0 through 30.");
  if (typeof body.reason === "string" && body.reason.length > 10_000) return fail(400, "The visit reason is too long.");
  if (typeof body.overrideReason === "string" && body.overrideReason.length > 2_000) return fail(400, "The hours exception reason is too long.");

  try {
    const scope = await readClientCareScope(body.clientId);
    if (!scope || scope.status !== "active") return fail(404, "Unknown active patient.");
    if (scope.locationId !== body.locationId) return fail(409, "An NCV must be booked at the patient's owning clinic unless the home clinic is changed first.");
    const g = await guard("write:schedule", careSubject(scope));
    if (!g.ok) return g.res;
    const overrideReason = typeof body.overrideReason === "string" ? body.overrideReason.trim() : "";
    if (overrideReason && !hasCapability(g.actor.accessProfile, "override:schedule")) return fail(403, "Your job profile cannot approve an hours exception.");

    const result = await bookNcvWithLedger({
      groupId: ncvRequestId(body.clientId, body.requestId),
      clientId: body.clientId,
      locationId: body.locationId,
      startAt: startAt.toISOString(),
      gapMinutes,
      preferProviderId: typeof body.preferProviderId === "string" ? body.preferProviderId : scope.assignedProviderId ?? undefined,
      reason: typeof body.reason === "string" ? body.reason.trim() : undefined,
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      at: nowIso(),
      overrideReason: overrideReason || undefined,
    });
    if (result.status !== "ok") return NextResponse.json({ ok: false, ...result }, { status: result.status === "blocked" ? 409 : 400 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return unavailable("appointments.ncv.book", error, "The NCV was not confirmed. No component was booked; please retry.");
  }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This scheduling request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.groupId !== "string" || !GROUP_ID.test(body.groupId) || (body.action !== "cancel" && body.action !== "reschedule" && body.action !== "no-show")) {
    return fail(400, "A valid groupId and action (cancel, reschedule, or no-show) are required.");
  }
  if (typeof body.reason !== "string" || !body.reason.trim()) return fail(400, "A reason is required.");
  if (body.reason.length > 10_000) return fail(400, "The reason is too long.");
  if (typeof body.overrideReason === "string" && body.overrideReason.length > 2_000) return fail(400, "The hours exception reason is too long.");
  const startAt = body.action === "reschedule" ? instant(body.startAt) : null;
  if (body.action === "reschedule" && !startAt) return fail(400, "A valid new start time is required.");
  if (startAt && startAt < new Date(Date.now() - 5 * 60_000)) return fail(400, "An NCV cannot be rescheduled into the past.");

  try {
    const scope = await readNcvGroupCareScope(body.groupId);
    if (!scope) return fail(404, "Unknown NCV booking group.");
    const g = await guard("write:schedule", {
      coachId: scope.assignedCoachId ?? undefined,
      providerId: scope.assignedProviderId ?? undefined,
      locationId: scope.locationId ?? scope.homeLocationId ?? undefined,
    });
    if (!g.ok) return g.res;
    const overrideReason = typeof body.overrideReason === "string" ? body.overrideReason.trim() : "";
    if (overrideReason && !hasCapability(g.actor.accessProfile, "override:schedule")) return fail(403, "Your job profile cannot approve an hours exception.");
    const result = await changeNcvGroupWithLedger({
      groupId: body.groupId,
      action: body.action,
      startAt: startAt?.toISOString(),
      reason: body.reason.trim(),
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      at: nowIso(),
      overrideReason: overrideReason || undefined,
    });
    if (result.status !== "ok") return NextResponse.json({ ok: false, ...result }, { status: result.status === "missing" ? 404 : result.status === "blocked" || result.status === "conflict" ? 409 : 400 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return unavailable("appointments.ncv.change", error, "The NCV change was not applied. Its components remain unchanged.");
  }
}
