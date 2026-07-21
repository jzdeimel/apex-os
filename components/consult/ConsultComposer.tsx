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
import { appendLedger } from "@/lib/trace/ledger";
import { getClient, clientName } from "@/lib/mock/clients";
import { staffName } from "@/lib/mock/staff";
import { raiseEscalation, SLA_HOURS } from "@/lib/escalations/queue";
import { commitEscalation } from "@/lib/mock/escalations";
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

/** Slower than the summarizer: the summary is local and free, a PUT is neither. */
const SAVE_DEBOUNCE_MS = 1200;

/**
 * THE CONSULT SCRIBE.
 *
 * Left: what the coach types. Right: what the engine reads out of it, live.
 *
 * Three things this does that the system we are replacing does not:
 *
 *  1. **Nothing is asserted without a citation.** Hover any extracted item and
 *     the exact substring it came from lights up in the raw notes. If the engine
 *     cannot point at the words, it does not get to make the claim — that is the
 *     whole contract, and this UI is where it becomes visible rather than
 *     merely promised.
 *
 *  2. **Work cannot be lost — and PHI never sits on the workstation.** An earlier
 *     build autosaved the note to localStorage, which meant an unsigned clinical
 *     note survived sign-out on a shared clinic machine, readable by the next
 *     person to sit down (audit P0 #8). Now every autosave is an authenticated
 *     PUT to a server-side draft keyed to (this author, this client); the browser
 *     holds nothing durable. If the save cannot happen, the composer SAYS SO —
 *     see `saveStatus` — rather than pretending it did.
 *
 *  3. **Signing is real.** The author-sign posts to the gated draft endpoint,
 *     which transitions the row Draft → Signed and writes a hash-chained ledger
 *     row attributed to the AUTHENTICATED signer — not, as before, to whoever the
 *     chart's coach happened to be.
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
  const [signing, setSigning] = React.useState(false);
  const [restored, setRestored] = React.useState(false);

  // Server-draft lifecycle. `hydrating` blocks autosave until the initial GET
  // resolves, so a slow load can never overwrite the stored draft with empty.
  const [hydrating, setHydrating] = React.useState(true);
  const [saveStatus, setSaveStatus] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const textRef = React.useRef<HTMLTextAreaElement>(null);
  const highlightRef = React.useRef<HTMLDivElement>(null);

  // Autosave coalescing: never two PUTs in flight; if the note changes while one
  // is out, remember to re-save the latest when it lands (last-write-wins).
  const inFlight = React.useRef(false);
  const dirtyAfterSave = React.useRef(false);
  const rawRef = React.useRef("");
  const summaryRef = React.useRef<ConsultSummary | null>(null);
  React.useEffect(() => {
    rawRef.current = raw;
    summaryRef.current = summary;
  }, [raw, summary]);

  // -- Restore -------------------------------------------------------------
  // Fetch the caller's server-side draft on mount. Never reads localStorage —
  // there is nothing there to read, by design. A failed GET does not block the
  // composer: the clinician can still write; it just starts empty.
  React.useEffect(() => {
    let cancelled = false;
    setHydrating(true);
    (async () => {
      try {
        const r = await fetch(`/api/consults/draft?clientId=${encodeURIComponent(clientId)}`, {
          headers: { Accept: "application/json" },
        });
        const res = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (r.ok && res.ok && res.draft?.rawNotes) {
          setRaw(res.draft.rawNotes);
          setSummary(summarizeConsult(res.draft.rawNotes));
          setSavedAt(res.draft.updatedAt ?? null);
          setSaveStatus("saved");
          setRestored(true);
        }
      } catch {
        // Offline / no DB — start empty. The "not saving" state below will show
        // the moment the clinician types, so nothing is silently lost.
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
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

  // -- Autosave (server) ---------------------------------------------------
  // One PUT at a time. While a save is in flight, later edits set a dirty flag
  // and re-fire the save with the latest text when it lands, so the server row
  // always converges on what the clinician last typed.
  const persist = React.useCallback(async () => {
    if (inFlight.current) {
      dirtyAfterSave.current = true;
      return;
    }
    inFlight.current = true;
    setSaveStatus("saving");
    try {
      const r = await fetch("/api/consults/draft", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          rawNotes: rawRef.current,
          aiSummary: summaryRef.current ?? undefined,
        }),
      });
      const res = await r.json().catch(() => ({}));
      if (r.ok && res.ok) {
        setSaveStatus("saved");
        setSavedAt(res.updatedAt ?? null);
        setSaveError(null);
        setRestored(false);
      } else {
        setSaveStatus("error");
        setSaveError(res.error || `Save rejected (HTTP ${r.status}).`);
      }
    } catch {
      setSaveStatus("error");
      setSaveError("The draft could not reach the server. Your notes are not backed up.");
    } finally {
      inFlight.current = false;
      if (dirtyAfterSave.current) {
        dirtyAfterSave.current = false;
        void persist();
      }
    }
  }, [clientId]);

  React.useEffect(() => {
    // Nothing to save while hydrating, after signing, or before the first
    // keystroke against an empty draft.
    if (hydrating || signed) return;
    if (!raw && saveStatus === "idle") return;
    const t = window.setTimeout(() => void persist(), SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [raw, hydrating, signed, saveStatus, persist]);

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
    setRestored(false);
    setSigned(false);
    // Persist the cleared state so a navigate-away doesn't restore old notes.
    // Empty is a legitimate draft; the effect above will PUT rawNotes: "".
    setSaveStatus("saving");
    void persist();
  }

  async function saveDraft() {
    await persist();
    // `persist` has set saveStatus/saveError; surface the outcome as a toast too.
    if (inFlight.current === false && saveStatus === "error") {
      toast("Draft not saved", { tone: "warn", desc: saveError ?? "The server rejected the save." });
    } else {
      toast("Draft saved", { desc: "Backed up to your account — restored on any device." });
    }
  }

  async function doSign() {
    setConfirmSign(false);
    setSigning(true);
    try {
      const r = await fetch("/api/consults/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const res = await r.json().catch(() => ({}));
      if (r.ok && res.ok) {
        setSigned(true);
        toast("Consult signed", {
          desc: `Immutable. Recorded durably as ${res.ledger.id} · ${shortHash(res.ledger.hash)}`,
        });
        onSigned?.(raw);
      } else if (r.status === 409) {
        // No live draft on the server — usually because the autosave never
        // reached it. Say so plainly instead of forging a signature.
        toast("Nothing to sign yet", {
          tone: "warn",
          desc: "This note hasn't saved to the server. Check the draft status and try again.",
        });
      } else {
        toast("Could not sign", {
          tone: "warn",
          desc: res.error || `The server refused the signature (HTTP ${r.status}).`,
        });
      }
    } catch {
      toast("Could not sign", {
        tone: "warn",
        desc: "The signature could not reach the server. Nothing was signed.",
      });
    } finally {
      setSigning(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* ================= LEFT: raw notes ================= */}
      <Card className="flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700/60 p-4">
          <div>
            <p className="label-eyebrow">Your notes</p>
            <p className="mt-0.5 text-detail text-ink-500">
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
              className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-lg border border-ink-700 bg-ink-950/40 px-3 py-2 font-mono text-detail leading-relaxed text-transparent"
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
                "focus-ring relative h-full w-full resize-none overflow-auto rounded-lg border border-transparent bg-transparent px-3 py-2 font-mono text-detail leading-relaxed text-ink-100 placeholder:text-ink-600",
                signed && "opacity-70",
              )}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-micro text-ink-500">
              <span className="stat-mono">{raw.length}</span> chars
              {saveStatus === "saving" && (
                <>
                  <span className="text-ink-700">·</span>
                  <span className="inline-flex items-center gap-1 text-ink-400">
                    <Save className="h-3 w-3 animate-pulse" /> Saving…
                  </span>
                </>
              )}
              {saveStatus === "saved" && savedAt && (
                <>
                  <span className="text-ink-700">·</span>
                  <span className="inline-flex items-center gap-1 text-optimal">
                    <Check className="h-3 w-3" /> Draft saved{" "}
                    <span className="stat-mono">{formatTime(savedAt)}</span>
                  </span>
                </>
              )}
            </div>
            {restored && <Badge tone="info">Restored from your account</Badge>}
          </div>

          {/* Honest failure — never a silent lost note. This is where the old
              build's silent catch used to be. */}
          {saveStatus === "error" && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-critical/40 bg-critical/10 p-2.5 text-micro text-critical">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>Draft not saving.</strong> {saveError ?? "Your notes are not backed up."} They
                stay on screen, but leaving this page may lose them — retry with{" "}
                <span className="font-medium">Save draft</span>.
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* ================= RIGHT: live summary ================= */}
      <Card className="flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-ink-700/60 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-gold-400" />
            <div>
              <p className="label-eyebrow">Structured summary</p>
              <p className="mt-0.5 text-detail text-ink-500">
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
                className="inline-flex items-center gap-1.5 text-micro text-gold-300"
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
              <p className="text-body text-ink-400">Start typing and this builds itself.</p>
              <p className="mt-1 text-detail text-ink-600">
                Nothing appears here that is not traceable to your words.
              </p>
            </div>
          ) : (
            <>
              <div>
                <p className="label-eyebrow">Headline</p>
                <p className="mt-1.5 font-display text-body leading-relaxed text-ink-100">
                  {summary.headline}
                </p>
                <p className="mt-2 stat-mono text-micro text-ink-500">
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
                  {/*
                    Scope stated up front, because the toast below says "in
                    their queue now" and that has to be exactly as true as it
                    sounds. It is: the escalation lands in the same store the
                    provider console reads. What it does NOT survive is a page
                    reload — the queue is in memory in this prototype. Saying so
                    here is cheaper than a coach discovering it.
                  */}
                  <p className="mb-2 text-micro leading-relaxed text-ink-600">
                    Routes to the member&apos;s provider with an SLA clock. Prototype: the queue is
                    held in memory and resets on reload.
                  </p>
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
                          <p className="text-body text-ink-100">{e.value}</p>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="stat-mono text-micro text-ink-500">
                              conf {(e.confidence * 100).toFixed(0)}%
                            </span>
                            <Button
                              size="sm"
                              variant={escalated[key] ? "success" : "danger"}
                              onClick={() => {
                                // This used to be a toast claiming it had
                                // routed the item to a queue that did not
                                // exist — worse than no button, because the
                                // coach believed the provider had it. It now
                                // raises a real escalation with a clock on it.
                                const client = getClient(clientId);
                                const esc = raiseEscalation({
                                  /**
                                   * Scoped by client as well as by item index.
                                   * `esc-live-esc-0` alone collides across
                                   * members — the second coach to escalate the
                                   * first finding on any chart would overwrite
                                   * the first member's escalation in the store,
                                   * because commitEscalation replaces by id.
                                   */
                                  id: `esc-live-${clientId}-${key}`,
                                  clientId,
                                  raisedByStaffId: client?.coachId ?? "unknown",
                                  assignedToStaffId: client?.providerId ?? "unknown",
                                  kind: "Clinical question",
                                  question: e.value,
                                  // The provider reads the coach's original
                                  // words, never a paraphrase.
                                  sourceQuote: e.sourceQuote,
                                  raisedAt: NOW,
                                });

                                /**
                                 * THE MISSING WRITE.
                                 *
                                 * The audit found `raiseEscalation()`'s return
                                 * value being discarded here — only a boolean
                                 * survived, to flip the button to "Routed".
                                 * `raiseEscalation` is a pure constructor; it
                                 * builds an Escalation and hands it back, and
                                 * the caller is what puts it in the queue. So
                                 * the button rendered "Routed", toasted an SLA,
                                 * and the provider's queue never changed. A
                                 * coach escalating chest pain got the same
                                 * green tick as one escalating a sleep peptide,
                                 * and both went nowhere.
                                 *
                                 * `commitEscalation` puts it in the shared
                                 * store, which is what `queueFor(providerId)`
                                 * reads — so it genuinely appears on the clinic
                                 * console and in /clinic/escalations. Same
                                 * pattern as commitOrder / CoachGroup's
                                 * member-initiated escalation.
                                 */
                                const committed = commitEscalation(esc);

                                const row = appendLedger({
                                  actorId: committed.raisedByStaffId,
                                  actorName: staffName(committed.raisedByStaffId),
                                  actorRole: "Coach",
                                  action: "create",
                                  entity: "recommendation",
                                  entityId: committed.id,
                                  subjectId: clientId,
                                  subjectName: client ? clientName(client) : undefined,
                                  locationId: client?.locationId,
                                  reason: `Escalated to ${staffName(committed.assignedToStaffId)}`,
                                  after: {
                                    priority: committed.priority,
                                    dueWithinHours: SLA_HOURS[committed.priority],
                                    assignedTo: staffName(committed.assignedToStaffId),
                                  },
                                });

                                setEscalated((s) => ({ ...s, [key]: true }));
                                /**
                                 * The toast now describes what happened rather
                                 * than what was intended. "In their queue now"
                                 * is a claim we can only make because of the
                                 * commit above — before it, this string was
                                 * false, and the SLA it quoted was a clock on
                                 * an object nobody held.
                                 */
                                toast(`${committed.priority} — in ${staffName(committed.assignedToStaffId)}'s queue`, {
                                  tone: committed.priority === "Urgent" ? "warn" : undefined,
                                  desc: `Due within ${SLA_HOURS[committed.priority]}h · open it under Clinic → Escalations · ledger ${row.id} · ${shortHash(row.hash)}`,
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
                <section className="space-y-2.5">
                  {/* Split rather than merged: several terms — "Joint pain" is
                      the obvious one — are legitimately BOTH a goal and a
                      symptom. Rendered in one row they read as a duplicate; the
                      labels are what make the repetition meaningful. */}
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
                              "text-body text-ink-200",
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
                  <p className="mt-1 text-micro text-ink-600">
                    Seen but not confidently categorized. Surfaced, never dropped.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {summary.unclassified.map((u, i) => (
                      <span
                        key={i}
                        className="rounded-md border border-ink-700 bg-ink-900/60 px-2 py-1 text-detail text-ink-400"
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
                  <dl className="mt-2 space-y-1.5 text-micro">
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
                <p className="text-detail text-ink-200">
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
                <p className="flex items-center gap-1.5 text-body font-medium text-ink-50">
                  <Lock className="h-3.5 w-3.5 text-gold-300" />
                  Signing makes this immutable
                </p>
                <p className="mt-1.5 text-detail leading-relaxed text-ink-300">
                  Your raw notes and this summary are locked together and hashed. Later
                  corrections attach as addenda rather than editing the record — which is
                  what lets anyone reading this in a year tell what you actually wrote.
                </p>
                {stamp && (
                  <p className="stat-mono mt-2 text-micro text-ink-500">
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
                  disabled={!summary || signing || saveStatus === "error" || saveStatus === "saving"}
                  onClick={() => setConfirmSign(true)}
                >
                  <PenLine className="h-4 w-4" />
                  {signing ? "Signing…" : "Sign consult"}
                </Button>
                <Button variant="outline" disabled={!raw || saveStatus === "saving"} onClick={saveDraft}>
                  <Save className="h-4 w-4" />
                  Save draft
                </Button>
                <span className="text-micro text-ink-600">
                  {saveStatus === "error"
                    ? "Resolve the save error before signing."
                    : "Drafts autosave to your account — restored on any device."}
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
          <li key={i} className="flex gap-2.5 text-body text-ink-200">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-600" />
            <span className={cn(mono && "stat-mono text-detail")}>{t}</span>
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
