import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/authz/capabilities";
import { nowIso } from "@/lib/clock";
import { readOrderPatient, readOrders, readOrderScope, transitionOrderWithLedger } from "@/lib/db/orderRepo";
import { isOrderStatus, orderEventRequestId } from "@/lib/orders/authoritative";

export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export async function GET(request: NextRequest) {
  const g = await guard("read:orders");
  if (!g.ok) return g.res;
  const clientId = request.nextUrl.searchParams.get("clientId") ?? undefined;
  try {
    if (clientId) {
      const person = await readOrderPatient(clientId);
      if (!person) return fail(404, "Unknown patient.");
      const decision = can(g.actor, "read:orders", {
        coachId: person.assignedCoachId ?? undefined, providerId: person.assignedProviderId ?? undefined,
        locationId: person.homeLocationId ?? undefined,
      });
      if (!decision.allowed) return fail(403, decision.reason);
    }
    return NextResponse.json({
      ok: true,
      orders: await readOrders(g.actor, clientId),
      permissions: { canFulfill: can(g.actor, "write:fulfillment").allowed },
    });
  } catch (error) {
    return unavailable("orders.read", error, "Authoritative orders are temporarily unavailable.");
  }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This fulfillment update came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.requestId !== "string" || body.requestId.length < 8 || body.requestId.length > 200 ||
      typeof body.orderId !== "string" || !isOrderStatus(body.toStatus) ||
      typeof body.reason !== "string" || body.reason.trim().length < 3 || body.reason.length > 1_000) {
    return fail(400, "Stable request id, order, supported next status, and reason are required.");
  }
  if ((body.toStatus === "Label created" || body.toStatus === "In transit") &&
      (typeof body.tracking !== "string" || body.tracking.trim().length < 4 || typeof body.carrier !== "string" || !["UPS", "FedEx", "USPS", "Courier"].includes(body.carrier))) {
    return fail(400, "Label and transit states require recognized carrier and tracking evidence.");
  }
  const g = await guard("write:fulfillment");
  if (!g.ok) return g.res;
  try {
    const scope = await readOrderScope(body.orderId);
    if (!scope) return fail(404, "Unknown order.");
    const decision = can(g.actor, "write:fulfillment", {
      coachId: scope.coachId ?? undefined, providerId: scope.providerId ?? undefined,
      locationId: scope.order.locationId,
    });
    if (!decision.allowed) return fail(403, decision.reason);
    const result = await transitionOrderWithLedger({
      eventId: orderEventRequestId(body.orderId, body.requestId), orderId: body.orderId,
      toStatus: body.toStatus, reason: body.reason.trim(),
      tracking: typeof body.tracking === "string" ? body.tracking.trim().slice(0, 200) : undefined,
      carrier: typeof body.carrier === "string" ? body.carrier : undefined,
      estDelivery: typeof body.estDelivery === "string" ? body.estDelivery : undefined,
      actorId: g.actor.id, actorName: g.principal.name, actorRole: g.actor.role, at: nowIso(),
    });
    if (result.status !== "ok") return fail(result.status === "missing" ? 404 : 409, result.reason ?? "Order transition was refused and recorded.");
    return NextResponse.json({ ok: true, duplicate: result.duplicate, order: result.order, event: result.event, ledgerId: result.ledger?.id ?? result.event?.ledgerId });
  } catch (error) {
    return unavailable("orders.transition", error, "The order update was not confirmed. Please retry.");
  }
}
