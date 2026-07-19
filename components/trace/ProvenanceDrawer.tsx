"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info, X, ShieldCheck, ShieldAlert, Cpu, Hash, Clock } from "lucide-react";
import type { ProvenanceStamp } from "@/lib/consult/types";
import { shortHash } from "@/lib/trace/hash";
import { formatDateTime, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/primitives";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * "Why am I seeing this?"
 *
 * Every derived number in Apex — an Alpha Score, a triage rank, a churn risk, an
 * AI headline — is answerable. The system we are replacing surfaces scores with
 * no way to interrogate them, which means a coach either trusts them blindly or
 * ignores them entirely. Both are failures.
 *
 * This drawer is the universal answer surface. Plain language first (what a coach
 * or a client needs), technical detail below the divider (what an auditor needs).
 */

export interface ProvenanceDrawerProps {
  open: boolean;
  onClose: () => void;
  /** What is being explained, e.g. "Alpha Score" or "AI consult summary". */
  title: string;
  provenance?: ProvenanceStamp;
  /** Plain-language reasons, in priority order. The "because" list. */
  because?: string[];
  /** Identifiers of the rules that fired — the auditable version of `because`. */
  ruleIds?: string[];
  /** 0–1. Rendered as a bar plus a percentage; omitted entirely if undefined. */
  confidence?: number;
  /** The exact inputs the computation consumed. */
  inputs?: { label: string; value: string }[];
}

export function ProvenanceDrawer({
  open,
  onClose,
  title,
  provenance,
  because,
  ruleIds,
  confidence,
  inputs,
}: ProvenanceDrawerProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Escape closes. Bound at document level so it works regardless of where
  // focus currently sits — a user who clicked the backdrop still expects Esc.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Move focus into the panel on open so screen readers land in the explanation
  // rather than being left behind on the trigger.
  React.useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  // A human has reviewed this iff provenance was computed by a staff member
  // rather than by the engine. `computedBy === "system"` means AI output that
  // nobody has signed off on yet, and we say so plainly.
  const humanReviewed = Boolean(provenance && provenance.computedBy !== "system");

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-ink-950/70 backdrop-blur-sm"
          />
          <motion.div
            key="panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Provenance for ${title}`}
            tabIndex={-1}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.32, ease: EASE }}
            className="fixed right-0 top-0 z-[101] flex h-full w-full max-w-md flex-col border-l border-ink-700 bg-ink-900 shadow-card outline-none"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-ink-700/70 p-5">
              <div className="min-w-0">
                <p className="label-eyebrow">Provenance</p>
                <h2 className="mt-1 truncate font-display text-lg font-semibold text-ink-50">
                  {title}
                </h2>
              </div>
              <button
                onClick={onClose}
                aria-label="Close provenance"
                className="focus-ring rounded-lg p-1.5 text-ink-500 transition-colors hover:bg-ink-800 hover:text-ink-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {/* ---- Plain language ------------------------------------ */}
              <div className="flex items-center gap-2">
                {humanReviewed ? (
                  <Badge tone="optimal">
                    <ShieldCheck className="h-3 w-3" />
                    Human reviewed
                  </Badge>
                ) : (
                  <Badge tone="watch">
                    <ShieldAlert className="h-3 w-3" />
                    Not yet reviewed by a person
                  </Badge>
                )}
                {provenance?.engineVersion && (
                  <Badge tone="neutral">v{provenance.engineVersion}</Badge>
                )}
              </div>

              {because && because.length > 0 && (
                <section className="mt-5">
                  <p className="label-eyebrow">Because</p>
                  <ul className="mt-2 space-y-2">
                    {because.map((b, i) => (
                      <li key={i} className="flex gap-2.5 text-sm text-ink-200">
                        <span className="stat-mono mt-0.5 shrink-0 text-xs text-gold-400">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {typeof confidence === "number" && (
                <section className="mt-5">
                  <div className="flex items-baseline justify-between">
                    <p className="label-eyebrow">Confidence</p>
                    <span className="stat-mono text-sm text-ink-100">
                      {Math.round(confidence * 100)}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-700/70">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round(confidence * 100)}%` }}
                      transition={{ duration: 0.5, ease: EASE }}
                      className={cn(
                        "h-full rounded-full",
                        confidence >= 0.8
                          ? "bg-optimal"
                          : confidence >= 0.6
                            ? "bg-gold-400"
                            : "bg-watch",
                      )}
                    />
                  </div>
                  <p className="mt-2 text-xs text-ink-500">
                    How strongly the source text supported this conclusion. Anything the
                    engine could not source is left out rather than guessed.
                  </p>
                </section>
              )}

              {inputs && inputs.length > 0 && (
                <section className="mt-5">
                  <p className="label-eyebrow">Exact inputs used</p>
                  <dl className="mt-2 overflow-hidden rounded-xl border border-ink-700/70">
                    {inputs.map((io, i) => (
                      <div
                        key={io.label + i}
                        className={cn(
                          "flex items-baseline justify-between gap-4 px-3 py-2",
                          i > 0 && "border-t border-ink-700/50",
                        )}
                      >
                        <dt className="text-xs text-ink-400">{io.label}</dt>
                        <dd className="stat-mono text-right text-xs text-ink-100">{io.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              {/* ---- Divider: below here is for auditors --------------- */}
              <div className="hairline my-6" />
              <p className="label-eyebrow">Technical detail</p>

              {provenance ? (
                <dl className="mt-3 space-y-3">
                  <TechRow icon={<Cpu className="h-3.5 w-3.5" />} label="Engine">
                    {provenance.engine}
                    <span className="text-ink-500"> @ v{provenance.engineVersion}</span>
                  </TechRow>
                  {provenance.model && (
                    <TechRow icon={<Cpu className="h-3.5 w-3.5" />} label="Model">
                      {provenance.model}
                    </TechRow>
                  )}
                  <TechRow icon={<Hash className="h-3.5 w-3.5" />} label="Input hash">
                    <span title={provenance.inputHash}>{shortHash(provenance.inputHash)}</span>
                  </TechRow>
                  <TechRow icon={<Clock className="h-3.5 w-3.5" />} label="Computed">
                    {formatDateTime(provenance.computedAt)}
                  </TechRow>
                  <TechRow icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Computed by">
                    {provenance.computedBy}
                  </TechRow>
                </dl>
              ) : (
                <p className="mt-2 text-xs text-ink-500">
                  No provenance stamp is attached to this value. That is itself a finding —
                  every derived value in Apex is expected to carry one.
                </p>
              )}

              {ruleIds && ruleIds.length > 0 && (
                <section className="mt-5">
                  <p className="label-eyebrow">Rules fired</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ruleIds.map((r) => (
                      <span
                        key={r}
                        className="stat-mono rounded-md border border-ink-700 bg-ink-850 px-2 py-1 text-[11px] text-ink-300"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              <p className="mt-6 text-xs leading-relaxed text-ink-500">
                Re-running {provenance?.engine ?? "this engine"} at the version above against
                the input hash above reproduces this value exactly. That is what makes it
                defensible a year from now.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function TechRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="flex items-center gap-2 text-xs text-ink-400">
        <span className="text-ink-600">{icon}</span>
        {label}
      </dt>
      <dd className="stat-mono max-w-[60%] break-all text-right text-xs text-ink-100">
        {children}
      </dd>
    </div>
  );
}

/**
 * The inline trigger. Deliberately quiet — it sits next to a score or a heading
 * and should read as an affordance, not a call to action. Loud "explain" buttons
 * imply the number is suspect; a subtle one implies the number is answerable.
 */
export function WhyButton({
  onClick,
  label = "Why?",
  className,
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "focus-ring inline-flex items-center gap-1 rounded-full border border-ink-700/70 px-2 py-0.5 text-[11px] font-medium leading-none text-ink-400 transition-colors hover:border-gold-400/40 hover:text-gold-300",
        className,
      )}
    >
      <Info className="h-3 w-3" />
      {label}
    </button>
  );
}
