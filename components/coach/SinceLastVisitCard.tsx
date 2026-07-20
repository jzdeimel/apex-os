"use client";

import * as React from "react";
import {
  FlaskConical,
  ClipboardList,
  Syringe,
  MessageSquare,
  Package,
  AlertTriangle,
  Scale,
  NotebookPen,
  CalendarDays,
  CircleSlash,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { SourceChip } from "@/components/coach/SourceChip";
import { isSourced } from "@/lib/coach/provenance";
import {
  sinceLastVisit,
  COACH_CHANGE_KIND_LABEL,
  type CoachChangeKind,
  type VisitChange,
  type SinceLastVisit,
} from "@/lib/coach/sinceLastVisit";
import { cn, formatDateTime, formatDate } from "@/lib/utils";

/**
 * "What changed since I last saw them" — the compact card.
 *
 * Sits at the top of a member's view, above anything the coach might otherwise
 * start reading. The ordering rule it inherits from lib/changes/since.ts is the
 * whole reason it works: importance first, recency second. A recency-first card
 * buries Monday's abnormal panel under this morning's shipping ping, which is
 * the exact failure a pre-call summary exists to prevent.
 *
 * Two behaviours worth stating:
 *
 *  1. THE BASELINE IS ALWAYS VISIBLE. Not in a tooltip — on the face of the
 *     card. "12 things since you saw them" means nothing until you know the
 *     cut line, and when Apex has fallen back to a colleague's consult or to a
 *     join date, the coach must see that BEFORE they trust the count.
 *  2. COLLAPSED STILL COUNTS THE FLAGS. High-importance items are summarised in
 *     the header and listed first when open, so nothing that needs attention is
 *     ever only reachable behind a click.
 */

const KIND_ICON: Record<CoachChangeKind, React.ElementType> = {
  lab: FlaskConical,
  plan: ClipboardList,
  protocol: Syringe,
  consult: ClipboardList,
  order: Package,
  message: MessageSquare,
  escalation: AlertTriangle,
  body: Scale,
  journal: NotebookPen,
  adherence: CircleSlash,
  appointment: CalendarDays,
};

/** How many rows show before the card asks to be expanded. */
const PREVIEW_ROWS = 4;

function ChangeRow({ item }: { item: VisitChange }) {
  const Icon = KIND_ICON[item.kind];
  const high = item.importance === "high";

  return (
    <div
      className={cn(
        "flex min-w-0 gap-2.5 rounded-xl border p-2.5",
        high ? "border-high/30 bg-high/[0.06]" : "border-ink-700/70 bg-ink-900/40",
      )}
    >
      <Icon
        className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", high ? "text-high" : "text-ink-500")}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className={cn("text-detail font-medium", high ? "text-ink-50" : "text-ink-200")}>
            {item.headline}
          </p>
          <Badge tone="neutral">{COACH_CHANGE_KIND_LABEL[item.kind]}</Badge>
          {high && <Badge tone="high">Before you call</Badge>}
        </div>
        <p className="mt-1 text-detail leading-relaxed text-ink-400">{item.detail}</p>
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="stat-mono text-micro text-ink-600">{formatDateTime(item.at)}</span>
          {/* Only render a chip where there is a record to point at. The
              unsourced case is handled once, in the card footer, rather than
              repeated on every derived row — see the note there. */}
          {isSourced(item.source) && <SourceChip source={item.source} />}
        </div>
      </div>
    </div>
  );
}

export function SinceLastVisitCard({
  clientId,
  coachId,
  defaultOpen = false,
  className,
}: {
  clientId: string;
  coachId: string;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  // Computed once per member. The engine is pure and seeded, so recomputing on
  // every render would be wasted work rather than wrong — but this card renders
  // inside a table row, where "wasted work" is multiplied by the roster.
  const diff: SinceLastVisit = React.useMemo(
    () => sinceLastVisit(clientId, coachId),
    [clientId, coachId],
  );

  const shown = open ? diff.items : diff.items.slice(0, PREVIEW_ROWS);
  const hidden = diff.items.length - shown.length;
  const derived = diff.items.filter((i) => !isSourced(i.source)).length;

  return (
    <div className={cn("card p-3", className)}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="label-eyebrow">Since you last saw them</p>
          <p className="mt-0.5 text-body font-medium leading-snug text-ink-50">{diff.headline}</p>
        </div>
        {diff.needsAttention > 0 && (
          <Badge tone="high">
            <AlertTriangle className="h-3 w-3" />
            {diff.needsAttention} flagged
          </Badge>
        )}
      </div>

      {/* The cut line, on the face of the card. A count without a baseline is
          not a fact, and a fallback baseline that looks like a real one is
          actively misleading — so the degraded cases get a warning tone. */}
      <p
        className={cn(
          "mt-1.5 text-micro leading-relaxed",
          diff.baseline.kind === "consult-with-me" ? "text-ink-500" : "text-watch",
        )}
      >
        {diff.baseline.note}{" "}
        <span className="stat-mono text-ink-600">
          Cut line {formatDate(diff.baseline.at)}
        </span>
      </p>

      {diff.items.length === 0 ? (
        <p className="mt-2.5 rounded-xl border border-dashed border-ink-700 px-3 py-4 text-center text-detail text-ink-500">
          Nothing has been recorded against this member since then. That is a real answer, not an
          empty panel — no labs, no orders, no messages, no journal entries.
        </p>
      ) : (
        <>
          <div className="mt-2.5 grid grid-cols-1 gap-1.5">
            {shown.map((item) => (
              <ChangeRow key={item.id} item={item} />
            ))}
          </div>

          {(hidden > 0 || open) && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="focus-ring mt-2 inline-flex items-center gap-1 rounded text-micro font-medium text-ink-400 transition-colors hover:text-ink-100"
            >
              {open ? (
                <>
                  <ChevronUp className="h-3 w-3" /> Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" /> {hidden} more
                </>
              )}
            </button>
          )}
        </>
      )}

      {/*
        Stated once, plainly. Several sources feeding this card (the shared
        `changesSince` engine, and the seeded ring-history adherence series)
        report a rendered sentence rather than the id of the row behind it, so
        those lines genuinely cannot be cited. Declaring that at the foot of the
        card is honest; back-filling plausible-looking record ids so every row
        got a chip would not be.
      */}
      {derived > 0 && (
        <p className="mt-2 border-t border-ink-800 pt-2 text-micro leading-relaxed text-ink-600">
          {derived} of these {diff.items.length} lines are derived from engines that do not return a
          source row, so they carry no chip. They are summaries of the record, not quotations from
          it.
        </p>
      )}
    </div>
  );
}

/**
 * The roster cell.
 *
 * A table cell has room for a shape, not a sentence — so this reports the size
 * of the diff and how much of it is flagged, and leaves the detail to the card.
 * `whitespace-nowrap` keeps it from reflowing the column at tablet width.
 */
export function SinceLastVisitInline({
  clientId,
  coachId,
}: {
  clientId: string;
  coachId: string;
}) {
  const diff = React.useMemo(() => sinceLastVisit(clientId, coachId), [clientId, coachId]);

  return (
    <span
      className={cn(
        "stat-mono whitespace-nowrap text-detail",
        diff.needsAttention ? "text-high" : diff.items.length ? "text-ink-300" : "text-ink-600",
      )}
      title={`${diff.headline} — ${diff.baseline.note}`}
    >
      {diff.inline}
    </span>
  );
}
