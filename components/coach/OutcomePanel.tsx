"use client";

import * as React from "react";
import Link from "next/link";
import {
  TrendingUp,
  Minus,
  TrendingDown,
  CircleHelp,
  Lock,
  ChevronDown,
  ChevronUp,
  Clock,
} from "lucide-react";
import { Badge, Select } from "@/components/ui/primitives";
import { SourceChip } from "@/components/coach/SourceChip";
import { isSourced } from "@/lib/coach/provenance";
import {
  coachOutcomes,
  compareToClinic,
  goalsInBook,
  outcomeTotals,
  PRECEDED_BY_NOTE,
  type MemberOutcome,
  type OutcomeDirection,
} from "@/lib/coach/outcomes";
import { K_MIN } from "@/lib/cohort/trajectory";
import type { Goal } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

/**
 * Outcome attribution for a coach.
 *
 * ── The two things this UI is fighting ────────────────────────────────────
 *
 * 1. CAUSAL DRIFT. A list of members who improved, next to a list of things
 *    that happened to them, reads as cause and effect no matter how carefully
 *    the engine names its fields. So the word "preceded" appears on the face of
 *    every intervention list, `PRECEDED_BY_NOTE` renders in full rather than
 *    behind a tooltip, and there is deliberately no aggregate of the form
 *    "members on X improved Y%" anywhere on this panel — that chart is the one
 *    thing this data cannot honestly produce, so it is not available to build.
 *
 * 2. SMALL-NUMBER COMPARISON. Below K_MIN the panel renders the REFUSAL, with
 *    both head-counts and the reason, rather than a number with a footnote.
 *    A greyed-out figure still gets read; an explanation of why there is no
 *    figure cannot be misread. The refusal is the more useful output anyway —
 *    it tells the coach exactly how many more measurable members would be
 *    needed before the question can be answered at all.
 *
 * ── Why "not measurable" is a first-class row ─────────────────────────────
 * Members whose goal Apex cannot measure (recovery, skin/hair) are listed, not
 * filtered out. A coach with nine recovery members should see that the system
 * has nothing to say about nine of their people — that is a gap in the product
 * worth knowing about, and hiding it would make the panel look more complete
 * than it is.
 */

const DIRECTION_META: Record<
  OutcomeDirection,
  { label: string; icon: React.ElementType; tone: "optimal" | "neutral" | "high" | "watch"; cls: string }
> = {
  improved: { label: "Improved", icon: TrendingUp, tone: "optimal", cls: "text-optimal" },
  unchanged: { label: "Flat", icon: Minus, tone: "neutral", cls: "text-ink-400" },
  worse: { label: "Worse", icon: TrendingDown, tone: "high", cls: "text-high" },
  "not measurable": { label: "No measure", icon: CircleHelp, tone: "watch", cls: "text-watch" },
};

function OutcomeRow({ outcome }: { outcome: MemberOutcome }) {
  const [open, setOpen] = React.useState(false);
  const meta = DIRECTION_META[outcome.direction];
  const Icon = meta.icon;

  return (
    <div className="rounded-xl border border-ink-700/70 bg-ink-900/40 p-2.5">
      <div className="flex min-w-0 items-start gap-2.5">
        <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", meta.cls)} aria-hidden />

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={`/clients/${outcome.clientId}`}
              className="focus-ring truncate rounded text-detail font-medium text-ink-50 hover:text-gold-300"
            >
              {outcome.name}
            </Link>
            <Badge tone={meta.tone}>{meta.label}</Badge>
            <span className="text-micro uppercase tracking-wide text-ink-600">
              goal: {outcome.goal}
            </span>
          </div>

          <p className="mt-1 text-detail leading-relaxed text-ink-400">{outcome.summary}</p>

          {outcome.unmeasurableReason && (
            <p className="mt-1 text-micro leading-relaxed text-watch/90">
              {outcome.unmeasurableReason}
            </p>
          )}

          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {outcome.periodDays !== undefined && (
              <span className="stat-mono inline-flex items-center gap-1 text-micro text-ink-600">
                <Clock className="h-2.5 w-2.5" />
                {outcome.periodDays}d
                {outcome.from && outcome.to && (
                  <> · {formatDate(outcome.from.at)} → {formatDate(outcome.to.at)}</>
                )}
              </span>
            )}
            {isSourced(outcome.source) && <SourceChip source={outcome.source} />}
          </div>

          {outcome.precededBy.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="focus-ring mt-1.5 inline-flex items-center gap-1 rounded text-micro font-medium text-ink-500 transition-colors hover:text-ink-200"
              >
                {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {outcome.precededBy.length} intervention
                {outcome.precededBy.length === 1 ? "" : "s"} preceded this
              </button>

              {open && (
                <div className="mt-1.5 border-t border-ink-800 pt-1.5">
                  {/* Oldest first — it is a chronology, and reading it in the
                      order it happened is the only way it stays one. */}
                  <ol className="space-y-1.5">
                    {outcome.precededBy.map((iv, i) => (
                      <li key={`${iv.source.recordId}-${i}`} className="flex min-w-0 gap-2">
                        <span className="stat-mono mt-0.5 shrink-0 text-micro text-ink-500">
                          {formatDate(iv.at)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-micro font-medium text-ink-200">{iv.label}</p>
                          <p className="text-micro leading-relaxed text-ink-500">{iv.detail}</p>
                          <div className="mt-0.5">
                            <SourceChip source={iv.source} />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-2 border-t border-ink-800 pt-1.5 text-micro leading-relaxed text-watch/80">
                    {PRECEDED_BY_NOTE}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** The k-anonymity gate, rendered as an explanation rather than a blank. */
function Comparison({ coachId, goal }: { coachId: string; goal?: Goal }) {
  const cmp = React.useMemo(() => compareToClinic(coachId, goal), [coachId, goal]);

  if (!cmp.ok) {
    return (
      <div className="rounded-xl border border-watch/25 bg-watch/[0.06] p-3">
        <p className="label-eyebrow flex items-center gap-1.5 text-watch">
          <Lock className="h-3 w-3" />
          No comparison shown
        </p>
        <p className="mt-1 text-detail leading-relaxed text-ink-300">{cmp.explanation}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-watch/20 pt-2">
          <span className="flex items-baseline gap-1.5">
            <span className="stat-mono text-body font-semibold text-ink-100">{cmp.mineN}</span>
            <span className="text-micro text-ink-500">your measurable members</span>
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="stat-mono text-body font-semibold text-ink-100">{cmp.clinicN}</span>
            <span className="text-micro text-ink-500">clinic-wide</span>
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="stat-mono text-body font-semibold text-watch">{K_MIN}</span>
            <span className="text-micro text-ink-500">needed on each side</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-ink-700/70 bg-ink-900/40 p-3">
      <p className="label-eyebrow">Against the clinic</p>
      <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[
          { label: "Your book", side: cmp.mine, accent: "text-gold-300" },
          { label: "Clinic-wide", side: cmp.clinic, accent: "text-ink-100" },
        ].map((s) => (
          <div key={s.label} className="min-w-0 rounded-lg bg-ink-900/60 px-2.5 py-2">
            <p className="text-micro uppercase tracking-wide text-ink-600">{s.label}</p>
            <p className={cn("stat-mono mt-0.5 text-title font-semibold leading-none", s.accent)}>
              {s.side.improvedPct}%
            </p>
            <p className="mt-1 text-micro text-ink-500">
              {s.side.improved} improved of {s.side.n} measurable
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-detail leading-relaxed text-ink-400">{cmp.verdict}</p>
    </div>
  );
}

export function OutcomePanel({ coachId }: { coachId: string }) {
  const [open, setOpen] = React.useState(false);
  const [goal, setGoal] = React.useState<Goal | "all">("all");

  const all = React.useMemo(() => coachOutcomes(coachId), [coachId]);
  const goals = React.useMemo(() => goalsInBook(coachId), [coachId]);
  const rows = React.useMemo(
    () => (goal === "all" ? all : all.filter((o) => o.goal === goal)),
    [all, goal],
  );
  const totals = React.useMemo(() => outcomeTotals(rows), [rows]);

  return (
    <div className="card p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="focus-ring flex w-full min-w-0 items-center justify-between gap-2 rounded text-left"
      >
        <div className="min-w-0">
          <p className="label-eyebrow">Outcomes on primary goals</p>
          <p className="mt-0.5 text-detail text-ink-400">
            <span className="stat-mono text-optimal">{totals.improved}</span> improved ·{" "}
            <span className="stat-mono text-ink-300">{totals.unchanged}</span> flat ·{" "}
            <span className="stat-mono text-high">{totals.worse}</span> worse ·{" "}
            <span className="stat-mono text-watch">{totals.notMeasurable}</span> no measure
          </p>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-ink-500" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-ink-500" />
        )}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr] sm:items-center">
            <label className="text-micro text-ink-500" htmlFor="outcome-goal">
              Primary goal
            </label>
            <Select
              id="outcome-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value as Goal | "all")}
              className="sm:max-w-[240px]"
            >
              <option value="all">All goals</option>
              {goals.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </div>

          <Comparison coachId={coachId} goal={goal === "all" ? undefined : goal} />

          {/* The standing caveat, on the panel itself rather than only inside
              each expanded chronology. Somebody will screenshot this. */}
          <p className="rounded-lg border border-ink-800 bg-ink-900/40 px-2.5 py-2 text-micro leading-relaxed text-ink-500">
            {PRECEDED_BY_NOTE}
          </p>

          <div className="grid grid-cols-1 gap-1.5">
            {rows.map((o) => (
              <OutcomeRow key={o.clientId} outcome={o} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
