"use client";

import * as React from "react";
import Link from "next/link";
import {
  PackageX,
  Ban,
  PhoneOff,
  CircleSlash,
  NotebookPen,
  CalendarX,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
} from "lucide-react";
import { Badge, Button, EmptyState } from "@/components/ui/primitives";
import { SourceChip } from "@/components/coach/SourceChip";
import { isSourced } from "@/lib/coach/provenance";
import {
  adherenceWorklist,
  worklistSummary,
  SIGNAL_LABEL,
  type RiskRow,
  type RiskSignal,
} from "@/lib/coach/adherenceRisk";
import { Monogram } from "@/components/Monogram";
import { cn } from "@/lib/utils";

/**
 * The adherence-risk worklist.
 *
 * ── The design constraint that produced this layout ───────────────────────
 * The reasons must be visible WITHOUT interaction. Putting them behind a
 * hover, a tooltip or an expand chevron would recreate exactly the thing
 * lib/coach/adherenceRisk.ts exists to replace: a ranked list of names and
 * numbers that a coach cannot audit at a glance and therefore does not trust.
 * So the top two reasons render inline on every row, and expanding adds the
 * remainder plus the signals that came back clean.
 *
 * ── Why the score is rendered so quietly ──────────────────────────────────
 * It is a sort key, not a measurement of the member — the engine's header says
 * so at length. It appears as small mono text in the corner, subordinate to the
 * reasons, because the moment it becomes the biggest thing on the row a coach
 * starts reading it as a grade and the reasons become decoration. The number
 * has to be there (a coach must be able to see why row 3 is above row 4) and it
 * must not dominate.
 */

const SIGNAL_ICON: Record<RiskSignal, React.ElementType> = {
  supply: PackageX,
  "refill-blocked": Ban,
  silence: PhoneOff,
  "missed-doses": CircleSlash,
  "journal-silence": NotebookPen,
  followup: CalendarX,
};

const BAND_META: Record<RiskRow["band"], { tone: "high" | "watch" | "neutral"; rule: string }> = {
  high: { tone: "high", rule: "border-l-high" },
  medium: { tone: "watch", rule: "border-l-watch" },
  low: { tone: "neutral", rule: "border-l-ink-600" },
};

/** Reasons shown before the row has to be expanded. */
const INLINE_REASONS = 2;

function ReasonLine({
  reason,
  dim,
}: {
  reason: RiskRow["reasons"][number];
  dim?: boolean;
}) {
  const Icon = SIGNAL_ICON[reason.signal];
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon
        className={cn("mt-0.5 h-3 w-3 shrink-0", dim ? "text-ink-600" : "text-ink-400")}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className={cn("text-detail font-medium", dim ? "text-ink-400" : "text-ink-100")}>
            {reason.label}
          </span>
          <span className="text-micro uppercase tracking-wide text-ink-600">
            {SIGNAL_LABEL[reason.signal]}
          </span>
          {/* The contribution, so the ranking is arithmetic a coach can follow
              rather than a black box that merely asserts an order. */}
          <span className="stat-mono text-micro text-ink-700">+{reason.points}</span>
        </div>
        <p className="mt-0.5 text-micro leading-relaxed text-ink-500">{reason.detail}</p>
        {isSourced(reason.source) && (
          <div className="mt-1">
            <SourceChip source={reason.source} />
          </div>
        )}
      </div>
    </div>
  );
}

function WorklistRow({ row, rank }: { row: RiskRow; rank: number }) {
  const [open, setOpen] = React.useState(false);
  const meta = BAND_META[row.band];

  const inline = row.reasons.slice(0, INLINE_REASONS);
  const rest = row.reasons.slice(INLINE_REASONS);

  return (
    <div className={cn("card border-l-2 px-3 py-2.5", meta.rule)}>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <span className="stat-mono mt-1 w-4 shrink-0 text-right text-micro text-ink-700">
            {rank}
          </span>
          <Monogram client={row.client} size="sm" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link
                href={`/clients/${row.client.id}`}
                className="focus-ring truncate rounded text-detail font-medium text-ink-50 hover:text-gold-300"
              >
                {row.name}
              </Link>
              <Badge tone={meta.tone}>{row.band === "high" ? "High risk" : row.band === "medium" ? "Watch" : "Low"}</Badge>
              <span className="stat-mono text-micro text-ink-700" title="Sort key only — not a measurement of the member">
                rank {row.score}
              </span>
            </div>

            {/* Reasons, always visible. This is the row. */}
            <div className="mt-1.5 grid grid-cols-1 gap-1.5">
              {inline.map((r) => (
                <ReasonLine key={r.signal + r.label} reason={r} />
              ))}
            </div>

            {open && rest.length > 0 && (
              <div className="mt-1.5 grid grid-cols-1 gap-1.5 border-t border-ink-800 pt-1.5">
                {rest.map((r) => (
                  <ReasonLine key={r.signal + r.label} reason={r} />
                ))}
              </div>
            )}

            {/* What was checked and came back clean. Without this a two-reason
                row is ambiguous — the coach cannot tell whether the other
                signals are fine or were never examined. */}
            {open && row.checked.length > 0 && (
              <div className="mt-2 border-t border-ink-800 pt-1.5">
                <p className="label-eyebrow flex items-center gap-1">
                  <ShieldCheck className="h-2.5 w-2.5 text-optimal" />
                  Checked, nothing wrong
                </p>
                <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  {row.checked.map((c) => (
                    <li key={c} className="text-micro text-ink-600">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(rest.length > 0 || row.checked.length > 0) && (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="focus-ring mt-1.5 inline-flex items-center gap-1 rounded text-micro font-medium text-ink-500 transition-colors hover:text-ink-200"
              >
                {open ? (
                  <>
                    <ChevronUp className="h-3 w-3" /> Less
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3" />
                    {rest.length > 0
                      ? `${rest.length} more reason${rest.length === 1 ? "" : "s"}`
                      : "What was checked"}
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1.5">
          <Link href={`/clients/${row.client.id}`}>
            <Button size="sm" variant="outline">
              Open
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export function AdherenceWorklist({ coachId }: { coachId: string }) {
  const rows = React.useMemo(() => adherenceWorklist(coachId), [coachId]);
  const summary = React.useMemo(() => worklistSummary(rows), [rows]);
  const [showAll, setShowAll] = React.useState(false);

  // Five is about what fits above the fold alongside the queue. The rest are one
  // click away rather than pushing TodayQueue off the screen — this page's
  // layout rule is that the queue stays visible.
  const shown = showAll ? rows : rows.slice(0, 5);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck className="h-6 w-6" />}
        title="Nobody in your book is drifting"
        hint="No supply about to run out, no refill holds, no one gone quiet past three weeks, no missed-dose clusters, no overdue follow-ups."
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="card px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <div className="min-w-0">
            <p className="label-eyebrow">Adherence risk · ranked</p>
            <p className="mt-0.5 text-micro leading-relaxed text-ink-500">
              Ranked by signals in the record, each shown with its contribution.{" "}
              {summary.dominant && (
                <>
                  Most common lead signal:{" "}
                  <span className="text-ink-300">{summary.dominant.toLowerCase()}</span>.
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-baseline gap-1.5">
              <span className="stat-mono text-heading font-semibold text-high">{summary.high}</span>
              <span className="text-micro text-ink-500">high</span>
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="stat-mono text-heading font-semibold text-ink-50">{summary.total}</span>
              <span className="text-micro text-ink-500">on the list</span>
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-1.5">
        {shown.map((row, i) => (
          <WorklistRow key={row.client.id} row={row} rank={i + 1} />
        ))}
      </div>

      {rows.length > 5 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="focus-ring w-full rounded-lg border border-ink-700 py-1.5 text-micro font-medium text-ink-400 transition-colors hover:border-ink-600 hover:text-ink-100"
        >
          {showAll ? "Show top 5" : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}
