import type { Client } from "@/lib/types";
import type { TrainingBlock } from "@/lib/planOfCare/types";
import { buildPlanOfCare } from "@/lib/planOfCare/engine";
import { getClient } from "@/lib/mock/clients";

/**
 * WORKOUT LIBRARY.
 *
 * `buildPlanOfCare` already produces a weekly split — "Mon / Lower — push /
 * Leg press, split squat, hamstring curl". That is a coach's shorthand, and a
 * member standing in a gym holding their phone cannot train off it. This module
 * is the other half: for the focus the plan assigned to today, here is a
 * session with sets, rep ranges, rest and a cue per movement.
 *
 * ── THREE RULES ───────────────────────────────────────────────────────────
 *
 * 1. **THE SPLIT IS THE PLAN'S, NOT OURS.** This file never decides what a
 *    member trains on a given day. It reads `plan.trainingSplit`, matches the
 *    day's focus, and dresses it. If the plan changes, these pages change with
 *    it, and there is no second source of truth to drift.
 *
 * 2. **EVERY LOADED MOVEMENT CARRIES A JOINT-FRIENDLY SUBSTITUTION.** The plan
 *    engine already reasons about joint pain (`trn-joint`), so the library has
 *    to be able to honour that decision movement by movement rather than
 *    handing a member with a cranky shoulder a barbell bench press and a
 *    disclaimer. Substitutions are offered to *everyone* — a member without a
 *    flag who has a bad day should not have to ask permission to use one.
 *
 * 3. **CUES ARE COACHING, NOT CLINICAL CLAIMS.** A cue tells you how to perform
 *    a rep. Nothing here claims a movement treats, prevents or fixes anything.
 */

export type FocusKind =
  | "lower-push"
  | "lower-pull"
  | "upper-push"
  | "upper-pull"
  | "full-body"
  | "conditioning"
  | "mobility"
  | "rest";

export type Level = "Foundation" | "Intermediate" | "Advanced";

export interface WorkoutBlockItem {
  exercise: string;
  sets: number;
  repRange: string;
  restSeconds: number;
  /** One thing to think about while the set is happening. */
  cue: string;
  /**
   * Same stimulus, less peak joint load. Present on every movement where a
   * meaningful swap exists; absent where the honest answer is "there isn't one,
   * reduce the load instead".
   */
  jointFriendly?: { exercise: string; why: string };
}

export interface Workout {
  id: string;
  name: string;
  focus: FocusKind;
  minutes: number;
  level: Level;
  /** What this session is trying to achieve, in one plain sentence. */
  intent: string;
  blocks: WorkoutBlockItem[];
}

// ---------------------------------------------------------------------------
// Focus matching
// ---------------------------------------------------------------------------

/**
 * Map a plan's free-text focus onto a library focus.
 *
 * The engine writes focus strings for humans ("Lower — push", "Full body A",
 * "Zone 2"), so this reads them the way a human would rather than demanding an
 * enum the engine does not emit. Unrecognised focus falls through to full body,
 * which is the safe default: a member who gets a general session on a day the
 * plan meant something specific has still trained.
 */
export function focusKindFor(focus: string): FocusKind {
  const f = focus.toLowerCase();
  if (f.includes("rest")) return "rest";
  if (f.includes("mobility") || f.includes("steps")) return "mobility";
  if (f.includes("zone 2") || f.includes("conditioning")) return "conditioning";
  if (f.includes("lower")) return f.includes("pull") ? "lower-pull" : "lower-push";
  if (f.includes("upper")) return f.includes("pull") ? "upper-pull" : "upper-push";
  if (f.includes("optional")) return "mobility";
  return "full-body";
}

export const FOCUS_LABEL: Record<FocusKind, string> = {
  "lower-push": "Lower body — push",
  "lower-pull": "Lower body — hinge and pull",
  "upper-push": "Upper body — push",
  "upper-pull": "Upper body — pull",
  "full-body": "Full body",
  conditioning: "Conditioning",
  mobility: "Movement and mobility",
  rest: "Rest",
};

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------

export const WORKOUTS: Workout[] = [
  {
    id: "wk-lp-1",
    name: "Quad-focused lower body",
    focus: "lower-push",
    minutes: 55,
    level: "Intermediate",
    intent: "Load the quads hard with the first two movements, then finish with lower-risk single-leg and calf work.",
    blocks: [
      {
        exercise: "Back squat",
        sets: 4,
        repRange: "5–8",
        restSeconds: 180,
        cue: "Brace before you unrack, not after. Take a full breath in, push your belly into your belt line, and hold it for the whole rep.",
        jointFriendly: {
          exercise: "Leg press",
          why: "Same quad stimulus with the spine supported and no load on the shoulders or wrists.",
        },
      },
      {
        exercise: "Bulgarian split squat",
        sets: 3,
        repRange: "8–10 each leg",
        restSeconds: 90,
        cue: "Front shin roughly vertical and weight through the mid-foot. If the back knee is smashing the floor, move the bench closer.",
        jointFriendly: {
          exercise: "Supported reverse lunge, holding a rack",
          why: "Keeps the single-leg work but takes the balance demand — and the knee twist that comes with losing it — out.",
        },
      },
      {
        exercise: "Seated leg curl",
        sets: 3,
        repRange: "10–12",
        restSeconds: 75,
        cue: "Squeeze at the bottom for a full second. Hamstrings respond to the pause far more than to the extra plate.",
      },
      {
        exercise: "Standing calf raise",
        sets: 3,
        repRange: "12–15",
        restSeconds: 60,
        cue: "All the way down until you feel the stretch, all the way up onto the big toe. No bouncing.",
      },
    ],
  },
  {
    id: "wk-lp-2",
    name: "Lower body, machine-led",
    focus: "lower-push",
    minutes: 40,
    level: "Foundation",
    intent: "Everything supported or fixed-path, for a first block or a week where the joints are unhappy.",
    blocks: [
      {
        exercise: "Leg press",
        sets: 4,
        repRange: "8–12",
        restSeconds: 120,
        cue: "Stop the sled before your lower back peels off the pad. That last two inches is where the disc pays for the rep.",
      },
      {
        exercise: "Goblet squat",
        sets: 3,
        repRange: "10–12",
        restSeconds: 90,
        cue: "Elbows inside the knees at the bottom. Let the weight counterbalance you so you can sit down between your feet.",
      },
      {
        exercise: "Leg extension",
        sets: 3,
        repRange: "12–15",
        restSeconds: 60,
        cue: "Slow on the way down — four full seconds. This is where the set is actually earned.",
      },
      {
        exercise: "Seated calf raise",
        sets: 3,
        repRange: "15–20",
        restSeconds: 45,
        cue: "Pause two seconds in the stretched position at the bottom of every rep.",
      },
    ],
  },
  {
    id: "wk-lh-1",
    name: "Hinge and posterior chain",
    focus: "lower-pull",
    minutes: 55,
    level: "Intermediate",
    intent: "One heavy hinge, then hamstring and glute work at rep ranges that do not need a full recovery day of their own.",
    blocks: [
      {
        exercise: "Conventional deadlift",
        sets: 3,
        repRange: "3–5",
        restSeconds: 210,
        cue: "Pull the slack out of the bar before you pull the bar. You should hear the plates settle, then push the floor away.",
        jointFriendly: {
          exercise: "Trap-bar deadlift",
          why: "Neutral handles and the load centred through your midline: far less shear on the lower back and no biceps strain from a mixed grip.",
        },
      },
      {
        exercise: "Romanian deadlift",
        sets: 3,
        repRange: "8–10",
        restSeconds: 120,
        cue: "Push the hips back until you feel the hamstrings load, then stop. Depth comes from the hinge, not from rounding to reach the floor.",
        jointFriendly: {
          exercise: "45° back extension",
          why: "Trains the same hip extension with your bodyweight rather than a loaded bar in front of you.",
        },
      },
      {
        exercise: "Hip thrust",
        sets: 3,
        repRange: "10–12",
        restSeconds: 90,
        cue: "Chin tucked, ribs down, and finish with the hips level — not arched. The glutes should be doing the locking out, not the lower back.",
      },
      {
        exercise: "Lying leg curl",
        sets: 3,
        repRange: "10–12",
        restSeconds: 75,
        cue: "Keep your hips pinned to the pad. The moment they lift, the set has become a back exercise.",
      },
    ],
  },
  {
    id: "wk-up-1",
    name: "Upper body push",
    focus: "upper-push",
    minutes: 50,
    level: "Intermediate",
    intent: "One heavy horizontal press, one incline, then shoulders and triceps at moderate loads.",
    blocks: [
      {
        exercise: "Barbell bench press",
        sets: 4,
        repRange: "5–8",
        restSeconds: 180,
        cue: "Shoulder blades pulled back and down into the bench before the bar moves, and keep them there all set. Bar to the lower chest, not the throat.",
        jointFriendly: {
          exercise: "Neutral-grip dumbbell press",
          why: "Palms facing each other lets the shoulder sit in a friendlier position, and each arm can find its own path instead of being locked to a bar.",
        },
      },
      {
        exercise: "Incline dumbbell press",
        sets: 3,
        repRange: "8–12",
        restSeconds: 120,
        cue: "Bench at about 30°. Any steeper and it turns into a shoulder press.",
      },
      {
        exercise: "Seated dumbbell shoulder press",
        sets: 3,
        repRange: "8–12",
        restSeconds: 90,
        cue: "Stop just short of lockout at the top to keep tension on the delts rather than parking it on the elbow joint.",
        jointFriendly: {
          exercise: "Landmine press",
          why: "The arc sits in front of the body rather than overhead, which most cranky shoulders tolerate far better.",
        },
      },
      {
        exercise: "Cable triceps pushdown",
        sets: 3,
        repRange: "12–15",
        restSeconds: 60,
        cue: "Elbows pinned to your sides. If they drift forward you have turned it into a chest movement.",
      },
    ],
  },
  {
    id: "wk-up-2",
    name: "Upper push, joint-considerate",
    focus: "upper-push",
    minutes: 40,
    level: "Foundation",
    intent: "Neutral grips and machine paths throughout, for shoulders or elbows that are complaining.",
    blocks: [
      {
        exercise: "Neutral-grip dumbbell press",
        sets: 4,
        repRange: "8–12",
        restSeconds: 120,
        cue: "Elbows at roughly 45° from your body, not flared to 90°. That single change is what most sore shoulders need.",
      },
      {
        exercise: "Machine chest press",
        sets: 3,
        repRange: "10–12",
        restSeconds: 90,
        cue: "Set the seat so the handles line up with the middle of your chest before you start.",
      },
      {
        exercise: "Landmine press",
        sets: 3,
        repRange: "10 each arm",
        restSeconds: 75,
        cue: "Let the shoulder blade travel with the arm at the top. Blocking it is what pinches.",
      },
      {
        exercise: "Rope triceps extension",
        sets: 3,
        repRange: "12–15",
        restSeconds: 60,
        cue: "Spread the rope apart at the bottom and hold for a beat.",
      },
    ],
  },
  {
    id: "wk-ul-1",
    name: "Upper body pull",
    focus: "upper-pull",
    minutes: 50,
    level: "Intermediate",
    intent: "Vertical and horizontal pulling in equal measure, finishing with rear delts and biceps.",
    blocks: [
      {
        exercise: "Weighted pull-up",
        sets: 4,
        repRange: "5–8",
        restSeconds: 150,
        cue: "Start every rep from a dead hang with the shoulders pulled down. Kipping to get the last rep is borrowing from your elbows.",
        jointFriendly: {
          exercise: "Lat pulldown, neutral grip",
          why: "Same pattern with a load you can dial in gram by gram instead of hanging your whole bodyweight off one elbow angle.",
        },
      },
      {
        exercise: "Chest-supported row",
        sets: 3,
        repRange: "8–12",
        restSeconds: 105,
        cue: "Pull with the elbows, not the hands. Think about putting your elbows in your back pockets.",
      },
      {
        exercise: "Single-arm dumbbell row",
        sets: 3,
        repRange: "10 each arm",
        restSeconds: 90,
        cue: "Keep the shoulders square to the floor. If your torso is rotating to finish the rep, drop the weight.",
      },
      {
        exercise: "Face pull",
        sets: 3,
        repRange: "15–20",
        restSeconds: 45,
        cue: "Rope to the forehead, elbows high, and finish with the knuckles pointing behind you.",
      },
      {
        exercise: "Incline dumbbell curl",
        sets: 3,
        repRange: "10–12",
        restSeconds: 60,
        cue: "Let the arms hang fully behind you at the bottom. That stretch is the whole reason for the incline.",
      },
    ],
  },
  {
    id: "wk-fb-a",
    name: "Full body A",
    focus: "full-body",
    minutes: 50,
    level: "Intermediate",
    intent: "A squat, a press and a row: the three patterns that cover most of the body in one session.",
    blocks: [
      {
        exercise: "Back squat",
        sets: 3,
        repRange: "6–8",
        restSeconds: 180,
        cue: "Knees track over the middle toes on the way down. Let them travel forward — stopping them shifts the load onto your back.",
        jointFriendly: {
          exercise: "Leg press",
          why: "Removes the bar from your shoulders and the balance demand from your knees while keeping the quad work.",
        },
      },
      {
        exercise: "Barbell bench press",
        sets: 3,
        repRange: "6–8",
        restSeconds: 150,
        cue: "Drive your feet into the floor. A press is a whole-body brace, not just an arm movement.",
        jointFriendly: {
          exercise: "Neutral-grip dumbbell press",
          why: "Lets each shoulder choose its own groove instead of being fixed by the bar.",
        },
      },
      {
        exercise: "Barbell row",
        sets: 3,
        repRange: "8–10",
        restSeconds: 120,
        cue: "Torso stays at the same angle from first rep to last. When it starts rising, the set is over.",
        jointFriendly: {
          exercise: "Chest-supported row",
          why: "Takes the lower back out entirely, so a heavy squat earlier in the session does not decide how much you can row.",
        },
      },
      {
        exercise: "Plank",
        sets: 3,
        repRange: "40–60 seconds",
        restSeconds: 45,
        cue: "Squeeze the glutes and tuck the ribs down. A sagging plank is just a hang.",
      },
    ],
  },
  {
    id: "wk-fb-b",
    name: "Full body B",
    focus: "full-body",
    minutes: 50,
    level: "Intermediate",
    intent: "The hinge, the overhead press and the vertical pull — the patterns full body A does not cover.",
    blocks: [
      {
        exercise: "Romanian deadlift",
        sets: 3,
        repRange: "8–10",
        restSeconds: 150,
        cue: "The bar stays in contact with your legs the whole way down. If it drifts away it is your lower back holding it there.",
        jointFriendly: {
          exercise: "Trap-bar Romanian deadlift",
          why: "Neutral grip and a load line through your midline rather than in front of it.",
        },
      },
      {
        exercise: "Standing overhead press",
        sets: 3,
        repRange: "6–8",
        restSeconds: 150,
        cue: "Squeeze your glutes hard before you press. It stops the rep turning into a standing back arch.",
        jointFriendly: {
          exercise: "Landmine press",
          why: "Presses forward-and-up rather than straight overhead, which is usually the range a sore shoulder objects to.",
        },
      },
      {
        exercise: "Lat pulldown",
        sets: 3,
        repRange: "10–12",
        restSeconds: 90,
        cue: "Pull to the collarbone with the chest lifted. Behind the neck buys you nothing and costs your shoulders.",
      },
      {
        exercise: "Cable woodchop",
        sets: 3,
        repRange: "10 each side",
        restSeconds: 60,
        cue: "Rotate from the ribcage with the hips staying square. Slow and controlled — this is not a swing.",
      },
    ],
  },
  {
    id: "wk-fb-c",
    name: "Full body C",
    focus: "full-body",
    minutes: 45,
    level: "Foundation",
    intent: "Single-leg, incline pressing and cable rowing — lighter absolute loads, same weekly volume.",
    blocks: [
      {
        exercise: "Dumbbell split squat",
        sets: 3,
        repRange: "8–10 each leg",
        restSeconds: 105,
        cue: "Drop straight down rather than lunging forward. The front knee should finish over the mid-foot.",
        jointFriendly: {
          exercise: "Step-up to a low box",
          why: "Shorter range under load and no deep knee flexion, but the same single-leg demand.",
        },
      },
      {
        exercise: "Incline dumbbell press",
        sets: 3,
        repRange: "10–12",
        restSeconds: 90,
        cue: "Bring the dumbbells to the sides of your chest, not together over your face.",
      },
      {
        exercise: "Seated cable row",
        sets: 3,
        repRange: "10–12",
        restSeconds: 90,
        cue: "Let the shoulder blades travel forward at the front of the rep, then pull them back. That full range is the exercise.",
      },
      {
        exercise: "Farmer's carry",
        sets: 3,
        repRange: "30–40 m",
        restSeconds: 75,
        cue: "Tall, ribs stacked over hips, and do not let the weights swing. Grip fails before the legs do; that is fine.",
      },
    ],
  },
  {
    id: "wk-cond-1",
    name: "Zone 2, 30 minutes",
    focus: "conditioning",
    minutes: 30,
    level: "Foundation",
    intent: "Easy, conversational aerobic work. It is supposed to feel too easy — that is what makes it repeatable.",
    blocks: [
      {
        exercise: "Bike, incline walk or rower",
        sets: 1,
        repRange: "30 minutes continuous",
        restSeconds: 0,
        cue: "You should be able to hold a full sentence without gasping. If you cannot, slow down — going harder here does not make it work better.",
        jointFriendly: {
          exercise: "Stationary bike or pool walk",
          why: "No impact through the knees, ankles or hips, which is usually what makes a treadmill unpleasant.",
        },
      },
      {
        exercise: "Nasal-breathing check",
        sets: 1,
        repRange: "Every 10 minutes",
        restSeconds: 0,
        cue: "If you have had to open your mouth to keep up, you have drifted out of the intended pace.",
      },
    ],
  },
  {
    id: "wk-cond-2",
    name: "Intervals, 20 minutes",
    focus: "conditioning",
    minutes: 20,
    level: "Intermediate",
    intent: "Short hard efforts with full recovery, for a week where time is the constraint.",
    blocks: [
      {
        exercise: "Warm-up",
        sets: 1,
        repRange: "5 minutes easy",
        restSeconds: 0,
        cue: "Build gradually. Going straight into the first hard effort cold is how a calf goes.",
      },
      {
        exercise: "Bike or rower intervals",
        sets: 6,
        repRange: "40 seconds hard / 80 seconds easy",
        restSeconds: 80,
        cue: "The first interval should feel too easy. If interval six is falling apart, interval one was too hard.",
        jointFriendly: {
          exercise: "Bike only",
          why: "Seated, no impact, and no hinge under fatigue — the rower's back position is the part that usually bites.",
        },
      },
      {
        exercise: "Cool-down",
        sets: 1,
        repRange: "3 minutes easy",
        restSeconds: 0,
        cue: "Keep moving until your breathing is back to normal before you sit down.",
      },
    ],
  },
  {
    id: "wk-mob-1",
    name: "Steps and mobility",
    focus: "mobility",
    minutes: 25,
    level: "Foundation",
    intent: "A walk plus ten minutes of joint work. This is a real session, not a rest day with extra steps.",
    blocks: [
      {
        exercise: "Brisk walk",
        sets: 1,
        repRange: "15–20 minutes",
        restSeconds: 0,
        cue: "Outside if you can. Pace is whatever lets you keep going without thinking about it.",
      },
      {
        exercise: "90/90 hip switch",
        sets: 2,
        repRange: "8 each side",
        restSeconds: 30,
        cue: "Move slowly and stop where it becomes a stretch rather than a strain. Sit tall throughout.",
      },
      {
        exercise: "Thoracic opener over a foam roller",
        sets: 2,
        repRange: "6 breaths per position",
        restSeconds: 30,
        cue: "Roller across the upper back, hands behind the head. Breathe out into the position rather than forcing it.",
      },
      {
        exercise: "Ankle rock to wall",
        sets: 2,
        repRange: "10 each side",
        restSeconds: 30,
        cue: "Heel flat, knee travels over the second toe toward the wall. Move the foot back until it is genuinely difficult.",
      },
    ],
  },
  {
    id: "wk-rest-1",
    name: "Rest day",
    focus: "rest",
    minutes: 0,
    level: "Foundation",
    intent: "Nothing to do. Recovery is where the adaptation from the other days actually happens.",
    blocks: [
      {
        exercise: "Walk, if you feel like it",
        sets: 1,
        repRange: "Whatever is comfortable",
        restSeconds: 0,
        cue: "Movement is fine and helps. Training is not. If you are itching to lift, that energy is better spent tomorrow.",
      },
    ],
  },
];

export const workoutById: Record<string, Workout> = Object.fromEntries(
  WORKOUTS.map((w) => [w.id, w]),
);

// ---------------------------------------------------------------------------
// Matching to the member's plan
// ---------------------------------------------------------------------------

/**
 * Whether to lead with joint-friendly substitutions.
 *
 * Mirrors the plan engine's `trn-joint` trigger, which fires on the symptom OR
 * the goal. Note the engine's *split* builder uses the narrower symptom-only
 * test, so a member who lists joint pain as a goal but not a symptom gets a
 * standard split with substitutions offered. That asymmetry is deliberate: over-
 * offering an easier option costs nothing, under-offering it costs a joint.
 */
export function needsJointCare(client: Client): boolean {
  return client.symptoms.includes("Joint pain") || client.goals.includes("Joint pain");
}

export interface DaySession {
  /** The plan's own entry for this day. Rendered verbatim as the source. */
  block: TrainingBlock;
  focus: FocusKind;
  /** Sessions that match the day's focus, best match first. */
  workouts: Workout[];
  /** True when the member's plan has flagged joint pain. */
  jointCare: boolean;
}

/** Days in the order the plan emits them, for tab strips and pickers. */
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type Day = (typeof DAYS)[number];

/**
 * The sessions that match this member's plan for a given day.
 *
 * Ordering: when joint care is flagged, Foundation-level sessions (which are
 * built from supported and fixed-path movements) come first. Otherwise the
 * ranking is by level ascending so the least intimidating option leads, and
 * ties break on id for determinism.
 */
export function workoutsFor(clientId: string, day: string): DaySession | undefined {
  const client = getClient(clientId);
  if (!client) return undefined;

  const plan = buildPlanOfCare(client);
  const block = plan.trainingSplit.find((b) => b.day === day);
  if (!block) return undefined;

  const focus = focusKindFor(block.focus);
  const jointCare = needsJointCare(client);

  const LEVEL_RANK: Record<Level, number> = {
    Foundation: 0,
    Intermediate: 1,
    Advanced: 2,
  };

  // Foundation sessions lead in both cases — they are the supported, fixed-path
  // options, which is the right default for a member reading this on a phone in
  // a gym and doubly right when joint care is flagged.
  const matches = WORKOUTS.filter((w) => w.focus === focus).sort(
    (a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || (a.id < b.id ? -1 : 1),
  );

  return { block, focus, workouts: matches, jointCare };
}

/** Every day of the member's week, already matched. Drives the week strip. */
export function weekFor(clientId: string): DaySession[] {
  const client = getClient(clientId);
  if (!client) return [];
  return buildPlanOfCare(client)
    .trainingSplit.map((b) => workoutsFor(clientId, b.day))
    .filter((s): s is DaySession => Boolean(s));
}

/** Total working sets in a session — the honest measure of how long it will take. */
export function totalSets(workout: Workout): number {
  return workout.blocks.reduce((n, b) => n + b.sets, 0);
}
