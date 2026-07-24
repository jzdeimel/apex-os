"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, ListChecks, Loader2, Plus, RefreshCw } from "lucide-react";

import { Badge, Button, Card, CardContent, Input, Select } from "@/components/ui/primitives";

type WorkTask = {
  id: string;
  title: string;
  taskType: string;
  detail: string | null;
  clientId: string | null;
  clientFirstName: string | null;
  clientLastName: string | null;
  clientPreferredName: string | null;
  assigneeName: string | null;
  priority: "high" | "medium" | "low";
  status: "open" | "complete";
  dueAt: string;
  completedAt: string | null;
  ledgerId: string | null;
};

type Patient = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
};

const TYPES = [
  "Call patient",
  "Send lab reminder",
  "Review results",
  "Schedule follow-up",
  "Check inventory",
  "Provider review needed",
  "General follow-up",
];

const COLUMNS = [
  { key: "high" as const, label: "High priority", tone: "high" as const },
  { key: "medium" as const, label: "Medium", tone: "watch" as const },
  { key: "low" as const, label: "Low", tone: "neutral" as const },
];

function defaultDueAt() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(12, 0, 0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function dueLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState(TYPES[0]);
  const [clientId, setClientId] = useState("");
  const [priority, setPriority] = useState<"high" | "medium" | "low">("medium");
  const [dueAt, setDueAt] = useState(defaultDueAt);
  const [showDone, setShowDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [taskResponse, patientResponse] = await Promise.all([
        fetch("/api/tasks", { cache: "no-store" }),
        fetch("/api/clients?page=0", { cache: "no-store" }),
      ]);
      const taskPayload = await taskResponse.json();
      const patientPayload = await patientResponse.json();
      if (!taskResponse.ok || !taskPayload.ok) throw new Error(taskPayload.error || "Tasks could not be loaded.");
      if (!patientResponse.ok || !patientPayload.ok) throw new Error(patientPayload.error || "Patients could not be loaded.");
      setTasks(taskPayload.tasks ?? []);
      setPatients(patientPayload.patients ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The task board could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusyId("create");
    setError(null);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          title: title.trim(),
          taskType,
          clientId: clientId || undefined,
          priority,
          dueAt: new Date(dueAt).toISOString(),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The task was not created.");
      setTitle("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The task was not created.");
    } finally {
      setBusyId(null);
    }
  }

  async function update(id: string, change: { priority?: WorkTask["priority"]; status?: WorkTask["status"] }) {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...change }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The task was not updated.");
      setTasks((current) => current.map((task) => task.id === id ? { ...task, ...payload.task } : task));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The task was not updated.");
    } finally {
      setBusyId(null);
    }
  }

  const open = tasks.filter((task) => task.status === "open");
  const complete = tasks.filter((task) => task.status === "complete");
  const byColumn = useMemo(
    () => COLUMNS.map((column) => ({ ...column, tasks: open.filter((task) => task.priority === column.key) })),
    [open],
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Badge tone="optimal">AUTHORITATIVE</Badge><Badge>APEX POSTGRESQL</Badge></div>
          <h1 className="mt-2 flex items-center gap-2 font-display text-title font-semibold text-ink-50">
            <ListChecks className="h-6 w-6 text-gold-300" /> Tasks
          </h1>
          <p className="mt-1 text-detail text-ink-400">Creation, reprioritization, completion, and reopening survive every browser and reload.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
      </header>

      {error && <p className="rounded-control border border-high/30 bg-high/5 p-4 text-detail text-high" role="alert">{error}</p>}

      <Card>
        <CardContent className="p-4">
          <form onSubmit={create} className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_0.7fr_1fr_auto]">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Task title" maxLength={300} required />
            <Select value={taskType} onChange={(event) => setTaskType(event.target.value)}>{TYPES.map((type) => <option key={type}>{type}</option>)}</Select>
            <Select value={clientId} onChange={(event) => setClientId(event.target.value)}>
              <option value="">No patient</option>
              {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.preferredName || patient.firstName} {patient.lastName}</option>)}
            </Select>
            <Select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}>
              <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </Select>
            <Input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} required />
            <Button type="submit" disabled={busyId === "create" || !title.trim()}>
              {busyId === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {byColumn.map((column) => (
          <section key={column.key} className="rounded-panel border border-ink-800 bg-ink-900/30 p-3">
            <header className="mb-3 flex items-center justify-between">
              <h2 className="font-medium text-ink-100">{column.label}</h2>
              <Badge tone={column.tone}>{column.tasks.length}</Badge>
            </header>
            <div className="space-y-2">
              {column.tasks.length === 0 && <p className="rounded-control border border-dashed border-ink-800 p-6 text-center text-detail text-ink-600">No tasks</p>}
              {column.tasks.map((task) => (
                <article key={task.id} className="rounded-control border border-ink-800 bg-ink-950/30 p-3">
                  <div className="flex items-start gap-2">
                    <button
                      className="mt-0.5 text-ink-500 hover:text-optimal"
                      onClick={() => void update(task.id, { status: "complete" })}
                      disabled={busyId === task.id}
                      aria-label={`Complete ${task.title}`}
                    >
                      {busyId === task.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Circle className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-body text-ink-100">{task.title}</p>
                      <p className="mt-1 text-micro text-ink-500">{task.taskType} · due {dueLabel(task.dueAt)} · {task.assigneeName || "Unassigned"}</p>
                      {task.clientId && (
                        <Link href={`/clients/${task.clientId}`} className="mt-1 inline-block text-micro text-gold-300 hover:underline">
                          {task.clientPreferredName || task.clientFirstName} {task.clientLastName}
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex gap-1">
                    {COLUMNS.filter((target) => target.key !== task.priority).map((target) => (
                      <Button key={target.key} size="sm" variant="ghost" onClick={() => void update(task.id, { priority: target.key })} disabled={busyId === task.id}>
                        Move {target.key}
                      </Button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section>
        <button className="text-detail text-ink-400 hover:text-ink-100" onClick={() => setShowDone((value) => !value)}>
          {showDone ? "Hide" : "Show"} completed ({complete.length})
        </button>
        {showDone && (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {complete.map((task) => (
              <article key={task.id} className="flex items-center gap-3 rounded-control border border-ink-800 bg-ink-900/30 p-3">
                <CheckCircle2 className="h-4 w-4 text-optimal" />
                <span className="flex-1 text-detail text-ink-500 line-through">{task.title}</span>
                <Button size="sm" variant="ghost" onClick={() => void update(task.id, { status: "open" })} disabled={busyId === task.id}>Reopen</Button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
