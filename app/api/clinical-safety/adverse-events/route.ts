import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/authz/capabilities";
import { nowIso } from "@/lib/clock";
import {
  ADVERSE_EVENT_SEVERITIES,
  adverseEventRequestId,
  adverseEventReviewAcceptable,
  adverseEventRequiresUrgentReview,
  type AdverseEventSeverity,
} from "@/lib/clinical-safety/lifecycle";
import {
  readAdverseEvents,
  readAdverseEventScope,
  reportAdverseEventWithLedger,
  reviewAdverseEventWithLedger,
} from "@/lib/db/clinicalSafetyRepo";
import { readClientCareScope } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

const REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

function subject(scope: { assignedCoachId: string | null; assignedProviderId: string | null; locationId: string | null }) {
  return { coachId: scope.assignedCoachId ?? undefined, providerId: scope.assignedProviderId ?? undefined, locationId: scope.locationId ?? undefined };
}

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  try {
    if (clientId) {
      const scope = await readClientCareScope(clientId);
      if (!scope || scope.status !== "active") return fail(404, "Unknown active patient.");
      const g = await guard("read:clinical");
      if (!g.ok) return g.res;
      const decision = can(g.actor, "read:clinical", subject(scope));
      if (!decision.allowed) return fail(403, decision.reason);
      const rows = await readAdverseEvents({ clientId });
      return NextResponse.json({ ok: true, events: rows.map((row) => row.adverse_event), canReport: can(g.actor, "report:adverse-event", subject(scope)).allowed, canReview: can(g.actor, "review:adverse-event", subject(scope)).allowed });
    }
    const g = await guard("review:adverse-event");
    if (!g.ok) return g.res;
    const rows = await readAdverseEvents({ assignedProviderId: g.actor.id, unreviewedOnly: true });
    return NextResponse.json({ ok: true, events: rows.map((row) => row.adverse_event) });
  } catch (error) {
    return unavailable("adverse-events.list", error, "Adverse-event records are temporarily unavailable.");
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This adverse-event report came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.clientId !== "string" || typeof body.requestId !== "string" || !REQUEST_ID.test(body.requestId)) return fail(400, "clientId and a valid requestId are required.");
  if (typeof body.description !== "string" || body.description.trim().length < 5 || body.description.length > 20_000) return fail(400, "Describe the suspected event in 5-20,000 characters.");
  if (typeof body.severity !== "string" || !ADVERSE_EVENT_SEVERITIES.includes(body.severity as never)) return fail(400, "Adverse-event severity is invalid.");
  if (body.suspectSku !== undefined && (typeof body.suspectSku !== "string" || body.suspectSku.length > 200)) return fail(400, "Suspected product is invalid.");
  try {
    const scope = await readClientCareScope(body.clientId);
    if (!scope || scope.status !== "active") return fail(404, "Unknown active patient.");
    const g = await guard("report:adverse-event", subject(scope));
    if (!g.ok) return g.res;
    const severity = body.severity as AdverseEventSeverity;
    const result = await reportAdverseEventWithLedger({
      id: adverseEventRequestId(body.clientId, body.requestId),
      clientId: body.clientId,
      reporterKind: g.actor.accessProfile === "coach" ? "coach" : "clinician",
      suspectSku: typeof body.suspectSku === "string" ? body.suspectSku.trim() || undefined : undefined,
      description: body.description.trim(),
      severity,
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      locationId: scope.locationId ?? undefined,
      at: nowIso(),
    });
    if (result.status === "conflict") return fail(409, "That request id was already used for a different adverse-event report.");
    return NextResponse.json({ ok: true, duplicate: result.duplicate, event: result.event, escalationId: "escalationId" in result ? result.escalationId : null, urgent: adverseEventRequiresUrgentReview(severity), ledgerId: result.ledger?.id ?? null });
  } catch (error) {
    return unavailable("adverse-events.report", error, "The adverse-event report was not confirmed.");
  }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This adverse-event review came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string") return fail(400, "Adverse-event id is required.");
  if (typeof body.outcome !== "string" || body.outcome.length > 10_000 || typeof body.actionTaken !== "string" || body.actionTaken.length > 10_000) return fail(400, "Outcome and action taken are required and cannot exceed 10,000 characters.");
  if (body.externalReportRef !== undefined && (typeof body.externalReportRef !== "string" || body.externalReportRef.length > 500)) return fail(400, "External report reference is invalid.");
  try {
    const scope = await readAdverseEventScope(body.id);
    if (!scope || scope.clientStatus !== "active") return fail(404, "Unknown adverse event for an active patient.");
    const g = await guard("review:adverse-event", subject(scope));
    if (!g.ok) return g.res;
    const severity = scope.event.severity as AdverseEventSeverity;
    if (!adverseEventReviewAcceptable({ severity, outcome: body.outcome, actionTaken: body.actionTaken })) return fail(400, "A complete outcome and specific action taken are required; severe events require a substantive response.");
    const result = await reviewAdverseEventWithLedger({
      id: body.id,
      outcome: body.outcome.trim(),
      actionTaken: body.actionTaken.trim(),
      externalReportRef: typeof body.externalReportRef === "string" ? body.externalReportRef.trim() || undefined : undefined,
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      locationId: scope.locationId ?? undefined,
      at: nowIso(),
    });
    if (result.status === "missing") return fail(404, "Unknown adverse event.");
    if (result.status === "conflict") return fail(409, result.reason);
    return NextResponse.json({ ok: true, event: result.event, ledgerId: result.ledger.id });
  } catch (error) {
    return unavailable("adverse-events.review", error, "The adverse-event review was not confirmed.");
  }
}
