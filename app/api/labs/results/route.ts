import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { nowIso } from "@/lib/clock";
import {
  readLabOrderScope,
  readLabResults,
  recordLabResultWithLedger,
  type LabObservationInput,
} from "@/lib/db/labsRepo";
import { readClientCareScope } from "@/lib/db/repo";
import { isObservationFlag, isResultStatus, labResultRequestId } from "@/lib/labs/lifecycle";

export const dynamic = "force-dynamic";
const REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

function careSubject(scope: Awaited<ReturnType<typeof readClientCareScope>>) {
  return scope ? {
    coachId: scope.assignedCoachId ?? undefined,
    providerId: scope.assignedProviderId ?? undefined,
    locationId: scope.locationId ?? undefined,
  } : undefined;
}

function observations(value: unknown): LabObservationInput[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 500) return null;
  const rows: LabObservationInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (typeof row.name !== "string" || !row.name.trim() || row.name.length > 500 || !isObservationFlag(row.flag)) return null;
    if (row.valueText === undefined && row.valueNumeric === undefined) return null;
    if (row.valueText !== undefined && (typeof row.valueText !== "string" || row.valueText.length > 2_000)) return null;
    if (row.valueNumeric !== undefined && (typeof row.valueNumeric !== "number" || !Number.isFinite(row.valueNumeric))) return null;
    for (const field of ["codeSystem", "code", "unit", "referenceRange"] as const) {
      if (row[field] !== undefined && (typeof row[field] !== "string" || row[field].length > 500)) return null;
    }
    if (row.sourcePage !== undefined && (!Number.isInteger(row.sourcePage) || (row.sourcePage as number) < 1 || (row.sourcePage as number) > 10_000)) return null;
    if (row.sourceRegion !== undefined && JSON.stringify(row.sourceRegion).length > 10_000) return null;
    rows.push({
      name: row.name.trim(),
      flag: row.flag,
      valueText: typeof row.valueText === "string" ? row.valueText : undefined,
      valueNumeric: typeof row.valueNumeric === "number" ? row.valueNumeric : undefined,
      codeSystem: typeof row.codeSystem === "string" ? row.codeSystem : undefined,
      code: typeof row.code === "string" ? row.code : undefined,
      unit: typeof row.unit === "string" ? row.unit : undefined,
      referenceRange: typeof row.referenceRange === "string" ? row.referenceRange : undefined,
      critical: row.critical === true,
      sourcePage: typeof row.sourcePage === "number" ? row.sourcePage : undefined,
      sourceRegion: row.sourceRegion,
    });
  }
  return rows;
}

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) return fail(400, "clientId is required.");
  try {
    const scope = await readClientCareScope(clientId);
    if (!scope || scope.status !== "active") return fail(404, "Unknown active patient.");
    const g = await guard("read:clinical", careSubject(scope));
    if (!g.ok) return g.res;
    return NextResponse.json({ ok: true, results: await readLabResults(clientId) });
  } catch (error) {
    return unavailable("labs.results.list", error, "Authoritative lab results are temporarily unavailable.");
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This lab-result request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.orderId !== "string" || typeof body.clientId !== "string" || typeof body.requestId !== "string" || !REQUEST_ID.test(body.requestId)) {
    return fail(400, "orderId, clientId, and a valid requestId are required.");
  }
  if (typeof body.vendor !== "string" || !body.vendor.trim() || body.vendor.length > 500) return fail(400, "vendor is required.");
  if (typeof body.externalResultId !== "string" || !body.externalResultId.trim() || body.externalResultId.length > 500) return fail(400, "externalResultId is required.");
  if (!isResultStatus(body.status)) return fail(400, "status must be preliminary, final, or corrected.");
  const resultedAt = typeof body.resultedAt === "string" ? new Date(body.resultedAt) : null;
  if (!resultedAt || Number.isNaN(resultedAt.getTime()) || resultedAt > new Date(Date.now() + 5 * 60_000)) return fail(400, "A valid resultedAt time is required.");
  const parsedObservations = observations(body.observations);
  if (!parsedObservations) return fail(400, "observations must contain 1-500 validated result rows.");
  for (const field of ["sourceArtifactId", "supersedesId"] as const) {
    if (body[field] !== undefined && (typeof body[field] !== "string" || !body[field].trim() || body[field].length > 500)) return fail(400, `${field} is invalid.`);
  }

  try {
    const scope = await readLabOrderScope(body.orderId);
    if (!scope || scope.clientStatus !== "active" || scope.order.clientId !== body.clientId) return fail(404, "Unknown active lab order for this patient.");
    const g = await guard("record:lab-results", {
      coachId: scope.assignedCoachId ?? undefined,
      providerId: scope.assignedProviderId ?? undefined,
      locationId: scope.order.locationId,
    });
    if (!g.ok) return g.res;
    const result = await recordLabResultWithLedger({
      id: labResultRequestId(body.clientId, body.requestId),
      orderId: body.orderId,
      clientId: body.clientId,
      vendor: body.vendor.trim(),
      externalResultId: body.externalResultId.trim(),
      status: body.status,
      resultedAt: resultedAt.toISOString(),
      sourceArtifactId: typeof body.sourceArtifactId === "string" ? body.sourceArtifactId.trim() : undefined,
      supersedesId: typeof body.supersedesId === "string" ? body.supersedesId.trim() : undefined,
      observations: parsedObservations,
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      at: nowIso(),
    });
    if (result.status !== "ok") return fail(result.status === "missing" ? 404 : result.status === "conflict" ? 409 : 400, result.reason);
    return NextResponse.json({ ok: true, duplicate: result.duplicate, result: result.result, risk: "risk" in result ? result.risk : undefined, ledgerId: result.ledger?.id ?? null });
  } catch (error) {
    return unavailable("labs.results.record", error, "No lab result was committed. Please retry.");
  }
}
