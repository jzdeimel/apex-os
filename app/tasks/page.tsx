"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { getClient, clientName } from "@/lib/mock/clients";
import { staffName } from "@/lib/mock/staff";
import { DashboardCard } from "@/components/DashboardCard";
import { Card, CardContent, Badge, Button, Select, Input } from "@/components/ui/primitives";
import { formatDate, relativeDays, cn } from "@/lib/utils";
import { ListChecks, CheckCircle2, Circle, Plus, Clock, AlertTriangle, GripVertical, MoveRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { TaskType } from "@/lib/types";

const COLUMNS: { key: "high" | "medium" | "low"; label: string; tone: "high" | "watch" | "neutral" }[] = [
  { key: "high", label: "High priority", tone: "high" },
  { key: "medium", label: "Medium", tone: "watch" },
  { key: "low", label: "Low", tone: "neutral" },
];

const TASK_TYPES: TaskType[] = [
  "Call client",
  "Send lab reminder",
  "Review results",
  "Schedule follow-up",
  "Check inventory",
  "Provider approval needed",
];

export default function TasksPage() {
  const { tasks, toggleTask, addTask, setTaskPriority, activeStaffId } = useStore();
  const { toast } = useToast();
  const [showDone, setShowDone] = useState(false);
  const [newType, setNewType] = useState<TaskType>("Call client");
  const [newTitle, setNewTitle] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);

  const moveTask = (id: string, priority: "high" | "medium" | "low", label: string) => {
    setTaskPriority(id, priority);
    setMenuId(null);
    toast("Task moved", { desc: `→ ${label}` });
  };

  const onDrop = (col: "high" | "medium" | "low") => {
    if (dragId) {
      setTaskPriority(dragId, col);
      toast("Task moved", { desc: `→ ${col} priority` });
    }
    setDragId(null);
    setOverCol(null);
  };

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const overdue = open.filter((t) => t.dueDate < "2026-06-12").length;

  const byCol = useMemo(
    () => COLUMNS.map((c) => ({ ...c, items: open.filter((t) => t.priority === c.key) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks],
  );

  return (
    <div className="space-y-5">
      <div>
        <p className="label-eyebrow">Operations · task board</p>
        <h1 className="mt-1 flex items-center gap-2 font-display text-title font-bold tracking-tight text-ink-50">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-gold-300 to-gold-600 text-ink-950">
            <ListChecks className="h-5 w-5" />
          </span>
          Tasks
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DashboardCard label="Open tasks" value={open.length} icon={<Circle className="h-4 w-4" />} accent />
        <DashboardCard label="Overdue" value={overdue} icon={<AlertTriangle className="h-4 w-4" />} deltaTone="down" />
        <DashboardCard label="Completed" value={done.length} icon={<CheckCircle2 className="h-4 w-4" />} />
        <DashboardCard label="High priority" value={byCol[0].items.length} icon={<Clock className="h-4 w-4" />} />
      </div>

      {/* Quick add */}
      <Card>
        <CardContent className="flex flex-col gap-2.5 p-4 sm:flex-row sm:items-center">
          <Select value={newType} onChange={(e) => setNewType(e.target.value as TaskType)} className="sm:w-56">
            {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Task title (optional)…" className="flex-1" />
          <Button
            variant="primary"
            onClick={() => {
              addTask({
                type: newType,
                title: newTitle.trim() || newType,
                assigneeId: activeStaffId,
                dueDate: "2026-06-16T12:00:00",
                priority: newType === "Provider approval needed" ? "high" : "medium",
                done: false,
              });
              setNewTitle("");
              toast("Task created", { desc: newTitle.trim() || newType });
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Add task
          </Button>
        </CardContent>
      </Card>

      {/* Kanban — drag cards between columns to re-prioritize */}
      <p className="text-detail text-ink-500">Drag a card between columns, or tap the handle to move it (mobile-friendly).</p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {byCol.map((col) => (
          <div
            key={col.key}
            onDragOver={(e) => { e.preventDefault(); setOverCol(col.key); }}
            onDragLeave={() => setOverCol((o) => (o === col.key ? null : o))}
            onDrop={() => onDrop(col.key)}
            className={cn(
              "rounded-2xl border bg-ink-900/30 p-3 transition-colors",
              overCol === col.key ? "border-gold-400/50 bg-gold-400/[0.04]" : "border-ink-800",
            )}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-body font-semibold text-ink-200">{col.label}</span>
              <Badge tone={col.tone}>{col.items.length}</Badge>
            </div>
            <motion.div layout className="min-h-[60px] space-y-2">
              {col.items.length === 0 && (
                <p className="rounded-lg border border-dashed border-ink-800 px-1 py-6 text-center text-detail text-ink-600">
                  {overCol === col.key ? "Drop here" : "No tasks"}
                </p>
              )}
              <AnimatePresence>
                {col.items.map((t) => {
                  const c = t.clientId ? getClient(t.clientId) : undefined;
                  return (
                    <motion.div
                      key={t.id}
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: dragId === t.id ? 0.4 : 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.2 }}
                      draggable
                      onDragStart={() => setDragId(t.id)}
                      onDragEnd={() => { setDragId(null); setOverCol(null); }}
                      className="cursor-grab rounded-xl border border-ink-800 bg-ink-850/70 p-3 active:cursor-grabbing"
                    >
                      <div className="flex items-start gap-2">
                        <button onClick={() => {
                          toggleTask(t.id);
                          toast("Task completed", { desc: t.title });
                          // DURABLE: completion also writes a hash-chained row to
                          // Postgres via the gated endpoint (requirePrincipal +
                          // can(write:task) server-side). Best-effort; the local
                          // state is the immediate UX and the endpoint is honest
                          // about failure.
                          void fetch("/api/tasks/complete", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ taskId: t.id, clientId: t.clientId, label: t.title }),
                          }).then((r) => r.json()).then((res) => {
                            if (res?.ok && res.durable) toast("Written to the durable ledger", { desc: res.ledger.id, tone: "success" });
                          }).catch(() => {});
                        }} className="mt-0.5 text-ink-500 hover:text-optimal">
                          <Circle className="h-4 w-4" />
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="text-body text-ink-100">{t.title}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-micro text-ink-500">
                            <Badge tone="neutral">{t.type}</Badge>
                            <span className={cn(t.dueDate < "2026-06-12" && "text-high")}>{relativeDays(t.dueDate)}</span>
                            <span>· {staffName(t.assigneeId).split(" ")[0]}</span>
                          </div>
                          {c && (
                            <Link href={`/clients/${c.id}`} className="mt-1 inline-block text-micro text-gold-300 hover:underline">
                              {clientName(c)}
                            </Link>
                          )}
                        </div>
                        {/* move menu (touch-friendly) + drag hint */}
                        <div className="relative shrink-0">
                          <button
                            onClick={() => setMenuId(menuId === t.id ? null : t.id)}
                            className="flex items-center gap-0.5 rounded-md px-1 py-0.5 text-ink-500 hover:bg-ink-800 hover:text-ink-200"
                            aria-label="Move task"
                          >
                            <GripVertical className="h-3.5 w-3.5" />
                          </button>
                          {menuId === t.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />
                              <div className="absolute right-0 top-7 z-20 w-36 overflow-hidden rounded-lg border border-ink-700 bg-ink-850 py-1 shadow-card">
                                <p className="px-3 py-1 text-micro uppercase tracking-wide text-ink-500">Move to</p>
                                {COLUMNS.filter((col) => col.key !== t.priority).map((col) => (
                                  <button
                                    key={col.key}
                                    onClick={() => moveTask(t.id, col.key, col.label)}
                                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-detail text-ink-200 hover:bg-ink-800"
                                  >
                                    <MoveRight className="h-3 w-3 text-gold-400" /> {col.label}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          </div>
        ))}
      </div>

      {/* Done */}
      <div>
        <button onClick={() => setShowDone((s) => !s)} className="text-detail font-medium text-ink-400 hover:text-ink-100">
          {showDone ? "Hide" : "Show"} completed ({done.length})
        </button>
        {showDone && (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {done.map((t) => (
              <button
                key={t.id}
                onClick={() => toggleTask(t.id)}
                className="flex items-center gap-2.5 rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2 text-left"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-optimal" />
                <span className="text-body text-ink-500 line-through">{t.title}</span>
                <span className="ml-auto text-micro text-ink-600">{formatDate(t.dueDate)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
