"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  AlertTriangle,
  ArrowUpRight,
  FileText,
  Save,
  PenLine,
  Lock,
  Check,
  RotateCcw,
} from "lucide-react";
import type { ConsultSummary, ExtractedItem } from "@/lib/consult/types";
import { summarizeConsult, stampFor, findingCount, ENGINE_VERSION } from "@/lib/consult/summarize";
import { NOTE_TEMPLATE_SAMPLES } from "@/lib/mock/consults";
import { shortHash } from "@/lib/trace/hash";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { cn, formatTime, formatDateTime } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * The pinned demo clock. Every timestamp in Apex derives from this so a
 * screenshot taken today and one taken in six months are identical.
 */
const NOW = "2026-06-12T09:00:00";

const DEBOUNCE_MS = 450;

const PLACEHOLDER = `type the way you actually type — this is not a form

weighed in at 214, down 3.2 from last month
energy better in the mornings, still crashes ~3pm
sleep is the problem, waking 2-3x
asked about a peptide for sleep — flagging for the provider
rebook 4 weeks`;

/** Namespaced per client so two members' drafts can never collide. */
function draftKey(clientId: string) {
  return `apex.consult.draft.${clientId}`;
}

interface StoredDraft {
  raw: string;
  savedAt: string;
  revisions: number;
}

/**
 * THE CONSULT SCRIBE.
 *
 * Left: what the coach types. Right: what the engine reads out of it, live.
 *
 * Two things this does that the system we are replacing does not:
 *
 *  1. **Nothing is asserted without a citation.** Hover any extracted item and
 *     the exact substring it came from lights up in the raw notes. If the engine
 *     cannot point at the words, it does not get to make the claim — that is the
 *     whole contract, and this UI is where it becomes visible rather than
 *     merely promised.
 *
 *  2. **Work cannot be lost.** Today, navigating away from a half-written
 *     clinical note silently discards it. Here every keystroke lands in
 *     localStorage under a client-scoped key and is restored on mount.
 */
export function ConsultComposer({
  clientId,
  onSigned,
}: {
  clientId: string;
  onSigned?: (raw: string) => void;
}) {
  const { toast } = useToast();

  const [raw, setRaw] = React.useState("");
  const [summary, setSummary] = React.useState<ConsultSummary | null>(null);
  const [summarizing, setSummarizing] = React.useState(false);
  const [hovered, setHovered] = React.useState<ExtractedItem | null>(null);
  const [done, setDone] = React.useState<Record<string, boolean>>({});
  const [escalated, setEscalated] = React.useState<Record<string, boolean>>({});
  const [confirmSign, setConfirmSign] = React.useState(false);
  const [signed, setSigned] = React.useState(false);
  const [draftMeta, setDraftMeta] = React.useState<{ savedAt: string; revisions: number } | null>(
    null,
  );
  const [restored, setRestored] = React.useState(false);

  const textRef = React.useRef<HTMLTextAreaElement>(null);
  const highlightRef = React.useRef<HTMLDivElement>(null);

  // -- Restore -------------------------------------------------------------
  // Read on mount only (never during render) so server and client markup match.
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(draftKey(clientId));
      if (!stored) return;
      const d = JSON.parse(stored) as StoredDraft;
      if (d?.raw) {
        setRaw(d.raw);
        setSummary(summarizeConsult(d.raw));
        setDraftMeta({ savedAt: d.savedAt, revisions: d.revisions });
        setRestored(true);
      }
    } catch {
      // A corrupt draft must never block the composer — the coach still needs
      // to be able to write the note.
    }
  }, [clientId]);

  // -- Summarize (debounced) ----------------------------------------------
  React.useEffect(() => {
    if (!raw.trim()) {
      setSummary(null);
      setSummarizing(false);
      return;
    }
    setSummarizing(true);
    const t = window.setTimeout(() => {
      setSummary(summarizeConsult(raw));
      setSummarizing(false);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [raw]);

  // -- Autosave ------------------------------------------------------------
  // Same debounce window as summarization: one settle, both effects.
  React.useEffect(() => {
    if (!raw) return;
    const t = window.setTimeout(() => {
      const next: StoredDraft = {
        raw,
        savedAt: NOW,
        revisions: (draftMeta?.revisions ?? 0) + 1,
      };
      try {
        window.localStorage.setItem(draftKey(clientId), JSON.stringify(next));
        setDraftMeta({ savedAt: next.savedAt, revisions: next.revisions });
      } catch {
        // Quota or private-mode failure. Silent here; the absent "Draft saved"
        // stamp is the signal, and we never pretend a save happened.
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
    // draftMeta intentionally excluded — including it would re-fire the effect
    // on every save and count revisions twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, clientId]);

  // Keep the highlight underlay scrolled in lockstep with the textarea, or the
  // highlight drifts off the word it is supposed to be marking.
  const syncScroll = React.useCallback(() => {
    if (highlightRef.current && textRef.current) {
      highlightRef.current.scrollTop = textRef.current.scrollTop;
      highlightRef.current.scrollLeft = textRef.current.scrollLeft;
    }
  }, []);

  const stamp = React.useMemo(() => (raw ? stampFor(raw, NOW) : null), [raw]);

  function loadSample() {
    const sample = NOTE_TEMPLATE_SAMPLES[0];
    setRaw(sample);
    setSummary(summarizeConsult(sample));
    setSummarizing(false);
    setRestored(false);
    textRef.current?.focus();
  }

  function clearDraft() {
    setRaw("");
    setSummary(null);
    setDraftMeta(null);
    setRestored(false);
    setSigned(false);
    try {
      window.localStorage.removeItem(draftKey(clientId));
    } catch {
      /* nothing recoverable to do */
    }
  }

  function saveDraft() {
    try {
      window.localStorage.setItem(
        draftKey(clientId),
        JSON.stringify({ raw, savedAt: NOW, revisions: (draftMeta?.revisions ?? 0) + 1 }),
      );
      setDraftMeta({ savedAt: NOW, revisions: (draftMeta?.revisions ?? 0) + 1 });
      toast("Draft saved", { desc: "Restored automatically if you navigate away." });
    } catch {
      toast("Could not save draft", { tone: "warn", desc: "Local storage is unavailable." });
    }
  }

  function doSign() {
    setSigned(true);
    setConfirmSign(false);
    try {
      window.localStorage.removeItem(draftKey(clientId));
    } catch {
      /* draft is superseded by the signed record either way */
    }
    toast("Consult signed", {
      desc: "Immutable. Corrections are recorded as addenda.",
    });
    onSigned?.(raw);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ================= LEFT: raw notes ================= */}
      <Card className="flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700/60 p-4">
          <div>
            <p className="label-eyebrow">Your notes</p>
            <p className="mt-0.5 text-xs text-ink-500">
              Verbatim and immutable once signed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={loadSample}>
              <FileText className="h-3.5 w-3.5" />
              Load a sample consult
            </Button>
            {raw && (
              <Button size="sm" variant="ghost" onClick={clearDraft} aria-label="Clear draft">
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        <div className="relative flex-1 p-4">
          {/*
            Source highlighting is done with an underlay: a div that renders the
            same text with the matched span marked, sitting exactly beneath a
            transparent-text textarea. Every font/spacing property below MUST
            stay identical between the two layers or the highlight drifts.
          */}
          <div className="relative h-full min-h-[22rem]">
            <div
              ref={highlightRef}
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-lg border border-ink-700 bg-ink-950/40 px-3 py-2 font-mono text-[13px] leading-relaxed text-transparent"
            >
              <HighlightedText raw={raw} item={hovered} />
            </div>
            <textarea
              ref={textRef}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              onScroll={syncScroll}
              spellCheck={false}
              disabled={signed}
              placeholder={PLACEHOLDER}
              className={cn(
                // Transparent background so the highlight underlay shows through;
                // the underlay owns the border and fill.
                "focus-ring relative h-full w-full resize-none overflow-auto rounded-lg border border-transparent bg-transparent px-3 py-2 font-mono text-[13px] leading-relaxed text-ink-100 placeholder:text-ink-600",
                signed && "opacity-70",
              )}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] text-ink-500">
              <span className="stat-mono">{raw.length}</span> chars
              {draftMeta && (
                <>
                  <span className="text-ink-700">·</span>
                  <span className="inline-flex items-center gap-1 text-optimal">
                    <Save className="h-3 w-3" />
                    Draft saved{" "}
                    <span className="stat-mono">{formatTime(draftMeta.savedAt)}</span>
                  </span>
                  <span className="text-ink-700">·</span>
                  <span className="stat-mono">rev {draftMeta.revisions}</span>
                </>
              )}
            </div>
            {restored && (
              <Badge tone="info">Restored from your last session</Badge>
            )}
          </div>
        </div>
      </Card>

      {/* ================= RIGHT: live summary ================= */}
      <Card className="flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-ink-700/60 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-gold-400" />
            <div>
              <p className="label-eyebrow">Structured summary</p>
              <p className="mt-0.5 text-xs text-ink-500">
                Hover any item to see the words it came from.
              </p>
            </div>
          </div>
          <AnimatePresence>
            {summarizing && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="inline-flex items-center gap-1.5 text-[11px] text-gold-300"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-400 motion-reduce:animate-none" />
                summarizing…
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {!summary ? (
            <div className="flex h-full min-h-[16rem] flex-col items-center justify-center rounded-xl border border-dashed border-ink-700 px-6 text-center">
              <Sparkles className="mb-3 h-5 w-5 text-ink-600" />
              <p className="text-sm text-ink-400">Start typing and this builds itself.</p>
              <p className="mt-1 text-xs text-ink-600">
                Nothing appears here that is not traceable to your words.
              </p>
            </div>
          ) : (
            <>
              <div>
                <p className="label-eyebrow">Headline</p>
                <p className="mt-1.5 font-display text-sm leading-relaxed text-ink-100">
                  {summary.headline}
                </p>
                <p className="mt-2 stat-mono text-[11px] text-ink-500">
                  {findingCount(summary)} findings
                </p>
              </div>

              {/* Escalations first — a missed escalation is the expensive failure. */}
              {summary.escalations.length > 0 && (
                <section>
                  <div className="mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-high" />
                    <p className="label-eyebrow text-high">Escalate to provider</p>
                  </div>
                  <ul className="space-y-2">
                    {summary.escalations.map((e, i) => {
                      const key = `esc-${i}`;
                      return (
                        <li
                          key={key}
                          onMouseEnter={() => setHovered(e)}
                          onMouseLeave={() => setHovered(null)}
                          onFocus={() => setHovered(e)}
                          onBlur={() => setHovered(null)}
                          className="rounded-lg border border-high/30 bg-high/5 p-3 transition-colors hover:border-high/60"
                        >
                          <p className="text-sm text-ink-100">{e.value}</p>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="stat-mono text-[11px] text-ink-500">
                              conf {(e.confidence * 100).toFixed(0)}%
                            </span>
                            <Button
                              size="sm"
                              variant={escalated[key] ? "success" : "danger"}
                              onClick={() => {
                                setEscalated((s) => ({ ...s, [key]: true }));
                                toast("Routed to provider", {
                                  desc: "Added to the provider review queue with the source quote attached.",
                                });
                              }}
                            >
                              {escalated[key] ? (
                                <>
                                  <Check className="h-3.5 w-3.5" />
                                  Routed
                                </>
                              ) : (
                                <>
                                  <ArrowUpRight className="h-3.5 w-3.5" />
                                  Escalate
                                </>
                              )}
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {(summary.goalsDiscussed.length > 0 || summary.symptomsRaised.length > 0) && (
                <section>
                  <p className="label-eyebrow">Goals &amp; symptoms detected</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
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
                </section>
              )}

              {summary.actionItems.length > 0 && (
                <section>
                  <p className="label-eyebrow">Action items</p>
                  <ul className="mt-2 space-y-1">
                    {summary.actionItems.map((a, i) => {
                      const key = `act-${i}`;
                      return (
                        <li
                          key={key}
                          onMouseEnter={() => setHovered(a)}
                          onMouseLeave={() => setHovered(null)}
                          className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-ink-800/60"
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(done[key])}
                            onChange={(e) =>
                              setDone((d) => ({ ...d, [key]: e.target.checked }))
                            }
                            className="focus-ring mt-0.5 h-3.5 w-3.5 shrink-0 accent-gold-500"
                            aria-label={a.value}
                          />
                          <span
                            className={cn(
                              "text-sm text-ink-200",
                              done[key] && "text-ink-500 line-through",
                            )}
                          >
                            {a.value}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              <TextSection title="Subjective" items={summary.subjective} />
              <TextSection title="Objective" items={summary.objective} mono />

              {summary.unclassified.length > 0 && (
                <section>
                  <p className="label-eyebrow">Not classified</p>
                  <p className="mt-1 text-[11px] text-ink-600">
                    Seen but not confidently categorized. Surfaced, never dropped.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {summary.unclassified.map((u, i) => (
                      <span
                        key={i}
                        className="rounded-md border border-ink-700 bg-ink-900/60 px-2 py-1 text-xs text-ink-400"
                      >
                        {u}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* Provenance stamp — always visible, not hidden behind a menu. */}
              {stamp && (
                <div className="rounded-xl border border-ink-700/70 bg-ink-900/40 p-3">
                  <p className="label-eyebrow">Provenance</p>
                  <dl className="mt-2 space-y-1.5 text-[11px]">
                    <StampRow label="Engine">
                      {stamp.engine} v{ENGINE_VERSION}
                    </StampRow>
                    <StampRow label="Input hash">{shortHash(stamp.inputHash)}</StampRow>
                    <StampRow label="Computed">{formatDateTime(stamp.computedAt)}</StampRow>
                    <StampRow label="Reviewed by">
                      {signed ? "signed by you" : "not yet — AI draft"}
                    </StampRow>
                  </dl>
                </div>
              )}
            </>
          )}
        </div>

        {/* ---- Actions ---- */}
        <div className="border-t border-ink-700/60 p-4">
          <AnimatePresence mode="wait">
            {signed ? (
              <motion.div
                key="signed"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 rounded-lg border border-optimal/30 bg-optimal/5 p-3"
              >
                <Lock className="h-4 w-4 shrink-0 text-optimal" />
                <p className="text-xs text-ink-200">
                  Signed and locked. Any correction from here is recorded as an addendum —
                  the signed body is never rewritten.
                </p>
              </motion.div>
            ) : confirmSign ? (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: EASE }}
                className="rounded-xl border border-gold-400/30 bg-gold-400/5 p-3"
              >
                <p className="flex items-center gap-1.5 text-sm font-medium text-ink-50">
                  <Lock className="h-3.5 w-3.5 text-gold-300" />
                  Signing makes this immutable
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-300">
                  Your raw notes and this summary are locked together and hashed. Later
                  corrections attach as addenda rather than editing the record — which is
                  what lets anyone reading this in a year tell what you actually wrote.
                </p>
                {stamp && (
                  <p className="stat-mono mt-2 text-[11px] text-ink-500">
                    {stamp.engine} v{ENGINE_VERSION} · {shortHash(stamp.inputHash)} ·{" "}
                    {formatDateTime(stamp.computedAt)}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="primary" onClick={doSign}>
                    <Check className="h-3.5 w-3.5" />
                    Confirm &amp; sign
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmSign(false)}>
                    Cancel
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="actions"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-wrap items-center gap-2"
              >
                <Button
                  variant="primary"
                  disabled={!summary}
                  onClick={() => setConfirmSign(true)}
                >
                  <PenLine className="h-4 w-4" />
                  Sign consult
                </Button>
                <Button variant="outline" disabled={!raw} onClick={saveDraft}>
                  <Save className="h-4 w-4" />
                  Save draft
                </Button>
                <span className="text-[11px] text-ink-600">
                  Drafts autosave — nothing is lost if you navigate away.
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function StampRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className="stat-mono truncate text-ink-200">{children}</dd>
    </div>
  );
}

function TextSection({
  title,
  items,
  mono,
}: {
  title: string;
  items: string[];
  mono?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <p className="label-eyebrow">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2.5 text-sm text-ink-200">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-600" />
            <span className={cn(mono && "stat-mono text-[13px]")}>{t}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Renders the raw text in three pieces — before / matched / after — so the
 * hovered item's source substring can be marked.
 *
 * We locate the span by `sourceStart` and the quote's length rather than by
 * searching for the quote text: the same sentence can legitimately appear twice
 * in a note, and a search would light up the wrong one. The offset is the only
 * unambiguous answer, which is precisely why ExtractedItem carries it.
 *
 * The trailing "\n " guards against a browser collapsing a trailing newline in
 * the underlay, which would desynchronize it from the textarea by one line.
 */
function HighlightedText({ raw, item }: { raw: string; item: ExtractedItem | null }) {
  if (!item) return <>{raw + "\n "}</>;

  const start = Math.max(0, Math.min(item.sourceStart, raw.length));
  const end = Math.min(raw.length, start + item.sourceQuote.length);

  return (
    <>
      {raw.slice(0, start)}
      <mark className="rounded-[3px] bg-gold-500/30 text-transparent shadow-[inset_0_-1px_0_0_rgba(233,61,61,0.7)]">
        {raw.slice(start, end)}
      </mark>
      {raw.slice(end) + "\n "}
    </>
  );
}
