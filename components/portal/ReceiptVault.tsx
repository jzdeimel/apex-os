"use client";

import * as React from "react";
import { Receipt as ReceiptIcon, Download, PiggyBank, FileText } from "lucide-react";
import type { Client } from "@/lib/types";
import {
  HSA_DISCLAIMER,
  HSA_FLAG_LABEL,
  buildExport,
  dollars,
  receiptsFor,
  toCsv,
  yearSummary,
  yearsFor,
  type HsaFlag,
  type Receipt,
  type ReceiptCategory,
} from "@/lib/receipts/vault";
import { Card, CardContent, Badge, Button, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { cn, formatDate } from "@/lib/utils";

/**
 * HSA / FSA RECEIPT VAULT.
 *
 * The screen a member opens in March. Every charge for a year, already
 * itemised, already exportable, with our honest read on what their plan will
 * probably accept — stated as a read, never as a ruling.
 *
 * Two things this page will not do:
 *   - It will not tell a member an item IS eligible. `HSA_DISCLAIMER` renders
 *     above the totals, and the flag on every row is a probability word.
 *   - It will not put the "likely eligible" figure in the hero slot alone. The
 *     total comes first, because that is the number that is actually true.
 */

const FLAG_TONE: Record<HsaFlag, "optimal" | "neutral" | "watch"> = {
  likely: "optimal",
  unlikely: "neutral",
  unknown: "watch",
};

const CATEGORY_ORDER: ReceiptCategory[] = [
  "Medication",
  "Lab work",
  "Clinical service",
  "Supplies",
  "Membership",
];

function Stat({
  label,
  value,
  basis,
  lead,
}: {
  label: string;
  value: string;
  basis: string;
  lead?: boolean;
}) {
  return (
    <div
      className={cn(
        "hairline rounded-panel border p-4",
        lead ? "border-gold-400/25 bg-gold-400/[0.06]" : "bg-ink-900/50",
      )}
    >
      <p className="text-micro uppercase tracking-wide text-ink-500">{label}</p>
      <p className="stat-mono mt-1.5 text-title font-semibold text-ink-50">{value}</p>
      <p className="mt-1.5 text-micro leading-relaxed text-ink-500">{basis}</p>
    </div>
  );
}

function ReceiptRow({ r }: { r: Receipt }) {
  const [open, setOpen] = React.useState(false);
  return (
    <li className="hairline rounded-panel border bg-ink-900/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="text-body font-medium leading-snug text-ink-50">{r.description}</p>
          <p className="stat-mono mt-1 text-micro text-ink-500">{formatDate(r.date)}</p>
        </div>
        <p className="stat-mono shrink-0 text-body font-semibold text-ink-50">
          {dollars(r.amountCents)}
        </p>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Badge tone={FLAG_TONE[r.eligibility]}>{HSA_FLAG_LABEL[r.eligibility]}</Badge>
        <Badge tone="neutral">{r.category}</Badge>
        {r.itemised && (
          <span className="inline-flex items-center gap-1 text-micro text-ink-500">
            <FileText className="h-3 w-3" />
            Itemised copy on file
          </span>
        )}
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="focus-ring mt-2.5 rounded-control text-micro font-medium text-gold-300 hover:text-gold-200"
      >
        {open ? "Hide detail" : "Why it is flagged that way"}
      </button>

      {open && (
        <div className="mt-2.5 border-t border-ink-700/70 pt-2.5">
          <p className="max-w-prose text-detail leading-relaxed text-ink-400">{r.eligibilityBasis}</p>
          <p className="mt-2 text-micro text-ink-600">
            {r.vendor} · reference <span className="stat-mono">{r.sourceRef}</span>
          </p>
        </div>
      )}
    </li>
  );
}

export function ReceiptVault({ client }: { client: Client }) {
  const years = yearsFor(client.id);
  const [year, setYear] = React.useState<number>(years[0] ?? 2026);
  const [category, setCategory] = React.useState<ReceiptCategory | "All">("All");
  const { toast } = useToast();

  const rows = receiptsFor(client.id, year);
  const summary = yearSummary(client.id, year);
  const shown = category === "All" ? rows : rows.filter((r) => r.category === category);

  if (years.length === 0) {
    return (
      <EmptyState
        title="No receipts on file yet"
        hint="Charges land here automatically — nothing for you to upload."
      />
    );
  }

  const onExport = () => {
    const x = buildExport(client.id, year);
    if (!x) return;
    // The CSV is built here so the disclaimer travels inside the file. In this
    // demo build we surface it rather than triggering a download.
    const csv = toCsv(x);
    toast(`${year} receipts ready`, {
      desc: `${x.rows.length} rows, ${dollars(x.totalCents)} total. The eligibility note is included in the file.`,
    });
    // eslint-disable-next-line no-console -- demo build: proves the export shape.
    console.info(csv);
  };

  return (
    <div className="space-y-5">
      {/* Year picker ------------------------------------------------------ */}
      <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
        {years.map((y) => (
          <button
            key={y}
            onClick={() => setYear(y)}
            className={cn(
              "focus-ring shrink-0 rounded-control border px-4 py-1.5 text-detail font-medium transition-colors motion-reduce:transition-none",
              year === y
                ? "border-gold-400/40 bg-gold-400/15 text-gold-200"
                : "border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-100",
            )}
          >
            <span className="stat-mono">{y}</span>
          </button>
        ))}
      </div>

      {/* Totals ----------------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Stat
          lead
          label={`Paid in ${year}`}
          value={dollars(summary.totalCents)}
          basis={summary.basis}
        />
        <Stat
          label="Likely eligible"
          value={dollars(summary.likelyEligibleCents)}
          basis="The part of that total plans usually accept. Yours makes the call."
        />
        <Stat
          label="Worth asking about"
          value={dollars(summary.unknownCents)}
          basis="Genuinely uncertain. Submit these with the itemised copy attached rather than skipping them."
        />
      </div>

      {/* Disclaimer — rendered, not buried -------------------------------- */}
      <Card className="border-ink-600/60">
        <CardContent className="flex items-start gap-3 p-4 sm:p-5">
          <PiggyBank className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" />
          <div className="min-w-0">
            <p className="text-detail font-medium text-ink-50">Before you submit anything</p>
            <p className="mt-1.5 max-w-prose text-detail leading-relaxed text-ink-400">
              {HSA_DISCLAIMER}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Category breakdown ---------------------------------------------- */}
      {summary.byCategory.length > 0 && (
        <Card>
          <CardContent className="p-4 pt-4 sm:p-6 sm:pt-6">
            <h2 className="font-display text-heading font-semibold text-ink-50 sm:text-title">
              Where it went
            </h2>
            <ul className="mt-3 space-y-2">
              {summary.byCategory.map((c) => {
                const share = summary.totalCents > 0 ? (c.cents / summary.totalCents) * 100 : 0;
                return (
                  <li key={c.category}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                      <span className="text-detail text-ink-100">{c.category}</span>
                      <span className="stat-mono shrink-0 text-detail text-ink-300">
                        {dollars(c.cents)}{" "}
                        <span className="text-ink-500">
                          · {c.count} {c.count === 1 ? "charge" : "charges"}
                        </span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-700/70">
                      <div className="h-full rounded-full bg-gold-500/70" style={{ width: `${share}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Export ----------------------------------------------------------- */}
      <div className="hairline flex flex-wrap items-center justify-between gap-3 rounded-panel border bg-ink-900/50 p-4">
        <div className="min-w-0">
          <p className="text-detail font-medium text-ink-50">Send it to your administrator</p>
          <p className="mt-1 max-w-prose text-micro leading-relaxed text-ink-500">
            One file, every {year} charge, itemised, with the eligibility note included so whoever opens it
            knows what our flags do and do not mean.
          </p>
        </div>
        <Button variant="primary" onClick={onExport} className="shrink-0">
          <Download className="h-4 w-4" />
          Export {year}
        </Button>
      </div>

      {/* Filter + rows ---------------------------------------------------- */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {(["All", ...CATEGORY_ORDER] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c as ReceiptCategory | "All")}
            className={cn(
              "focus-ring shrink-0 rounded-control border px-3.5 py-1.5 text-detail font-medium transition-colors motion-reduce:transition-none",
              category === c
                ? "border-gold-400/40 bg-gold-400/15 text-gold-200"
                : "border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-100",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-4 pt-4 sm:p-6 sm:pt-6">
          <div className="flex items-center gap-2">
            <ReceiptIcon className="h-5 w-5 text-gold-300" />
            <h2 className="font-display text-heading font-semibold text-ink-50 sm:text-title">
              Every charge in {year}
            </h2>
          </div>

          {shown.length === 0 ? (
            <p className="mt-3 text-detail text-ink-400">Nothing in that category for {year}.</p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {shown.map((r) => (
                <ReceiptRow key={r.id} r={r} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
