import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/authz/capabilities";
import { nowIso } from "@/lib/clock";
import {
  adjustInventoryWithLedger,
  readInventory,
  readInventoryLocations,
  readInventoryLotScope,
  receiveInventoryWithLedger,
} from "@/lib/db/inventoryRepo";
import { inventoryLotRequestId, inventoryRequestId } from "@/lib/inventory/lifecycle";

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

export async function GET(request: NextRequest) {
  const g = await guard("read:inventory");
  if (!g.ok) return g.res;
  const requested = request.nextUrl.searchParams.get("locationId");
  if (requested && !g.actor.locationIds.includes(requested)) return fail(403, "This clinic is outside your inventory assignment.");
  try {
    const scopedLocationIds = requested ? [requested] : g.actor.locationIds;
    const [inventory, locations] = await Promise.all([
      readInventory(scopedLocationIds),
      readInventoryLocations(scopedLocationIds),
    ]);
    return NextResponse.json({ ok: true, inventory, locations, permissions: {
      canWrite: can(g.actor, "write:inventory").allowed,
      canDispense: can(g.actor, "dispense:inventory").allowed,
      canRecall: can(g.actor, "write:recall").allowed,
    } });
  } catch (error) {
    return unavailable("inventory.read", error, "Authoritative inventory is temporarily unavailable.");
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This inventory request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.requestId !== "string" || body.requestId.length < 8 || body.requestId.length > 200 ||
      typeof body.locationId !== "string" || typeof body.sku !== "string" || !body.sku.trim() || body.sku.length > 100 ||
      typeof body.lotNumber !== "string" || !body.lotNumber.trim() || body.lotNumber.length > 100 ||
      typeof body.unitLabel !== "string" || !body.unitLabel.trim() || body.unitLabel.length > 60 ||
      !Number.isSafeInteger(body.quantity) || (body.quantity as number) <= 0 || (body.quantity as number) > 1_000_000 ||
      typeof body.sourceDocumentRef !== "string" || body.sourceDocumentRef.trim().length < 3 || body.sourceDocumentRef.length > 300) {
    return fail(400, "Stable request id, clinic, SKU, lot, unit, positive whole quantity, and receiving document are required.");
  }
  if (body.expiryOn !== undefined && body.expiryOn !== null && !dateOnly(body.expiryOn)) return fail(400, "expiryOn must use YYYY-MM-DD.");
  if (typeof body.expiryOn === "string" && body.expiryOn < nowIso().slice(0, 10)) return fail(400, "Expired product cannot be received into available stock.");
  if (body.unitCostCents !== undefined && (!Number.isSafeInteger(body.unitCostCents) || (body.unitCostCents as number) < 0 || (body.unitCostCents as number) > 100_000_000)) return fail(400, "unitCostCents must be a non-negative whole-cent amount.");
  if (body.controlledSchedule !== undefined && body.controlledSchedule !== null && (typeof body.controlledSchedule !== "string" || !["II", "III", "IV", "V"].includes(body.controlledSchedule))) return fail(400, "Unknown controlled schedule.");
  const g = await guard("write:inventory");
  if (!g.ok) return g.res;
  if (!g.actor.locationIds.includes(body.locationId)) return fail(403, "This clinic is outside your inventory assignment.");
  try {
    const lotId = inventoryLotRequestId(body.locationId, body.sku.trim(), body.lotNumber.trim());
    const result = await receiveInventoryWithLedger({
      lotId,
      movementId: inventoryRequestId(lotId, body.requestId),
      sku: body.sku.trim(),
      lotNumber: body.lotNumber.trim(),
      locationId: body.locationId,
      unitLabel: body.unitLabel.trim(),
      expiryOn: typeof body.expiryOn === "string" ? body.expiryOn : undefined,
      unitCostCents: typeof body.unitCostCents === "number" ? body.unitCostCents : undefined,
      vendorRef: typeof body.vendorRef === "string" ? body.vendorRef.trim().slice(0, 300) : undefined,
      requiresPrescription: body.requiresPrescription === true || typeof body.controlledSchedule === "string",
      controlledSchedule: typeof body.controlledSchedule === "string" ? body.controlledSchedule : undefined,
      quantity: body.quantity as number,
      sourceDocumentRef: body.sourceDocumentRef.trim(),
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      at: nowIso(),
    });
    if (result.status !== "ok") return fail(result.status === "conflict" ? 409 : 400, result.reason ?? "Receiving request conflicts with existing inventory.");
    return NextResponse.json({ ok: true, lotId, movement: result.movement, duplicate: result.duplicate, ledgerId: result.ledger?.id ?? result.movement?.ledgerId });
  } catch (error) {
    return unavailable("inventory.receive", error, "The receipt was not confirmed. Please retry.");
  }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This inventory request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.requestId !== "string" || body.requestId.length < 8 || body.requestId.length > 200 ||
      typeof body.lotId !== "string" || !["waste", "count-adjust"].includes(String(body.kind)) ||
      typeof body.reason !== "string" || body.reason.trim().length < 3 || body.reason.length > 1_000) {
    return fail(400, "Stable request id, lot, adjustment kind, and reason are required.");
  }
  if (body.kind === "waste" && (!Number.isSafeInteger(body.quantity) || (body.quantity as number) <= 0)) return fail(400, "Waste requires a positive whole quantity.");
  if (body.kind === "count-adjust" && (!Number.isSafeInteger(body.countedQuantity) || (body.countedQuantity as number) < 0)) return fail(400, "Cycle count requires a non-negative whole count.");
  const g = await guard("write:inventory");
  if (!g.ok) return g.res;
  try {
    const lot = await readInventoryLotScope(body.lotId);
    if (!lot) return fail(404, "Unknown inventory lot.");
    if (!g.actor.locationIds.includes(lot.locationId)) return fail(403, "This lot is outside your inventory assignment.");
    const result = await adjustInventoryWithLedger({
      lotId: body.lotId,
      movementId: inventoryRequestId(body.lotId, body.requestId),
      kind: body.kind as "waste" | "count-adjust",
      quantity: typeof body.quantity === "number" ? body.quantity : undefined,
      countedQuantity: typeof body.countedQuantity === "number" ? body.countedQuantity : undefined,
      reason: body.reason.trim(),
      actorId: g.actor.id, actorName: g.principal.name, actorRole: g.actor.role, at: nowIso(),
    });
    if (result.status !== "ok") return fail(result.status === "missing" ? 404 : result.status === "invalid" ? 400 : 409, result.reason ?? "Inventory adjustment conflicts with current stock.");
    return NextResponse.json({ ok: true, movement: result.movement, duplicate: result.duplicate, ledgerId: result.ledger?.id ?? result.movement?.ledgerId });
  } catch (error) {
    return unavailable("inventory.adjust", error, "The inventory adjustment was not confirmed. Please retry.");
  }
}
