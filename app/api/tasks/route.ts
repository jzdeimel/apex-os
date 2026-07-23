import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { nowIso } from "@/lib/clock";
import { appendLedgerRow, readClientCareScope } from "@/lib/db/repo";
import {
  attachWorkTaskLedger,
  createWorkTask,
  readActiveTaskAssignee,
  readWorkTask,
  readWorkTasks,
  updateWorkTask,
} from "@/lib/db/workTaskRepo";

export const dynamic = "force-dynamic";

const REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;
const PRIORITIES = new Set(["high", "medium", "low"]);
const STATUSES = new Set(["open", "complete"]);

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

function subject(scope: Awaited<ReturnType<typeof readClientCareScope>> | null) {
  return scope ? {
    coachId: scope.assignedCoachId ?? undefined,
    providerId: scope.assignedProviderId ?? undefined,
    locationId: scope.locationId ?? undefined,
  } : undefined;
}

export async function GET() {
  const g = await guard("write:task");
  if (!g.ok) return g.res;
  try {
    const allTasks = g.actor.accessProfile === "operations" || g.actor.accessProfile === "owner";
    const tasks = await readWorkTasks({ assigneeStaffId: allTasks ? undefined : g.actor.id });
    return NextResponse.json({ ok: true, authoritative: true, tasks });
  } catch (error) {
    return unavailable("tasks.list", error, "The authoritative task board is temporarily unavailable.");
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This task request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.requestId !== "string" || !REQUEST_ID.test(body.requestId)) return fail(400, "A valid requestId is required.");
  if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 300) return fail(400, "Task title must be 1-300 characters.");
  if (typeof body.taskType !== "string" || !body.taskType.trim() || body.taskType.length > 100) return fail(400, "A valid task type is required.");
  if (typeof body.priority !== "string" || !PRIORITIES.has(body.priority)) return fail(400, "Task priority is invalid.");
  const dueAt = typeof body.dueAt === "string" ? new Date(body.dueAt) : null;
  if (!dueAt || Number.isNaN(dueAt.getTime())) return fail(400, "A valid due date is required.");
  const clientId = typeof body.clientId === "string" && body.clientId ? body.clientId : undefined;
  const scope = clientId ? await readClientCareScope(clientId).catch(() => null) : null;
  if (clientId && !scope) return fail(404, "Unknown patient.");
  const g = await guard("write:task", subject(scope));
  if (!g.ok) return g.res;

  const requestedAssignee = typeof body.assigneeStaffId === "string" ? body.assigneeStaffId : g.actor.id;
  const mayAssignOthers = g.actor.accessProfile === "operations" || g.actor.accessProfile === "owner";
  const assigneeId = mayAssignOthers ? requestedAssignee : g.actor.id;
  const assignee = await readActiveTaskAssignee(assigneeId).catch(() => null);
  if (!assignee) return fail(400, "The assignee is not an active Apex staff member.");

  try {
    const at = new Date();
    const result = await createWorkTask({
      id: `task-${body.requestId}`,
      title: body.title.trim(),
      taskType: body.taskType.trim(),
      detail: typeof body.detail === "string" ? body.detail.trim().slice(0, 10_000) : undefined,
      clientId,
      locationId: scope?.locationId ?? undefined,
      assigneeStaffId: assigneeId,
      createdByStaffId: g.actor.id,
      priority: body.priority,
      dueAt,
      at,
    });
    if (!result.task) return fail(409, "That task request conflicts with an existing record.");
    if (result.duplicate) return NextResponse.json({ ok: true, authoritative: true, duplicate: true, task: result.task });
    const ledger = await appendLedgerRow({
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      action: "create",
      entity: "note",
      entityId: result.task.id,
      subjectId: scope?.id,
      subjectName: scope ? `${scope.preferredName || scope.firstName} ${scope.lastName}` : undefined,
      reason: "Created an authoritative staff task.",
      after: { title: result.task.title, priority: result.task.priority, assigneeStaffId: result.task.assigneeStaffId },
    }, nowIso());
    await attachWorkTaskLedger(result.task.id, ledger.id);
    return NextResponse.json({ ok: true, authoritative: true, duplicate: false, task: { ...result.task, ledgerId: ledger.id } });
  } catch (error) {
    return unavailable("tasks.create", error, "The task was not created.");
  }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return fail(403, "This task request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string") return fail(400, "Task id is required.");
  const priority = typeof body.priority === "string" ? body.priority : undefined;
  const status = typeof body.status === "string" ? body.status : undefined;
  if (!priority && !status) return fail(400, "A priority or status change is required.");
  if (priority && !PRIORITIES.has(priority)) return fail(400, "Task priority is invalid.");
  if (status && !STATUSES.has(status)) return fail(400, "Task status is invalid.");
  const existing = await readWorkTask(body.id).catch(() => null);
  if (!existing) return fail(404, "Unknown task.");
  const scope = existing.clientId ? await readClientCareScope(existing.clientId).catch(() => null) : null;
  const g = await guard("write:task", subject(scope));
  if (!g.ok) return g.res;
  const ownsTask = existing.assigneeStaffId === g.actor.id;
  const managesTasks = g.actor.accessProfile === "operations" || g.actor.accessProfile === "owner";
  if (!ownsTask && !managesTasks) return fail(403, "Only the assignee or operations may update this task.");

  try {
    const updated = await updateWorkTask({
      id: existing.id,
      priority,
      status: status as "open" | "complete" | undefined,
      actorId: g.actor.id,
      at: new Date(),
    });
    if (!updated) return fail(404, "Unknown task.");
    const ledger = await appendLedgerRow({
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      action: "update",
      entity: "note",
      entityId: updated.id,
      subjectId: scope?.id,
      subjectName: scope ? `${scope.preferredName || scope.firstName} ${scope.lastName}` : undefined,
      reason: status ? `Changed task status to ${status}.` : `Changed task priority to ${priority}.`,
      before: { priority: existing.priority, status: existing.status },
      after: { priority: updated.priority, status: updated.status },
    }, nowIso());
    await attachWorkTaskLedger(updated.id, ledger.id);
    return NextResponse.json({ ok: true, authoritative: true, task: { ...updated, ledgerId: ledger.id } });
  } catch (error) {
    return unavailable("tasks.update", error, "The task change was not saved.");
  }
}
