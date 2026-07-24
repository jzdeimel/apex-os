import { fail } from "@/lib/api/respond";
import { runMutation } from "@/lib/api/gateway";
import { requestIsSameOrigin } from "@/lib/api/origin";
import { nowIso } from "@/lib/clock";
import {
  CALL_REQUEST_ID,
  isCallLifecycleEvent,
  type CallLifecycleEvent,
} from "@/lib/communications/calling";
import { callContactId } from "@/lib/communications/calling.server";
import {
  readClientCareScope,
  recordCallEventWithLedger,
} from "@/lib/db/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CallEventBody {
  clientId: string;
  requestId: string;
  event: CallLifecycleEvent;
  callId?: string;
  durationSeconds?: number;
  reason?: string;
}

function parse(raw: unknown): CallEventBody | string {
  if (!raw || typeof raw !== "object") return "A call event is required.";
  const value = raw as Record<string, unknown>;
  if (typeof value.clientId !== "string" || !value.clientId.trim()) {
    return "clientId is required.";
  }
  if (
    typeof value.requestId !== "string" ||
    !CALL_REQUEST_ID.test(value.requestId)
  ) {
    return "A valid requestId is required.";
  }
  if (!isCallLifecycleEvent(value.event)) return "A valid call event is required.";

  const callId =
    typeof value.callId === "string" && value.callId.trim()
      ? value.callId.trim()
      : undefined;
  if (callId && callId.length > 256) return "The ACS call reference is too long.";

  const durationSeconds =
    typeof value.durationSeconds === "number" ? value.durationSeconds : undefined;
  if (
    durationSeconds !== undefined &&
    (!Number.isFinite(durationSeconds) ||
      durationSeconds < 0 ||
      durationSeconds > 86_400)
  ) {
    return "The call duration is invalid.";
  }

  const reason =
    typeof value.reason === "string" && value.reason.trim()
      ? value.reason.trim()
      : undefined;
  if (reason && reason.length > 500) return "The call result is too long.";

  return {
    clientId: value.clientId.trim(),
    requestId: value.requestId,
    event: value.event,
    callId,
    durationSeconds:
      durationSeconds === undefined ? undefined : Math.round(durationSeconds),
    reason,
  };
}

export async function POST(request: Request) {
  if (!requestIsSameOrigin(request)) {
    return fail(403, "This call update came from an untrusted origin.");
  }

  return runMutation(request, {
    context: "communications.calls.record",
    capability: "call:patient",
    parse,
    loadSubject: (body) => readClientCareScope(body.clientId),
    scopeOf: (subject) => ({
      coachId: subject.assignedCoachId ?? undefined,
      providerId: subject.assignedProviderId ?? undefined,
      locationId: subject.locationId ?? undefined,
    }),
    execute: async ({ body, subject, actor, principal }) => {
      const clientName =
        subject.preferredName ||
        `${subject.firstName} ${subject.lastName}`.trim();
      const result = await recordCallEventWithLedger({
        id: callContactId(body.requestId, actor.id, subject.id),
        clientId: subject.id,
        clientName,
        staffId: actor.id,
        staffName: principal.name,
        staffRole: actor.role,
        event: body.event,
        at: nowIso(),
        callId: body.callId,
        durationSeconds: body.durationSeconds,
        reason: body.reason,
      });
      return {
        duplicate: result.duplicate,
        contactId: result.contact?.id ?? null,
        ledgerId: result.ledger?.id ?? result.contact?.ledgerId ?? null,
      };
    },
    unavailableMessage: "The call status could not be saved. Please retry.",
  });
}
