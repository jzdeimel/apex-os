/** A half-open interval: start inclusive, end exclusive. */
export interface MinuteWindow {
  startMin: number;
  endMin: number;
}

export interface WorkingRule extends MinuteWindow {
  staffId: string;
  locationId: string;
  weekday: number;
  timezone: string;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  active: boolean;
}

export interface BusyWindow extends MinuteWindow {
  source: "apex" | "external-calendar" | "time-off";
}

export interface CalendarBusyPort {
  /** Busy-only data. Implementations must not return titles or attendees. */
  busy(input: {
    staffId: string;
    from: string;
    to: string;
    timezone: string;
  }): Promise<Array<{ start: string; end: string }>>;
}

export function validateMinuteWindow(window: MinuteWindow): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(window.startMin) || !Number.isInteger(window.endMin)) {
    problems.push("Working-time boundaries must be whole minutes.");
  }
  if (window.startMin < 0 || window.endMin > 24 * 60) {
    problems.push("Working-time boundaries must stay inside one local day.");
  }
  if (window.endMin <= window.startMin) problems.push("Working time must end after it starts.");
  return problems;
}

/**
 * Subtract calendar/apex busy time from explicit working hours.
 *
 * Calendar absence is never availability: without a working-hours rule this
 * returns no windows. This prevents a newly connected empty calendar from
 * making someone look bookable 24 hours a day.
 */
export function freeWindows(
  working: readonly MinuteWindow[],
  busy: readonly MinuteWindow[],
): MinuteWindow[] {
  const base = working
    .filter((window) => validateMinuteWindow(window).length === 0)
    .map((window) => ({ ...window }))
    .sort((a, b) => a.startMin - b.startMin);
  if (!base.length) return [];

  const blocks = busy
    .filter((window) => validateMinuteWindow(window).length === 0)
    .map((window) => ({ ...window }))
    .sort((a, b) => a.startMin - b.startMin);
  const result: MinuteWindow[] = [];
  for (const shift of base) {
    let cursor = shift.startMin;
    for (const block of blocks) {
      if (block.endMin <= cursor || block.startMin >= shift.endMin) continue;
      if (block.startMin > cursor) {
        result.push({ startMin: cursor, endMin: Math.min(block.startMin, shift.endMin) });
      }
      cursor = Math.max(cursor, block.endMin);
      if (cursor >= shift.endMin) break;
    }
    if (cursor < shift.endMin) result.push({ startMin: cursor, endMin: shift.endMin });
  }
  return result.filter((window) => window.endMin > window.startMin);
}

export function rulesForDate(rules: readonly WorkingRule[], date: string, weekday: number) {
  return rules.filter(
    (rule) =>
      rule.active &&
      rule.weekday === weekday &&
      rule.effectiveFrom <= date &&
      (!rule.effectiveUntil || rule.effectiveUntil >= date),
  );
}
