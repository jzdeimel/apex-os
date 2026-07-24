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
  activeEmergencyCardForClient,
  issueEmergencyCard,
  revokeEmergencyCards,
} from "@/lib/db/repo";
import { isFeatureEnabledFor } from "@/lib/features/server";

export const dynamic = "force-dynamic";

const CARD_TTL_MS = 14 * 24 * 60 * 60 * 1000;

async function subjectFor(request: NextRequest) {
  return patientSubjectForToken(
    request.cookies.get(PATIENT_SESSION_COOKIE)?.value,
  );
}

async function enabled(clientId: string) {
  return isFeatureEnabledFor("emergency-card", { clientId });
}

export async function GET(request: NextRequest) {
  try {
    const subject = await subjectFor(request);
    if (!subject) return fail(401, "Your patient session has expired.");
    if (!(await enabled(subject.clientId))) {
      return fail(404, "Emergency-card access is not enabled.");
    }
    const card = await activeEmergencyCardForClient(subject.clientId);
    return NextResponse.json({
      ok: true,
      authoritative: true,
      active: Boolean(card),
      card: card
        ? {
            id: card.id,
            createdAt: card.createdAt,
            expiresAt: card.expiresAt,
          }
        : null,
    });
  } catch (error) {
    return unavailable(
      "patient.emergency-card.status",
      error,
      "Emergency-card status is temporarily unavailable.",
    );
  }
}

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) {
    return fail(403, "This emergency-card request came from an untrusted origin.");
  }
  try {
    const subject = await subjectFor(request);
    if (!subject) return fail(401, "Your patient session has expired.");
    if (!(await enabled(subject.clientId))) {
      return fail(404, "Emergency-card access is not enabled.");
    }
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CARD_TTL_MS);
    const token = opaqueToken();
    const result = await issueEmergencyCard({
      clientId: subject.clientId,
      tokenSha256: tokenSha256(token),
      expiresAt: expiresAt.toISOString(),
      issuedBy: subject.clientId,
      issuerName: `${subject.firstName} ${subject.lastName}`,
      issuerRole: "Patient",
      at: now.toISOString(),
    });
    return NextResponse.json({
      ok: true,
      authoritative: true,
      cardId: result.cardId,
      expiresAt,
      // Returned once. The database contains only the SHA-256 digest.
      path: `/card/${token}`,
    });
  } catch (error) {
    return unavailable(
      "patient.emergency-card.issue",
      error,
      "The emergency card was not issued.",
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!requestIsSameOrigin(request)) {
    return fail(403, "This emergency-card request came from an untrusted origin.");
  }
  try {
    const subject = await subjectFor(request);
    if (!subject) return fail(401, "Your patient session has expired.");
    const result = await revokeEmergencyCards({
      clientId: subject.clientId,
      revokedBy: subject.clientId,
      actorName: `${subject.firstName} ${subject.lastName}`,
      actorRole: "Patient",
      at: new Date().toISOString(),
    });
    return NextResponse.json({
      ok: true,
      authoritative: true,
      revoked: result.revoked,
    });
  } catch (error) {
    return unavailable(
      "patient.emergency-card.revoke",
      error,
      "Emergency-card access was not revoked.",
    );
  }
}
