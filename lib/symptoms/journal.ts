import type { Biomarker, Symptom } from "@/lib/types";
import { getClient } from "@/lib/mock/clients";
import { getLabsForClient } from "@/lib/mock/labs";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { buildPlanOfCare } from "@/lib/planOfCare/engine";
import { focusKindFor } from "@/lib/training/workouts";
import { seededRandom, clamp, absolute } from "@/lib/utils";

/**
 * SYMPTOM JOURNAL.
 *
 * The thing a member actually knows that no panel can tell us: how they feel,
 * day by day. Six one-to-five ratings and a sentence. The value is not the log,
 * it is what the log lines up against — "I feel awful on Thursdays" becomes a
 * pattern a coach can act on, and a slow slide in energy becomes visible next to
 * the panel that was drawn in the middle of it.
 *
 * ══ THE HARD RULE ═════════════════════════════════════════════════════════
 *
 * CORRELATION IS NOT CAUSATION, AND THIS FILE IS MEMBER-FACING.
 *
 * Everything `correlate()` returns is a *question to bring to a human*, never a
 * finding, never an explanation, never a diagnosis. Two series moving together
 * over five paired points is, statistically, almost nothing — and the member
 * reading it at 6am has no clinician standing next to them to say so. So:
 *
 *   - Every correlation carries its own `caution` string. There is no path
 *     through this module that produces a relationship without one.
 *   - Every correlation carries `askYourCoach` — the sentence the member is
 *     meant to leave with.
 *   - `pairs` (the sample size) is part of the returned shape, not optional, so
 *     a UI cannot render the strength while hiding how thin the evidence is.
 *   - The wording is deliberately hedged in the data, not just in the CSS.
 *     "Moved together" — never "caused", "explains", "because of", "due to".
 *   - Weak relationships are dropped entirely rather than shown as weak. A
 *     member cannot un-see a suggestion once it has been made.
 *
 * If you extend this file, the test is simple: could a member screenshot the
 * string you added and read it as their clinic telling them what is wrong with
 * them? If yes, rewrite it.
 */

const NOW_DATE = "2026-06-12";

/** The disclaimer. Rendered on the page, not buried in a tooltip. */
export const CORRELATION_DISCLAIMER =
  "These are patterns in numbers, nothing more. Two things moving together does not mean one caused the other — the real reason is often something neither line is measuring, and a handful of data points can line up by pure chance. Nothing here is a diagnosis or a result. Bring anything that looks interesting to your coach or provider and let them tell you whether it means anything.";

// ---------------------------------------------------------------------------
// What we ask
// ---------------------------------------------------------------------------

export type SymptomKey =
  | "energy"
  | "sleepQuality"
  | "mood"
  | "libido"
  | "jointPain"
  | "brainFog";

export interface SymptomMeta {
  key: SymptomKey;
  label: string;
  /** The question as the member reads it. */
  prompt: string;
  /**
   * Whether 5 is the good end. Joint pain and brain fog are inverted, and
   * getting this wrong would flip the direction of every trend arrow on the
   * page — so it is data, not something each component decides for itself.
   */
  higherIsBetter: boolean;
  /** Words for 1 and 5, so the member is never rating a bare number. */
  scale: [string, string, string, string, string];
}

export const SYMPTOMS: SymptomMeta[] = [
  {
    key: "energy",
    label: "Energy",
    prompt: "How was your energy today?",
    higherIsBetter: true,
    scale: ["Running on empty", "Low", "Okay", "Good", "Genuinely great"],
  },
  {
    key: "sleepQuality",
    label: "Sleep",
    prompt: "How well did you sleep last night?",
    higherIsBetter: true,
    scale: ["Barely slept", "Broken", "Alright", "Solid", "Slept like a rock"],
  },
  {
    key: "mood",
    label: "Mood",
    prompt: "How did you feel in yourself today?",
    higherIsBetter: true,
    scale: ["Really low", "Flat", "Even", "Good", "Great"],
  },
  {
    key: "libido",
    label: "Libido",
    prompt: "How was your sex drive?",
    higherIsBetter: true,
    scale: ["Absent", "Low", "Normal for me", "Strong", "Very strong"],
  },
  {
    key: "jointPain",
    label: "Joint pain",
    prompt: "How much did your joints bother you?",
    higherIsBetter: false,
    scale: ["None at all", "A twinge", "Noticeable", "Sore all day", "Really painful"],
  },
  {
    key: "brainFog",
    label: "Brain fog",
    prompt: "How clear was your thinking?",
    higherIsBetter: false,
    scale: ["Sharp", "Mostly clear", "A bit foggy", "Hard to focus", "Couldn't think straight"],
  },
];

export const symptomMeta: Record<SymptomKey, SymptomMeta> = Object.fromEntries(
  SYMPTOMS.map((s) => [s.key, s]),
) as Record<SymptomKey, SymptomMeta>;

export interface JournalEntry {
  id: string;
  clientId: string;
  /** Date only, YYYY-MM-DD. A journal entry is a day, not an instant. */
  date: string;
  scores: Record<SymptomKey, number>;
  note?: string;
}

// ---------------------------------------------------------------------------
// Dates — all date-only, all derived from the pinned NOW
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(d: string): Date {
  // Midday avoids any DST edge shunting a date-only value into the day before.
  return absolute(`${d}T12:00:00`);
}

export function addDays(date: string, n: number): string {
  const d = absolute(toDate(date).getTime() + n * DAY_MS);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY_MS);
}

/** 0 = Sunday, matching Date#getDay. */
export function dayOfWeek(date: string): number {
  return toDate(date).getDay();
}

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Short form used by the plan's training split. */
const SPLIT_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ---------------------------------------------------------------------------
// The log
// ---------------------------------------------------------------------------

/** How much history the journal holds. */
export const JOURNAL_DAYS = 120;

/**
 * Baseline for one symptom, anchored to what the member actually told us.
 *
 * A member who reported "Low energy" at intake should not open their journal to
 * a 90-day history of fours. The baselines below read the client's own symptom
 * list so the log is consistent with the rest of their record.
 */
function baselineFor(clientId: string, key: SymptomKey): number {
  const client = getClient(clientId);
  if (!client) return 3;
  const has = (s: Symptom) => client.symptoms.includes(s);

  switch (key) {
    case "energy":
      return has("Low energy") ? 2.4 : 3.6;
    case "sleepQuality":
      return has("Poor sleep") ? 2.3 : 3.5;
    case "mood":
      return has("Mood changes") || has("Elevated stress") ? 2.7 : 3.5;
    case "libido":
      return has("Low libido") ? 2.2 : 3.4;
    case "jointPain":
      return has("Joint pain") ? 3.2 : 1.8;
    case "brainFog":
      return has("Brain fog") ? 3.3 : 1.9;
  }
}

/**
 * The weekday a member's week reliably sags on.
 *
 * Real logs have a shape — a heavy training day, a bad standing meeting, the
 * back end of a working week — and a journal that is pure noise would never
 * surface the pattern the feature exists to surface. Derived per member so it
 * is stable forever, and confined to Mon–Fri because that is where the effect
 * lives for most people.
 */
function roughWeekday(clientId: string): number {
  return 1 + Math.floor(seededRandom(clientId + "week-rhythm")() * 5);
}

/**
 * Generate the member's log.
 *
 * Deterministic: same client, same 120 entries, forever. Composed from four
 * parts so that each of them is something `correlate()` can honestly find —
 * a baseline, a slow trend, a weekday rhythm, and day-to-day noise.
 */
function buildJournal(clientId: string): JournalEntry[] {
  const client = getClient(clientId);
  if (!client) return [];

  const rough = roughWeekday(clientId);
  const onProgram = client.programs.length > 0;
  const start = addDays(NOW_DATE, -(JOURNAL_DAYS - 1));

  const entries: JournalEntry[] = [];

  for (let i = 0; i < JOURNAL_DAYS; i++) {
    const date = addDays(start, i);
    const t = i / (JOURNAL_DAYS - 1); // 0 at the oldest entry, 1 today
    const dow = dayOfWeek(date);

    // A member on an active program drifts toward better over the window. One
    // who is not drifts very slightly, which is its own honest signal. Kept
    // modest deliberately — a larger drift pins every rating against the top of
    // the scale by the end of the window, which reads as fiction.
    const drift = (onProgram ? 0.7 : 0.15) * t;

    const scores = {} as Record<SymptomKey, number>;
    for (const meta of SYMPTOMS) {
      const rand = seededRandom(`${clientId}|${date}|${meta.key}`);
      const base = baselineFor(clientId, meta.key);

      const dir = meta.higherIsBetter ? 1 : -1;
      const weekdayHit = dow === rough ? -0.75 * dir : dow === 0 || dow === 6 ? 0.3 * dir : 0;
      const noise = (rand() - 0.5) * 1.1;

      scores[meta.key] = clamp(
        Math.round((base + drift * dir + weekdayHit + noise) * 2) / 2,
        1,
        5,
      );
    }

    // Notes are sparse, because real ones are. Roughly one day in five.
    const noteRand = seededRandom(`${clientId}|${date}|note`);
    const note = noteRand() < 0.2 ? noteFor(scores, dow, rough, noteRand()) : undefined;

    entries.push({ id: `jrnl-${clientId}-${date}`, clientId, date, scores, note });
  }

  return entries;
}

/** Free-text drawn from the day's own worst rating, so notes read as coherent. */
function noteFor(
  scores: Record<SymptomKey, number>,
  dow: number,
  rough: number,
  r: number,
): string {
  const worst = SYMPTOMS.slice().sort((a, b) => {
    const aBad = a.higherIsBetter ? 5 - scores[a.key] : scores[a.key];
    const bBad = b.higherIsBetter ? 5 - scores[b.key] : scores[b.key];
    return bBad - aBad || (a.key < b.key ? -1 : 1);
  })[0];

  const pools: Record<SymptomKey, string[]> = {
    energy: [
      "Dragged through the afternoon. Coffee did nothing.",
      "Good energy right through to the evening for once.",
      "Fine in the morning, gone by 3pm.",
    ],
    sleepQuality: [
      "Woke up around 3 and never really got back under.",
      "Slept through. First time in a while.",
      "Went down fine but woke up feeling like I hadn't slept.",
    ],
    mood: [
      "Short-tempered with everyone today and not sure why.",
      "Felt properly like myself today.",
      "Flat. Not down exactly, just flat.",
    ],
    libido: [
      "Noticed a difference this week.",
      "Nothing much there at the moment.",
      "Back to what feels normal for me.",
    ],
    jointPain: [
      "Right shoulder complained the whole session.",
      "Knees fine today. Good session.",
      "Stiff getting out of the car. Loosened up after a walk.",
    ],
    brainFog: [
      "Reread the same email four times.",
      "Sharp today — got through the whole list.",
      "Words kept slipping in the meeting.",
    ],
  };

  const pool = pools[worst.key];
  const base = pool[Math.floor(r * pool.length) % pool.length];
  return dow === rough ? `${base} Same as most weeks on this day.` : base;
}

const journalCache = new Map<string, JournalEntry[]>();

/** The member's full log, newest first. */
export function journalFor(clientId: string): JournalEntry[] {
  let cached = journalCache.get(clientId);
  if (!cached) {
    cached = buildJournal(clientId);
    journalCache.set(clientId, cached);
  }
  return cached;
}

export function entryOn(clientId: string, date: string): JournalEntry | undefined {
  return journalFor(clientId).find((e) => e.date === date);
}

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

export interface TrendPoint {
  date: string;
  value: number;
}

export interface Trend {
  symptom: SymptomKey;
  days: number;
  points: TrendPoint[];
  /** Seven-day rolling average — what the member should actually read. */
  smoothed: TrendPoint[];
  average: number;
  first: number;
  last: number;
  /** Phrased in terms of better/worse, not up/down, because two are inverted. */
  direction: "improving" | "steady" | "slipping";
  /** Change in points on the 1–5 scale, signed toward "better". */
  change: number;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function trendFor(clientId: string, symptom: SymptomKey, days = 30): Trend {
  const meta = symptomMeta[symptom];
  const all = journalFor(clientId);
  const cutoff = addDays(NOW_DATE, -(days - 1));
  const points = all
    .filter((e) => e.date >= cutoff)
    .map((e) => ({ date: e.date, value: e.scores[symptom] }));

  // Seven-day rolling mean. Day-to-day ratings are noisy enough that showing
  // the raw line alone would have a member reacting to a single bad Tuesday.
  const smoothed = points.map((p, i) => {
    const window = points.slice(Math.max(0, i - 6), i + 1).map((x) => x.value);
    return { date: p.date, value: Math.round(mean(window) * 100) / 100 };
  });

  const third = Math.max(1, Math.floor(points.length / 3));
  const first = mean(points.slice(0, third).map((p) => p.value));
  const last = mean(points.slice(-third).map((p) => p.value));

  const raw = last - first;
  const change = meta.higherIsBetter ? raw : -raw;

  return {
    symptom,
    days,
    points,
    smoothed,
    average: Math.round(mean(points.map((p) => p.value)) * 10) / 10,
    first: Math.round(first * 10) / 10,
    last: Math.round(last * 10) / 10,
    direction: change > 0.25 ? "improving" : change < -0.25 ? "slipping" : "steady",
    change: Math.round(change * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// Weekday rhythm — "I feel awful on Thursdays"
// ---------------------------------------------------------------------------

export interface WeekdayPattern {
  symptom: SymptomKey;
  /** Average rating for each weekday, index 0 = Sunday. */
  byWeekday: number[];
  /** The weekday that averages worst for this symptom. */
  worstDay: number;
  worstAverage: number;
  otherAverage: number;
  /** How much worse, in points on the 1–5 scale. Always positive. */
  gap: number;
  /**
   * Whether the gap is big enough to be worth showing at all. Still not proof
   * of anything — just the floor below which we stay quiet.
   */
  worthMentioning: boolean;
  daysCounted: number;
}

export function weekdayPattern(
  clientId: string,
  symptom: SymptomKey,
  days = 90,
): WeekdayPattern {
  const meta = symptomMeta[symptom];
  const cutoff = addDays(NOW_DATE, -(days - 1));
  const entries = journalFor(clientId).filter((e) => e.date >= cutoff);

  const buckets: number[][] = [[], [], [], [], [], [], []];
  for (const e of entries) buckets[dayOfWeek(e.date)].push(e.scores[symptom]);

  const byWeekday = buckets.map((b) => Math.round(mean(b) * 100) / 100);

  // "Worst" depends on which end of the scale is good.
  let worstDay = 0;
  for (let d = 1; d < 7; d++) {
    const better = meta.higherIsBetter
      ? byWeekday[d] < byWeekday[worstDay]
      : byWeekday[d] > byWeekday[worstDay];
    if (better) worstDay = d;
  }

  const others = entries
    .filter((e) => dayOfWeek(e.date) !== worstDay)
    .map((e) => e.scores[symptom]);

  const worstAverage = byWeekday[worstDay];
  const otherAverage = Math.round(mean(others) * 100) / 100;
  const gap = Math.round(Math.abs(otherAverage - worstAverage) * 100) / 100;

  return {
    symptom,
    byWeekday,
    worstDay,
    worstAverage,
    otherAverage,
    gap,
    worthMentioning: gap >= 0.4 && buckets[worstDay].length >= 6,
    daysCounted: buckets[worstDay].length,
  };
}

// ---------------------------------------------------------------------------
// Correlation
// ---------------------------------------------------------------------------

export type CorrelationKind = "lab" | "body composition" | "routine";

export interface Correlation {
  id: string;
  kind: CorrelationKind;
  symptom: SymptomKey;
  /** What the symptom was lined up against, in the member's words. */
  against: string;
  /** Pearson r, kept for provenance. UIs should show `strength`, not this. */
  r: number;
  /** How many paired observations produced `r`. Never hidden. */
  pairs: number;
  strength: "moved closely" | "moved loosely";
  /** Whether they moved in the same direction, phrased for a member. */
  plain: string;
  /** The hedge. Always present, always rendered. */
  caution: string;
  /** What the member should actually do with this. */
  askYourCoach: string;
}

/** Pearson product-moment correlation. Returns 0 when it cannot be computed. */
function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

/** Average symptom rating over the `window` days ending on `date`, inclusive. */
function symptomAround(
  entries: JournalEntry[],
  symptom: SymptomKey,
  date: string,
  window = 7,
): number | undefined {
  const from = addDays(date, -(window - 1));
  const vals = entries
    .filter((e) => e.date >= from && e.date <= date)
    .map((e) => e.scores[symptom]);
  return vals.length >= 3 ? mean(vals) : undefined;
}

/** The floor for showing anything at all. Below this we stay silent. */
const R_FLOOR = 0.45;
const R_CLOSE = 0.7;

const CAUTION =
  "This is two lines moving together, and that is all it is. It does not mean one changed the other, and with this few points it could easily be chance.";

function directionPhrase(r: number, symptomLabel: string, againstLabel: string): string {
  return r > 0
    ? `Weeks where your ${symptomLabel.toLowerCase()} ratings were higher were also weeks where your ${againstLabel} was higher.`
    : `Weeks where your ${symptomLabel.toLowerCase()} ratings were higher were also weeks where your ${againstLabel} was lower.`;
}

/**
 * Look for places the member's own ratings line up with something else in their
 * record. Three sources, all of which are already in the chart:
 *
 *   lab              — biomarker history, paired to the week before each draw
 *   body composition — scan history, paired the same way
 *   routine          — how a symptom rates on the days their plan schedules a
 *                      hard session versus the days it does not
 *
 * Returned strongest-first, and hard-capped: a wall of "possible patterns" is a
 * wall of things a member will worry about, and the fifth-strongest is never
 * the one worth their coach's time.
 */
export function correlate(clientId: string, limit = 4): Correlation[] {
  const client = getClient(clientId);
  if (!client) return [];

  const entries = journalFor(clientId);
  if (entries.length < 14) return [];

  const out: Correlation[] = [];

  // ── Labs ────────────────────────────────────────────────────────────────
  const labs = getLabsForClient(clientId);
  const tracked: Biomarker[] = (labs?.biomarkers ?? []).filter(
    (b) => (b.history?.length ?? 0) >= 4,
  );

  for (const meta of SYMPTOMS) {
    for (const marker of tracked) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const h of marker.history ?? []) {
        const s = symptomAround(entries, meta.key, h.date);
        if (s !== undefined) {
          xs.push(s);
          ys.push(h.value);
        }
      }
      if (xs.length < 4) continue;

      const r = pearson(xs, ys);
      if (Math.abs(r) < R_FLOOR) continue;

      out.push({
        id: `corr-lab-${meta.key}-${marker.key}`,
        kind: "lab",
        symptom: meta.key,
        against: marker.name,
        r: Math.round(r * 100) / 100,
        pairs: xs.length,
        strength: Math.abs(r) >= R_CLOSE ? "moved closely" : "moved loosely",
        plain: directionPhrase(r, meta.label, `${marker.name} result`),
        caution: `${CAUTION} There are only ${xs.length} panels behind this.`,
        askYourCoach: `Worth asking at your next check-in whether your ${meta.label.toLowerCase()} ratings are worth reading alongside your ${marker.name}.`,
      });
    }
  }

  // ── Body composition ────────────────────────────────────────────────────
  const scan = getScanForClient(clientId);
  const scanHistory = scan?.history ?? [];
  if (scanHistory.length >= 4) {
    const measures: { label: string; pick: (h: (typeof scanHistory)[number]) => number }[] = [
      { label: "body fat percentage", pick: (h) => h.bodyFatPct },
      { label: "weight", pick: (h) => h.weightKg },
      { label: "muscle mass", pick: (h) => h.skeletalMuscleKg },
    ];

    for (const meta of SYMPTOMS) {
      for (const m of measures) {
        const xs: number[] = [];
        const ys: number[] = [];
        for (const h of scanHistory) {
          const s = symptomAround(entries, meta.key, h.date);
          if (s !== undefined) {
            xs.push(s);
            ys.push(m.pick(h));
          }
        }
        if (xs.length < 4) continue;

        const r = pearson(xs, ys);
        if (Math.abs(r) < R_FLOOR) continue;

        out.push({
          id: `corr-body-${meta.key}-${m.label.replace(/\s+/g, "-")}`,
          kind: "body composition",
          symptom: meta.key,
          against: m.label,
          r: Math.round(r * 100) / 100,
          pairs: xs.length,
          strength: Math.abs(r) >= R_CLOSE ? "moved closely" : "moved loosely",
          plain: directionPhrase(r, meta.label, m.label),
          caution: `${CAUTION} There are only ${xs.length} scans behind this.`,
          askYourCoach: `If this one matters to you, ask your coach to look at your ${meta.label.toLowerCase()} log next to your scan history.`,
        });
      }
    }
  }

  // ── Routine ─────────────────────────────────────────────────────────────
  // Training days versus everything else. Both series come from the member's
  // own plan and their own log — nothing is inferred about what they did.
  const plan = buildPlanOfCare(client);
  const hardDays = new Set(
    plan.trainingSplit
      .filter((b) => {
        const k = focusKindFor(b.focus);
        return k !== "rest" && k !== "mobility";
      })
      .map((b) => b.day),
  );

  if (hardDays.size >= 2 && hardDays.size <= 5) {
    for (const meta of SYMPTOMS) {
      const on: number[] = [];
      const off: number[] = [];
      for (const e of entries) {
        const short = SPLIT_DAY[dayOfWeek(e.date)];
        (hardDays.has(short) ? on : off).push(e.scores[meta.key]);
      }
      if (on.length < 10 || off.length < 10) continue;

      const diff = mean(on) - mean(off);
      if (Math.abs(diff) < 0.35) continue;

      const better = meta.higherIsBetter ? diff > 0 : diff < 0;
      out.push({
        id: `corr-routine-${meta.key}`,
        kind: "routine",
        symptom: meta.key,
        against: "training days",
        // Not a Pearson r — a standardised gap, kept on the same field so the
        // shape stays uniform. `pairs` makes the difference legible.
        r: Math.round(diff * 100) / 100,
        pairs: on.length + off.length,
        strength: Math.abs(diff) >= 0.6 ? "moved closely" : "moved loosely",
        plain: `On the days your plan schedules a session, your ${meta.label.toLowerCase()} ratings average ${Math.abs(
          Math.round(diff * 10) / 10,
        )} ${better ? "better" : "worse"} than on the days it does not.`,
        caution: `${CAUTION} Training days also differ from rest days in a dozen other ways — when you eat, when you wake up, what your week looks like.`,
        askYourCoach: `Mention this to your coach — how your ${meta.label.toLowerCase()} sits around sessions is the kind of thing that changes how a week is laid out.`,
      });
    }
  }

  /**
   * ONE PER SYMPTOM, ONE PER SOURCE.
   *
   * Without this, the list is four restatements of a single relationship: body
   * fat, weight and muscle mass are three views of the same scan, so a symptom
   * that tracks one tracks all three, and a member reads three independent
   * confirmations of something that was only ever one observation. Showing the
   * same signal repeatedly is how a hedge stops being believed.
   */
  const bySymptom = new Set<SymptomKey>();
  const perKind = new Map<CorrelationKind, number>();

  return out
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r) || (a.id < b.id ? -1 : 1))
    .filter((c) => {
      const kindCount = perKind.get(c.kind) ?? 0;
      // Two per source as well as one per symptom: four lab pairings in a row
      // is one observation wearing four hats, and it reads as a pile-on.
      if (bySymptom.has(c.symptom) || kindCount >= 2) return false;
      bySymptom.add(c.symptom);
      perKind.set(c.kind, kindCount + 1);
      return true;
    })
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface JournalSummary {
  entries: number;
  /** Days out of the last 30 with an entry. The honest adherence number. */
  loggedLast30: number;
  trends: Trend[];
  /** The weekday pattern most worth surfacing, if any is. */
  rhythm?: WeekdayPattern;
}

export function summaryFor(clientId: string, days = 30): JournalSummary {
  const entries = journalFor(clientId);
  const cutoff = addDays(NOW_DATE, -29);
  const trends = SYMPTOMS.map((s) => trendFor(clientId, s.key, days));

  const rhythms = SYMPTOMS.map((s) => weekdayPattern(clientId, s.key))
    .filter((p) => p.worthMentioning)
    .sort((a, b) => b.gap - a.gap || (a.symptom < b.symptom ? -1 : 1));

  return {
    entries: entries.length,
    loggedLast30: entries.filter((e) => e.date >= cutoff).length,
    trends,
    rhythm: rhythms[0],
  };
}
