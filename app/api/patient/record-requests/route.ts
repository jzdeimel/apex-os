import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { requestIsSameOrigin } from "@/lib/api/origin";
import { fail, unavailable } from "@/lib/api/respond";
import { patientSubjectForToken } from "@/lib/auth/patientRepo";
import { PATIENT_SESSION_COOKIE } from "@/lib/auth/patientTokens";
import { nowIso } from "@/lib/clock";
import {
  createOperationalCaseWithLedger,
  readOperationalCaseQueue,
} from "@/lib/db/operationsRepo";
import {
  operationalCaseInputAcceptable,
  type OperationalCaseKind,
} from "@/lib/operations/cases";

export const dynamic = "force-dynamic";
const PATIENT_RECORD_KINDS = new Set<OperationalCaseKind>([
  "record-access",
  "record-release",
  "record-amendment",
]);

async function subject() {
  const cookieStore = await cookies();
  return patientSubjectForToken(cookieStore.get(PATIENT_SESSION_COOKIE)?.value);
}

export async function GET() {
  const patient = await subject();
  if (!patient) return fail(401, "Your patient session has expired.");
  try {
    const queue = await readOperationalCaseQueue({
      clientId: patient.clientId,
      kinds: [...PATIENT_RECORD_KINDS],
      includeClosed: true,
      limit: 100,
    });
    return NextResponse.json({
      ok: true,
      cases: queue.cases.map((item) => ({
        id: item.id,
        kind: item.kind,
        status: item.status,
        subject: item.subject,
        recordScope: item.recordScope,
        identityVerificationStatus: item.identityVerificationStatus,
        dueAt: item.dueAt,
        createdAt: item.createdAt,
        resolution: item.resolution,
        denialReason: item.denialReason,
      })),
      now: nowIso(),
    });
  } catch (error) {
    return unavailable("patient.records.list", error, "Your record requests are temporarily unavailable.");
  }
}

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return fail(403, "This request came from an untrusted origin.");
  const patient = await subject();
  if (!patient) return fail(401, "Your patient session has expired.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.kind !== "string" ||
    !PATIENT_RECORD_KINDS.has(body.kind as OperationalCaseKind)
  ) {
    return fail(400, "Choose access, release, or amendment.");
  }
  const kind = body.kind as OperationalCaseKind;
  const problem = operationalCaseInputAcceptable({
    kind,
    subject: body.subject,
    detail: body.detail,
    recordScope: body.recordScope,
    amendmentRecordReference: body.amendmentRecordReference,
    amendmentRequestedText: body.amendmentRequestedText,
  });
  if (problem) return fail(400, problem);
  try {
    const result = await createOperationalCaseWithLedger({
      kind,
      priority: "normal",
      subject: body.subject as string,
      detail: body.detail as string,
      clientId: patient.clientId,
      requestedByKind: "patient",
      requestedById: patient.clientId,
      requestedByName: `${patient.firstName} ${patient.lastName}`.trim(),
      requestedByRole: "Patient",
      recordScope: body.recordScope as string,
      requestedFormat: typeof body.requestedFormat === "string" ? body.requestedFormat : "electronic",
      recipient: typeof body.recipient === "string" ? body.recipient : "self",
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
    return unavailable("patient.records.create", error, "Your request was not confirmed.");
  }
}
