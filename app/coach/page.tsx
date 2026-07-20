"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Client } from "@/lib/types";
import { staffName } from "@/lib/mock/staff";
import { unsignedConsultsFor } from "@/lib/mock/consults";
import { triageScore, churnRisk } from "@/lib/aiInsights";
import { TodayQueue, ME_COACH, clientsForCoach } from "@/components/coach/TodayQueue";
import { CoachWaitingOn } from "@/components/escalations/CoachEscalationStatus";
import { AdherenceWorklist } from "@/components/coach/AdherenceWorklist";
import { cn } from "@/lib/utils";

/**
 * Coach · Today
 *
 * What this page is NOT, and deliberately so: the coach's own certification
 * progress, a quiz streak, or a practice-wide revenue number wearing the coach's
 * name. Every figure here is scoped to `coachId === ME_COACH` and nothing else.
 * If a coach cannot answer "who needs me today" in one screen, the page failed.
 *
 * Layout rule for this screen: THE QUEUE IS THE PAGE. Everything above it is a
 * strip — a compact stat row, a book-health bar, the escalation ledger — sized
 * so the first queue row is visible without scrolling on a laptop. Whitespace
 * here is not elegance, it is queue rows pushed below the fold.
 */

// ---------------------------------------------------------------------------
// Stat strip
// ---------------------------------------------------------------------------

function Stat({
  label,
  value,
  hint,
  tone,
  href,
}: {
  label: string;
  value: number;
  hint: string;
  tone: "neutral" | "watch" | "high" | "optimal";
  href?: string;
}) {
  const toneText = {
    neutral: "text-ink-50",
    watch: "text-watch",
    high: "text-high",
    optimal: "text-optimal",
  }[tone];

  const body = (
    <div className="px-2.5 py-2 sm:px-3.5">
      <p className="label-eyebrow flex items-center gap-1 truncate">
        {label}
        {href && <ArrowUpRight className="h-2.5 w-2.5 shrink-0 text-ink-600" />}
      </p>
      <p className={cn("stat-mono mt-0.5 text-title font-semibold leading-none", toneText)}>{value}</p>
      {/* The hint carries the definition. A number a coach cannot audit is a
          number a coach will argue with instead of act on. */}
      <p className="mt-1 truncate text-micro leading-tight text-ink-600" title={hint}>
        {hint}
      </p>
    </div>
  );

  return href ? (
    <Link href={href} className="block rounded-lg transition-colors hover:bg-ink-800/40 focus-ring">
      {body}
    </Link>
  ) : (
    body
  );
}

// ---------------------------------------------------------------------------
// Book at a glance
// ---------------------------------------------------------------------------

type Band = "risk" | "watch" | "track";

/**
 * One member, one band. Two engines vote and the worse verdict wins:
 * triageScore answers "is something clinically wrong right now", churnRisk
 * answers "are they drifting away from us". A member can be clinically fine and
 * still be leaving, and a book bar that only reads one of the two tells the
 * coach they are doing great right up until the cancellations land.
 */
function bandFor(client: Client): Band {
  const triage = triageScore(client);
  const churn = churnRisk(client);
  if (triage.score >= 45 || churn.level === "high") return "risk";
  if (triage.score >= 22 || churn.level === "medium") return "watch";
  return "track";
}

const BAND_META: Record<Band, { label: string; bar: string; dot: string; text: string }> = {
  track: { label: "On track", bar: "bg-optimal", dot: "bg-optimal", text: "text-optimal" },
  watch: { label: "Watch", bar: "bg-watch", dot: "bg-watch", text: "text-watch" },
  risk: { label: "At risk", bar: "bg-high", dot: "bg-high", text: "text-high" },
};

function BookAtAGlance({ book }: { book: Client[] }) {
  const counts = React.useMemo(() => {
    const acc: Record<Band, number> = { track: 0, watch: 0, risk: 0 };
    for (const c of book) acc[bandFor(c)] += 1;
    return acc;
  }, [book]);

  const total = book.length || 1;
  // Risk reads left-to-right worst-first: the coach's eye starts at the left
  // edge, so that is where the number they are judged on belongs.
  const order: Band[] = ["risk", "watch", "track"];

  return (
    <div className="card px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <p className="label-eyebrow">My book at a glance</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {order.map((b) => (
            <span key={b} className="inline-flex items-center gap-1.5 text-micro">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", BAND_META[b].dot)} />
              <span className="stat-mono font-semibold text-ink-100">{counts[b]}</span>
              <span className="text-ink-500">{BAND_META[b].label}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-ink-900">
        {order.map((b) =>
          counts[b] === 0 ? null : (
            <div
              key={b}
              className={cn("h-full", BAND_META[b].bar)}
              style={{ width: `${(counts[b] / total) * 100}%` }}
              title={`${counts[b]} ${BAND_META[b].label.toLowerCase()}`}
            />
          ),
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CoachTodayPage() {
  // Every figure on this page derives from the same filtered book — one source,
  // no drift between "my clients" here and "my clients" on the roster page.
  const mine = React.useMemo(() => clientsForCoach(ME_COACH), []);

  const needAttention = React.useMemo(
    () => mine.filter((c) => triageScore(c).score >= 45).length,
    [mine],
  );
  const unsigned = React.useMemo(() => unsignedConsultsFor(ME_COACH).length, []);

  // Apex has no order ledger in this build, so the closest honest proxy for
  // "needs your eyes" is a plan sitting in a state only a human can move.
  const plansWaiting = React.useMemo(
    () =>
      mine.filter((c) => c.planStatus === "Needs review" || c.planStatus === "Awaiting provider")
        .length,
    [mine],
  );

  /**
   * Spacing on this page is deliberately UNEVEN.
   *
   * A uniform `space-y-3` between every block said all six regions were equally
   * important, which is the flattest thing an interface can say. The rhythm now
   * encodes the ranking the page already argues for in prose: the two book
   * readouts sit almost touching because they are one thought, functional
   * groups get a clear gap, and the discretionary worklist is pushed well down
   * behind a hairline rule so it can never be mistaken for the queue.
   *
   * The budget is tight on purpose. Everything above the queue still costs less
   * than a laptop viewport, because the layout rule for this screen is that the
   * first queue row is visible without scrolling.
   */
  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="label-eyebrow">COACH CONSOLE</p>
          <h1 className="mt-0.5 font-display text-title font-semibold tracking-tight text-ink-50">
            Today
          </h1>
        </div>
        <p className="text-micro text-ink-500">
          {staffName(ME_COACH)} · Jun 12 · ranked by what needs a human, scoped to your book
        </p>
      </header>

      {/* The state of the book: four counts and the band bar that explains them.
          One thought, so they sit tight together.

          Four numbers, one row, one card. Four separate tiles with icons cost a
          third of the viewport and told the coach nothing the numbers didn't. */}
      <section className="mt-4 space-y-1.5">
        <div className="card grid grid-cols-4 divide-x divide-ink-800/60">
          <Stat
            label="Book"
            value={mine.length}
            hint="Assigned by id"
            tone="neutral"
            href="/coach/roster"
          />
          <Stat label="Attention" value={needAttention} hint="Triage 45+" tone="watch" />
          <Stat
            label="Unsigned"
            value={unsigned}
            hint="Charts left open"
            tone="high"
            href="/coach/consults"
          />
          <Stat label="Plans" value={plansWaiting} hint="Need review" tone="neutral" />
        </div>

        <BookAtAGlance book={mine} />
      </section>

      {/* What this coach is waiting on a provider for — including anything
          already answered and safe to relay to the member. */}
      <section className="mt-5">
        <CoachWaitingOn coachId={ME_COACH} />
      </section>

      {/* THE QUEUE IS THE PAGE. */}
      <section className="mt-5">
        <TodayQueue coachId={ME_COACH} />
      </section>

      {/*
        The adherence worklist sits BELOW the queue, not above it.

        Both are ranked lists of members and it is tempting to merge them or to
        lead with this one — it is the more sophisticated engine. That would be
        wrong on this page. The queue is work the coach OWES (a signature is a
        legal obligation, an escalation has an SLA clock); the worklist is work
        the coach should CHOOSE. Putting discretionary work above obligated work
        is how the unsigned note ages another day, and this page's stated layout
        rule is that the first queue row is visible without scrolling.

        The gap and the rule below carry that argument visually. A second
        bordered container would have said "another box of the same kind";
        space and a hairline say "a different kind of work".

        They are deliberately not deduplicated against each other either. A
        member can legitimately appear in both, and for different reasons — the
        queue says "you owe them a signature", the worklist says "they are about
        to run out of product". Suppressing the second because the first exists
        would hide the reason the call actually matters.
      */}
      <section className="mt-10 border-t border-ink-800/60 pt-6">
        <AdherenceWorklist coachId={ME_COACH} />
      </section>
    </div>
  );
}
