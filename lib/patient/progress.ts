export interface ProgressDay {
  date: string;
  protectedDay?: boolean;
}

export interface ProgressDose {
  date: string;
  retractedAt?: Date | null;
}

function shiftDate(date: string, offset: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

export function patientProgress(
  today: string,
  days: readonly ProgressDay[],
  doses: readonly ProgressDose[],
) {
  const activity = new Set<string>();
  for (const day of days) activity.add(day.date);
  for (const dose of doses) if (!dose.retractedAt) activity.add(dose.date);

  let cursor = activity.has(today) ? today : shiftDate(today, -1);
  let streak = 0;
  while (activity.has(cursor)) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }

  const sevenDays = Array.from({ length: 7 }, (_, index) =>
    shiftDate(today, -index),
  );
  const activeThisWeek = sevenDays.filter((date) => activity.has(date)).length;
  const total = activity.size;

  return {
    streak,
    totalActiveDays: total,
    activeThisWeek,
    level: Math.floor(total / 7) + 1,
    quests: [
      {
        id: "check-in-today",
        label: "Check in today",
        complete: activity.has(today),
        progress: activity.has(today) ? 1 : 0,
        goal: 1,
      },
      {
        id: "three-days",
        label: "Record three active days this week",
        complete: activeThisWeek >= 3,
        progress: Math.min(activeThisWeek, 3),
        goal: 3,
      },
      {
        id: "seven-days",
        label: "Build a seven-day rhythm",
        complete: streak >= 7,
        progress: Math.min(streak, 7),
        goal: 7,
      },
    ],
  };
}
