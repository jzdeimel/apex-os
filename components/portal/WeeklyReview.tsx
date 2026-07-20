"use client";

import Link from "next/link";
import { ArrowRight, ArrowDownRight, ArrowUpRight, Minus, CalendarRange } from "lucide-react";
import type { Client } from "@/lib/types";
import { weeklyReview, type Movement } from "@/lib/member/weeklyReview";
import { Card, CardContent } from "@/components/ui/primitives";
import { formatDateShort, cn } from "@/lib/utils";

/**
 * WEEKLY REVIEW — the reason to open this on a Monday.
 *
 * ══ READ lib/member/weeklyReview.ts BEFORE CHANGING ANY COPY HERE ═════════
 *
 * The design brief this satisfies is narrow: give a member a reason to come
 * back weekly WITHOUT a manipulative streak mechanic. So there is no counter to
 * protect, no "don't break the chain", no red state for a bad week, and no
 * percentage anywhere on the card. The pull is supposed to be that the screen
 * genuinely knows something — including, often, that nothing happened.
 *
 * Which is why "what didn't move" is rendered at the same weight as "what did"
 * rather than being hidden behind a toggle. On most weeks it is the longer of
 * the two lists, because body composition is measured every few weeks and a
 * screen that only ever reports wins is a screen nobody believes on the week it
 * reports a real one.
 *
 * Direction arrows are the only colour, they encode better/worse *for this
 * member's own goals* (see `downIsBetter` in the module), and a flat row gets a
 * grey dash rather than being dropped.
 */

const ARROW: Record<Movement["direction"], { icon: typeof Minus; className: string }> = {
  better: { icon: ArrowUpRight, className: "text-optimal" },
  worse: { icon: ArrowDownRight, className: "text-watch" },
  flat: { icon: Minus, className: "text-ink-500" },
};

function MovementRow({ m }: { m: Movement }) {
  const { icon: Icon, className } = ARROW[m.direction];
  return (
    <div className="hairline flex items-start gap-3 rounded-2xl bg-ink-900/50 p-4">
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", className)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-[10px] uppercase tracking-wide text-ink-500">{m.label}</p>
          <p className="text-[15px] font-medium leading-snug text-ink-50">{m.headline}</p>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-400">{m.detail}</p>
      </div>
    </div>
  );
}

export function WeeklyReview({ client }: { client: Client }) {
  const review = weeklyReview(client);

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        {/* Header ------------------------------------------------------------ */}
        <div className="flex flex-wrap items-center gap-2">
          <CalendarRange className="h-5 w-5 shrink-0 text-ink-400" />
          <p className="label-eyebrow">
            Your week · {formatDateShort(review.weekStart)} &ndash; {formatDateShort(review.weekEnd)}
          </p>
        </div>
        <h2 className="mt-2 max-w-prose font-display text-xl font-semibold leading-snug text-ink-50 sm:text-2xl">
          {review.headline}
        </h2>

        {/* Adherence, in meaning rather than in points ----------------------- */}
        <div className="mt-5 rounded-2xl border border-ink-700/60 bg-ink-950/30 p-4">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="stat-mono text-2xl font-semibold text-ink-50">
              {review.adherence.daysClosed}
            </span>
            <span className="text-[13px] text-ink-400">
              of {review.adherence.daysTotal} days came together fully
            </span>
          </div>
          {/* Seven labelled days, not a percentage bar. A bar invites a target
              to protect; seven discrete days invite a look at which ones — and
              because the module carries the actual per-day flags, the strip
              answers "which days" rather than filling from the left. A held day
              is drawn distinctly from a missed one: following a provider's
              instruction is not a gap in the week. */}
          <div className="mt-3 flex gap-1.5">
            {review.adherence.days.map((d) => (
              <div key={d.date} className="min-w-0 flex-1">
                <span
                  aria-hidden
                  className={cn(
                    "block h-1.5 rounded-full",
                    d.closed ? "bg-optimal" : d.held ? "bg-ink-500" : "bg-ink-700",
                  )}
                />
                <span className="mt-1.5 block text-center text-[10px] uppercase tracking-wide text-ink-600">
                  {d.weekday}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-300">
            {review.adherence.meaning}
          </p>
        </div>

        {/* What moved -------------------------------------------------------- */}
        {review.moved.length > 0 && (
          <div className="mt-5">
            <p className="label-eyebrow">What moved</p>
            <div className="mt-2.5 grid grid-cols-1 gap-2">
              {review.moved.map((m) => (
                <MovementRow key={m.id} m={m} />
              ))}
            </div>
          </div>
        )}

        {/* What didn't — same weight, never hidden --------------------------- */}
        {review.didNotMove.length > 0 && (
          <div className="mt-5">
            <p className="label-eyebrow">What didn&rsquo;t</p>
            <div className="mt-2.5 grid grid-cols-1 gap-2">
              {review.didNotMove.map((m) => (
                <MovementRow key={m.id} m={m} />
              ))}
            </div>
          </div>
        )}

        {/* The one next action ---------------------------------------------- */}
        <div className="mt-5 rounded-2xl border border-optimal/25 bg-optimal/8 p-4 sm:p-5">
          <p className="label-eyebrow">The one thing worth doing</p>
          <p className="mt-1.5 text-[15px] font-medium leading-snug text-ink-50">
            {review.next.label}
          </p>
          <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-ink-300">
            {review.next.why}
          </p>
          {review.next.href && (
            <Link
              href={review.next.href}
              className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium text-optimal hover:underline"
            >
              Take me there
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        <p className="mt-4 text-[12px] leading-relaxed text-ink-500">{review.footnote}</p>
      </CardContent>
    </Card>
  );
}
