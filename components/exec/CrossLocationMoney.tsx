"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { TrendingUp, AlertTriangle, Crown, DollarSign, Users, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { locationMoney, moneyContrast, type MoneySignal } from "@/lib/exec/locationMoney";
import { currency, cn } from "@/lib/utils";

/**
 * CROSS-LOCATION MONEY SCOREBOARD.
 *
 * The owner's first question is "which of my sites is working and which isn't",
 * and the honest answer is a money one. This ranks every location on monthly
 * recurring revenue, shows how much of each site's revenue is at risk, and calls
 * out the site carrying the business and the site leaking it — so the comparison
 * takes two seconds, not a spreadsheet.
 */

const SIGNAL: Record<MoneySignal, { label: string; cls: string; bar: string }> = {
  leading: { label: "Leading", cls: "text-emerald border-emerald/30 bg-emerald/5", bar: "var(--c-optimal)" },
  steady: { label: "Steady", cls: "text-low border-low/30 bg-low/5", bar: "var(--c-low)" },
  watch: { label: "Watch", cls: "text-gold-300 border-gold-400/30 bg-gold-400/5", bar: "var(--c-watch)" },
  "at-risk": { label: "At risk", cls: "text-high border-high/40 bg-high/10", bar: "var(--c-high)" },
};

export function CrossLocationMoney() {
  const sites = React.useMemo(() => locationMoney(), []);
  const c = React.useMemo(() => moneyContrast(), []);
  const topMrr = sites[0]?.mrr || 1;

  return (
    <section className="rounded-panel border border-ink-700/70 bg-ink-850/60">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-800/70 px-5 py-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-gold-400" aria-hidden />
          <h2 className="text-heading text-ink-50">Money by location</h2>
        </div>
        <Link href="/analytics" className="inline-flex items-center gap-1 text-micro text-ink-500 hover:text-ink-200">
          Full analytics <ArrowUpRight className="h-3 w-3" />
        </Link>
      </header>

      {/* Contrast strip — the whole business, then the two sites that matter. */}
      <div className="grid gap-3 border-b border-ink-800/70 px-5 py-4 sm:grid-cols-3">
        <Totals label="Monthly recurring" value={currency(c.totalMrr)} sub={`${currency(c.totalAnnualRunRate)}/yr run-rate`} />
        <Totals label="Revenue at risk" value={currency(c.totalAtRiskMrr)} sub="paused + lapsed, monthly" tone={c.totalAtRiskMrr > 0 ? "high" : "neutral"} />
        <Totals label="Sites compared" value={String(sites.length)} sub="incl. telehealth" />
      </div>

      {/* Working vs not-working callouts. */}
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
        {c.bestSite && (
          <Callout
            icon={Crown}
            tone="good"
            title={`${c.bestSite.label} is working`}
            body={c.bestSite.signalReason}
            figure={`${currency(c.bestSite.mrr)}/mo`}
          />
        )}
        {c.weakestSite ? (
          <Callout
            icon={AlertTriangle}
            tone="bad"
            title={`${c.weakestSite.label} is leaking the most`}
            body={c.weakestSite.signalReason}
            figure={`${currency(c.weakestSite.atRiskMrr)}/mo at risk`}
          />
        ) : (
          <Callout icon={TrendingUp} tone="good" title="No site is bleeding revenue" body="Every location's at-risk revenue is within a normal band this month." figure="" />
        )}
      </div>

      {/* Ranked scoreboard. */}
      <div className="space-y-2.5 px-5 pb-5">
        {sites.map((s, i) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.04, 0.3) }}
            className="rounded-control border border-ink-800 bg-ink-900/40 p-3.5"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="stat-mono w-5 text-center text-detail text-ink-600">{i + 1}</span>
                <span className="text-body font-medium text-ink-50">{s.label}</span>
                <span className={cn("rounded-full border px-2 py-0.5 text-micro font-medium", SIGNAL[s.signal].cls)}>
                  {SIGNAL[s.signal].label}
                </span>
              </div>
              <div className="text-right">
                <p className="stat-mono text-body font-semibold text-ink-50">{currency(s.mrr)}<span className="text-micro text-ink-500">/mo</span></p>
              </div>
            </div>

            {/* MRR bar relative to the top site. */}
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800">
              <motion.div
                className="h-full rounded-full"
                style={{ background: SIGNAL[s.signal].bar }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(4, (s.mrr / topMrr) * 100)}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-micro sm:grid-cols-4">
              <Metric icon={Users} label="Members" value={String(s.members)} />
              <Metric label="Avg LTV" value={currency(s.avgLtv)} />
              <Metric
                label="At risk"
                value={`${currency(s.atRiskMrr)}`}
                tone={s.atRiskPct >= 0.16 ? "warn" : undefined}
              />
              <Metric label="At-risk %" value={`${Math.round(s.atRiskPct * 100)}%`} tone={s.atRiskPct >= 0.28 ? "bad" : s.atRiskPct >= 0.16 ? "warn" : undefined} />
            </div>
          </motion.div>
        ))}
      </div>

      <p className="border-t border-ink-800/70 px-5 py-3 text-micro leading-relaxed text-ink-600">
        MRR and at-risk are counted from membership records (lib/mock/memberships.ts); LTV from the
        client record. Measured, reproducible. This is billing intent, not collected cash — Apex has
        no payment record yet, so it shows what should bill, not what cleared.
      </p>
    </section>
  );
}

function Totals({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "high" | "neutral" }) {
  return (
    <div className="rounded-control border border-ink-800 bg-ink-900/40 px-3.5 py-3">
      <p className="text-micro uppercase tracking-[0.12em] text-ink-500">{label}</p>
      <p className={cn("stat-mono mt-0.5 text-title font-semibold", tone === "high" ? "text-high" : "text-ink-50")}>{value}</p>
      <p className="text-micro text-ink-600">{sub}</p>
    </div>
  );
}

function Callout({
  icon: Icon,
  tone,
  title,
  body,
  figure,
}: {
  icon: typeof Crown;
  tone: "good" | "bad";
  title: string;
  body: string;
  figure: string;
}) {
  return (
    <div className={cn("rounded-control border px-4 py-3", tone === "good" ? "border-emerald/25 bg-emerald/5" : "border-high/30 bg-high/5")}>
      <div className="flex items-center justify-between gap-2">
        <p className={cn("flex items-center gap-1.5 text-detail font-medium", tone === "good" ? "text-emerald" : "text-high")}>
          <Icon className="h-4 w-4" /> {title}
        </p>
        {figure && <span className="stat-mono text-micro text-ink-400">{figure}</span>}
      </div>
      <p className="mt-1 text-micro leading-relaxed text-ink-400">{body}</p>
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone }: { icon?: typeof Users; label: string; value: string; tone?: "warn" | "bad" }) {
  return (
    <div className="flex items-center justify-between gap-2 sm:block">
      <span className="flex items-center gap-1 text-ink-600">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </span>
      <span className={cn("stat-mono", tone === "bad" ? "text-high" : tone === "warn" ? "text-gold-300" : "text-ink-200")}>{value}</span>
    </div>
  );
}
