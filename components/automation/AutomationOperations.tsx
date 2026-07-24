"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock3,
  Cpu,
  ListTodo,
  Play,
  Plus,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
} from "@/components/ui/primitives";

type Rule = {
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

type Run = {
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

type Worker = {
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

const TRIGGERS = [
  {
    value: "unread-coach-message",
    label: "Unread patient message",
    threshold: 60,
    detail: "Creates a high-priority task for the assigned coach.",
  },
  {
    value: "critical-lab-review",
    label: "Critical lab without signed review",
    threshold: 5,
    detail: "Creates a high-priority task for the assigned provider.",
  },
  {
    value: "inactive-patient-review",
    label: "Active patient without recent contact",
    threshold: 43_200,
    detail: "Creates a patient follow-up task for the assigned coach.",
  },
] as const;

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

function triggerLabel(value: string) {
  return TRIGGERS.find((item) => item.value === value)?.label ?? value;
}

function thresholdFor(rule: Rule) {
  if (!rule.config || typeof rule.config !== "object") return null;
  const value = Number((rule.config as Record<string, unknown>).thresholdMinutes);
  return Number.isFinite(value) ? value : null;
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function responseJson(response: Response) {
  const body = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (!response.ok) {
    throw new Error(
      typeof body?.message === "string"
        ? body.message
        : `Request failed with HTTP ${response.status}.`,
    );
  }
  return body;
}

export function AutomationOperations({
  initialState,
  view = "rules",
}: {
  initialState: AutomationState;
  view?: "rules" | "workers";
}) {
  const [state, setState] = useState(initialState);
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<(typeof TRIGGERS)[number]["value"]>(
    TRIGGERS[0].value,
  );
  const [thresholdMinutes, setThresholdMinutes] = useState<number>(
    TRIGGERS[0].threshold,
  );
  const [cadenceMinutes, setCadenceMinutes] = useState(15);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ruleName = useMemo(
    () => new Map(state.rules.map((rule) => [rule.id, rule.name])),
    [state.rules],
  );

  async function refresh() {
    const body = await responseJson(
      await fetch("/api/automations", { cache: "no-store" }),
    );
    setState({
      rules: (body?.rules ?? []) as Rule[],
      runs: (body?.runs ?? []) as Run[],
      workers: (body?.workers ?? []) as Worker[],
    });
  }

  async function createRule(event: React.FormEvent) {
    event.preventDefault();
    setBusy("create");
    setError(null);
    setNotice(null);
    try {
      await responseJson(
        await fetch("/api/automations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            requestId: crypto.randomUUID(),
            name,
            triggerType,
            thresholdMinutes,
            cadenceMinutes,
            enabled: false,
          }),
        }),
      );
      setName("");
      await refresh();
      setNotice(
        "Rule saved disabled. Review its scope, then enable it with an audit reason.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Rule creation failed.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleRule(rule: Rule) {
    const reason = window.prompt(
      `${rule.enabled ? "Disable" : "Enable"} “${rule.name}”. Enter the operational reason for the audit trail:`,
    );
    if (!reason?.trim()) return;
    setBusy(rule.id);
    setError(null);
    setNotice(null);
    try {
      await responseJson(
        await fetch("/api/automations", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: rule.id,
            enabled: !rule.enabled,
            reason,
          }),
        }),
      );
      await refresh();
      setNotice(`${rule.name} is now ${rule.enabled ? "disabled" : "enabled"}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Rule update failed.");
    } finally {
      setBusy(null);
    }
  }

  async function runRule(ruleId?: string) {
    setBusy(ruleId ? `run-${ruleId}` : "run-all");
    setError(null);
    setNotice(null);
    try {
      const body = await responseJson(
        await fetch("/api/automations/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(ruleId ? { ruleId } : {}),
        }),
      );
      await refresh();
      setNotice(
        body?.locked
          ? "Another worker already holds the automation lock."
          : `Run complete. ${Number(body?.actionCount ?? 0)} durable task action(s) created.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Automation run failed.");
    } finally {
      setBusy(null);
    }
  }

  const enabled = state.rules.filter((rule) => rule.enabled).length;
  const recentActions = state.runs.reduce(
    (sum, run) => sum + run.actionCount,
    0,
  );

  return (
    <div className="space-y-5">
      <div>
        <p className="label-eyebrow">
          {view === "rules"
            ? "Authoritative internal task rules"
            : "Scheduled worker health and run history"}
        </p>
        <h1 className="mt-1 font-display text-title font-bold tracking-tight text-ink-50">
          {view === "rules" ? "Automations" : "Background jobs"}
        </h1>
        <p className="mt-2 max-w-3xl text-body leading-relaxed text-ink-300">
          These jobs inspect Apex records and create assigned staff tasks. They
          cannot send messages, make clinical decisions, move money, change
          inventory, or contact a patient.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Rules" value={state.rules.length} icon={<ListTodo />} />
        <Metric label="Enabled" value={enabled} icon={<CheckCircle2 />} />
        <Metric label="Workers seen" value={state.workers.length} icon={<Cpu />} />
        <Metric label="Task actions in history" value={recentActions} icon={<Activity />} />
      </div>

      <div className="rounded-xl border border-gold-400/25 bg-gold-400/5 p-4">
        <p className="flex items-center gap-2 text-body font-semibold text-gold-200">
          <ShieldCheck className="h-4 w-4" />
          Fail-closed by design
        </p>
        <p className="mt-1 text-detail leading-relaxed text-ink-300">
          New rules start disabled, every enable or disable requires a reason,
          duplicate actions are suppressed, and only one worker evaluates rules
          at a time.
        </p>
      </div>

      {(notice || error) && (
        <div
          className={`rounded-lg border px-4 py-3 text-body ${
            error
              ? "border-high/30 bg-high/10 text-high"
              : "border-optimal/30 bg-optimal/10 text-optimal"
          }`}
          role="status"
        >
          {error ?? notice}
        </div>
      )}

      {view === "rules" ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Create a task rule</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-3 lg:grid-cols-[1.4fr_1.3fr_0.7fr_0.7fr_auto]"
                onSubmit={createRule}
              >
                <Input
                  aria-label="Rule name"
                  placeholder="Rule name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={200}
                />
                <Select
                  aria-label="Trigger"
                  value={triggerType}
                  onChange={(event) => {
                    const next = event.target
                      .value as (typeof TRIGGERS)[number]["value"];
                    setTriggerType(next);
                    setThresholdMinutes(
                      TRIGGERS.find((item) => item.value === next)?.threshold ??
                        60,
                    );
                  }}
                >
                  {TRIGGERS.map((trigger) => (
                    <option key={trigger.value} value={trigger.value}>
                      {trigger.label}
                    </option>
                  ))}
                </Select>
                <Input
                  aria-label="Threshold minutes"
                  title="Threshold in minutes"
                  type="number"
                  min={5}
                  max={525600}
                  value={thresholdMinutes}
                  onChange={(event) =>
                    setThresholdMinutes(Number(event.target.value))
                  }
                />
                <Input
                  aria-label="Cadence minutes"
                  title="Evaluation cadence in minutes"
                  type="number"
                  min={5}
                  max={1440}
                  value={cadenceMinutes}
                  onChange={(event) =>
                    setCadenceMinutes(Number(event.target.value))
                  }
                />
                <Button
                  type="submit"
                  variant="primary"
                  disabled={busy === "create"}
                >
                  <Plus className="h-4 w-4" />
                  Save disabled
                </Button>
              </form>
              <p className="mt-3 text-detail text-ink-400">
                {
                  TRIGGERS.find((trigger) => trigger.value === triggerType)
                    ?.detail
                }
              </p>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {state.rules.length === 0 ? (
              <Card>
                <CardContent className="pt-5 text-body text-ink-400">
                  No rules have been configured. Nothing will run until an
                  administrator creates and explicitly enables a rule.
                </CardContent>
              </Card>
            ) : (
              state.rules.map((rule) => (
                <Card key={rule.id}>
                  <CardContent className="pt-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-display text-heading font-semibold text-ink-50">
                            {rule.name}
                          </h2>
                          <Badge tone={rule.enabled ? "optimal" : "neutral"}>
                            {rule.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                          <Badge tone="info">Creates staff task only</Badge>
                        </div>
                        <p className="mt-2 text-body text-ink-300">
                          {triggerLabel(rule.triggerType)}
                          {thresholdFor(rule) !== null
                            ? ` after ${thresholdFor(rule)} minutes`
                            : ""}
                          . Evaluates every {rule.cadenceMinutes} minutes.
                        </p>
                        <p className="mt-1 text-detail text-ink-500">
                          Next eligible run {formatDate(rule.nextRunAt)} · Last
                          changed {formatDate(rule.updatedAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === `run-${rule.id}`}
                          onClick={() => runRule(rule.id)}
                        >
                          <Play className="h-4 w-4" />
                          Evaluate now
                        </Button>
                        <Button
                          size="sm"
                          variant={rule.enabled ? "danger" : "success"}
                          disabled={busy === rule.id}
                          onClick={() => toggleRule(rule)}
                        >
                          {rule.enabled ? "Disable" : "Enable"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex justify-end">
            <Button
              variant="outline"
              disabled={busy === "run-all"}
              onClick={() => runRule()}
            >
              <Play className="h-4 w-4" />
              Run due rules now
            </Button>
          </div>

          <section>
            <h2 className="mb-3 font-display text-heading font-semibold text-ink-50">
              Worker heartbeats
            </h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {state.workers.length === 0 ? (
                <Card>
                  <CardContent className="pt-5 text-body text-ink-400">
                    No scheduled worker has checked in yet. Rules remain durable
                    but do not run automatically until the worker is deployed.
                  </CardContent>
                </Card>
              ) : (
                state.workers.map((worker) => (
                  <Card key={worker.id}>
                    <CardContent className="pt-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-ink-50">{worker.id}</p>
                          <p className="mt-1 text-detail text-ink-400">
                            Build {worker.version}
                          </p>
                        </div>
                        <Badge
                          tone={
                            worker.status === "idle" ||
                            worker.status === "succeeded"
                              ? "optimal"
                              : worker.status === "running"
                                ? "gold"
                                : "high"
                          }
                        >
                          {worker.status}
                        </Badge>
                      </div>
                      <p className="mt-3 text-detail text-ink-300">
                        Last seen {formatDate(worker.lastSeenAt)}
                      </p>
                      <p className="mt-1 text-detail text-ink-400">
                        Last completion {formatDate(worker.lastCompletedAt)}
                      </p>
                      {worker.lastErrorCode && (
                        <p className="mt-2 text-detail text-high">
                          Error: {worker.lastErrorCode}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-display text-heading font-semibold text-ink-50">
              Durable run history
            </h2>
            <Card>
              <CardContent className="pt-5">
                {state.runs.length === 0 ? (
                  <p className="text-body text-ink-400">
                    No rule has been evaluated yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-detail">
                      <thead className="border-b border-ink-700 text-ink-400">
                        <tr>
                          <th className="pb-3 font-medium">Started</th>
                          <th className="pb-3 font-medium">Rule</th>
                          <th className="pb-3 font-medium">Worker</th>
                          <th className="pb-3 font-medium">Status</th>
                          <th className="pb-3 text-right font-medium">Evaluated</th>
                          <th className="pb-3 text-right font-medium">Tasks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.runs.map((run) => (
                          <tr
                            key={run.id}
                            className="border-b border-ink-800/70 text-ink-200"
                          >
                            <td className="py-3">{formatDate(run.startedAt)}</td>
                            <td className="py-3">
                              {ruleName.get(run.ruleId) ?? run.ruleId}
                            </td>
                            <td className="py-3">{run.workerId}</td>
                            <td className="py-3">
                              <Badge
                                tone={
                                  run.status === "succeeded"
                                    ? "optimal"
                                    : run.status === "running"
                                      ? "gold"
                                      : "high"
                                }
                              >
                                {run.status === "failed" ? (
                                  <XCircle className="h-3 w-3" />
                                ) : run.status === "running" ? (
                                  <Clock3 className="h-3 w-3" />
                                ) : (
                                  <CheckCircle2 className="h-3 w-3" />
                                )}
                                {run.status}
                              </Badge>
                            </td>
                            <td className="py-3 text-right stat-mono">
                              {run.evaluatedCount}
                            </td>
                            <td className="py-3 text-right stat-mono">
                              {run.actionCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactElement;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between pt-5">
        <div>
          <p className="text-detail text-ink-400">{label}</p>
          <p className="mt-1 stat-mono text-2xl font-semibold text-ink-50">
            {value}
          </p>
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-gold-400/10 text-gold-300 [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
      </CardContent>
    </Card>
  );
}
