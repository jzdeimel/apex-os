import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { requestIsSameOrigin } from "@/lib/api/origin";
import { guard } from "@/lib/auth/guard";
import { hasCapability } from "@/lib/authz/capabilities";
import { nowIso } from "@/lib/clock";
import {
  readCommunityModerationQueue,
  reportCommunityPostWithLedger,
  transitionCommunityModerationCaseWithLedger,
} from "@/lib/db/communityRepo";
import {
  isCommunityReportReason,
  resolutionAcceptable,
  type CommunityModerationAction,
  type CommunityModerationStatus,
} from "@/lib/community/moderation";
import { isFeatureEnabled } from "@/lib/features/server";

export const dynamic = "force-dynamic";
const REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;
const STATUSES = new Set<CommunityModerationStatus>([
  "open",
  "in-review",
  "resolved",
  "dismissed",
]);
const ACTIONS = new Set<CommunityModerationAction>([
  "none",
  "hide-post",
  "remove-post",
  "warn-member",
  "suspend-member",
  "route-to-care-team",
]);

export async function GET(request: NextRequest) {
  const g = await guard("read:community-moderation");
  if (!g.ok) return g.res;
  if (!(await isFeatureEnabled("community"))) return fail(404, "Community is not enabled.");
  try {
    const ownerOnly =
      g.actor.accessProfile === "coach" && !hasCapability(g.actor.accessProfile, "admin:community-policy");
    const queue = await readCommunityModerationQueue({
      moderatorStaffId: ownerOnly ? g.actor.id : undefined,
      includeClosed: request.nextUrl.searchParams.get("closed") === "true",
    });
    return NextResponse.json({
      ok: true,
      ownerOnly,
      canModerate: hasCapability(g.actor.accessProfile, "moderate:community"),
      canManagePolicy: hasCapability(g.actor.accessProfile, "admin:community-policy"),
      queue,
      now: nowIso(),
    });
  } catch (error) {
    return unavailable(
      "community.moderation.list",
      error,
      "The moderation queue is temporarily unavailable.",
    );
  }
}

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return fail(403, "This report came from an untrusted origin.");
  const g = await guard("report:community");
  if (!g.ok) return g.res;
  if (!(await isFeatureEnabled("community"))) return fail(404, "Community is not enabled.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.postId !== "string" ||
    typeof body.requestId !== "string" ||
    !REQUEST_ID.test(body.requestId) ||
    !isCommunityReportReason(body.reason)
  ) {
    return fail(400, "postId, reason, and a valid requestId are required.");
  }
  try {
    const result = await reportCommunityPostWithLedger({
      postId: body.postId,
      requestId: body.requestId,
      reason: body.reason,
      detail: typeof body.detail === "string" ? body.detail.slice(0, 2_000) : null,
      reporterKind: "staff",
      reporterId: g.actor.id,
      reporterName: g.principal.name,
      reporterRole: g.actor.role,
      at: nowIso(),
    });
    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate,
      caseId: result.case?.id ?? result.report.caseId,
      ledgerId: result.ledger?.id ?? null,
    });
  } catch (error) {
    return unavailable("community.moderation.report", error, "The report was not confirmed.");
  }
}

export async function PATCH(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return fail(403, "This moderation action came from an untrusted origin.");
  const g = await guard("moderate:community");
  if (!g.ok) return g.res;
  if (!(await isFeatureEnabled("community"))) return fail(404, "Community is not enabled.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.id !== "string" ||
    typeof body.status !== "string" ||
    !STATUSES.has(body.status as CommunityModerationStatus)
  ) {
    return fail(400, "Case id and valid status are required.");
  }
  const action =
    typeof body.action === "string" && ACTIONS.has(body.action as CommunityModerationAction)
      ? (body.action as CommunityModerationAction)
      : undefined;
  const resolution = typeof body.resolution === "string" ? body.resolution.trim() : undefined;
  if (
    !resolutionAcceptable({
      status: body.status as CommunityModerationStatus,
      action,
      resolution,
    })
  ) {
    return fail(400, "Closed cases require an action and resolution.");
  }
  try {
    const result = await transitionCommunityModerationCaseWithLedger({
      id: body.id,
      status: body.status as CommunityModerationStatus,
      action,
      resolution,
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      allowAnyOwner: hasCapability(g.actor.accessProfile, "admin:community-policy"),
      at: nowIso(),
    });
    if (result.status === "missing") return fail(404, "Unknown moderation case.");
    if (result.status === "forbidden") return fail(403, result.reason);
    if (result.status === "conflict") return fail(409, result.reason);
    return NextResponse.json({
      ok: true,
      case: result.case,
      ledgerId: result.ledger.id,
    });
  } catch (error) {
    return unavailable("community.moderation.transition", error, "The moderation action was not confirmed.");
  }
}
