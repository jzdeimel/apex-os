"use client";

import Link from "next/link";
import { ArrowRight, ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
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

/**
 * A row, not a card. These were bordered, filled, rounded boxes stacked inside
 * a bordered card — and the direction arrow is doing the only job the box was
 * pretending to do. The arrow keeps its colour because direction is exactly the
 * kind of thing colour should carry.
 */
function MovementRow({ m }: { m: Movement }) {
  const { icon: Icon, className } = ARROW[m.direction];
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", className)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-micro uppercase text-ink-500">{m.label}</p>
          <p className="text-body font-medium leading-snug text-ink-50">{m.headline}</p>
        </div>
        <p className="mt-1 text-detail leading-relaxed text-ink-400">{m.detail}</p>
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
        {/* The calendar glyph is gone. It sat next to the words "Your week" and
            told the member nothing the words did not. */}
        <p className="label-eyebrow">
          Your week · {formatDateShort(review.weekStart)} &ndash; {formatDateShort(review.weekEnd)}
        </p>
        <h2 className="mt-2 max-w-prose font-display text-title leading-snug text-ink-50">
          {review.headline}
        </h2>

        {/* Adherence, in meaning rather than in points ----------------------- */}
        {/* Unboxed. This is the substance of the card, and it was sitting in a
            bordered, tinted panel *inside* the card — which made the most
            important content on screen look like an aside. It now separates
            from the headline with a rule and a generous gap, and the count is
            allowed to be genuinely large. */}
        <div className="mt-6 border-t border-ink-800/60 pt-5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="stat-mono text-display text-ink-50">
              {review.adherence.daysClosed}
            </span>
            <span className="text-detail text-ink-400">
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
                <span className="mt-1.5 block text-center text-micro uppercase tracking-wide text-ink-600">
                  {d.weekday}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-detail leading-relaxed text-ink-300">
            {review.adherence.meaning}
          </p>
        </div>

        {/* What moved -------------------------------------------------------- */}
        {review.moved.length > 0 && (
          <div className="mt-8">
            <p className="label-eyebrow">What moved</p>
            <div className="mt-1 divide-y divide-ink-800/60">
              {review.moved.map((m) => (
                <MovementRow key={m.id} m={m} />
              ))}
            </div>
          </div>
        )}

        {/* What didn't — same weight, never hidden --------------------------- */}
        {review.didNotMove.length > 0 && (
          <div className="mt-8">
            <p className="label-eyebrow">What didn&rsquo;t</p>
            <div className="mt-1 divide-y divide-ink-800/60">
              {review.didNotMove.map((m) => (
                <MovementRow key={m.id} m={m} />
              ))}
            </div>
          </div>
        )}

        {/* The one next action ---------------------------------------------- */}
        {/* Kept as the single accented thing in the card, but as a rule and a
            coloured link rather than a filled, bordered, tinted panel. The
            green box was competing with the adherence figure above it for the
            role of "most important thing here", and there can only be one. */}
        <div className="mt-8 border-t border-ink-800/60 pt-5">
          <p className="label-eyebrow">The one thing worth doing</p>
          <p className="mt-1.5 text-heading text-ink-50">{review.next.label}</p>
          <p className="mt-1.5 max-w-prose text-detail leading-relaxed text-ink-400">
            {review.next.why}
          </p>
          {review.next.href && (
            <Link
              href={review.next.href}
              className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-control text-detail font-medium text-optimal hover:underline"
            >
              Take me there
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        <p className="mt-6 text-micro leading-relaxed text-ink-500">{review.footnote}</p>
      </CardContent>
    </Card>
  );
}
