"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { analyticsFor } from "@/lib/analytics";
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DashboardCard label="MRR" value={currency(a.mrr, true)} icon={<Repeat className="h-4 w-4" />} delta="+12%" accent hint={`${a.members} active members`} />
        <DashboardCard label="Gross / month" value={currency(a.grossMonthly, true)} icon={<DollarSign className="h-4 w-4" />} delta="+9%" />
        <DashboardCard label="ARPU" value={currency(a.arpu)} icon={<Users className="h-4 w-4" />} hint="Avg revenue / client" />
        <DashboardCard label="Lead → active" value={`${a.consultToActive}%`} icon={<Filter className="h-4 w-4" />} delta="+4pt" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>MRR trend</CardTitle>
            <Badge tone="optimal">+12% MoM</Badge>
          </CardHeader>
          <CardContent>
            <RevenueBars data={a.mrrTrend} height={240} />
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
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Revenue by service line over time</CardTitle>
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
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Service mix (this month)</CardTitle></CardHeader>
          <CardContent>
            <RevenueBars data={a.revByService} height={220} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><LineIcon className="h-4 w-4 text-optimal" /> Retention cohort</CardTitle>
            <Badge>6-month</Badge>
          </CardHeader>
          <CardContent>
            <PercentLine data={a.retention.map((r) => ({ name: r.month, value: r.pct }))} height={220} />
            <p className="mt-1 text-micro text-ink-500">% of a join cohort still active each month.</p>
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

      <p className="text-micro text-ink-600">
        Demo figures derived from Apex membership plans &amp; mock client lifetime value. Not financial reporting.
      </p>
    </div>
  );
}
