import { NextRequest, NextResponse } from "next/server";
import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/authz/capabilities";
import { nowIso } from "@/lib/clock";
import { dispenseInventoryWithLedger, readInventoryLotScope } from "@/lib/db/inventoryRepo";
import { readClientCareScope } from "@/lib/db/repo";
import { inventoryDispenseRequestId, inventoryRequestId } from "@/lib/inventory/lifecycle";

export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This dispense came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.requestId !== "string" || body.requestId.length < 8 || body.requestId.length > 200 ||
      typeof body.clientId !== "string" || typeof body.lotId !== "string" || !Number.isSafeInteger(body.quantity) || (body.quantity as number) <= 0 ||
      typeof body.method !== "string" || !["shipped", "picked-up", "administered-in-clinic"].includes(body.method)) return fail(400, "Stable request id, patient, lot, positive quantity, and method are required.");
  const g = await guard("dispense:inventory");
  if (!g.ok) return g.res;
  try {
    const [scope, lot] = await Promise.all([readClientCareScope(body.clientId), readInventoryLotScope(body.lotId)]);
    if (!scope || scope.status !== "active") return fail(404, "Unknown active patient.");
    if (!lot) return fail(404, "Unknown inventory lot.");
    const decision = can(g.actor, "dispense:inventory", {
      coachId: scope.assignedCoachId ?? undefined,
      providerId: scope.assignedProviderId ?? undefined,
      locationId: lot.locationId,
    });
    if (!decision.allowed) return fail(403, decision.reason);
    const dispenseId = inventoryDispenseRequestId(body.clientId, lot.id, body.requestId);
    const result = await dispenseInventoryWithLedger({
      dispenseId,
      movementId: inventoryRequestId(dispenseId, body.requestId),
      lotId: lot.id,
      clientId: body.clientId,
      prescriptionId: typeof body.prescriptionId === "string" ? body.prescriptionId : undefined,
      orderId: typeof body.orderId === "string" ? body.orderId : undefined,
      quantity: body.quantity as number,
      method: body.method as "shipped" | "picked-up" | "administered-in-clinic",
      actorId: g.actor.id, actorName: g.principal.name, actorRole: g.actor.role, at: nowIso(),
    });
    if (result.status !== "ok") return fail(result.status === "missing" ? 404 : 409, result.reason ?? "Dispense conflicts with current stock or prescription evidence.");
    return NextResponse.json({ ok: true, dispense: result.dispense, duplicate: result.duplicate, ledgerId: result.ledger?.id ?? result.dispense?.ledgerId });
  } catch (error) {
    return unavailable("inventory.dispense", error, "The dispense was not confirmed. Please retry.");
  }
}
