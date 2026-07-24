import { NextRequest, NextResponse } from "next/server";
import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { nowIso } from "@/lib/clock";
import { readRecallRecipients, recallInventoryWithLedger } from "@/lib/db/inventoryRepo";
import { inventoryRecallRequestId } from "@/lib/inventory/lifecycle";

export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export async function GET(request: NextRequest) {
  const recallId = request.nextUrl.searchParams.get("recallId");
  if (!recallId) return fail(400, "recallId is required.");
  const g = await guard("read:inventory");
  if (!g.ok) return g.res;
  try {
    const result = await readRecallRecipients(recallId, g.actor.locationIds);
    if (!result) return fail(404, "Unknown recall.");
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return unavailable("inventory.recall.read", error, "Recall recipients are temporarily unavailable.");
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This recall came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.requestId !== "string" || body.requestId.length < 8 || body.requestId.length > 200 ||
      typeof body.sku !== "string" || !body.sku.trim() || body.sku.length > 100 ||
      typeof body.lotNumber !== "string" || !body.lotNumber.trim() || body.lotNumber.length > 100 ||
      typeof body.noticeRef !== "string" || body.noticeRef.trim().length < 3 || body.noticeRef.length > 300 ||
      typeof body.reason !== "string" || body.reason.trim().length < 3 || body.reason.length > 2_000) return fail(400, "Stable request id, SKU, lot, notice reference, and recall reason are required.");
  const g = await guard("write:recall");
  if (!g.ok) return g.res;
  try {
    const recallId = inventoryRecallRequestId(body.sku.trim(), body.lotNumber.trim(), body.requestId);
    const result = await recallInventoryWithLedger({
      recallId, sku: body.sku.trim(), lotNumber: body.lotNumber.trim(),
      noticeRef: body.noticeRef.trim(), reason: body.reason.trim(),
      actorId: g.actor.id, actorName: g.principal.name, actorRole: g.actor.role, at: nowIso(),
    });
    if (result.status !== "ok") return fail(409, "Recall request conflicts with the existing notice.");
    return NextResponse.json({ ok: true, recall: result.recall, affectedDispenses: result.affectedDispenses, duplicate: result.duplicate, ledgerId: result.ledger?.id ?? result.recall?.ledgerId });
  } catch (error) {
    return unavailable("inventory.recall.create", error, "The recall was not confirmed. Please retry.");
  }
}
