import { CURRENT_WEEK, weekBehaviourFor, type WeekBehaviour } from "@/lib/mock/play";
import { getClient } from "@/lib/mock/clients";
import { seededRandom } from "@/lib/utils";

/**
 * Weekly quests — three at a time, all of them things the member does.
 *
 * ── The three rules this file enforces ────────────────────────────────────
 *
 *  1. **No quest may involve a dose.** Not "take your dose five times", not
 *     "don't miss an injection", not "complete your protocol". A weekly mission
 *     that pushes medication is a weekly nudge to medicate, and the member has
 *     no business being scored on it either way. `DOSE_SHAPED` below is a
 *     runtime guard, not documentation — anything matching it is dropped from
 *     the board with a console warning, so a well-meaning future quest never
 *     reaches a member's screen.
 *
 *  2. **A protected day never fails a quest.** Quests count *up* only. Nothing
 *     here decrements, expires angrily, or resets a streak. If a provider paused
 *     the week, the member's board simply doesn't complete — no red, no loss.
 *     `holdsHarmless` marks quests where a held day is credited outright.
 *
 *  3. **No quest references another member.** No "beat the clinic average", no
 *     "finish top ten this week". Every target is derived from this member's own
 *     plan — the training target is literally the count of non-rest days on
 *     their own split.
 *
 * Fourth, quieter rule: every quest must be *achievable this week* and fully
 * within the member's control. "Lose two pounds" fails that test — bodyweight
 * is an outcome — so it is not in the catalogue.
 */

export type QuestKind = "train" | "fuel" | "log" | "care";

export interface Quest {
  id: string;
  title: string;
  /** What "done" means, in plain language. */
  detail: string;
  /** Why this one, tied to the member's own record. Never a comparison. */
  because: string;
  kind: QuestKind;
  done: number;
  target: number;
  unit: string;
  /** 0..1 */
  progress: number;
  complete: boolean;
  /** Feeds `levelFor` indirectly via behaviour; shown as a small reward chip. */
  xp: number;
  /** Ring colour for the completion burst. */
  hex: string;
  /** True when a provider-directed hold still counts toward this quest. */
  holdsHarmless: boolean;
}

/** Fuel green, Train blue, log slate-gold, care gold. Protocol red is absent
 *  by design — there is no protocol quest, because there is no dose quest. */
const KIND_HEX: Record<QuestKind, string> = {
  train: "#60a5fa",
  fuel: "#34d399",
  log: "#a78bfa",
  care: "#e93d3d",
};

/**
 * Rule 1's teeth.
 *
 * Any quest whose title or detail talks about dosing, injecting, milligrams or
 * "the protocol" is rejected at runtime. This is cheap and it has already paid
 * for itself once.
 */
const DOSE_SHAPED =
  /\b(dose|doses|dosing|mg\b|ml\b|iu\b|inject|injection|vial|syringe|titrat|protocol item|take your|medicat)/i;

interface QuestSpec {
  id: string;
  kind: QuestKind;
  title: (t: number) => string;
  detail: string;
  because: (w: WeekBehaviour) => string;
  unit: string;
  xp: number;
  holdsHarmless: boolean;
  /** Whether this quest makes sense for this member this week. */
  relevant: (w: WeekBehaviour) => boolean;
  target: (w: WeekBehaviour) => number;
  done: (w: WeekBehaviour) => number;
}

const CATALOGUE: QuestSpec[] = [
  {
    id: "q-train",
    kind: "train",
    title: (t) => `Log ${word(t)} training session${t === 1 ? "" : "s"}`,
    detail: "Any session on your split counts — including the one you cut short.",
    because: (w) => `Your plan has ${w.trainingTarget} training days this week.`,
    unit: "sessions",
    xp: 60,
    // A day the coach or provider told them to sit out is a day they trained
    // correctly. Rule 2.
    holdsHarmless: true,
    relevant: (w) => w.trainingTarget > 0,
    target: (w) => w.trainingTarget,
    done: (w) => w.trainingSessions,
  },
  {
    id: "q-protein",
    kind: "fuel",
    title: (t) => `Hit protein ${word(t)} days`,
    detail: "Your daily protein target, five of seven days. Weekends included.",
    because: () => "Protein is the target that protects lean mass — and the one most often missed.",
    unit: "days",
    xp: 55,
    holdsHarmless: false,
    relevant: () => true,
    target: () => 5,
    done: (w) => w.proteinDays,
  },
  {
    id: "q-weight",
    kind: "log",
    title: (t) => `Log your weight ${word(t)} times`,
    detail: "Same conditions each time — morning, before food.",
    because: () => "Single weigh-ins are noise. Three a week is a trend your coach can read.",
    unit: "logs",
    xp: 35,
    holdsHarmless: false,
    relevant: () => true,
    target: () => 3,
    done: (w) => w.weightLogs,
  },
  {
    id: "q-sleep",
    kind: "log",
    title: (t) => `Log sleep ${word(t)} nights`,
    detail: "Hours and how rested you felt. Thirty seconds a night.",
    because: () => "Sleep explains more bad weeks than anything else on your plan.",
    unit: "nights",
    xp: 35,
    holdsHarmless: false,
    relevant: () => true,
    target: () => 5,
    done: (w) => w.sleepLogs,
  },
  {
    id: "q-meals",
    kind: "fuel",
    title: (t) => `Log ${t} meals`,
    detail: "Photo or a line of text — both count.",
    because: () => "Logged meals are what make your macro targets adjustable instead of guessed.",
    unit: "meals",
    xp: 40,
    holdsHarmless: false,
    relevant: () => true,
    target: () => 14,
    done: (w) => w.mealsLogged,
  },
  {
    id: "q-steps",
    kind: "train",
    title: (t) => `Hit your step target ${word(t)} days`,
    detail: "Walking is training that doesn't cost you recovery.",
    because: () => "Steps move daily expenditure more than any session you can add.",
    unit: "days",
    xp: 40,
    holdsHarmless: true,
    relevant: () => true,
    target: () => 5,
    done: (w) => w.stepDays,
  },
  {
    id: "q-labs",
    kind: "care",
    title: () => "Book your follow-up panel",
    detail: "Pick a morning slot — the draw is fasted.",
    because: (w) => `Your last panel was ${w.daysSinceLabs} days ago.`,
    unit: "booked",
    xp: 70,
    // A one-off booking, not a day count — held days are simply irrelevant
    // here, so crediting them would be noise rather than fairness.
    holdsHarmless: false,
    // Only ever on the board when it is genuinely outstanding. A quest that
    // arrives already ticked is a quest that teaches the member the board is
    // decoration.
    relevant: (w) => w.daysSinceLabs >= 75 && !w.labsBooked,
    target: () => 1,
    done: () => 0,
  },
  {
    id: "q-scan",
    kind: "care",
    title: () => "Book a body scan",
    detail: "Ten minutes at your clinic. Same time of day as your last one.",
    because: () => "Composition is the measurement the scale can't give you.",
    unit: "booked",
    xp: 60,
    holdsHarmless: false,
    relevant: (w) => !w.scanBooked,
    target: () => 1,
    done: () => 0,
  },
  {
    id: "q-checkin",
    kind: "care",
    title: () => "Book your coach check-in",
    detail: "Fifteen minutes, phone or video.",
    because: () => "The members who keep a standing check-in are the ones still here at a year.",
    unit: "booked",
    xp: 50,
    holdsHarmless: false,
    relevant: (w) => !w.checkInBooked,
    target: () => 1,
    done: () => 0,
  },
];

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven"];
function word(n: number): string {
  return WORDS[n] ?? String(n);
}

function build(spec: QuestSpec, w: WeekBehaviour): Quest {
  const target = Math.max(1, spec.target(w));
  // A held day is credited outright on quests that hold harmless — rule 2.
  const credit = spec.holdsHarmless ? w.protectedDays : 0;
  const done = Math.min(target, spec.done(w) + credit);
  return {
    id: spec.id,
    title: spec.title(target),
    detail: spec.detail,
    because: spec.because(w),
    kind: spec.kind,
    done,
    target,
    unit: spec.unit,
    progress: Math.max(0, Math.min(1, done / target)),
    complete: done >= target,
    xp: spec.xp,
    hex: KIND_HEX[spec.kind],
    holdsHarmless: spec.holdsHarmless,
  };
}

/**
 * This week's three.
 *
 * Selection is deterministic on `clientId + weekIso`, and deliberately picks one
 * from each of three lanes — something to do in the gym, something to do in the
 * kitchen or the log, and something to book. Three identical logging quests is a
 * board a member ignores by Tuesday.
 */
export function questsFor(clientId: string, weekIso: string = CURRENT_WEEK): Quest[] {
  const client = getClient(clientId);
  const w = weekBehaviourFor(clientId, weekIso);
  if (!client || !w) return [];

  const rand = seededRandom(`${clientId}-quests-${weekIso}`);

  const eligible = CATALOGUE.filter((s) => s.relevant(w)).filter((s) => {
    // Rule 1, enforced rather than trusted.
    const text = `${s.title(1)} ${s.detail}`;
    if (DOSE_SHAPED.test(text)) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(`[quests] dropped dose-shaped quest "${s.id}" — see rule 1 in lib/play/quests.ts`);
      }
      return false;
    }
    return true;
  });

  const pickFrom = (kinds: QuestKind[], taken: Set<string>): QuestSpec | undefined => {
    const pool = eligible.filter((s) => kinds.includes(s.kind) && !taken.has(s.id));
    if (!pool.length) return undefined;
    return pool[Math.floor(rand() * pool.length)];
  };

  const taken = new Set<string>();
  const chosen: QuestSpec[] = [];
  for (const lane of [["train"], ["fuel", "log"], ["care"]] as QuestKind[][]) {
    const pick = pickFrom(lane, taken);
    if (pick) {
      taken.add(pick.id);
      chosen.push(pick);
    }
  }
  // Backfill from anything left if a lane came up empty this week.
  while (chosen.length < 3) {
    const pick = pickFrom(["train", "fuel", "log", "care"], taken);
    if (!pick) break;
    taken.add(pick.id);
    chosen.push(pick);
  }

  return chosen.map((s) => build(s, w));
}

/** Total XP on the board this week — shown as "what this week is worth". */
export function weekXp(quests: Quest[]): { earned: number; available: number } {
  return {
    earned: quests.filter((q) => q.complete).reduce((n, q) => n + q.xp, 0),
    available: quests.reduce((n, q) => n + q.xp, 0),
  };
}
