"use client";

/**
 * Term — an inline glossary word.
 *
 *   <Term k="shbg">SHBG</Term>
 *
 * That call signature is the whole design goal. This component is meant to be
 * scattered through member-facing copy by the dozen, so anything more
 * ceremonious than one prop would guarantee it gets used in three places and
 * then quietly abandoned.
 *
 * The important behaviour is the failure mode: an unrecognised key renders the
 * children as plain text with no underline, no button and no tooltip. A missing
 * glossary entry must never produce a dead affordance — an underlined word that
 * looks tappable and does nothing is a worse experience than no affordance at
 * all, and it is the exact thing that happens as copy drifts ahead of the
 * glossary. Here, drift degrades to ordinary prose.
 */

import * as React from "react";
import { Tip } from "@/components/ui/Tip";
import { lookup } from "@/lib/glossary/terms";
import { cn } from "@/lib/utils";

export function Term({
  k,
  children,
  className,
}: {
  /**
   * Glossary key, display term or alias — `lookup` is case- and
   * punctuation-insensitive, so "shbg", "SHBG" and "Sex Hormone Binding
   * Globulin" all resolve.
   */
  k: string;
  /** What to render inline. Defaults to the glossary's own display form. */
  children?: React.ReactNode;
  className?: string;
}) {
  const entry = lookup(k);

  // Unknown term → plain text. Never an underline, never a button.
  if (!entry) return <>{children ?? k}</>;

  const label = children ?? entry.term;

  return (
    <Tip
      label={`What ${entry.term} means`}
      content={
        <div className="space-y-2">
          <p className="font-display text-sm font-semibold text-ink-50">
            {entry.term}
            {entry.unit && (
              <span className="ml-1.5 stat-mono text-[11px] font-normal text-ink-500">
                {entry.unit}
              </span>
            )}
          </p>
          <p className="text-ink-200">{entry.short}</p>
          {/* `why` is the half members actually remember, so it gets a rule
              above it rather than being run together with the definition. */}
          <p className="border-t border-ink-700/70 pt-2 text-ink-400">{entry.why}</p>
        </div>
      }
    >
      <button
        type="button"
        className={cn(
          // Dotted underline rather than solid: solid reads as a link and
          // members expect a link to navigate. `decoration-*` keeps the rule
          // clear of descenders.
          "focus-ring rounded-sm underline decoration-dotted decoration-ink-500 underline-offset-[3px]",
          "text-inherit transition-colors hover:decoration-gold-400 motion-reduce:transition-none",
          className,
        )}
      >
        {label}
      </button>
    </Tip>
  );
}
