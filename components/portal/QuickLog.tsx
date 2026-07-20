"use client";

import { useState } from "react";
import { Check, Scale, Pencil } from "lucide-react";
import { useMemberLog } from "@/lib/member/logStore";
import { cn } from "@/lib/utils";

/**
 * Weight and how-you-feel, logged in place.
 *
 * Both of these previously lived on other screens — weight on Progress, mood and
 * energy on the Journal — which meant a member who wanted to record their
 * morning had to visit three routes and remember which one held what. The
 * dashboard showed the resulting numbers and offered no way to add to them.
 *
 * Everything here is one tap or one short number. No sliders: dragging a slider
 * accurately on a phone is fiddly enough that people abandon it, and a value
 * nobody finishes entering is worse than a coarse one they do.
 *
 * There is no streak and no score attached to any of this. The reward for
 * logging is that the next conversation with a coach is better informed, and
 * that claim is made explicitly rather than dressed up as a game.
 */

interface Question {
  key: string;
  label: string;
  low: string;
  high: string;
}

const FEEL: Question[] = [
  { key: "energy", label: "Energy", low: "Empty", high: "Full" },
  { key: "sleep", label: "Sleep", low: "Bad", high: "Great" },
  { key: "soreness", label: "Body", low: "Beaten up", high: "Ready" },
  { key: "mood", label: "Head", low: "Flat", high: "Sharp" },
];

const SCALE = [1, 2, 3, 4, 5];

export function QuickLog() {
  const { today, logWeight, logFeel } = useMemberLog();
  const [weight, setWeight] = useState("");
  const [answers, setAnswers] = useState<Record<string, number>>({});

  const feelDone = today.feel ?? null;
  const current = feelDone ?? answers;
  const answeredCount = Object.keys(current).length;

  function setAnswer(key: string, value: number) {
    const next = { ...answers, [key]: value };
    setAnswers(next);
    // Commit as soon as all four are in. No submit button — the last tap IS
    // the submit, and an extra confirmation press carries no information.
    if (Object.keys(next).length === FEEL.length) logFeel(next);
  }

  return (
    <div className="space-y-6">
      {/* ---- Weight ------------------------------------------------------- */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Scale className="h-4 w-4 text-ink-500" aria-hidden />
          <h3 className="text-micro uppercase text-ink-400">Weight</h3>
        </div>

        {today.weightLb !== undefined ? (
          <div className="flex items-center gap-3 rounded-panel border border-optimal/25 bg-optimal/5 px-4 py-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-optimal/15 text-optimal">
              <Check className="h-4 w-4" />
            </span>
            <p className="flex-1 text-body text-ink-100">
              <span className="stat-mono">{today.weightLb}</span> lb logged
            </p>
            <button
              type="button"
              onClick={() => logWeight(NaN as unknown as number)}
              className="hidden"
              aria-hidden
            />
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(weight);
              if (Number.isFinite(n) && n > 0) logWeight(n);
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="Today's weight"
                aria-label="Today's weight in pounds"
                className="h-11 w-full rounded-control border border-ink-700 bg-ink-900/70 px-3 pr-10 text-body text-ink-100 placeholder:text-ink-500 focus-ring"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-detail text-ink-500">
                lb
              </span>
            </div>
            <button
              type="submit"
              disabled={!weight}
              className="focus-ring rounded-control bg-ink-700 px-4 py-2.5 text-body font-medium text-ink-50 transition-colors hover:bg-ink-600 disabled:opacity-40"
            >
              Log
            </button>
          </form>
        )}
      </div>

      {/* ---- How you feel -------------------------------------------------- */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-ink-500" aria-hidden />
            <h3 className="text-micro uppercase text-ink-400">How you feel</h3>
          </div>
          {feelDone ? (
            <span className="inline-flex items-center gap-1 text-detail text-optimal">
              <Check className="h-3.5 w-3.5" />
              Logged
            </span>
          ) : (
            <span className="stat-mono text-micro text-ink-500">
              {answeredCount} of {FEEL.length}
            </span>
          )}
        </div>

        <div className="space-y-3">
          {FEEL.map((q) => {
            const value = current[q.key];
            return (
              <div key={q.key}>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-detail text-ink-200">{q.label}</span>
                  <span className="text-micro text-ink-600">
                    {q.low} → {q.high}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {SCALE.map((v) => {
                    const active = value === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        disabled={!!feelDone}
                        onClick={() => setAnswer(q.key, v)}
                        aria-label={`${q.label}: ${v} out of 5`}
                        aria-pressed={active}
                        className={cn(
                          "focus-ring flex-1 rounded-control border py-2.5 stat-mono text-detail transition-colors",
                          active
                            ? "border-gold-400/50 bg-gold-400/15 text-gold-200"
                            : "border-ink-700 bg-ink-800/50 text-ink-400 hover:border-ink-500 hover:text-ink-100",
                          feelDone && !active && "opacity-40",
                        )}
                      >
                        {v}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-3 text-micro leading-relaxed text-ink-500">
          {feelDone
            ? "Your coach reads this before your next call. A run of low days is worth raising — that is what it is for."
            : "Four taps. Your coach reads the pattern, not the perfect record, so a missed day costs nothing."}
        </p>
      </div>
    </div>
  );
}
