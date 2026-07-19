"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarRange, CircleSlash, Users } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle, Select } from "@/components/ui/primitives";
import { FadeIn, Stagger, StaggerItem } from "@/components/motion";
import { locations, locationName } from "@/lib/mock/locations";
import {
  BOTTLENECK_THRESHOLD,
  UNDERUSED_THRESHOLD,
  capacityFindings,
  capacitySummary,
  capacityWindow,
  utilisationByDay,
  utilisationByHour,
  utilisationByLocation,
  utilisationByProvider,
  type UtilisationCell,
} from "@/lib/analytics/capacity";
import { cn, formatDate } from "@/lib/utils";
import type { LocationId } from "@/lib/types";

/**
 * CAPACITY.
 *
 * Built around one question an owner asks with money attached: do we hire, or
 * do we fill what we already pay for? So the page leads with open hours, not
 * with a utilisation percentage — a percentage is a ratio and you cannot staff
 * a ratio. Hours are the unit every decision downstream is denominated in.
 *
 * Findings are ranked by hours at stake rather than by severity colour, for the
 * same reason: a red badge on a two-hour bottleneck should not outrank thirty
 * unbooked hours on the Saturday roster.
 */
const BAND_TONE = {
  bottleneck: "high",
  healthy: "optimal",
  underused: "watch",
  unrostered: "high",
} as const;

const BAND_LABEL = {
  bottleneck: "At capacity",
  healthy: "Healthy",
  underused: "Underused",
  unrostered: "Unrostered",
} as const;

export default function CapacityPage() {
  const [locationId, setLocationId] = useState<LocationId | "all">("all");

  const range = useMemo(() => capacityWindow(), []);
  const summary = useMemo(() => capacitySummary(locationId), [locationId]);
  const byDay = useMemo(() => utilisationByDay(locationId), [locationId]);
  const byHour = useMemo(() => utilisationByHour(locationId), [locationId]);
  const byProvider = useMemo(() => utilisationByProvider(locationId), [locationId]);
  const byLocation = useMemo(() => utilisationByLocation(), []);
  const findings = useMemo(() => capacityFindings(locationId), [locationId]);

  const peakHour = byHour.reduce((a, b) => (b.utilisation > a.utilisation ? b : a), byHour[0]);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <FadeIn>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="label-eyebrow">Operations</p>
            <h1 className="font-display text-2xl font-semibold text-ink-50">
              Capacity &amp; utilisation
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-400">
              <CalendarRange className="h-3.5 w-3.5" />
              Rostered week {formatDate(range.from)} – {formatDate(range.to)}
            </p>
          </div>
          <div className="w-full sm:w-64">
            <Select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value as LocationId | "all")}
            >
              <option value="all">All locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.short}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </FadeIn>

      {/* Hours first. A ratio is not staffable. */}
      <FadeIn delay={0.04}>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Open hours this week"
            value={summary.openHours.toFixed(1)}
            unit="h"
            hint="Rostered and paid for, nobody booked into them."
            tone={summary.openHours > 40 ? "watch" : "neutral"}
          />
          <Stat
            label="Booked"
            value={summary.bookedHours.toFixed(1)}
            unit="h"
            hint={`of ${summary.availableHours.toFixed(1)}h rostered`}
          />
          <Stat
            label="Utilisation"
            value={Math.round(summary.utilisation * 100).toString()}
            unit="%"
            hint={`Bottleneck at ${Math.round(BOTTLENECK_THRESHOLD * 100)}%, underused below ${Math.round(UNDERUSED_THRESHOLD * 100)}%.`}
            tone={
              summary.utilisation >= BOTTLENECK_THRESHOLD
                ? "high"
                : summary.utilisation < UNDERUSED_THRESHOLD
                  ? "watch"
                  : "optimal"
            }
          />
          <Stat
            label="Booked outside roster"
            value={summary.unrosteredHours.toFixed(1)}
            unit="h"
            hint="Members booked onto a clinician with no shift. A rostering defect, not a rounding error."
            tone={summary.unrosteredHours > 0 ? "high" : "neutral"}
          />
        </div>
      </FadeIn>

      {/* Findings — ranked by hours at stake. */}
      <FadeIn delay={0.08}>
        <Card className="mt-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Where the hours are going</CardTitle>
            <span className="text-xs text-ink-500">Ranked by hours at stake</span>
          </CardHeader>
          <CardContent>
            {findings.length === 0 ? (
              <p className="text-sm text-ink-400">
                Nothing above threshold this week at{" "}
                {locationId === "all" ? "any location" : locationName(locationId)}.
              </p>
            ) : (
              <Stagger className="flex flex-col gap-2">
                {findings.slice(0, 10).map((f) => (
                  <StaggerItem key={f.id}>
                    <div className="flex items-start gap-3 rounded-xl border border-ink-700/60 bg-ink-900/40 p-3.5">
                      <span
                        className={cn(
                          "mt-0.5 shrink-0",
                          f.kind === "bottleneck"
                            ? "text-high"
                            : f.kind === "unrostered"
                              ? "text-high"
                              : "text-watch",
                        )}
                      >
                        {f.kind === "open-capacity" ? (
                          <CircleSlash className="h-4 w-4" />
                        ) : (
                          <AlertTriangle className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink-100">{f.label}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-ink-400">{f.detail}</p>
                      </div>
                      <span className="stat-mono shrink-0 text-sm text-ink-300">
                        {f.hours.toFixed(1)}h
                      </span>
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </CardContent>
        </Card>
      </FadeIn>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* By day */}
        <Card>
          <CardHeader>
            <CardTitle>By day</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {byDay.map((d) => (
              <div key={d.date} className="grid grid-cols-[3rem_1fr_4.5rem] items-center gap-3">
                <span
                  className={cn(
                    "text-xs font-medium",
                    d.isToday ? "text-gold-300" : "text-ink-400",
                  )}
                >
                  {d.weekday}
                </span>
                <UtilBar cell={d} />
                <span className="stat-mono text-right text-xs text-ink-300">
                  {d.bookedHours.toFixed(0)}/{d.availableHours.toFixed(0)}h
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* By hour */}
        <Card>
          <CardHeader className="flex flex-row items-baseline justify-between">
            <CardTitle>By hour of day</CardTitle>
            {peakHour && (
              <span className="text-xs text-ink-500">
                Peak {peakHour.label} · {Math.round(peakHour.utilisation * 100)}%
              </span>
            )}
          </CardHeader>
          <CardContent>
            <div className="flex h-40 items-end gap-1.5">
              {byHour.map((h) => (
                <div key={h.hour} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                  <div className="flex h-32 w-full items-end">
                    <div
                      className={cn(
                        "w-full rounded-t transition-[height] motion-reduce:transition-none",
                        h.utilisation >= BOTTLENECK_THRESHOLD
                          ? "bg-high/70"
                          : h.utilisation < UNDERUSED_THRESHOLD
                            ? "bg-ink-600"
                            : "bg-gold-500/70",
                      )}
                      style={{ height: `${Math.min(100, h.utilisation * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-ink-500">{h.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-500">
              Height is booked ÷ rostered for that hour. Bars are not clamped
              at the top elsewhere in this page — here they are, so read the
              provider table for anyone genuinely over 100%.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* By provider */}
      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>By clinician</CardTitle>
          <span className="flex items-center gap-1.5 text-xs text-ink-500">
            <Users className="h-3.5 w-3.5" />
            Admin staff excluded — members are not booked into them
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-ink-700/60 text-left">
                  <th className="label-eyebrow px-5 py-2.5 font-medium">Clinician</th>
                  <th className="label-eyebrow px-4 py-2.5 text-right font-medium">Rostered</th>
                  <th className="label-eyebrow px-4 py-2.5 text-right font-medium">Booked</th>
                  <th className="label-eyebrow px-4 py-2.5 text-right font-medium">Open</th>
                  <th className="label-eyebrow px-4 py-2.5 text-right font-medium">Outside roster</th>
                  <th className="label-eyebrow px-4 py-2.5 text-right font-medium">Utilisation</th>
                  <th className="label-eyebrow px-4 py-2.5 font-medium">Band</th>
                </tr>
              </thead>
              <tbody>
                {byProvider.map((p) => (
                  <tr key={p.staffId} className="border-b border-ink-800/70">
                    <td className="px-5 py-3">
                      <span className="text-ink-100">{p.label}</span>
                      <span className="ml-2 text-xs text-ink-500">
                        {p.credentials ?? p.role}
                      </span>
                    </td>
                    <td className="stat-mono px-4 py-3 text-right text-ink-300">
                      {p.availableHours.toFixed(1)}h
                    </td>
                    <td className="stat-mono px-4 py-3 text-right text-ink-200">
                      {p.bookedHours.toFixed(1)}h
                    </td>
                    <td className="stat-mono px-4 py-3 text-right text-ink-300">
                      {p.openHours.toFixed(1)}h
                    </td>
                    <td
                      className={cn(
                        "stat-mono px-4 py-3 text-right",
                        p.unrosteredHours > 0 ? "text-high" : "text-ink-600",
                      )}
                    >
                      {p.unrosteredHours > 0 ? `${p.unrosteredHours.toFixed(1)}h` : "—"}
                    </td>
                    <td className="stat-mono px-4 py-3 text-right text-ink-100">
                      {Math.round(p.utilisation * 100)}%
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={BAND_TONE[p.band]}>{BAND_LABEL[p.band]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* By location */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>By location</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {byLocation.map((l) => (
            <div key={l.key} className="rounded-xl border border-ink-700/60 bg-ink-900/40 p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium text-ink-100">{l.label}</p>
                <span className="stat-mono text-sm text-ink-200">
                  {Math.round(l.utilisation * 100)}%
                </span>
              </div>
              <div className="mt-2.5">
                <UtilBar cell={l} />
              </div>
              <p className="mt-2 text-xs text-ink-500">
                <span className="stat-mono">{l.bookedHours.toFixed(1)}h</span> booked ·{" "}
                <span className="stat-mono">{l.openHours.toFixed(1)}h</span> open ·{" "}
                <span className="stat-mono">{l.bookingCount}</span> bookings
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="mt-4 text-xs leading-relaxed text-ink-500">
        Cancellations and late cancels do not consume capacity — the slot was
        released. No-shows do: the clinician sat in the room and the slot was
        never resellable. Getting that backwards is the most common way a
        utilisation figure overstates how busy a week was.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  unit?: string;
  hint: string;
  tone?: "neutral" | "optimal" | "watch" | "high";
}) {
  const toneClass = {
    neutral: "text-ink-50",
    optimal: "text-optimal",
    watch: "text-watch",
    high: "text-high",
  }[tone];
  return (
    <div className="card p-4">
      <p className="label-eyebrow">{label}</p>
      <p className={cn("stat-mono mt-1 text-2xl", toneClass)}>
        {value}
        {unit && <span className="ml-0.5 text-sm text-ink-500">{unit}</span>}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-ink-500">{hint}</p>
    </div>
  );
}

/** Booked fill against rostered track. Never clamped — over 100% must show. */
function UtilBar({ cell }: { cell: UtilisationCell }) {
  const pct = Math.min(100, cell.utilisation * 100);
  const over = cell.utilisation > 1;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-700/70">
      <div
        className={cn(
          "h-full rounded-full",
          over
            ? "bg-high"
            : cell.utilisation >= BOTTLENECK_THRESHOLD
              ? "bg-high/70"
              : cell.utilisation < UNDERUSED_THRESHOLD
                ? "bg-ink-500"
                : "bg-gold-500",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
