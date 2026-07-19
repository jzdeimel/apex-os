"use client";

import * as React from "react";
import Link from "next/link";
import {
  PenLine,
  PhoneCall,
  AlertTriangle,
  Check,
  ArrowDown,
  CornerDownRight,
  Undo2,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { Client } from "@/lib/types";
import type { Consult } from "@/lib/consult/types";
import { clients, clientName } from "@/lib/mock/clients";
import { unsignedConsultsFor, latestConsult } from "@/lib/mock/consults";
import { findingCount } from "@/lib/consult/summarize";
import { nextBestAction, rankByTriage } from "@/lib/aiInsights";
import { Button, Badge, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { Stagger, StaggerItem } from "@/components/motion";
import { ClientRow } from "@/components/coach/ClientRow";
import { cn, relativeDays } from "@/lib/utils";

// =============================================================================
// The coach. One constant, one id — never a display-name string.
// The system we are replacing joins clients to coaches on the coach's *name* in
// ~110 places, which is why a coach getting married renames 40 charts.
// =============================================================================
export const ME_COACH = "st-005";

/** Pinned clock. Nothing in Apex reads the wall clock — the demo must be identical every load. */
const NOW = new Date("2026-06-12T09:00:00");
const DAY_MS = 86_400_000;

/** A touch is stale past this. Two weeks of silence is how a member quietly churns. */
export const STALE_TOUCH_DAYS = 21;

// ---------------------------------------------------------------------------
// Book of business
// ---------------------------------------------------------------------------
export function clientsForCoach(coachId: string): Client[] {
  return clients.filter((c) => c.coachId === coachId);
}

/**
 * Last human contact with this member.
 *
 * lib/mock/contactLog.ts is not part of this build, so we derive the touch from
 * the newest consult — which is the only contact Apex actually records today.
 * We fall back to lab date, then join date, so every client resolves to a real
 * timestamp instead of a null that silently sorts to the top.
 */
export function lastTouchIso(client: Client): string {
  const consult = latestConsult(client.id);
  return consult?.startedAt ?? client.latestLabDate ?? client.joinedOn;
}

export function daysSinceTouch(client: Client): number {
  return Math.round((NOW.getTime() - new Date(lastTouchIso(client)).getTime()) / DAY_MS);
}

// ---------------------------------------------------------------------------
// Queue model
// ---------------------------------------------------------------------------
export type QueueKind = "signature" | "triage" | "stale";

export interface QueueItem {
  id: string;
  kind: QueueKind;
  client: Client;
  /** The thing to do. Imperative, one line. */
  action: string;
  /** Why this surfaced — provenance for the ranking, not a vibe. */
  why: string;
  owner: string;
  /** Sort key, computed ONCE at build time. See the sort-stability note below. */
  priority: number;
  consult?: Consult;
  /** Verb on the clear button. */
  clearLabel: string;
  clearedLabel: string;
}

const KIND_META: Record<
  QueueKind,
  { label: string; icon: React.ElementType; tone: React.ComponentProps<typeof Badge>["tone"] }
> = {
  signature: { label: "You owe a signature", icon: PenLine, tone: "high" },
  triage: { label: "Needs attention", icon: AlertTriangle, tone: "watch" },
  stale: { label: "No touch", icon: PhoneCall, tone: "info" },
};

/**
 * Build the coach's single prioritized queue.
 *
 * Three sources, one list. Coaches do not think in "boards" — they think in
 * "who is next". Splitting signatures, risk and outreach into three tabs is how
 * the old dashboard made a fifteen-minute morning take an hour.
 *
 * Priority bands are additive and disjoint so the ordering is explainable:
 *   900+  unsigned consults   (a legal obligation, not a suggestion)
 *   400+  triage score        (clinical urgency)
 *   100+  staleness           (relationship decay)
 */
export function buildQueue(coachId: string): QueueItem[] {
  const mine = clientsForCoach(coachId);
  const items: QueueItem[] = [];
  const claimed = new Set<string>();

  // 1. Signatures owed. Always first — an unsigned consult is an open chart.
  for (const consult of unsignedConsultsFor(coachId)) {
    const client = mine.find((c) => c.id === consult.clientId);
    if (!client) continue;
    const findings = consult.aiSummary ? findingCount(consult.aiSummary) : 0;
    const ageDays = Math.round((NOW.getTime() - new Date(consult.startedAt).getTime()) / DAY_MS);
    items.push({
      id: `sig-${consult.id}`,
      kind: "signature",
      client,
      consult,
      action: `Review & sign ${consult.kind.toLowerCase()}`,
      why: `Unsigned for ${ageDays}d · ${findings} AI finding${findings === 1 ? "" : "s"} awaiting your review`,
      owner: "Coach",
      priority: 900 + Math.min(99, ageDays),
      clearLabel: "Sign",
      clearedLabel: "Signed",
    });
    claimed.add(client.id);
  }

  // 2. Clinical triage — this coach's clients only. The old dashboard showed the
  //    practice-wide list here and labelled it "your clients", which is how a
  //    coach ends up calling someone else's member.
  for (const row of rankByTriage(mine)) {
    if (row.score < 22) break; // rankByTriage is sorted desc; below "medium" is noise
    if (claimed.has(row.client.id)) continue;
    const nba = nextBestAction(row.client);
    items.push({
      id: `tri-${row.client.id}`,
      kind: "triage",
      client: row.client,
      action: nba.action,
      why: `${nba.reason} (${row.factors[0] ?? row.level})`,
      owner: nba.owner,
      priority: 400 + row.score,
      clearLabel: "Handled",
      clearedLabel: "Handled",
    });
    claimed.add(row.client.id);
  }

  // 3. Gone quiet. Not urgent, not invisible.
  for (const client of mine) {
    if (claimed.has(client.id) || client.status === "Inactive") continue;
    const days = daysSinceTouch(client);
    if (days < STALE_TOUCH_DAYS) continue;
    const nba = nextBestAction(client);
    items.push({
      id: `stale-${client.id}`,
      kind: "stale",
      client,
      action: "Log a check-in touch",
      why: `${days}d since last recorded contact — ${nba.reason.toLowerCase()}`,
      owner: "Coach",
      priority: 100 + Math.min(99, days),
      clearLabel: "Log touch",
      clearedLabel: "Touched",
    });
    claimed.add(client.id);
  }

  // Stable tiebreak on id so the order is byte-identical on every render.
  return items.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// TodayQueue
// ---------------------------------------------------------------------------
export function TodayQueue({ coachId = ME_COACH }: { coachId?: string }) {
  const { toast } = useToast();
  const reduce = useReducedMotion();

  /**
   * THE WHOLE POINT OF THIS COMPONENT.
   *
   * The queue is built ONCE and frozen. Clearing an item mutates `cleared`, not
   * `items` — so a worked row keeps its exact position and nothing below it
   * moves. The board we are replacing re-sorts on every save, which means the
   * row you just finished jumps somewhere else and the row you were about to
   * work slides under your cursor. Coaches misclick, then stop trusting it.
   *
   * Order is a property of the morning, not of the current state of the data.
   */
  const items = React.useMemo(() => buildQueue(coachId), [coachId]);

  const [cleared, setCleared] = React.useState<Record<string, boolean>>({});
  const [focusIdx, setFocusIdx] = React.useState(0);
  const rowRefs = React.useRef<(HTMLDivElement | null)[]>([]);

  const doneCount = items.filter((i) => cleared[i.id]).length;
  const pct = items.length ? (doneCount / items.length) * 100 : 0;

  const advance = React.useCallback(
    (from: number) => {
      // Next *open* item after `from`; fall back to the first open item anywhere.
      const forward = items.findIndex((it, i) => i > from && !cleared[it.id]);
      const next = forward !== -1 ? forward : items.findIndex((it) => !cleared[it.id]);
      if (next === -1) return;
      setFocusIdx(next);
      rowRefs.current[next]?.scrollIntoView({
        behavior: reduce ? "auto" : "smooth",
        block: "center",
      });
    },
    [items, cleared, reduce],
  );

  const clear = React.useCallback(
    (item: QueueItem, idx: number) => {
      setCleared((c) => ({ ...c, [item.id]: true }));
      setFocusIdx(idx); // stay put — the coach decides when to move on
      toast(`${item.clearedLabel} · ${clientName(item.client)}`, {
        desc: "Written to the ledger. Press Next when you're ready.",
      });
    },
    [toast],
  );

  const undo = React.useCallback((item: QueueItem) => {
    setCleared((c) => {
      const next = { ...c };
      delete next[item.id];
      return next;
    });
  }, []);

  // j / k to move focus without leaving the keyboard. Coaches work this list
  // with one hand on a phone in the other.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (e.key === "j") setFocusIdx((i) => Math.min(items.length - 1, i + 1));
      if (e.key === "k") setFocusIdx((i) => Math.max(0, i - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles className="h-6 w-6" />}
        title="Nothing in your queue"
        hint="No signatures owed, no client above the attention threshold, no one gone quiet."
      />
    );
  }

  const allDone = doneCount === items.length;

  return (
    <div className="space-y-3">
      {/* Progress — the coach should always know how much morning is left. */}
      <div className="card p-4">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="label-eyebrow">Today&apos;s queue</p>
            <p className="mt-1 text-sm text-ink-300">
              <span className="stat-mono text-lg font-semibold text-ink-50">{doneCount}</span>
              <span className="text-ink-500"> of </span>
              <span className="stat-mono text-lg font-semibold text-ink-50">{items.length}</span>
              <span className="text-ink-400"> cleared</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] text-ink-600 sm:inline">j / k to move</span>
            <Button size="sm" variant="outline" onClick={() => advance(focusIdx)} disabled={allDone}>
              <ArrowDown className="h-3.5 w-3.5" />
              Next open
            </Button>
          </div>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ink-700/70">
          <motion.div
            className="h-full rounded-full bg-watch"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: reduce ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </div>

      <Stagger className="space-y-2">
        {items.map((item, idx) => {
          const isCleared = !!cleared[item.id];
          const isFocused = idx === focusIdx && !allDone;
          const Meta = KIND_META[item.kind];
          const Icon = Meta.icon;

          return (
            <StaggerItem key={item.id}>
              <motion.div
                ref={(el: HTMLDivElement | null) => {
                  rowRefs.current[idx] = el;
                }}
                layout={reduce ? false : "position"}
                transition={{ duration: reduce ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
                animate={{ opacity: isCleared ? 0.6 : 1 }}
                className={cn(
                  "card relative overflow-hidden",
                  isFocused && "ring-2 ring-watch/50",
                  isCleared && "border-optimal/25",
                )}
              >
                {/* Colour wash, not disappearance. A cleared row that vanishes
                    takes the coach's sense of progress with it. Painted as an
                    overlay so it never clobbers the card's own surface token. */}
                <AnimatePresence>
                  {isCleared && (
                    <motion.div
                      initial={reduce ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={reduce ? undefined : { opacity: 0 }}
                      transition={{ duration: reduce ? 0 : 0.3 }}
                      className="pointer-events-none absolute inset-0 bg-optimal/[0.07]"
                    />
                  )}
                </AnimatePresence>

                <div className="relative flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2 px-3">
                      <Badge tone={isCleared ? "optimal" : Meta.tone}>
                        <Icon className="h-3 w-3" />
                        {isCleared ? item.clearedLabel : Meta.label}
                      </Badge>
                      <span className="text-[11px] uppercase tracking-wide text-ink-600">
                        Owner · {item.owner}
                      </span>
                      <span className="stat-mono text-[11px] text-ink-600">
                        rank {item.priority}
                      </span>
                    </div>

                    <ClientRow
                      client={item.client}
                      href={`/clients/${item.client.id}`}
                      showScore={false}
                      className="px-0"
                      subtitle={
                        <span className={cn(isCleared && "line-through decoration-ink-600")}>
                          <span className="font-medium text-ink-200">{item.action}</span>
                          <span className="text-ink-500"> — {item.why}</span>
                        </span>
                      }
                      meta={
                        <span className="stat-mono">
                          {item.kind === "signature" && item.consult
                            ? relativeDays(item.consult.startedAt)
                            : `${daysSinceTouch(item.client)}d since touch`}
                        </span>
                      }
                    />
                  </div>

                  {/* Action cluster swaps in place. AnimatePresence with mode="wait"
                      so the done state lands after the buttons leave, not over them. */}
                  <div className="flex shrink-0 items-center justify-end gap-2 px-3">
                    <AnimatePresence mode="wait" initial={false}>
                      {isCleared ? (
                        <motion.div
                          key="done"
                          initial={reduce ? false : { opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={reduce ? undefined : { opacity: 0, scale: 0.9 }}
                          transition={{ duration: reduce ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
                          className="flex items-center gap-2"
                        >
                          <span className="inline-flex items-center gap-1.5 rounded-lg border border-optimal/30 bg-optimal/12 px-2.5 py-1 text-xs font-medium text-optimal">
                            <Check className="h-3.5 w-3.5" />
                            {item.clearedLabel}
                          </span>
                          <Button size="sm" variant="ghost" onClick={() => undo(item)} title="Undo">
                            <Undo2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => advance(idx)}>
                            Next
                            <CornerDownRight className="h-3.5 w-3.5" />
                          </Button>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="open"
                          initial={reduce ? false : { opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={reduce ? undefined : { opacity: 0 }}
                          transition={{ duration: reduce ? 0 : 0.15 }}
                          className="flex items-center gap-2"
                        >
                          <Link href={`/clients/${item.client.id}`}>
                            <Button size="sm" variant="ghost">
                              Open
                            </Button>
                          </Link>
                          <Button size="sm" variant="primary" onClick={() => clear(item, idx)}>
                            {item.clearLabel}
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            </StaggerItem>
          );
        })}
      </Stagger>

      {allDone && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="card border-optimal/25 bg-optimal/5 p-4 text-center"
        >
          <p className="font-display text-sm font-semibold text-optimal">Queue cleared</p>
          <p className="mt-1 text-xs text-ink-400">
            {items.length} item{items.length === 1 ? "" : "s"} worked. Rows stayed where you left
            them — nothing re-sorted underneath you.
          </p>
        </motion.div>
      )}
    </div>
  );
}
