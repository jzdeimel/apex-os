"use client";

import * as React from "react";
import { Clock3, DoorOpen, RotateCcw, Users } from "lucide-react";
import type { DeskDay } from "@/lib/frontdesk/day";
import { duration, hhmm, nudgeDeskClock, resetDeskClock } from "@/lib/frontdesk/clock";
import { visitTypeMap } from "@/lib/booking/availability";
import { cn } from "@/lib/utils";

/**
 * The three numbers a front desk is asked for all day, plus the clock.
 *
 * "Is anyone waiting", "which rooms are going", "who is next". Nothing else
 * belongs up here — every extra tile is an appointment row pushed below the
 * fold, and the board is the point of the page.
 *
 * The waiting figure turns red past fifteen minutes rather than at some
 * arbitrary threshold: fifteen is the number Alpha Health's members would
 * describe as "kept waiting", and a colour that changes at a number nobody
 * recognises trains people to ignore the colour.
 */

function Tile({
  label,
  value,
  hint,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  hint: string;
  tone?: "neutral" | "watch" | "high" | "low" | "optimal";
  icon: React.ElementType;
}) {
  const toneText = {
    neutral: "text-ink-50",
    watch: "text-watch",
    high: "text-high",
    low: "text-low",
    optimal: "text-optimal",
  }[tone];

  return (
    <div className="min-w-0 px-3 py-2.5">
      <p className="label-eyebrow flex items-center gap-1.5 truncate">
        <Icon className="h-2.5 w-2.5 shrink-0" />
        {label}
      </p>
      <p className={cn("stat-mono mt-1 truncate text-title font-semibold leading-none", toneText)}>
        {value}
      </p>
      <p className="mt-1.5 truncate text-micro leading-tight text-ink-500" title={hint}>
        {hint}
      </p>
    </div>
  );
}

export function DeskClockStrip({ day, now }: { day: DeskDay; now: string }) {
  const next = day.nextArrival;
  const nextIn = day.nextArrivalInMin;

  const waitTone = day.longestWaitMin >= 15 ? "high" : day.waitingCount > 0 ? "watch" : "neutral";

  return (
    <div className="space-y-1.5">
      <div className="card grid grid-cols-1 divide-y divide-ink-800/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Tile
          label="Waiting"
          value={day.waitingCount}
          tone={waitTone}
          icon={Users}
          hint={
            day.waitingCount === 0
              ? "Nobody in reception"
              : `Longest wait ${duration(day.longestWaitMin)}`
          }
        />
        <Tile
          label="In a room"
          value={day.inRoomCount}
          tone={day.inRoomCount > 0 ? "low" : "neutral"}
          icon={DoorOpen}
          /* Named from the rows themselves, not from `occupiedRooms` — a
             telehealth visit is genuinely running and genuinely occupies no
             room, and reading the room map would have reported it as
             "not recorded" when nothing is missing. */
          hint={
            day.inRoomCount === 0
              ? "No visit running"
              : day.here
                  .filter((r) => r.state === "Roomed")
                  .map((r) => r.client?.firstName ?? r.appt.clientName)
                  .join(", ")
          }
        />
        <Tile
          label="Next arrival"
          value={next ? hhmm(next.appt.start) : "—"}
          tone={nextIn !== null && nextIn < 0 ? "watch" : "neutral"}
          icon={Clock3}
          hint={
            !next
              ? "Nothing else booked today"
              : `${next.client?.firstName ?? next.appt.clientName} · ${
                  visitTypeMap[next.appt.type]?.label ?? next.appt.type
                }${
                  nextIn === null
                    ? ""
                    : nextIn < 0
                      ? ` · ${duration(-nextIn)} late`
                      : ` · in ${duration(nextIn)}`
                }`
          }
        />
      </div>

      {/*
        The demo clock.

        Apex is pinned to 09:00 on 12 June 2026 so every surface renders
        identically on every load — see lib/utils.ts `absolute` for why that
        matters. The seeded day then runs 09:30 to 17:30, which means a viewer
        who never moves the clock never sees a wait timer count, a NOW line
        travel, or a visit run over. This control moves the clock and nothing
        else. It is labelled as a demo control because it is one: no button here
        touches a record, and the appointment times do not move.
      */}
      <div className="card flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="stat-mono text-heading font-semibold leading-none text-ink-50">
            {hhmm(now)}
          </span>
          <span className="truncate text-micro text-ink-500">Thu 12 Jun · clinic time</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-micro uppercase tracking-wide text-ink-600">Demo clock</span>
          {[15, 60].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => nudgeDeskClock(m)}
              className="rounded-control border border-ink-700 px-2 py-1 text-micro font-medium text-ink-300 transition-colors hover:border-ink-600 hover:text-ink-50 focus-ring"
            >
              +{m < 60 ? `${m}m` : `${m / 60}h`}
            </button>
          ))}
          <button
            type="button"
            onClick={resetDeskClock}
            title="Back to 09:00"
            className="rounded-control border border-ink-700 px-2 py-1 text-micro font-medium text-ink-400 transition-colors hover:border-ink-600 hover:text-ink-50 focus-ring"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
