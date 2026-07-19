"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { AlarmClock, AlertTriangle, CheckCircle2, Inbox, ShieldCheck } from "lucide-react";
import type { Escalation } from "@/lib/escalations/types";
import { escalations as seedEscalations } from "@/lib/mock/escalations";
import {
  ME_PROVIDER,
  NOW,
  answeredThisWeek,
  isOverdue,
  isResolved,
  sortQueue,
} from "@/lib/escalations/queue";
import { staffName } from "@/lib/mock/staff";
import { EscalationCard } from "@/components/escalations/EscalationCard";
import { Stagger, StaggerItem, SwitchView } from "@/components/motion";
import { cn } from "@/lib/utils";

/**
 * The medical inbox.
 *
 * Ordering is the product decision, not the styling. Overdue work floats to the
 * top regardless of priority, because a Routine question that has been ignored
 * for two days is a worse failure than an Urgent one raised nine minutes ago —
 * the first one is a member who has concluded nobody is coming.
 *
 * The tiles above the list are chosen to be uncomfortable on purpose. "Open" is
 * a workload number; "Overdue" is a promise the clinic broke. Showing them side
 * by side is what makes the SLA mean anything.
 */

type FilterId = "all" | "overdue" | "urgent" | "mine" | "answered";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All open" },
  { id: "overdue", label: "Overdue" },
  { id: "urgent", label: "Urgent" },
  { id: "mine", label: "Mine" },
  { id: "answered", label: "Answered" },
];

function Tile({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: "neutral" | "high" | "watch" | "optimal";
  icon: React.ElementType;
}) {
  const tones = {
    neutral: "text-ink-100",
    high: "text-high",
    watch: "text-watch",
    optimal: "text-optimal",
  } as const;
  return (
    <div className="card p-3.5">
      <div className="flex items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5", tones[tone])} />
        <p className="label-eyebrow">{label}</p>
      </div>
      <p className={cn("stat-mono mt-1.5 text-2xl font-semibold", tones[tone])}>{value}</p>
    </div>
  );
}

export function EscalationQueue() {
  // Local state so demo transitions persist across re-render. The ledger append
  // that accompanies each transition is real and lives in EscalationCard.
  const [items, setItems] = React.useState<Escalation[]>(seedEscalations);
  const [filter, setFilter] = React.useState<FilterId>("all");

  const update = React.useCallback((next: Escalation) => {
    setItems((prev) => prev.map((e) => (e.id === next.id ? next : e)));
  }, []);

  const open = React.useMemo(() => items.filter((e) => !isResolved(e)), [items]);
  const overdue = React.useMemo(() => open.filter((e) => isOverdue(e, NOW)), [open]);
  const urgent = React.useMemo(() => open.filter((e) => e.priority === "Urgent"), [open]);
  const answered = React.useMemo(() => items.filter(isResolved), [items]);
  const weekAnswered = React.useMemo(() => answeredThisWeek(items, NOW), [items]);

  const visible = React.useMemo(() => {
    const base =
      filter === "answered"
        ? answered
        : filter === "overdue"
          ? overdue
          : filter === "urgent"
            ? urgent
            : filter === "mine"
              ? open.filter((e) => e.assignedToStaffId === ME_PROVIDER)
              : open;
    return sortQueue(base, NOW);
  }, [filter, answered, overdue, urgent, open]);

  const counts: Record<FilterId, number> = {
    all: open.length,
    overdue: overdue.length,
    urgent: urgent.length,
    mine: open.filter((e) => e.assignedToStaffId === ME_PROVIDER).length,
    answered: answered.length,
  };

  return (
    <div className="space-y-5">
      {/* ── Tiles ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="OPEN" value={open.length} tone="neutral" icon={Inbox} />
        <Tile label="OVERDUE" value={overdue.length} tone="high" icon={AlertTriangle} />
        <Tile label="URGENT" value={urgent.length} tone="watch" icon={AlarmClock} />
        <Tile
          label="ANSWERED / 7D"
          value={weekAnswered.length}
          tone="optimal"
          icon={CheckCircle2}
        />
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "relative shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-ring",
                active ? "text-ink-950" : "text-ink-400 hover:text-ink-100",
              )}
            >
              {active && (
                <motion.span
                  layoutId="escalation-filter"
                  className="absolute inset-0 rounded-full bg-gold-500"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative z-10">
                {f.label}
                <span className="stat-mono ml-1.5 opacity-70">{counts[f.id]}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* ── The queue ─────────────────────────────────────────────────────── */}
      <SwitchView k={filter}>
        {visible.length === 0 ? (
          <EmptyQueue filter={filter} />
        ) : (
          <Stagger className="space-y-3">
            {visible.map((e) => (
              <StaggerItem key={e.id}>
                <EscalationCard escalation={e} onChange={update} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </SwitchView>
    </div>
  );
}

/**
 * An empty escalation queue is the best possible outcome, so it must not look
 * like a page that failed to load. Same reason a monitoring dashboard says
 * "all systems normal" instead of showing zero rows.
 */
function EmptyQueue({ filter }: { filter: FilterId }) {
  const copy: Record<FilterId, { title: string; hint: string }> = {
    all: {
      title: "Every escalation has been answered",
      hint: "Nothing is waiting on a provider right now. New ones land here the moment a coach raises them.",
    },
    overdue: {
      title: "Nothing has breached SLA",
      hint: "Every open escalation is still inside its window. This is the number to keep at zero.",
    },
    urgent: {
      title: "No urgent escalations",
      hint: "Nothing has been flagged as a possible safety event.",
    },
    mine: {
      title: `Nothing assigned to ${staffName(ME_PROVIDER)}`,
      hint: "Your queue is clear. Switch to All open to pick up unclaimed work.",
    },
    answered: {
      title: "No answers on record yet",
      hint: "Answered escalations stay here with who answered, when, and their turnaround.",
    },
  };
  const { title, hint } = copy[filter];

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-optimal/25 bg-optimal/[0.04] px-6 py-12 text-center">
      <ShieldCheck className="mb-3 h-6 w-6 text-optimal" />
      <p className="text-sm font-medium text-ink-100">{title}</p>
      <p className="mt-1 max-w-md text-xs text-ink-500">{hint}</p>
    </div>
  );
}
