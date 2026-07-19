import { getClient } from "@/lib/mock/clients";
import { buildDailyPlan, ringHistory, PROTECTED_REASONS, type Ring, type RingId } from "@/lib/daily/today";

/**
 * The streak economy.
 *
 * A streak is the only mechanic in this product that is allowed to carry any
 * sense of jeopardy, and this file is where that permission starts and stops.
 *
 * ── The four rules this file enforces ─────────────────────────────────────
 *
 *  1. **Loss framing is permitted about the STREAK and nowhere else.** "Your
 *     14-day streak ends tonight" is fair: the streak is a number the product
 *     invented, the member can see exactly what closes it, and losing it costs
 *     them nothing real. "You'll lose your progress" said about their body,
 *     their results or their money is manipulation dressed as motivation — a
 *     member's physiology is not a resource we are allowed to threaten them
 *     with, and their spend is a commercial relationship, not a streak. If you
 *     are writing copy against this module and the sentence would still make
 *     sense with "your body" or "your money" swapped in, delete it.
 *
 *  2. **Shields are earned, never sold.** One shield per 14 fully-closed days,
 *     two held at most. There is deliberately no purchase path, no "restore
 *     your streak for $4.99", and no ad-watch. This is a clinic; charging a
 *     member to un-break a habit metric we invented would be indefensible in
 *     front of a medical director, and it converts a behaviour tool into a
 *     slot machine with a card on file.
 *
 *  3. **A protected day costs nothing at all.** Provider holds, scheduled
 *     washouts, coach-logged illness, fasting for a draw and approved travel
 *     do not break the streak *and do not spend a shield* — see
 *     `PROTECTED_REASONS`, re-exported here so nothing downstream re-derives
 *     its own list. A member who is unwell, travelling, or told to stop must be
 *     able to step away without the product charging them for it.
 *
 *  4. **Nothing here rewards a dose or a health outcome.** The streak is made
 *     of closed rings — behaviours the member performs. Taking more than was
 *     prescribed cannot raise it, and a bad lab result cannot lower it.
 *
 * `daysUntilPersonalBest` is the number this module exists for. It is the most
 * motivating figure available to a member — it is entirely about them, it is
 * always small, and nobody shows it.
 */

/** Pinned demo clock. Never `new Date()` with no argument — it breaks SSR. */
const NOW = "2026-06-12T09:00:00";

/**
 * The window the ledger is reconstructed over.
 *
 * 28 days, matching `ringHistory`'s default and `lib/mock/play.ts`, so the
 * streak on this card and the streak on the level card are computed from the
 * same day record and can never disagree on screen.
 */
const WINDOW_DAYS = 28;

/** Fully-closed days that mint one shield. */
export const SHIELD_EVERY = 14;
/** Most shields a member may hold at once. Not purchasable — rule 2. */
export const SHIELD_CAP = 2;

export { PROTECTED_REASONS };
export type ProtectedReason = (typeof PROTECTED_REASONS)[number];

export interface StreakDay {
  date: string;
  closed: boolean;
  /** Held for a protected reason — rendered distinctly from a miss, always. */
  protectedDay: boolean;
  /** True when a shield absorbed this day's miss. */
  shielded: boolean;
  /** True when the streak actually ended here. */
  broke: boolean;
}

export interface Shield {
  id: string;
  /** The date the 14th closed day landed. */
  earnedOn: string;
  /** Set once it has been spent absorbing a miss. */
  spentOn?: string;
}

export interface StreakState {
  clientId: string;
  current: number;
  best: number;
  /** Days the streak was held rather than broken, for a protected reason. */
  protectedDays: number;
  /**
   * Days of closing required to stand on a new personal best. 0 when they are
   * already there. This is the headline number — never a comparison to anyone.
   */
  daysUntilPersonalBest: number;
  /** True when `current` already equals or exceeds `best`. */
  atPersonalBest: boolean;
  todayClosed: boolean;
  /** Unspent shields, most recently earned last. Never more than SHIELD_CAP. */
  shieldsHeld: Shield[];
  /** Shields this window spent absorbing a miss, newest first. */
  shieldsSpent: Shield[];
  /** Closed days banked toward the next shield, 0..SHIELD_EVERY. */
  closedTowardNextShield: number;
  /** Closed days still needed. `null` when they are already at the cap. */
  daysToNextShield: number | null;
  /** The reconstructed day-by-day ledger, oldest first. */
  history: StreakDay[];
}

/**
 * Rebuild the streak ledger from the member's own ring history.
 *
 * Deliberately a *replay* rather than a stored counter: shields are earned and
 * spent as the days go past, so the same history always produces the same
 * shield balance and a reviewer can point at the exact day a shield was used.
 */
export function streakFor(clientId: string, nowIso: string = NOW): StreakState | null {
  const client = getClient(clientId);
  if (!client) return null;

  const raw = ringHistory(client, WINDOW_DAYS);

  const held: Shield[] = [];
  const spent: Shield[] = [];
  const history: StreakDay[] = [];

  let run = 0;
  let best = 0;
  let protectedDays = 0;
  let closedTowardNextShield = 0;
  let minted = 0;

  for (const day of raw) {
    let shielded = false;
    let broke = false;

    if (day.protectedDay) {
      // Rule 3. Held days extend the streak and spend nothing. A member who
      // followed medical advice has not missed anything.
      protectedDays++;
      run++;
    } else if (day.closed) {
      run++;
      closedTowardNextShield++;
      if (closedTowardNextShield >= SHIELD_EVERY) {
        closedTowardNextShield = 0;
        // At the cap the consistency is simply acknowledged, not banked. A
        // stockpile of shields is a licence to coast, which is the opposite of
        // what the mechanic is for.
        if (held.length < SHIELD_CAP) {
          minted++;
          held.push({ id: `sh-${clientId}-${minted}`, earnedOn: day.date });
        }
      }
    } else {
      // A genuine miss. Spend a shield if one is held; otherwise the streak
      // ends here — and that is the only loss this product is allowed to name.
      const shield = held.shift();
      if (shield) {
        shield.spentOn = day.date;
        spent.unshift(shield);
        shielded = true;
        run++;
      } else {
        broke = true;
        run = 0;
        closedTowardNextShield = 0;
      }
    }

    best = Math.max(best, run);
    history.push({ date: day.date, closed: day.closed, protectedDay: day.protectedDay, shielded, broke });
  }

  const plan = buildDailyPlan(client, nowIso);

  // The 28-day window can only ever observe 28 days. A long-tenured member's
  // personal best usually predates it, so the daily engine's figure wins when
  // it is larger — the member should never see their record shrink because we
  // narrowed a lookback.
  const bestOverall = Math.max(best, plan.streak.best, run);
  const current = run;
  const atPersonalBest = current >= bestOverall;

  return {
    clientId,
    current,
    best: bestOverall,
    protectedDays,
    // +1 because matching the record is not beating it.
    daysUntilPersonalBest: atPersonalBest ? 0 : bestOverall - current + 1,
    atPersonalBest,
    todayClosed: plan.streak.todayClosed,
    shieldsHeld: held,
    shieldsSpent: spent,
    closedTowardNextShield,
    daysToNextShield: held.length >= SHIELD_CAP ? null : SHIELD_EVERY - closedTowardNextShield,
    history,
  };
}

// ---------------------------------------------------------------------------
// Same-day risk
// ---------------------------------------------------------------------------

export interface OpenRing {
  id: RingId;
  label: string;
  /** What is literally left, e.g. 46 g protein. */
  remaining: number;
  unit: string;
  /** The ring's own one-line instruction, unchanged. */
  detail: string;
  hex: string;
}

export interface RiskState {
  clientId: string;
  atRisk: boolean;
  todayClosed: boolean;
  /**
   * Set when today is already protected — a provider hold on the member's
   * protocol. When this is set, `atRisk` is false no matter what is open.
   */
  protectedReason?: string;
  openRings: OpenRing[];
  /** A shield is held and would absorb tonight automatically. */
  shieldWillCover: boolean;
  shieldsHeld: number;
  /** Whole hours left in the day on the pinned clock. */
  hoursLeft: number;
  /** The current streak, so a nudge never has to re-fetch. */
  current: number;
  /**
   * Nudge copy. Phrased as an invitation to finish, not a threat — and about
   * the streak only. Rule 1.
   */
  invitation: string;
}

/**
 * Is the streak in danger right now, and what specifically is still open.
 *
 * This is the whole basis of a same-day nudge. It returns the *specific* open
 * item rather than a generic warning, because "46 g of protein" is an action
 * and "don't lose your streak!" is just anxiety.
 */
export function atRiskToday(clientId: string, nowIso: string = NOW): RiskState | null {
  const client = getClient(clientId);
  if (!client) return null;

  const plan = buildDailyPlan(client, nowIso);
  const state = streakFor(clientId, nowIso);
  if (!state) return null;

  // A provider hold on today's protocol makes today a protected day. The
  // streak is not at risk; there is nothing to nudge about.
  const heldDose = plan.doses.find((d) => d.heldReason);
  const protectedReason = heldDose ? PROTECTED_REASONS[0] : undefined;

  const openRings: OpenRing[] = plan.rings
    .filter((r: Ring) => r.progress < 1)
    .map((r) => ({
      id: r.id,
      label: r.label,
      remaining: Math.max(0, r.target - r.done),
      unit: r.unit,
      detail: r.detail,
      hex: r.hex,
    }));

  const hoursLeft = Math.max(0, 24 - new Date(nowIso).getHours());
  const shieldsHeld = state.shieldsHeld.length;
  const atRisk = !protectedReason && openRings.length > 0;

  return {
    clientId,
    atRisk,
    todayClosed: plan.streak.todayClosed,
    protectedReason,
    openRings,
    shieldWillCover: atRisk && shieldsHeld > 0,
    shieldsHeld,
    hoursLeft,
    current: state.current,
    invitation: invitationFor(openRings, protectedReason, plan.streak.todayClosed, shieldsHeld),
  };
}

/** How to say it. Warm, specific, and about the streak — never about the body. */
function invitationFor(
  open: OpenRing[],
  protectedReason: string | undefined,
  todayClosed: boolean,
  shieldsHeld: number,
): string {
  if (protectedReason) {
    return "Today is held — your provider paused an item. Your streak carries, and no shield is spent for it.";
  }
  if (todayClosed || !open.length) {
    return "All three closed. Today is on the board.";
  }

  const phrase = (r: OpenRing) => {
    if (r.id === "fuel") return `${r.remaining} ${r.unit}`;
    if (r.id === "train") return "today's session";
    return `${r.remaining} protocol item${r.remaining === 1 ? "" : "s"}`;
  };

  const list =
    open.length === 1
      ? phrase(open[0])
      : open.length === 2
        ? `${phrase(open[0])} and ${phrase(open[1])}`
        : `${open.slice(0, -1).map(phrase).join(", ")} and ${phrase(open[open.length - 1])}`;

  const lead = `${list} left to close the day.`;

  // The cushion is stated up front so nobody finishes a workout at 11pm out of
  // fear. If a shield is going to catch it, they deserve to know before, not
  // after.
  if (shieldsHeld > 0) {
    return `${lead} If today doesn't happen, a shield covers it automatically — no action needed.`;
  }
  return `${lead} Finish one and you're most of the way there.`;
}

/**
 * One line for the shield state — used on the card and safe to reuse in a
 * notification. Explains how the next one is earned, because an unexplained
 * currency is a currency members assume they can buy.
 */
export function shieldExplainer(state: StreakState): string {
  if (state.shieldsHeld.length >= SHIELD_CAP) {
    return `Both shields ready. You hold at most ${SHIELD_CAP} — they're earned by closing days, never bought.`;
  }
  const need = state.daysToNextShield ?? SHIELD_EVERY;
  return `${need} more closed day${need === 1 ? "" : "s"} earns your next shield. Earned only — there's no way to buy one.`;
}
