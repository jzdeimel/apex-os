import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { nowIso } from "@/lib/clock";
import {
  readHeldLabReleases,
  readLabResultScope,
  readPendingLabReviews,
  releaseReviewedLabResultWithLedger,
  reviewLabResultWithLedger,
} from "@/lib/db/labsRepo";
import { labReleaseRequestId, labReviewRequestId } from "@/lib/labs/lifecycle";

export const dynamic = "force-dynamic";
const REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export async function GET() {
  try {
    const g = await guard("sign:labs");
    if (!g.ok) return g.res;
    const [results, heldReleases] = await Promise.all([
      readPendingLabReviews(g.actor.locationIds, g.actor.id),
      readHeldLabReleases(g.actor.locationIds, g.actor.id),
    ]);
    return NextResponse.json({ ok: true, results, heldReleases });
  } catch (error) {
    return unavailable("labs.reviews.list", error, "The provider lab-review queue is temporarily unavailable.");
  }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This lab-release request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || body.action !== "release" || typeof body.resultId !== "string" || typeof body.requestId !== "string" || !REQUEST_ID.test(body.requestId)) {
    return fail(400, "resultId, action release, and a valid requestId are required.");
  }
  if (typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 10_000) return fail(400, "A later-release reason is required and must be 10,000 characters or fewer.");
  try {
    const scope = await readLabResultScope(body.resultId);
    if (!scope || scope.clientStatus !== "active") return fail(404, "Unknown active-patient lab result.");
    const g = await guard("sign:labs", {
      coachId: scope.assignedCoachId ?? undefined,
      providerId: scope.assignedProviderId ?? undefined,
      locationId: scope.order.locationId,
    });
    if (!g.ok) return g.res;
    const result = await releaseReviewedLabResultWithLedger({
      id: labReleaseRequestId(body.resultId, body.requestId),
      resultId: body.resultId,
      reason: body.reason.trim(),
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      at: nowIso(),
    });
    if (result.status !== "ok") return fail(result.status === "missing" ? 404 : result.status === "conflict" ? 409 : 400, result.reason);
    return NextResponse.json({ ok: true, duplicate: result.duplicate, release: result.release, ledgerId: result.ledger?.id ?? null });
  } catch (error) {
    return unavailable("labs.results.release", error, "The reviewed result was not released. Please retry.");
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This lab-review request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.resultId !== "string" || typeof body.requestId !== "string" || !REQUEST_ID.test(body.requestId)) return fail(400, "resultId and a valid requestId are required.");
  if (typeof body.summary !== "string" || !body.summary.trim() || body.summary.length > 20_000) return fail(400, "A review summary is required and must be 20,000 characters or fewer.");
  if (body.followUp !== undefined && (typeof body.followUp !== "string" || body.followUp.length > 20_000)) return fail(400, "followUp must be 20,000 characters or fewer.");
  if (body.criticalAcknowledged !== undefined && typeof body.criticalAcknowledged !== "boolean") return fail(400, "criticalAcknowledged must be true or false.");
  if (body.releaseToPatient !== undefined && typeof body.releaseToPatient !== "boolean") return fail(400, "releaseToPatient must be true or false.");

  try {
    const scope = await readLabResultScope(body.resultId);
    if (!scope || scope.clientStatus !== "active") return fail(404, "Unknown active-patient lab result.");
    const g = await guard("sign:labs", {
      coachId: scope.assignedCoachId ?? undefined,
      providerId: scope.assignedProviderId ?? undefined,
      locationId: scope.order.locationId,
    });
    if (!g.ok) return g.res;
    const result = await reviewLabResultWithLedger({
      id: labReviewRequestId(body.resultId, body.requestId),
      resultId: body.resultId,
      summary: body.summary.trim(),
      followUp: typeof body.followUp === "string" ? body.followUp.trim() : undefined,
      criticalAcknowledged: body.criticalAcknowledged === true,
      releaseToPatient: body.releaseToPatient === true,
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      at: nowIso(),
    });
    if (result.status !== "ok") return fail(result.status === "missing" ? 404 : result.status === "conflict" ? 409 : 400, result.reason);
    return NextResponse.json({ ok: true, duplicate: result.duplicate, review: result.review, ledgerId: result.ledger?.id ?? null });
  } catch (error) {
    return unavailable("labs.results.review", error, "The provider lab review was not committed. Please retry.");
  }
}
