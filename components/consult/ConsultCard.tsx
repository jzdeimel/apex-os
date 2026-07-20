"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  FileText,
  Pencil,
  MessageSquare,
  Phone,
  Video,
  User,
} from "lucide-react";
import type { Consult, ConsultChannel } from "@/lib/consult/types";
import { editedFields } from "@/lib/consult/types";
import { findingCount } from "@/lib/consult/summarize";
import { staffName } from "@/lib/mock/staff";
import { Badge, Card } from "@/components/ui/primitives";
import { ConsultSummaryView } from "@/components/consult/ConsultSummaryView";
import { ProvenanceDrawer, WhyButton } from "@/components/trace/ProvenanceDrawer";
import { cn, formatDateTime } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

const CHANNEL_ICON: Record<ConsultChannel, React.ComponentType<{ className?: string }>> = {
  "In person": User,
  Phone: Phone,
  Video: Video,
  Messaging: MessageSquare,
};

/**
 * One consult in a list.
 *
 * Collapsed it answers "what happened and is it signed"; expanded it answers
 * "what did the AI say, what did the human change, and what were the actual
 * words typed". The third of those is the one the system we are replacing
 * cannot answer at all — it keeps only the polished output.
 */
export function ConsultCard({
  consult,
  defaultOpen = false,
}: {
  consult: Consult;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [showRaw, setShowRaw] = React.useState(false);
  const [whyOpen, setWhyOpen] = React.useState(false);

  // The signed summary is the record of truth once it exists; before signing,
  // the AI's draft is what the coach is looking at.
  const summary = consult.finalSummary ?? consult.aiSummary;
  const edited = editedFields(consult);
  const signed = consult.status === "Signed";
  const ChannelIcon = CHANNEL_ICON[consult.channel];

  return (
    <>
      <Card className="overflow-hidden">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="focus-ring flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-ink-800/40"
        >
          <div className="mt-0.5 rounded-lg border border-ink-700 bg-ink-900/60 p-2 text-ink-400">
            <ChannelIcon className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-body font-semibold text-ink-50">
                {consult.kind}
              </span>
              <Badge tone={signed ? "optimal" : "watch"}>
                {signed ? "Signed" : "Awaiting review"}
              </Badge>
              {summary && summary.escalations.length > 0 && (
                <Badge tone="high">
                  {summary.escalations.length} flagged
                </Badge>
              )}
            </div>

            <p className="mt-1 text-detail text-ink-500">
              {staffName(consult.authorId)} · {consult.channel} ·{" "}
              <span className="stat-mono">{formatDateTime(consult.startedAt)}</span>
              {consult.durationMin != null && (
                <>
                  {" "}
                  · <span className="stat-mono">{consult.durationMin}m</span>
                </>
              )}
            </p>

            {summary && (
              <p className="mt-2 line-clamp-2 text-body text-ink-200">{summary.headline}</p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {summary && (
                <span className="stat-mono text-micro text-ink-500">
                  {findingCount(summary)} findings
                </span>
              )}
              {/* The AI-vs-human diff. Showing what a coach overrode is how you
                  learn whether the model is actually any good. */}
              {edited.length > 0 && (
                <Badge tone="info" className="gap-1">
                  <Pencil className="h-2.5 w-2.5" />
                  coach edited: {edited.join(", ")}
                </Badge>
              )}
              {consult.addenda.length > 0 && (
                <Badge tone="neutral">
                  {consult.addenda.length} addend{consult.addenda.length === 1 ? "um" : "a"}
                </Badge>
              )}
            </div>
          </div>

          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="mt-1 text-ink-500"
          >
            <ChevronDown className="h-4 w-4" />
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="border-t border-ink-700/60 p-4">
                {summary ? (
                  <>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="label-eyebrow">
                        {consult.finalSummary ? "Signed summary" : "AI draft summary"}
                      </p>
                      <WhyButton onClick={() => setWhyOpen(true)} />
                    </div>
                    <ConsultSummaryView summary={summary} raw={consult.rawNotes} />
                  </>
                ) : (
                  <p className="text-body text-ink-500">
                    No summary yet — this consult is still in progress.
                  </p>
                )}

                {consult.addenda.length > 0 && (
                  <div className="mt-5">
                    <p className="label-eyebrow">Addenda</p>
                    <ul className="mt-2 space-y-2">
                      {consult.addenda.map((a) => (
                        <li
                          key={a.id}
                          className="rounded-lg border border-ink-700 bg-ink-900/50 p-3"
                        >
                          <p className="text-body text-ink-200">{a.text}</p>
                          <p className="mt-1 text-micro text-ink-500">
                            {staffName(a.authorId)} ·{" "}
                            <span className="stat-mono">{formatDateTime(a.at)}</span> ·{" "}
                            {a.reason}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* The raw notes. Immutable, always available, never rewritten —
                    this is the artifact that makes the summary checkable. */}
                <div className="mt-5">
                  <button
                    onClick={() => setShowRaw((s) => !s)}
                    className="focus-ring inline-flex items-center gap-1.5 rounded-md text-detail font-medium text-ink-400 transition-colors hover:text-gold-300"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {showRaw ? "Hide original notes" : "View original notes"}
                  </button>
                  <AnimatePresence initial={false}>
                    {showRaw && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-ink-700 bg-ink-950/60 p-3 font-mono text-detail leading-relaxed text-ink-300">
                          {consult.rawNotes}
                        </pre>
                        <p className="mt-1.5 text-micro text-ink-600">
                          Verbatim, as typed. Immutable — corrections are recorded as
                          addenda, never as edits to this text.
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      <ProvenanceDrawer
        open={whyOpen}
        onClose={() => setWhyOpen(false)}
        title={`${consult.kind} summary`}
        // Once signed, the human owns the record — reflect that in the stamp
        // rather than continuing to attribute it to the engine.
        provenance={
          consult.aiProvenance && signed && consult.signedBy
            ? { ...consult.aiProvenance, computedBy: consult.signedBy }
            : consult.aiProvenance
        }
        because={[
          `Extracted from ${consult.rawNotes.split(/\n+/).filter(Boolean).length} lines of notes typed by ${staffName(consult.authorId)}.`,
          summary
            ? `${findingCount(summary)} findings classified: ${summary.subjective.length} subjective, ${summary.objective.length} objective, ${summary.actionItems.length} actions, ${summary.escalations.length} escalations.`
            : "No summary has been generated yet.",
          edited.length > 0
            ? `A coach overrode the engine on: ${edited.join(", ")}.`
            : "The coach accepted the engine's output without edits.",
          signed
            ? `Signed by ${staffName(consult.signedBy)} on ${formatDateTime(consult.signedAt)} — immutable from that point.`
            : "Not yet signed. This is an AI draft and carries no clinical weight until a human signs it.",
        ]}
        ruleIds={["consult.segment", "consult.classify", "consult.map-canonical"]}
        inputs={[
          { label: "Consult id", value: consult.id },
          { label: "Raw notes length", value: `${consult.rawNotes.length} chars` },
          { label: "Channel", value: consult.channel },
          { label: "Visible to member", value: consult.visibleToClient ? "Yes" : "No" },
        ]}
      />
    </>
  );
}
