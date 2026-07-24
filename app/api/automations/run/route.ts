import { NextRequest, NextResponse } from "next/server";
import { fail, unavailable } from "@/lib/api/respond";
import { requestIsSameOrigin } from "@/lib/api/origin";
import { actorFromPrincipal } from "@/lib/auth/actor";
import { currentPrincipal } from "@/lib/auth/principal";
import { runAutomationTick } from "@/lib/db/automationRepo";
import { isFeatureEnabled } from "@/lib/features/server";

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return fail(403, "This worker request came from an untrusted origin.");
  const principal = await currentPrincipal();
  const actor = principal ? actorFromPrincipal(principal) : null;
  if (!actor) return fail(principal ? 403 : 401, principal ? "No staff record for this sign-in." : "Not authenticated.");
  if (!["owner", "operations"].includes(actor.accessProfile)) return fail(403, "Only owners and operations may run automations.");
  if (!(await isFeatureEnabled("automations"))) return fail(409, "Automations are disabled for this account.");
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const result = await runAutomationTick({
      workerId: `manual-${actor.id}`,
      version: process.env.APEX_BUILD_SHA ?? "local",
      trigger: "manual",
      forceRuleId: typeof body.ruleId === "string" ? body.ruleId : undefined,
    });
    return NextResponse.json({ ok: true, authoritative: true, taskOnly: true, ...result });
  } catch (error) {
    return unavailable("automations.manual-run", error, "The automation run failed. No result is being represented as complete.");
  }
}
