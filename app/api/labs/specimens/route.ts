import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { nowIso } from "@/lib/clock";
import { collectLabSpecimenWithLedger, readLabOrderScope } from "@/lib/db/labsRepo";
import { labSpecimenRequestId } from "@/lib/labs/lifecycle";

export const dynamic = "force-dynamic";
const REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This specimen request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.orderId !== "string" || typeof body.requestId !== "string" || !REQUEST_ID.test(body.requestId)) return fail(400, "orderId and a valid requestId are required.");
  for (const field of ["accession", "vendor", "specimenType"] as const) {
    if (typeof body[field] !== "string" || !body[field].trim()) return fail(400, `${field} is required.`);
    if (body[field].length > 500) return fail(400, `${field} is too long.`);
  }
  const collectedAt = typeof body.collectedAt === "string" ? new Date(body.collectedAt) : new Date();
  if (Number.isNaN(collectedAt.getTime()) || collectedAt > new Date(Date.now() + 5 * 60_000)) return fail(400, "The collection time is invalid.");

  try {
    const scope = await readLabOrderScope(body.orderId);
    if (!scope || scope.clientStatus !== "active") return fail(404, "Unknown active lab order.");
    const g = await guard("collect:labs", {
      coachId: scope.assignedCoachId ?? undefined,
      providerId: scope.assignedProviderId ?? undefined,
      locationId: scope.order.locationId,
    });
    if (!g.ok) return g.res;
    const result = await collectLabSpecimenWithLedger({
      id: labSpecimenRequestId(body.orderId, body.requestId),
      orderId: body.orderId,
      accession: (body.accession as string).trim(),
      vendor: (body.vendor as string).trim(),
      specimenType: (body.specimenType as string).trim(),
      collectedAt: collectedAt.toISOString(),
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      at: nowIso(),
    });
    if (result.status !== "ok") return fail(result.status === "missing" ? 404 : result.status === "conflict" ? 409 : 400, result.reason);
    return NextResponse.json({ ok: true, duplicate: result.duplicate, specimen: result.specimen, ledgerId: result.ledger?.id ?? null });
  } catch (error) {
    return unavailable("labs.specimens.collect", error, "The specimen collection was not committed. Please retry.");
  }
}
