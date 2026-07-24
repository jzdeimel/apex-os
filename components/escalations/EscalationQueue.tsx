"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import {
  answeredThisWeek,
  isOverdue,
  isResolved,
  sortQueue,
} from "@/lib/escalations/queue";
import { EscalationCard } from "@/components/escalations/EscalationCard";
import { useEscalations } from "@/components/escalations/useEscalations";
import { useCurrentStaff } from "@/lib/auth/useCurrentStaff";
import { SwitchView } from "@/components/motion";
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

/**
 * One figure in the SLA strip.
 *
 * Colour is spent only where it means risk. "Overdue" and "Urgent" carry it;
 * "Open" is a workload number and "Answered" is good news, so both render in
 * plain ink. Four coloured numbers side by side is four things shouting, which
 * is the same as none of them shouting.
 *
 * The icons that used to sit beside each label are gone. They repeated what the
 * word already said and put four unrelated glyphs on a strip that exists to be
 * read as one row of numbers.
 */
function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "high" | "watch";
}) {
  const tones = {
    neutral: "text-ink-100",
    high: "text-high",
    watch: "text-watch",
  } as const;
  return (
    <div className="min-w-0 px-3 py-2.5 sm:px-4">
      <p className="label-eyebrow truncate">{label}</p>
      <p className={cn("stat-mono mt-1 text-title font-semibold leading-none", tones[tone])}>
        {value}
      </p>
    </div>
  );
}

export function EscalationQueue() {
  const [filter, setFilter] = React.useState<FilterId>("all");
  const staff = useCurrentStaff();
  const { items, now, loading, error, update } = useEscalations();
  const mineId = staff?.id ?? "unmapped";

  const open = React.useMemo(() => items.filter((e) => !isResolved(e)), [items]);
  const overdue = React.useMemo(() => open.filter((e) => isOverdue(e, now)), [open, now]);
  const urgent = React.useMemo(() => open.filter((e) => e.priority === "Urgent"), [open]);
  const answered = React.useMemo(() => items.filter(isResolved), [items]);
  const weekAnswered = React.useMemo(() => answeredThisWeek(items, now), [items, now]);

  const visible = React.useMemo(() => {
    const base =
      filter === "answered"
        ? answered
        : filter === "overdue"
          ? overdue
          : filter === "urgent"
            ? urgent
            : filter === "mine"
              ? open.filter((e) => e.assignedToStaffId === mineId)
              : open;
    return sortQueue(base, now);
  }, [filter, answered, overdue, urgent, open, mineId, now]);

  const counts: Record<FilterId, number> = {
    all: open.length,
    overdue: overdue.length,
    urgent: urgent.length,
    mine: open.filter((e) => e.assignedToStaffId === mineId).length,
    answered: answered.length,
  };

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-xl border border-critical/35 bg-critical/10 px-4 py-3 text-detail text-critical">
          <strong>Medical queue unavailable.</strong> {error} No demo items are substituted.
        </div>
      )}
      {loading && <p className="text-detail text-ink-500">Loading the durable Medical queue…</p>}
      {/* ── SLA strip ─────────────────────────────────────────────────────
          One card divided into four, not four cards. Four separate bordered
          boxes for four related numbers reads as a grid of equal things; a
          single strip reads as one measurement with four parts. */}
      <div className="card grid grid-cols-2 divide-x divide-y divide-ink-800/60 sm:grid-cols-4 sm:divide-y-0">
        <Tile label="OPEN" value={open.length} tone="neutral" />
        <Tile label="OVERDUE" value={overdue.length} tone="high" />
        <Tile label="URGENT" value={urgent.length} tone="watch" />
        <Tile label="ANSWERED / 7D" value={weekAnswered.length} tone="neutral" />
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────
          The row scrolls at 390px, where five chips cannot fit. It always did —
          but it clipped flush at the viewport edge with no cue, so the last chip
          ended mid-word and nothing suggested there was more to reach. The
          fade on the right edge is the affordance: it says the row continues.
          It is masked out at `sm` and up, where every chip already fits and a
          gradient over the last one would be a lie. */}
      <div className="relative">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  // `rounded-control`, not `rounded-full` — these are things a
                  // finger acts on, and the house rule reserves the capsule for
                  // avatars and status dots.
                  "relative shrink-0 rounded-control px-3 py-1.5 text-detail font-medium transition-colors focus-ring",
                  active ? "bg-gold-500 text-white" : "text-ink-400 hover:text-ink-100",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="escalation-filter"
                    className="absolute inset-0 rounded-control bg-gold-500"
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
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-ink-950 to-transparent sm:hidden"
        />
      </div>

      {/* ── The queue ─────────────────────────────────────────────────────── */}
      <SwitchView k={filter}>
        {visible.length === 0 ? (
          <EmptyQueue filter={filter} />
        ) : (
          <div className="space-y-3">
            {visible.map((e) => (
              <div key={e.id}>
                <EscalationCard escalation={e} now={now} onChange={update} />
              </div>
            ))}
          </div>
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
      title: "Nothing assigned to you",
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
      <p className="text-body font-medium text-ink-100">{title}</p>
      <p className="mt-1 max-w-md text-detail text-ink-500">{hint}</p>
    </div>
  );
}
