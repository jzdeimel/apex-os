import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { requestIsSameOrigin } from "@/lib/api/origin";
import { patientSubjectForToken } from "@/lib/auth/patientRepo";
import { PATIENT_SESSION_COOKIE } from "@/lib/auth/patientTokens";
import { nowIso } from "@/lib/clock";
import { setCommunityBlockForPost } from "@/lib/db/communityRepo";
import { isFeatureEnabledFor } from "@/lib/features/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return fail(403, "This block request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.postId !== "string" || typeof body.blocked !== "boolean") {
    return fail(400, "postId and blocked are required.");
  }
  if (body.reason !== undefined && (typeof body.reason !== "string" || body.reason.length > 500)) {
    return fail(400, "Block reason cannot exceed 500 characters.");
  }
  try {
    const subject = await patientSubjectForToken(
      request.cookies.get(PATIENT_SESSION_COOKIE)?.value,
    );
    if (!subject) return fail(401, "Your patient session has expired. Please sign in again.");
    if (!(await isFeatureEnabledFor("community", { clientId: subject.clientId }))) {
      return fail(404, "Community is not enabled for your account.");
    }
    const result = await setCommunityBlockForPost({
      blockerClientId: subject.clientId,
      blockerName: `${subject.firstName} ${subject.lastName}`.trim(),
      postId: body.postId,
      blocked: body.blocked,
      reason: typeof body.reason === "string" ? body.reason : null,
      at: nowIso(),
    });
    return NextResponse.json({
      ok: true,
      status: result.block.status,
      ledgerId: result.ledger.id,
    });
  } catch (error) {
    return unavailable(
      "patient.community.block",
      error,
      "The community block was not confirmed.",
    );
  }
}
