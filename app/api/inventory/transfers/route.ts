import { NextRequest, NextResponse } from "next/server";
import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { nowIso } from "@/lib/clock";
import { readInventoryLotScope, transferInventoryWithLedger } from "@/lib/db/inventoryRepo";
import { inventoryLotRequestId, inventoryTransferRequestId } from "@/lib/inventory/lifecycle";

export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This transfer came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.requestId !== "string" || body.requestId.length < 8 || body.requestId.length > 200 || typeof body.sourceLotId !== "string" ||
      typeof body.targetLocationId !== "string" || !Number.isSafeInteger(body.quantity) || (body.quantity as number) <= 0 ||
      typeof body.reason !== "string" || body.reason.trim().length < 3 || body.reason.length > 1_000) return fail(400, "Stable request id, source lot, destination, positive quantity, and reason are required.");
  const g = await guard("write:inventory");
  if (!g.ok) return g.res;
  try {
    const source = await readInventoryLotScope(body.sourceLotId);
    if (!source) return fail(404, "Unknown source lot.");
    if (!g.actor.locationIds.includes(source.locationId) || !g.actor.locationIds.includes(body.targetLocationId)) return fail(403, "Both clinics must be inside your inventory assignment.");
    const transferId = inventoryTransferRequestId(source.id, body.targetLocationId, body.requestId);
    const result = await transferInventoryWithLedger({
      transferId,
      sourceLotId: source.id,
      targetLotId: inventoryLotRequestId(body.targetLocationId, source.sku, source.lotNumber),
      targetLocationId: body.targetLocationId,
      quantity: body.quantity as number,
      reason: body.reason.trim(),
      actorId: g.actor.id, actorName: g.principal.name, actorRole: g.actor.role, at: nowIso(),
    });
    if (result.status !== "ok") return fail(result.status === "missing" ? 404 : result.status === "invalid" ? 400 : 409, result.reason ?? "Transfer conflicts with current stock.");
    return NextResponse.json({ ok: true, transferId, duplicate: result.duplicate, ledgerId: result.ledger?.id });
  } catch (error) {
    return unavailable("inventory.transfer", error, "The inventory transfer was not confirmed. Please retry.");
  }
}
