import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CircleDollarSign, Gauge, Network, ShieldAlert } from "lucide-react";
import { NextMoveRail } from "@/components/intelligence/NextMoveRail";
import { ownerMoves } from "@/lib/intelligence/ownerMoves";
import { attentionItems, BAND_META } from "@/lib/exec/attention";
import { bookState } from "@/lib/exec/business";
import { moneyContrast } from "@/lib/exec/locationMoney";
import { clients } from "@/lib/mock/clients";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const FUNNEL = [
  "Lead",
  "Consult Booked",
  "Labs Ordered",
  "Results Ready",
  "Plan Review",
  "Active Protocol",
] as const;

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function MiniMetric({
  icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "watch" | "high" | "optimal";
}) {
  const toneClass = {
    neutral: "text-ink-50",
    watch: "text-watch",
    high: "text-high",
    optimal: "text-optimal",
  }[tone];
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900/45 p-3.5">
      <div className="flex items-center gap-2 text-ink-500">
        {icon}
        <p className="label-eyebrow">{label}</p>
      </div>
      <p className={cn("stat-mono mt-2 text-title font-semibold leading-none", toneClass)}>{value}</p>
      <p className="mt-1.5 text-detail leading-snug text-ink-500">{detail}</p>
    </div>
  );
}

export function OwnerMorningBrief() {
  const items = attentionItems();
  const book = bookState("all");
  const moneyState = moneyContrast();
  const counts = Object.fromEntries(FUNNEL.map((stage) => [stage, clients.filter((c) => c.status === stage).length]));
  const topBand = items[0]?.kind;

  return (
    <section className="space-y-4">
      <NextMoveRail
        eyebrow="Owner brief"
        title="Start here"
        detail="The first pass compresses clinical delay, member wait, leakage and ops defects into the few owner-level decisions."
        moves={ownerMoves(4)}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <MiniMetric
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Attention index"
          value={String(items.length)}
          detail={
            topBand
              ? `${BAND_META[topBand].label}; top item is ${items[0].magnitude}.`
              : "No owner-blocking items in the current brief."
          }
          tone={items.some((i) => i.kind === "member-waiting" || i.kind === "clinical-ageing") ? "high" : "optimal"}
        />
        <MiniMetric
          icon={<CircleDollarSign className="h-4 w-4" />}
          label="Revenue leakage"
          value={money(book.atRiskMrr)}
          detail={`Paused ${money(book.pausedMrr)}; lapsed ${money(book.lapsedMrr)}. Contracted, not collected.`}
          tone={book.atRiskMrr > 0 ? "watch" : "optimal"}
        />
        <MiniMetric
          icon={<Gauge className="h-4 w-4" />}
          label="Weakest site"
          value={moneyState.weakestSite?.label ?? "Clear"}
          detail={
            moneyState.weakestSite
              ? `${money(moneyState.weakestSite.atRiskMrr)}/mo at risk there.`
              : "No site carries paused or lapsed recurring value."
          }
          tone={moneyState.weakestSite ? "watch" : "optimal"}
        />
        <MiniMetric
          icon={<Network className="h-4 w-4" />}
          label="Growth loop"
          value={`${counts["Lead"] ?? 0} leads`}
          detail={`${counts["Consult Booked"] ?? 0} consult booked; ${counts["Results Ready"] ?? 0} waiting on results review.`}
          tone={(counts["Lead"] ?? 0) > (counts["Consult Booked"] ?? 0) ? "watch" : "neutral"}
        />
      </div>

      <div className="rounded-lg border border-ink-800 bg-ink-950/35 p-3.5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="label-eyebrow">Growth loop</p>
            <p className="mt-1 text-body font-semibold text-ink-50">Lead to protocol, without hiding the stuck stages</p>
          </div>
          <Link href="/exec/marketing" className="focus-ring inline-flex items-center gap-1 rounded-control text-detail text-gold-300 hover:underline">
            Open pipeline
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          {FUNNEL.map((stage, index) => {
            const count = counts[stage] ?? 0;
            return (
              <div key={stage} className="rounded-lg border border-ink-800 bg-ink-900/45 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="stat-mono text-micro text-ink-600">{String(index + 1).padStart(2, "0")}</span>
                  <Badge tone={count > 0 ? "neutral" : "high"}>{count}</Badge>
                </div>
                <p className="mt-2 text-detail font-medium leading-tight text-ink-100">{stage}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
