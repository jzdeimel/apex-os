import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { fail, unavailable } from "@/lib/api/respond";
import { requestIsSameOrigin } from "@/lib/api/origin";
import { actorFromPrincipal } from "@/lib/auth/actor";
import { guard } from "@/lib/auth/guard";
import { currentPrincipal } from "@/lib/auth/principal";
import { can, hasCapability } from "@/lib/authz/capabilities";
import { nowIso } from "@/lib/clock";
import {
  createClinicalRecommendationDraft,
  readClientCareScope,
  readClinicalRecommendations,
  transitionClinicalRecommendation,
} from "@/lib/db/repo";
import { canonicalJson, sha256 } from "@/lib/trace/hash";

export const dynamic = "force-dynamic";

const REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;

function recommendationId(clientId: string, requestId: string) {
  return `rec-${createHash("sha256").update(`${clientId}:${requestId}`).digest("hex").slice(0, 40)}`;
}

function subjectFor(scope: NonNullable<Awaited<ReturnType<typeof readClientCareScope>>>) {
  return {
    coachId: scope.assignedCoachId ?? undefined,
    providerId: scope.assignedProviderId ?? undefined,
    locationId: scope.locationId ?? undefined,
  };
}

export async function GET(request: NextRequest) {
  const principal = await currentPrincipal();
  const actor = principal ? actorFromPrincipal(principal) : null;
  if (!actor) return fail(principal ? 403 : 401, principal ? "No staff record for this sign-in." : "Not authenticated.");
  if (!hasCapability(actor.accessProfile, "read:clinical")) return fail(403, "Your job profile cannot read clinical recommendations.");
  const clientId = request.nextUrl.searchParams.get("clientId") ?? undefined;
  try {
    if (clientId) {
      const scope = await readClientCareScope(clientId);
      if (!scope) return fail(404, "Unknown patient.");
      const decision = can(actor, "read:clinical", subjectFor(scope));
      if (!decision.allowed) return fail(403, decision.reason);
      const recommendations = await readClinicalRecommendations({ clientId });
      return NextResponse.json({ ok: true, authoritative: true, recommendations });
    }
    const recommendations = await readClinicalRecommendations(
      actor.accessProfile === "provider"
        ? { assignedProviderId: actor.id, status: "pending" }
        : { creatorId: actor.id },
    );
    return NextResponse.json({ ok: true, authoritative: true, recommendations });
  } catch (error) {
    return unavailable("recommendations.list", error, "The recommendation queue is temporarily unavailable.");
  }
}

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return fail(403, "This recommendation request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const evidence = Array.isArray(body?.evidence)
    ? body.evidence
        .map((value) =>
          value && typeof value === "object"
            ? {
                kind: String((value as Record<string, unknown>).kind ?? "").trim(),
                id: String((value as Record<string, unknown>).id ?? "").trim(),
                label: String((value as Record<string, unknown>).label ?? "").trim(),
              }
            : null,
        )
        .filter((value): value is { kind: string; id: string; label: string } => Boolean(value?.kind && value.id && value.label))
    : [];
  if (
    !body ||
    typeof body.clientId !== "string" ||
    typeof body.requestId !== "string" ||
    !REQUEST_ID.test(body.requestId) ||
    typeof body.category !== "string" ||
    typeof body.title !== "string" ||
    typeof body.rationale !== "string" ||
    typeof body.proposedDiscussion !== "string" ||
    !body.category.trim() ||
    !body.title.trim() ||
    !body.rationale.trim() ||
    !body.proposedDiscussion.trim() ||
    !evidence.length
  ) {
    return fail(400, "clientId, category, title, rationale, proposedDiscussion, evidence, and requestId are required.");
  }
  if ([body.category, body.title].some((value) => (value as string).length > 200) || body.rationale.length > 10_000 || body.proposedDiscussion.length > 10_000 || evidence.length > 30) {
    return fail(400, "Recommendation fields are too long.");
  }
  const g = await guard("write:consult");
  if (!g.ok) return g.res;
  try {
    const scope = await readClientCareScope(body.clientId);
    if (!scope || scope.status !== "active") return fail(404, "Unknown active patient.");
    const decision = can(g.actor, "write:consult", subjectFor(scope));
    if (!decision.allowed) return fail(403, decision.reason);
    const at = nowIso();
    const result = await createClinicalRecommendationDraft({
      id: recommendationId(body.clientId, body.requestId),
      clientId: body.clientId,
      clientName: `${scope.preferredName || scope.firstName} ${scope.lastName}`.trim(),
      category: body.category.trim(),
      title: body.title.trim(),
      rationale: body.rationale.trim(),
      proposedDiscussion: body.proposedDiscussion.trim(),
      evidence,
      provenance: {
        method: "human-authored",
        inputHash: sha256(canonicalJson({ clientId: body.clientId, evidence })),
        generatedAt: at,
      },
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      at,
    });
    return NextResponse.json({ ok: true, authoritative: true, recommendation: result.recommendation, ledgerId: result.ledger?.id ?? result.recommendation.ledgerId, duplicate: result.duplicate });
  } catch (error) {
    return unavailable("recommendations.create", error, "The recommendation draft was not saved.");
  }
}

export async function PATCH(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return fail(403, "This recommendation action came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.id !== "string" ||
    typeof body.clientId !== "string" ||
    (body.action !== "submit" && body.action !== "approve" && body.action !== "decline" && body.action !== "withdraw")
  ) {
    return fail(400, "id, clientId, and a supported action are required.");
  }
  const capability =
    body.action === "approve" || body.action === "decline"
      ? "sign:plan-of-care"
      : "write:consult";
  const g = await guard(capability);
  if (!g.ok) return g.res;
  try {
    const scope = await readClientCareScope(body.clientId);
    if (!scope) return fail(404, "Unknown patient.");
    const rows = await readClinicalRecommendations({ clientId: body.clientId });
    const current = rows.find((row) => row.id === body.id);
    if (!current) return fail(404, "Unknown recommendation.");
    const decision = can(g.actor, capability, subjectFor(scope));
    if (!decision.allowed) return fail(403, decision.reason);
    if ((body.action === "submit" || body.action === "withdraw") && current.createdByStaffId !== g.actor.id) {
      return fail(403, "Only the author may submit or withdraw this recommendation.");
    }
    const result = await transitionClinicalRecommendation({
      id: body.id,
      action: body.action,
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      reason: typeof body.reason === "string" ? body.reason : undefined,
      attestation: typeof body.attestation === "string" ? body.attestation : undefined,
      at: nowIso(),
    });
    if (result.status === "missing") return fail(404, "Unknown recommendation.");
    if (result.status === "conflict") return fail(409, result.reason);
    return NextResponse.json({ ok: true, authoritative: true, recommendation: result.recommendation, ledgerId: result.ledger.id });
  } catch (error) {
    return unavailable("recommendations.transition", error, "The recommendation decision was not recorded.");
  }
}
