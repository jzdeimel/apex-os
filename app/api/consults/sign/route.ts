import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { requestIsSameOrigin } from "@/lib/api/origin";
import { guard } from "@/lib/auth/guard";
import { coSignConsult, readConsultForCoSign } from "@/lib/db/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_ATTESTATION =
  "I attest that I reviewed this note and that it is accurate and complete to the best of my knowledge.";

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) {
    return fail(403, "This signature request came from an untrusted origin.");
  }

  // Establish the licensed capability before parsing a clinical mutation.
  const base = await guard("sign:encounter");
  if (!base.ok) return base.res;

  const body = (await request.json().catch(() => null)) as
    | { consultId?: unknown; attestation?: unknown }
    | null;
  if (!body || typeof body.consultId !== "string" || !body.consultId.trim()) {
    return fail(400, "consultId is required.");
  }

  try {
    const subject = await readConsultForCoSign(body.consultId.trim());
    if (!subject) return fail(404, "That consult does not exist.");
    if (subject.status === "Signed") return fail(409, "This consult is already signed.");
    const hasAuthoredContent = [
      subject.rawNotes,
      subject.subjective,
      subject.objective,
      subject.assessment,
      subject.plan,
    ].some((value) => Boolean(value?.trim()));
    if (!hasAuthoredContent) return fail(422, "The consult has no authored content to sign.");

    const scoped = await guard("sign:encounter", {
      coachId: subject.assignedCoachId ?? undefined,
      providerId: subject.assignedProviderId ?? undefined,
      locationId: subject.locationId ?? undefined,
    });
    if (!scoped.ok) return scoped.res;

    const result = await coSignConsult({
      consultId: subject.id,
      signedBy: scoped.actor.id,
      signerName: scoped.principal.name,
      actorRole: scoped.actor.role,
      signerCredential: scoped.principal.credentials ?? undefined,
      attestation:
        typeof body.attestation === "string" && body.attestation.trim()
          ? body.attestation.trim().slice(0, 2_000)
          : DEFAULT_ATTESTATION,
      at: new Date().toISOString(),
    });
    if (!result) return fail(409, "This consult was already signed.");
    return NextResponse.json({
      ok: true,
      authoritative: true,
      consultId: result.consultId,
      ledger: {
        id: result.ledger.id,
        seq: result.ledger.seq,
        hash: result.ledger.hash,
      },
    });
  } catch (error) {
    return unavailable(
      "consults.sign",
      error,
      "The signature was not recorded. Please try again.",
    );
  }
}
