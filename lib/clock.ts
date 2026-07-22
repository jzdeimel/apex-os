import { IS_DEMO } from "@/lib/config";

/**
 * THE CLOCK.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * 52 files in this repo declare `const NOW = "2026-06-12T09:00:00"` and read the
 * present from it. That was right for a demo: a pinned clock makes a seeded
 * corpus coherent, so "due today" means something against fixtures that were
 * generated once. It is fatal for a system of record. A clinic that opens Apex
 * on 7 August and is told what is due on 12 June is not a clinic that can use
 * Apex, and a ledger row stamped with a fictional time is a false statement
 * about when a clinical action happened.
 *
 * So: real time by default, pinned time only when APEX_DEMO_MODE is explicitly
 * on. The same fail-safe direction as `lib/config.ts` — an unset or misspelt
 * variable yields production behaviour, because the failure we can afford is a
 * less coherent demo, not a clinic reading the wrong date.
 *
 * MIGRATION SHAPE
 * ---------------
 * Modules move one at a time: delete the local `const NOW`, import `nowIso()`,
 * re-run the timezone sweep. Do NOT do all 52 in one pass — most of them are
 * seeded-read modules whose fixtures are anchored to the demo date, and cutting
 * their clock loose before their data moves to Postgres produces a screen that
 * is technically live and semantically nonsense ("last visit: 14 months ago"
 * for every member). The order that works is: write paths first, then each read
 * path as its corpus migrates.
 *
 * TIMEZONES — READ BEFORE TOUCHING ANY DATE
 * -----------------------------------------
 * Azure containers run UTC; a developer laptop does not. That difference is
 * invisible locally and produced a hydration mismatch class of bug that cost a
 * full debug cycle. Two rules follow:
 *
 *   1. Anything persisted or compared is UTC ISO. `nowIso()` returns that.
 *   2. Anything DISPLAYED as a calendar day is rendered in the LOCATION's
 *      timezone, never the server's and never the browser's. A lab draw booked
 *      at 8am in Myrtle Beach is on that clinic's Tuesday regardless of where
 *      the request was served. Use `dayIn()`.
 */

/**
 * The pinned demo instant.
 *
 * Exported so the 52 modules still anchored to it can converge on ONE constant
 * while they migrate, instead of each carrying a private copy that can drift by
 * a character and produce two "todays" in one render.
 */
export const DEMO_NOW = "2026-06-12T09:00:00Z";

/**
 * The current instant as a UTC ISO string.
 *
 * This is the only sanctioned way to ask what time it is. `new Date()` scattered
 * through the codebase is how a pinned clock became 52 files in the first place.
 */
export function nowIso(): string {
  return IS_DEMO ? DEMO_NOW : new Date().toISOString();
}

/** The current instant as a Date. Same rules as `nowIso`. */
export function now(): Date {
  return new Date(nowIso());
}

/** Epoch milliseconds. For durations and sorting, never for display. */
export function nowMs(): number {
  return now().getTime();
}

/**
 * The calendar day at an instant, in a named timezone: "2026-08-07".
 *
 * Uses `en-CA` because it formats as ISO (YYYY-MM-DD) natively, which avoids a
 * hand-rolled pad-and-join that gets the month off by one exactly once.
 */
export function dayIn(timezone: string, instant: string | Date = now()): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Wall-clock time at an instant, in a named timezone: "14:35". */
export function timeIn(timezone: string, instant: string | Date = now()): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * Minutes between two instants. Positive when `b` is later.
 *
 * Exists so SLA and wait-time math stops being re-derived with three different
 * rounding behaviours in three different modules.
 */
export function minutesBetween(a: string | Date, b: string | Date): number {
  const start = typeof a === "string" ? new Date(a) : a;
  const end = typeof b === "string" ? new Date(b) : b;
  return Math.round((end.getTime() - start.getTime()) / 60000);
}
