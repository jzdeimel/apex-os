import { behaviourFor, type BehaviourLog } from "@/lib/mock/play";

/**
 * Levels — earned by showing up, and only by showing up.
 *
 * ── The three rules this file enforces ────────────────────────────────────
 *
 *  1. **XP never comes from a dose or from a health outcome.** Look at
 *     `XP_WEIGHTS`: every entry is an action a member takes with their own
 *     hands — closing a day, attending a consult, logging a check-in, getting
 *     the panel drawn, standing on the scanner. There is no weight for pounds
 *     lost, no weight for testosterone, no weight for Alpha Score, and no
 *     weight for milligrams. A level that rises when your labs improve is a
 *     level that falls when your labs don't, and punishing someone for their
 *     own biology is not a feature.
 *
 *  2. **A protected day earns full XP.** `protectedDays` is weighted
 *     identically to `ringsClosed` — see `XP_WEIGHTS.protectedDays`. A provider
 *     hold is the member doing exactly what they were told. Costing them
 *     progress for it teaches them to hide the next one from their coach, and
 *     that is a clinical safety problem, not a UX one.
 *
 *  3. **There is no comparison to anybody else.** No `rank`, no percentile, no
 *     "top 10% of members". The only comparison this module can express is a
 *     member against their own past — `nextMilestone` is a distance to their
 *     own next threshold.
 *
 * Tone: the ladder is named for a men's health clinic where the members are
 * adults paying real money. "Baseline → Cornerstone", not "Bronze Warrior".
 */

export interface LevelDef {
  level: number;
  name: string;
  /** Cumulative XP at which this level begins. */
  at: number;
  /** One line the member reads when they reach it. Earnest, not congratulatory. */
  blurb: string;
}

/**
 * Eight rungs. The gaps widen deliberately — early levels arrive fast enough to
 * confirm the loop works, later ones take a genuine quarter of consistency so
 * the top of the ladder still means something twelve months in.
 */
export const LEVELS: LevelDef[] = [
  { level: 1, name: "Baseline", at: 0, blurb: "Enrolled and measured. Everything from here is compared to this." },
  { level: 2, name: "Foundation", at: 250, blurb: "The habits are in place. Now they get boring, which is the point." },
  { level: 3, name: "Momentum", at: 700, blurb: "You are showing up without deciding to. That is the hard part done." },
  { level: 4, name: "Consistency", at: 1400, blurb: "Months, not weeks. Your record is starting to say something." },
  { level: 5, name: "Discipline", at: 2400, blurb: "You hold the line on the days you don't feel like it." },
  { level: 6, name: "Standard", at: 3800, blurb: "This is simply how you operate now." },
  { level: 7, name: "Mastery", at: 5600, blurb: "A year of evidence. Very few members have this record." },
  { level: 8, name: "Cornerstone", at: 8000, blurb: "The long view. You have outlasted every version of yourself." },
];

/**
 * What each behaviour is worth.
 *
 * Every key here is a *behaviour*. If you are ever tempted to add a key for a
 * biomarker, a bodyweight delta or a dose count, re-read rule 1 above — we
 * shipped a scoreboard that rewarded an outcome once and had to pull it.
 */
export const XP_WEIGHTS = {
  /** A day where every ring closed. Hard-capped at one per day upstream. */
  ringsClosed: 10,
  /** Identical to a closed day, on purpose. Rule 2. */
  protectedDays: 10,
  /** Turning up to a real conversation with a coach or provider. */
  consultsAttended: 60,
  /** A logged check-in — weight, sleep, how the week actually went. */
  checkInsLogged: 25,
  /** Getting the panel drawn when it was due. */
  labsCompleted: 120,
  /** Standing on the scanner. Measurement is a behaviour; the result is not. */
  scansCompleted: 100,
} as const;

export type XpSource = keyof typeof XP_WEIGHTS;

const SOURCE_COPY: Record<XpSource, { label: string; detail: string }> = {
  ringsClosed: { label: "Days closed", detail: "Every ring, start to finish." },
  protectedDays: { label: "Days held", detail: "Paused on provider instruction — counted in full." },
  consultsAttended: { label: "Consults attended", detail: "You showed up for the conversation." },
  checkInsLogged: { label: "Check-ins logged", detail: "Weight, sleep, and an honest week." },
  labsCompleted: { label: "Panels drawn", detail: "Bloodwork done when it was due." },
  scansCompleted: { label: "Body scans", detail: "Measured, not estimated." },
};

export interface EarnedFrom {
  source: XpSource;
  label: string;
  detail: string;
  count: number;
  xp: number;
}

export interface Badge {
  id: string;
  name: string;
  detail: string;
  earned: boolean;
  /** ISO date it was earned, when we can point at one. */
  on?: string;
  /** Progress toward an unearned badge, 0..1 — never a rank. */
  progress: number;
}

export interface LevelState {
  level: number;
  name: string;
  blurb: string;
  xp: number;
  xpIntoLevel: number;
  xpForNext: number;
  /** 0..1 through the current level. 1 at the top of the ladder. */
  progress: number;
  earnedFrom: EarnedFrom[];
  badges: Badge[];
  /** The member's own next threshold — never another member's position. */
  nextMilestone: { name: string; xpAway: number; hint: string } | null;
}

function levelIndexFor(xp: number): number {
  let i = 0;
  for (let n = 0; n < LEVELS.length; n++) if (xp >= LEVELS[n].at) i = n;
  return i;
}

/**
 * Badges mark milestones a member can point at years later. Kept few and kept
 * factual — a badge for every third login is a badge that means nothing.
 */
function badgesFor(b: BehaviourLog): Badge[] {
  const ratio = (n: number, d: number) => Math.max(0, Math.min(1, n / d));
  return [
    {
      id: "first-scan",
      name: "First scan",
      detail: "Your baseline composition, on record.",
      earned: b.scansCompleted > 0,
      on: b.firstScanOn,
      progress: b.scansCompleted > 0 ? 1 : 0,
    },
    {
      id: "first-labs",
      name: "First panel",
      detail: "Bloodwork drawn — the start of the evidence.",
      earned: b.labsCompleted > 0,
      on: b.firstLabOn,
      progress: b.labsCompleted > 0 ? 1 : 0,
    },
    {
      id: "streak-14",
      name: "Two straight weeks",
      detail: "Fourteen days without a gap. Held days count.",
      earned: b.bestStreak >= 14,
      progress: ratio(b.bestStreak, 14),
    },
    {
      id: "consistent-90",
      name: "Ninety days consistent",
      detail: "A full quarter of showing up.",
      earned: b.ringsClosed + b.protectedDays >= 90,
      progress: ratio(b.ringsClosed + b.protectedDays, 90),
    },
    {
      id: "year-one",
      name: "A year in",
      detail: "Twelve months as a member. Most people quit at six weeks.",
      earned: b.daysEnrolled >= 365,
      progress: ratio(b.daysEnrolled, 365),
    },
  ];
}

/**
 * The member's level, and — this is the part that matters — the receipts.
 *
 * `earnedFrom` exists so the card can never say "Level 4" without being able to
 * answer "from what?". Every point on screen traces to a counted behaviour in
 * `lib/mock/play.ts`. An unexplainable number is a number members stop trusting.
 */
export function levelFor(clientId: string): LevelState | null {
  const b = behaviourFor(clientId);
  if (!b) return null;

  const earnedFrom: EarnedFrom[] = (Object.keys(XP_WEIGHTS) as XpSource[])
    .map((source) => {
      const count = b[source] as number;
      return {
        source,
        ...SOURCE_COPY[source],
        count,
        xp: count * XP_WEIGHTS[source],
      };
    })
    .filter((e) => e.count > 0)
    .sort((a, c) => c.xp - a.xp);

  const xp = earnedFrom.reduce((sum, e) => sum + e.xp, 0);

  const idx = levelIndexFor(xp);
  const def = LEVELS[idx];
  const next = LEVELS[idx + 1];

  const xpIntoLevel = xp - def.at;
  const xpForNext = next ? next.at - def.at : 0;

  const badges = badgesFor(b);
  const nextBadge = badges.find((x) => !x.earned);

  return {
    level: def.level,
    name: def.name,
    blurb: def.blurb,
    xp,
    xpIntoLevel,
    xpForNext,
    progress: next ? Math.max(0, Math.min(1, xpIntoLevel / xpForNext)) : 1,
    earnedFrom,
    badges,
    nextMilestone: next
      ? {
          name: next.name,
          xpAway: next.at - xp,
          // The hint always names a behaviour the member controls outright.
          hint: nextBadge
            ? `${nextBadge.name} is also within reach — ${nextBadge.detail.toLowerCase()}`
            : "Close today's rings and log your check-in.",
        }
      : null,
  };
}

export { badgesFor };
