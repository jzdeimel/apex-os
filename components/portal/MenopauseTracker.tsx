"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Flower2, Check, Info } from "lucide-react";
import { getClient } from "@/lib/mock/clients";

/**
 * Menopause symptom tracker — the member's own read on how she actually feels,
 * which in perimenopause is more useful than a single lab draw. Hot flushes,
 * sleep, mood, drive, brain fog: the pattern over weeks is what a provider tunes
 * HRT against. One tap per item, no scroll of dread, and it says where the
 * answers go.
 *
 * Female members only — renders nothing for anyone else. Persisted locally on
 * the same hydration-safe terms as the rest of the member logs.
 */

const KEY = "apex_menopause_v1";

interface Question {
  key: string;
  prompt: string;
  low: string;
  high: string;
}

// Scored so 5 is always "good" — fewer flushes, better sleep — to keep the scale
// coherent with the rest of the check-ins.
const QUESTIONS: Question[] = [
  { key: "hotFlushes", prompt: "Hot flushes & night sweats today?", low: "Constant", high: "None" },
  { key: "sleep", prompt: "How did you sleep?", low: "Broken", high: "Straight through" },
  { key: "mood", prompt: "Mood & irritability?", low: "All over the place", high: "Steady" },
  { key: "energy", prompt: "Energy?", low: "Drained", high: "Good" },
  { key: "drive", prompt: "Libido / drive?", low: "Flat", high: "There" },
  { key: "focus", prompt: "Brain fog / focus?", low: "Foggy", high: "Sharp" },
];

interface DayEntry {
  date: string;
  scores: Record<string, number>;
}

function read(): DayEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as DayEntry[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function write(entries: DayEntry[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries));
    window.dispatchEvent(new Event("apex-menopause"));
  } catch {
    /* private mode */
  }
}

const NOW_DATE = "2026-06-12";

export function MenopauseTracker({ clientId, iso = NOW_DATE }: { clientId: string; iso?: string }) {
  const client = getClient(clientId);
  const [entries, setEntries] = useState<DayEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});

  const today = iso.slice(0, 10);

  useEffect(() => {
    const sync = () => {
      setEntries(read());
      setHydrated(true);
    };
    sync();
    window.addEventListener("apex-menopause", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("apex-menopause", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const loggedToday = useMemo(() => entries.find((e) => e.date === today), [entries, today]);

  // Female members only.
  if (!client || client.sex !== "female") return null;

  const done = step >= QUESTIONS.length;
  const q = QUESTIONS[step];

  function answer(value: number) {
    const next = { ...answers, [q.key]: value };
    setAnswers(next);
    if (step + 1 >= QUESTIONS.length) {
      const rest = read().filter((e) => e.date !== today);
      write([...rest, { date: today, scores: next }]);
    }
    setStep((s) => s + 1);
  }

  return (
    <section className="rounded-panel border border-ink-700/70 bg-ink-850/60">
      <header className="flex items-center gap-2 border-b border-ink-800/70 px-5 py-4">
        <Flower2 className="h-4 w-4 text-gold-400" aria-hidden />
        <h2 className="text-heading text-ink-50">How you&apos;re feeling</h2>
      </header>

      <div className="px-5 py-5">
        {!hydrated ? (
          <div className="h-24 animate-pulse rounded-control bg-ink-800/40" />
        ) : loggedToday && done ? (
          <Logged entries={read()} />
        ) : loggedToday ? (
          <Logged entries={entries} />
        ) : done ? (
          <div className="flex items-center gap-2 text-detail text-emerald">
            <Check className="h-4 w-4" /> Logged — your care team reads the pattern, not any single day.
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between">
              <span className="text-micro uppercase tracking-[0.14em] text-ink-500">Today, {step + 1} of {QUESTIONS.length}</span>
            </div>
            <p className="mt-3 text-title leading-tight text-ink-50">{q.prompt}</p>
            <div className="mt-4 flex gap-2">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => answer(v)}
                  className="focus-ring flex-1 rounded-control border border-ink-700 bg-ink-800/60 py-3.5 stat-mono text-heading text-ink-200 transition-colors hover:border-ink-500 hover:bg-ink-800 hover:text-ink-50"
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-micro text-ink-500">
              <span>{q.low}</span>
              <span>{q.high}</span>
            </div>
          </div>
        )}

        <p className="mt-4 flex items-start gap-1.5 border-t border-ink-800/70 pt-3 text-micro leading-relaxed text-ink-600">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          In perimenopause the week-to-week pattern guides HRT better than one blood draw — that&apos;s
          why this matters. Your provider sees the trend, not each day.
        </p>
      </div>
    </section>
  );
}

function Logged({ entries }: { entries: DayEntry[] }) {
  const recent = entries.slice(-14);
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-detail text-emerald">
        <Check className="h-4 w-4" /> Today&apos;s logged. Here&apos;s your last two weeks.
      </p>
      <div className="space-y-2">
        {QUESTIONS.map((q) => {
          const vals = recent.map((e) => e.scores[q.key]).filter((v) => typeof v === "number") as number[];
          const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
          return (
            <div key={q.key} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate text-detail text-ink-400">{q.prompt.replace(/\?$/, "")}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-800">
                <motion.div
                  className="h-full rounded-full bg-gold-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${((avg ?? 0) / 5) * 100}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <span className="stat-mono w-8 text-right text-micro text-ink-400">{avg ? avg.toFixed(1) : "—"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
