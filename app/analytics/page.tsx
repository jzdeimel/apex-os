"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { analyticsFor, ILLUSTRATIVE_NOTE, ILLUSTRATIVE_BADGE } from "@/lib/analytics";
import { locationName } from "@/lib/mock/locations";
import { DashboardCard } from "@/components/DashboardCard";
import { Card, CardHeader, CardTitle, CardContent, Badge } from "@/components/ui/primitives";
import { RevenueBars, PercentLine, StackedArea } from "@/components/charts";
import { currency } from "@/lib/utils";
import {
  DollarSign,
  Repeat,
  Users,
  TrendingUp,
  Filter,
  LineChart as LineIcon,
} from "lucide-react";

export default function AnalyticsPage() {
  const { locationFilter } = useStore();
  const a = useMemo(() => analyticsFor(locationFilter), [locationFilter]);

  return (
    <div className="space-y-5">
      <div>
        <p className="label-eyebrow">Business analytics · {locationFilter === "all" ? "all locations" : locationName(locationFilter)}</p>
        <h1 className="mt-1 flex items-center gap-2 font-display text-title font-bold tracking-tight text-ink-50">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-gold-300 to-gold-600 text-ink-950">
            <TrendingUp className="h-5 w-5" />
          </span>
          Analytics &amp; Revenue
        </h1>
      </div>

      {/*
          AUDIT FIX — GAP_ANALYSIS "Revenue by location / program: PARTIAL
          (fabricated), P0". This page rendered invented revenue with its only
          caveat in text-micro at the very bottom, below the fold, smaller than
          every number it qualified. The disclosure now runs above the figures
          at body size, and each fabricated card and chart carries its own
          label — an owner reading one card must not have to have read a footer.
      */}
      <div className="flex items-start gap-3 rounded-panel border border-gold-400/25 bg-gold-400/[0.06] p-4">
        <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" />
        <p className="max-w-prose text-detail leading-relaxed text-ink-200">
          <span className="font-semibold text-gold-200">Illustrative figures.</span>{" "}
          {ILLUSTRATIVE_NOTE}
        </p>
      </div>

      {/*
          The "+12%", "+9%" and "+4pt" deltas that sat on these cards are gone
          rather than labelled. They were not fabricated from a weak source —
          they were typed in, with no prior period anywhere in the build to
          compare against, and a delta reads as measurement no matter what is
          printed beside it. The figures themselves are kept and labelled.
      */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DashboardCard label="MRR" value={currency(a.mrr, true)} icon={<Repeat className="h-4 w-4" />} accent hint={`Summed from ${a.members} active memberships`} />
        <DashboardCard label="Gross / month" value={currency(a.grossMonthly, true)} icon={<DollarSign className="h-4 w-4" />} hint={`${ILLUSTRATIVE_BADGE} — no billing data behind this`} />
        <DashboardCard label="ARPU" value={currency(a.arpu)} icon={<Users className="h-4 w-4" />} hint="Avg lifetime value / client" />
        <DashboardCard label="Lead → active" value={`${a.consultToActive}%`} icon={<Filter className="h-4 w-4" />} hint="Status snapshot, not a cohort" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>MRR trend</CardTitle>
            {/* Was a green "+12% MoM" badge — a hardcoded string presented as a
                measured month-over-month result. There is no prior month in
                this build to measure against. */}
            <Badge>{ILLUSTRATIVE_BADGE}</Badge>
          </CardHeader>
          <CardContent>
            <RevenueBars data={a.mrrTrend} height={240} />
            <p className="mt-2 text-detail leading-relaxed text-ink-400">
              Earlier months are interpolated from today&apos;s MRR — Apex stores no dated
              subscription events, so this is a shape, not a history.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>LTV by tier</CardTitle></CardHeader>
          <CardContent>
            <RevenueBars data={a.ltvByTier} height={240} />
            <div className="mt-2 grid grid-cols-2 gap-1.5 text-micro">
              {a.ltvByTier.map((t) => (
                <div key={t.name} className="flex justify-between text-ink-400">
                  <span>{t.name}</span>
                  <span className="stat-mono">{t.count} clients</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex flex-wrap items-center gap-2">
            Revenue by service line over time
            <Badge>{ILLUSTRATIVE_BADGE}</Badge>
          </CardTitle>
          <div className="hidden flex-wrap gap-2 sm:flex">
            {a.serviceKeys.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5 text-micro text-ink-400">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}
              </span>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <StackedArea data={a.revByServiceTrend} series={a.serviceKeys} height={260} />
          <p className="mt-2 max-w-prose text-detail leading-relaxed text-ink-400">
            Split by fixed percentage weights, not by what was sold — nothing in Apex tags revenue
            with a service line yet.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Service mix (this month)</CardTitle>
            <Badge>{ILLUSTRATIVE_BADGE}</Badge>
          </CardHeader>
          <CardContent>
            <RevenueBars data={a.revByService} height={220} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2"><LineIcon className="h-4 w-4 text-optimal" /> Retention cohort</CardTitle>
            {/* Was a "6-month" badge, which read as the window of a real
                measurement. The curve is a literal array in lib/analytics.ts
                and is identical for every location. */}
            <Badge>{ILLUSTRATIVE_BADGE}</Badge>
          </CardHeader>
          <CardContent>
            <PercentLine data={a.retention.map((r) => ({ name: r.month, value: r.pct }))} height={220} />
            <p className="mt-2 text-detail leading-relaxed text-ink-400">
              A sample curve, not your cohorts. Apex records no cancellation dates, so retention
              cannot be computed here yet.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Filter className="h-4 w-4 text-gold-400" /> Conversion funnel</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {a.funnel.map((f, i) => (
                <div key={f.stage}>
                  <div className="flex items-center justify-between text-detail">
                    <span className="text-ink-300">{f.stage}</span>
                    <span className="text-ink-500"><span className="stat-mono text-ink-200">{f.count}</span> · {f.rate}%</span>
                  </div>
                  <div className="mt-1 h-6 w-full overflow-hidden rounded-md bg-ink-800">
                    <div
                      className="flex h-full items-center rounded-md bg-gradient-to-r from-gold-600 to-gold-400 pl-2"
                      style={{ width: `${Math.max(8, f.rate)}%` }}
                    >
                      {i > 0 && <span className="stat-mono text-micro font-bold text-ink-950">{f.rate}%</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Kept, but it is no longer carrying the disclosure on its own — the
          banner at the top of the page does that. This is the provenance line. */}
      <p className="text-detail text-ink-500">
        Demo figures over mock membership plans and client lifetime values. Not financial reporting,
        and not a source for any number quoted outside this prototype.
      </p>
    </div>
  );
}
