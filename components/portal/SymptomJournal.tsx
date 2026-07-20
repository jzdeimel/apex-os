"use client";

import * as React from "react";
import { NotebookPen, TrendingUp, CalendarDays, Link2, AlertTriangle } from "lucide-react";
import type { Client } from "@/lib/types";
import {
  CORRELATION_DISCLAIMER,
  SYMPTOMS,
  WEEKDAY_NAMES,
  correlate,
  entryOn,
  journalFor,
  summaryFor,
  symptomMeta,
  trendFor,
  type Correlation,
  type SymptomKey,
} from "@/lib/symptoms/journal";
import { Card, CardContent, Badge, Textarea, Button } from "@/components/ui/primitives";
import { TrendLine } from "@/components/charts";
import { useToast } from "@/components/ui/Toast";
import { cn, formatDate } from "@/lib/utils";

/**
 * SYMPTOM JOURNAL.
 *
 * ══ READ lib/symptoms/journal.ts BEFORE CHANGING THE COPY IN THIS FILE ═════
 *
 * The correlation section is the reason this feature exists and the reason it
 * is dangerous. A member looking at a red-tinted card that pairs their energy
 * scores with a lab marker will read "this is why I feel bad" unless the screen
 * works quite hard to stop them.
 *
 * So, structurally:
 *   - `CORRELATION_DISCLAIMER` renders ABOVE the cards, at body size, in full.
 *     Not a tooltip, not a footnote, not collapsed behind an info icon.
 *   - Every card renders its own `caution` and its own `askYourCoach` line, and
 *     the sample size is on the card face.
 *   - Correlations get NEUTRAL styling. No red, no warning colour, no severity
 *     ranking that could be mistaken for a clinical grade.
 *   - The section heading is a question, not a claim.
 */

const NOW_DATE = "2026-06-12";

// ---------------------------------------------------------------------------
// Today's check-in
// ---------------------------------------------------------------------------

function ScaleRow({
  symptom,
  value,
  onPick,
}: {
  symptom: SymptomKey;
  value?: number;
  onPick: (v: number) => void;
}) {
  const meta = symptomMeta[symptom];
  return (
    <fieldset className="hairline rounded-panel border bg-ink-900/50 p-3.5">
      <legend className="sr-only">{meta.prompt}</legend>
      <p className="text-detail font-medium text-ink-100">{meta.prompt}</p>
      <div className="mt-2.5 grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            onClick={() => onPick(n)}
            className={cn(
              "focus-ring rounded-panel border py-2 text-center transition-colors motion-reduce:transition-none",
              value === n
                ? "border-gold-400/40 bg-gold-400/15 text-gold-200"
                : "border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-100",
            )}
          >
            <span className="stat-mono block text-body font-semibold">{n}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-micro leading-relaxed text-ink-500">
        {value ? meta.scale[value - 1] : `1 = ${meta.scale[0]} · 5 = ${meta.scale[4]}`}
      </p>
    </fieldset>
  );
}

function CheckIn({ client }: { client: Client }) {
  const existing = entryOn(client.id, NOW_DATE);
  const [scores, setScores] = React.useState<Partial<Record<SymptomKey, number>>>(
    existing ? { ...existing.scores } : {},
  );
  const [note, setNote] = React.useState(existing?.note ?? "");
  const [saved, setSaved] = React.useState(false);
  const { toast } = useToast();

  const answered = Object.keys(scores).length;

  return (
    <Card>
      <CardContent className="p-4 pt-4 sm:p-6 sm:pt-6">
        <div className="flex items-center gap-2">
          <NotebookPen className="h-5 w-5 text-gold-300" />
          <h2 className="font-display text-heading font-semibold text-ink-50 sm:text-title">
            How was today?
          </h2>
        </div>
        <p className="mt-1.5 max-w-prose text-detail leading-relaxed text-ink-400">
          Six quick ratings. Thirty seconds. It is worth doing on the bad days especially — those are the
          ones that turn out to mean something later.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {SYMPTOMS.map((s) => (
            <ScaleRow
              key={s.key}
              symptom={s.key}
              value={scores[s.key]}
              onPick={(v) => {
                setScores((prev) => ({ ...prev, [s.key]: v }));
                setSaved(false);
              }}
            />
          ))}
        </div>

        <div className="mt-3">
          <label htmlFor="journal-note" className="label-eyebrow">
            Anything else
          </label>
          <Textarea
            id="journal-note"
            rows={3}
            className="mt-2"
            placeholder="Woke up at 3 and never got back under. Shoulder was fine in the session."
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setSaved(false);
            }}
          />
        </div>

        {/*
            AUDIT FIX — GAP_ANALYSIS "Symptom check-in persistence / P0" and
            ENGAGEMENT friction #7.

            This button read "Save today" and toasted "Your coach can see this
            before your next check-in." The handler was `setSaved(true)` and
            nothing else: no store, no ledger row, no coach-facing surface.
            A member on a bad day was being told a clinician would read it.

            There is no journal write path in this build to hook up — the
            correct fix is therefore the claim, not the action. The button now
            names exactly what it does (holds the answers in this form for the
            session) and the notice below is permanent, at body-adjacent size,
            because a toast that vanishes in four seconds is not a disclosure.

            What would make the old copy true: a `JournalEntry` write API on
            lib/symptoms/journal.ts backed by real storage, plus a coach-side
            journal read surface — which does not exist either (ENGAGEMENT
            "Coach reactions on logs: MISSING").
        */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            disabled={answered === 0}
            onClick={() => {
              setSaved(true);
              toast("Kept on this screen", {
                desc: "Not stored and not sent — this build has no journal write path yet.",
              });
            }}
          >
            {saved ? "Kept for this session" : "Keep for this session"}
          </Button>
          <span className="stat-mono text-micro text-ink-500">
            {answered}/6 answered
          </span>
        </div>

        <p className="mt-3 max-w-prose rounded-panel border border-ink-600/60 bg-ink-900/40 p-3 text-detail leading-relaxed text-ink-300">
          <span className="font-medium text-ink-100">Nothing here is stored yet.</span> This is a
          prototype: your answers stay on this screen, clear on refresh, and your coach cannot see
          them. The history and trends below are sample data, not your entries.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

const RANGES = [14, 30, 90] as const;

function TrendSection({ client }: { client: Client }) {
  const [symptom, setSymptom] = React.useState<SymptomKey>("energy");
  const [days, setDays] = React.useState<number>(30);

  const meta = symptomMeta[symptom];
  const trend = trendFor(client.id, symptom, days);

  const tone =
    trend.direction === "improving" ? "optimal" : trend.direction === "slipping" ? "watch" : "neutral";
  const word =
    trend.direction === "improving"
      ? "heading the right way"
      : trend.direction === "slipping"
        ? "drifting the wrong way"
        : "holding steady";

  return (
    <Card>
      <CardContent className="p-4 pt-4 sm:p-6 sm:pt-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-gold-300" />
          <h2 className="font-display text-heading font-semibold text-ink-50 sm:text-title">
            How it has been going
          </h2>
        </div>

        <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
          {SYMPTOMS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSymptom(s.key)}
              className={cn(
                "focus-ring shrink-0 rounded-control border px-3.5 py-1.5 text-detail font-medium transition-colors motion-reduce:transition-none",
                symptom === s.key
                  ? "border-gold-400/40 bg-gold-400/15 text-gold-200"
                  : "border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-100",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDays(r)}
              className={cn(
                "focus-ring rounded-control px-2.5 py-1 text-micro font-medium transition-colors motion-reduce:transition-none",
                days === r ? "bg-ink-700 text-ink-50" : "text-ink-500 hover:text-ink-200",
              )}
            >
              <span className="stat-mono">{r}</span>d
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <div className="hairline rounded-panel border bg-ink-900/50 p-3.5">
            <p className="text-micro uppercase tracking-wide text-ink-500">Average</p>
            <p className="stat-mono mt-1 text-title font-semibold text-ink-50">{trend.average}</p>
          </div>
          <div className="hairline rounded-panel border bg-ink-900/50 p-3.5">
            <p className="text-micro uppercase tracking-wide text-ink-500">Change</p>
            <p className="stat-mono mt-1 text-title font-semibold text-ink-50">
              {trend.change > 0 ? "+" : ""}
              {trend.change}
            </p>
          </div>
          <div className="hairline col-span-2 rounded-panel border bg-ink-900/50 p-3.5 sm:col-span-1">
            <p className="text-micro uppercase tracking-wide text-ink-500">Direction</p>
            <Badge tone={tone as "optimal" | "watch" | "neutral"} className="mt-1.5">
              {word}
            </Badge>
          </div>
        </div>

        <div className="mt-4">
          {/* Smoothed, not raw: a member should not be reacting to one bad
              Tuesday, and the seven-day line is what their coach reads too. */}
          <TrendLine data={trend.smoothed} height={200} />
        </div>

        {/* "your own ... ratings" was false: lib/symptoms/journal.ts:238-251
            generates 120 days from seededRandom and no member entry ever joins
            it. The smoothing and direction maths below are real; the series
            they run on is not, so the sentence names it. */}
        <p className="mt-2 max-w-prose text-detail leading-relaxed text-ink-400">
          <span className="font-medium text-ink-100">Sample history.</span> Seven-day rolling average
          of a seeded {meta.label.toLowerCase()} series — not your entries, which this build does not
          store. The smoothing is real: a single rough day does not swing the line.{" "}
          {meta.higherIsBetter ? "Higher is better." : "Lower is better."}
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Weekday rhythm
// ---------------------------------------------------------------------------

function RhythmSection({ client }: { client: Client }) {
  const summary = summaryFor(client.id);
  const rhythm = summary.rhythm;
  if (!rhythm) return null;

  const meta = symptomMeta[rhythm.symptom];
  const max = 5;

  return (
    <Card>
      <CardContent className="p-4 pt-4 sm:p-6 sm:pt-6">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-gold-300" />
          <h2 className="font-display text-heading font-semibold text-ink-50 sm:text-title">
            Your week has a shape
          </h2>
        </div>

        <p className="mt-2 max-w-prose text-detail leading-relaxed text-ink-300">
          Across the last 90 days, your {meta.label.toLowerCase()} ratings on{" "}
          <span className="font-medium text-ink-50">{WEEKDAY_NAMES[rhythm.worstDay]}s</span> average{" "}
          <span className="stat-mono text-ink-50">{rhythm.worstAverage}</span> against{" "}
          <span className="stat-mono text-ink-50">{rhythm.otherAverage}</span> on every other day.
        </p>

        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {rhythm.byWeekday.map((v, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className="flex h-24 w-full items-end rounded-control bg-ink-900/60">
                <div
                  className={cn(
                    "w-full rounded-control",
                    i === rhythm.worstDay ? "bg-gold-500/80" : "bg-ink-600",
                  )}
                  style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
                />
              </div>
              <span className="text-micro text-ink-500">{WEEKDAY_NAMES[i].slice(0, 1)}</span>
              <span className="stat-mono text-micro text-ink-400">{v.toFixed(1)}</span>
            </div>
          ))}
        </div>

        <p className="mt-3 max-w-prose text-detail leading-relaxed text-ink-400">
          This is a pattern in what you logged, not an explanation of it. Plenty of ordinary things make one
          day of the week different from the others. It is a good thing to mention to your coach — they can
          usually move the week around it.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Correlations
// ---------------------------------------------------------------------------

function CorrelationCard({ c }: { c: Correlation }) {
  const meta = symptomMeta[c.symptom];
  return (
    // Deliberately neutral styling. A coloured severity treatment here would
    // read as a clinical grade, which is precisely what this is not.
    <li className="hairline rounded-panel border bg-ink-900/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <p className="min-w-0 text-body font-medium leading-snug text-ink-50">
          {meta.label} and your {c.against}
        </p>
        <Badge tone="neutral" className="shrink-0">
          {c.strength}
        </Badge>
      </div>

      <p className="mt-2 max-w-prose text-detail leading-relaxed text-ink-300">{c.plain}</p>

      {/* The hedge. Never optional, never collapsed. */}
      <p className="mt-2.5 max-w-prose text-micro leading-relaxed text-ink-500">{c.caution}</p>

      <p className="mt-2.5 max-w-prose text-detail leading-relaxed text-gold-200">{c.askYourCoach}</p>

      <p className="stat-mono mt-2.5 text-micro text-ink-600">
        based on {c.pairs} paired points · {c.kind}
      </p>
    </li>
  );
}

function CorrelationSection({ client }: { client: Client }) {
  const found = correlate(client.id);

  return (
    <Card>
      <CardContent className="p-4 pt-4 sm:p-6 sm:pt-6">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-gold-300" />
          <h2 className="font-display text-heading font-semibold text-ink-50 sm:text-title">
            Anything worth asking about?
          </h2>
        </div>

        {/* The disclaimer renders above the cards, at body size, in full. */}
        <div className="mt-3 flex items-start gap-3 rounded-panel border border-ink-600/60 bg-ink-900/40 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
          <p className="max-w-prose text-detail leading-relaxed text-ink-300">
            {CORRELATION_DISCLAIMER}
          </p>
        </div>

        {found.length === 0 ? (
          <p className="mt-4 max-w-prose text-detail leading-relaxed text-ink-400">
            Nothing in your log lines up with anything else strongly enough to be worth your attention right
            now. That is a perfectly good outcome — keep logging and we will keep looking.
          </p>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {found.map((c) => (
              <CorrelationCard key={c.id} c={c} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Recent entries
// ---------------------------------------------------------------------------

function RecentEntries({ client }: { client: Client }) {
  const entries = journalFor(client.id)
    .slice()
    .reverse()
    .slice(0, 14);

  return (
    <Card>
      <CardContent className="p-4 pt-4 sm:p-6 sm:pt-6">
        <h2 className="font-display text-heading font-semibold text-ink-50 sm:text-title">
          The last two weeks
        </h2>
        <ul className="mt-3 space-y-2">
          {entries.map((e) => (
            <li key={e.id} className="hairline rounded-panel border bg-ink-900/50 p-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-detail font-medium text-ink-100">{formatDate(e.date)}</span>
                <span className="stat-mono text-micro text-ink-500">
                  {SYMPTOMS.map((s) => `${s.label[0]}${e.scores[s.key]}`).join(" · ")}
                </span>
              </div>
              {e.note && (
                <p className="mt-1.5 max-w-prose text-detail leading-relaxed text-ink-400">“{e.note}”</p>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function SymptomJournal({ client }: { client: Client }) {
  const summary = summaryFor(client.id);

  return (
    <div className="space-y-5">
      {/* The tiles below count seeded entries, not the member's. Labelled here
          rather than in a footnote — "Days logged: 87" is a claim about the
          member, and a disclaimer smaller than the number does not retract it. */}
      <p className="text-detail leading-relaxed text-ink-400">
        <span className="font-medium text-ink-100">Illustrative journal.</span> Every figure on this
        page is generated sample data. Check-ins you enter here are not stored.
      </p>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <div className="hairline rounded-panel border bg-ink-900/50 p-3.5">
          <p className="text-micro uppercase tracking-wide text-ink-500">Days logged</p>
          <p className="stat-mono mt-1 text-title font-semibold text-ink-50">{summary.entries}</p>
        </div>
        <div className="hairline rounded-panel border bg-ink-900/50 p-3.5">
          <p className="text-micro uppercase tracking-wide text-ink-500">Last 30 days</p>
          <p className="stat-mono mt-1 text-title font-semibold text-ink-50">
            {summary.loggedLast30}
            <span className="text-micro font-normal text-ink-400">/30</span>
          </p>
        </div>
        <div className="hairline col-span-2 rounded-panel border bg-ink-900/50 p-3.5 sm:col-span-1">
          <p className="text-micro uppercase tracking-wide text-ink-500">Symptoms tracked</p>
          <p className="stat-mono mt-1 text-title font-semibold text-ink-50">{SYMPTOMS.length}</p>
        </div>
      </div>

      <CheckIn client={client} />
      <TrendSection client={client} />
      <RhythmSection client={client} />
      <CorrelationSection client={client} />
      <RecentEntries client={client} />
    </div>
  );
}
