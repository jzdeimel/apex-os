"use client";

import { useState } from "react";
import type { Biomarker } from "@/lib/types";
import { BiomarkerStatusBadge } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";
import { LineChart as LineIcon } from "lucide-react";

const CATEGORY_ORDER: Biomarker["category"][] = [
  "Hormones",
  "Thyroid",
  "Metabolic",
  "Lipids",
  "Inflammation",
  "Nutrients",
  "Organ",
  "Blood",
  "Prostate",
];

function RangeBar({ b }: { b: Biomarker }) {
  // Position the value within the reference range (clamped) for a quick visual.
  const lo = b.refLow;
  const hi = b.refHigh;
  const pct = Math.max(4, Math.min(96, ((b.value - lo) / (hi - lo || 1)) * 100));
  const optLoPct = b.optimalLow !== undefined ? Math.max(0, Math.min(100, ((b.optimalLow - lo) / (hi - lo || 1)) * 100)) : 25;
  const optHiPct = b.optimalHigh !== undefined ? Math.max(0, Math.min(100, ((b.optimalHigh - lo) / (hi - lo || 1)) * 100)) : 75;
  const dotColor =
    b.status === "optimal" ? "var(--c-optimal)" : b.status === "watch" ? "var(--c-watch)" : b.status === "low" ? "var(--c-low)" : "var(--c-high)";
  return (
    <div className="relative h-1.5 w-24 rounded-full bg-ink-700/80">
      <div
        className="absolute inset-y-0 rounded-full bg-optimal/25"
        style={{ left: `${optLoPct}%`, width: `${Math.max(6, optHiPct - optLoPct)}%` }}
      />
      <div
        className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-ink-900"
        style={{ left: `${pct}%`, background: dotColor }}
      />
    </div>
  );
}

export function LabTable({
  biomarkers,
  selectedKey,
  onSelect,
}: {
  biomarkers: Biomarker[];
  selectedKey?: string;
  onSelect?: (key: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "flagged">("all");
  const shown = filter === "flagged" ? biomarkers.filter((b) => b.status !== "optimal") : biomarkers;
  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: shown.filter((b) => b.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => setFilter("all")}
          className={cn(
            "rounded-lg px-3 py-1 text-detail font-medium transition-colors",
            filter === "all" ? "bg-ink-700 text-ink-50" : "text-ink-400 hover:text-ink-100",
          )}
        >
          All markers ({biomarkers.length})
        </button>
        <button
          onClick={() => setFilter("flagged")}
          className={cn(
            "rounded-lg px-3 py-1 text-detail font-medium transition-colors",
            filter === "flagged" ? "bg-ink-700 text-ink-50" : "text-ink-400 hover:text-ink-100",
          )}
        >
          Flagged only ({biomarkers.filter((b) => b.status !== "optimal").length})
        </button>
      </div>

      <div className="card overflow-hidden">
        {grouped.map((g) => (
          <div key={g.cat}>
            <div className="border-b border-ink-800 bg-ink-900/40 px-4 py-1.5">
              <span className="label-eyebrow">{g.cat}</span>
            </div>
            <div className="divide-y divide-ink-800/60">
              {g.items.map((b) => {
                const selectable = !!onSelect && !!b.history;
                return (
                  <div
                    key={b.key}
                    onClick={() => selectable && onSelect?.(b.key)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 text-body",
                      selectable && "cursor-pointer hover:bg-ink-850/60",
                      selectedKey === b.key && "bg-gold-400/[0.06]",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-ink-100">{b.name}</span>
                        {b.history && <LineIcon className="h-3 w-3 shrink-0 text-ink-600" />}
                      </div>
                      <span className="text-micro text-ink-500">
                        Ref {b.refLow}–{b.refHigh} {b.unit}
                      </span>
                    </div>
                    <div className="hidden sm:block"><RangeBar b={b} /></div>
                    <div className="w-20 text-right">
                      <span className="stat-mono font-semibold text-ink-50">{b.value}</span>
                      <span className="ml-1 text-micro text-ink-500">{b.unit}</span>
                    </div>
                    <div className="w-24 text-right">
                      <BiomarkerStatusBadge status={b.status} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
