import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { nowIso } from "@/lib/clock";
import { cancelLabOrderWithLedger, createLabOrderWithLedger, readLabOrderScope, readLabOrders } from "@/lib/db/labsRepo";
import { readClientCareScope } from "@/lib/db/repo";
import { labOrderRequestId } from "@/lib/labs/lifecycle";

export const dynamic = "force-dynamic";

const REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

function subject(scope: Awaited<ReturnType<typeof readClientCareScope>>) {
  return scope ? {
    coachId: scope.assignedCoachId ?? undefined,
    providerId: scope.assignedProviderId ?? undefined,
    locationId: scope.locationId ?? undefined,
  } : undefined;
}

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId") ?? undefined;
  try {
    if (clientId) {
      const scope = await readClientCareScope(clientId);
      if (!scope || scope.status !== "active") return fail(404, "Unknown active patient.");
      const g = await guard("read:clinical", subject(scope));
      if (!g.ok) return g.res;
      return NextResponse.json({ ok: true, orders: await readLabOrders({ clientId }) });
    }
    const g = await guard("read:clinical");
    if (!g.ok) return g.res;
    if (g.actor.accessProfile !== "provider" && g.actor.accessProfile !== "nursing") return fail(403, "Only clinical staff can open the clinic lab worklist.");
    const orders = await readLabOrders();
    return NextResponse.json({ ok: true, orders: orders.filter((row) => g.actor.locationIds.includes(row.order.locationId)) });
  } catch (error) {
    return unavailable("labs.orders.list", error, "The authoritative lab worklist is temporarily unavailable.");
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This lab-order request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.clientId !== "string" || typeof body.locationId !== "string" || typeof body.requestId !== "string" || !REQUEST_ID.test(body.requestId)) {
    return fail(400, "clientId, locationId, and a valid requestId are required.");
  }
  const required = ["panelCode", "panelName", "indications"] as const;
  for (const field of required) {
    if (typeof body[field] !== "string" || !body[field].trim()) return fail(400, `${field} is required.`);
  }
  for (const field of ["panelCode", "panelName", "vendor", "indications", "instructions", "encounterId", "appointmentId"] as const) {
    if (body[field] !== undefined && typeof body[field] !== "string") return fail(400, `${field} must be text.`);
    if (typeof body[field] === "string" && body[field].length > (field === "indications" || field === "instructions" ? 10_000 : 500)) return fail(400, `${field} is too long.`);
  }
  const priority = body.priority === undefined ? "routine" : body.priority;
  if (priority !== "routine" && priority !== "urgent") return fail(400, "priority must be routine or urgent.");

  try {
    const scope = await readClientCareScope(body.clientId);
    if (!scope || scope.status !== "active") return fail(404, "Unknown active patient.");
    if (scope.locationId !== body.locationId) return fail(409, "The order clinic must match the patient's owning clinic.");
    const g = await guard("order:labs", subject(scope));
    if (!g.ok) return g.res;
    const result = await createLabOrderWithLedger({
      id: labOrderRequestId(body.clientId, body.requestId),
      clientId: body.clientId,
      locationId: body.locationId,
      encounterId: typeof body.encounterId === "string" ? body.encounterId : undefined,
      appointmentId: typeof body.appointmentId === "string" ? body.appointmentId : undefined,
      panelCode: (body.panelCode as string).trim(),
      panelName: (body.panelName as string).trim(),
      vendor: typeof body.vendor === "string" ? body.vendor.trim() : undefined,
      priority,
      fastingRequired: body.fastingRequired === true,
      indications: (body.indications as string).trim(),
      instructions: typeof body.instructions === "string" ? body.instructions.trim() : undefined,
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      at: nowIso(),
    });
    if (result.status !== "ok") return fail(result.status === "conflict" ? 409 : 400, result.reason);
    return NextResponse.json({ ok: true, duplicate: result.duplicate, order: result.order, ledgerId: result.ledger?.id ?? null });
  } catch (error) {
    return unavailable("labs.orders.create", error, "The lab order was not committed. Please retry.");
  }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This lab-order request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || body.action !== "cancel" || typeof body.orderId !== "string") return fail(400, "orderId and action cancel are required.");
  if (typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 10_000) return fail(400, "A cancellation reason is required and must be 10,000 characters or fewer.");
  try {
    const scope = await readLabOrderScope(body.orderId);
    if (!scope || scope.clientStatus !== "active") return fail(404, "Unknown active lab order.");
    const g = await guard("order:labs", {
      coachId: scope.assignedCoachId ?? undefined,
      providerId: scope.assignedProviderId ?? undefined,
      locationId: scope.order.locationId,
    });
    if (!g.ok) return g.res;
    const result = await cancelLabOrderWithLedger({
      orderId: body.orderId,
      reason: body.reason.trim(),
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      at: nowIso(),
    });
    if (result.status !== "ok") return fail(result.status === "missing" ? 404 : result.status === "conflict" ? 409 : 400, result.reason);
    return NextResponse.json({ ok: true, duplicate: result.duplicate, order: result.order, ledgerId: result.ledger?.id ?? null });
  } catch (error) {
    return unavailable("labs.orders.cancel", error, "The lab order was not cancelled. Please retry.");
  }
}
