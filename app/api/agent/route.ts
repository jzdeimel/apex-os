import { NextRequest, NextResponse } from "next/server";
import { fail, unavailable } from "@/lib/api/respond";
import { requestIsSameOrigin } from "@/lib/api/origin";
import { actorFromPrincipal } from "@/lib/auth/actor";
import { currentPrincipal } from "@/lib/auth/principal";
import { answerRecordQuestion } from "@/lib/db/recordAssistantRepo";
import { isFeatureEnabled } from "@/lib/features/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return fail(403, "This record query came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as { query?: unknown } | null;
  if (!body || typeof body.query !== "string" || body.query.trim().length < 2 || body.query.length > 500) {
    return fail(400, "A query from 2 through 500 characters is required.");
  }
  const principal = await currentPrincipal();
  const actor = principal ? actorFromPrincipal(principal) : null;
  if (!actor) return fail(principal ? 403 : 401, principal ? "No staff record for this sign-in." : "Not authenticated.");
  if (!(await isFeatureEnabled("ai-assistant"))) return fail(404, "Ask Apex is not enabled for this account.");
  try {
    const answer = await answerRecordQuestion(body.query, actor);
    return NextResponse.json({
      ok: true,
      authoritative: true,
      generativeModelUsed: false,
      ...answer,
    });
  } catch (error) {
    return unavailable("agent.record-query", error, "Ask Apex could not query the live record.");
  }
}
