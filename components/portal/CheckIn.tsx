"use client";

import { useState } from "react";
import { Check, ChevronRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * The daily check-in.
 *
 * The brief was "make collecting data from clients fun, I don't want it to be
 * boring". The instinct behind that is right, but the usual reading of it —
 * confetti, points, a mascot — is exactly wrong for this audience. These are
 * adult men paying out of pocket for medical care, and rewarding them with
 * sparkles for reporting their own symptoms is patronising in a way that makes
 * a serious product feel like a toy.
 *
 * What actually makes a form pleasant to fill in:
 *
 *   1. IT IS SHORT AND IT LOOKS SHORT. One question on screen at a time, with
 *      the remaining count visible, so there is no scroll of dread.
 *   2. IT COSTS ONE TAP. Ratings are taps, not sliders or keyboards. A slider
 *      on a phone is a fiddly drag that people abandon.
 *   3. IT ANSWERS BACK. The last step shows what the answers connect to — the
 *      marker a coach will look at, the trend it feeds. A member who sees their
 *      input land somewhere will do it again; one who suspects it vanishes into
 *      a database will not. This is the actual retention mechanic, and it is
 *      honest rather than manipulative.
 *
 * So there is no streak pressure here, no score, and no penalty for a gap. The
 * reward for answering is a better conversation with a coach, which is the real
 * thing being sold.
 */

interface Question {
  key: string;
  prompt: string;
  /** What a low and high answer mean, in the member's own terms. */
  low: string;
  high: string;
  /** Plain-language note on where this ends up. Shown on the summary. */
  feeds: string;
}

const QUESTIONS: Question[] = [
  {
    key: "energy",
    prompt: "How was your energy today?",
    low: "Running on empty",
    high: "Plenty in the tank",
    feeds: "Energy is the first thing your coach reads before a call, and it is what a thyroid or iron panel gets checked against.",
  },
  {
    key: "sleep",
    prompt: "How did you sleep last night?",
    low: "Badly",
    high: "Straight through",
    feeds: "Sleep moves almost everything else. A run of poor nights is worth raising before it shows up in your other numbers.",
  },
  {
    key: "soreness",
    prompt: "How does your body feel?",
    low: "Beaten up",
    high: "Ready to train",
    feeds: "Recovery tells your coach whether training load is right, and whether a joint complaint is settling or not.",
  },
  {
    key: "mood",
    prompt: "And your head?",
    low: "Flat",
    high: "Sharp",
    feeds: "Mood and drive are part of the clinical picture in men's health, not a soft extra.",
  },
];

const SCALE = [1, 2, 3, 4, 5];

export function CheckIn({ onDone }: { onDone?: (answers: Record<string, number>) => void }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});

  const done = step >= QUESTIONS.length;
  const q = QUESTIONS[step];

  function answer(value: number) {
    const next = { ...answers, [q.key]: value };
    setAnswers(next);
    // Advance immediately. A confirm button on a one-tap question is a second
    // tap for no information.
    setStep((s) => s + 1);
    if (step + 1 >= QUESTIONS.length) onDone?.(next);
  }

  if (done) {
    return (
      <div className="rounded-panel border border-ink-800 bg-ink-900/40 p-5">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-optimal/15 text-optimal">
            <Check className="h-3.5 w-3.5" />
          </span>
          <p className="text-heading text-ink-50">Logged. That took about fifteen seconds.</p>
        </div>

        {/* The payoff. Not a score — a straight answer to "why did I bother". */}
        <p className="mt-3 text-detail text-ink-400">Where today&apos;s answers go:</p>
        <ul className="mt-2 space-y-2.5">
          {QUESTIONS.map((item) => (
            <li key={item.key} className="flex gap-2.5">
              <span className="stat-mono mt-0.5 w-6 shrink-0 text-detail text-ink-500">
                {answers[item.key]}/5
              </span>
              <span className="min-w-0 text-detail leading-relaxed text-ink-300">{item.feeds}</span>
            </li>
          ))}
        </ul>

        <p className="mt-4 border-t border-ink-800/70 pt-3 text-micro leading-relaxed text-ink-500">
          Miss a day and nothing is lost — there is no streak to protect here. Your coach reads the
          pattern, not the perfect record.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-panel border border-ink-800 bg-ink-900/40 p-5">
      <div className="flex items-center justify-between">
        <Badge tone="neutral">
          <Sparkles className="h-3 w-3" />
          Daily check-in
        </Badge>
        {/* The remaining count is visible from the first screen. A form whose
            length is unknown feels longer than one that says "four taps". */}
        <span className="stat-mono text-micro text-ink-500">
          {step + 1} of {QUESTIONS.length}
        </span>
      </div>

      <p className="mt-4 text-title leading-tight text-ink-50">{q.prompt}</p>

      <div className="mt-5 flex items-stretch gap-2">
        {SCALE.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => answer(v)}
            aria-label={`${v} out of 5`}
            className={cn(
              "focus-ring flex-1 rounded-control border border-ink-700 bg-ink-800/60 py-3.5",
              "stat-mono text-heading text-ink-200 transition-colors",
              "hover:border-ink-500 hover:bg-ink-800 hover:text-ink-50",
            )}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between text-micro text-ink-500">
        <span>{q.low}</span>
        <span>{q.high}</span>
      </div>

      {step > 0 && (
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="focus-ring mt-4 inline-flex items-center gap-1 text-detail text-ink-500 transition-colors hover:text-ink-200"
        >
          <ChevronRight className="h-3.5 w-3.5 rotate-180" />
          Back
        </button>
      )}
    </div>
  );
}
