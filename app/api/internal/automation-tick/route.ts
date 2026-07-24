import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { fail, unavailable } from "@/lib/api/respond";
import { runAutomationTick } from "@/lib/db/automationRepo";
import { isFeatureEnabledFor } from "@/lib/features/server";

export const runtime = "nodejs";

function validToken(presented: string | null, expected: string | undefined) {
  if (!presented || !expected || expected.length < 32) return false;
  const left = Buffer.from(presented);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  if (!validToken(request.headers.get("x-apex-automation-token"), process.env.APEX_AUTOMATION_WORKER_TOKEN)) {
    return fail(401, "Worker authentication failed.");
  }
  if (!(await isFeatureEnabledFor("automations", {}))) {
    return NextResponse.json({ ok: true, authoritative: true, skipped: true, reason: "Automations are disabled." });
  }
  try {
    const result = await runAutomationTick({
      workerId: request.headers.get("x-apex-worker-id")?.slice(0, 100) || "aca-scheduled-worker",
      version: process.env.APEX_BUILD_SHA ?? "unknown",
      trigger: "scheduled",
    });
    return NextResponse.json({ ok: true, authoritative: true, taskOnly: true, ...result });
  } catch (error) {
    return unavailable("automations.scheduled-run", error, "The automation worker failed.");
  }
}
