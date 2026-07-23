import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { requestIsSameOrigin } from "@/lib/api/origin";
import { patientSubjectForToken } from "@/lib/auth/patientRepo";
import { PATIENT_SESSION_COOKIE } from "@/lib/auth/patientTokens";
import { nowIso } from "@/lib/clock";
import {
  createPatientCoachMessageWithLedger,
  readClientCareScope,
  readPatientCoachMessages,
} from "@/lib/db/repo";
import {
  authoritativeMessageId,
  containsUrgentLanguage,
  URGENT_MESSAGE_NOTICE,
} from "@/lib/messaging/authoritative";

export const dynamic = "force-dynamic";

const MAX_BODY = 10_000;
const REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;

async function patientFor(request: NextRequest) {
  return patientSubjectForToken(request.cookies.get(PATIENT_SESSION_COOKIE)?.value);
}

export async function GET(request: NextRequest) {
  try {
    const subject = await patientFor(request);
    if (!subject) return fail(401, "Your patient session has expired. Please sign in again.");
    const [scope, messages] = await Promise.all([
      readClientCareScope(subject.clientId),
      readPatientCoachMessages(subject.clientId),
    ]);
    if (!scope || scope.status !== "active") return fail(404, "Your patient record is unavailable.");
    return NextResponse.json({
      ok: true,
      coach: scope.assignedCoachId && scope.coachActive
        ? { id: scope.assignedCoachId, name: scope.coachName ?? "Your coach" }
        : null,
      messages,
      urgentNotice: URGENT_MESSAGE_NOTICE,
    });
  } catch (error) {
    return unavailable("patient.messages.list", error, "Secure messages are temporarily unavailable.");
  }
}

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return fail(403, "This message request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as
    | { body?: unknown; requestId?: unknown }
    | null;
  if (!body || typeof body.body !== "string" || typeof body.requestId !== "string") {
    return fail(400, "Message text and requestId are required.");
  }
  const text = body.body.trim();
  if (!text) return fail(400, "Write a message before sending.");
  if (text.length > MAX_BODY) return fail(400, `Messages cannot exceed ${MAX_BODY.toLocaleString()} characters.`);
  if (!REQUEST_ID.test(body.requestId)) return fail(400, "requestId is invalid.");

  try {
    const subject = await patientFor(request);
    if (!subject) return fail(401, "Your patient session has expired. Please sign in again.");
    const scope = await readClientCareScope(subject.clientId);
    if (!scope || scope.status !== "active") return fail(404, "Your patient record is unavailable.");
    if (!scope.assignedCoachId || !scope.coachActive) {
      return fail(409, "An active coach must be assigned before secure messaging can begin. Please call your clinic.");
    }

    const at = nowIso();
    const id = authoritativeMessageId("patient-to-coach", subject.clientId, body.requestId);
    const result = await createPatientCoachMessageWithLedger({
      id,
      clientId: subject.clientId,
      patientName: `${subject.firstName} ${subject.lastName}`.trim(),
      coachId: scope.assignedCoachId,
      body: text,
      at,
    });
    if (!result) return fail(409, "This message could not be matched to your patient record.");
    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate,
      message: result.message,
      ledgerId: result.ledger?.id ?? null,
      urgentLanguageDetected: containsUrgentLanguage(text),
      urgentNotice: URGENT_MESSAGE_NOTICE,
    });
  } catch (error) {
    return unavailable(
      "patient.messages.send",
      error,
      "Your message was not confirmed as sent. Please retry, or call your clinic if the problem continues.",
    );
  }
}
