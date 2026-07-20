"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronDown,
  Truck,
  Package,
  Building2,
  Radio,
  User,
  Eye,
  Megaphone,
} from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { Order, OrderEventSource } from "@/lib/orders/types";
import {
  clientFacingStatus,
  hoursInStatus,
  orderTotalCents,
  progressPercent,
  statusTone,
  stuckReason,
} from "@/lib/orders/lifecycle";
import { getClient, clientName } from "@/lib/mock/clients";
import { staffName, staffMap } from "@/lib/mock/staff";
import { locationName } from "@/lib/mock/locations";
import { Badge, Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { Monogram } from "@/components/Monogram";
import { appendLedger } from "@/lib/trace/ledger";
import { shortHash } from "@/lib/trace/hash";
import { cn, currency, formatDateTime } from "@/lib/utils";

/**
 * ONE ORDER, FULLY ACCOUNTED FOR.
 *
 * The card the audited system could not draw. Over there an order is a row with
 * a status string and, if you are lucky, a tracking number — and its history is
 * a list of (status, timestamp) pairs with no actor, so "who cancelled this?"
 * is unanswerable by the software and gets answered by asking around.
 *
 * Three things here are non-negotiable and each maps to a specific failure:
 *  1. Every history row names its ACTOR and its SOURCE. Machines included.
 *  2. When an order is stuck we say so at the top, in words, with the clock.
 *  3. We show the member's view of the same order side by side with ours, so a
 *     coach can never confidently tell a member something the portal contradicts.
 */

/** Pinned clock. Nothing here reads the wall clock. */
const NOW = "2026-06-12T09:00:00";

/** Who moved it — the icon carries the accountability, not just decoration. */
const SOURCE_META: Record<
  OrderEventSource,
  { label: string; icon: React.ElementType; className: string }
> = {
  apex: { label: "Apex", icon: User, className: "text-gold-300" },
  medsource: { label: "MedSource", icon: Building2, className: "text-ink-300" },
  carrier: { label: "Carrier", icon: Radio, className: "text-low" },
};

export function OrderCard({
  order,
  /**
   * WHO IS LOOKING. Not the order's owning coach.
   *
   * These are different people the moment the board is switched to "All" to
   * cover for someone. Attributing a chase to the order's coach rather than the
   * person who clicked would put a false name on a hash-chained row — in a
   * system whose entire claim is that the record names the actor, that is the
   * worst possible bug.
   */
  viewerId,
  /** Pre-expanded on the problems rail — a stuck order should not need a click. */
  defaultOpen = false,
}: {
  order: Order;
  viewerId: string;
  defaultOpen?: boolean;
}) {
  const { toast } = useToast();
  const reduce = useReducedMotion();

  const [open, setOpen] = React.useState(defaultOpen);
  const [chased, setChased] = React.useState<string | null>(null);

  const client = getClient(order.clientId);
  const reason = stuckReason(order, NOW);
  const stuck = reason !== null;
  const hours = Math.floor(hoursInStatus(order, NOW));
  const pct = progressPercent(order.status);
  /**
   * Cancelled and Failed both return 100 from progressPercent and are never
   * "stuck" (terminal statuses have no SLA), so without this a failed order
   * rendered a full, healthy gold bar — reading as complete at a glance.
   */
  const dead = order.status === "Cancelled" || order.status === "Failed";

  /**
   * "Chase this" is a real write, not a nice toast.
   *
   * The point of the demo: escalating a stranded order leaves a hash-chained
   * row naming the coach who did it. In the audited system the equivalent
   * action was a Slack message, which is to say no record at all.
   */
  const chase = React.useCallback(() => {
    const row = appendLedger({
      actorId: viewerId,
      actorName: staffName(viewerId),
      actorRole: staffMap[viewerId]?.role ?? "Coach",
      action: "update",
      entity: "order",
      entityId: order.id,
      subjectId: order.clientId,
      subjectName: client ? clientName(client) : order.clientId,
      locationId: order.locationId,
      reason: reason ?? `Coach escalation on ${order.status}`,
      before: { status: order.status, escalated: false, hoursInStatus: hours },
      // The owning coach is context on the row, never the actor on it.
      after: {
        status: order.status,
        escalated: true,
        escalatedTo: order.fulfillmentPartner,
        owningCoach: staffName(order.coachId),
      },
    });
    setChased(row.id);
    toast(`Chased ${order.id}`, {
      desc: `Ledger ${row.id} · ${shortHash(row.hash)} — ${order.fulfillmentPartner} owes us an answer.`,
      tone: "warn",
    });
  }, [order, client, reason, hours, toast, viewerId]);

  return (
    <div
      className={cn(
        "card overflow-hidden",
        stuck && "border-high/30",
      )}
    >
      {/* ---------------------------------------------------------------- *
       * Header — who, what, how much, how far along
       * ---------------------------------------------------------------- */}
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {client ? (
              <Link
                href={`/clients/${client.id}`}
                className="flex min-w-0 items-center gap-3 rounded-lg focus-ring"
              >
                <Monogram client={client} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-body font-medium text-ink-50">
                    {clientName(client)}
                  </span>
                  <span className="block truncate text-micro text-ink-600">
                    {locationName(order.locationId)} · coach {staffName(order.coachId)}
                  </span>
                </span>
              </Link>
            ) : (
              <span className="text-body text-ink-400">Unknown member</span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Badge tone={statusTone(order.status)}>{order.status}</Badge>
            <span className="stat-mono text-body font-semibold text-ink-50">
              {currency(orderTotalCents(order) / 100)}
            </span>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-ink-600">
          <span className="stat-mono text-ink-400">{order.id}</span>
          <span>{order.fulfillmentPartner}</span>
          {order.medsourceRef && (
            /* Display-only. Never a join key — see DECISION 1 in orders/types. */
            <span className="stat-mono">ref {order.medsourceRef}</span>
          )}
          {order.tracking && (
            <span className="stat-mono inline-flex items-center gap-1">
              <Truck className="h-3 w-3" />
              {order.carrier} {order.tracking}
            </span>
          )}
          <span>placed {formatDateTime(order.placedAt)}</span>
        </div>

        {/* Progress rail. Red when stuck: the bar is the fastest read on the
            card, so it must not look healthy when the order is not. */}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink-700/70">
          <motion.div
            className={cn("h-full rounded-full", stuck || dead ? "bg-high" : "bg-gold-400")}
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: reduce ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </div>

      {/* ---------------------------------------------------------------- *
       * The problem, if there is one
       * ---------------------------------------------------------------- */}
      {stuck && (
        <div className="border-t border-high/20 bg-high/[0.06] p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-high" />
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium text-high">{reason}</p>
              <p className="mt-1 text-micro text-ink-400">
                <span className="stat-mono text-ink-200">{hours}h</span> in{" "}
                <span className="text-ink-300">{order.status}</span> with no movement.
                {order.delayReason && <span className="text-ink-500"> {order.delayReason}</span>}
              </p>
            </div>
            <div className="shrink-0">
              {chased ? (
                <span className="stat-mono inline-flex items-center gap-1.5 rounded-lg border border-watch/30 bg-watch/12 px-2.5 py-1 text-micro text-watch">
                  <Megaphone className="h-3.5 w-3.5" />
                  {chased}
                </span>
              ) : (
                <Button size="sm" variant="danger" onClick={chase}>
                  <Megaphone className="h-3.5 w-3.5" />
                  Chase this
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- *
       * What the member sees — the honesty check
       * ---------------------------------------------------------------- */}
      <div className="border-t border-ink-700/60 px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-micro text-ink-600">
          <Eye className="h-3 w-3 shrink-0" />
          <span className="label-eyebrow">What the member sees</span>
          <span className="text-ink-400">
            {order.visibleToClient
              ? clientFacingStatus(order.status)
              : "Nothing — this order is not visible in their portal yet."}
          </span>
        </p>
      </div>

      {/* ---------------------------------------------------------------- *
       * Detail
       * ---------------------------------------------------------------- */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between border-t border-ink-700/60 px-4 py-2.5 text-left text-detail text-ink-400 transition-colors hover:bg-ink-800/50 hover:text-ink-200 focus-ring"
      >
        <span>
          <span className="stat-mono">{order.lines.length}</span> line
          {order.lines.length === 1 ? "" : "s"} ·{" "}
          <span className="stat-mono">{order.statusHistory.length}</span> recorded event
          {order.statusHistory.length === 1 ? "" : "s"}
        </span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-ink-700/60 p-4">
              {/* Lines */}
              <div>
                <p className="label-eyebrow">Items</p>
                <ul className="mt-2 space-y-1.5">
                  {order.lines.map((line) => (
                    <li key={line.id} className="flex items-start justify-between gap-3 text-detail">
                      <span className="min-w-0">
                        <span className="block text-ink-200">
                          {line.name}
                          {line.isAddon && (
                            <span className="ml-1.5 text-micro uppercase tracking-wide text-ink-600">
                              add-on
                            </span>
                          )}
                        </span>
                        <span className="stat-mono block text-micro text-ink-600">
                          {line.sku}
                          {/* Lot binds the patient to the physical unit — this is
                              what makes a recall answerable without phone calls. */}
                          {line.lotRef && ` · lot ${line.lotRef}`}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="stat-mono block text-ink-300">
                          {line.qty} × {currency(line.unitPriceCents / 100)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* History — the whole argument for this system lives in this list. */}
              <div>
                <p className="label-eyebrow">History · every change names who and from where</p>
                <ol className="mt-2 space-y-2.5">
                  {order.statusHistory.map((ev, i) => {
                    const meta = SOURCE_META[ev.source];
                    const Icon = meta.icon;
                    const last = i === order.statusHistory.length - 1;
                    return (
                      <li key={`${ev.status}-${ev.at}-${i}`} className="flex gap-2.5">
                        <span className="flex flex-col items-center pt-0.5">
                          <Icon className={cn("h-3.5 w-3.5 shrink-0", meta.className)} />
                          {!last && <span className="mt-1 w-px flex-1 bg-ink-700" />}
                        </span>
                        <span className="min-w-0 flex-1 pb-0.5">
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-detail font-medium text-ink-100">{ev.status}</span>
                            <span className="stat-mono text-micro text-ink-600">
                              {formatDateTime(ev.at)}
                            </span>
                          </span>
                          <span className="block text-micro text-ink-400">
                            {ev.actor}
                            <span className="text-ink-600">
                              {" "}
                              · {ev.actorRole} · via {meta.label}
                            </span>
                          </span>
                          {ev.note && (
                            <span className="mt-0.5 block text-micro italic text-ink-500">
                              {ev.note}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {order.estDelivery && (
                <p className="flex items-center gap-1.5 text-micro text-ink-500">
                  <Package className="h-3 w-3" />
                  Estimated delivery{" "}
                  <span className="stat-mono text-ink-300">
                    {formatDateTime(order.estDelivery)}
                  </span>
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
