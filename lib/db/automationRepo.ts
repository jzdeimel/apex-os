import { createHash, randomUUID } from "node:crypto";
import {
  and,
  desc,
  eq,
  isNull,
  lt,
  lte,
  max,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  automationAction,
  automationRule,
  automationRun,
  automationWorker,
  client,
  contactEntry,
  labResult,
  labReview,
  message,
  workTask,
} from "@/lib/db/schema";
import { appendLedgerInTx } from "@/lib/db/repo";

export const AUTOMATION_TRIGGER_TYPES = [
  "unread-coach-message",
  "critical-lab-review",
  "inactive-patient-review",
] as const;
export type AutomationTriggerType = (typeof AUTOMATION_TRIGGER_TYPES)[number];

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function threshold(config: unknown, fallback: number) {
  if (!config || typeof config !== "object") return fallback;
  const value = Number((config as Record<string, unknown>).thresholdMinutes);
  return Number.isFinite(value) ? Math.max(5, Math.min(525_600, Math.floor(value))) : fallback;
}

export async function readAutomationState() {
  const db = requireDb();
  const [rules, runs, workers] = await Promise.all([
    db.select().from(automationRule).orderBy(automationRule.name),
    db.select().from(automationRun).orderBy(desc(automationRun.startedAt)).limit(200),
    db.select().from(automationWorker).orderBy(desc(automationWorker.lastSeenAt)),
  ]);
  return { rules, runs, workers };
}

export async function createAutomationRule(input: {
  id: string;
  name: string;
  triggerType: AutomationTriggerType;
  thresholdMinutes: number;
  cadenceMinutes: number;
  enabled: boolean;
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(automationRule)
      .where(eq(automationRule.id, input.id))
      .limit(1);
    if (existing) return { rule: existing, ledger: null, duplicate: true };
    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: "create",
        entity: "rule-set",
        entityId: input.id,
        reason: "Created a closed-vocabulary internal task automation",
        after: {
          triggerType: input.triggerType,
          actionType: "create-task",
          enabled: input.enabled,
          cadenceMinutes: input.cadenceMinutes,
        },
      },
      input.at,
    );
    const at = new Date(input.at);
    const [rule] = await tx
      .insert(automationRule)
      .values({
        id: input.id,
        name: input.name,
        triggerType: input.triggerType,
        config: { thresholdMinutes: input.thresholdMinutes },
        actionType: "create-task",
        enabled: input.enabled,
        cadenceMinutes: input.cadenceMinutes,
        nextRunAt: at,
        ownerStaffId: input.actorId,
        createdAt: at,
        updatedAt: at,
        updatedByStaffId: input.actorId,
        ledgerId: ledger.id,
      })
      .returning();
    return { rule, ledger, duplicate: false };
  });
}

export async function setAutomationRuleEnabled(input: {
  id: string;
  enabled: boolean;
  actorId: string;
  actorName: string;
  actorRole: string;
  reason: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(automationRule)
      .where(eq(automationRule.id, input.id))
      .limit(1);
    if (!before) return null;
    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: "update",
        entity: "rule-set",
        entityId: before.id,
        reason: input.reason,
        before: { enabled: before.enabled },
        after: { enabled: input.enabled },
      },
      input.at,
    );
    const [rule] = await tx
      .update(automationRule)
      .set({
        enabled: input.enabled,
        nextRunAt: new Date(input.at),
        updatedAt: new Date(input.at),
        updatedByStaffId: input.actorId,
        ledgerId: ledger.id,
      })
      .where(eq(automationRule.id, input.id))
      .returning();
    return { rule, ledger };
  });
}

type Candidate = {
  sourceId: string;
  clientId: string;
  patientName: string;
  locationId: string | null;
  assigneeStaffId: string;
  title: string;
  detail: string;
  priority: "high" | "medium";
  dueAt: Date;
};

async function candidatesFor(
  tx: Parameters<Parameters<ReturnType<typeof requireDb>["transaction"]>[0]>[0],
  triggerType: string,
  config: unknown,
  at: Date,
): Promise<Candidate[]> {
  if (triggerType === "unread-coach-message") {
    const cutoff = new Date(at.getTime() - threshold(config, 60) * 60_000);
    const rows = await tx
      .select({
        sourceId: message.id,
        clientId: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        preferredName: client.preferredName,
        locationId: client.homeLocationId,
        assigneeStaffId: client.assignedCoachId,
        sentAt: message.sentAt,
      })
      .from(message)
      .innerJoin(client, eq(message.clientId, client.id))
      .where(
        and(
          eq(message.thread, "coach"),
          eq(message.senderKind, "member"),
          isNull(message.readAt),
          lt(message.sentAt, cutoff),
          eq(client.status, "active"),
          ne(client.assignedCoachId, ""),
        ),
      )
      .limit(200);
    return rows
      .filter((row): row is typeof row & { assigneeStaffId: string } => Boolean(row.assigneeStaffId))
      .map((row) => ({
        sourceId: row.sourceId,
        clientId: row.clientId,
        patientName: `${row.preferredName || row.firstName} ${row.lastName}`.trim(),
        locationId: row.locationId,
        assigneeStaffId: row.assigneeStaffId,
        title: "Respond to unread patient message",
        detail: `Patient message ${row.sourceId} has been unread since ${row.sentAt.toISOString()}.`,
        priority: "high",
        dueAt: new Date(at.getTime() + 30 * 60_000),
      }));
  }
  if (triggerType === "critical-lab-review") {
    const rows = await tx
      .select({
        sourceId: labResult.id,
        clientId: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        preferredName: client.preferredName,
        locationId: client.homeLocationId,
        assigneeStaffId: client.assignedProviderId,
        resultedAt: labResult.resultedAt,
      })
      .from(labResult)
      .innerJoin(client, eq(labResult.clientId, client.id))
      .leftJoin(labReview, eq(labReview.labResultId, labResult.id))
      .where(
        and(
          eq(labResult.critical, true),
          ne(labResult.status, "preliminary"),
          isNull(labReview.id),
          eq(client.status, "active"),
          ne(client.assignedProviderId, ""),
        ),
      )
      .limit(200);
    return rows
      .filter((row): row is typeof row & { assigneeStaffId: string } => Boolean(row.assigneeStaffId))
      .map((row) => ({
        sourceId: row.sourceId,
        clientId: row.clientId,
        patientName: `${row.preferredName || row.firstName} ${row.lastName}`.trim(),
        locationId: row.locationId,
        assigneeStaffId: row.assigneeStaffId,
        title: "Review critical lab result",
        detail: `Critical result ${row.sourceId} resulted at ${row.resultedAt.toISOString()} and has no signed review.`,
        priority: "high",
        dueAt: new Date(at.getTime() + 15 * 60_000),
      }));
  }
  if (triggerType === "inactive-patient-review") {
    const cutoff = new Date(at.getTime() - threshold(config, 43_200) * 60_000);
    const lastContactAt = max(contactEntry.at);
    const rows = await tx
      .select({
        clientId: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        preferredName: client.preferredName,
        locationId: client.homeLocationId,
        assigneeStaffId: client.assignedCoachId,
        status: client.status,
        lastContactAt,
      })
      .from(client)
      .leftJoin(contactEntry, eq(contactEntry.clientId, client.id))
      .where(
        and(
          eq(client.status, "active"),
          eq(client.synthetic, false),
          ne(client.assignedCoachId, ""),
        ),
      )
      .groupBy(client.id)
      .having(or(isNull(lastContactAt), lt(lastContactAt, cutoff)))
      .limit(200);
    return rows
      .filter((row): row is typeof row & { assigneeStaffId: string } => Boolean(row.assigneeStaffId))
      .map((row) => ({
        sourceId: `${row.clientId}:${row.lastContactAt?.toISOString() ?? "never-contacted"}`,
        clientId: row.clientId,
        patientName: `${row.preferredName || row.firstName} ${row.lastName}`.trim(),
        locationId: row.locationId,
        assigneeStaffId: row.assigneeStaffId,
        title: "Contact patient with no recent touch",
        detail: row.lastContactAt
          ? `Active patient has no recorded contact since ${row.lastContactAt.toISOString()}.`
          : "Active patient has no recorded contact history.",
        priority: "medium",
        dueAt: new Date(at.getTime() + 24 * 60 * 60_000),
      }));
  }
  return [];
}

/**
 * Run due task-only automations under a global worker lock. No email, SMS,
 * clinical decision, payment, or inventory mutation can be expressed here.
 */
export async function runAutomationTick(input: {
  workerId: string;
  version: string;
  trigger: "scheduled" | "manual";
  forceRuleId?: string;
  at?: Date;
}) {
  const db = requireDb();
  const at = input.at ?? new Date();
  try {
    return await db.transaction(async (tx) => {
    const [lock] = await tx.execute<{ locked: boolean }>(
      sql`SELECT pg_try_advisory_xact_lock(4343) AS locked`,
    );
    if (!lock?.locked) {
      return {
        locked: true,
        rules: 0,
        evaluatedCount: 0,
        actionCount: 0,
        results: [],
        workerId: input.workerId,
      };
    }
    await tx
      .insert(automationWorker)
      .values({
        id: input.workerId,
        status: "running",
        version: input.version,
        lastSeenAt: at,
      })
      .onConflictDoUpdate({
        target: automationWorker.id,
        set: {
          status: "running",
          version: input.version,
          lastSeenAt: at,
          lastErrorCode: null,
        },
      });
    const rules = await tx
      .select()
      .from(automationRule)
      .where(
        input.forceRuleId
          ? and(
              eq(automationRule.id, input.forceRuleId),
              eq(automationRule.enabled, true),
            )
          : and(
              eq(automationRule.enabled, true),
              lte(automationRule.nextRunAt, at),
            ),
      )
      .orderBy(automationRule.nextRunAt);

    const results: Array<{ ruleId: string; runId: string; evaluated: number; actions: number }> = [];
    let lastRunId: string | null = null;
    for (const rule of rules) {
      const runId = `arun-${randomUUID()}`;
      lastRunId = runId;
      await tx.insert(automationRun).values({
        id: runId,
        ruleId: rule.id,
        workerId: input.workerId,
        trigger: input.trigger,
        status: "running",
        startedAt: at,
      });
      const candidates = await candidatesFor(tx, rule.triggerType, rule.config, at);
      let actions = 0;
      for (const candidate of candidates) {
        const dedupKey = hash(`${rule.id}:${rule.triggerType}:${candidate.sourceId}`);
        const [existing] = await tx
          .select({ id: automationAction.id })
          .from(automationAction)
          .where(eq(automationAction.dedupKey, dedupKey))
          .limit(1);
        if (existing) continue;
        const taskId = `task-auto-${dedupKey.slice(0, 40)}`;
        const taskLedger = await appendLedgerInTx(
          tx,
          {
            actorId: "apex-automation-worker",
            actorName: "Apex automation worker",
            actorRole: "System",
            action: "create",
            entity: "note",
            entityId: taskId,
            subjectId: candidate.clientId,
            subjectName: candidate.patientName,
            reason: `Automation ${rule.name} created an internal staff task`,
            after: {
              triggerType: rule.triggerType,
              assigneeStaffId: candidate.assigneeStaffId,
              sourceId: candidate.sourceId,
            },
          },
          at.toISOString(),
        );
        await tx.insert(workTask).values({
          id: taskId,
          title: candidate.title,
          taskType: `automation:${rule.triggerType}`,
          detail: candidate.detail,
          clientId: candidate.clientId,
          locationId: candidate.locationId,
          assigneeStaffId: candidate.assigneeStaffId,
          createdByStaffId: rule.ownerStaffId,
          priority: candidate.priority,
          status: "open",
          dueAt: candidate.dueAt,
          createdAt: at,
          updatedAt: at,
          ledgerId: taskLedger.id,
        });
        await tx.insert(automationAction).values({
          id: `aact-${dedupKey.slice(0, 40)}`,
          runId,
          ruleId: rule.id,
          dedupKey,
          clientId: candidate.clientId,
          taskId,
          status: "created",
          createdAt: at,
        });
        actions += 1;
      }
      const runLedger = await appendLedgerInTx(
        tx,
        {
          actorId: "apex-automation-worker",
          actorName: "Apex automation worker",
          actorRole: "System",
          action: "update",
          entity: "rule-set",
          entityId: rule.id,
          reason: `Automation evaluated ${candidates.length} candidate records and created ${actions} tasks`,
          after: {
            runId,
            evaluatedCount: candidates.length,
            actionCount: actions,
            trigger: input.trigger,
          },
        },
        at.toISOString(),
      );
      await tx
        .update(automationRun)
        .set({
          status: "succeeded",
          finishedAt: at,
          evaluatedCount: candidates.length,
          actionCount: actions,
          ledgerId: runLedger.id,
        })
        .where(eq(automationRun.id, runId));
      await tx
        .update(automationRule)
        .set({
          nextRunAt: new Date(at.getTime() + rule.cadenceMinutes * 60_000),
          updatedAt: at,
        })
        .where(eq(automationRule.id, rule.id));
      results.push({
        ruleId: rule.id,
        runId,
        evaluated: candidates.length,
        actions,
      });
    }
    await tx
      .update(automationWorker)
      .set({
        status: "idle",
        lastSeenAt: at,
        lastCompletedAt: at,
        lastRunId,
        lastErrorCode: null,
      })
      .where(eq(automationWorker.id, input.workerId));
    return {
      locked: false,
      rules: results.length,
      evaluatedCount: results.reduce((sum, result) => sum + result.evaluated, 0),
      actionCount: results.reduce((sum, result) => sum + result.actions, 0),
      results,
      workerId: input.workerId,
    };
    });
  } catch (error) {
    const failedAt = new Date();
    await db
      .insert(automationWorker)
      .values({
        id: input.workerId,
        status: "failed",
        version: input.version,
        lastSeenAt: failedAt,
        lastErrorCode: "AUTOMATION_TICK_FAILED",
      })
      .onConflictDoUpdate({
        target: automationWorker.id,
        set: {
          status: "failed",
          version: input.version,
          lastSeenAt: failedAt,
          lastErrorCode: "AUTOMATION_TICK_FAILED",
        },
      })
      .catch(() => undefined);
    throw error;
  }
}
