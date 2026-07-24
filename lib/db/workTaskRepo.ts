import { and, asc, eq } from "drizzle-orm";

import { requireDb } from "@/lib/db/client";
import { client, staff, workTask } from "@/lib/db/schema";

export async function readWorkTasks(input: { assigneeStaffId?: string }) {
  const db = requireDb();
  return db
    .select({
      id: workTask.id,
      title: workTask.title,
      taskType: workTask.taskType,
      detail: workTask.detail,
      clientId: workTask.clientId,
      clientFirstName: client.firstName,
      clientLastName: client.lastName,
      clientPreferredName: client.preferredName,
      locationId: workTask.locationId,
      assigneeStaffId: workTask.assigneeStaffId,
      assigneeName: staff.name,
      priority: workTask.priority,
      status: workTask.status,
      dueAt: workTask.dueAt,
      completedAt: workTask.completedAt,
      createdAt: workTask.createdAt,
      updatedAt: workTask.updatedAt,
      ledgerId: workTask.ledgerId,
    })
    .from(workTask)
    .leftJoin(client, eq(workTask.clientId, client.id))
    .leftJoin(staff, eq(workTask.assigneeStaffId, staff.id))
    .where(input.assigneeStaffId ? eq(workTask.assigneeStaffId, input.assigneeStaffId) : undefined)
    .orderBy(asc(workTask.status), asc(workTask.dueAt), asc(workTask.createdAt));
}

export async function readWorkTask(id: string) {
  const db = requireDb();
  const [row] = await db.select().from(workTask).where(eq(workTask.id, id)).limit(1);
  return row ?? null;
}

export async function readActiveTaskAssignee(id: string) {
  const db = requireDb();
  const [row] = await db
    .select({ id: staff.id, name: staff.name, locationIds: staff.locationIds })
    .from(staff)
    .where(and(eq(staff.id, id), eq(staff.active, true)))
    .limit(1);
  return row ?? null;
}

export async function createWorkTask(input: {
  id: string;
  title: string;
  taskType: string;
  detail?: string;
  clientId?: string;
  locationId?: string;
  assigneeStaffId: string;
  createdByStaffId: string;
  priority: string;
  dueAt: Date;
  at: Date;
}) {
  const db = requireDb();
  const inserted = await db
    .insert(workTask)
    .values({
      ...input,
      detail: input.detail || null,
      clientId: input.clientId || null,
      locationId: input.locationId || null,
      status: "open",
      createdAt: input.at,
      updatedAt: input.at,
    })
    .onConflictDoNothing({ target: workTask.id })
    .returning();
  if (inserted[0]) return { task: inserted[0], duplicate: false };
  const existing = await readWorkTask(input.id);
  return { task: existing, duplicate: true };
}

export async function updateWorkTask(input: {
  id: string;
  priority?: string;
  status?: "open" | "complete";
  actorId: string;
  at: Date;
}) {
  const db = requireDb();
  const [row] = await db
    .update(workTask)
    .set({
      priority: input.priority,
      status: input.status,
      completedAt: input.status === "complete" ? input.at : input.status === "open" ? null : undefined,
      completedByStaffId: input.status === "complete" ? input.actorId : input.status === "open" ? null : undefined,
      updatedAt: input.at,
    })
    .where(eq(workTask.id, input.id))
    .returning();
  return row ?? null;
}

export async function attachWorkTaskLedger(id: string, ledgerId: string) {
  const db = requireDb();
  await db.update(workTask).set({ ledgerId }).where(eq(workTask.id, id));
}
