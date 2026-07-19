"use client";

import * as React from "react";
import Link from "next/link";
import { Users, AlertTriangle, PenLine, ClipboardCheck, ArrowUpRight } from "lucide-react";
import { staffName } from "@/lib/mock/staff";
import { unsignedConsultsFor } from "@/lib/mock/consults";
import { triageScore } from "@/lib/aiInsights";
import { FadeIn } from "@/components/motion";
import { TodayQueue, ME_COACH, clientsForCoach } from "@/components/coach/TodayQueue";
import { cn } from "@/lib/utils";

/**
 * Coach · Today
 *
 * What this page is NOT, and deliberately so: the coach's own certification
 * progress, a quiz streak, or a practice-wide revenue number wearing the coach's
 * name. Every figure here is scoped to `coachId === ME_COACH` and nothing else.
 * If a coach cannot answer "who needs me today" in one screen, the page failed.
 */

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  href,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ElementType;
  tone: "neutral" | "watch" | "high" | "optimal";
  href?: string;
}) {
  const toneRing = {
    neutral: "text-ink-300 bg-ink-700/50 border-ink-600/60",
    watch: "text-watch bg-watch/12 border-watch/30",
    high: "text-high bg-high/12 border-high/30",
    optimal: "text-optimal bg-optimal/12 border-optimal/30",
  }[tone];

  const body = (
    <div className="card card-hover p-4">
      <div className="flex items-start justify-between">
        <span className={cn("grid h-8 w-8 place-items-center rounded-lg border", toneRing)}>
          <Icon className="h-4 w-4" />
        </span>
        {href && <ArrowUpRight className="h-3.5 w-3.5 text-ink-600" />}
      </div>
      <p className="stat-mono mt-3 text-2xl font-semibold text-ink-50">{value}</p>
      <p className="mt-0.5 text-sm font-medium text-ink-200">{label}</p>
      <p className="mt-1 text-xs text-ink-500">{hint}</p>
    </div>
  );

  return href ? (
    <Link href={href} className="block rounded-2xl focus-ring">
      {body}
    </Link>
  ) : (
    body
  );
}

export default function CoachTodayPage() {
  // All four tiles derive from the same filtered book — one source, no drift
  // between "my clients" here and "my clients" on the roster page.
  const mine = React.useMemo(() => clientsForCoach(ME_COACH), []);

  const needAttention = React.useMemo(
    () => mine.filter((c) => triageScore(c).score >= 45).length,
    [mine],
  );
  const unsigned = React.useMemo(() => unsignedConsultsFor(ME_COACH).length, []);

  // Apex has no order ledger in this build, so the closest honest proxy for
  // "needs your eyes" is a plan sitting in a state only a human can move.
  const plansWaiting = React.useMemo(
    () => mine.filter((c) => c.planStatus === "Needs review" || c.planStatus === "Awaiting provider").length,
    [mine],
  );

  return (
    <div className="space-y-6">
      <FadeIn>
        <p className="label-eyebrow">COACH CONSOLE</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink-50">Today</h1>
        <p className="mt-1 text-sm text-ink-400">
          {staffName(ME_COACH)}&apos;s working queue for Jun 12 — ranked by what actually needs a
          human, scoped to your book and nobody else&apos;s.
        </p>
      </FadeIn>

      <FadeIn delay={0.05}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="My clients"
            value={mine.length}
            hint="Assigned to you by id, not by name"
            icon={Users}
            tone="neutral"
            href="/coach/roster"
          />
          <StatTile
            label="Need attention"
            value={needAttention}
            hint="Triage score 45+ (high or critical)"
            icon={AlertTriangle}
            tone="watch"
          />
          <StatTile
            label="Unsigned consults"
            value={unsigned}
            hint="Charts you have left open"
            icon={PenLine}
            tone="high"
            href="/coach/consults"
          />
          <StatTile
            label="Plans needing eyes"
            value={plansWaiting}
            hint="Needs review or awaiting provider"
            icon={ClipboardCheck}
            tone="optimal"
          />
        </div>
      </FadeIn>

      <FadeIn delay={0.1}>
        <TodayQueue coachId={ME_COACH} />
      </FadeIn>
    </div>
  );
}
