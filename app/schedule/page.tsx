"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import {
  shifts,
  shiftsForDate,
  shiftHours,
  WEEK_DATES,
  WEEK_LABELS,
  TODAY,
} from "@/lib/mock/shifts";
import { staff, staffMap } from "@/lib/mock/staff";
import { todaysAppointments } from "@/lib/mock/appointments";
import { locations, locationName } from "@/lib/mock/locations";
import { DashboardCard } from "@/components/DashboardCard";
import { Card, CardHeader, CardTitle, CardContent, Badge, EmptyState } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  Clock,
  Users,
  AlertTriangle,
  MapPin,
  CheckCircle2,
} from "lucide-react";

const ROLE_TONE = {
  Medical: "optimal",
  Coach: "gold",
  
  Admin: "neutral",
} as const;

export default function SchedulePage() {
  const { locationFilter } = useStore();
  const [selectedDate, setSelectedDate] = useState(TODAY);

  const inLoc = (loc: string) => locationFilter === "all" || loc === locationFilter;

  // Staff in view: those with at least one shift at the filtered location this week.
  const staffInView = useMemo(() => {
    if (locationFilter === "all") return staff;
    const ids = new Set(shifts.filter((s) => s.locationId === locationFilter).map((s) => s.staffId));
    return staff.filter((s) => ids.has(s.id));
  }, [locationFilter]);

  const todays = shiftsForDate(TODAY).filter((s) => inLoc(s.locationId));
  const selectedShifts = shiftsForDate(selectedDate).filter((s) => inLoc(s.locationId));
  const appts = todaysAppointments.filter((a) => inLoc(a.locationId));

  const weekHours = shifts
    .filter((s) => inLoc(s.locationId))
    .reduce((sum, s) => sum + shiftHours(s), 0);

  const providersOnToday = todays.filter((s) => staffMap[s.staffId]?.role === "Medical").length;

  // Coverage gap detection: an appointment whose location has no provider on shift today.
  const gaps = appts.filter((a) => {
    const provs = todays.filter(
      (s) => s.locationId === a.locationId && staffMap[s.staffId]?.role === "Medical",
    );
    return provs.length === 0;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label-eyebrow">Team schedule · week of Jun 8–14, 2026</p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-title font-bold tracking-tight text-ink-50">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-gold-300 to-gold-600 text-ink-950">
              <CalendarDays className="h-5 w-5" />
            </span>
            Staff &amp; Coach Schedule
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DashboardCard label="On shift today" value={todays.length} icon={<Users className="h-4 w-4" />} accent hint={`${providersOnToday} provider(s)`} />
        <DashboardCard label="Scheduled hours / wk" value={Math.round(weekHours)} icon={<Clock className="h-4 w-4" />} hint="In view" />
        <DashboardCard label="Appointments today" value={appts.length} icon={<CalendarDays className="h-4 w-4" />} />
        <DashboardCard label="Coverage gaps" value={gaps.length} icon={<AlertTriangle className="h-4 w-4" />} deltaTone={gaps.length ? "down" : "flat"} delta={gaps.length ? "review" : "clear"} />
      </div>

      {/* Weekly roster grid */}
      <Card className="overflow-hidden">
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Weekly roster</CardTitle>
          <Badge>{staffInView.length} staff</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-body">
              <thead>
                <tr className="border-b border-ink-800 text-micro uppercase tracking-wider text-ink-500">
                  <th className="px-4 py-2.5 text-left font-medium">Staff</th>
                  {WEEK_DATES.map((d, i) => (
                    <th
                      key={d}
                      className={cn("px-2 py-2.5 text-center font-medium", d === TODAY && "text-gold-300")}
                    >
                      {WEEK_LABELS[i]}
                      <span className="block text-micro font-normal text-ink-600">{d.slice(8)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800/70">
                {staffInView.map((s) => {
                  const row = WEEK_DATES.map((d) =>
                    shifts.find((sh) => sh.staffId === s.id && sh.date === d && inLoc(sh.locationId)),
                  );
                  return (
                    <tr key={s.id} className="hover:bg-ink-850/50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-800 text-micro font-semibold text-ink-200">{s.avatarInitials}</span>
                          <div className="min-w-0">
                            <span className="block truncate text-detail font-medium text-ink-100">{s.name}</span>
                            <Badge tone={ROLE_TONE[s.role]}>{s.role}</Badge>
                          </div>
                        </div>
                      </td>
                      {row.map((sh, i) => (
                        <td key={i} className={cn("px-2 py-2.5 text-center", WEEK_DATES[i] === TODAY && "bg-gold-400/[0.04]")}>
                          {sh ? (
                            <div className="mx-auto w-fit rounded-md border border-ink-700 bg-ink-900/60 px-2 py-1">
                              <span className="block stat-mono text-micro text-ink-100">{sh.start}–{sh.end}</span>
                              <span className="block text-micro text-ink-500">{locationName(sh.locationId)}</span>
                            </div>
                          ) : (
                            <span className="text-ink-700">·</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Day detail + coverage */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          {/* The day switcher shares this row with the title only once there is
              room for both. At 390px seven labels and a heading cannot fit on
              one line, so the header stacks and the switcher gets the full
              width; it stays scrollable below that as a floor. */}
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Day detail</CardTitle>
            <div className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {WEEK_DATES.map((d, i) => (
                <button
                  key={d}
                  onClick={() => setSelectedDate(d)}
                  className={cn(
                    "shrink-0 rounded-control px-2 py-1 text-detail font-medium transition-colors",
                    selectedDate === d ? "bg-gold-400/15 text-gold-200" : "text-ink-400 hover:text-ink-100",
                  )}
                >
                  {WEEK_LABELS[i]}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {selectedShifts.length === 0 ? (
              <EmptyState title="No shifts scheduled for this day / location" />
            ) : (
              <div className="space-y-2">
                {selectedShifts.map((sh) => {
                  const member = staffMap[sh.staffId];
                  return (
                    <div key={sh.id} className="flex items-center gap-3 rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2">
                      <span className="w-24 shrink-0 stat-mono text-detail text-ink-300">{sh.start}–{sh.end}</span>
                      <span className="h-8 w-px bg-ink-800" />
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-body font-medium text-ink-100">{member?.name}</span>
                        <span className="text-micro text-ink-500">{member?.role}{member?.credentials ? ` · ${member.credentials}` : ""}</span>
                      </div>
                      <Badge tone="neutral"><MapPin className="h-3 w-3" /> {locationName(sh.locationId)}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-gold-400" /> Today&apos;s coverage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {locations.filter((l) => inLoc(l.id)).map((l) => {
              const onShift = todays.filter((s) => s.locationId === l.id);
              const provs = onShift.filter((s) => staffMap[s.staffId]?.role === "Medical").length;
              const apptCount = appts.filter((a) => a.locationId === l.id).length;
              const covered = apptCount === 0 || provs > 0;
              return (
                <div key={l.id} className="rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-body font-medium text-ink-100">{l.short}</span>
                    {covered ? (
                      <Badge tone="optimal"><CheckCircle2 className="h-3 w-3" /> Covered</Badge>
                    ) : (
                      <Badge tone="high"><AlertTriangle className="h-3 w-3" /> Gap</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-micro text-ink-500">
                    {onShift.length} on shift ({provs} provider) · {apptCount} appt(s)
                  </p>
                </div>
              );
            })}
            {gaps.length > 0 && (
              <p className="text-micro text-high">
                {gaps.length} appointment(s) at a location with no provider on shift — review staffing.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-micro text-ink-600">
        Demo schedule. Apex owns staff calendars natively — there is no external calendar to reconcile against. Times shown in clinic-local time.
      </p>
    </div>
  );
}
