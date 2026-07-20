"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { ProvenanceChip } from "@/components/exec/Figure";
import { attentionItems, BAND_META, type AttentionKind } from "@/lib/exec/attention";
import { cn } from "@/lib/utils";

/**
 * WHAT NEEDS THE OWNER — the list, rendered.
 *
 * Built once with `useMemo` and never re-sorted, for the same reason
 * `components/coach/TodayQueue.tsx:312` freezes its queue: order is a property
 * of the morning, not of the current state of the data. Nothing here mutates,
 * so there is no re-sort to guard against yet — but the moment a "dismiss"
 * lands, a list that re-ranks underneath the cursor is how someone opens the
 * wrong item.
 *
 * ---------------------------------------------------------------------------
 * NO DISMISS BUTTON, AND THAT IS THE HONEST CHOICE
 * ---------------------------------------------------------------------------
 * The obvious control on a row like this is "Acknowledge" or "Dismiss". It is
 * not here, because nothing in Apex would persist the acknowledgement — the
 * audit found three P0 buttons that toasted a write and wrote nothing, and this
 * is precisely the shape of the fourth. Every row instead carries a link to the
 * surface where the work is genuinely done: the order board, the consult list,
 * the winback list. The owner's action is to go there, not to tick a box here.
 *
 * `TodayQueue` can offer a clear button because it writes a real hash-chained
 * ledger row. This list has no equivalent, so it makes no equivalent claim.
 */

const KIND_ORDER: AttentionKind[] = [
  "member-waiting",
  "clinical-ageing",
  "money-uncollected",
  "ops-defect",
];

export function AttentionList() {
  const items = React.useMemo(() => attentionItems(), []);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircle2 className="h-6 w-6" />}
        title="Nothing is waiting on you"
        hint="No stranded orders, no ageing charts, no uncollected recurring revenue and no rostering defects."
      />
    );
  }

  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    rows: items.filter((i) => i.kind === kind),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-4">
      {grouped.map((group) => {
        const meta = BAND_META[group.kind];
        return (
          <div key={group.kind}>
            {/* The band header carries the ranking rule. An owner who disagrees
                with the order should be able to see the argument, not infer it. */}
            <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p
                className={cn(
                  "text-detail font-semibold",
                  meta.tone === "high"
                    ? "text-high"
                    : meta.tone === "watch"
                      ? "text-watch"
                      : "text-ink-300",
                )}
              >
                {meta.label}
              </p>
              <span className="stat-mono text-micro text-ink-600">band {meta.floor}+</span>
            </div>

            <div className="space-y-1.5">
              {group.rows.map((item) => (
                <div key={item.id} className="card px-3 py-2.5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-body font-semibold text-ink-50">{item.headline}</p>
                        <ProvenanceChip provenance={item.provenance} />
                      </div>
                      <p className="mt-1 text-detail leading-snug text-ink-300">{item.detail}</p>
                      {/* The citation runs inline here rather than behind a
                          disclosure. These rows carry fewer, larger claims than
                          the tile grid, so there is room to simply show it. */}
                      <p className="mt-1.5 text-micro leading-snug text-ink-500">{item.source}</p>
                    </div>

                    <div className="flex shrink-0 flex-row items-center gap-2 sm:flex-col sm:items-end">
                      <Badge tone="neutral">
                        <span className="stat-mono">{item.magnitude}</span>
                      </Badge>
                      {item.href && (
                        <Link
                          href={item.href}
                          className="focus-ring inline-flex items-center gap-1 rounded text-detail text-gold-300 transition-colors hover:text-gold-200"
                        >
                          {item.linkLabel ?? "Open"}
                          <ArrowUpRight className="h-3 w-3 shrink-0" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
