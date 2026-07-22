"use client";

import type { ElementType } from "react";
import { AlertTriangle, Clock, DoorOpen, UserX } from "lucide-react";
import type { DeskDay, DeskRow } from "@/lib/frontdesk/day";
import { duration } from "@/lib/frontdesk/clock";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

interface DeskException {
  id: string;
  label: string;
  detail: string;
  tone: "high" | "watch" | "neutral";
  icon: ElementType;
}

function nameOf(row: DeskRow) {
  return row.client ? `${row.client.firstName} ${row.client.lastName}` : row.appt.clientName;
}

export function deskExceptions(day: DeskDay): DeskException[] {
  const out: DeskException[] = [];

  const longWait = day.here
    .filter((r) => r.state === "Arrived" && (r.waitingMin ?? 0) >= 15)
    .sort((a, b) => (b.waitingMin ?? 0) - (a.waitingMin ?? 0))[0];
  if (longWait) {
    out.push({
      id: `wait-${longWait.appt.id}`,
      label: "Longest wait",
      detail: `${nameOf(longWait)} has waited ${duration(longWait.waitingMin ?? 0)}.`,
      tone: (longWait.waitingMin ?? 0) >= 25 ? "high" : "watch",
      icon: Clock,
    });
  }

  const overrun = day.here
    .filter((r) => r.state === "Roomed" && (r.overrunMin ?? 0) > 2)
    .sort((a, b) => (b.overrunMin ?? 0) - (a.overrunMin ?? 0))[0];
  if (overrun) {
    out.push({
      id: `overrun-${overrun.appt.id}`,
      label: "Room overrun",
      detail: `${nameOf(overrun)} is ${overrun.overrunMin}m over the booked visit length.`,
      tone: (overrun.overrunMin ?? 0) >= 15 ? "high" : "watch",
      icon: DoorOpen,
    });
  }

  const late = day.upcoming
    .filter((r) => r.lateMin > 0)
    .sort((a, b) => b.lateMin - a.lateMin)[0];
  if (late) {
    out.push({
      id: `late-${late.appt.id}`,
      label: "Late arrival",
      detail: `${nameOf(late)} is ${duration(late.lateMin)} late. A quick call protects the visit slot.`,
      tone: late.lateMin >= 15 ? "high" : "watch",
      icon: UserX,
    });
  }

  const unknownArrival = day.here.find((r) => r.state === "Arrived" && !r.arrivalKnown);
  if (unknownArrival) {
    out.push({
      id: `unknown-${unknownArrival.appt.id}`,
      label: "Missing clock",
      detail: `${nameOf(unknownArrival)} is checked in, but no arrival time exists to count from.`,
      tone: "neutral",
      icon: AlertTriangle,
    });
  }

  return out.slice(0, 4);
}

export function DeskExceptionStrip({ day }: { day: DeskDay }) {
  const exceptions = deskExceptions(day);
  if (exceptions.length === 0) {
    return (
      <div className="rounded-lg border border-optimal/20 bg-optimal/[0.04] px-3.5 py-3">
        <div className="flex items-center gap-2">
          <Badge tone="optimal">Day flow clean</Badge>
          <p className="text-detail text-ink-400">No waits over 15m, no overrun rooms, no late arrival needing a call.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
      {exceptions.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.id}
            className={cn(
              "rounded-lg border bg-ink-900/45 p-3",
              item.tone === "high" && "border-high/35",
              item.tone === "watch" && "border-watch/35",
              item.tone === "neutral" && "border-ink-700",
            )}
          >
            <div className="flex items-center gap-2">
              <Icon
                className={cn(
                  "h-4 w-4",
                  item.tone === "high" && "text-high",
                  item.tone === "watch" && "text-watch",
                  item.tone === "neutral" && "text-ink-500",
                )}
              />
              <Badge tone={item.tone}>{item.label}</Badge>
            </div>
            <p className="mt-2 text-detail leading-snug text-ink-300">{item.detail}</p>
          </div>
        );
      })}
    </div>
  );
}
