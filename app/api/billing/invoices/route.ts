import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/authz/capabilities";
import { invoiceNumber, invoiceRequestId, type InvoiceLineInput } from "@/lib/billing/lifecycle";
import { nowIso } from "@/lib/clock";
import { createInvoiceWithLedger } from "@/lib/db/billingRepo";
import { readClientCareScope } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This invoice request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.clientId !== "string" || typeof body.requestId !== "string" || body.requestId.length < 8 || body.requestId.length > 200 || !Array.isArray(body.lines)) {
    return fail(400, "clientId, a stable requestId, and invoice lines are required.");
  }
  if (body.dueAt !== undefined && body.dueAt !== null && (typeof body.dueAt !== "string" || Number.isNaN(Date.parse(body.dueAt)))) {
    return fail(400, "dueAt must be an ISO date-time.");
  }
  const lines: InvoiceLineInput[] = [];
  for (const raw of body.lines) {
    if (!raw || typeof raw !== "object") return fail(400, "Every invoice line must be an object.");
    const row = raw as Record<string, unknown>;
    if (typeof row.description !== "string" || typeof row.quantity !== "number" || typeof row.unitPriceCents !== "number") {
      return fail(400, "Every invoice line requires description, quantity, and unitPriceCents.");
    }
    if (row.sku !== undefined && typeof row.sku !== "string") return fail(400, "Invoice SKU must be text.");
    if (row.hsaEligibility !== undefined && !["eligible", "ineligible", "unknown"].includes(String(row.hsaEligibility))) return fail(400, "Unknown HSA eligibility value.");
    lines.push({
      sku: typeof row.sku === "string" ? row.sku : undefined,
      description: row.description,
      quantity: row.quantity,
      unitPriceCents: row.unitPriceCents,
      hsaEligibility: row.hsaEligibility as InvoiceLineInput["hsaEligibility"],
    });
  }
  const g = await guard("write:invoice");
  if (!g.ok) return g.res;
  try {
    const scope = await readClientCareScope(body.clientId);
    if (!scope || scope.status !== "active" || !scope.locationId) return fail(404, "Unknown active patient with a home clinic.");
    const decision = can(g.actor, "write:invoice", {
      coachId: scope.assignedCoachId ?? undefined,
      providerId: scope.assignedProviderId ?? undefined,
      locationId: scope.locationId,
    });
    if (!decision.allowed) return fail(403, decision.reason);
    const at = nowIso();
    const id = invoiceRequestId(body.clientId, body.requestId);
    const result = await createInvoiceWithLedger({
      id,
      number: invoiceNumber(body.clientId, body.requestId),
      clientId: body.clientId,
      membershipId: typeof body.membershipId === "string" ? body.membershipId : undefined,
      dueAt: typeof body.dueAt === "string" ? body.dueAt : undefined,
      lines,
      discountCents: typeof body.discountCents === "number" ? body.discountCents : undefined,
      discountReason: typeof body.discountReason === "string" ? body.discountReason : undefined,
      taxCents: typeof body.taxCents === "number" ? body.taxCents : undefined,
      locationId: scope.locationId,
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      at,
    });
    if (result.status !== "ok") return fail(result.status === "missing" ? 404 : result.status === "invalid" ? 400 : 409, result.reason ?? "Invoice request conflicts with the current record.");
    return NextResponse.json({ ok: true, invoice: result.invoice, duplicate: result.duplicate, ledgerId: result.ledger?.id ?? result.invoice?.ledgerId });
  } catch (error) {
    return unavailable("billing.invoice.create", error, "The invoice was not confirmed. Please retry.");
  }
}
