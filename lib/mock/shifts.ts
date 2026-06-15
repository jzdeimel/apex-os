import type { LocationId } from "@/lib/types";
import { staff } from "@/lib/mock/staff";
import { seededRandom } from "@/lib/utils";

export interface Shift {
  id: string;
  staffId: string;
  date: string; // yyyy-mm-dd
  start: string; // "09:00"
  end: string; // "17:00"
  locationId: LocationId;
}

// Week of Mon 2026-06-08 → Sun 2026-06-14 (today = Fri 2026-06-12).
export const WEEK_DATES = [
  "2026-06-08",
  "2026-06-09",
  "2026-06-10",
  "2026-06-11",
  "2026-06-12",
  "2026-06-13",
  "2026-06-14",
];
export const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const TODAY = "2026-06-12";

const SHIFT_PRESETS = [
  { start: "08:00", end: "16:00" },
  { start: "09:00", end: "17:00" },
  { start: "10:00", end: "18:00" },
  { start: "07:30", end: "15:30" },
  { start: "11:00", end: "19:00" },
];

// Deterministically generate a realistic weekly roster.
export const shifts: Shift[] = (() => {
  const out: Shift[] = [];
  for (const s of staff) {
    const rand = seededRandom(s.id + "shift");
    const primaryLoc = s.locationIds[0];
    // Most staff: 4–5 weekdays; front desk + some coaches cover Saturday.
    for (let d = 0; d < WEEK_DATES.length; d++) {
      const isWeekend = d >= 5;
      const isSat = d === 5;
      let works = false;
      if (!isWeekend) {
        works = rand() > (s.role === "Operations" ? 0.15 : 0.2); // ~80% weekdays
      } else if (isSat) {
        works = s.role === "Front Desk" || (s.role === "Coach" && rand() > 0.55);
      } else {
        works = s.role === "Provider" && s.locationIds.includes("telehealth") && rand() > 0.7;
      }
      if (!works) continue;
      const preset = SHIFT_PRESETS[Math.floor(rand() * SHIFT_PRESETS.length)];
      // some staff split across two locations during the week
      const loc =
        s.locationIds.length > 1 && rand() > 0.65 ? s.locationIds[1] : primaryLoc;
      out.push({
        id: `sh-${s.id}-${d}`,
        staffId: s.id,
        date: WEEK_DATES[d],
        start: preset.start,
        end: preset.end,
        locationId: loc,
      });
    }
  }
  return out;
})();

export function shiftsForDate(date: string): Shift[] {
  return shifts
    .filter((s) => s.date === date)
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function shiftsForStaffInWeek(staffId: string): Record<string, Shift | undefined> {
  const map: Record<string, Shift | undefined> = {};
  for (const date of WEEK_DATES) {
    map[date] = shifts.find((s) => s.staffId === staffId && s.date === date);
  }
  return map;
}

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
export function shiftHours(s: Shift) {
  return (toMin(s.end) - toMin(s.start)) / 60;
}
