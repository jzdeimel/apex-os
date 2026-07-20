"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { lastTouchFor } from "@/lib/mock/contactLog";
import { findingCount } from "@/lib/consult/summarize";
import { nextBestAction, rankByTriage } from "@/lib/aiInsights";
import { Button, Badge, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { Stagger, StaggerItem } from "@/components/motion";
import { ClientRow } from "@/components/coach/ClientRow";
import { cn, relativeDays, absolute } from "@/lib/utils";

// =============================================================================
// The coach. One constant, one id — never a display-name string.
// The system we are replacing joins clients to coaches on the coach's *name* in
// ~110 places, which is why a coach getting married renames 40 charts.
// =============================================================================
export const ME_COACH = "st-005";

/** Pinned clock. Nothing in Apex reads the wall clock — the demo must be identical every load. */
const NOW = absolute("2026-06-12T09:00:00");
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
 * Reads the real contact log — every SMS, email, call and portal message, in
 * both directions. A consult is also contact, so whichever is newer wins; we
 * fall back to lab date then join date so every client resolves to a real
 * timestamp instead of a null that silently sorts to the top of the queue.
 */
export function lastTouchIso(client: Client): string {
  const touch = lastTouchFor(client.id)?.at;
  const consult = latestConsult(client.id)?.startedAt;
  const candidates = [touch, consult, client.latestLabDate, client.joinedOn].filter(
    Boolean,
  ) as string[];
  return candidates.sort((a, b) => b.localeCompare(a))[0];
}

export function daysSinceTouch(client: Client): number {
  return Math.round((NOW.getTime() - absolute(lastTouchIso(client)).getTime()) / DAY_MS);
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
    const ageDays = Math.round((NOW.getTime() - absolute(consult.startedAt).getTime()) / DAY_MS);
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
// Keyboard
// ---------------------------------------------------------------------------

/**
 * A coach on a headset with a member on the line should never have to find the
 * mouse. j/k walk the list, Enter opens the chart, e clears the row.
 *
 * The guard matters more than the bindings: a coach typing "jenny" into a
 * search field must not watch the queue scroll away underneath them.
 */
function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLSelectElement) return true;
  return el instanceof HTMLElement && el.isContentEditable;
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-ink-700 bg-ink-900 px-1 py-px font-mono text-micro leading-[14px] text-ink-400">
      {children}
    </kbd>
  );
}

/** The legend. Shortcuts nobody is told about are shortcuts nobody uses. */
function KeyHints() {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-micro text-ink-600">
      <span className="inline-flex items-center gap-1">
        <Key>j</Key>
        <Key>k</Key> move
      </span>
      <span className="inline-flex items-center gap-1">
        <Key>↵</Key> open
      </span>
      <span className="inline-flex items-center gap-1">
        <Key>e</Key> done
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TodayQueue
// ---------------------------------------------------------------------------
export function TodayQueue({ coachId = ME_COACH }: { coachId?: string }) {
  const { toast } = useToast();
  const reduce = useReducedMotion();
  const router = useRouter();

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

  // "nearest" not "center": keyboard walking should nudge the viewport, not
  // yank it. Centering every step makes the list feel like it is fighting back.
  const focusRow = React.useCallback(
    (i: number, block: ScrollLogicalPosition = "nearest") => {
      setFocusIdx(i);
      rowRefs.current[i]?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block });
    },
    [reduce],
  );

  const advance = React.useCallback(
    (from: number) => {
      // Next *open* item after `from`; fall back to the first open item anywhere.
      const forward = items.findIndex((it, i) => i > from && !cleared[it.id]);
      const next = forward !== -1 ? forward : items.findIndex((it) => !cleared[it.id]);
      if (next === -1) return;
      focusRow(next, "center");
    },
    [items, cleared, focusRow],
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

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(document.activeElement)) return;
      // Leave real chords (browser/OS shortcuts) alone.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const item = items[focusIdx];

      if (e.key === "j") {
        e.preventDefault();
        focusRow(Math.min(items.length - 1, focusIdx + 1));
      } else if (e.key === "k") {
        e.preventDefault();
        focusRow(Math.max(0, focusIdx - 1));
      } else if (e.key === "Enter") {
        // If the coach has tabbed onto a real control, Enter belongs to it.
        const el = document.activeElement;
        if (el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement) return;
        if (!item) return;
        e.preventDefault();
        router.push(`/clients/${item.client.id}`);
      } else if (e.key === "e") {
        if (!item || cleared[item.id]) return;
        e.preventDefault();
        clear(item, focusIdx);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, focusIdx, cleared, clear, focusRow, router]);

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
    <div className="space-y-2">
      {/* Progress — the coach should always know how much morning is left. */}
      <div className="card px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <p className="label-eyebrow">Today&apos;s queue</p>
            <p className="text-detail text-ink-400">
              <span className="stat-mono text-heading font-semibold text-ink-50">{doneCount}</span>
              <span className="text-ink-500"> / </span>
              <span className="stat-mono text-heading font-semibold text-ink-50">{items.length}</span>
              <span> cleared</span>
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="hidden sm:block">
              <KeyHints />
            </div>
            <Button size="sm" variant="outline" onClick={() => advance(focusIdx)} disabled={allDone}>
              <ArrowDown className="h-3.5 w-3.5" />
              Next open
            </Button>
          </div>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-700/70">
          <motion.div
            className="h-full rounded-full bg-watch"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: reduce ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
        {/* Below sm the legend gets its own line rather than being dropped —
            the shortcuts work on a tablet keyboard too. */}
        <div className="mt-2 sm:hidden">
          <KeyHints />
        </div>
      </div>

      <div className="space-y-1.5">
        {items.map((item, idx) => {
          const isCleared = !!cleared[item.id];
          const isFocused = idx === focusIdx && !allDone;
          const Meta = KIND_META[item.kind];
          const Icon = Meta.icon;

          return (
            <div key={item.id}>
              <motion.div
                ref={(el: HTMLDivElement | null) => {
                  rowRefs.current[idx] = el;
                }}
                layout={reduce ? false : "position"}
                transition={{ duration: reduce ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
                animate={{ opacity: isCleared ? 0.6 : 1 }}
                // Deliberately NOT hover-to-focus: the focused row is what "e"
                // clears, and a cursor resting somewhere on its way to the
                // scrollbar must never decide which member gets marked done.
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

                <div className="relative flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center sm:gap-2">
                  <div className="min-w-0 flex-1">
                    {/* Classification strip. One line, no wrap on desktop —
                        kind, who owns it, and the rank that put it here. */}
                    <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge tone={isCleared ? "optimal" : Meta.tone}>
                        <Icon className="h-3 w-3" />
                        {isCleared ? item.clearedLabel : Meta.label}
                      </Badge>
                      <span className="text-micro uppercase tracking-wide text-ink-600">
                        {item.owner}
                      </span>
                      <span className="stat-mono text-micro text-ink-700">#{item.priority}</span>
                      <span className="stat-mono text-micro text-ink-600">
                        {item.kind === "signature" && item.consult
                          ? relativeDays(item.consult.startedAt)
                          : `${daysSinceTouch(item.client)}d quiet`}
                      </span>
                    </div>

                    <ClientRow
                      client={item.client}
                      href={`/clients/${item.client.id}`}
                      showScore={false}
                      bare
                      subtitle={
                        <span
                          className={cn(
                            "font-medium text-ink-200",
                            isCleared && "line-through decoration-ink-600",
                          )}
                        >
                          {item.action}
                        </span>
                      }
                      // The why-line names the signal verbatim — for triage and
                      // stale rows this is nextBestAction's own `reason`, not a
                      // restatement of it. If the coach disagrees with the
                      // ranking they can see exactly what it read.
                      note={item.why}
                    />
                  </div>

                  {/* Action cluster swaps in place. AnimatePresence with mode="wait"
                      so the done state lands after the buttons leave, not over them. */}
                  <div className="flex shrink-0 items-center justify-end gap-1.5">
                    <AnimatePresence mode="wait" initial={false}>
                      {isCleared ? (
                        <motion.div
                          key="done"
                          initial={reduce ? false : { opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={reduce ? undefined : { opacity: 0, scale: 0.9 }}
                          transition={{ duration: reduce ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
                          className="flex items-center gap-1.5"
                        >
                          <span className="inline-flex items-center gap-1 rounded-lg border border-optimal/30 bg-optimal/12 px-2 py-1 text-micro font-medium text-optimal">
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
                          className="flex items-center gap-1.5"
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
            </div>
          );
        })}
      </div>

      {allDone && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="card border-optimal/25 bg-optimal/5 p-4 text-center"
        >
          <p className="font-display text-body font-semibold text-optimal">Queue cleared</p>
          <p className="mt-1 text-detail text-ink-400">
            {items.length} item{items.length === 1 ? "" : "s"} worked. Rows stayed where you left
            them — nothing re-sorted underneath you.
          </p>
        </motion.div>
      )}
    </div>
  );
}
