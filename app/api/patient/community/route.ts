import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { requestIsSameOrigin } from "@/lib/api/origin";
import { patientSubjectForToken } from "@/lib/auth/patientRepo";
import { PATIENT_SESSION_COOKIE } from "@/lib/auth/patientTokens";
import { nowIso } from "@/lib/clock";
import {
  createPatientCommunityPostWithLedger,
  readPatientCommunity,
} from "@/lib/db/communityRepo";
import { isFeatureEnabledFor } from "@/lib/features/server";

export const dynamic = "force-dynamic";

const REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;

async function patientFor(request: NextRequest) {
  return patientSubjectForToken(request.cookies.get(PATIENT_SESSION_COOKIE)?.value);
}

export async function GET(request: NextRequest) {
  try {
    const subject = await patientFor(request);
    if (!subject) return fail(401, "Your patient session has expired. Please sign in again.");
    if (!(await isFeatureEnabledFor("community", { clientId: subject.clientId }))) {
      return fail(404, "Community is not enabled for your account.");
    }
    const community = await readPatientCommunity(subject.clientId);
    return NextResponse.json({
      ok: true,
      enrolled: Boolean(community),
      community,
    });
  } catch (error) {
    return unavailable("patient.community.list", error, "Community is temporarily unavailable.");
  }
}

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return fail(403, "This community request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as
    | { body?: unknown; requestId?: unknown; parentPostId?: unknown }
    | null;
  if (
    !body ||
    typeof body.body !== "string" ||
    typeof body.requestId !== "string" ||
    !REQUEST_ID.test(body.requestId)
  ) {
    return fail(400, "Post text and a valid requestId are required.");
  }
  if (
    body.parentPostId !== undefined &&
    body.parentPostId !== null &&
    typeof body.parentPostId !== "string"
  ) {
    return fail(400, "parentPostId is invalid.");
  }

  try {
    const subject = await patientFor(request);
    if (!subject) return fail(401, "Your patient session has expired. Please sign in again.");
    if (!(await isFeatureEnabledFor("community", { clientId: subject.clientId }))) {
      return fail(404, "Community is not enabled for your account.");
    }
    const result = await createPatientCommunityPostWithLedger({
      clientId: subject.clientId,
      patientName: `${subject.firstName} ${subject.lastName}`.trim(),
      requestId: body.requestId,
      body: body.body,
      parentPostId: typeof body.parentPostId === "string" ? body.parentPostId : null,
      at: nowIso(),
    });
    if (result.status === "blocked") {
      return NextResponse.json(
        {
          ok: false,
          routeRequired: true,
          error: result.verdict.reason,
          matched: result.verdict.matched ?? [],
          suggestedEscalation: result.verdict.suggestedEscalation ?? null,
        },
        { status: 422 },
      );
    }
    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate,
      post: result.post,
      ledgerId: result.ledger?.id ?? null,
    });
  } catch (error) {
    return unavailable(
      "patient.community.post",
      error,
      "Your post was not confirmed. Please retry.",
    );
  }
}
