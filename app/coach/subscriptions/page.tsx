"use client";

import * as React from "react";
import { Pause, Play, KeyRound, RefreshCw, AlertTriangle, CalendarClock } from "lucide-react";

import { Card, CardContent, Badge, Button, EmptyState } from "@/components/ui/primitives";
import { FadeIn } from "@/components/motion";
import { useToast } from "@/components/ui/Toast";
import { cn, formatDate } from "@/lib/utils";

import { getClient, clientName } from "@/lib/mock/clients";
import { staffMap, staffName } from "@/lib/mock/staff";
import { membershipForClient } from "@/lib/mock/memberships";
import { locationMap } from "@/lib/mock/locations";
import { catalogItem } from "@/lib/catalog/catalog";
import { appendLedger } from "@/lib/trace/ledger";
import { commitOrder } from "@/lib/mock/orders";
import { shortHash } from "@/lib/trace/hash";
import { ME_COACH } from "@/components/coach/TodayQueue";

import { subscriptions as seedSubscriptions } from "@/lib/mock/subscriptions";
import type { Subscription } from "@/lib/subscriptions/types";
import {
  dueRefills,
  heldRefills,
  upcomingRefills,
  inactiveSubs,
  refillTiming,
  refillRevenueThisMonthCents,
  activeBookMonthlyCents,
  placeRefill,
  daysBetween,
} from "@/lib/subscriptions/engine";
import { centsToDollars, type PlacingActor } from "@/lib/orders/place";

/**
 * Coach · Auto-Refills
 *
 * The subscription book, ordered by what actually needs a human: due today
 * first, then held, then upcoming, then the inactive tail.
 *
 * Two things on this page did not exist in the system Apex replaces:
 *
 *   1. THIS PAGE. Auto-refills ran headlessly. A coach could not see what was
 *      scheduled, what had shipped, or what had quietly stopped shipping.
 *   2. THE REVENUE FIGURE. Refills wrote no purchase row, so refill revenue was
 *      absent from every report — the fastest-growing part of the business was
 *      invisible to the people running it.
 *
 * Every action here appends a real ledger row. DEMO-SHAPED: state lives in this
 * component and in the in-memory book; nothing makes a network call.
 */

const NOW = "2026-06-12T09:00:00";

const ACTOR: PlacingActor = {
  id: ME_COACH,
  name: staffName(ME_COACH),
  role: staffMap[ME_COACH]?.role ?? "Coach",
};

export default function CoachSubscriptionsPage() {
  const { toast } = useToast();

  /**
   * Working copy of the book. Seeded from the deterministic mock, then owned by
   * this component for the session — in production this is a query plus a
   * conditional UPDATE per action; here it is state, and the semantics of every
   * transition are identical because the engine is pure.
   */
  const [subs, setSubs] = React.useState<Subscription[]>(() =>
    seedSubscriptions.map((s) => ({ ...s })),
  );

  const due = dueRefills(subs, NOW);
  const held = heldRefills(subs, NOW);
  const upcoming = upcomingRefills(subs, 30, NOW);
  const inactive = inactiveSubs(subs);

  const revenueCents = refillRevenueThisMonthCents(subs, NOW);
  const runRateCents = activeBookMonthlyCents(subs);
  const activeCount = subs.filter((s) => s.status === "Active").length;

  function replace(next: Subscription) {
    setSubs((list) => list.map((s) => (s.id === next.id ? next : s)));
  }

  /** Pause / resume / release all write the same shape of audit row. */
  function writeStatusRow(
    sub: Subscription,
    action: "update",
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    reason: string,
  ) {
    const c = getClient(sub.clientId);
    // A subscription is a standing protocol, so it records against the
    // `protocol` entity — the ledger vocabulary is closed on purpose and we do
    // not invent a new entity type for a new screen.
    return appendLedger(
      {
        actorId: ACTOR.id,
        actorName: ACTOR.name,
        actorRole: ACTOR.role,
        action,
        entity: "protocol",
        entityId: sub.id,
        subjectId: sub.clientId,
        subjectName: c ? clientName(c) : undefined,
        locationId: sub.locationId,
        reason,
        before,
        after,
      },
      NOW,
    );
  }

  function onPause(sub: Subscription) {
    const next: Subscription = { ...sub, status: "Paused" };
    replace(next);
    const row = writeStatusRow(
      sub,
      "update",
      { status: sub.status },
      { status: "Paused" },
      "Paused by coach — refills will not place until resumed.",
    );
    toast(`Paused ${itemName(sub)}`, { tone: "info", desc: `Ledger ${row.id} · ${shortHash(row.hash)}` });
  }

  function onResume(sub: Subscription) {
    const next: Subscription = { ...sub, status: "Active" };
    replace(next);
    const row = writeStatusRow(
      sub,
      "update",
      { status: sub.status },
      { status: "Active" },
      "Resumed by coach.",
    );
    toast(`Resumed ${itemName(sub)}`, { desc: `Ledger ${row.id} · ${shortHash(row.hash)}` });
  }

  function onRelease(sub: Subscription) {
    const next: Subscription = {
      ...sub,
      heldReason: undefined,
      holdAmountCents: undefined,
    };
    replace(next);
    const row = writeStatusRow(
      sub,
      "update",
      { heldReason: sub.heldReason, holdAmountCents: sub.holdAmountCents },
      { heldReason: null, holdAmountCents: null },
      `Hold released by coach: ${sub.heldReason ?? "no reason recorded"}`,
    );
    // The schedule is untouched by the hold — releasing puts the member back on
    // their ORIGINAL phase rather than pushing them forward by the hold length.
    toast(`Hold released · still due ${sub.nextRefillOn}`, {
      desc: `Schedule kept its original phase. Ledger ${row.id}`,
    });
  }

  function onPlace(sub: Subscription) {
    const c = getClient(sub.clientId);
    const result = placeRefill(sub, ACTOR, {
      coachId: c?.coachId ?? ME_COACH,
      clientName: c ? clientName(c) : undefined,
      membership: membershipForClient(sub.clientId),
      shipTo:
        sub.shipping === "ship"
          ? {
              // Apex holds the member's address on the chart; seeded from their
              // home clinic for the demo so the refill validates end to end.
              line1: "On file",
              city: locationMap[sub.locationId]?.city ?? "Raleigh",
              state: locationMap[sub.locationId]?.state ?? "NC",
              postal: "27615",
            }
          : undefined,
      nowIso: NOW,
      // Stands in for the conditional row read behind the optimistic claim.
      readCurrent: (id) => subs.find((s) => s.id === id),
    });

    if (!result.ok) {
      toast("Refill not placed", { tone: "warn", desc: result.reason });
      return;
    }

    replace(result.nextSub);
    // Commit the order too. In the audited system auto-refills were invisible
    // to the coach and wrote no purchase row at all, so refill revenue simply
    // vanished from a member's history — the money moved and the record did not.
    commitOrder(result.order);
    const row = appendLedger(result.ledgerDraft, NOW);
    toast(`Refill ${result.order.id} placed`, {
      desc: `${centsToDollars(result.pricing.totalCents)} · next ${result.nextSub.nextRefillOn} · ledger ${row.id}`,
    });
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <p className="label-eyebrow">COACH CONSOLE</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink-50">
          Auto-Refills
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          Every standing protocol, what is due, and what is stuck — with the schedule rolling from
          the date it was owed, so a hold never pushes a member permanently later.
        </p>
      </FadeIn>

      {/* Explicit base grid-cols-1 — an implicit column sizes to content and
          overflows at 390px. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Refill revenue this month" value={centsToDollars(revenueCents)} tone="gold" />
        <Stat label="Active subscriptions" value={String(activeCount)} />
        <Stat label="Monthly run-rate" value={centsToDollars(runRateCents)} />
        <Stat
          label="Needs attention"
          value={String(due.length + held.length)}
          tone={due.length + held.length > 0 ? "high" : "neutral"}
        />
      </div>

      <Section
        title="Due now"
        hint="Scheduled today or earlier and nothing is blocking. One tap places the order."
        count={due.length}
        empty="No refills are due. The book is current."
      >
        {due.map((s) => (
          <Row key={s.id} sub={s} onPlace={onPlace} onPause={onPause} onResume={onResume} onRelease={onRelease} />
        ))}
      </Section>

      <Section
        title="Held"
        hint="Due, but blocked. This is revenue standing still — and a member who may run out."
        count={held.length}
        empty="Nothing on hold."
      >
        {held.map((s) => (
          <Row key={s.id} sub={s} onPlace={onPlace} onPause={onPause} onResume={onResume} onRelease={onRelease} />
        ))}
      </Section>

      <Section
        title="Upcoming · next 30 days"
        hint="Soonest first. Nothing to do yet."
        count={upcoming.length}
        empty="Nothing scheduled in the next 30 days."
      >
        {upcoming.map((s) => (
          <Row key={s.id} sub={s} onPlace={onPlace} onPause={onPause} onResume={onResume} onRelease={onRelease} />
        ))}
      </Section>

      <Section
        title="Paused, lapsed & ended"
        hint="Not refilling. Each one is a member who was on a protocol and no longer is."
        count={inactive.length}
        empty="No inactive subscriptions."
      >
        {inactive.map((s) => (
          <Row key={s.id} sub={s} onPlace={onPlace} onPause={onPause} onResume={onResume} onRelease={onRelease} />
        ))}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function itemName(sub: Subscription): string {
  return catalogItem(sub.catalogItemId)?.name ?? sub.catalogItemId;
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "gold" | "high";
}) {
  const color = tone === "gold" ? "text-gold-300" : tone === "high" ? "text-high" : "text-ink-50";
  return (
    <Card>
      <CardContent className="p-5">
        <p className="label-eyebrow">{label}</p>
        <p className={cn("stat-mono mt-2 text-2xl font-semibold", color)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  hint,
  count,
  empty,
  children,
}: {
  title: string;
  hint: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-ink-50">{title}</h2>
        <span className="stat-mono text-xs text-ink-500">{count}</span>
      </div>
      <p className="-mt-1 text-xs text-ink-500">{hint}</p>
      {count === 0 ? <EmptyState title={empty} /> : <div className="space-y-2">{children}</div>}
    </section>
  );
}

function Row({
  sub,
  onPlace,
  onPause,
  onResume,
  onRelease,
}: {
  sub: Subscription;
  onPlace: (s: Subscription) => void;
  onPause: (s: Subscription) => void;
  onResume: (s: Subscription) => void;
  onRelease: (s: Subscription) => void;
}) {
  const client = getClient(sub.clientId);
  const item = catalogItem(sub.catalogItemId);
  const timing = refillTiming(sub, NOW);
  const overdue = timing.includes("overdue");
  const isActive = sub.status === "Active";
  const isDue = daysBetween(NOW, sub.nextRefillOn) <= 0;

  return (
    <Card className={cn(sub.heldReason && "border-watch/30", overdue && !sub.heldReason && "border-high/30")}>
      <CardContent className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-medium text-ink-50">
                {client ? clientName(client) : sub.clientId}
              </p>
              <Badge tone={isActive ? "optimal" : sub.status === "Paused" ? "neutral" : "watch"}>
                {sub.status}
              </Badge>
              {sub.heldReason && (
                <Badge tone="watch">
                  <AlertTriangle className="h-3 w-3" />
                  Held
                </Badge>
              )}
            </div>

            <p className="mt-1 truncate text-sm text-ink-300">{item?.name ?? sub.catalogItemId}</p>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-500">
              <span className="stat-mono inline-flex items-center gap-1">
                <RefreshCw className="h-3 w-3" />
                every {sub.cadenceDays}d
              </span>
              <span className={cn("stat-mono inline-flex items-center gap-1", overdue && "text-high")}>
                <CalendarClock className="h-3 w-3" />
                {formatDate(sub.nextRefillOn)} · {timing}
              </span>
              <span className="stat-mono">{centsToDollars(sub.priceCents)}</span>
              <span className="stat-mono">{sub.refillsPlaced} placed</span>
              {sub.lastPlacedOn && (
                <span className="stat-mono">last {formatDate(sub.lastPlacedOn)}</span>
              )}
            </div>

            {sub.heldReason && (
              <p className="mt-2 rounded-lg border border-watch/25 bg-watch/[0.06] p-2 text-[11px] leading-relaxed text-ink-300">
                {sub.heldReason}
                {sub.holdAmountCents ? ` · ${centsToDollars(sub.holdAmountCents)} outstanding` : ""}
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {sub.heldReason && (
              <Button variant="outline" size="sm" onClick={() => onRelease(sub)}>
                <KeyRound className="h-3.5 w-3.5" />
                Release
              </Button>
            )}
            {/* Only offered when the refill is actually claimable — an enabled
                button that always refuses teaches staff to distrust the UI. */}
            {isActive && !sub.heldReason && isDue && (
              <Button variant="primary" size="sm" onClick={() => onPlace(sub)}>
                Place refill
              </Button>
            )}
            {isActive ? (
              <Button variant="ghost" size="sm" onClick={() => onPause(sub)}>
                <Pause className="h-3.5 w-3.5" />
                Pause
              </Button>
            ) : (
              sub.status !== "Ended" && (
                <Button variant="outline" size="sm" onClick={() => onResume(sub)}>
                  <Play className="h-3.5 w-3.5" />
                  Resume
                </Button>
              )
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
