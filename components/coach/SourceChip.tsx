"use client";

import * as React from "react";
import {
  FileText,
  NotebookPen,
  FlaskConical,
  Scale,
  Package,
  RefreshCw,
  AlertTriangle,
  CalendarDays,
  MessageSquare,
  Syringe,
  ShieldCheck,
  HelpCircle,
} from "lucide-react";
import { Tip } from "@/components/ui/Tip";
import { formatDateTime, cn } from "@/lib/utils";
import { isSourced, type SourceRef, type SourceKind } from "@/lib/coach/provenance";

/**
 * SourceChip — the inspectable citation.
 *
 * ── Why this is a component and not a `title` attribute ───────────────────
 * The claim being cited is often the reason a coach is about to say something
 * to a member. "You told me you'd reorder" lands very differently depending on
 * whether the system read that off the coach's own consult note or inferred it.
 * A native tooltip cannot be opened on a phone, cannot be read by touch, and
 * truncates — so on the one device where a coach is most likely to be reading a
 * brief between calls, the provenance would simply not exist. `Tip` handles
 * mouse, keyboard and tap, and portals out so it cannot widen the page.
 *
 * ── The chip must be able to say "nothing" ────────────────────────────────
 * A `NO_SOURCE` ref renders as a visibly different, muted chip that states
 * there is no record behind the line. This is the whole point: an unsourced
 * claim is not hidden, it is LABELLED. A UI that silently omits the chip when
 * evidence is missing teaches the reader that every visible line is sourced,
 * which makes the one unsourced line the most dangerous thing on the screen.
 */

const KIND_ICON: Record<SourceKind, React.ElementType> = {
  consult: FileText,
  journal: NotebookPen,
  lab: FlaskConical,
  scan: Scale,
  order: Package,
  subscription: RefreshCw,
  escalation: AlertTriangle,
  appointment: CalendarDays,
  contact: MessageSquare,
  protocol: Syringe,
  // The hash-chained one. A distinct icon because it is a categorically
  // stronger citation than the others — the row cannot have been edited.
  ledger: ShieldCheck,
  none: HelpCircle,
};

/** What each source type IS, for a reader who has not memorised the data model. */
const KIND_BLURB: Record<SourceKind, string> = {
  consult: "A consult note — the coach's own typing, retained verbatim.",
  journal: "The member's daily self-report.",
  lab: "A resulted lab panel.",
  scan: "A body-composition scan.",
  order: "A fulfilment order.",
  subscription: "An auto-refill subscription.",
  escalation: "A clinical question routed to a provider.",
  appointment: "A calendar appointment.",
  contact: "An entry in the contact log.",
  protocol: "The member's protocol.",
  ledger: "An append-only, hash-chained ledger row. Tamper-evident.",
  none: "No record produced this line.",
};

export function SourceChip({ source, className }: { source: SourceRef; className?: string }) {
  const Icon = KIND_ICON[source.kind];
  const sourced = isSourced(source);

  const panel = (
    <div className="space-y-2">
      <p className="text-micro font-semibold uppercase tracking-wide text-ink-400">
        {sourced ? "Source record" : "No source"}
      </p>
      <p className="text-detail font-medium text-ink-100">{source.label}</p>
      <p className="text-detail text-ink-400">{KIND_BLURB[source.kind]}</p>

      {/* The verbatim quote. Rendered as a quotation, never reflowed or
          sentence-cased — a coach recognising their own shorthand is what makes
          the citation persuasive. */}
      {source.quote && (
        <blockquote className="border-l-2 border-ink-600 pl-2.5 text-detail italic leading-relaxed text-ink-300">
          {source.quote}
        </blockquote>
      )}

      <dl className="space-y-1 border-t border-ink-700/70 pt-2 text-micro">
        {source.recordId && (
          <div className="flex min-w-0 gap-2">
            <dt className="shrink-0 text-ink-500">Record</dt>
            <dd className="stat-mono min-w-0 break-all text-ink-300">{source.recordId}</dd>
          </div>
        )}
        {source.at && (
          <div className="flex min-w-0 gap-2">
            <dt className="shrink-0 text-ink-500">Recorded</dt>
            <dd className="stat-mono min-w-0 text-ink-300">{formatDateTime(source.at)}</dd>
          </div>
        )}
      </dl>

      {!sourced && (
        <p className="text-detail leading-relaxed text-watch">
          This line is derived, not quoted. Nothing in the record states it directly — treat it as a
          prompt to check, not as a finding.
        </p>
      )}
    </div>
  );

  return (
    <Tip content={panel} label={`Source: ${source.label}`} className={className}>
      <button
        type="button"
        className={cn(
          "inline-flex max-w-full items-center gap-1 rounded-full border px-1.5 py-0.5 text-micro font-medium leading-none transition-colors focus-ring",
          sourced
            ? "border-ink-600/70 bg-ink-800/60 text-ink-400 hover:border-ink-500 hover:text-ink-200"
            : "border-watch/30 bg-watch/10 text-watch/90 hover:border-watch/50",
        )}
      >
        <Icon className="h-2.5 w-2.5 shrink-0" aria-hidden />
        <span className="truncate">{source.label}</span>
      </button>
    </Tip>
  );
}

/**
 * A row of chips.
 *
 * `min-w-0` on the wrapper and `truncate` on each chip: a long panel name in a
 * narrow table cell otherwise forces the grid wider than the viewport, which is
 * the CSS overflow bug this codebase has hit repeatedly.
 */
export function SourceChips({
  sources,
  className,
  emptyLabel = "No supporting record",
}: {
  sources: SourceRef[];
  className?: string;
  emptyLabel?: string;
}) {
  if (!sources.length) {
    return <p className={cn("text-micro italic text-ink-600", className)}>{emptyLabel}</p>;
  }
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}>
      {sources.map((s, i) => (
        <SourceChip key={`${s.kind}-${s.recordId}-${i}`} source={s} />
      ))}
    </div>
  );
}
