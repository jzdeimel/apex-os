import type { Client } from "@/lib/types";
import { buildDailyPlan } from "@/lib/daily/today";
import { buildPlanOfCare } from "@/lib/planOfCare/engine";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { appointmentsForClient } from "@/lib/mock/appointments";
import { tightestLine } from "@/lib/protocol/runway";
import {
  SYMPTOMS,
  addDays,
  daysBetween,
  journalFor,
  trendFor,
  type SymptomKey,
} from "@/lib/symptoms/journal";
import { staffMap } from "@/lib/mock/staff";
import { absolute, formatDate } from "@/lib/utils";

/**
 * WEEKLY REVIEW — one honest screen, once a week.
 *
 * The reason to open a health app on a Monday cannot be a streak that punishes
 * you for having had a life. It has to be that something is *there* — a real
 * read on the last seven days that you could not have assembled yourself.
 *
 * ══ WHAT MAKES THIS HONEST RATHER THAN MOTIVATIONAL ═══════════════════════
 *
 *  1. IT REPORTS THE ABSENCE OF DATA AS DATA. Body composition is measured
 *     every few weeks, not every week, so most weekly reviews genuinely have
 *     nothing new to say about it. `didNotMove` exists to say that out loud
 *     with the date of the last real measurement attached, rather than
 *     re-rendering a stale number as if it were fresh. A review where the
 *     honest answer is "your body did not get measured this week" must be able
 *     to say so, or the weeks where something *did* move stop meaning anything.
 *
 *  2. TIMESPANS ARE NAMED. Any change carries the two dates it sits between.
 *     A three-week body-fat drop printed on a weekly screen reads as a weekly
 *     body-fat drop unless the screen says otherwise.
 *
 *  3. ADHERENCE IS NOT A SCORE. `Adherence.meaning` deliberately talks about
 *     what happened rather than what was earned, there is no percentage, no
 *     grade and no running total to protect, and a provider-held day is
 *     reported as a held day rather than folded into a miss. Rule 2 in
 *     lib/daily/today.ts — never punish someone for following medical advice —
 *     applies to how the week is described, not just how it is counted.
 *
 *  4. ONE NEXT ACTION. Not a checklist. `next` is a ladder that returns the
 *     first thing that is genuinely waiting on the member, and its bottom rung
 *     is "nothing is waiting on you" rather than an invented task.
 */

const NOW = "2026-06-12T09:00:00";
const NOW_DATE = "2026-06-12";
const WEEK_DAYS = 7;

const KG_TO_LB = 2.20462;
const lb = (kg: number) => Math.round(kg * KG_TO_LB * 10) / 10;

/**
 * How much a measure has to shift before it is called movement.
 *
 * Below these, the change is the device and the day rather than the member —
 * an InBody reading swings on hydration alone. Reporting a 0.2 lb "gain" as
 * news is how a screen loses the right to be believed when it reports a real
 * one.
 */
const THRESHOLD = { weightLb: 1.0, bodyFatPct: 0.3, leanLb: 0.3 };

/** Index 0 = Sunday, matching getUTCDay. */
const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Format a DATE-ONLY value (a scan day, "2026-06-01") for display.
 *
 * Not `formatDate`, which pins to the clinic's timezone. That is correct for an
 * *instant* — an appointment at 9:30 in Raleigh is 9:30 to everyone — but wrong
 * for a bare calendar day: "2026-06-01" becomes midnight UTC, which is still
 * May 31 in New York, so the card rendered "your last scan was 11 days ago, on
 * May 31" while the arithmetic counted from June 1. Off-by-one against a date
 * printed on the same line is exactly the kind of small wrongness that makes a
 * member stop trusting the bigger numbers.
 *
 * The progress page already does this for the same reason — see `monthOf` in
 * app/portal/progress/page.tsx.
 */
function scanDate(iso: string): string {
  return absolute(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface Movement {
  id: string;
  label: string;
  /** The headline for the row. Already a finished sentence fragment. */
  headline: string;
  /** The qualifier: the span it covers, or why there is nothing to report. */
  detail: string;
  /** Which way the member would read it. `flat` when there is nothing to read. */
  direction: "better" | "worse" | "flat";
  /** True → belongs under "what moved". False → under "what didn't". */
  moved: boolean;
}

export interface Adherence {
  /**
   * Each of the seven days, in order.
   *
   * Not just a count: a strip rendered from a bare "5 of 7" has to guess which
   * five, and it invariably fills from the left — telling the member they
   * closed Saturday through Wednesday when they closed Monday, Wednesday and
   * the weekend. Cheap to carry, and it makes the row answerable rather than
   * decorative.
   */
  days: { date: string; weekday: string; closed: boolean; held: boolean }[];
  daysClosed: number;
  daysHeld: number;
  daysTotal: number;
  /** The weakest of the three rings across the week, when one stands out. */
  weakest?: { ring: "protocol" | "fuel" | "train"; label: string; daysMissed: number };
  /** What it means for them. Never a score, never a percentage. */
  meaning: string;
}

export interface JournalWeek {
  entries: number;
  daysTotal: number;
  /** The symptom that shifted most over the fortnight, if any did. */
  mover?: { symptom: SymptomKey; label: string; direction: "improving" | "steady" | "slipping" };
}

export interface NextAction {
  id: string;
  label: string;
  why: string;
  /** Absent when the thing to do lives on this same screen. */
  href?: string;
}

export interface WeeklyReview {
  weekStart: string;
  weekEnd: string;
  /** One sentence. The whole week, honestly, before any of the detail. */
  headline: string;
  moved: Movement[];
  didNotMove: Movement[];
  adherence: Adherence;
  journal: JournalWeek;
  next: NextAction;
  /** The anti-streak line. Rendered, not buried. */
  footnote: string;
}

// ---------------------------------------------------------------------------
// The week
// ---------------------------------------------------------------------------

/** The seven dates of the week ending today, oldest first. */
function weekDates(): string[] {
  return Array.from({ length: WEEK_DAYS }, (_, i) => addDays(NOW_DATE, -(WEEK_DAYS - 1 - i)));
}

/**
 * Replay each day's rings.
 *
 * `buildDailyPlan` is seeded per client and per date, so walking backwards over
 * the week reproduces exactly what the member saw on each of those mornings.
 * The alternative — `ringHistory`, which returns a bare closed/not-closed flag —
 * cannot say *which* ring was open, and "you missed two days" is far less
 * useful to a member than "the two days you missed were both training".
 */
function adherenceFor(client: Client): Adherence {
  const dates = weekDates();
  const days: Adherence["days"] = [];
  let daysClosed = 0;
  let daysHeld = 0;
  const missedBy: Record<"protocol" | "fuel" | "train", number> = { protocol: 0, fuel: 0, train: 0 };

  for (const date of dates) {
    const day = buildDailyPlan(client, `${date}T09:00:00`);
    const held = day.doses.some((d) => d.heldReason);
    if (held) daysHeld += 1;

    const open = day.rings.filter((r) => r.progress < 1);
    const closed = open.length === 0;
    if (closed) daysClosed += 1;
    for (const r of open) missedBy[r.id] += 1;

    days.push({
      date,
      // getUTCDay, via `absolute`, for the reason every other date in this
      // codebase does: a local getDay() labels the same instant differently on
      // a UTC server than in an Eastern browser, and React throws on the diff.
      weekday: DAY_INITIALS[absolute(`${date}T12:00:00`).getUTCDay()],
      closed,
      held,
    });
  }

  const ranked = (Object.entries(missedBy) as ["protocol" | "fuel" | "train", number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  const RING_LABEL = { protocol: "Protocol", fuel: "Fuel", train: "Train" } as const;
  const weakest = ranked[0]
    ? { ring: ranked[0][0], label: RING_LABEL[ranked[0][0]], daysMissed: ranked[0][1] }
    : undefined;

  const meaning =
    daysClosed === WEEK_DAYS
      ? "Every day this week, everything your plan asked for actually happened. That is the whole of it — there is nothing else to do with a week like that except notice it."
      : daysClosed === 0
        ? "None of the last seven days came together fully. That is worth a conversation rather than a resolution — if the plan is not survivable as written, the plan is the thing to change."
        : // Deliberately does not restate the count — the number is already the
          // largest thing on the card. This sentence's whole job is to say what
          // the number means, which is "how much of the plan happened", not
          // "how well you did".
          `That means the protocol, the food and the session all landed on the same day ${
            daysClosed === 1 ? "once" : `${daysClosed} times`
          }. It is the amount of your plan that actually happened — not a score, and nothing is deducted for the other ${
            WEEK_DAYS - daysClosed
          }.`;

  return {
    days,
    daysClosed,
    daysHeld,
    daysTotal: WEEK_DAYS,
    weakest,
    meaning:
      daysHeld > 0
        ? `${meaning} ${daysHeld} day${daysHeld === 1 ? " was" : "s were"} held by your provider — that is following instructions, not missing a day, and it is counted as such.`
        : meaning,
  };
}

/**
 * Body composition, reported against the dates it was actually measured on.
 *
 * A scan happens every few weeks. Rather than hide the measure on the weeks it
 * did not, each measure always produces a row — it just moves to `didNotMove`
 * with the age of the last reading on it. "Last measured 11 days ago" is real
 * information; a silently absent row is not.
 */
function bodyMovements(client: Client): Movement[] {
  const scan = getScanForClient(client.id);
  const history = scan?.history ?? [];

  if (history.length < 2) {
    return [
      {
        id: "body",
        label: "Body composition",
        headline: "Nothing measured yet",
        detail:
          "There is no scan history on file to compare against. Your first two scans are what turn this row into a trend.",
        direction: "flat",
        moved: false,
      },
    ];
  }

  const latest = history[history.length - 1];
  const previous = history[history.length - 2];
  const ageDays = daysBetween(latest.date, NOW_DATE);
  const freshThisWeek = ageDays < WEEK_DAYS;
  const span = `measured ${scanDate(previous.date)} and again ${scanDate(latest.date)}`;
  const stale = `Your last scan was ${ageDays} day${ageDays === 1 ? "" : "s"} ago, on ${scanDate(
    latest.date,
  )} — nothing new was measured this week.`;

  const rows: {
    id: string;
    label: string;
    delta: number;
    threshold: number;
    unit: string;
    /** True when a smaller number is the one the member is working toward. */
    downIsBetter: boolean;
  }[] = [
    {
      id: "weight",
      label: "Weight",
      delta: lb(latest.weightKg) - lb(previous.weightKg),
      threshold: THRESHOLD.weightLb,
      unit: "lb",
      downIsBetter: client.goals.includes("Fat loss"),
    },
    {
      id: "bodyfat",
      label: "Body fat",
      delta: Math.round((latest.bodyFatPct - previous.bodyFatPct) * 10) / 10,
      threshold: THRESHOLD.bodyFatPct,
      unit: "%",
      downIsBetter: true,
    },
    {
      id: "lean",
      label: "Lean mass",
      delta: lb(latest.skeletalMuscleKg) - lb(previous.skeletalMuscleKg),
      threshold: THRESHOLD.leanLb,
      unit: "lb",
      downIsBetter: false,
    },
  ];

  return rows.map((r) => {
    const size = Math.round(Math.abs(r.delta) * 10) / 10;
    const significant = size >= r.threshold;
    const down = r.delta < 0;
    const direction: Movement["direction"] = !significant
      ? "flat"
      : down === r.downIsBetter
        ? "better"
        : "worse";

    const amount = `${size}${r.unit === "%" ? "" : " "}${r.unit}`;

    return {
      id: r.id,
      label: r.label,
      /**
       * The headline states THIS WEEK's news, not the most recent change.
       *
       * An earlier version printed "Down 2.2 lb" on a row filed under "what
       * didn't", because the delta was real but three weeks old. A member
       * scanning headlines reads the section title and the number and nothing
       * in between — so under "what didn't", the number is the wrong thing to
       * lead with, and the older change moves down into the detail where its
       * dates travel with it.
       */
      headline: !freshThisWeek
        ? "Not measured this week"
        : significant
          ? `${down ? "Down" : "Up"} ${amount}`
          : "Held steady",
      detail: freshThisWeek
        ? `Both readings off the same device, ${span}, so the difference is the difference.`
        : `${stale} ${
            significant
              ? `Between the two most recent scans it went ${down ? "down" : "up"} ${amount} — ${span}.`
              : `Between the two most recent scans — ${span} — it barely shifted.`
          }`,
      direction: freshThisWeek ? direction : "flat",
      // A change measured three weeks ago is not this week's news, whatever its
      // size. This is the single most important line in the function.
      moved: freshThisWeek && significant,
    };
  });
}

function journalWeek(client: Client): JournalWeek {
  const cutoff = addDays(NOW_DATE, -(WEEK_DAYS - 1));
  const entries = journalFor(client.id).filter((e) => e.date >= cutoff && e.date <= NOW_DATE);

  // Fourteen days, not seven: a seven-point trend on a 1–5 scale is mostly
  // noise, and the review would report a different "mover" every week.
  const trends = SYMPTOMS.map((s) => trendFor(client.id, s.key, 14))
    .filter((t) => t.direction !== "steady")
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  const top = trends[0];
  const meta = top ? SYMPTOMS.find((s) => s.key === top.symptom) : undefined;

  return {
    entries: entries.length,
    daysTotal: WEEK_DAYS,
    mover:
      top && meta
        ? { symptom: top.symptom, label: meta.label, direction: top.direction }
        : undefined,
  };
}

function journalMovement(week: JournalWeek): Movement {
  const logged = week.entries;
  return {
    id: "journal",
    label: "Journal",
    headline: `${logged} of ${week.daysTotal} days logged`,
    detail: week.mover
      ? `Over the last fortnight your ${week.mover.label.toLowerCase()} ratings have been ${
          week.mover.direction
        }. That is your own scoring moving, not a measurement — which is exactly why it is worth telling someone.`
      : logged === 0
        ? "Nothing logged this week. The days you least feel like writing it down are the ones that turn out to mean something later."
        : "Nothing in your ratings has shifted enough over the fortnight to be worth calling a direction.",
    direction:
      week.mover?.direction === "improving"
        ? "better"
        : week.mover?.direction === "slipping"
          ? "worse"
          : "flat",
    moved: logged > 0,
  };
}

// ---------------------------------------------------------------------------
// The one next action
// ---------------------------------------------------------------------------

/**
 * A ladder, not a list.
 *
 * Ordered by what is actually blocked on the member: a lapsed protocol beats a
 * missed journal entry beats a soft nudge. The bottom rung says nothing is
 * waiting on them, because inventing a task to fill the slot is how a weekly
 * screen turns into noise the member learns to skip.
 */
function nextActionFor(client: Client, adherence: Adherence, journal: JournalWeek): NextAction {
  const plan = buildPlanOfCare(client);
  const coach = staffMap[client.coachId];

  // 1 — something the plan explicitly put in the member's own hands.
  //
  // Weeks are counted from the active program's start, not from `joinedOn`,
  // to match /portal's "you're N weeks into a 12-week block". Counting from
  // signup instead would put a member who joined in January permanently past
  // every checkpoint on a plan that started in March, and this ladder would
  // silently skip its top rung forever.
  const activeProgram = client.programs.find((p) => p.status === "Active") ?? client.programs[0];
  const weeksIn = Math.floor(
    (absolute(NOW).getTime() - absolute(activeProgram?.startedOn ?? client.joinedOn).getTime()) /
      (1000 * 60 * 60 * 24 * 7),
  );
  const mine = plan.monitoring.find((m) => m.owner === "Member" && m.week > weeksIn && m.week - weeksIn <= 2);
  if (mine) {
    return {
      id: "checkpoint",
      label: mine.label,
      why: `This one is yours rather than the clinic's, and it is due around week ${mine.week}. ${mine.detail}`,
      href: "/portal/protocol",
    };
  }

  // 2 — running out is the single most common way a protocol quietly ends.
  const tightest = tightestLine(client.id, NOW);
  if (tightest && tightest.status !== "comfortable") {
    return {
      id: "refill",
      label: `Sort out your ${tightest.itemName} refill`,
      why: `You have ${tightest.daysLeft} day${
        tightest.daysLeft === 1 ? "" : "s"
      } of supply left. Running out is the most common reason a protocol stops working, and it is the easiest one to avoid — the refill card on this screen has the button.`,
    };
  }

  // 3 — the log is the only data nobody else can produce for them.
  if (journal.entries < 5) {
    return {
      id: "journal",
      label: "Log a few more days this week",
      why: `You logged ${journal.entries} of the last ${journal.daysTotal}. Your ratings are the only thing in your record that no panel and no scan can produce, and they are what turns "I've felt off" into something ${
        coach?.name ?? "your coach"
      } can actually work with.`,
      href: "/portal/journal",
    };
  }

  // 4 — the ring that actually cost the week.
  if (adherence.weakest && adherence.weakest.daysMissed >= 2) {
    const href =
      adherence.weakest.ring === "fuel"
        ? "/portal/food"
        : adherence.weakest.ring === "train"
          ? "/portal/train"
          : "/portal/protocol";
    return {
      id: `ring-${adherence.weakest.ring}`,
      label: `Look at ${adherence.weakest.label.toLowerCase()}`,
      why: `It was the ring that stayed open on ${adherence.weakest.daysMissed} of the last ${
        adherence.daysTotal
      } days — more than the other two. One thing to change is a better week than three.`,
      href,
    };
  }

  // 5 — a visit worth turning up prepared to.
  const nextAppt = appointmentsForClient(client.id).find((a) => a.start >= NOW);
  if (nextAppt) {
    return {
      id: "visit",
      label: `Bring your journal to ${formatDate(nextAppt.start)}`,
      why: "Fifteen minutes goes fast. Walking in with a fortnight of your own ratings is the difference between being asked how you've been and being able to answer it.",
      href: "/portal/journal",
    };
  }

  return {
    id: "nothing",
    label: "Nothing is waiting on you",
    why: "Genuinely — no checkpoint due, no refill to chase, nothing open. Have a look at the three-month view if you want something to read, or close the app.",
    href: "/portal/progress",
  };
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export function weeklyReview(client: Client): WeeklyReview {
  const adherence = adherenceFor(client);
  const journal = journalWeek(client);

  const all = [...bodyMovements(client), journalMovement(journal)];
  const moved = all.filter((m) => m.moved);
  const didNotMove = all.filter((m) => !m.moved);

  /**
   * Three headlines, because there are genuinely three kinds of week.
   *
   * Counting the movers ("2 things moved") read badly the moment the only
   * mover was the journal — and calling a week's journal entries "new numbers
   * worth a look" is the same overclaim in a different suit. On a plan
   * measured every few weeks the middle case is the common one, so it gets its
   * own sentence rather than being rounded up into the good case or down into
   * the quiet one. None of the three is written as an apology: a quiet week is
   * most weeks, and a screen that treats that as a disappointment teaches the
   * member to read it as one.
   */
  const measured = moved.some((m) => m.id !== "journal");
  const opener = `${adherence.daysClosed} of ${WEEK_DAYS} days came together`;

  const headline = measured
    ? `${opener}, and there are new numbers worth a look.`
    : journal.entries > 0
      ? `${opener}, and nothing new got measured — but you logged ${journal.entries} day${
          journal.entries === 1 ? "" : "s"
        }, which is the part only you can do.`
      : `${opener}, and nothing new got measured. Most weeks look like this — the work still happened.`;

  return {
    weekStart: addDays(NOW_DATE, -(WEEK_DAYS - 1)),
    weekEnd: NOW_DATE,
    headline,
    moved,
    didNotMove,
    adherence,
    journal,
    next: nextActionFor(client, adherence, journal),
    footnote:
      "There is no streak to lose on this screen. A week that fell apart is information for your coach, not a debt you owe the app.",
  };
}
