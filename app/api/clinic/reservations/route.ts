import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { nowIso } from "@/lib/clock";
import {
  readClinicResourceScope,
  readResourceReservationScope,
  releaseClinicResourceWithLedger,
  reserveClinicResourceWithLedger,
} from "@/lib/db/clinicResourcesRepo";
import { resourceReservationRequestId } from "@/lib/clinic-resources/lifecycle";

export const dynamic = "force-dynamic";

const REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;

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

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This reservation request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.resourceId !== "string" || typeof body.requestId !== "string" || !REQUEST_ID.test(body.requestId)) return fail(400, "resourceId and a valid requestId are required.");
  if (typeof body.appointmentId !== "string" && typeof body.encounterId !== "string") return fail(400, "appointmentId or encounterId is required.");
  const startAt = instant(body.startAt);
  const endAt = instant(body.endAt);
  if (!startAt || !endAt || endAt <= startAt) return fail(400, "A valid reservation interval is required.");
  const resource = await readClinicResourceScope(body.resourceId).catch(() => null);
  if (!resource) return fail(404, "Unknown clinic resource.");
  if (resource.resourceType === "room" && body.status === "in-use") return fail(400, "Use the appointment rooming action so room occupancy and visit state commit together.");
  const g = await guard("write:schedule", { locationId: resource.locationId });
  if (!g.ok) return g.res;
  try {
    const result = await reserveClinicResourceWithLedger({
      id: resourceReservationRequestId(body.resourceId, body.requestId),
      resourceId: body.resourceId,
      appointmentId: typeof body.appointmentId === "string" ? body.appointmentId : undefined,
      encounterId: typeof body.encounterId === "string" ? body.encounterId : undefined,
      startAt,
      endAt,
      status: body.status === "in-use" ? "in-use" : "reserved",
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      at: nowIso(),
    });
    if (result.status === "missing") return fail(404, result.reason);
    if (result.status === "invalid") return fail(400, result.reason);
    if (result.status === "conflict") return fail(409, result.reason ?? "The resource reservation conflicts with existing state.");
    return NextResponse.json({ ok: true, duplicate: result.duplicate, reservation: result.reservation, ledgerId: result.ledger?.id ?? null });
  } catch (error) {
    return unavailable("clinic-reservations.create", error, "The clinic resource was not reserved.");
  }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This reservation request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string" || typeof body.reason !== "string" || !body.reason.trim()) return fail(400, "Reservation id and release reason are required.");
  if (body.reason.length > 1_000) return fail(400, "Release reason is too long.");
  const scope = await readResourceReservationScope(body.id).catch(() => null);
  if (!scope) return fail(404, "Unknown resource reservation.");
  const g = await guard("write:schedule", { locationId: scope.locationId });
  if (!g.ok) return g.res;
  try {
    const result = await releaseClinicResourceWithLedger({
      id: body.id,
      reason: body.reason.trim(),
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      at: nowIso(),
    });
    if (result.status === "missing") return fail(404, "Unknown resource reservation.");
    if (result.status === "conflict") return fail(409, result.reason);
    return NextResponse.json({ ok: true, reservation: result.reservation, ledgerId: result.ledger.id });
  } catch (error) {
    return unavailable("clinic-reservations.release", error, "The clinic resource was not released.");
  }
}
