import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/authz/capabilities";
import { nowIso } from "@/lib/clock";
import {
  createCoachPatientMessageWithLedger,
  markPatientMessagesReadWithLedger,
  readClientCareScope,
  readCoachInbox,
  readPatientCoachMessages,
} from "@/lib/db/repo";
import { authoritativeMessageId } from "@/lib/messaging/authoritative";

export const dynamic = "force-dynamic";

const REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;
const MAX_BODY = 10_000;

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

async function authorizedCoachScope(clientId: string, capability: "read:chart" | "write:contact") {
  const g = await guard(capability);
  if (!g.ok) return { error: g.res } as const;
  if (g.actor.role !== "Coach" && g.actor.role !== "Admin") {
    return { error: fail(403, "Medical staff do not use the patient-to-coach channel.") } as const;
  }
  const scope = await readClientCareScope(clientId);
  if (!scope || scope.status !== "active") return { error: fail(404, "Unknown active patient.") } as const;
  const decision = can(g.actor, capability, {
    coachId: scope.assignedCoachId ?? undefined,
    providerId: scope.assignedProviderId ?? undefined,
    locationId: scope.locationId ?? undefined,
  });
  if (!decision.allowed) return { error: fail(403, decision.reason) } as const;
  return { scope, g } as const;
}

export async function GET(request: NextRequest) {
  try {
    const clientId = request.nextUrl.searchParams.get("clientId");
    if (clientId) {
      const auth = await authorizedCoachScope(clientId, "read:chart");
      if ("error" in auth) return auth.error;
      const messages = await readPatientCoachMessages(clientId);
      return NextResponse.json({
        ok: true,
        patient: {
          id: auth.scope.id,
          name: auth.scope.preferredName || `${auth.scope.firstName} ${auth.scope.lastName}`.trim(),
          locationName: auth.scope.locationName,
        },
        messages,
      });
    }

    const g = await guard("write:contact");
    if (!g.ok) return g.res;
    if (g.actor.role !== "Coach" && g.actor.role !== "Admin") {
      return fail(403, "Medical staff do not use the patient-to-coach inbox.");
    }
    const threads = await readCoachInbox(g.actor.id, g.actor.role === "Admin");
    return NextResponse.json({ ok: true, threads });
  } catch (error) {
    return unavailable("coach.messages.list", error, "The coach inbox is temporarily unavailable.");
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This message request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as
    | { clientId?: unknown; body?: unknown; requestId?: unknown }
    | null;
  if (!body || typeof body.clientId !== "string" || typeof body.body !== "string" || typeof body.requestId !== "string") {
    return fail(400, "clientId, message text, and requestId are required.");
  }
  const text = body.body.trim();
  if (!text) return fail(400, "Write a message before sending.");
  if (text.length > MAX_BODY) return fail(400, `Messages cannot exceed ${MAX_BODY.toLocaleString()} characters.`);
  if (!REQUEST_ID.test(body.requestId)) return fail(400, "requestId is invalid.");

  try {
    const auth = await authorizedCoachScope(body.clientId, "write:contact");
    if ("error" in auth) return auth.error;
    if (auth.g.actor.role !== "Coach" || auth.scope.assignedCoachId !== auth.g.actor.id) {
      return fail(403, "Only the patient's assigned coach can reply in this channel.");
    }
    const at = nowIso();
    const id = authoritativeMessageId("coach-to-patient", body.clientId, body.requestId, auth.g.actor.id);
    const result = await createCoachPatientMessageWithLedger({
      id,
      clientId: body.clientId,
      coachId: auth.g.actor.id,
      coachName: auth.g.principal.name,
      body: text,
      at,
    });
    if (!result) return fail(409, "This reply could not be matched to the patient thread.");
    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate,
      message: result.message,
      ledgerId: result.ledger?.id ?? null,
    });
  } catch (error) {
    return unavailable("coach.messages.reply", error, "The reply was not confirmed as sent. Please retry.");
  }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as { clientId?: unknown } | null;
  if (!body || typeof body.clientId !== "string") return fail(400, "clientId is required.");
  try {
    const auth = await authorizedCoachScope(body.clientId, "write:contact");
    if ("error" in auth) return auth.error;
    if (auth.g.actor.role !== "Coach" || auth.scope.assignedCoachId !== auth.g.actor.id) {
      return fail(403, "Only the patient's assigned coach can acknowledge this thread.");
    }
    const result = await markPatientMessagesReadWithLedger({
      clientId: body.clientId,
      coachId: auth.g.actor.id,
      coachName: auth.g.principal.name,
      at: nowIso(),
    });
    return NextResponse.json({ ok: true, readCount: result.count, ledgerId: result.ledger?.id ?? null });
  } catch (error) {
    return unavailable("coach.messages.read", error, "The read status could not be saved.");
  }
}
