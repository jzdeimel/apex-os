import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/authz/capabilities";
import { nowIso } from "@/lib/clock";
import {
  createPatientPlanDraft,
  publishPatientPlan,
  readClientCareScope,
  readPatientPlans,
} from "@/lib/db/repo";

export const dynamic = "force-dynamic";

const REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function planId(clientId: string, requestId: string) {
  return `plan-${createHash("sha256").update(`${clientId}:${requestId}`).digest("hex").slice(0, 40)}`;
}

async function scopeFor(clientId: string) {
  const scope = await readClientCareScope(clientId);
  if (!scope || scope.status !== "active") return null;
  return {
    scope,
    subject: {
      coachId: scope.assignedCoachId ?? undefined,
      providerId: scope.assignedProviderId ?? undefined,
      locationId: scope.locationId ?? undefined,
    },
    name: `${scope.preferredName || scope.firstName} ${scope.lastName}`.trim(),
  };
}

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) return fail(400, "clientId is required.");
  const g = await guard("read:clinical");
  if (!g.ok) return g.res;
  try {
    const loaded = await scopeFor(clientId);
    if (!loaded) return fail(404, "Unknown active patient.");
    const decision = can(g.actor, "read:clinical", loaded.subject);
    if (!decision.allowed) return fail(403, decision.reason);
    const plans = await readPatientPlans(clientId, true);
    return NextResponse.json({ ok: true, authoritative: true, plans });
  } catch (error) {
    return unavailable("patient-plans.list", error, "Patient plans are temporarily unavailable.");
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This plan request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.clientId !== "string" ||
    (body.category !== "nutrition" && body.category !== "training") ||
    typeof body.requestId !== "string" ||
    !REQUEST_ID.test(body.requestId) ||
    typeof body.title !== "string" ||
    !body.title.trim() ||
    !Array.isArray(body.content)
  ) {
    return fail(400, "clientId, category, title, content, and a valid requestId are required.");
  }
  if (body.title.length > 160 || (typeof body.summary === "string" && body.summary.length > 2_000)) {
    return fail(400, "Plan title or summary is too long.");
  }
  const content = body.content
    .map((item) =>
      item && typeof item === "object"
        ? {
            heading: String((item as Record<string, unknown>).heading ?? "").trim(),
            body: String((item as Record<string, unknown>).body ?? "").trim(),
          }
        : null,
    )
    .filter((item): item is { heading: string; body: string } => Boolean(item?.heading && item.body));
  if (!content.length || content.length > 30 || content.some((item) => item.heading.length > 160 || item.body.length > 10_000)) {
    return fail(400, "Plan content must contain 1 through 30 bounded sections.");
  }
  const capability = body.category === "nutrition" ? "write:nutrition" : "write:training";
  const g = await guard(capability);
  if (!g.ok) return g.res;

  try {
    const loaded = await scopeFor(body.clientId);
    if (!loaded) return fail(404, "Unknown active patient.");
    const decision = can(g.actor, capability, loaded.subject);
    if (!decision.allowed) return fail(403, decision.reason);
    const result = await createPatientPlanDraft({
      id: planId(body.clientId, body.requestId),
      clientId: body.clientId,
      clientName: loaded.name,
      category: body.category,
      title: body.title.trim(),
      summary: typeof body.summary === "string" ? body.summary.trim() : undefined,
      content,
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      at: nowIso(),
    });
    return NextResponse.json({
      ok: true,
      authoritative: true,
      plan: result.plan,
      ledgerId: result.ledger?.id ?? result.plan.ledgerId,
      duplicate: result.duplicate,
    });
  } catch (error) {
    return unavailable("patient-plans.create", error, "The plan draft was not saved.");
  }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This plan request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    body.action !== "publish" ||
    typeof body.id !== "string" ||
    typeof body.clientId !== "string" ||
    (body.category !== "nutrition" && body.category !== "training") ||
    typeof body.effectiveOn !== "string" ||
    !DATE.test(body.effectiveOn)
  ) {
    return fail(400, "id, clientId, category, action publish, and effectiveOn are required.");
  }
  const capability = body.category === "nutrition" ? "write:nutrition" : "write:training";
  const g = await guard(capability);
  if (!g.ok) return g.res;
  try {
    const loaded = await scopeFor(body.clientId);
    if (!loaded) return fail(404, "Unknown active patient.");
    const decision = can(g.actor, capability, loaded.subject);
    if (!decision.allowed) return fail(403, decision.reason);
    const result = await publishPatientPlan({
      id: body.id,
      clientName: loaded.name,
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      effectiveOn: body.effectiveOn,
      at: nowIso(),
    });
    if (result.status === "missing") return fail(404, "Unknown plan draft.");
    if (result.status === "conflict") return fail(409, result.reason);
    return NextResponse.json({
      ok: true,
      authoritative: true,
      plan: result.plan,
      ledgerId: result.ledger?.id ?? result.plan.ledgerId,
      duplicate: result.duplicate,
    });
  } catch (error) {
    return unavailable("patient-plans.publish", error, "The plan was not published.");
  }
}
