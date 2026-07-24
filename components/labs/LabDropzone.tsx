"use client";

import * as React from "react";
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  Crosshair,
  Ban,
  RotateCcw,
} from "lucide-react";
import { Badge, Button, Card, CardContent } from "@/components/ui/primitives";
import { FadeIn } from "@/components/motion";
import { useToast } from "@/components/ui/Toast";
import { SourceViewer } from "@/components/labs/SourceViewer";
import { useCurrentStaff } from "@/lib/auth/useCurrentStaff";
import {
  ingestLabReport,
  chartCommitDraft,
  confidencePct,
  REVIEW_REQUIRED_BELOW,
  type IngestedMarker,
  type LabIngestResult,
} from "@/lib/labs/ingest";
import { appendLedger } from "@/lib/trace/ledger";
import { getClient, clientName } from "@/lib/mock/clients";
import { formatDate, cn } from "@/lib/utils";

/**
 * LAB PDF INGESTION — drop a report, review what was extracted, chart what a
 * human confirmed.
 *
 * THIS REPLACES A FIVE-STEP ANIMATION THAT PARSED NOTHING. The previous flow
 * showed a progress bar and then displayed the fixture markers the chart
 * already had, which reads as extraction and performs none. What runs here is a
 * real pipeline against a typed extraction contract: every value on screen
 * comes back from `analyzeLabReport`, carries its own confidence and bounding
 * region, and is mapped onto the canonical panel by name — with everything that
 * fails to map shown rather than dropped.
 *
 * THE PRODUCT RULE: NOTHING IS CHARTED WITHOUT HUMAN CONFIRMATION.
 * Not "nothing low-confidence" — nothing. High confidence means the extractor
 * is sure about the pixels, not that it read the right row of the right panel
 * for the right patient. So every marker requires an explicit click, the
 * "Chart these results" button only ever commits the confirmed set, and the
 * ledger row records how many were withheld. This is a safety property, not a
 * nicety, and it is enforced here and again at the commit draft.
 *
 * WHAT THE FILE DOES. Nothing leaves the browser: the drop handler reads
 * `file.name` and nothing else — no FileReader, no upload, no ArrayBuffer. The
 * name seeds a deterministic fixture extraction. The UI says so at every stage,
 * because a demo that looks live is how a capability gets committed to a date
 * before it exists.
 */

type Phase = "idle" | "analyzing" | "review" | "error" | "committed";

interface Stage {
  label: string;
  /** The honest sub-line. What is actually happening, including "nothing". */
  detail: string;
  ms: number;
}

/**
 * Fixed durations — no `Math.random`, no wall clock. The stages are theatre in
 * the sense that the work is instantaneous, but the LABELS are not: each names
 * a step that exists in the production pipeline and states what this build does
 * in its place.
 */
const STAGES: Stage[] = [
  {
    label: "File received",
    detail: "Name read in the browser. No upload, no file contents — nothing left this device.",
    ms: 420,
  },
  {
    label: "Document analysis",
    detail: "Azure AI Document Intelligence adapter — returns fixture fields in the real response shape.",
    ms: 900,
  },
  {
    label: "Field extraction",
    detail: "Each value carries a page, a bounding region and a confidence score.",
    ms: 760,
  },
  {
    label: "Mapping to the Alpha Base Panel",
    detail: "Vendor labels matched to canonical keys. Unmapped fields are kept, never discarded.",
    ms: 700,
  },
  {
    label: "Awaiting human confirmation",
    detail: "The pipeline stops here by design. A person charts these results, not the extractor.",
    ms: 0,
  },
];

const SAMPLE_FILE = "quest-alpha-base-panel-2026-06-04.pdf";

const STATUS_TONE: Record<IngestedMarker["status"], "optimal" | "watch" | "low" | "high"> = {
  optimal: "optimal",
  watch: "watch",
  low: "low",
  high: "high",
};

export interface LabDropzoneProps {
  /** Whose chart these results would land on. Defaults to the demo member. */
  clientId?: string;
  className?: string;
}

export function LabDropzone({ clientId = "c-001", className }: LabDropzoneProps) {
  const { toast } = useToast();
  /**
   * Null until the server answers, and null forever for a sign-in with no staff
   * record. Both are handled the same way: the import is refused. A lab result
   * charted against nobody is a chart entry with no author, which is the exact
   * defect the ledger exists to make impossible.
   */
  const staff = useCurrentStaff();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [stage, setStage] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const [result, setResult] = React.useState<LabIngestResult | null>(null);
  const [confirmed, setConfirmed] = React.useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [committedId, setCommittedId] = React.useState<string | null>(null);

  const client = getClient(clientId);

  // Drag events fire on every child element, so a boolean flips off the moment
  // the cursor crosses an inner node. Depth counting is the only thing that
  // survives a dropzone with content in it.
  const dragDepth = React.useRef(0);

  const timers = React.useRef<number[]>([]);
  React.useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  const start = React.useCallback(
    (fileName: string) => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];

      // The ingest is synchronous and deterministic. It is computed up front,
      // and the stages below only pace the reveal — no stage is allowed to
      // imply work that did not happen.
      // The actor comes from the signed-in session, never from a module
      // constant. `useCurrentStaff()` resolves it server-side from the Entra
      // principal; a client component cannot invent an identity the server did
      // not give it. No identity means no ingest — a lab import nobody can be
      // held to is not an improvement on no lab import.
      if (!staff) return;
      const ingested = ingestLabReport(fileName, clientId, staff);

      setResult(ingested);
      setConfirmed(new Set());
      setSelectedKey(null);
      setCommittedId(null);
      setStage(0);
      setPhase("analyzing");

      // Stage i becomes ACTIVE once every stage before it has had its time —
      // accumulating before scheduling would make the last two fire together.
      let elapsed = 0;
      STAGES.forEach((s, i) => {
        const at = elapsed;
        elapsed += s.ms;
        const id = window.setTimeout(() => {
          setStage(i);
          if (i === STAGES.length - 1) {
            setPhase(ingested.ok ? "review" : "error");
            if (ingested.ok) {
              // The ingest itself is an auditable event — it happened whether or
              // not anything is ultimately charted.
              appendLedger(ingested.ledgerDraft);
            }
          }
        }, at);
        timers.current.push(id);
      });
    },
    [clientId],
  );

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    // Only the name is touched. Deliberately: see the header.
    start(file.name);
  };

  const reset = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setPhase("idle");
    setResult(null);
    setConfirmed(new Set());
    setSelectedKey(null);
    setCommittedId(null);
    setStage(0);
  };

  const toggleConfirm = (key: string) => {
    setConfirmed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const confirmAllAboveFloor = () => {
    if (!result) return;
    // Still a human action, still explicit, and it deliberately does NOT reach
    // rows below the floor — those must each be looked at against their source.
    setConfirmed((prev) => {
      const next = new Set(prev);
      result.markers.filter((m) => !m.needsReview).forEach((m) => next.add(m.key));
      return next;
    });
  };

  const commit = () => {
    if (!result || confirmed.size === 0) return;
    if (!staff) return;
    const row = appendLedger(chartCommitDraft(result, confirmed, staff));
    setCommittedId(row.id);
    setPhase("committed");
    const withheld = result.markers.length - confirmed.size;
    toast(`Charted ${confirmed.size} result${confirmed.size === 1 ? "" : "s"}`, {
      desc:
        `Ledger ${row.id}` +
        (withheld > 0 ? ` · ${withheld} withheld, not charted` : "") +
        (result.unmatched.length > 0 ? ` · ${result.unmatched.length} unmapped` : ""),
      tone: withheld > 0 ? "warn" : "success",
    });
  };

  const needsReviewCount = result?.markers.filter((m) => m.needsReview).length ?? 0;
  const busy = phase === "analyzing";

  return (
    <div className={cn("space-y-4", className)}>
      {/* ------------------------------------------------------------------ */}
      {/* Dropzone                                                            */}
      {/* ------------------------------------------------------------------ */}
      {(phase === "idle" || phase === "analyzing" || phase === "error") && (
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            dragDepth.current += 1;
            setDragging(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            e.preventDefault();
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            dragDepth.current = 0;
            setDragging(false);
            if (!busy) onFiles(e.dataTransfer.files);
          }}
          className={cn(
            "rounded-2xl border-2 border-dashed p-6 transition-colors sm:p-8",
            dragging ? "border-gold-400 bg-gold-500/5" : "border-ink-700 bg-ink-900/40",
          )}
        >
          <div className="flex flex-col items-center text-center">
            <div
              className={cn(
                "mb-3 flex h-12 w-12 items-center justify-center rounded-xl border",
                dragging ? "border-gold-400/40 bg-gold-500/10 text-gold-300" : "border-ink-700 bg-ink-850 text-ink-400",
              )}
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}
            </div>
            <p className="font-display text-body font-semibold text-ink-50">
              Drop a lab report{client ? ` for ${clientName(client)}` : ""}
            </p>
            <p className="mt-1 max-w-md text-detail text-ink-400">
              PDF, PNG, JPEG or TIFF. The file stays on this device — this build reads the file
              name only and returns a deterministic fixture extraction.
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button variant="primary" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
                <FileText className="h-3.5 w-3.5" />
                Choose a file
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => start(SAMPLE_FILE)}>
                Use a sample report
              </Button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/tiff,.pdf"
              className="hidden"
              onChange={(e) => {
                onFiles(e.target.files);
                // Reset so re-picking the same file fires change again.
                e.target.value = "";
              }}
            />
          </div>

          {/* Stages ------------------------------------------------------- */}
          {(phase === "analyzing" || phase === "error") && (
            <ol className="mx-auto mt-6 max-w-lg space-y-2.5">
              {STAGES.map((s, i) => {
                const done = i < stage || (phase === "error" && i < STAGES.length - 1);
                const active = i === stage && phase === "analyzing";
                return (
                  <li key={s.label} className="flex items-start gap-2.5">
                    <span className="mt-0.5 shrink-0">
                      {done ? (
                        <CheckCircle2 className="h-4 w-4 text-optimal" />
                      ) : active ? (
                        <Loader2 className="h-4 w-4 animate-spin text-gold-300" />
                      ) : (
                        <span className="block h-4 w-4 rounded-full border border-ink-700" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block text-body",
                          done || active ? "text-ink-100" : "text-ink-500",
                        )}
                      >
                        {s.label}
                      </span>
                      <span className="block text-micro leading-snug text-ink-500">{s.detail}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Failure — surfaced verbatim, never softened into "import failed"    */}
      {/* ------------------------------------------------------------------ */}
      {phase === "error" && result && (
        <Card className="border-high/30">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start">
            <AlertTriangle className="h-5 w-5 shrink-0 text-high" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-body font-semibold text-ink-50">Nothing was charted</p>
              <p className="mt-1 text-body text-ink-300">{result.error}</p>
              {result.unmatched.length > 0 && (
                <>
                  <p className="mt-3 label-eyebrow">Extracted but unmapped ({result.unmatched.length})</p>
                  <ul className="mt-1 space-y-0.5">
                    {result.unmatched.map((u) => (
                      <li key={u} className="stat-mono text-micro text-ink-400">
                        {u}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" />
              Try another file
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Review                                                              */}
      {/* ------------------------------------------------------------------ */}
      {(phase === "review" || phase === "committed") && result && result.ok && (
        <FadeIn className="space-y-4">
          {/* Summary bar */}
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-ink-400" />
                  <span className="truncate font-display text-body font-semibold text-ink-50">
                    {result.fileName}
                  </span>
                  <Badge tone="neutral">{result.panelName}</Badge>
                  <Badge tone="neutral">Collected {formatDate(result.collectedOn)}</Badge>
                </p>
                <p className="mt-1 text-detail text-ink-400">
                  <span className="stat-mono text-ink-200">{result.markers.length}</span> mapped ·{" "}
                  <span className="stat-mono text-ink-200">{result.unmatched.length}</span> unmapped ·{" "}
                  <span className={cn("stat-mono", needsReviewCount ? "text-high" : "text-ink-200")}>
                    {needsReviewCount}
                  </span>{" "}
                  below the {confidencePct(REVIEW_REQUIRED_BELOW)} review floor
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" onClick={reset}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Start over
                </Button>
                {phase === "review" && (
                  <Button variant="outline" size="sm" onClick={confirmAllAboveFloor}>
                    Confirm all above floor
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Review table */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] border-collapse text-body">
                <thead>
                  <tr className="border-b border-ink-800 text-left">
                    <Th>Marker</Th>
                    <Th className="text-right">Value</Th>
                    <Th>Unit</Th>
                    <Th className="text-right">Reference</Th>
                    <Th className="text-right">Confidence</Th>
                    <Th>Source</Th>
                    <Th className="text-right">Confirm</Th>
                  </tr>
                </thead>
                <tbody>
                  {result.markers.map((m) => {
                    const isConfirmed = confirmed.has(m.key);
                    const isSelected = selectedKey === m.key;
                    return (
                      <tr
                        key={m.key}
                        className={cn(
                          "border-b border-ink-800/70 last:border-0 transition-colors",
                          m.needsReview && !isConfirmed && "bg-high/[0.06]",
                          isSelected && "bg-gold-500/[0.08]",
                        )}
                      >
                        <Td>
                          <span className="flex items-center gap-2">
                            <span className="truncate text-ink-100">{m.name}</span>
                            <Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge>
                            {m.needsReview && (
                              <Badge tone="high">
                                <AlertTriangle className="h-3 w-3" />
                                Needs review
                              </Badge>
                            )}
                          </span>
                          {m.unitMismatch && (
                            <span className="mt-0.5 block text-micro text-watch">{m.unitMismatch}</span>
                          )}
                        </Td>
                        <Td className="stat-mono text-right text-ink-50">{m.value}</Td>
                        <Td className="text-ink-400">{m.unit}</Td>
                        <Td className="stat-mono text-right text-ink-400">
                          {m.refLow}–{m.refHigh}
                        </Td>
                        <Td className="text-right">
                          <span
                            className={cn(
                              "stat-mono",
                              m.needsReview ? "text-high" : "text-ink-200",
                            )}
                          >
                            {confidencePct(m.confidence)}
                          </span>
                        </Td>
                        <Td>
                          <button
                            type="button"
                            onClick={() => setSelectedKey(m.key)}
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-detail text-ink-400 transition-colors hover:bg-ink-800 hover:text-gold-300 focus-ring"
                            aria-label={`Show where ${m.name} came from`}
                          >
                            <Crosshair className="h-3 w-3" />
                            p.{m.page}
                          </button>
                        </Td>
                        <Td className="text-right">
                          {phase === "committed" ? (
                            isConfirmed ? (
                              <Badge tone="optimal">
                                <CheckCircle2 className="h-3 w-3" />
                                Charted
                              </Badge>
                            ) : (
                              <Badge tone="neutral">
                                <Ban className="h-3 w-3" />
                                Withheld
                              </Badge>
                            )
                          ) : (
                            <Button
                              size="sm"
                              variant={isConfirmed ? "success" : m.needsReview ? "danger" : "outline"}
                              onClick={() => toggleConfirm(m.key)}
                              aria-pressed={isConfirmed}
                            >
                              {isConfirmed ? (
                                <>
                                  <CheckCircle2 className="h-3 w-3" />
                                  Confirmed
                                </>
                              ) : m.needsReview ? (
                                "Check source"
                              ) : (
                                "Confirm"
                              )}
                            </Button>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Source view — the answer to "is that what the report says?" */}
          <SourceViewer result={result} selectedKey={selectedKey} onSelect={setSelectedKey} />

          {/* Unmatched — always rendered, including when empty, because the
              guarantee is the point: the reviewer should be able to see that
              the count is zero rather than infer it from an absent section. */}
          <Card>
            <CardContent className="p-4">
              <p className="label-eyebrow">Extracted but not mapped ({result.unmatched.length})</p>
              {result.unmatched.length === 0 ? (
                <p className="mt-1 text-detail text-ink-400">
                  Every extracted field mapped onto the {result.panelName}. Nothing was dropped.
                </p>
              ) : (
                <>
                  <p className="mt-1 text-detail text-ink-400">
                    These were read off the report but do not match a marker on this member&rsquo;s
                    panel. They are shown rather than discarded — a value that goes silently
                    missing reads as a test the member never had.
                  </p>
                  <ul className="mt-2 space-y-1">
                    {result.unmatched.map((u) => (
                      <li
                        key={u}
                        className="stat-mono rounded border border-ink-800 bg-ink-900/50 px-2 py-1 text-micro text-ink-300"
                      >
                        {u}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>

          {/* Commit bar */}
          <Card className={cn(phase === "committed" && "border-optimal/30")}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              {phase === "committed" ? (
                <p className="flex items-start gap-2 text-body text-ink-200">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-optimal" />
                  <span>
                    <span className="stat-mono text-ink-50">{confirmed.size}</span> of{" "}
                    <span className="stat-mono">{result.markers.length}</span> results charted.
                    Committed to the ledger as{" "}
                    <span className="stat-mono text-gold-300">{committedId}</span>.
                  </span>
                </p>
              ) : (
                <p className="flex items-start gap-2 text-body text-ink-300">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" />
                  <span>
                    <span className="stat-mono text-ink-50">{confirmed.size}</span> confirmed.
                    Nothing reaches the chart until a person confirms it — including values the
                    extractor was confident about.
                  </span>
                </p>
              )}
              {phase === "review" && (
                <Button
                  variant="primary"
                  onClick={commit}
                  disabled={confirmed.size === 0}
                  title={confirmed.size === 0 ? "Confirm at least one result first" : undefined}
                >
                  Chart these results
                </Button>
              )}
            </CardContent>
          </Card>
        </FadeIn>
      )}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn("label-eyebrow px-3 py-2 font-medium", className)}>{children}</th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2 align-middle", className)}>{children}</td>;
}
