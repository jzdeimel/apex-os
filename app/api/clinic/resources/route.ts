import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { nowIso } from "@/lib/clock";
import {
  createClinicResourceWithLedger,
  readClinicResources,
  readClinicResourceScope,
  updateClinicResourceWithLedger,
} from "@/lib/db/clinicResourcesRepo";
import {
  clinicResourceRequestId,
  RESOURCE_KINDS,
  RESOURCE_STATUSES,
  RESOURCE_TYPES,
} from "@/lib/clinic-resources/lifecycle";

export const dynamic = "force-dynamic";

const REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

function instant(value: string | null) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(request: NextRequest) {
  const g = await guard("read:all-schedules");
  if (!g.ok) return g.res;
  const requestedLocation = request.nextUrl.searchParams.get("locationId");
  if (requestedLocation && !g.actor.locationIds.includes(requestedLocation)) return fail(403, "This clinic is outside your assigned locations.");
  const from = instant(request.nextUrl.searchParams.get("from"));
  const to = instant(request.nextUrl.searchParams.get("to"));
  if (from === null || to === null || (from && to && to <= from)) return fail(400, "The reservation window is invalid.");
  if ((from && !to) || (!from && to)) return fail(400, "Both from and to are required for reservation occupancy.");
  if (from && to && to.getTime() - from.getTime() > 62 * 86_400_000) return fail(400, "Resource windows cannot exceed 62 days.");
  try {
    const locationIds = requestedLocation ? [requestedLocation] : g.actor.locationIds;
    const result = await readClinicResources({ locationIds, from: from ?? undefined, to: to ?? undefined });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return unavailable("clinic-resources.list", error, "Clinic resources are temporarily unavailable.");
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This resource request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.locationId !== "string" || typeof body.label !== "string" || typeof body.requestId !== "string") {
    return fail(400, "locationId, label, and requestId are required.");
  }
  if (!REQUEST_ID.test(body.requestId)) return fail(400, "A valid requestId is required.");
  const label = body.label.trim();
  const resourceType = typeof body.resourceType === "string" ? body.resourceType : "room";
  const kind = typeof body.kind === "string" ? body.kind : "general";
  const capacity = typeof body.capacity === "number" ? Math.trunc(body.capacity) : 1;
  const note = typeof body.note === "string" ? body.note.trim() : undefined;
  if (!label || label.length > 100) return fail(400, "Resource label must be 1-100 characters.");
  if (!RESOURCE_TYPES.includes(resourceType as never) || !RESOURCE_KINDS.includes(kind as never)) return fail(400, "Resource type or kind is invalid.");
  if (capacity < 1 || capacity > 100) return fail(400, "Capacity must be between 1 and 100.");
  if (note && note.length > 1_000) return fail(400, "Resource note is too long.");
  const g = await guard("admin:locations", { locationId: body.locationId });
  if (!g.ok) return g.res;
  try {
    const result = await createClinicResourceWithLedger({
      id: clinicResourceRequestId(body.locationId, body.requestId),
      locationId: body.locationId,
      label,
      resourceType,
      kind,
      capacity,
      note,
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      at: nowIso(),
    });
    if (result.status !== "ok") return fail(409, "That resource request conflicts with an existing id or clinic label.");
    return NextResponse.json({ ok: true, duplicate: result.duplicate, resource: result.resource, ledgerId: result.ledger?.id ?? null });
  } catch (error) {
    return unavailable("clinic-resources.create", error, "The clinic resource was not created.");
  }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This resource request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string" || typeof body.reason !== "string" || !body.reason.trim()) return fail(400, "Resource id and change reason are required.");
  const current = await readClinicResourceScope(body.id).catch(() => null);
  if (!current) return fail(404, "Unknown clinic resource.");
  const g = await guard("admin:locations", { locationId: current.locationId });
  if (!g.ok) return g.res;
  const status = typeof body.status === "string" ? body.status : undefined;
  const kind = typeof body.kind === "string" ? body.kind : undefined;
  const label = typeof body.label === "string" ? body.label.trim() : undefined;
  const capacity = typeof body.capacity === "number" ? Math.trunc(body.capacity) : undefined;
  const note = body.note === null ? null : typeof body.note === "string" ? body.note.trim() : undefined;
  if (status && !RESOURCE_STATUSES.includes(status as never)) return fail(400, "Resource status is invalid.");
  if (kind && !RESOURCE_KINDS.includes(kind as never)) return fail(400, "Resource kind is invalid.");
  if (label !== undefined && (!label || label.length > 100)) return fail(400, "Resource label must be 1-100 characters.");
  if (capacity !== undefined && (capacity < 1 || capacity > 100)) return fail(400, "Capacity must be between 1 and 100.");
  if (note && note.length > 1_000) return fail(400, "Resource note is too long.");
  if (body.reason.length > 1_000) return fail(400, "Change reason is too long.");
  try {
    const result = await updateClinicResourceWithLedger({
      id: body.id,
      status,
      kind,
      label,
      capacity,
      note,
      reason: body.reason.trim(),
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      at: nowIso(),
    });
    if (result.status === "missing") return fail(404, "Unknown clinic resource.");
    if (result.status === "conflict") return fail(409, result.reason);
    return NextResponse.json({ ok: true, resource: result.resource, ledgerId: result.ledger.id });
  } catch (error) {
    return unavailable("clinic-resources.update", error, "The clinic resource change was not saved.");
  }
}
