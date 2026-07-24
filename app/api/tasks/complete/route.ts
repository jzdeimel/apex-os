import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { requestIsSameOrigin } from "@/lib/api/origin";
import { guard } from "@/lib/auth/guard";
import { can } from "@/lib/authz/capabilities";
import { nowIso } from "@/lib/clock";
import { appendLedgerRow, readClientCareScope } from "@/lib/db/repo";
import {
  attachWorkTaskLedger,
  readWorkTask,
  updateWorkTask,
} from "@/lib/db/workTaskRepo";
import type { LedgerDraft } from "@/lib/trace/chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Compatibility contract for clients that still post a taskId. */
export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) {
    return fail(403, "This task request came from an untrusted origin.");
  }
  const g = await guard("write:task");
  if (!g.ok) return g.res;
  const body = (await request.json().catch(() => null)) as
    | { taskId?: unknown; label?: unknown }
    | null;
  if (!body || typeof body.taskId !== "string" || !body.taskId.trim()) {
    return fail(400, "taskId is required.");
  }

  try {
    const existing = await readWorkTask(body.taskId.trim());
    if (!existing) return fail(404, "Unknown task.");
    const scope = existing.clientId
      ? await readClientCareScope(existing.clientId)
      : null;
    const decision = can(
      g.actor,
      "write:task",
      scope
        ? {
            coachId: scope.assignedCoachId ?? undefined,
            providerId: scope.assignedProviderId ?? undefined,
            locationId: scope.locationId ?? undefined,
          }
        : undefined,
    );
    if (!decision.allowed) return fail(403, decision.reason);
    const ownsTask = existing.assigneeStaffId === g.actor.id;
    const managesTasks =
      g.actor.accessProfile === "operations" || g.actor.accessProfile === "owner";
    if (!ownsTask && !managesTasks) {
      return fail(403, "Only the assignee or operations may complete this task.");
    }
    if (existing.status === "complete") {
      return NextResponse.json({
        ok: true,
        authoritative: true,
        duplicate: true,
        task: existing,
      });
    }

    const updated = await updateWorkTask({
      id: existing.id,
      status: "complete",
      actorId: g.actor.id,
      at: new Date(),
    });
    if (!updated) return fail(404, "Unknown task.");
    const ledger = await appendLedgerRow(
      {
        actorId: g.actor.id,
        actorName: g.principal.name,
        actorRole: g.actor.role,
        action: "update",
        entity: "note",
        entityId: updated.id,
        subjectId: scope?.id,
        subjectName: scope
          ? `${scope.preferredName || scope.firstName} ${scope.lastName}`
          : undefined,
        locationId: (scope?.locationId ?? undefined) as LedgerDraft["locationId"],
        reason:
          typeof body.label === "string" && body.label.trim()
            ? `Completed task: ${body.label.trim().slice(0, 300)}`
            : "Completed authoritative task.",
        before: { status: existing.status },
        after: { status: "complete" },
      },
      nowIso(),
    );
    await attachWorkTaskLedger(updated.id, ledger.id);
    return NextResponse.json({
      ok: true,
      authoritative: true,
      duplicate: false,
      task: { ...updated, ledgerId: ledger.id },
    });
  } catch (error) {
    return unavailable(
      "tasks.complete",
      error,
      "The task completion was not recorded.",
    );
  }
}
