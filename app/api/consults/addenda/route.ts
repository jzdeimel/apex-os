import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { nowIso } from "@/lib/clock";
import { consultAddendumRequestId } from "@/lib/clinical-safety/lifecycle";
import { appendSignedConsultAddendumWithLedger, readConsultSafetyScope } from "@/lib/db/clinicalSafetyRepo";

export const dynamic = "force-dynamic";

const REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;
const ATTESTATION = "I attest that this addendum is accurate, necessary, and does not replace or alter the original signed note.";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This addendum request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.consultId !== "string" || typeof body.requestId !== "string" || !REQUEST_ID.test(body.requestId)) return fail(400, "consultId and a valid requestId are required.");
  if (typeof body.body !== "string" || !body.body.trim() || body.body.length > 20_000) return fail(400, "Addendum text is required and cannot exceed 20,000 characters.");
  if (typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 1_000) return fail(400, "A concise correction reason is required.");
  if (body.attested !== true) return fail(400, "You must attest to this signed addendum.");
  try {
    const scope = await readConsultSafetyScope(body.consultId);
    if (!scope || scope.clientStatus !== "active") return fail(404, "Unknown signed consult for an active patient.");
    const g = await guard("write:consult", {
      coachId: scope.assignedCoachId ?? undefined,
      providerId: scope.assignedProviderId ?? undefined,
      locationId: scope.locationId ?? undefined,
    });
    if (!g.ok) return g.res;
    const result = await appendSignedConsultAddendumWithLedger({
      id: consultAddendumRequestId(body.consultId, body.requestId),
      consultId: body.consultId,
      body: body.body.trim(),
      reason: body.reason.trim(),
      attestation: ATTESTATION,
      signerCredential: g.principal.credentials ?? undefined,
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      at: nowIso(),
    });
    if (result.status === "missing") return fail(404, result.reason);
    if (result.status === "conflict") return fail(409, result.reason ?? "The addendum request conflicts with existing state.");
    return NextResponse.json({ ok: true, duplicate: result.duplicate, addendum: result.addendum, ledgerId: result.ledger?.id ?? null });
  } catch (error) {
    return unavailable("consult.addendum", error, "The signed addendum was not saved.");
  }
}
