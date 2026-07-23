import { NextRequest, NextResponse } from "next/server";

import { requestIsSameOrigin } from "@/lib/api/origin";
import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { nowIso } from "@/lib/clock";
import {
  createOperationalCaseWithLedger,
  readOperationalCaseQueue,
  workOperationalCaseWithLedger,
} from "@/lib/db/operationsRepo";
import {
  isOperationalCaseKind,
  isOperationalCasePriority,
  isOperationalCaseStatus,
  operationalCaseInputAcceptable,
  type OperationalCasePriority,
} from "@/lib/operations/cases";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const g = await guard("read:operations-cases");
  if (!g.ok) return g.res;
  try {
    const queue = await readOperationalCaseQueue({
      includeClosed: request.nextUrl.searchParams.get("closed") === "true",
    });
    return NextResponse.json({ ok: true, ...queue, now: nowIso() });
  } catch (error) {
    return unavailable("operations.cases.list", error, "The operational case queue is temporarily unavailable.");
  }
}

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return fail(403, "This case came from an untrusted origin.");
  const g = await guard("create:operations-case");
  if (!g.ok) return g.res;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isOperationalCaseKind(body.kind)) return fail(400, "A valid case kind is required.");
  const priority: OperationalCasePriority = isOperationalCasePriority(body.priority)
    ? body.priority
    : "normal";
  const problem = operationalCaseInputAcceptable({
    kind: body.kind,
    subject: body.subject,
    detail: body.detail,
    recordScope: body.recordScope,
    amendmentRecordReference: body.amendmentRecordReference,
    amendmentRequestedText: body.amendmentRequestedText,
  });
  if (problem) return fail(400, problem);
  try {
    const result = await createOperationalCaseWithLedger({
      kind: body.kind,
      priority,
      subject: body.subject as string,
      detail: body.detail as string,
      clientId: typeof body.clientId === "string" ? body.clientId : null,
      leadId: typeof body.leadId === "string" ? body.leadId : null,
      locationId: typeof body.locationId === "string" ? body.locationId : null,
      requestedByKind: "staff",
      requestedById: g.actor.id,
      requestedByName: g.principal.name,
      requestedByRole: g.actor.accessProfile,
      recordScope: typeof body.recordScope === "string" ? body.recordScope : null,
      requestedFormat: typeof body.requestedFormat === "string" ? body.requestedFormat : null,
      recipient: typeof body.recipient === "string" ? body.recipient : null,
      amendmentRecordReference:
        typeof body.amendmentRecordReference === "string" ? body.amendmentRecordReference : null,
      amendmentRequestedText:
        typeof body.amendmentRequestedText === "string" ? body.amendmentRequestedText : null,
      at: nowIso(),
    });
    return NextResponse.json({
      ok: true,
      durable: true,
      case: result.case,
      ledgerId: result.ledger.id,
    });
  } catch (error) {
    return unavailable("operations.cases.create", error, "The case was not confirmed.");
  }
}

export async function PATCH(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return fail(403, "This case action came from an untrusted origin.");
  const g = await guard("work:operations-cases");
  if (!g.ok) return g.res;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string") return fail(400, "Case id is required.");
  if (body.status !== undefined && !isOperationalCaseStatus(body.status)) {
    return fail(400, "Unknown case status.");
  }
  const verification = body.identityVerificationStatus;
  if (
    verification !== undefined &&
    verification !== "pending" &&
    verification !== "verified" &&
    verification !== "failed"
  ) {
    return fail(400, "Unknown identity-verification status.");
  }
  if (
    body.ownerStaffId === undefined &&
    body.status === undefined &&
    verification === undefined &&
    (typeof body.note !== "string" || body.note.trim().length < 2)
  ) {
    return fail(400, "A case action or note is required.");
  }
  try {
    const result = await workOperationalCaseWithLedger({
      id: body.id,
      status: isOperationalCaseStatus(body.status) ? body.status : undefined,
      ownerStaffId:
        body.ownerStaffId === null || typeof body.ownerStaffId === "string"
          ? body.ownerStaffId
          : undefined,
      note: typeof body.note === "string" ? body.note.slice(0, 5_000) : null,
      resolution: typeof body.resolution === "string" ? body.resolution.slice(0, 5_000) : null,
      denialReason: typeof body.denialReason === "string" ? body.denialReason.slice(0, 5_000) : null,
      identityVerificationStatus:
        verification === "pending" || verification === "verified" || verification === "failed"
          ? verification
          : undefined,
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.accessProfile,
      allowAnyOwner: true,
      at: nowIso(),
    });
    if (result.status === "missing") return fail(404, "Unknown operational case.");
    if (result.status === "forbidden") return fail(403, result.reason);
    if (
      result.status === "invalid-owner" ||
      result.status === "invalid-closure"
    ) {
      return fail(400, result.reason);
    }
    if (result.status === "conflict") return fail(409, result.reason);
    return NextResponse.json({
      ok: true,
      durable: true,
      case: result.case,
      event: result.event,
      ledgerId: result.ledger.id,
    });
  } catch (error) {
    return unavailable("operations.cases.work", error, "The case action was not confirmed.");
  }
}
