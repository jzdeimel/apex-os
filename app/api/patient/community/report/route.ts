import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { requestIsSameOrigin } from "@/lib/api/origin";
import { patientSubjectForToken } from "@/lib/auth/patientRepo";
import { PATIENT_SESSION_COOKIE } from "@/lib/auth/patientTokens";
import { nowIso } from "@/lib/clock";
import { isCommunityReportReason } from "@/lib/community/moderation";
import { reportCommunityPostWithLedger } from "@/lib/db/communityRepo";
import { isFeatureEnabledFor } from "@/lib/features/server";

export const dynamic = "force-dynamic";
const REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return fail(403, "This report came from an untrusted origin.");
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
  if (body.detail !== undefined && (typeof body.detail !== "string" || body.detail.length > 2_000)) {
    return fail(400, "Report detail cannot exceed 2,000 characters.");
  }
  try {
    const subject = await patientSubjectForToken(
      request.cookies.get(PATIENT_SESSION_COOKIE)?.value,
    );
    if (!subject) return fail(401, "Your patient session has expired. Please sign in again.");
    if (!(await isFeatureEnabledFor("community", { clientId: subject.clientId }))) {
      return fail(404, "Community is not enabled for your account.");
    }
    const result = await reportCommunityPostWithLedger({
      postId: body.postId,
      requestId: body.requestId,
      reason: body.reason,
      detail: typeof body.detail === "string" ? body.detail : null,
      reporterKind: "patient",
      reporterId: subject.clientId,
      reporterName: `${subject.firstName} ${subject.lastName}`.trim(),
      reporterRole: "Client",
      at: nowIso(),
    });
    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate,
      caseId: result.case?.id ?? result.report.caseId,
      ownerStaffId: result.case?.ownerStaffId ?? null,
      firstResponseDueAt: result.case?.firstResponseDueAt ?? null,
      ledgerId: result.ledger?.id ?? null,
    });
  } catch (error) {
    return unavailable(
      "patient.community.report",
      error,
      "The report was not confirmed. Please retry or contact your coach.",
    );
  }
}
