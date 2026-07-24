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
  CircleHelp,
} from "lucide-react";
import type { Consult, ConsultChannel } from "@/lib/consult/types";
import { editedFields } from "@/lib/consult/types";
import { findingCount } from "@/lib/consult/summarize";
import { staffName } from "@/lib/mock/staff";
import { Badge, Button, Card, Input, Textarea } from "@/components/ui/primitives";
import { ConsultSummaryView } from "@/components/consult/ConsultSummaryView";
import { ProvenanceDrawer, WhyButton } from "@/components/trace/ProvenanceDrawer";
import { cn, formatDateTime } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

const CHANNEL_ICON: Record<ConsultChannel, React.ComponentType<{ className?: string }>> = {
  "In person": User,
  Phone: Phone,
  Video: Video,
  Messaging: MessageSquare,
  "Chart review": FileText,
  "Unspecified legacy": CircleHelp,
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
  onChanged,
}: {
  consult: Consult;
  defaultOpen?: boolean;
  onChanged?: () => void;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [showRaw, setShowRaw] = React.useState(false);
  const [whyOpen, setWhyOpen] = React.useState(false);
  const [addingAddendum, setAddingAddendum] = React.useState(false);
  const [addendumBody, setAddendumBody] = React.useState("");
  const [addendumReason, setAddendumReason] = React.useState("");
  const [addendumAttested, setAddendumAttested] = React.useState(false);
  const [addendumSaving, setAddendumSaving] = React.useState(false);
  const [addendumError, setAddendumError] = React.useState<string | null>(null);

  async function signAddendum() {
    setAddendumSaving(true);
    setAddendumError(null);
    try {
      const response = await fetch("/api/consults/addenda", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          consultId: consult.id,
          body: addendumBody,
          reason: addendumReason,
          attested: addendumAttested,
          requestId: crypto.randomUUID().replaceAll("-", "_"),
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The signed addendum was not saved.");
      setAddingAddendum(false);
      setAddendumBody("");
      setAddendumReason("");
      setAddendumAttested(false);
      onChanged?.();
    } catch (error) {
      setAddendumError(error instanceof Error ? error.message : "The signed addendum was not saved.");
    } finally {
      setAddendumSaving(false);
    }
  }

  // The signed summary is the record of truth once it exists; before signing,
  // the AI's draft is what the coach is looking at.
  const summary = consult.finalSummary ?? consult.aiSummary;
  const edited = editedFields(consult);
  const signed = consult.status === "Signed";
  const statusLabel = signed ? "Signed" : consult.status;
  const ChannelIcon = CHANNEL_ICON[consult.channel];
  const internalMedicalReview =
    consult.kind === "Medical chart review" || consult.channel === "Chart review";
  const medicalEncounter =
    consult.kind === "Medical visit" ||
    consult.kind === "Medical follow-up" ||
    consult.kind === "Medical telehealth";

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
                {statusLabel}
              </Badge>
              {internalMedicalReview && (
                <Badge tone="info">Internal review · coach communicates</Badge>
              )}
              {medicalEncounter && (
                <Badge tone="info">Clinical visit · coach remains messaging contact</Badge>
              )}
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
                  author edited: {edited.join(", ")}
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
                {consult.clinicalNote && (
                  <section className="mb-5">
                    <p className="label-eyebrow">Clinician-authored SOAP note</p>
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                      {([
                        ["Subjective", consult.clinicalNote.subjective],
                        ["Objective", consult.clinicalNote.objective],
                        ["Assessment", consult.clinicalNote.assessment],
                        ["Plan", consult.clinicalNote.plan],
                      ] as const).map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-ink-700 bg-ink-950/45 p-3">
                          <p className="text-micro font-medium uppercase tracking-wide text-ink-500">{label}</p>
                          <p className="mt-1 whitespace-pre-wrap text-detail leading-relaxed text-ink-200">
                            {value || "Not documented."}
                          </p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-micro text-ink-600">
                      Written by the clinician. These fields are not generated by the AI summary.
                    </p>
                  </section>
                )}
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

                {signed && (
                  <div className="mt-4 border-t border-ink-800 pt-4">
                    {addingAddendum ? (
                      <div className="rounded-control border border-gold-400/25 bg-ink-900 p-3">
                        <p className="text-detail font-medium text-ink-100">Sign an addendum</p>
                        <p className="mt-1 text-micro text-ink-500">The original note remains immutable. This correction becomes a separately signed, audited record.</p>
                        {addendumError && <p className="mt-2 text-detail text-high" role="alert">{addendumError}</p>}
                        <Textarea className="mt-3 min-h-24" value={addendumBody} onChange={(event) => setAddendumBody(event.target.value)} maxLength={20000} placeholder="Correction or additional clinical fact" />
                        <Input className="mt-2" value={addendumReason} onChange={(event) => setAddendumReason(event.target.value)} maxLength={1000} placeholder="Why this addendum is necessary" />
                        <label className="mt-3 flex items-start gap-2 text-detail text-ink-300"><input className="mt-1" type="checkbox" checked={addendumAttested} onChange={(event) => setAddendumAttested(event.target.checked)} /><span>I attest that this addendum is accurate, necessary, and does not replace or alter the original signed note.</span></label>
                        <div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setAddingAddendum(false)}>Back</Button><Button size="sm" onClick={() => void signAddendum()} disabled={addendumSaving || !addendumBody.trim() || !addendumReason.trim() || !addendumAttested}>{addendumSaving ? "Signing…" : "Sign addendum"}</Button></div>
                      </div>
                    ) : <Button size="sm" variant="outline" onClick={() => setAddingAddendum(true)}><Pencil className="h-3.5 w-3.5" /> Add signed addendum</Button>}
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
            ? `The author overrode the engine on: ${edited.join(", ")}.`
            : "The author accepted the engine's output without edits.",
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
