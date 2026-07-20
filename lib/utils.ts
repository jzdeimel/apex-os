import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Every date in Apex renders in the clinic's timezone, not the viewer's.
 *
 * This is a correctness fix, not a preference. `toLocaleDateString` without an
 * explicit timeZone uses the HOST's zone — so a server rendering in UTC and a
 * browser in Eastern produced different strings for the same timestamp, and
 * React threw hydration errors (#418/#422/#425) on the deployed site. It never
 * appeared locally because the dev server and the browser shared a zone.
 *
 * Pinning also happens to be the right product behaviour: an appointment at
 * 9:30 in a Raleigh clinic is 9:30 to everyone, including a member reading it
 * from another state. Alpha Health's five locations are all Eastern.
 */
const CLINIC_TZ = "America/New_York";

/**
 * Parse one of Apex's pinned ISO strings as an ABSOLUTE instant.
 *
 * Every seeded timestamp in this codebase looks like "2026-06-12T09:00:00" —
 * no zone. `new Date()` reads that as LOCAL time, so `getDay()` and
 * `getHours()` return different answers on a UTC server than in an Eastern
 * browser. That is not cosmetic: it changes which protocol items land on
 * "today" and which greeting renders, so the server and client produce
 * genuinely different markup and React throws a hydration error.
 *
 * Appending Z pins the string to a single instant everywhere. Callers then use
 * the UTC getters below and get the same answer in every environment.
 */
export function absolute(iso: string | number | Date): Date {
  if (typeof iso === "number") return new Date(iso);
  if (iso instanceof Date) return iso;
  // Already carries a zone (trailing Z, +hh:mm or -hh:mm)? Trust it.
  return new Date(/[Z]|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`);
}

/** Weekday of a pinned timestamp, stable across environments. */
export function absDay(iso: string): number {
  return absolute(iso).getUTCDay();
}

/** Hour of a pinned timestamp, stable across environments. */
export function absHour(iso: string): number {
  return absolute(iso).getUTCHours();
}

/** YYYY-MM-DD of a pinned timestamp, stable across environments. */
export function absDate(iso: string | number): string {
  const d = typeof iso === "number" ? new Date(iso) : absolute(iso);
  return d.toISOString().slice(0, 10);
}
const CLINIC_LOCALE = "en-US";

export function formatDate(iso?: string) {
  if (!iso) return "—";
  const d = absolute(iso);
  return d.toLocaleDateString(CLINIC_LOCALE, {
    timeZone: CLINIC_TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateShort(iso?: string) {
  if (!iso) return "—";
  const d = absolute(iso);
  return d.toLocaleDateString(CLINIC_LOCALE, {
    timeZone: CLINIC_TZ,
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(iso?: string) {
  if (!iso) return "—";
  const d = absolute(iso);
  return d.toLocaleDateString(CLINIC_LOCALE, {
    timeZone: CLINIC_TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTime(iso?: string) {
  if (!iso) return "—";
  const d = absolute(iso);
  return d.toLocaleTimeString(CLINIC_LOCALE, {
    timeZone: CLINIC_TZ,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeDays(iso?: string): string {
  if (!iso) return "—";
  const now = absolute("2026-06-12T09:00:00");
  const then = absolute(iso);
  const diff = Math.round(
    (then.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0) return `${Math.abs(diff)}d ago`;
  return `in ${diff}d`;
}

export function currency(n: number, compact = false) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: compact ? "compact" : "standard",
  }).format(n);
}

export function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

/** Deterministic pseudo-random in [0,1) seeded by a string — no Math.random. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
