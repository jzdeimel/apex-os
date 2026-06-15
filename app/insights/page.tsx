"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { clients, clientName } from "@/lib/mock/clients";
import {
  rankByTriage,
  rankByChurn,
  nextBestAction,
  cohortAnalytics,
  churnRisk,
} from "@/lib/aiInsights";
import { DashboardCard } from "@/components/DashboardCard";
import { Card, CardHeader, CardTitle, CardContent, Badge } from "@/components/ui/primitives";
import { Monogram } from "@/components/Monogram";
import { ClientStatusBadge } from "@/components/StatusBadge";
import { AiLabel, Disclaimer } from "@/components/Disclaimer";
import { CountBars, ScatterStat, DonutCount } from "@/components/charts";
import { locationName } from "@/lib/mock/locations";
import { cn } from "@/lib/utils";
import {
  Brain,
  Gauge,
  TrendingDown,
  Users,
  ArrowRight,
  Target,
  Activity,
  FlaskConical,
} from "lucide-react";

const TRIAGE_TONE = {
  critical: "high",
  high: "watch",
  medium: "gold",
  low: "neutral",
} as const;

const CHURN_TONE = { high: "high", medium: "watch", low: "optimal" } as const;

export default function InsightsPage() {
  const { locationFilter } = useStore();

  const data = useMemo(() => {
    const scope = clients.filter((c) => locationFilter === "all" || c.locationId === locationFilter);
    const triage = rankByTriage(scope);
    const churn = rankByChurn(scope).filter((c) => c.level !== "low");
    const cohort = cohortAnalytics(scope);
    const critical = triage.filter((t) => t.level === "critical" || t.level === "high").length;
    const highChurn = churn.filter((c) => c.level === "high").length;
    const scatter = scope.map((c) => ({ x: triage.find((t) => t.client.id === c.id)!.score, y: churnRisk(c).score, name: clientName(c) }));
    const triageLevels = (
      [
        { key: "critical", color: "#f87171" },
        { key: "high", color: "#e0bd6e" },
        { key: "medium", color: "#e93d3d" },
        { key: "low", color: "#34d399" },
      ] as const
    )
      .map((l) => ({ name: l.key, value: triage.filter((t) => t.level === l.key).length, color: l.color }))
      .filter((d) => d.value > 0);
    return { triage, churn, cohort, critical, highChurn, scope, scatter, triageLevels };
  }, [locationFilter]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label-eyebrow">AI Insights · {locationFilter === "all" ? "all locations" : locationName(locationFilter)}</p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-ink-50">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-gold-300 to-gold-600 text-ink-950">
              <Brain className="h-5 w-5" />
            </span>
            Intelligence Hub
          </h1>
        </div>
        <AiLabel />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DashboardCard label="Clients in view" value={data.cohort.total} icon={<Users className="h-4 w-4" />} accent />
        <DashboardCard label="Need attention" value={data.critical} icon={<Gauge className="h-4 w-4" />} hint="Critical + high triage" />
        <DashboardCard label="Churn risk" value={data.highChurn} icon={<TrendingDown className="h-4 w-4" />} deltaTone="down" hint="High-risk clients" />
        <DashboardCard label="With labs on file" value={data.cohort.withLabs} icon={<FlaskConical className="h-4 w-4" />} hint={`avg age ${data.cohort.avgAge}`} />
      </div>

      <Disclaimer compact />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Triage leaderboard + NBA */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Gauge className="h-4 w-4 text-gold-400" /> Attention triage & Next-Best-Action</CardTitle>
            <Badge tone="gold">AI-ranked</Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.triage.slice(0, 8).map((t) => {
                const c = t.client;
                const nba = nextBestAction(c);
                return (
                  <Link
                    key={c.id}
                    href={`/clients/${c.id}`}
                    className="block rounded-xl border border-ink-800 bg-ink-900/40 p-3 transition-colors hover:border-ink-700"
                  >
                    <div className="flex items-center gap-3">
                      {/* Score ring */}
                      <div className="relative grid h-11 w-11 shrink-0 place-items-center">
                        <svg className="h-11 w-11 -rotate-90" viewBox="0 0 36 36">
                          <circle cx="18" cy="18" r="15.5" fill="none" stroke="#23272d" strokeWidth="3" />
                          <circle
                            cx="18" cy="18" r="15.5" fill="none"
                            stroke={t.level === "critical" ? "#f87171" : t.level === "high" ? "#e0bd6e" : "#e93d3d"}
                            strokeWidth="3" strokeLinecap="round"
                            strokeDasharray={`${(t.score / 100) * 97.4} 97.4`}
                          />
                        </svg>
                        <span className="absolute stat-mono text-xs font-bold text-ink-100">{t.score}</span>
                      </div>
                      <Monogram client={c} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-ink-50">{clientName(c)}</span>
                          <Badge tone={TRIAGE_TONE[t.level]}>{t.level}</Badge>
                        </div>
                        <span className="text-[11px] text-ink-500">{locationName(c.locationId)} · {c.status}</span>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-ink-600" />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-gold-400/20 bg-gold-400/[0.05] px-2.5 py-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gold-300">Next best action</span>
                      <span className="text-xs text-ink-200">{nba.action}</span>
                      <Badge tone="neutral">{nba.owner}</Badge>
                    </div>
                    {t.factors.length > 0 && (
                      <p className="mt-1.5 text-[11px] text-ink-500">Drivers: {t.factors.join(" · ")}</p>
                    )}
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Churn risk */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingDown className="h-4 w-4 text-high" /> Retention risk</CardTitle>
          </CardHeader>
          <CardContent>
            {data.churn.length === 0 ? (
              <p className="text-sm text-ink-500">No elevated churn risk in view.</p>
            ) : (
              <div className="space-y-2">
                {data.churn.slice(0, 7).map((ch) => (
                  <Link
                    key={ch.client.id}
                    href={`/clients/${ch.client.id}`}
                    className="block rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2 transition-colors hover:border-ink-700"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink-100">{clientName(ch.client)}</span>
                      <Badge tone={CHURN_TONE[ch.level]}>{ch.score}</Badge>
                    </div>
                    <p className="text-[11px] text-ink-500">{ch.drivers.join(" · ")}</p>
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-ink-700">
                      <div className={cn("h-full rounded-full", ch.level === "high" ? "bg-high" : "bg-watch")} style={{ width: `${ch.score}%` }} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Risk matrix + score distribution */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Gauge className="h-4 w-4 text-gold-400" /> Risk matrix</CardTitle>
            <Badge>triage × churn</Badge>
          </CardHeader>
          <CardContent>
            <ScatterStat data={data.scatter} xLabel="Triage score" yLabel="Churn risk" height={260} />
            <p className="mt-1 text-[11px] text-ink-500">Upper-right = act now (high attention + high churn). Each dot is a client.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Gauge className="h-4 w-4 text-gold-400" /> Triage levels</CardTitle></CardHeader>
          <CardContent>
            <DonutCount data={data.triageLevels} height={210} centerValue={data.cohort.total} centerLabel="clients" />
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {data.triageLevels.map((t) => (
                <div key={t.name} className="flex items-center gap-2 text-[11px]">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: t.color }} />
                  <span className="flex-1 capitalize text-ink-400">{t.name}</span>
                  <span className="stat-mono text-ink-500">{t.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cohort analytics */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-4 w-4 text-gold-400" /> Goal distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.cohort.goals.map((g) => (
                <div key={g.name}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-300">{g.name}</span>
                    <span className="stat-mono text-ink-500">{g.value}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
                    <div className="h-full rounded-full bg-gold-400" style={{ width: `${(g.value / data.cohort.total) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4 text-low" /> Lifecycle funnel</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {data.cohort.funnel.map((f) => (
                <div key={f.name} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-[11px] text-ink-400">{f.name}</span>
                  <div className="h-5 flex-1 overflow-hidden rounded bg-ink-800">
                    <div className="flex h-full items-center justify-end rounded bg-gradient-to-r from-gold-600 to-gold-400 px-1.5" style={{ width: `${Math.max(6, (f.value / data.cohort.total) * 100)}%` }}>
                      <span className="stat-mono text-[10px] font-bold text-ink-950">{f.value}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-watch" /> Most common abnormal markers</CardTitle></CardHeader>
          <CardContent>
            {data.cohort.markers.length === 0 ? (
              <p className="text-sm text-ink-500">No labs in view.</p>
            ) : (
              <CountBars
                data={data.cohort.markers.map((m) => ({ name: m.name.split(" ")[0], value: m.value }))}
                height={200}
              />
            )}
            <p className="mt-2 text-[11px] text-ink-500">Count of clients with each marker outside optimal range (cohort-level signal for protocol planning).</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
