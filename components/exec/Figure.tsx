"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, Info } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import {
  PROVENANCE,
  type Figure,
  type NotComputable,
  type Provenance,
} from "@/lib/exec/provenance";
import { cn } from "@/lib/utils";

/**
 * THE TILE THAT CANNOT LIE ABOUT ITSELF.
 *
 * The audit's meta-finding, restated as a layout problem: on
 * `app/analytics/page.tsx` a fabricated gross-revenue figure and a genuinely
 * summed MRR render in the same typeface at the same size in the same kind of
 * box, with one shared disclaimer set smaller than either of them, below both.
 * Nothing in the composition tells a reader which number survives scrutiny.
 *
 * Three rules follow, and they are enforced by this component rather than left
 * to each page:
 *
 *  1. THE PROVENANCE CHIP IS NOT OPTIONAL. `Figure.provenance` is a required
 *     field, so a tile cannot be constructed without one. There is no code path
 *     that renders a bare number.
 *
 *  2. THE CAVEAT IS ALWAYS VISIBLE, at `text-detail` — the same step as the
 *     hint, one step below body, and emphatically not `text-micro`. A caveat
 *     behind a tooltip is a caveat nobody reads, and a caveat set smaller than
 *     the figure it qualifies is the exact pattern being corrected. "MRR is
 *     contracted, not collected" changes what the number MEANS; hiding it
 *     behind a chevron would leave the tile making a claim it cannot support.
 *
 *  3. ONLY THE FILE REFERENCE IS BEHIND A DISCLOSURE. `source` names the module
 *     and the arithmetic — audit material, useful when checking, noise when
 *     scanning. The chip already states the class, so collapsing the citation
 *     costs a scanning reader nothing.
 *
 * REJECTED: colour alone for provenance. An illustrative figure tinted amber and
 * a measured one tinted green is a distinction that dies in greyscale, in
 * print — and this is a screen an owner prints — and for the ~8% of men with a
 * colour vision deficiency, which in a men's-health clinic's owner console is
 * not a hypothetical user.
 */

const CHIP_TONE: Record<Provenance, React.ComponentProps<typeof Badge>["tone"]> = {
  measured: "optimal",
  modelled: "low",
  illustrative: "watch",
};

export function ProvenanceChip({
  provenance,
  className,
}: {
  provenance: Provenance;
  className?: string;
}) {
  return (
    <Badge tone={CHIP_TONE[provenance]} className={className}>
      {PROVENANCE[provenance].label}
    </Badge>
  );
}

/**
 * The legend. Rendered once per page, near the top, never as a footer.
 *
 * It defines a vocabulary the reader is about to meet on every tile, so it has
 * to arrive before the tiles do — a key printed after the map is decoration.
 */
export function ProvenanceLegend({ className }: { className?: string }) {
  const order: Provenance[] = ["measured", "modelled", "illustrative"];
  return (
    <div className={cn("card px-3 py-2.5", className)}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:gap-4">
        <p className="label-eyebrow shrink-0 lg:pt-0.5">Reading this console</p>
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-3">
          {order.map((p) => (
            <div key={p} className="flex min-w-0 items-start gap-2">
              <ProvenanceChip provenance={p} className="mt-px shrink-0" />
              <p className="min-w-0 text-detail leading-snug text-ink-400">
                {PROVENANCE[p].meaning}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const TONE_TEXT = {
  neutral: "text-ink-50",
  optimal: "text-optimal",
  watch: "text-watch",
  high: "text-high",
} as const;

/**
 * One figure.
 *
 * `size="lead"` is for the four tiles that answer the morning question and gets
 * `text-display`; everything else gets `text-title`. Two sizes, not a spectrum —
 * the type scale has six named steps precisely so that hierarchy is chosen from
 * a short list rather than tuned by eye.
 */
export function FigureTile({
  figure,
  size = "standard",
}: {
  figure: Figure;
  size?: "lead" | "standard";
}) {
  const [open, setOpen] = React.useState(false);
  const tone = TONE_TEXT[figure.tone ?? "neutral"];

  const value = (
    <p
      className={cn(
        "stat-mono font-semibold leading-none",
        size === "lead" ? "text-display" : "text-title",
        tone,
      )}
    >
      {figure.display}
    </p>
  );

  return (
    // min-w-0 so a long formatted figure cannot force the grid track wider than
    // the viewport on a phone. The exec console is read on a laptop AND a phone.
    <div className="card flex min-w-0 flex-col p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="label-eyebrow min-w-0 truncate">{figure.label}</p>
        <ProvenanceChip provenance={figure.provenance} className="shrink-0" />
      </div>

      <div className="mt-2">
        {figure.href ? (
          <Link
            href={figure.href}
            className="focus-ring inline-flex items-baseline gap-1.5 rounded transition-opacity hover:opacity-80"
          >
            {value}
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 self-start text-ink-600" />
          </Link>
        ) : (
          value
        )}
      </div>

      {figure.hint && (
        <p className="mt-2 text-detail leading-snug text-ink-300">{figure.hint}</p>
      )}

      {/* The caveat. Always rendered, never smaller than the hint, marked with a
          rule so it reads as a qualifier on the number rather than more of the
          description. This is the element the audit found missing. */}
      {figure.caveat && (
        <p className="mt-2 border-l-2 border-ink-700 pl-2.5 text-detail leading-snug text-ink-400">
          {figure.caveat}
        </p>
      )}

      {/* Only the citation collapses. */}
      <div className="mt-auto pt-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="focus-ring inline-flex items-center gap-1 rounded text-micro text-ink-500 transition-colors hover:text-ink-300"
        >
          <ChevronDown
            className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
          />
          How this is computed
        </button>
        {open && (
          <p className="mt-1.5 text-detail leading-snug text-ink-400">{figure.source}</p>
        )}
      </div>
    </div>
  );
}

/**
 * A question the console will not answer, rendered at a figure's weight.
 *
 * Deliberately the same card, the same padding and the same footprint as a
 * FigureTile. An owner scanning the grid should feel the absence as a
 * deliberate, authored decision — not read past a gap and assume the question
 * was never asked. The question sits where the number would sit, in
 * `text-heading`, because the question is the content.
 *
 * `replaces` is the part that makes this honest rather than merely humble: it
 * names, with file and line, the surface elsewhere in Apex that answers this
 * same question with an invented figure. Without it a reader could reasonably
 * assume the number simply does not exist anywhere in the product, and go
 * looking for it — and find one.
 */
export function NotComputableCard({ item }: { item: NotComputable }) {
  return (
    <div className="card flex min-w-0 flex-col border-dashed border-ink-600/70 bg-ink-900/40 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="label-eyebrow">Not computable</p>
        <Info className="h-3.5 w-3.5 shrink-0 text-ink-600" />
      </div>

      <p className="mt-2 font-display text-heading font-semibold leading-snug text-ink-100">
        {item.question}
      </p>

      <p className="mt-2 text-detail leading-snug text-ink-400">{item.why}</p>

      <div className="mt-2.5 border-l-2 border-gold-500/40 pl-2.5">
        <p className="text-micro uppercase tracking-wide text-ink-500">What it would take</p>
        <p className="mt-0.5 text-detail leading-snug text-ink-300">{item.needs}</p>
      </div>

      {item.replaces && (
        <p className="mt-2.5 text-detail leading-snug text-watch/90">
          <span className="font-medium">Answered elsewhere with an invented number: </span>
          {item.replaces}
        </p>
      )}
    </div>
  );
}
