import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { nowIso } from "@/lib/clock";
import {
  bookAppointmentWithLedger,
  changeAppointmentWithLedger,
  readAppointmentCareScope,
  readAppointments,
  readClientCareScope,
} from "@/lib/db/repo";
import { appointmentRequestId } from "@/lib/scheduling/lifecycle";

export const dynamic = "force-dynamic";

const REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;
const ACTIONS = new Set(["arrive", "room", "complete", "no-show", "cancel", "reopen", "reschedule", "reassign"]);

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

function instant(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function careSubject(scope: Awaited<ReturnType<typeof readClientCareScope>>) {
  return scope ? {
    coachId: scope.assignedCoachId ?? undefined,
    providerId: scope.assignedProviderId ?? undefined,
    locationId: scope.locationId ?? undefined,
  } : undefined;
}

export async function GET(request: NextRequest) {
  const g = await guard("read:schedule");
  if (!g.ok) return g.res;
  const from = instant(request.nextUrl.searchParams.get("from"));
  const to = instant(request.nextUrl.searchParams.get("to"));
  if (!from || !to || to <= from) return fail(400, "A valid from/to window is required.");
  if (to.getTime() - from.getTime() > 62 * 86_400_000) return fail(400, "Schedule windows cannot exceed 62 days.");

  let clientId = request.nextUrl.searchParams.get("clientId") ?? undefined;
  let staffId = request.nextUrl.searchParams.get("staffId") ?? undefined;
  const locationId = request.nextUrl.searchParams.get("locationId") ?? undefined;
  try {
    if (clientId) {
      const scope = await readClientCareScope(clientId);
      if (!scope || scope.status !== "active") return fail(404, "Unknown active patient.");
      const scoped = await guard("read:chart", careSubject(scope));
      if (!scoped.ok) return scoped.res;
    } else if (g.actor.role !== "Admin") {
      // Non-admin schedule reads are deliberately self-only. Team availability
      // can be exposed later without patient names through a separate free/busy API.
      staffId = g.actor.id;
    }
    const appointments = await readAppointments({
      from: from.toISOString(),
      to: to.toISOString(),
      clientId,
      staffId,
      locationId,
    });
    return NextResponse.json({ ok: true, appointments });
  } catch (error) {
    return unavailable("appointments.list", error, "The live schedule is temporarily unavailable.");
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This booking request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.clientId !== "string" || typeof body.staffId !== "string" || typeof body.locationId !== "string") {
    return fail(400, "clientId, staffId, and locationId are required.");
  }
  if (typeof body.visitType !== "string" || !body.visitType.trim()) return fail(400, "visitType is required.");
  if (typeof body.modality !== "string" || !body.modality.trim()) return fail(400, "modality is required.");
  if (typeof body.requestId !== "string" || !REQUEST_ID.test(body.requestId)) return fail(400, "A valid requestId is required.");
  const startAt = instant(body.startAt);
  const endAt = instant(body.endAt);
  if (!startAt || !endAt || endAt <= startAt) return fail(400, "The appointment start and end are invalid.");
  if (endAt.getTime() - startAt.getTime() > 8 * 3_600_000) return fail(400, "An appointment cannot exceed eight hours.");
  if (typeof body.reason === "string" && body.reason.length > 10_000) return fail(400, "The visit reason is too long.");

  try {
    const scope = await readClientCareScope(body.clientId);
    if (!scope || scope.status !== "active") return fail(404, "Unknown active patient.");
    const g = await guard("write:schedule", careSubject(scope));
    if (!g.ok) return g.res;
    const overrideReason = typeof body.overrideReason === "string" ? body.overrideReason.trim() : "";
    if (overrideReason && g.actor.role !== "Admin") return fail(403, "Only Admin can approve a scheduling override.");
    if (startAt < new Date(Date.now() - 5 * 60_000) && !overrideReason) return fail(400, "New appointments cannot be booked in the past.");

    const result = await bookAppointmentWithLedger({
      id: appointmentRequestId(body.clientId, body.requestId),
      clientId: body.clientId,
      staffId: body.staffId,
      locationId: body.locationId,
      visitType: body.visitType.trim(),
      modality: body.modality.trim(),
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      reason: typeof body.reason === "string" ? body.reason.trim() : undefined,
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      at: nowIso(),
      overrideReason: overrideReason || undefined,
    });
    if (!result.appointment) return NextResponse.json({ ok: false, error: result.issues.join(" "), issues: result.issues }, { status: 409 });
    return NextResponse.json({ ok: true, duplicate: result.duplicate, appointment: result.appointment, ledgerId: result.ledger?.id ?? null, overrideIssues: result.issues });
  } catch (error) {
    return unavailable("appointments.book", error, "The appointment was not confirmed. Please retry.");
  }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This scheduling request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string" || typeof body.action !== "string" || !ACTIONS.has(body.action)) {
    return fail(400, "A valid appointment id and action are required.");
  }
  const startAt = body.startAt === undefined ? undefined : instant(body.startAt);
  const endAt = body.endAt === undefined ? undefined : instant(body.endAt);
  if ((body.startAt !== undefined && !startAt) || (body.endAt !== undefined && !endAt)) return fail(400, "The new appointment time is invalid.");
  if (startAt && endAt && endAt <= startAt) return fail(400, "The appointment must end after it starts.");

  try {
    const loaded = await readAppointmentCareScope(body.id);
    if (!loaded) return fail(404, "Unknown appointment.");
    const g = await guard("write:schedule", {
      coachId: loaded.assignedCoachId ?? undefined,
      providerId: loaded.assignedProviderId ?? undefined,
      locationId: loaded.appointment.locationId ?? loaded.homeLocationId ?? undefined,
    });
    if (!g.ok) return g.res;
    const overrideReason = typeof body.overrideReason === "string" ? body.overrideReason.trim() : "";
    if (overrideReason && g.actor.role !== "Admin") return fail(403, "Only Admin can approve a scheduling override.");
    if (body.action === "reopen" && g.actor.role !== "Admin") return fail(403, "Only Admin can reopen a closed appointment.");
    const result = await changeAppointmentWithLedger({
      id: body.id,
      action: body.action as "arrive" | "room" | "complete" | "no-show" | "cancel" | "reopen" | "reschedule" | "reassign",
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      at: nowIso(),
      room: typeof body.room === "string" ? body.room : undefined,
      reason: typeof body.reason === "string" ? body.reason : undefined,
      startAt: startAt?.toISOString(),
      endAt: endAt?.toISOString(),
      staffId: typeof body.staffId === "string" ? body.staffId : undefined,
      locationId: typeof body.locationId === "string" ? body.locationId : undefined,
      overrideReason: overrideReason || undefined,
    });
    if (result.status === "missing") return fail(404, "Unknown appointment.");
    if (result.status !== "ok") return fail(result.status === "conflict" ? 409 : 400, result.reason);
    return NextResponse.json({ ok: true, appointment: result.appointment, ledgerId: result.ledger.id });
  } catch (error) {
    return unavailable("appointments.change", error, "The appointment change was not confirmed. Please retry.");
  }
}

