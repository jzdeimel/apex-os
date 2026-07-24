import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { fail, unavailable } from "@/lib/api/respond";
import { requestIsSameOrigin } from "@/lib/api/origin";
import { actorFromPrincipal } from "@/lib/auth/actor";
import { currentPrincipal } from "@/lib/auth/principal";
import { nowIso } from "@/lib/clock";
import {
  AUTOMATION_TRIGGER_TYPES,
  createAutomationRule,
  readAutomationState,
  setAutomationRuleEnabled,
  type AutomationTriggerType,
} from "@/lib/db/automationRepo";
import { isFeatureEnabled } from "@/lib/features/server";

export const dynamic = "force-dynamic";

const REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;

async function administrator() {
  const principal = await currentPrincipal();
  const actor = principal ? actorFromPrincipal(principal) : null;
  if (!actor) return { error: fail(principal ? 403 : 401, principal ? "No staff record for this sign-in." : "Not authenticated.") };
  if (!["owner", "operations"].includes(actor.accessProfile)) {
    return { error: fail(403, "Only owners and operations may configure automations.") };
  }
  return { principal, actor };
}

export async function GET() {
  const auth = await administrator();
  if ("error" in auth) return auth.error;
  try {
    const state = await readAutomationState();
    return NextResponse.json({ ok: true, authoritative: true, taskOnly: true, ...state });
  } catch (error) {
    return unavailable("automations.state", error, "Automation state is temporarily unavailable.");
  }
}

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return fail(403, "This automation request came from an untrusted origin.");
  if (!(await isFeatureEnabled("automations"))) return fail(409, "Automations are disabled for this account.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.requestId !== "string" ||
    !REQUEST_ID.test(body.requestId) ||
    typeof body.name !== "string" ||
    !body.name.trim() ||
    typeof body.triggerType !== "string" ||
    !AUTOMATION_TRIGGER_TYPES.includes(body.triggerType as AutomationTriggerType)
  ) {
    return fail(400, "name, supported triggerType, and requestId are required.");
  }
  const thresholdMinutes = Number(body.thresholdMinutes);
  const cadenceMinutes = Number(body.cadenceMinutes);
  if (!Number.isInteger(thresholdMinutes) || thresholdMinutes < 5 || thresholdMinutes > 525_600) {
    return fail(400, "thresholdMinutes must be from 5 through 525600.");
  }
  if (!Number.isInteger(cadenceMinutes) || cadenceMinutes < 5 || cadenceMinutes > 1_440) {
    return fail(400, "cadenceMinutes must be from 5 through 1440.");
  }
  const auth = await administrator();
  if ("error" in auth) return auth.error;
  try {
    const id = `arule-${createHash("sha256").update(body.requestId).digest("hex").slice(0, 40)}`;
    const result = await createAutomationRule({
      id,
      name: body.name.trim().slice(0, 200),
      triggerType: body.triggerType as AutomationTriggerType,
      thresholdMinutes,
      cadenceMinutes,
      enabled: body.enabled === true,
      actorId: auth.actor.id,
      actorName: auth.principal?.name ?? "Apex administrator",
      actorRole: auth.actor.role,
      at: nowIso(),
    });
    return NextResponse.json({ ok: true, authoritative: true, taskOnly: true, rule: result.rule, ledgerId: result.ledger?.id ?? result.rule.ledgerId, duplicate: result.duplicate });
  } catch (error) {
    return unavailable("automations.create", error, "The automation rule was not created.");
  }
}

export async function PATCH(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return fail(403, "This automation request came from an untrusted origin.");
  if (!(await isFeatureEnabled("automations"))) return fail(409, "Automations are disabled for this account.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string" || typeof body.enabled !== "boolean" || typeof body.reason !== "string" || !body.reason.trim()) {
    return fail(400, "id, enabled, and reason are required.");
  }
  const auth = await administrator();
  if ("error" in auth) return auth.error;
  try {
    const result = await setAutomationRuleEnabled({
      id: body.id,
      enabled: body.enabled,
      reason: body.reason.trim().slice(0, 2_000),
      actorId: auth.actor.id,
      actorName: auth.principal?.name ?? "Apex administrator",
      actorRole: auth.actor.role,
      at: nowIso(),
    });
    if (!result) return fail(404, "Unknown automation rule.");
    return NextResponse.json({ ok: true, authoritative: true, taskOnly: true, rule: result.rule, ledgerId: result.ledger.id });
  } catch (error) {
    return unavailable("automations.update", error, "The automation rule was not changed.");
  }
}
