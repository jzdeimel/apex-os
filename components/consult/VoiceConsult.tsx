"use client";

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Mic,
  MicOff,
  Square,
  Sparkles,
  AlertTriangle,
  Lock,
  Check,
  PenLine,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import type { ConsultSummary, ExtractedItem } from "@/lib/consult/types";
import { summarizeConsult, stampFor, findingCount, ENGINE_VERSION } from "@/lib/consult/summarize";
import {
  startDictation,
  stopDictation,
  transcriptToNotes,
  segmentForOffset,
  timecode,
  VOICE_CONFIDENCE_FLOOR,
  SPEAKER_PREFIX,
  type DictationSession,
  type VoiceSegment,
} from "@/lib/consult/voice";
import { appendLedger } from "@/lib/trace/ledger";
import { getClient, clientName } from "@/lib/mock/clients";
import { staffMap } from "@/lib/mock/staff";
import { shortHash } from "@/lib/trace/hash";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { cn, formatDateTime } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

/** The pinned demo clock — every timestamp in Apex derives from this. */
const NOW = "2026-06-12T09:00:00";

type Phase = "idle" | "recording" | "stopped" | "signed";

/**
 * THE VOICE CONSULT — speak it, structure it, sign it.
 *
 * Left: the transcript building as the coach talks, attributed line by line.
 * Right: the same structured summary the typed composer produces, from the same
 * `summarizeConsult` call, updating as words arrive.
 *
 * The point of this screen is that nothing about the guarantees weakened when
 * the coach put the keyboard down. Speaking is faster, and faster is exactly
 * when systems start accepting unsourced text — so the source-attribution
 * contract is enforced harder here, not softer:
 *
 *  1. **Every extracted item still cites its words.** Hover any line in the
 *     summary and the transcript segment it came from lights up, stamped with
 *     who said it and when. If the engine cannot point at the words, it does
 *     not get to make the claim.
 *  2. **The transcript is the record, not a byproduct.** It is retained exactly
 *     as raw typed notes are and signed together with the summary.
 *  3. **The member's words stay the member's words.** Attribution is carried in
 *     the note text itself, so a member's symptom report can never be read as a
 *     care-team instruction, or the reverse.
 *
 * DEMO HONESTY: no microphone is opened and `navigator.mediaDevices` is never
 * touched. The UI says so on the button, in the panel header, and in the
 * provenance block — a demo that merely *looks* live is how a stakeholder ends
 * up committing a date to a capability that does not exist.
 */
export function VoiceConsult({
  clientId,
  onSigned,
}: {
  clientId: string;
  onSigned?: (raw: string) => void;
}) {
  const { toast } = useToast();
  const reduceMotion = useReducedMotion();

  const [session, setSession] = React.useState<DictationSession | null>(null);
  const [deliveredCount, setDeliveredCount] = React.useState(0);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [hovered, setHovered] = React.useState<ExtractedItem | null>(null);
  const [confirmSign, setConfirmSign] = React.useState(false);

  const streamRef = React.useRef<HTMLDivElement>(null);

  const delivered: VoiceSegment[] = React.useMemo(
    () => (session ? session.segments.slice(0, deliveredCount) : []),
    [session, deliveredCount],
  );

  /**
   * The raw note text — the `rawNotes` of a spoken consult. This is the string
   * handed to the summarizer, and it is the string that gets signed.
   */
  const raw = React.useMemo(() => transcriptToNotes(delivered), [delivered]);

  // Re-summarized on every arriving segment. Undebounced on purpose: unlike
  // typing, segments land a few times a second at most, so there is no burst to
  // absorb — and a debounce here would make the summary visibly lag the words,
  // which is the one thing this screen exists to show not happening.
  const summary: ConsultSummary | null = React.useMemo(
    () => (raw.trim() ? summarizeConsult(raw) : null),
    [raw],
  );

  const stamp = React.useMemo(() => (raw.trim() ? stampFor(raw, NOW) : null), [raw]);

  const finalized = React.useMemo(
    () => (session && (phase === "stopped" || phase === "signed") ? stopDictation(session, delivered, { at: NOW }) : null),
    [session, delivered, phase],
  );

  /**
   * Which transcript segment the hovered summary item came from.
   *
   * Resolved through the offset rather than by matching text: the same short
   * sentence can be said twice in one consult, and a text match would light up
   * the wrong turn — attributing a member's words to the coach, or the reverse.
   */
  const hoveredSegmentId = React.useMemo(() => {
    if (!hovered) return null;
    return segmentForOffset(delivered, hovered.sourceStart)?.id ?? null;
  }, [hovered, delivered]);

  // -- The stream ----------------------------------------------------------
  // One timer per segment rather than one interval: each segment carries its own
  // arrival delay derived from how long the line takes to say, so the cadence is
  // conversational instead of metronomic.
  React.useEffect(() => {
    if (phase !== "recording" || !session) return;
    if (deliveredCount >= session.segments.length) {
      setPhase("stopped");
      return;
    }
    const next = session.segments[deliveredCount];
    const t = window.setTimeout(() => setDeliveredCount((c) => c + 1), next.arriveAfterMs);
    return () => window.clearTimeout(t);
  }, [phase, session, deliveredCount]);

  // Keep the newest line in view. Instant rather than smooth — a smooth scroll
  // that re-fires every segment fights itself, and `prefers-reduced-motion`
  // users should not be scrolled around at all.
  React.useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [deliveredCount]);

  function handleStart() {
    // Deterministic: same client, same transcript, same confidences, every run.
    const s = startDictation(`con-${clientId}-voice`, { at: NOW });
    setSession(s);
    setDeliveredCount(0);
    setPhase("recording");
    setConfirmSign(false);
  }

  function handleStop() {
    // Stopping truncates honestly — the transcript contains what was delivered
    // and nothing else. See stopDictation.
    setPhase("stopped");
  }

  function handleReset() {
    setSession(null);
    setDeliveredCount(0);
    setPhase("idle");
    setHovered(null);
    setConfirmSign(false);
  }

  function doSign() {
    setPhase("signed");
    setConfirmSign(false);

    // Signing is a state change, so it becomes a link in the chain. The row
    // records that this note was DICTATED and carries the transcript's own hash
    // alongside the summary's provenance — which is what makes "who signed
    // this, over which transcript, against which engine" answerable years later
    // rather than inferred.
    const client = getClient(clientId);
    const author = client ? staffMap[client.coachId] : undefined;
    const row = appendLedger({
      actorId: author?.id ?? "unknown",
      actorName: author?.name ?? "Unknown",
      actorRole: author?.role ?? "Coach",
      action: "sign",
      entity: "note",
      entityId: `con-${clientId}-voice`,
      subjectId: clientId,
      subjectName: client ? clientName(client) : undefined,
      locationId: client?.locationId,
      before: { status: "Draft", signedAt: null },
      after: {
        status: "Signed",
        channel: "Dictated",
        engine: stamp?.engine ?? "consult-summarizer",
        engineVersion: stamp?.engineVersion ?? ENGINE_VERSION,
        inputHash: stamp?.inputHash ?? "",
        transcriptHash: finalized?.textHash ?? "",
        transcriptSegments: delivered.length,
        transcriptRetained: true,
        findings: summary ? findingCount(summary) : 0,
      },
    });

    toast("Consult signed", {
      desc: `Transcript retained. Recorded as ${row.id} · ${shortHash(row.hash)}`,
    });
    onSigned?.(raw);
  }

  const recording = phase === "recording";
  const lowConfidenceCount = delivered.filter((s) => s.confidence < VOICE_CONFIDENCE_FLOOR).length;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* ================= LEFT: live transcript ================= */}
      <Card className="flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700/60 p-4">
          <div className="min-w-0">
            <p className="label-eyebrow">Transcript</p>
            <p className="mt-0.5 text-xs text-ink-500">
              Retained verbatim, exactly like typed notes. Never discarded.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {recording ? (
              <Button size="sm" variant="danger" onClick={handleStop}>
                <Square className="h-3.5 w-3.5" />
                Stop
              </Button>
            ) : phase === "idle" ? (
              <Button size="sm" variant="primary" onClick={handleStart}>
                <Mic className="h-3.5 w-3.5" />
                Simulate dictation
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={handleReset} aria-label="Start over">
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/*
          The honesty banner. Stated at the top of the panel, not buried in a
          tooltip: this is a scripted demo, no microphone is opened, and
          navigator.mediaDevices is never touched.
        */}
        <div className="flex items-start gap-2 border-b border-ink-700/60 bg-ink-900/40 px-4 py-2.5">
          <MicOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" />
          <p className="text-[11px] leading-relaxed text-ink-500">
            <span className="text-ink-300">Demo — no microphone is used.</span> A scripted consult
            is replayed segment by segment so you can see the transcript and the summary build
            together. In production this is an Azure AI Speech stream under Alpha Health&apos;s BAA,
            with per-session member consent captured before recording starts.
          </p>
        </div>

        <div ref={streamRef} className="min-h-[20rem] flex-1 overflow-y-auto p-4">
          {delivered.length === 0 ? (
            <div className="flex h-full min-h-[16rem] flex-col items-center justify-center rounded-xl border border-dashed border-ink-700 px-6 text-center">
              <Mic className="mb-3 h-5 w-5 text-ink-600" />
              <p className="text-sm text-ink-400">Press record and talk it through.</p>
              <p className="mt-1 text-xs text-ink-600">
                Every line is attributed. Who said it is part of the record.
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {delivered.map((seg) => (
                <TranscriptLine
                  key={seg.id}
                  segment={seg}
                  active={seg.id === hoveredSegmentId}
                  reduceMotion={Boolean(reduceMotion)}
                />
              ))}
            </ul>
          )}

          {recording && <ListeningIndicator />}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-700/60 px-4 py-2.5 text-[11px] text-ink-500">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              <span className="stat-mono">{delivered.length}</span> segments
            </span>
            <span className="text-ink-700">·</span>
            <span>
              <span className="stat-mono">{raw.length}</span> chars
            </span>
            {finalized && (
              <>
                <span className="text-ink-700">·</span>
                <span className="stat-mono">{timecode(finalized.durationMs)}</span>
              </>
            )}
          </div>
          {/* Low-confidence segments are surfaced, never silently accepted —
              numbers and clinical terms are exactly where ASR fails and exactly
              where an error is expensive. */}
          {lowConfidenceCount > 0 && (
            <Badge tone="watch">
              <ShieldAlert className="h-3 w-3" />
              {lowConfidenceCount} to verify before signing
            </Badge>
          )}
        </div>
      </Card>

      {/* ================= RIGHT: live summary ================= */}
      <Card className="flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-ink-700/60 p-4">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-gold-400" />
            <div className="min-w-0">
              <p className="label-eyebrow">Structured summary</p>
              <p className="mt-0.5 text-xs text-ink-500">
                Hover any item to find the words it came from.
              </p>
            </div>
          </div>
          <AnimatePresence>
            {recording && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-gold-300"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-400 motion-reduce:animate-none" />
                listening…
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <div className="min-h-[20rem] flex-1 space-y-5 overflow-y-auto p-4">
          {!summary ? (
            <div className="flex h-full min-h-[16rem] flex-col items-center justify-center rounded-xl border border-dashed border-ink-700 px-6 text-center">
              <Sparkles className="mb-3 h-5 w-5 text-ink-600" />
              <p className="text-sm text-ink-400">This builds itself as you speak.</p>
              <p className="mt-1 text-xs text-ink-600">
                Same engine as the typed composer. Nothing appears here that is not traceable to
                something someone actually said.
              </p>
            </div>
          ) : (
            <>
              <div>
                <p className="label-eyebrow">Headline</p>
                <p className="mt-1.5 font-display text-sm leading-relaxed text-ink-100">
                  {summary.headline}
                </p>
                <p className="stat-mono mt-2 text-[11px] text-ink-500">
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
                    {summary.escalations.map((e, i) => (
                      <SourcedItem
                        key={`esc-${i}`}
                        item={e}
                        onHover={setHovered}
                        segments={delivered}
                        className="border-high/30 bg-high/5 hover:border-high/60"
                      />
                    ))}
                  </ul>
                </section>
              )}

              {(summary.goalsDiscussed.length > 0 || summary.symptomsRaised.length > 0) && (
                <section className="space-y-2.5">
                  {summary.goalsDiscussed.length > 0 && (
                    <div>
                      <p className="label-eyebrow">Goals discussed</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {summary.goalsDiscussed.map((g) => (
                          <Badge key={`g-${g}`} tone="gold">
                            {g}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {summary.symptomsRaised.length > 0 && (
                    <div>
                      <p className="label-eyebrow">Symptoms raised</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {summary.symptomsRaised.map((s) => (
                          <Badge key={`s-${s}`} tone="watch">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {summary.actionItems.length > 0 && (
                <section>
                  <p className="label-eyebrow">Action items</p>
                  <ul className="mt-2 space-y-2">
                    {summary.actionItems.map((a, i) => (
                      <SourcedItem
                        key={`act-${i}`}
                        item={a}
                        onHover={setHovered}
                        segments={delivered}
                        className="border-ink-700 bg-ink-900/40 hover:border-ink-600"
                      />
                    ))}
                  </ul>
                </section>
              )}

              <TextSection title="Subjective" items={summary.subjective} />
              <TextSection title="Objective" items={summary.objective} mono />

              {summary.unclassified.length > 0 && (
                <section>
                  <p className="label-eyebrow">Not classified</p>
                  <p className="mt-1 text-[11px] text-ink-600">
                    Heard but not confidently categorized. Surfaced, never dropped.
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

              {/* Provenance — always visible, never behind a menu. Both hashes
                  are shown: the summary's input hash and the transcript's own,
                  because the transcript is a retained artifact in its own right
                  and not merely the summarizer's input. */}
              {stamp && (
                <div className="rounded-xl border border-ink-700/70 bg-ink-900/40 p-3">
                  <p className="label-eyebrow">Provenance</p>
                  <dl className="mt-2 space-y-1.5 text-[11px]">
                    <StampRow label="Source">Dictated · speaker-attributed</StampRow>
                    <StampRow label="Engine">
                      {stamp.engine} v{ENGINE_VERSION}
                    </StampRow>
                    <StampRow label="Input hash">{shortHash(stamp.inputHash)}</StampRow>
                    {finalized && (
                      <StampRow label="Transcript hash">{shortHash(finalized.textHash)}</StampRow>
                    )}
                    <StampRow label="Computed">{formatDateTime(stamp.computedAt)}</StampRow>
                    <StampRow label="Reviewed by">
                      {phase === "signed" ? "signed by you" : "not yet — AI draft"}
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
            {phase === "signed" ? (
              <motion.div
                key="signed"
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 rounded-lg border border-optimal/30 bg-optimal/5 p-3"
              >
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-optimal" />
                <p className="text-xs leading-relaxed text-ink-200">
                  Signed and locked. The transcript is stored with the summary, not replaced by
                  it — any correction from here attaches as an addendum.
                </p>
              </motion.div>
            ) : confirmSign ? (
              <motion.div
                key="confirm"
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: EASE }}
                className="rounded-xl border border-gold-400/30 bg-gold-400/5 p-3"
              >
                <p className="flex items-center gap-1.5 text-sm font-medium text-ink-50">
                  <Lock className="h-3.5 w-3.5 text-gold-300" />
                  Signing makes this immutable
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-300">
                  The transcript and this summary are locked together and hashed. You are signing
                  the words that were said, not only the structured read of them — which is what
                  lets anyone reading this in a year tell what the member actually reported.
                </p>
                {finalized && (
                  <p className="stat-mono mt-2 text-[11px] text-ink-500">
                    {delivered.length} segments · {shortHash(finalized.textHash)} ·{" "}
                    {formatDateTime(NOW)}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
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
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0 }}
                className="flex flex-wrap items-center gap-2"
              >
                <Button
                  variant="primary"
                  // Signing while the stream is still running would sign a
                  // transcript that is still changing underneath the signature.
                  disabled={phase !== "stopped" || !summary}
                  onClick={() => setConfirmSign(true)}
                >
                  <PenLine className="h-4 w-4" />
                  Sign consult
                </Button>
                <span className="text-[11px] text-ink-600">
                  {recording
                    ? "Stop recording to review and sign."
                    : phase === "idle"
                      ? "Record, review, then sign."
                      : "Review the transcript above, then sign."}
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

/**
 * One attributed turn.
 *
 * The speaker label is rendered as a distinct, always-present element rather
 * than as styling, because "who said this" is content. A member's report and a
 * coach's instruction that differ only by text colour are one screenshot away
 * from being indistinguishable.
 */
function TranscriptLine({
  segment,
  active,
  reduceMotion,
}: {
  segment: VoiceSegment;
  active: boolean;
  reduceMotion: boolean;
}) {
  const isMember = segment.speaker === "member";
  const lowConfidence = segment.confidence < VOICE_CONFIDENCE_FLOOR;

  return (
    <motion.li
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className={cn(
        "rounded-lg border px-3 py-2 transition-colors",
        active
          ? "border-gold-400/60 bg-gold-500/10"
          : "border-transparent bg-ink-900/40 hover:border-ink-700",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={cn(
            "stat-mono text-[10px] font-semibold uppercase tracking-wider",
            isMember ? "text-gold-300" : "text-ink-400",
          )}
        >
          {SPEAKER_PREFIX[segment.speaker].replace(":", "")}
        </span>
        <span className="stat-mono text-[10px] text-ink-600">{timecode(segment.startMs)}</span>
        {lowConfidence && (
          <span className="stat-mono text-[10px] text-watch">
            {(segment.confidence * 100).toFixed(0)}% — verify
          </span>
        )}
      </div>
      <p
        className={cn(
          "mt-1 text-sm leading-relaxed",
          isMember ? "text-ink-100" : "text-ink-300",
        )}
      >
        {segment.text}
      </p>
    </motion.li>
  );
}

/**
 * Deterministic activity indicator.
 *
 * Fixed bar heights and CSS-only animation — no Math.random, no per-frame
 * state. `motion-reduce:animate-none` leaves a static, still-legible meter for
 * anyone who has asked the OS for less movement; the "recording" word carries
 * the meaning either way, so nothing is lost when the motion is.
 */
const BAR_HEIGHTS = ["h-2", "h-4", "h-3", "h-5", "h-2.5"];
const BAR_DELAYS = ["0ms", "120ms", "240ms", "80ms", "180ms"];

function ListeningIndicator() {
  return (
    <div className="mt-3 flex items-center gap-2 px-1">
      <div className="flex items-end gap-0.5" aria-hidden>
        {BAR_HEIGHTS.map((h, i) => (
          <span
            key={i}
            className={cn("w-0.5 animate-pulse rounded-full bg-gold-400/80 motion-reduce:animate-none", h)}
            style={{ animationDelay: BAR_DELAYS[i] }}
          />
        ))}
      </div>
      <span className="text-[11px] text-ink-500" role="status">
        recording…
      </span>
    </div>
  );
}

/**
 * A summary item that knows where it came from.
 *
 * Hover or focus resolves the item's offset back to a transcript segment and
 * lights that segment up. Focus is wired alongside hover deliberately — source
 * attribution that only exists for a mouse is not an accessible feature, it is
 * a demo.
 */
function SourcedItem({
  item,
  segments,
  onHover,
  className,
}: {
  item: ExtractedItem;
  segments: VoiceSegment[];
  onHover: (item: ExtractedItem | null) => void;
  className?: string;
}) {
  const source = segmentForOffset(segments, item.sourceStart);

  return (
    <li
      tabIndex={0}
      onMouseEnter={() => onHover(item)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(item)}
      onBlur={() => onHover(null)}
      className={cn("focus-ring rounded-lg border p-3 transition-colors", className)}
    >
      <p className="text-sm text-ink-100">{item.value}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-500">
        <span className="stat-mono">conf {(item.confidence * 100).toFixed(0)}%</span>
        {source && (
          <>
            <span className="text-ink-700">·</span>
            {/* Attribution travels with the claim, not just with the transcript. */}
            <span>
              said by{" "}
              <span className={source.speaker === "member" ? "text-gold-300" : "text-ink-300"}>
                {source.speaker}
              </span>{" "}
              at <span className="stat-mono">{timecode(source.startMs)}</span>
            </span>
          </>
        )}
      </div>
    </li>
  );
}

function StampRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className="stat-mono truncate text-ink-200">{children}</dd>
    </div>
  );
}

function TextSection({ title, items, mono }: { title: string; items: string[]; mono?: boolean }) {
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
