import type { Client } from "@/lib/types";
import { getClient } from "@/lib/mock/clients";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { buildPlanOfCare } from "@/lib/planOfCare/engine";
import { behaviourFor } from "@/lib/mock/play";
import { streakFor } from "@/lib/play/streak";
import { clamp } from "@/lib/utils";

/**
 * The season arc — the long structure underneath the daily loop.
 *
 * A member's 12-week block **is** a season. That is the whole idea: rather than
 * bolting a made-up "season pass" onto a clinic, the arc is the plan of care
 * they already signed up for, told as a story with chapters. Which means the
 * chapters cannot be invented — they are the plan's real monitoring
 * checkpoints, straight out of `buildPlanOfCare(...).monitoring`. Week 6 is a
 * chapter because week 6 is a lab draw, not because six felt like a good number.
 *
 * ── The rules this file enforces ──────────────────────────────────────────
 *
 *  1. **Nothing in the arc is fabricated clinically.** Chapter weeks, owners and
 *     labels come from the monitoring schedule. This file supplies the member
 *     translation of each one and nothing else.
 *
 *  2. **The recap reports, it does not judge.** `seasonRecap` shows the
 *     member's own measured numbers and their own consistency. There is no
 *     grade, no score out of ten, and no comparison to another member — two
 *     people in the same season are two different medical situations.
 *
 *  3. **No loss framing about the body.** A season ending is a season ending.
 *     Their measured results are not a balance that "expires" if they don't
 *     re-up, and this module must never imply that. Streak jeopardy lives in
 *     `lib/play/streak.ts` and stays there.
 *
 *  4. **Nothing here is driven by dose.** Progress through a season is time and
 *     attendance. Taking more of anything cannot advance a chapter.
 */

/** Pinned demo clock. Never `new Date()` with no argument — it breaks SSR. */
const NOW = "2026-06-12T09:00:00";
const DAY_MS = 86_400_000;

/** A block is 12 weeks — the same duration `buildPlanOfCare` emits. */
export const SEASON_WEEKS = 12;
const SEASON_DAYS = SEASON_WEEKS * 7;

export type ChapterState = "done" | "current" | "ahead";

export interface SeasonChapter {
  id: string;
  /** The checkpoint label, unchanged from the plan. */
  title: string;
  /** Week within the block, 0-based as the plan states it. */
  week: number;
  /** Calendar date this chapter lands on. */
  on: string;
  /** Provider | Coach | Member — who owns the checkpoint. */
  owner: string;
  state: ChapterState;
  /** What it means, in the member's language rather than the chart's. */
  meaning: string;
}

export interface Season {
  number: number;
  name: string;
  startedOn: string;
  endsOn: string;
  /** Current week within the block, 1..12. */
  week: number;
  totalWeeks: number;
  /** 0..1 through the block. */
  progress: number;
  /** Days until the recap. 0 once the block is complete. */
  daysToRecap: number;
  chapters: SeasonChapter[];
  /** One line naming what this block is actually for. */
  premise: string;
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

/**
 * Season names are earnest and describe the work, not the member.
 *
 * "The Deficit", not "Bronze Warrior". These are adults paying real money for
 * medical care; a name that sounds like a battle pass makes the clinical parts
 * of the product read as unserious too.
 */
const GOAL_NAMES: { match: string; name: string; premise: string }[] = [
  {
    match: "Fat loss",
    name: "The Deficit",
    premise: "Twelve weeks of eating slightly under, with enough protein and training to keep what you built.",
  },
  {
    match: "Muscle gain",
    name: "The Build",
    premise: "Twelve weeks of adding load to four lifts and eating enough to pay for it.",
  },
  {
    match: "Energy",
    name: "The Reset",
    premise: "Twelve weeks of steadying sleep, training and protocol before anything else changes.",
  },
  {
    match: "Recovery",
    name: "The Rebuild",
    premise: "Twelve weeks of training you can actually recover from, so the next block can be harder.",
  },
  {
    match: "Sleep",
    name: "The Long Nights",
    premise: "Twelve weeks with sleep as the primary lever — most other markers follow it.",
  },
];

function nameFor(client: Client): { name: string; premise: string } {
  for (const g of GOAL_NAMES) {
    if (client.goals.some((goal) => goal.toLowerCase().includes(g.match.toLowerCase()))) {
      return { name: g.name, premise: g.premise };
    }
  }
  return {
    name: "The Baseline",
    premise: "Twelve weeks of establishing what normal looks like for you, measured rather than guessed.",
  };
}

// ---------------------------------------------------------------------------
// Chapter translation
// ---------------------------------------------------------------------------

/**
 * The member-language reading of each checkpoint.
 *
 * Keyed by the plan's week numbers so a new checkpoint in the engine surfaces
 * with a sensible fallback rather than silently disappearing from the arc.
 */
const CHAPTER_MEANING: Record<number, string> = {
  0: "Everything gets set and signed. Nothing on your plan is guesswork after this.",
  2: "The first honest check: is any of this actually fitting into your week?",
  4: "First real trend. Four weeks is the point where a change stops being noise.",
  6: "Blood is drawn again. This is where the plan gets evidence instead of opinion.",
  8: "Back on the scanner. Same device, same time of day — the number you can trust.",
  12: "The recap. What moved, what didn't, and what the next twelve weeks are for.",
};

function meaningFor(week: number, detail: string): string {
  return CHAPTER_MEANING[week] ?? detail;
}

// ---------------------------------------------------------------------------
// Season
// ---------------------------------------------------------------------------

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Which block the member is in, and where inside it.
 *
 * Anchored to `client.joinedOn` rather than the plan's `createdAt` — every plan
 * in the demo is generated at the pinned clock, so anchoring there would put
 * every member on week one forever. Enrolment date is the real start of a
 * member's first block and blocks run back to back from there.
 */
export function seasonFor(clientId: string, nowIso: string = NOW): Season | null {
  const client = getClient(clientId);
  if (!client) return null;

  const nowMs = new Date(nowIso).getTime();
  const joinedMs = new Date(client.joinedOn + "T00:00:00").getTime();
  const daysEnrolled = Math.max(0, Math.floor((nowMs - joinedMs) / DAY_MS));

  const number = Math.floor(daysEnrolled / SEASON_DAYS) + 1;
  const startMs = joinedMs + (number - 1) * SEASON_DAYS * DAY_MS;
  const dayInSeason = Math.floor((nowMs - startMs) / DAY_MS);
  const endMs = startMs + (SEASON_DAYS - 1) * DAY_MS;

  const week = clamp(Math.floor(dayInSeason / 7) + 1, 1, SEASON_WEEKS);
  const progress = clamp(dayInSeason / SEASON_DAYS, 0, 1);

  const plan = buildPlanOfCare(client);
  // Week index the member has actually reached, 0-based to match the plan.
  const weekIdx = week - 1;

  const checkpoints = [...plan.monitoring].sort((a, b) => a.week - b.week);
  // "Current" is the last checkpoint they have reached — the chapter they are
  // living in — not the next one coming. Members read the rail as "where am I",
  // and where they are is the checkpoint that already happened.
  let currentIdx = -1;
  checkpoints.forEach((c, i) => {
    if (c.week <= weekIdx) currentIdx = i;
  });

  const chapters: SeasonChapter[] = checkpoints.map((c, i) => ({
    id: `season-${number}-w${c.week}`,
    title: c.label,
    week: c.week,
    on: isoDay(startMs + c.week * 7 * DAY_MS),
    owner: c.owner,
    state: i < currentIdx ? "done" : i === currentIdx ? "current" : "ahead",
    meaning: meaningFor(c.week, c.detail),
  }));

  const { name, premise } = nameFor(client);

  return {
    number,
    name,
    startedOn: isoDay(startMs),
    endsOn: isoDay(endMs),
    week,
    totalWeeks: SEASON_WEEKS,
    progress,
    daysToRecap: Math.max(0, SEASON_DAYS - dayInSeason),
    chapters,
    premise,
  };
}

// ---------------------------------------------------------------------------
// Recap
// ---------------------------------------------------------------------------

export interface RecapChange {
  label: string;
  from: number;
  to: number;
  /** Signed delta, `to - from`. */
  delta: number;
  unit: string;
  /** Neutral note — what the number is and how it was taken. Never a verdict. */
  note: string;
}

export interface SeasonRecap {
  seasonNumber: number;
  name: string;
  startedOn: string;
  endsOn: string;
  /** True once the block is over; false while it is still running. */
  complete: boolean;
  weeksElapsed: number;
  /** One factual sentence to open with. */
  headline: string;
  /** Their own measured numbers, first scan of the block versus latest. */
  changes: RecapChange[];
  consistency: {
    daysClosed: number;
    daysHeld: number;
    bestStreak: number;
    /** Consults, check-ins, panels, scans — turning up counts. */
    appointmentsKept: number;
  };
  /** What the next block is built around, sourced from the current plan. */
  nextFocus: { title: string; detail: string }[];
}

/**
 * The end-of-season recap — the moment that decides whether somebody starts a
 * second block.
 *
 * It works because it is entirely factual: their measured composition, their
 * own attendance, and the plan's own next directives. No score, no grade, no
 * "you were in the top X%". If the numbers moved a little, it says a little.
 */
export function seasonRecap(clientId: string, nowIso: string = NOW): SeasonRecap | null {
  const client = getClient(clientId);
  const season = seasonFor(clientId, nowIso);
  if (!client || !season) return null;

  const scan = getScanForClient(client.id);
  const behaviour = behaviourFor(client.id);
  const streak = streakFor(client.id, nowIso);
  const plan = buildPlanOfCare(client);

  const startMs = new Date(season.startedOn + "T00:00:00").getTime();

  const changes: RecapChange[] = [];
  if (scan?.history && scan.history.length > 1) {
    // Only scans taken inside this block count toward this block's recap. If a
    // member has no in-block baseline, fall back to their first scan and the
    // note says so rather than the label quietly lying about the window.
    const inSeason = scan.history.filter((h) => new Date(h.date + "T00:00:00").getTime() >= startMs);
    const baseline = inSeason.length > 1 ? inSeason[0] : scan.history[0];
    const latest = scan.history[scan.history.length - 1];
    const scoped = inSeason.length > 1;
    const window = scoped ? "this block" : "your first scan";

    const add = (label: string, from: number, to: number, unit: string, note: string) => {
      const delta = Math.round((to - from) * 10) / 10;
      if (Math.abs(delta) < 0.1) return;
      changes.push({ label, from, to, delta, unit, note });
    };

    add("Body fat", baseline.bodyFatPct, latest.bodyFatPct, "%", `Measured on ${scan.device}, since ${window}.`);
    add(
      "Lean mass",
      baseline.skeletalMuscleKg,
      latest.skeletalMuscleKg,
      "kg",
      "Skeletal muscle — the number that says whether the deficit cost you anything.",
    );
    add("Weight", baseline.weightKg, latest.weightKg, "kg", "Same device, same conditions each time.");
  }

  const daysClosed = behaviour?.ringsClosed ?? 0;
  const daysHeld = behaviour?.protectedDays ?? 0;
  const appointmentsKept =
    (behaviour?.consultsAttended ?? 0) +
    (behaviour?.checkInsLogged ?? 0) +
    (behaviour?.labsCompleted ?? 0) +
    (behaviour?.scansCompleted ?? 0);

  // The next block's focus is the plan's own top nutrition and training
  // directives plus the week-12 checkpoint. Protocol is absent on purpose:
  // what happens to a prescription next block is a provider's decision, not a
  // recap screen's promise.
  const nextFocus = [
    ...plan.nutrition.slice(0, 1).map((i) => ({ title: i.title, detail: i.detail })),
    ...plan.training.slice(0, 1).map((i) => ({ title: i.title, detail: i.detail })),
    {
      title: "Provider review and re-plan",
      detail: "Your provider reviews the whole block and writes the next one. Any protocol change is theirs to make.",
    },
  ];

  const complete = season.daysToRecap === 0;
  const weeksElapsed = season.week;

  const headline = complete
    ? `Season ${season.number} is done — ${daysClosed + daysHeld} days on the board and ${changes.length} measured change${changes.length === 1 ? "" : "s"} to show for it.`
    : `You're ${weeksElapsed} week${weeksElapsed === 1 ? "" : "s"} into Season ${season.number}. Here's what the record says so far.`;

  return {
    seasonNumber: season.number,
    name: season.name,
    startedOn: season.startedOn,
    endsOn: season.endsOn,
    complete,
    weeksElapsed,
    headline,
    changes,
    consistency: {
      daysClosed,
      daysHeld,
      bestStreak: streak?.best ?? behaviour?.bestStreak ?? 0,
      appointmentsKept,
    },
    nextFocus,
  };
}
