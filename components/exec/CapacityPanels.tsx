"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import {
  scaleCheck,
  loadByLocation,
  loadByProvider,
  hourShape,
  capacityWindow,
  BOTTLENECK_THRESHOLD,
} from "@/lib/exec/capacity";
import { formatDate, cn } from "@/lib/utils";

/**
 * CAPACITY PANELS.
 *
 * See `lib/exec/capacity.ts` for the full argument. The short version: the
 * clinic-wide utilisation ratio computes to about 4%, every step of that
 * arithmetic is correct, and the figure is meaningless because the roster
 * fixture is scaled for 5,000 members and the booking fixture for 500.
 *
 * These panels are ordered by how much a reader can trust them, most
 * trustworthy first — the opposite of the usual dashboard instinct, which leads
 * with the headline percentage because it is the biggest number available.
 */

/**
 * THE SCALE NOTICE.
 *
 * Rendered first, before any capacity figure, and it is not a footnote or a
 * dismissible banner. If an owner reads one thing on this page it must be this,
 * because the number it disclaims is the one most likely to trigger an
 * irreversible decision — closing a site, cutting a shift, not hiring.
 *
 * The utilisation figure is still printed inside the notice rather than
 * suppressed entirely. Hiding it would mean the next person to open
 * `lib/analytics/capacity.ts` finds a 4% and no explanation, and reasonably
 * concludes the console is broken. It is shown once, in context, wrapped in the
 * reason it cannot be used — never as a tile, never as a headline.
 */
function ScaleNotice() {
  const s = scaleCheck();
  if (s.decisionGrade) return null;

  return (
    <div className="card border-watch/40 bg-watch/5 p-3.5">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-watch" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className="font-display text-heading font-semibold text-ink-50">
              Do not read the utilisation percentage
            </p>
            <Badge tone="watch">Measured, and still not usable</Badge>
          </div>

          <p className="mt-1.5 text-detail leading-snug text-ink-300">{s.reason}</p>

          {/* Shown once, in context, and deliberately at text-body rather than
              text-display — the figure is evidence for the argument here, not a
              headline. Sizing it like a KPI would undo the whole notice. */}
          <p className="stat-mono mt-2 text-body text-ink-400">
            {s.rosteredHours.toFixed(0)}h rostered · {s.bookedHours.toFixed(1)}h booked ·{" "}
            {s.bookingCount} bookings ·{" "}
            <span className="text-watch">{Math.round(s.utilisation * 100)}% utilisation</span>
          </p>

          <p className="mt-2 border-l-2 border-watch/40 pl-2.5 text-detail leading-snug text-ink-300">
            <span className="font-medium text-ink-200">What is still safe to read: </span>
            {s.remedy}
          </p>

          {/* The general lesson, stated because it is the more valuable half. */}
          <p className="mt-2 text-micro leading-snug text-ink-500">
            Worth noting for every other figure in this product: this number would earn a
            &ldquo;measured&rdquo; label honestly. Correct arithmetic over mismatched inputs leaves
            no magic constant for anyone to find. Provenance labelling is necessary and it is not
            sufficient.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Load by location, expressed as SHARE of booked hours.
 *
 * Share does not touch the roster denominator, so the fixture mismatch cannot
 * reach it — this is the honest answer to "where is the clinic busiest" in this
 * build. Utilisation is carried in a dim trailing column for completeness and is
 * never the sort key.
 */
function LoadByLocation() {
  const rows = React.useMemo(() => loadByLocation(), []);

  return (
    <div className="card p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="label-eyebrow">Where the work is</p>
        <p className="text-micro text-ink-500">Share of all booked hours this week</p>
      </div>

      <div className="mt-2.5 space-y-2">
        {rows.map((r) => (
          <div key={r.key} className="min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              <span className="text-detail font-medium text-ink-100">{r.label}</span>
              <span className="stat-mono text-detail text-ink-300">
                {Math.round(r.share * 100)}%
                <span className="ml-1.5 text-micro text-ink-600">
                  {r.bookedHours.toFixed(1)}h · {r.bookingCount} bookings
                </span>
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink-900">
              <div
                className="h-full rounded-full bg-gold-500"
                style={{ width: `${Math.max(1, r.share * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-2.5 text-micro leading-snug text-ink-500">
        Measured — booked minutes per location for the rostered week, divided by booked minutes
        across all locations (lib/analytics/capacity.ts). Share is scale-invariant, so the fixture
        mismatch described above does not affect this ranking.
      </p>
    </div>
  );
}

/**
 * Per-clinician load. NOT a leaderboard — see `lib/exec/capacity.ts:loadByProvider`.
 *
 * Sorted by absolute booked hours, which is a workload fact. The column that
 * matters operationally is OPEN HOURS: the question this panel answers is "who
 * has room", which is a scheduling question with an action attached, rather
 * than "who is busiest", which is a comparison with none.
 *
 * `docs/audit/ENGAGEMENT.md` records that this codebase deliberately declines to
 * rank people against each other. A clinician low on this list is rostered onto
 * a quiet site or carries the long appointments; none of that is in the ratio,
 * and all of it is invisible to someone reading the list as a scoreboard. Hence
 * no rank numbers, no medals, no sort-by-utilisation control.
 */
function LoadByProvider() {
  const rows = React.useMemo(() => loadByProvider(), []);

  return (
    <div className="card p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="label-eyebrow">Who has room</p>
        <p className="text-micro text-ink-500">Rostered vs booked, this week</p>
      </div>

      <div className="mt-2.5 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left">
          <thead>
            <tr className="border-b border-ink-700/70 text-micro uppercase tracking-wide text-ink-500">
              <th className="py-1.5 pr-3 font-medium">Clinician</th>
              <th className="py-1.5 pr-3 text-right font-medium">Rostered</th>
              <th className="py-1.5 pr-3 text-right font-medium">Booked</th>
              <th className="py-1.5 pr-3 text-right font-medium">Open</th>
              <th className="py-1.5 text-right font-medium">Off-roster</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.staffId} className="border-b border-ink-800/60 last:border-0">
                <td className="py-2 pr-3">
                  <span className="text-detail font-medium text-ink-100">{p.label}</span>
                  {p.credentials && (
                    <span className="ml-1.5 text-micro text-ink-600">{p.credentials}</span>
                  )}
                  {p.band === "bottleneck" && p.availableHours >= 4 && (
                    <Badge tone="watch" className="ml-2">
                      no slack
                    </Badge>
                  )}
                </td>
                <td className="stat-mono py-2 pr-3 text-right text-detail text-ink-300">
                  {p.availableHours.toFixed(1)}h
                </td>
                <td className="stat-mono py-2 pr-3 text-right text-detail text-ink-100">
                  {p.bookedHours.toFixed(1)}h
                </td>
                <td className="stat-mono py-2 pr-3 text-right text-detail text-ink-200">
                  {p.openHours.toFixed(1)}h
                </td>
                <td
                  className={cn(
                    "stat-mono py-2 text-right text-detail",
                    p.unrosteredHours > 0 ? "text-high" : "text-ink-600",
                  )}
                >
                  {p.unrosteredHours > 0 ? `${p.unrosteredHours.toFixed(1)}h` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2.5 text-micro leading-snug text-ink-500">
        Sorted by booked hours — a workload fact, not a ranking. A clinician low on this list may
        be rostered onto a quiet site or carrying the long appointments; the ratio cannot see
        either. <span className="text-high">Off-roster</span> counts hours booked onto someone
        with no shift covering that time: either the roster is wrong or the booking is, and both
        need a person. &ldquo;No slack&rdquo; marks{" "}
        {Math.round(BOTTLENECK_THRESHOLD * 100)}%+ booked, where one visit running long cascades
        through the rest of the day.
      </p>
    </div>
  );
}

/**
 * Hour-of-day shape. Scale-invariant and therefore safe to read directly:
 * both sides of the mismatch cancel when comparing 8am against 2pm.
 */
function HourShape() {
  const rows = React.useMemo(() => hourShape(), []);

  return (
    <div className="card p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="label-eyebrow">When the queue forms</p>
        <p className="text-micro text-ink-500">Booked hours by hour of day, whole week</p>
      </div>

      <div className="mt-3 flex items-end gap-1" style={{ height: "5rem" }}>
        {rows.map((h) => (
          <div key={h.hour} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <div
              className={cn(
                "w-full rounded-control",
                h.intensity > 0.66 ? "bg-gold-500" : h.intensity > 0.33 ? "bg-gold-600" : "bg-ink-700",
              )}
              style={{ height: `${Math.max(2, h.intensity * 100)}%` }}
              title={`${h.label} — ${h.bookedHours.toFixed(1)}h booked`}
            />
            <span className="stat-mono text-micro text-ink-600">{h.label}</span>
          </div>
        ))}
      </div>

      <p className="mt-2.5 text-micro leading-snug text-ink-500">
        Measured — booked minutes bucketed by start hour (lib/analytics/capacity.ts). Relative
        heights are readable; the absolute hours carry the same fixture caveat as everything else
        on this page.
      </p>
    </div>
  );
}

export function CapacityPanels() {
  const w = capacityWindow();

  return (
    <div className="space-y-3">
      <p className="text-micro text-ink-500">
        Rostered week {formatDate(w.from)} → {formatDate(w.to)} · today {formatDate(w.today)}
      </p>
      <ScaleNotice />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <LoadByLocation />
        <HourShape />
      </div>
      <LoadByProvider />
    </div>
  );
}
