import type { Client } from "@/lib/types";
import { getClient } from "@/lib/mock/clients";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { getLabsForClient } from "@/lib/mock/labs";
import { consultsForClient } from "@/lib/mock/consults";
import { buildPlanOfCare } from "@/lib/planOfCare/engine";
import { ringHistory } from "@/lib/daily/today";
import { seededRandom, clamp } from "@/lib/utils";

/**
 * The behaviour ledger behind levels and quests.
 *
 * Everything in this file answers one question: **what did the member actually
 * do?** Not what happened to their body, not what their provider prescribed —
 * what they showed up and did. That distinction is the whole reason this module
 * exists separately from `alphaScore` or `bodyscans`.
 *
 * ── The three rules, made concrete in data ────────────────────────────────
 *
 *  1. **Nothing here counts doses.** There is no `dosesTaken` field and there
 *     will not be one. A number that goes up when you inject more is a number
 *     that eventually persuades somebody to inject more. Adherence is captured
 *     as *days closed*, which is capped at one per day by construction — you
 *     cannot grind it.
 *
 *  2. **`protectedDays` is counted, never subtracted.** A provider hold, a
 *     washout, a logged illness — those are days the member did the right
 *     thing. They earn the same credit as a closed day. See `PROTECTED_REASONS`
 *     in `lib/daily/today.ts`; this module honours the same principle rather
 *     than re-deriving it.
 *
 *  3. **No field in here is comparable across members.** Everything is a count
 *     of one person's own history. There is no percentile, no rank, no cohort
 *     position, and no export shaped like one.
 *
 * Outcome metrics — weight, body fat, testosterone, Alpha Score — are
 * deliberately absent. A member controls whether they log breakfast. They do
 * not control what their thyroid does about it, and scoring them on it is both
 * unfair and clinically corrosive.
 */

/** Pinned demo clock. Never `new Date()` with no argument — it breaks SSR. */
const NOW = "2026-06-12T09:00:00";
const NOW_MS = new Date(NOW).getTime();
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Week keys
// ---------------------------------------------------------------------------

/**
 * ISO-ish week key, e.g. "2026-W24".
 *
 * Quests reset weekly, so the week key is the seed for every weekly number in
 * this file. Same member + same week always yields the same board — which is
 * what makes a screenshot of the portal reproducible.
 */
export function weekIsoFor(dateIso: string = NOW): string {
  const d = new Date(dateIso.slice(0, 10) + "T00:00:00");
  // Thursday of the current week determines the ISO year.
  const day = (d.getDay() + 6) % 7; // Mon = 0
  const thursday = new Date(d.getTime() + (3 - day) * DAY_MS);
  const jan1 = new Date(`${thursday.getFullYear()}-01-01T00:00:00`);
  const week = Math.floor((thursday.getTime() - jan1.getTime()) / (7 * DAY_MS)) + 1;
  return `${thursday.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

export const CURRENT_WEEK = weekIsoFor(NOW);

// ---------------------------------------------------------------------------
// Lifetime behaviour
// ---------------------------------------------------------------------------

export interface BehaviourLog {
  clientId: string;
  /** Days every ring closed. Capped at one per day — cannot be ground. */
  ringsClosed: number;
  /** Days held for a provider-directed reason. Credited, never deducted. */
  protectedDays: number;
  consultsAttended: number;
  checkInsLogged: number;
  labsCompleted: number;
  scansCompleted: number;
  currentStreak: number;
  bestStreak: number;
  daysEnrolled: number;
  joinedOn: string;
  firstScanOn?: string;
  firstLabOn?: string;
}

/**
 * Lifetime counts, derived from the real mock record wherever one exists.
 *
 * Consults, labs and scans are read straight off the fixtures rather than
 * invented, so a member who has three scans on their chart has three scans
 * here. Only the day-by-day adherence history is extrapolated — and it is
 * extrapolated from the member's own 28-day `ringHistory` rate, not a constant.
 */
export function behaviourFor(clientId: string): BehaviourLog | null {
  const client = getClient(clientId);
  if (!client) return null;
  return computeBehaviour(client);
}

function computeBehaviour(client: Client): BehaviourLog {
  const rand = seededRandom(`${client.id}-play-lifetime`);

  const joined = new Date(client.joinedOn + "T00:00:00").getTime();
  const daysEnrolled = Math.max(1, Math.round((NOW_MS - joined) / DAY_MS));

  // Observed 28-day rate, projected across the whole enrolment. Members who
  // are consistent now read as having been consistent — which is the honest
  // reading of the only evidence the demo actually has.
  const recent = ringHistory(client, 28);
  const closedRate = recent.filter((d) => d.closed).length / recent.length;
  const heldRate = recent.filter((d) => d.protectedDay).length / recent.length;

  const scan = getScanForClient(client.id);
  const labs = getLabsForClient(client.id);
  const consults = consultsForClient(client.id);

  // A ramp-up factor: nobody is perfect in week one, so early days are
  // discounted rather than credited at today's rate.
  const rampedDays = daysEnrolled <= 30 ? daysEnrolled * 0.7 : daysEnrolled - 9;

  const ringsClosed = Math.round(rampedDays * closedRate);
  const protectedDays = Math.round(rampedDays * heldRate);

  // Streaks come from the daily engine's own history so the number the member
  // sees on the rings screen and the number on their level card agree.
  const tail = [...recent].reverse();
  let currentStreak = 0;
  for (const d of tail) {
    if (d.closed || d.protectedDay) currentStreak++;
    else break;
  }
  let run = 0;
  let bestStreak = 0;
  for (const d of recent) {
    if (d.closed || d.protectedDay) {
      run++;
      bestStreak = Math.max(bestStreak, run);
    } else run = 0;
  }
  // The 28-day window can only ever show 28; older personal bests are plausible
  // for long-tenured members and are seeded, not observed.
  if (daysEnrolled > 60) bestStreak = Math.max(bestStreak, bestStreak + Math.floor(rand() * 12));

  return {
    clientId: client.id,
    ringsClosed,
    protectedDays,
    consultsAttended: consults.length,
    // Check-ins are the lighter-weight log: roughly weekly for engaged members.
    checkInsLogged: Math.round((daysEnrolled / 7) * (0.45 + closedRate * 0.5)),
    labsCompleted: labs ? 1 + Math.floor(daysEnrolled / 120) : 0,
    scansCompleted: scan?.history?.length ?? 0,
    currentStreak,
    bestStreak,
    daysEnrolled,
    joinedOn: client.joinedOn,
    firstScanOn: scan?.history?.[0]?.date,
    firstLabOn: labs?.collectedOn,
  };
}

// ---------------------------------------------------------------------------
// This week
// ---------------------------------------------------------------------------

export interface WeekBehaviour {
  weekIso: string;
  /** Sessions logged against the member's own split — not a global target. */
  trainingSessions: number;
  trainingTarget: number;
  proteinDays: number;
  weightLogs: number;
  sleepLogs: number;
  mealsLogged: number;
  stepDays: number;
  daysClosed: number;
  protectedDays: number;
  /** True once the member has actually booked the thing. */
  labsBooked: boolean;
  scanBooked: boolean;
  checkInBooked: boolean;
  /** Days since the last panel — drives whether "book labs" is even relevant. */
  daysSinceLabs: number;
}

export function weekBehaviourFor(
  clientId: string,
  weekIso: string = CURRENT_WEEK,
): WeekBehaviour | null {
  const client = getClient(clientId);
  if (!client) return null;

  const rand = seededRandom(`${client.id}-play-${weekIso}`);
  const plan = buildPlanOfCare(client);

  // The training target is the member's *own* prescribed split. Handing every
  // member the same "train 5x" would be a target somebody's plan contradicts.
  const trainingTarget = clamp(
    plan.trainingSplit.filter((b) => !/rest/i.test(b.focus)).length,
    2,
    6,
  );

  const last7 = ringHistory(client, 7);
  const daysClosed = last7.filter((d) => d.closed).length;
  const protectedDays = last7.filter((d) => d.protectedDay).length;

  const labDate = client.latestLabDate;
  const daysSinceLabs = labDate
    ? Math.round((NOW_MS - new Date(labDate + "T00:00:00").getTime()) / DAY_MS)
    : 999;

  return {
    weekIso,
    trainingSessions: clamp(Math.round(daysClosed * 0.7 + rand() * 1.6), 0, trainingTarget),
    trainingTarget,
    proteinDays: clamp(daysClosed - (rand() < 0.4 ? 1 : 0), 0, 7),
    weightLogs: clamp(Math.floor(rand() * 4) + (daysClosed > 4 ? 1 : 0), 0, 7),
    sleepLogs: clamp(Math.floor(rand() * 6), 0, 7),
    mealsLogged: clamp(Math.round(daysClosed * 2 + rand() * 4), 0, 21),
    stepDays: clamp(Math.round(daysClosed * 0.8 + rand()), 0, 7),
    daysClosed,
    protectedDays,
    labsBooked: daysSinceLabs < 75 || rand() < 0.35,
    scanBooked: rand() < 0.4,
    checkInBooked: Boolean(client.nextAppointment) || rand() < 0.3,
    daysSinceLabs,
  };
}
