"use client";

import * as React from "react";
import { AlertTriangle, CheckSquare, Quote, HelpCircle } from "lucide-react";
import type { ConsultSummary, ExtractedItem } from "@/lib/consult/types";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * Read-only render of a ConsultSummary.
 *
 * Used on the client profile, inside ConsultCard, and in the client portal — the
 * same component in all three, because a coach and a member reading materially
 * different renderings of the same note is exactly the opacity problem we exist
 * to fix.
 *
 * When `raw` is supplied, every extracted item can show the sentence it came
 * from. Without it we still render, but the source quote on the item itself is
 * the fallback — an item never displays without *some* traceable origin.
 */
export function ConsultSummaryView({
  summary,
  raw,
  compact = false,
}: {
  summary: ConsultSummary;
  raw?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("space-y-4", compact && "space-y-3")}>
      {/* Headline — the one line a coach scanning a roster actually reads. */}
      <p
        className={cn(
          "font-display text-ink-100",
          compact ? "text-body" : "text-body leading-relaxed",
        )}
      >
        {summary.headline}
      </p>

      {/* Escalations first. If a provider needs to see something, it does not
          get buried under three sections of narrative. */}
      {summary.escalations.length > 0 && (
        <Section
          title="Flagged for provider"
          icon={<AlertTriangle className="h-3.5 w-3.5 text-high" />}
          tone="high"
        >
          <ul className="space-y-2">
            {summary.escalations.map((e, i) => (
              <li
                key={i}
                className="rounded-lg border border-high/25 bg-high/5 px-3 py-2 text-body text-ink-100"
              >
                {e.value}
                <SourceLine item={e} raw={raw} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(summary.goalsDiscussed.length > 0 || summary.symptomsRaised.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {summary.goalsDiscussed.map((g) => (
            <Badge key={`g-${g}`} tone="gold">
              {g}
            </Badge>
          ))}
          {summary.symptomsRaised.map((s) => (
            <Badge key={`s-${s}`} tone="watch">
              {s}
            </Badge>
          ))}
        </div>
      )}

      {summary.subjective.length > 0 && (
        <Section title="Subjective">
          <BulletList items={summary.subjective} />
        </Section>
      )}

      {summary.objective.length > 0 && (
        <Section title="Objective">
          <BulletList items={summary.objective} mono />
        </Section>
      )}

      {summary.actionItems.length > 0 && (
        <Section title="Action items" icon={<CheckSquare className="h-3.5 w-3.5 text-gold-400" />}>
          <ul className="space-y-1.5">
            {summary.actionItems.map((a, i) => (
              <li key={i} className="flex gap-2.5 text-body text-ink-200">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" />
                <span>
                  {a.value}
                  <SourceLine item={a} raw={raw} />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Never silently dropped. A model that quietly discards what it did not
          understand is a model nobody can audit. */}
      {summary.unclassified.length > 0 && !compact && (
        <Section
          title="Not classified"
          icon={<HelpCircle className="h-3.5 w-3.5 text-ink-500" />}
        >
          <p className="mb-2 text-detail text-ink-500">
            The engine saw these but would not assign them a category. Surfaced rather
            than discarded.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {summary.unclassified.map((u, i) => (
              <span
                key={i}
                className="rounded-md border border-ink-700 bg-ink-900/60 px-2 py-1 text-detail text-ink-400"
              >
                {u}
              </span>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  tone,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  tone?: "high";
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-1.5">
        {icon}
        <p className={cn("label-eyebrow", tone === "high" && "text-high")}>{title}</p>
      </div>
      {children}
    </section>
  );
}

function BulletList({ items, mono }: { items: string[]; mono?: boolean }) {
  return (
    <ul className="space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2.5 text-body text-ink-200">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-600" />
          <span className={cn(mono && "stat-mono text-detail")}>{t}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The source citation. `sourceStart` lets us pull the quote straight out of the
 * raw notes rather than trusting the copy stored on the item — if those two ever
 * disagree, the raw notes win, because they are the immutable record.
 */
function SourceLine({ item, raw }: { item: ExtractedItem; raw?: string }) {
  const quote =
    raw !== undefined
      ? raw.slice(item.sourceStart, item.sourceStart + item.sourceQuote.length) ||
        item.sourceQuote
      : item.sourceQuote;

  return (
    <span className="mt-1 flex items-start gap-1.5 text-micro italic text-ink-500">
      <Quote className="mt-[3px] h-2.5 w-2.5 shrink-0" />
      <span className="line-clamp-2">&ldquo;{quote}&rdquo;</span>
    </span>
  );
}
