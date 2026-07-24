import type { Client } from "@/lib/types";
import { buildPlanOfCare } from "@/lib/planOfCare/engine";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { seededRandom, absDay, absHour, absolute } from "@/lib/utils";

/**
 * The member's daily loop — the reason to open Apex every morning.
 *
 * Three rings, one screen: **Protocol · Fuel · Train.** Close all three and the
 * day counts toward the streak. That is the whole mechanic, and it is small on
 * purpose — a member who has to learn a system will not open it on day nine.
 *
 * ── Gamification that survives a compliance review ────────────────────────
 * Consumer fitness patterns do not transfer cleanly to a clinic. Three rules
 * shape everything below:
 *
 *  1. **No comparison to other members, ever.** No leaderboards, no percentile
 *     ranks, no "you're behind 60% of members." Two people's protocols are
 *     different medical situations; ranking them is both a PHI leak and a shame
 *     mechanic. Every comparison here is a member against their own baseline.
 *
 *  2. **Never punish someone for following medical advice.** If a provider
 *     pauses a protocol, the streak *holds* rather than breaks — see
 *     `PROTECTED_REASONS`. A system that costs a member their 60-day streak for
 *     doing exactly what their doctor said teaches them to hide it next time.
 *
 *  3. **Never gamify toward more medication.** Closing the Protocol ring means
 *     doing what was prescribed — no more. There is no bonus for extra doses
 *     and no penalty for a provider-directed hold. Adherence is the goal;
 *     escalation is a clinical decision, not a score.
 */

const NOW = "2026-06-12T09:00:00";
// Absolute so the 28-day window lands on the same days everywhere.
const NOW_MS = absolute(NOW).getTime();

export type RingId = "protocol" | "fuel" | "train";

export interface Ring {
  id: RingId;
  label: string;
  /** 0..1 */
  progress: number;
  done: number;
  target: number;
  unit: string;
  /** Accent hex for the arc. */
  hex: string;
  /** What closing this ring means today, in the member's language. */
  detail: string;
}

/** One thing to take today. Cadence and timing only — never an amount. */
export interface DoseSlot {
  id: string;
  name: string;
  /** "AM" | "Midday" | "PM" */
  timing: string;
  route: string;
  taken: boolean;
  /** Present when a provider has paused this item. */
  heldReason?: string;
}

export interface MealTarget {
  label: string;
  grams?: number;
  calories?: number;
  hit: boolean;
  hint: string;
}

export interface WorkoutToday {
  focus: string;
  detail: string;
  /** True on a scheduled rest day — closing the ring means resting. */
  isRest: boolean;
  completed: boolean;
}

export interface Streak {
  current: number;
  best: number;
  /** Days the streak was held rather than broken, for a protected reason. */
  protectedDays: number;
  /** True when today is already complete. */
  todayClosed: boolean;
}

export interface DailyPlan {
  clientId: string;
  date: string;
  greeting: string;
  rings: Ring[];
  doses: DoseSlot[];
  meals: { calories: number; protein: MealTarget; carbs: MealTarget; fat: MealTarget };
  workout: WorkoutToday;
  streak: Streak;
  /** One sentence: the single most useful thing to do today. */
  focus: string;
  /** Earned moments to celebrate. Kept rare so they still mean something. */
  wins: { label: string; detail: string; at: string }[];
}

/**
 * Reasons a missed day does NOT break the streak.
 *
 * Rule 2 above, made concrete. A provider hold, a scheduled washout, an illness
 * the coach recorded, or a lab-draw fasting day are all *correct* behaviour.
 */
export const PROTECTED_REASONS = [
  "Provider hold",
  "Scheduled washout",
  "Illness — logged with coach",
  "Fasting for labs",
  "Travel — coach approved",
] as const;

const RING_META: Record<RingId, { label: string; hex: string }> = {
  protocol: { label: "Protocol", hex: "var(--chart-brand)" },
  fuel: { label: "Fuel", hex: "var(--c-optimal)" },
  train: { label: "Train", hex: "var(--c-low)" },
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function greetingFor(firstName: string, hour: number): string {
  if (hour < 12) return `Good morning, ${firstName}`;
  if (hour < 17) return `Good afternoon, ${firstName}`;
  return `Good evening, ${firstName}`;
}

/**
 * Which protocol items land on today, derived from the plan's cadence.
 *
 * Deliberately no dose. The member sees what to take, when, and by what route;
 * the amount lives on the provider-signed prescription and is shown as a lock.
 */
function dosesForToday(client: Client, dayIndex: number, rand: () => number): DoseSlot[] {
  const plan = buildPlanOfCare(client);
  const timings = ["AM", "AM", "PM", "Midday"];

  return plan.protocol
    .slice(0, 4)
    .map((item, i) => {
      // A simple weekday pattern per item so the day genuinely varies.
      const everyDay = i === 0;
      const scheduled = everyDay || (dayIndex + i) % 2 === 0;
      const held = rand() < 0.08;

      return {
        id: item.id,
        name: item.modality ?? item.title,
        timing: timings[i % timings.length],
        route: routeFor(item.modality ?? item.title, item.category),
        taken: scheduled && !held && rand() < 0.72,
        heldReason: held ? "Provider hold — your provider paused this item" : undefined,
        _scheduled: scheduled,
      } as DoseSlot & { _scheduled: boolean };
    })
    .filter((d) => (d as DoseSlot & { _scheduled: boolean })._scheduled);
}

/**
 * Route for a protocol item.
 *
 * Not everything on a plan is injected. Coaching, nutrition and lifestyle items
 * are services — labelling them "SC injection" and hanging a dose lock off them
 * is worse than saying nothing, because it is confidently wrong on a screen a
 * member reads every morning.
 */
const SERVICE_RE = /coaching|nutrition|training|counsel|consult|sleep hygiene|therapy session|education/i;
const ORAL_RE = /oral|capsule|tablet|vitamin|magnesium|creatine/i;
const NASAL_RE = /nasal|spray/i;

export function routeFor(name: string, category?: string): string {
  if (SERVICE_RE.test(name)) return "Coaching session";
  if (NASAL_RE.test(name)) return "Nasal spray";
  if (ORAL_RE.test(name)) return "Oral";
  if (category?.includes("Hormone")) return "IM / SC injection";
  return "SC injection";
}

/** Only a prescribed, administered item has a dose to lock. */
export function hasDose(route: string): boolean {
  return route !== "Coaching session";
}

export function buildDailyPlan(client: Client, dateIso: string = NOW): DailyPlan {
  const rand = seededRandom(`${client.id}-daily-${dateIso.slice(0, 10)}`);
  // Absolute, not local. See lib/utils#absolute — reading these off a local
  // Date made the day's protocol items and the greeting differ between a UTC
  // server and the viewer's browser.
  const dayIndex = absDay(dateIso);
  const hour = absHour(dateIso);

  const plan = buildPlanOfCare(client);
  const macros = plan.macros!;
  const scan = getScanForClient(client.id);

  // ── Protocol ring ────────────────────────────────────────────────────────
  const doses = dosesForToday(client, dayIndex, rand);
  const active = doses.filter((d) => !d.heldReason);
  const takenCount = active.filter((d) => d.taken).length;
  const protocolProgress = active.length ? takenCount / active.length : 1;

  // ── Fuel ring ────────────────────────────────────────────────────────────
  const proteinHit = Math.round(macros.proteinG * (0.55 + rand() * 0.5));
  const carbsHit = Math.round(macros.carbsG * (0.5 + rand() * 0.55));
  const fatHit = Math.round(macros.fatG * (0.5 + rand() * 0.55));
  // Protein is what the ring actually tracks — it is the target that protects
  // lean mass in a deficit, and the one members most often miss.
  const fuelProgress = Math.min(1, proteinHit / macros.proteinG);

  // ── Train ring ───────────────────────────────────────────────────────────
  const block = plan.trainingSplit[dayIndex] ?? plan.trainingSplit[0];
  const isRest = /rest/i.test(block.focus);
  const trained = isRest ? true : rand() < 0.68;

  const rings: Ring[] = [
    {
      id: "protocol",
      ...RING_META.protocol,
      progress: protocolProgress,
      done: takenCount,
      target: active.length,
      unit: active.length === 1 ? "item" : "items",
      detail: active.length
        ? `Take what your provider prescribed — ${active.length} today.`
        : "Nothing scheduled today.",
    },
    {
      id: "fuel",
      ...RING_META.fuel,
      progress: fuelProgress,
      done: proteinHit,
      target: macros.proteinG,
      unit: "g protein",
      detail: `Hit protein first. Calories follow.`,
    },
    {
      id: "train",
      ...RING_META.train,
      progress: trained ? 1 : 0,
      done: trained ? 1 : 0,
      target: 1,
      unit: "session",
      detail: isRest ? "Rest day — closing this ring means actually resting." : block.focus,
    },
  ];

  // ── Streak ───────────────────────────────────────────────────────────────
  const todayClosed = rings.every((r) => r.progress >= 1);
  const current = 3 + Math.floor(rand() * 34);
  const streak: Streak = {
    current,
    best: current + Math.floor(rand() * 20),
    protectedDays: Math.floor(rand() * 3),
    todayClosed,
  };

  // ── Focus ────────────────────────────────────────────────────────────────
  const open = rings.filter((r) => r.progress < 1);
  const focus = !open.length
    ? "All three rings closed. That's the day — well done."
    : open[0].id === "fuel"
      ? `You're ${macros.proteinG - proteinHit}g of protein from closing Fuel.`
      : open[0].id === "protocol"
        ? `${active.length - takenCount} protocol item${active.length - takenCount === 1 ? "" : "s"} left today.`
        : isRest
          ? "Rest is the work today."
          : `Today is ${block.focus.toLowerCase()} — ${block.detail}`;

  // ── Wins — rare on purpose ───────────────────────────────────────────────
  const wins: DailyPlan["wins"] = [];
  if (streak.current > 0 && streak.current % 7 === 0) {
    wins.push({
      label: `${streak.current}-day streak`,
      detail: "Every ring, every day, for a full week.",
      at: dateIso,
    });
  }
  if (scan?.history && scan.history.length > 1) {
    const first = scan.history[0];
    const drop = first.bodyFatPct - scan.bodyFatPct;
    if (drop >= 2) {
      wins.push({
        label: `Down ${drop.toFixed(1)}% body fat`,
        detail: `Since your first scan on ${first.date}. Measured, not estimated.`,
        at: scan.scannedOn,
      });
    }
    const gain = scan.skeletalMuscleKg - first.skeletalMuscleKg;
    if (gain >= 0.8) {
      wins.push({
        label: `+${gain.toFixed(1)} kg lean mass`,
        detail: "You kept muscle while losing fat — that's the hard part.",
        at: scan.scannedOn,
      });
    }
  }

  return {
    clientId: client.id,
    date: dateIso,
    greeting: greetingFor(client.firstName, hour),
    rings,
    doses,
    meals: {
      calories: macros.calories,
      protein: {
        label: "Protein",
        grams: macros.proteinG,
        hit: proteinHit >= macros.proteinG,
        hint: "Anchor two meals at 40g+.",
      },
      carbs: {
        label: "Carbs",
        grams: macros.carbsG,
        hit: carbsHit >= macros.carbsG * 0.9,
        hint: "Most of these around training.",
      },
      fat: {
        label: "Fat",
        grams: macros.fatG,
        hit: fatHit >= macros.fatG * 0.9,
        hint: "Steady across the day.",
      },
    },
    workout: {
      focus: block.focus,
      detail: block.detail,
      isRest,
      completed: trained,
    },
    streak,
    focus,
    wins: wins.slice(0, 2),
  };
}

/** The last N days of ring completion — powers the streak calendar strip. */
export function ringHistory(
  client: Client,
  days = 28,
): { date: string; closed: boolean; protectedDay: boolean }[] {
  const rand = seededRandom(`${client.id}-ringhistory`);
  return Array.from({ length: days }, (_, i) => {
    const d = absolute(NOW_MS - (days - 1 - i) * 86_400_000);
    const roll = rand();
    return {
      date: d.toISOString().slice(0, 10),
      closed: roll > 0.26,
      // Rendered distinctly: a held day is not a failed day.
      protectedDay: roll > 0.2 && roll <= 0.26,
    };
  });
}

export { DAY_NAMES };
