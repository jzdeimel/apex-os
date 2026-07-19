"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertOctagon,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCopy,
  Clock,
  PackageX,
  Printer,
  TriangleAlert,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/primitives";
import { FadeIn } from "@/components/motion";
import { useToast } from "@/components/ui/Toast";
import { statusTone } from "@/lib/orders/lifecycle";
import {
  buildDailyOrderReport,
  summaryText,
  type OrderFlag,
  type ReportOrder,
} from "@/lib/reports/dailyOrders";
import { cn, currency, formatDateTime } from "@/lib/utils";

/**
 * THE DAILY ORDER REPORT.
 *
 * Failures first, always. This report is the only systematic catch for an
 * order that never reached the fulfillment partner, so the layout is built
 * around one rule: a reader who stops after ten seconds must have seen every
 * broken order. Revenue totals come after, never before.
 *
 * The print view is a real deliverable, not an afterthought — ops prints this
 * and pins it, so `print:` variants strip the chrome, force light ink, and let
 * every group break cleanly.
 */
export default function DailyOrderReportPage() {
  const { toast } = useToast();
  const report = useMemo(() => buildDailyOrderReport(), []);
  const [copied, setCopied] = useState(false);

  async function copySummary() {
    const text = summaryText(report);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast("Report copied", {
        desc: "Plain text — safe to paste into a handoff thread.",
        tone: "success",
      });
    } catch {
      toast("Could not access the clipboard", {
        desc: "Use Print instead, or copy from the page.",
        tone: "warn",
      });
    }
  }

  const clean = report.flagged.length === 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 print:max-w-none print:px-0 print:py-0">
      {/* Header ------------------------------------------------------------ */}
      <FadeIn>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="label-eyebrow print:text-black">OPERATIONS</p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink-50 print:text-black">
              Daily order report
            </h1>
            <p className="mt-1 text-sm text-ink-400 print:text-black">
              Every order the clinic touched in the last {report.windowHours} hours, grouped by
              coach, with anything that did not land pulled to the top.
            </p>
            <p className="stat-mono mt-1 text-xs text-ink-500 print:text-black">
              {formatDateTime(report.windowStart)} → {formatDateTime(report.generatedAt)}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={copySummary}>
              <ClipboardCopy className="h-3.5 w-3.5" />
              {copied ? "Copied" : "Copy summary"}
            </Button>
            <Button variant="primary" size="sm" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
          </div>
        </div>
      </FadeIn>

      {/* Failures — first, loud, unmissable -------------------------------- */}
      <section className="mt-6">
        {clean ? (
          <Card className="border-optimal/30 bg-optimal/5">
            <CardContent className="flex items-start gap-3 p-5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-optimal" />
              <div>
                <p className="font-display text-base font-semibold text-ink-50 print:text-black">
                  No failures in this window
                </p>
                <p className="mt-1 text-sm text-ink-400 print:text-black">
                  Every order reached MedSource and every one is inside its service window.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-high/40 bg-high/5">
            <CardHeader className="flex flex-row items-center gap-2">
              <AlertOctagon className="h-4 w-4 shrink-0 text-high" />
              <CardTitle className="text-high print:text-black">
                {report.flagged.length} order{report.flagged.length === 1 ? "" : "s"} need action
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <FailureTile
                  icon={<PackageX className="h-4 w-4" />}
                  label="Never reached MedSource"
                  count={report.neverLanded.length}
                  tone="high"
                  hint="Nothing is being picked. The member is waiting on an order the partner has never seen."
                />
                <FailureTile
                  icon={<Clock className="h-4 w-4" />}
                  label="Past SLA"
                  count={report.stuck.length}
                  tone="watch"
                  hint="Accepted somewhere in the pipeline and stalled with no owner."
                />
                <FailureTile
                  icon={<TriangleAlert className="h-4 w-4" />}
                  label="Exception status"
                  count={report.exceptions.length}
                  tone="watch"
                  hint="Stock shortfall or QC hold — will not clear without a human decision."
                />
              </div>

              <div className="space-y-2">
                {report.flagged.map((o) => (
                  <FlaggedRow key={o.id} order={o} />
                ))}
              </div>

              {report.carriedForwardCount > 0 && (
                <p className="text-xs text-ink-400 print:text-black">
                  <span className="stat-mono text-ink-200">{report.carriedForwardCount}</span> of
                  these are carried forward from earlier days. An open failure does not age out of
                  this report — it gets more urgent, not less.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </section>

      {/* Totals ------------------------------------------------------------ */}
      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <TotalTile label="Orders" value={String(report.orderCount)} />
        <TotalTile label="Units" value={String(report.unitCount)} />
        <TotalTile label="Order value" value={currency(report.totalCents / 100)} />
      </section>

      {/* By coach ---------------------------------------------------------- */}
      <section className="mt-8 space-y-6">
        <h2 className="font-display text-lg font-semibold text-ink-50 print:text-black">
          By coach
        </h2>

        {report.groups.map((g) => (
          <Card key={g.coachId} className="print:break-inside-avoid print:border-black/20">
            <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="print:text-black">{g.coachName}</CardTitle>
                {g.flaggedCount > 0 && (
                  <Badge tone="high">
                    <span className="stat-mono">{g.flaggedCount}</span> flagged
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-ink-400 print:text-black">
                <span className="stat-mono">{g.orders.length} orders</span>
                <span className="stat-mono text-ink-200">{currency(g.totalCents / 100)}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {g.orders.map((o) => (
                <OrderBlock key={o.id} order={o} />
              ))}
            </CardContent>
          </Card>
        ))}
      </section>

      <p className="mt-8 text-xs text-ink-500 print:text-black">
        Derived from order records, never from audit-log text. Every order that exists appears on
        this report; there is no filter that can silently drop one.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function FailureTile({
  icon,
  label,
  count,
  tone,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  tone: "high" | "watch";
  hint: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        tone === "high" ? "border-high/30 bg-high/10" : "border-watch/30 bg-watch/10",
        count === 0 && "opacity-50",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide",
          tone === "high" ? "text-high" : "text-watch",
        )}
      >
        {icon}
        {label}
      </div>
      <p className="stat-mono mt-1 text-2xl font-semibold text-ink-50 print:text-black">{count}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-ink-400 print:text-black">{hint}</p>
    </div>
  );
}

function TotalTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="label-eyebrow print:text-black">{label}</p>
        <p className="stat-mono mt-1 text-2xl font-semibold text-ink-50 print:text-black">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function FlagChip({ flag }: { flag: OrderFlag }) {
  return (
    <Badge tone={flag.severity === "critical" ? "high" : "watch"}>{flag.label}</Badge>
  );
}

function FlaggedRow({ order }: { order: ReportOrder }) {
  return (
    <div className="rounded-xl border border-ink-700/70 bg-ink-900/50 p-3 print:break-inside-avoid">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/clients/${order.clientId}`}
          className="focus-ring rounded font-medium text-ink-50 hover:text-gold-200 print:text-black"
        >
          {order.clientName}
        </Link>
        <span className="stat-mono text-[11px] text-ink-500">{order.id}</span>
        <Badge tone={statusTone(order.status)}>{order.status}</Badge>
        {order.flags.map((f) => (
          <FlagChip key={f.kind} flag={f} />
        ))}
        {order.carriedForward && <Badge tone="neutral">carried forward</Badge>}
      </div>
      {order.flags.map((f) => (
        <p key={f.kind} className="mt-1.5 text-xs text-ink-300 print:text-black">
          {f.detail}
        </p>
      ))}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-500 print:text-black">
        <span className="stat-mono">{order.hoursInStatus}h in status</span>
        <span>{order.locationLabel}</span>
        <span className="stat-mono">{order.medsourceRef ?? "no partner ref"}</span>
        <Link
          href="/coach/orders"
          className="focus-ring inline-flex items-center gap-1 rounded text-gold-300 hover:text-gold-200 print:hidden"
        >
          Open on the board
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function OrderBlock({ order }: { order: ReportOrder }) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3 print:break-inside-avoid",
        order.flags.length > 0
          ? "border-high/30 bg-high/5"
          : "border-ink-700/70 bg-ink-900/40",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/clients/${order.clientId}`}
          className="focus-ring rounded text-sm font-medium text-ink-50 hover:text-gold-200 print:text-black"
        >
          {order.clientName}
        </Link>
        <span className="stat-mono text-[11px] text-ink-500">{order.mrn}</span>
        <span className="stat-mono text-[11px] text-ink-500">{order.id}</span>
        <Badge tone={statusTone(order.status)}>{order.status}</Badge>
        {order.flags.map((f) => (
          <FlagChip key={f.kind} flag={f} />
        ))}
      </div>

      {/* Line items. Overflow scrolls inside its own container so the page
          body never scrolls horizontally on a phone. */}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[22rem] text-left text-xs">
          <thead>
            <tr className="text-ink-500 print:text-black">
              <th className="py-1 pr-3 font-medium">Item</th>
              <th className="py-1 pr-3 font-medium">SKU</th>
              <th className="py-1 pr-3 text-right font-medium">Qty</th>
              <th className="py-1 text-right font-medium">Ext.</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.sku} className="border-t border-ink-700/50">
                <td className="py-1 pr-3 text-ink-200 print:text-black">
                  {l.name}
                  {l.isAddon && <span className="ml-1.5 text-[10px] text-ink-500">add-on</span>}
                  {l.lotRef && (
                    <span className="stat-mono ml-1.5 text-[10px] text-ink-500">
                      lot {l.lotRef}
                    </span>
                  )}
                </td>
                <td className="stat-mono py-1 pr-3 text-ink-500">{l.sku}</td>
                <td className="stat-mono py-1 pr-3 text-right text-ink-200 print:text-black">
                  {l.qty}
                </td>
                <td className="stat-mono py-1 text-right text-ink-200 print:text-black">
                  {currency(l.extendedCents / 100)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-500 print:text-black">
        <span>
          {order.locationLabel} · placed {formatDateTime(order.placedAt)}
          {order.tracking && <span className="stat-mono"> · {order.tracking}</span>}
        </span>
        <span className="stat-mono text-ink-200 print:text-black">
          {currency(order.totalCents / 100)}
        </span>
      </div>
    </div>
  );
}
