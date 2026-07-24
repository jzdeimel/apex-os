export type Rule = {
  id: string;
  name: string;
  triggerType: string;
  config: unknown;
  actionType: string;
  enabled: boolean;
  cadenceMinutes: number;
  nextRunAt: string;
  ownerStaffId: string;
  updatedAt: string;
};

export type Run = {
  id: string;
  ruleId: string;
  workerId: string;
  trigger: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  evaluatedCount: number;
  actionCount: number;
  errorCode: string | null;
};

export type Worker = {
  id: string;
  status: string;
  version: string;
  lastSeenAt: string;
  lastCompletedAt: string | null;
  lastRunId: string | null;
  lastErrorCode: string | null;
};

export type AutomationState = {
  rules: Rule[];
  runs: Run[];
  workers: Worker[];
};

function toIso(value: unknown) {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

export function serializeAutomationState(state: {
  rules: Array<Record<string, unknown>>;
  runs: Array<Record<string, unknown>>;
  workers: Array<Record<string, unknown>>;
}): AutomationState {
  return {
    rules: state.rules.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      triggerType: String(row.triggerType),
      config: row.config,
      actionType: String(row.actionType),
      enabled: Boolean(row.enabled),
      cadenceMinutes: Number(row.cadenceMinutes),
      nextRunAt: toIso(row.nextRunAt),
      ownerStaffId: String(row.ownerStaffId),
      updatedAt: toIso(row.updatedAt),
    })),
    runs: state.runs.map((row) => ({
      id: String(row.id),
      ruleId: String(row.ruleId),
      workerId: String(row.workerId),
      trigger: String(row.trigger),
      status: String(row.status),
      startedAt: toIso(row.startedAt),
      finishedAt: row.finishedAt ? toIso(row.finishedAt) : null,
      evaluatedCount: Number(row.evaluatedCount),
      actionCount: Number(row.actionCount),
      errorCode: row.errorCode ? String(row.errorCode) : null,
    })),
    workers: state.workers.map((row) => ({
      id: String(row.id),
      status: String(row.status),
      version: String(row.version),
      lastSeenAt: toIso(row.lastSeenAt),
      lastCompletedAt: row.lastCompletedAt ? toIso(row.lastCompletedAt) : null,
      lastRunId: row.lastRunId ? String(row.lastRunId) : null,
      lastErrorCode: row.lastErrorCode ? String(row.lastErrorCode) : null,
    })),
  };
}
