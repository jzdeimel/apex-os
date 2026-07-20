"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { FileText, Crosshair, AlertTriangle, Info } from "lucide-react";
import { Badge, Button } from "@/components/ui/primitives";
import {
  PAGE_WIDTH_IN,
  PAGE_HEIGHT_IN,
  REVIEW_REQUIRED_BELOW,
  confidencePct,
  type IngestedMarker,
  type LabIngestResult,
} from "@/lib/labs/ingest";
import { cn } from "@/lib/utils";

/**
 * SOURCE VIEW — "where on the page did this number come from?"
 *
 * An extracted lab value with no provenance is not safe to chart, and this
 * component is precisely what makes it safe. The reviewer clicks a value in the
 * review table and lands here: the page it was found on, the box it was found
 * in, the raw OCR text, the confidence, and the rows immediately above and
 * below it for context. Without that, a reviewer has two options — open the
 * source PDF and re-key everything by hand (in which case extraction saved
 * nothing) or trust the machine (in which case a misread decimal becomes a dose
 * change). Provenance is not a garnish on this feature; it is the feature.
 *
 * WHAT IS AND IS NOT REAL HERE
 *   The BOX COORDINATES ARE REAL — they are the extractor's own
 *   `boundingRegions`, in inches, carried through `lib/labs/ingest.ts`
 *   untouched. The PAGE IMAGE IS NOT: this build never receives a file, so
 *   there are no pixels to show. What renders instead is a diagrammatic
 *   reconstruction — a US-Letter-proportioned surface with each extracted row
 *   drawn at the position the extractor reported. Every surface in this
 *   component says so, because a fake page render that looked photographic
 *   would be the single most misleading thing in the product.
 */

export interface SourceViewerProps {
  result: LabIngestResult;
  /** Canonical key of the selected marker, or null for "nothing selected". */
  selectedKey: string | null;
  onSelect: (key: string) => void;
  className?: string;
}

/** Inches → percentage of the page surface, so the diagram scales fluidly. */
function pct(value: number, extent: number): string {
  return `${(value / extent) * 100}%`;
}

export function SourceViewer({ result, selectedKey, onSelect, className }: SourceViewerProps) {
  const selected = result.markers.find((m) => m.key === selectedKey) ?? null;

  // Follow the selection across pages rather than making the reviewer find the
  // page tab themselves — the click already expressed where they want to be.
  const [page, setPage] = React.useState<number>(selected?.page ?? 1);
  React.useEffect(() => {
    if (selected) setPage(selected.page);
  }, [selected]);

  const pages = React.useMemo(
    () => Array.from(new Set(result.markers.map((m) => m.page))).sort((a, b) => a - b),
    [result.markers],
  );

  const onPage = React.useMemo(
    () =>
      result.markers
        .filter((m) => m.page === page)
        .slice()
        .sort((a, b) => a.boundingBox.y - b.boundingBox.y),
    [result.markers, page],
  );

  // Neighbours in reading order — "the surrounding text", which is how a human
  // confirms they are looking at the right line of a dense results column.
  const neighbours = React.useMemo(() => {
    if (!selected) return [] as IngestedMarker[];
    const i = onPage.findIndex((m) => m.key === selected.key);
    if (i < 0) return [];
    return onPage.slice(Math.max(0, i - 2), i + 3);
  }, [onPage, selected]);

  return (
    <div className={cn("card overflow-hidden", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-800 p-4">
        <div className="min-w-0">
          <p className="label-eyebrow">Source view</p>
          <h3 className="font-display text-body font-semibold text-ink-50">
            Where this value came from
          </h3>
        </div>
        {pages.length > 1 && (
          <div className="flex items-center gap-1">
            {pages.map((p) => (
              <Button
                key={p}
                size="sm"
                variant={p === page ? "primary" : "outline"}
                onClick={() => setPage(p)}
                aria-pressed={p === page}
              >
                p.{p}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]">
        {/* ---------------------------------------------------------------- */}
        {/* The page surface                                                  */}
        {/* ---------------------------------------------------------------- */}
        <div>
          <div
            className="relative w-full overflow-hidden rounded-lg border border-ink-700 bg-ink-900"
            style={{ aspectRatio: `${PAGE_WIDTH_IN} / ${PAGE_HEIGHT_IN}` }}
            role="img"
            aria-label={`Diagrammatic source view of page ${page} of the analysed document, with extracted value positions marked.`}
          >
            {/* Faint page furniture so the surface reads as a document rather
                than a chart, without imitating any real lab's letterhead. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[9%] border-b border-dashed border-ink-800 px-[6%] pt-[3%]">
              <div className="h-1.5 w-[38%] rounded-full bg-ink-800" />
              <div className="mt-1.5 h-1 w-[24%] rounded-full bg-ink-800/70" />
            </div>

            {onPage.map((m) => {
              const isSelected = m.key === selected?.key;
              const box = m.boundingBox;
              return (
                <React.Fragment key={m.key}>
                  {/* Label column — reconstructed at the page margin so the row
                      reads like a results line. Only the VALUE box carries real
                      extractor coordinates; the label is positioned by its y. */}
                  <button
                    type="button"
                    onClick={() => onSelect(m.key)}
                    className={cn(
                      "absolute truncate rounded px-1 text-left text-micro leading-none transition-colors sm:text-micro focus-ring",
                      isSelected ? "text-gold-300" : "text-ink-400 hover:text-ink-200",
                    )}
                    style={{
                      left: pct(0.75, PAGE_WIDTH_IN),
                      top: pct(box.y, PAGE_HEIGHT_IN),
                      width: pct(2.7, PAGE_WIDTH_IN),
                      height: pct(box.h, PAGE_HEIGHT_IN),
                    }}
                    title={m.extractedName}
                  >
                    {m.extractedName}
                  </button>

                  {/* The value box — the extractor's own bounding region. */}
                  <button
                    type="button"
                    onClick={() => onSelect(m.key)}
                    aria-label={`${m.name}: ${m.sourceText}, page ${m.page}, ${confidencePct(m.confidence)} confidence`}
                    className={cn(
                      "absolute flex items-center justify-center rounded-[2px] border text-micro leading-none transition-colors sm:text-micro focus-ring",
                      isSelected
                        ? "z-10 border-gold-400 bg-gold-500/25 text-ink-50"
                        : m.needsReview
                          ? "border-high/40 bg-high/10 text-ink-300 hover:border-high/70"
                          : "border-ink-700 bg-ink-800/60 text-ink-300 hover:border-ink-500",
                    )}
                    style={{
                      left: pct(box.x, PAGE_WIDTH_IN),
                      top: pct(box.y, PAGE_HEIGHT_IN),
                      width: pct(box.w, PAGE_WIDTH_IN),
                      height: pct(box.h, PAGE_HEIGHT_IN),
                    }}
                  >
                    <span className="stat-mono truncate px-0.5">{m.value}</span>
                  </button>

                  {/* Selection ring — drawn outside the box so it does not
                      distort the reported geometry the reviewer is checking. */}
                  {isSelected && (
                    <motion.div
                      layoutId="source-highlight"
                      transition={{ type: "spring", stiffness: 320, damping: 28 }}
                      className="pointer-events-none absolute rounded-[3px] ring-2 ring-gold-400 ring-offset-1 ring-offset-ink-900"
                      style={{
                        left: pct(box.x - 0.06, PAGE_WIDTH_IN),
                        top: pct(box.y - 0.06, PAGE_HEIGHT_IN),
                        width: pct(box.w + 0.12, PAGE_WIDTH_IN),
                        height: pct(box.h + 0.12, PAGE_HEIGHT_IN),
                      }}
                    />
                  )}
                </React.Fragment>
              );
            })}

            <p className="pointer-events-none absolute inset-x-0 bottom-0 px-[6%] pb-[2%] text-center text-micro leading-tight text-ink-600 sm:text-micro">
              Page {page} of {result.pageCount} · diagrammatic source view — positions are the
              extractor&rsquo;s reported bounding regions, not a page image
            </p>
          </div>

          <p className="mt-2 flex items-start gap-1.5 text-micro leading-snug text-ink-500">
            <Info className="mt-px h-3 w-3 shrink-0" />
            No document was read in this build. Boxes are drawn from the coordinates the
            extraction contract returns, so the geometry is exactly what a real analysis would
            hand back — the page image behind them is not rendered.
          </p>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Detail rail                                                       */}
        {/* ---------------------------------------------------------------- */}
        <div className="min-w-0">
          {!selected ? (
            <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-ink-700 p-6 text-center">
              <Crosshair className="mb-2 h-5 w-5 text-ink-600" />
              <p className="text-body font-medium text-ink-300">Select a value</p>
              <p className="mt-1 text-detail text-ink-500">
                Click any extracted number, here or in the review table, to see its source.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="label-eyebrow">Extracted value</p>
                <p className="font-display text-title font-semibold text-ink-50">
                  <span className="stat-mono">{selected.value}</span>{" "}
                  <span className="text-body text-ink-400">{selected.unit}</span>
                </p>
                <p className="mt-0.5 text-detail text-ink-400">{selected.name}</p>
              </div>

              <dl className="space-y-2 rounded-lg border border-ink-800 bg-ink-900/50 p-3 text-detail">
                <Row label="Raw OCR text" value={`"${selected.sourceText}"`} mono />
                <Row label="Report label" value={selected.extractedName} />
                <Row
                  label="Location"
                  value={`p.${selected.page} · ${selected.boundingBox.x.toFixed(2)}in, ${selected.boundingBox.y.toFixed(2)}in`}
                  mono
                />
                <Row
                  label="Box size"
                  value={`${selected.boundingBox.w.toFixed(2)} × ${selected.boundingBox.h.toFixed(2)} in`}
                  mono
                />
                <Row
                  label="Reference"
                  value={`${selected.refLow}–${selected.refHigh} ${selected.unit}`}
                  mono
                />
              </dl>

              <div>
                <div className="flex items-center justify-between text-detail">
                  <span className="text-ink-400">Extractor confidence</span>
                  <span className="stat-mono text-ink-100">{confidencePct(selected.confidence)}</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-700/70">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      selected.needsReview ? "bg-high" : "bg-optimal",
                    )}
                    style={{ width: `${Math.max(2, Math.min(100, selected.confidence * 100))}%` }}
                  />
                </div>
                <p className="mt-1 text-micro text-ink-500">
                  Review floor {confidencePct(REVIEW_REQUIRED_BELOW)}. A high score is not a
                  guarantee — a confidently wrong read looks identical here, which is why the
                  box above matters more than the bar.
                </p>
              </div>

              {selected.needsReview && (
                <p className="flex items-start gap-1.5 rounded-lg border border-high/30 bg-high/10 p-2 text-micro leading-snug text-high">
                  <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                  Below the review floor. Blocked from charting until a human confirms it against
                  this source.
                </p>
              )}

              {selected.unitMismatch && (
                <p className="flex items-start gap-1.5 rounded-lg border border-watch/30 bg-watch/10 p-2 text-micro leading-snug text-watch">
                  <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                  {selected.unitMismatch}
                </p>
              )}

              <div>
                <p className="label-eyebrow mb-1.5">Surrounding rows</p>
                <ul className="space-y-1">
                  {neighbours.map((n) => (
                    <li key={n.key}>
                      <button
                        type="button"
                        onClick={() => onSelect(n.key)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-micro transition-colors focus-ring",
                          n.key === selected.key
                            ? "bg-gold-500/15 text-ink-50"
                            : "text-ink-400 hover:bg-ink-800 hover:text-ink-200",
                        )}
                      >
                        <span className="truncate">{n.extractedName}</span>
                        <span className="stat-mono shrink-0">{n.sourceText}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 border-t border-ink-800 pt-3">
                <Badge tone="neutral">
                  <FileText className="h-3 w-3" />
                  {result.fileName}
                </Badge>
                <Badge tone={selected.needsReview ? "high" : "optimal"}>
                  {selected.needsReview ? "Needs review" : "Above floor"}
                </Badge>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-ink-500">{label}</dt>
      <dd className={cn("min-w-0 truncate text-right text-ink-200", mono && "stat-mono")} title={value}>
        {value}
      </dd>
    </div>
  );
}
