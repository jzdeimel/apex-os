"use client";

import * as React from "react";
import { absolute } from "@/lib/utils";

/**
 * The desk clock.
 *
 * Every other surface in Apex reads a frozen instant — `NOW =
 * "2026-06-12T09:00:00"` — because the demo has to render identically on every
 * load and because `Date.now()` during render is what produced this codebase's
 * hydration bugs. That is the right call everywhere except here.
 *
 * A front desk is the one screen whose entire job is elapsed time. "Waiting 14
 * minutes" and "this visit has run 9 minutes over" are the numbers the person
 * at the counter is judged on, and against a frozen clock every one of them is
 * permanently zero — which is not a simplification, it is the feature missing.
 *
 * So this clock ANCHORS at the pinned instant and then advances in real time
 * from the moment the board mounts. One clock, not two: the NOW line, the wait
 * timers and the room timers all read it.
 *
 * HYDRATION. `useDeskNow` returns the pinned string on the server and on the
 * first client render — byte-identical markup — and only starts ticking inside
 * an effect. There is no `Date.now()` in any render path.
 *
 * THE NUDGE. The seeded day runs 09:30 → 17:30 and the pinned clock sits at
 * 09:00, so a viewer who does not wait forty minutes never sees the board do
 * anything. `nudgeDeskClock` moves the anchor forward. It is labelled as a demo
 * control in the UI because that is exactly what it is — it changes what time
 * the board thinks it is, and it changes nothing about the data.
 */

export const DESK_PINNED_NOW = "2026-06-12T09:00:00";

const PINNED_MS = absolute(DESK_PINNED_NOW).getTime();

/**
 * Real wall-clock reading at the moment the first board mounted.
 *
 * Module scope, so navigating between /desk and /desk/book does not restart the
 * clock at 09:00 and wipe out a wait timer the user was watching.
 */
let anchorRealMs: number | null = null;

/** Manual offset applied by the demo nudge, in milliseconds. */
let nudgeMs = 0;

const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

/** Local ISO with no zone, matching every other timestamp in the codebase. */
function isoLocal(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19);
}

/** The current desk time. Safe to call outside render (event handlers, effects). */
export function deskNowIso(): string {
  if (anchorRealMs === null) return isoLocal(PINNED_MS + nudgeMs);
  return isoLocal(PINNED_MS + nudgeMs + (Date.now() - anchorRealMs));
}

export function nudgeDeskClock(minutes: number) {
  nudgeMs += minutes * 60_000;
  notify();
}

export function resetDeskClock() {
  nudgeMs = 0;
  notify();
}

/** True once the viewer has pushed the clock off its anchor. */
export function deskClockNudged(): boolean {
  return nudgeMs !== 0;
}

/**
 * Subscribe to the ticking desk clock.
 *
 * Returns the pinned instant until mounted, then a value that advances once a
 * second. One interval per subscriber is fine here — a front desk board has a
 * handful of consumers, not hundreds.
 */
export function useDeskNow(): string {
  const [now, setNow] = React.useState(DESK_PINNED_NOW);

  React.useEffect(() => {
    if (anchorRealMs === null) anchorRealMs = Date.now();
    const tick = () => setNow(deskNowIso());
    tick();
    const timer = window.setInterval(tick, 1000);
    listeners.add(tick);
    return () => {
      window.clearInterval(timer);
      listeners.delete(tick);
    };
  }, []);

  return now;
}

// ---------------------------------------------------------------------------
// Duration helpers
// ---------------------------------------------------------------------------

/** Whole minutes from `a` to `b`. Negative when `b` is earlier. */
export function minutesBetween(a: string, b: string): number {
  return Math.floor((absolute(b).getTime() - absolute(a).getTime()) / 60_000);
}

/**
 * A duration a person reads at a glance, standing up.
 *
 * Minutes up to an hour, then h:mm. Never "0 minutes" — the moment somebody
 * checks in, the honest reading is "just now", not a zero that looks broken.
 */
export function duration(mins: number): string {
  const m = Math.max(0, mins);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** "09:30" from a pinned ISO, without dragging in a locale formatter. */
export function hhmm(iso: string): string {
  return iso.slice(11, 16);
}
