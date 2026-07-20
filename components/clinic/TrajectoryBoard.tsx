"use client";

import * as React from "react";
import Link from "next/link";
import { LineChart, TrendingDown, TrendingUp } from "lucide-react";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/primitives";
import { LabVelocityPanel } from "@/components/clinic/LabVelocityPanel";
import { clientName, getClient } from "@/lib/mock/clients";
import { crossingSoonest, MIN_POINTS, type VelocityResult } from "@/lib/labs/velocity";
import { daysBetween, dayOf } from "@/lib/subscriptions/engine";
import { NOW } from "@/lib/labs/velocity";
import { cn, formatDate } from "@/lib/utils";

/**
 * TRAJECTORY BOARD — who reaches the edge of the reference band first.
 *
 * The ranking is deliberately not "steepest slope". A marker climbing quickly
 * from the bottom of its range is less urgent than one creeping upward with
 * almost no room left, and a board sorted on velocity puts the first one on
 * top. Sorting on TIME TO CROSSING folds both the rate and the remaining
 * headroom into one number, which is the question a clinician is actually
 * asking when they scan a list like this.
 *
 * Scope is capped by the caller. Every marker on every panel could be fitted,
 * but a board with forty rows is a board nobody reads, and the useful signal
 * lives entirely in the first handful.
 */

interface Row {
  clientId: string;
  name: string;
  v: VelocityResult;
  /** Days until the central estimate crosses. Negative when already outside. */
  days: number;
}

export function TrajectoryBoard({
  clientIds,
  limit = 6,
}: {
  /** The cohort to fit. Cap it upstream — see the header. */
  clientIds: string[];
  limit?: number;
}) {
  const rows: Row[] = React.useMemo(() => {
    const out: Row[] = [];
    for (const id of clientIds) {
      const client = getClient(id);
      if (!client) continue;
      // One row per member: their soonest-crossing marker. Letting a single
      // member occupy the whole board with four of their own markers is how a
      // practice-level list stops being a practice-level list.
      const soonest = crossingSoonest(id)[0];
      if (!soonest?.crossing) continue;
      const days = soonest.crossing.alreadyOutside
        ? -1
        : daysBetween(dayOf(NOW), soonest.crossing.on ?? dayOf(NOW));
      out.push({ clientId: id, name: clientName(client), v: soonest, days });
    }
    return out.sort((a, b) => a.days - b.days).slice(0, limit);
  }, [clientIds, limit]);

  const [selected, setSelected] = React.useState<string | null>(null);
  const active = rows.find((r) => r.clientId === selected) ?? rows[0];

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <LineChart className="h-4 w-4 text-gold-400" /> Trajectories, and when they cross
          </CardTitle>
          <p className="mt-1 max-w-2xl text-detail leading-relaxed text-ink-500">
            Least-squares fit over each member&apos;s own repeat draws, projected forward with a 95%
            prediction band. The band widens with distance because that is what the arithmetic
            says — a year out from {MIN_POINTS}–5 blood draws is genuinely that uncertain.
          </p>
        </div>
        <Badge tone={rows.length > 0 ? "watch" : "optimal"}>{rows.length} tracking</Badge>
      </CardHeader>

      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            title="No marker in this cohort has a trend distinguishable from noise"
            hint={`A projection needs at least ${MIN_POINTS} results and a slope whose confidence interval excludes zero.`}
          />
        ) : (
          // grid-cols-1 as an explicit base, min-w-0 on both children: this
          // layout has produced horizontal overflow at 390px before, because a
          // grid child defaults to min-width:auto and a chart refuses to shrink.
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="min-w-0 space-y-1.5 lg:col-span-2">
              {rows.map((r) => {
                const isActive = active?.clientId === r.clientId;
                const rising = r.v.slopePerQuarter > 0;
                return (
                  <button
                    key={r.clientId}
                    type="button"
                    onClick={() => setSelected(r.clientId)}
                    className={cn(
                      "focus-ring block w-full min-w-0 rounded-xl border p-2.5 text-left transition-colors",
                      isActive
                        ? "border-gold-400/40 bg-gold-400/[0.06]"
                        : "border-ink-800 bg-ink-900/40 hover:border-ink-700",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-body font-medium text-ink-100">{r.name}</span>
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 text-micro",
                          rising ? "text-high" : "text-low",
                        )}
                      >
                        {rising ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {r.days < 0 ? "already outside" : `${r.days}d`}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-detail text-ink-400">
                      {r.v.markerName} · {r.v.headline}
                    </p>
                    <p className="mt-0.5 truncate text-micro text-ink-600">
                      {r.v.crossing?.alreadyOutside
                        ? `Past the reference ${r.v.crossing.edge} of ${r.v.crossing.boundary} ${r.v.unit}`
                        : r.v.crossing?.on
                          ? `Reference ${r.v.crossing.edge} around ${formatDate(`${r.v.crossing.on}T12:00:00`)}`
                          : "No crossing inside the projection window"}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="min-w-0 lg:col-span-3">
              {active && (
                <>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/clients/${active.clientId}`}
                      className="truncate text-body font-medium text-ink-100 hover:text-gold-300"
                    >
                      {active.name}
                    </Link>
                    <Badge>{active.v.markerName}</Badge>
                  </div>
                  <LabVelocityPanel
                    key={`${active.clientId}:${active.v.markerKey}`}
                    clientId={active.clientId}
                    markerKey={active.v.markerKey}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
