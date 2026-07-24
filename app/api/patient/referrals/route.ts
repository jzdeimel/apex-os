import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { fail, unavailable } from "@/lib/api/respond";
import { requestIsSameOrigin } from "@/lib/api/origin";
import { patientSubjectForToken } from "@/lib/auth/patientRepo";
import {
  opaqueToken,
  PATIENT_SESSION_COOKIE,
  tokenSha256,
} from "@/lib/auth/patientTokens";
import {
  issuePatientReferral,
  readPatientReferrals,
} from "@/lib/db/repo";
import { isFeatureEnabledFor } from "@/lib/features/server";

export const dynamic = "force-dynamic";

async function patientFor(request: NextRequest) {
  return patientSubjectForToken(
    request.cookies.get(PATIENT_SESSION_COOKIE)?.value,
  );
}

export async function GET(request: NextRequest) {
  try {
    const patient = await patientFor(request);
    if (!patient) return fail(401, "Not authenticated.");
    if (!(await isFeatureEnabledFor("member-referrals", { clientId: patient.clientId }))) {
      return fail(404, "Referrals are not enabled for this account.");
    }
    const referrals = await readPatientReferrals(patient.clientId);
    return NextResponse.json({ ok: true, authoritative: true, referrals });
  } catch (error) {
    return unavailable("patient.referrals.list", error, "Referral history is temporarily unavailable.");
  }
}

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) {
    return fail(403, "This referral request came from an untrusted origin.");
  }
  try {
    const patient = await patientFor(request);
    if (!patient) return fail(401, "Not authenticated.");
    if (!(await isFeatureEnabledFor("member-referrals", { clientId: patient.clientId }))) {
      return fail(404, "Referrals are not enabled for this account.");
    }
    const existing = await readPatientReferrals(patient.clientId);
    const now = new Date();
    const active = existing.filter(
      (row) =>
        row.status === "issued" &&
        row.expiresAt.getTime() > now.getTime(),
    );
    if (active.length >= 5) {
      return fail(409, "You already have five active referral links.");
    }
    const rawCode = opaqueToken();
    const expiresAt = new Date(now.getTime() + 90 * 86_400_000);
    const result = await issuePatientReferral({
      id: `ref-${randomUUID()}`,
      clientId: patient.clientId,
      clientName: `${patient.firstName} ${patient.lastName}`.trim(),
      codeSha256: tokenSha256(rawCode),
      expiresAt: expiresAt.toISOString(),
      actorName: `${patient.firstName} ${patient.lastName}`.trim(),
      at: now.toISOString(),
    });
    const shareUrl = new URL("/book", request.nextUrl.origin);
    shareUrl.searchParams.set("ref", rawCode);
    return NextResponse.json({
      ok: true,
      authoritative: true,
      referral: {
        id: result.referral.id,
        status: result.referral.status,
        expiresAt: result.referral.expiresAt,
      },
      shareUrl: shareUrl.toString(),
      shareUrlReturnedOnce: true,
      ledgerId: result.ledger?.id ?? result.referral.ledgerId,
    });
  } catch (error) {
    return unavailable("patient.referrals.issue", error, "The referral link was not created.");
  }
}
