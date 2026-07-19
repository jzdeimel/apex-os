"use client";

import * as React from "react";
import { AlertTriangle, ChevronDown, PackageCheck, Users } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import type { Order, OrderStatus } from "@/lib/orders/types";
import {
  EXCEPTION_STATUSES,
  HAPPY_PATH,
  isStuck,
  lastMovementAt,
  statusTone,
} from "@/lib/orders/lifecycle";
import { orders, openOrdersFor } from "@/lib/mock/orders";
import { getClient } from "@/lib/mock/clients";
import { staffName } from "@/lib/mock/staff";
import { Badge } from "@/components/ui/primitives";
import { FadeIn, Stagger, StaggerItem } from "@/components/motion";
import { OrderCard } from "@/components/orders/OrderCard";
import { ME_COACH } from "@/components/coach/TodayQueue";
import { cn } from "@/lib/utils";

/**
 * THE ORDER BOARD.
 *
 * The system we are replacing has no answer to "which of my orders are in
 * trouble?" — because it has no concept of trouble. An order with a tracking
 * number reads "Shipped" until the end of time; the carrier status it fetches
 * is rendered once and discarded; and an order whose tracking update failed
 * sits in a state no view filters on until the member calls to ask where their
 * medication is.
 *
 * So this board is built problems-first and everything else second. The stuck
 * rail is pinned above the fold and stays pinned regardless of which filter
 * chip is active — a stranded order does not stop being stranded because the
 * coach clicked "Delivered".
 */

/** Pinned clock. See lib/mock/orders.ts — the whole book is derived from it. */
const NOW = "2026-06-12T09:00:00";
const HOUR_MS = 1000 * 60 * 60;

/**
 * Statuses that mean "a human has to do something before this moves".
 *
 * EXCEPTION_STATUSES covers the two states MedSource can put us in. "Failed" is
 * terminal rather than an exception, but a failed order is still an unfulfilled
 * promise to a member, so it belongs on the problems rail all the same.
 */
const PROBLEM_STATUSES: OrderStatus[] = [...EXCEPTION_STATUSES, "Failed"];

function isProblem(order: Order): boolean {
  return PROBLEM_STATUSES.includes(order.status) || isStuck(order, NOW);
}

/** Groups render in this order: the happy path, then the places orders end up. */
/**
 * Groups for the "everything else" section.
 *
 * Deliberately excludes every problem status: those orders are pinned to the
 * rail above and removed from `rest`, so listing them here would render group
 * headers that can never contain anything.
 */
const GROUP_ORDER: OrderStatus[] = [...HAPPY_PATH, "Cancelled"];

const IN_TRANSIT_STATUSES: OrderStatus[] = [
  "Label created",
  "In transit",
  "Out for delivery",
];

type FilterKey = "all" | "attention" | "transit" | "delivered" | "exceptions";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "attention", label: "Needs attention" },
  { key: "transit", label: "In transit" },
  { key: "delivered", label: "Delivered" },
  { key: "exceptions", label: "Exceptions" },
];

function matchesFilter(order: Order, filter: FilterKey): boolean {
  switch (filter) {
    case "all":
      return true;
    case "attention":
      return isProblem(order);
    case "transit":
      return IN_TRANSIT_STATUSES.includes(order.status);
    case "delivered":
      return order.status === "Delivered";
    case "exceptions":
      return PROBLEM_STATUSES.includes(order.status) || order.status === "Cancelled";
  }
}

/** Delivered inside the last 7 days, measured from the pinned clock. */
function deliveredThisWeek(order: Order): boolean {
  if (order.status !== "Delivered") return false;
  const hours =
    (new Date(NOW).getTime() - new Date(lastMovementAt(order)).getTime()) / HOUR_MS;
  return hours >= 0 && hours <= 24 * 7;
}

export function OrderBoard({ coachId = ME_COACH }: { coachId?: string }) {
  const reduce = useReducedMotion();

  const [mineOnly, setMineOnly] = React.useState(true);
  const [filter, setFilter] = React.useState<FilterKey>("all");
  // Delivered is collapsed by default — it is the biggest group and the least
  // actionable. Everything else opens, because a collapsed problem is a hidden one.
  const [collapsed, setCollapsed] = React.useState<Partial<Record<OrderStatus, boolean>>>({
    Delivered: true,
    Cancelled: true,
  });

  /**
   * Scope. `openOrdersFor` is the coach's owed work; we union it with a pass
   * over the full book keyed on the CLIENT's coach assignment so delivered and
   * cancelled history shows up too — and so an order whose denormalized
   * `coachId` ever drifted from its client's still lands on the right board.
   */
  const scoped = React.useMemo(() => {
    if (!mineOnly) return orders;
    const owed = new Set(openOrdersFor(coachId).map((o) => o.id));
    return orders.filter(
      (o) => owed.has(o.id) || getClient(o.clientId)?.coachId === coachId,
    );
  }, [mineOnly, coachId]);

  // Oldest movement first: the order nobody has touched is the one to look at.
  const byStaleness = React.useCallback(
    (a: Order, b: Order) => lastMovementAt(a).localeCompare(lastMovementAt(b)) || a.id.localeCompare(b.id),
    [],
  );

  const problems = React.useMemo(
    () => scoped.filter(isProblem).sort(byStaleness),
    [scoped, byStaleness],
  );

  const stats = React.useMemo(() => {
    const open = scoped.filter(
      (o) => o.status !== "Delivered" && o.status !== "Cancelled" && o.status !== "Failed",
    ).length;
    return {
      open,
      attention: problems.length,
      transit: scoped.filter((o) => IN_TRANSIT_STATUSES.includes(o.status)).length,
      delivered: scoped.filter(deliveredThisWeek).length,
    };
  }, [scoped, problems.length]);

  /**
   * The grouped remainder. Problem orders are deliberately excluded: they are
   * already pinned above, and a board that lists the same stranded order twice
   * teaches people to skim past it.
   */
  const groups = React.useMemo(() => {
    // "Needs attention" and "Exceptions" ARE the problems rail. Rendering an
    // empty remainder under them told the user "nothing matches" while the
    // stat tile above showed a non-zero count — so those two filters suppress
    // the remainder entirely rather than contradicting themselves.
    if (filter === "attention" || filter === "exceptions") return [];
    const problemIds = new Set(problems.map((o) => o.id));
    const rest = scoped.filter((o) => !problemIds.has(o.id) && matchesFilter(o, filter));
    return GROUP_ORDER.map((status) => ({
      status,
      items: rest.filter((o) => o.status === status).sort(byStaleness),
    })).filter((g) => g.items.length > 0);
  }, [scoped, problems, filter, byStaleness]);

  const restCount = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------------- *
       * Summary
       * ---------------------------------------------------------------- */}
      <FadeIn>
        <div className="card grid grid-cols-2 divide-ink-700/70 sm:grid-cols-4 sm:divide-x">
          {[
            { label: "Open orders", value: stats.open, tone: "text-ink-50" },
            { label: "Needs attention", value: stats.attention, tone: stats.attention > 0 ? "text-high" : "text-optimal" },
            { label: "In transit", value: stats.transit, tone: "text-ink-50" },
            { label: "Delivered this week", value: stats.delivered, tone: "text-optimal" },
          ].map((s) => (
            <div key={s.label} className="p-4">
              <p className="label-eyebrow">{s.label}</p>
              <p className={cn("stat-mono mt-1 text-xl font-semibold", s.tone)}>{s.value}</p>
            </div>
          ))}
        </div>
      </FadeIn>

      {/* ---------------------------------------------------------------- *
       * Controls
       * ---------------------------------------------------------------- */}
      <FadeIn delay={0.05}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const active = f.key === filter;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "relative rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-ring",
                    active ? "text-ink-50" : "text-ink-400 hover:text-ink-200",
                  )}
                >
                  {active && (
                    /* One shared layoutId means the pill slides between chips
                       instead of blinking out and back in somewhere else. */
                    <motion.span
                      layoutId="order-filter-pill"
                      className="absolute inset-0 rounded-full border border-ink-600 bg-ink-700/70"
                      transition={
                        reduce
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 420, damping: 34 }
                      }
                    />
                  )}
                  <span className="relative">{f.label}</span>
                </button>
              );
            })}
          </div>

          {/* Coverage toggle. Coaches cover for each other constantly; a board
              that can only ever show "mine" gets abandoned the first sick day. */}
          <div className="flex items-center gap-1.5 self-start rounded-full border border-ink-700 p-1 sm:self-auto">
            {[
              { on: true, label: "My clients" },
              { on: false, label: "All" },
            ].map((opt) => (
              <button
                key={opt.label}
                onClick={() => setMineOnly(opt.on)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors focus-ring",
                  mineOnly === opt.on
                    ? "bg-gold-500 text-white"
                    : "text-ink-400 hover:text-ink-200",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </FadeIn>

      {/* ---------------------------------------------------------------- *
       * Problems, pinned
       * ---------------------------------------------------------------- */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink-50">
            <AlertTriangle
              className={cn("h-4 w-4", problems.length ? "text-high" : "text-optimal")}
            />
            Needs attention
          </h2>
          <p className="text-xs text-ink-600">
            Past SLA or blocked — pinned here whatever filter is active.
          </p>
        </div>

        {problems.length === 0 ? (
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-optimal/25 bg-optimal/[0.06] p-4">
            <PackageCheck className="h-5 w-5 shrink-0 text-optimal" />
            <p className="text-sm text-ink-200">
              Nothing is stuck.{" "}
              <span className="text-ink-400">
                Every {mineOnly ? "one of your" : "open"} order is inside its SLA and moving.
              </span>
            </p>
          </div>
        ) : (
          <Stagger className="mt-3 space-y-3">
            {problems.map((order) => (
              <StaggerItem key={order.id}>
                <OrderCard order={order} viewerId={coachId} defaultOpen={false} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </section>

      {/* ---------------------------------------------------------------- *
       * Everything else, by status
       * ---------------------------------------------------------------- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-ink-50">Everything else</h2>
          <p className="text-xs text-ink-600">
            <span className="stat-mono">{restCount}</span> order{restCount === 1 ? "" : "s"}
            {filter !== "all" && " matching this filter"}
          </p>
        </div>

        {groups.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-ink-700 p-4">
            <Users className="h-5 w-5 shrink-0 text-ink-500" />
            <p className="text-sm text-ink-400">
              No other orders match this filter
              {mineOnly ? " in your book" : ""}. Try All, or widen to every coach.
            </p>
          </div>
        ) : (
          groups.map((group) => {
            const isOpen = !collapsed[group.status];
            return (
              <div key={group.status} className="card overflow-hidden">
                <button
                  onClick={() =>
                    setCollapsed((c) => ({ ...c, [group.status]: !!isOpen }))
                  }
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-3 p-3.5 text-left transition-colors hover:bg-ink-800/50 focus-ring"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Badge tone={statusTone(group.status)}>{group.status}</Badge>
                    <span className="stat-mono text-sm text-ink-300">{group.items.length}</span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-ink-500 transition-transform",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>

                {isOpen && (
                  <div className="space-y-3 border-t border-ink-700/60 bg-ink-900/30 p-3">
                    {group.items.map((order) => (
                      <OrderCard key={order.id} order={order} viewerId={coachId} />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      {!mineOnly && (
        <p className="text-xs text-ink-600">
          Showing every coach&apos;s orders. You are signed in as{" "}
          <span className="text-ink-400">{staffName(coachId)}</span> — every card you act on
          records you as the actor.
        </p>
      )}
    </div>
  );
}
