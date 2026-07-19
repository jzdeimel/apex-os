"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { clients, clientName } from "@/lib/mock/clients";
import { todaysAppointments } from "@/lib/mock/appointments";
import { recentActivity } from "@/lib/mock/timeline";
import { inventory } from "@/lib/mock/inventory";
import { seededRecommendations } from "@/lib/mock/recommendations";
import { alphaScore } from "@/lib/alphaScore";
import { locationName } from "@/lib/mock/locations";
import { staffName } from "@/lib/mock/staff";
import { formatTime, relativeDays, seededRandom } from "@/lib/utils";
import { DashboardCard } from "@/components/DashboardCard";
import { Card, CardHeader, CardTitle, CardContent, Badge, EmptyState } from "@/components/ui/primitives";
import { ClientStatusBadge } from "@/components/StatusBadge";
import { RiskBadge } from "@/components/RiskBadge";
import { Monogram } from "@/components/Monogram";
import { Disclaimer } from "@/components/Disclaimer";
import { RevenueBars, ServiceDonut, DONUT_COLORS, CountBars, DonutCount } from "@/components/charts";
import { Stagger, StaggerItem } from "@/components/motion";
import {
  Users,
  CalendarPlus,
  FlaskConical,
  PackageX,
  Clock,
  TrendingUp,
  ArrowRight,
  AlertTriangle,
  Gauge,
  Boxes,
} from "lucide-react";

const APPT_TONE: Record<string, "neutral" | "optimal" | "gold" | "info"> = {
  Completed: "optimal",
  "Checked In": "gold",
  Scheduled: "info",
  "No Show": "neutral",
};

// Deterministic delta + 7-point sparkline for a KPI, derived from the value and
// a seed (which includes the active location) so it tracks the filter.
function trendFor(value: number, dir: "up" | "down", seed: string) {
  const rand = seededRandom(seed);
  const mag = dir === "up" ? 4 + rand() * 10 : -(3 + rand() * 9);
  const pct = Math.round(mag);
  const start = Math.max(0, Math.round(value * (1 - pct / 100)));
  const spark = Array.from({ length: 7 }, (_, i) => {
    const t = i / 6;
    return Math.max(0, Math.round(start + (value - start) * t + (rand() - 0.5) * Math.max(1, value * 0.08)));
  });
  spark[6] = value;
  return {
    delta: `${pct > 0 ? "+" : ""}${pct}%`,
    tone: (pct >= 0 ? "up" : "down") as "up" | "down",
    spark,
  };
}

export default function DashboardPage() {
  const { locationFilter, role } = useStore();

  const data = useMemo(() => {
    const inLoc = (loc: string) => locationFilter === "all" || loc === locationFilter;
    const cl = clients.filter((c) => inLoc(c.locationId));
    const active = cl.filter((c) => c.status === "Active Protocol").length;
    const newConsults = cl.filter((c) => ["Lead", "Consult Booked"].includes(c.status)).length;
    const resultsReady = cl.filter((c) => c.status === "Results Ready").length;
    const overdue = cl.filter((c) => c.status === "Follow-Up Due").length;
    const inv = inventory.filter((i) => inLoc(i.locationId));
    const invAlerts = inv.filter((i) => i.status !== "in stock").length;
    const monthlyRevenue =
      cl.reduce((s, c) => s + c.lifetimeValue, 0) * 0.06 + active * 420 + 18500;

    const appts = todaysAppointments.filter((a) => inLoc(a.locationId));
    const attention = cl
      .filter((c) => ["Results Ready", "Follow-Up Due", "Plan Review"].includes(c.status))
      .sort((a, b) => {
        const order = { "Follow-Up Due": 0, "Results Ready": 1, "Plan Review": 2 } as Record<string, number>;
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
      });
    const activity = recentActivity.filter((e) => {
      const c = clients.find((x) => x.id === e.clientId);
      return c && inLoc(c.locationId);
    });

    // revenue by location (for bar chart) — fixed/derived
    const revByLoc = ["raleigh", "southern-pines", "myrtle-beach", "telehealth"]
      .filter((l) => locationFilter === "all" || l === locationFilter)
      .map((l) => {
        const sub = clients.filter((c) => c.locationId === l);
        return {
          name: locationName(l as never),
          revenue: Math.round(sub.reduce((s, c) => s + c.lifetimeValue, 0) * 0.06 + sub.length * 320),
        };
      });

    const serviceMix = [
      { name: "Weight mgmt", value: 28 },
      { name: "Hormone", value: 22 },
      { name: "Peptides", value: 18 },
      { name: "Diagnostics", value: 14 },
      { name: "IV / NAD+", value: 11 },
      { name: "Aesthetics", value: 7 },
    ];

    const pendingApprovals = seededRecommendations.filter(
      (r) => (r.status === "draft" || r.status === "coach reviewed") && inLoc(clients.find((c) => c.id === r.clientId)!.locationId),
    ).length;

    const STATUS_COLOR: Record<string, string> = {
      "Active Protocol": "#34d399",
      "Results Ready": "#e93d3d",
      "Plan Review": "#e0bd6e",
      "Follow-Up Due": "#f87171",
      "Labs Ordered": "#38bdf8",
      "Consult Booked": "#60a5fa",
      Lead: "#6f7884",
      Inactive: "#4b525c",
    };
    const statusMix = Object.entries(
      cl.reduce<Record<string, number>>((acc, c) => {
        acc[c.status] = (acc[c.status] ?? 0) + 1;
        return acc;
      }, {}),
    )
      .map(([name, value]) => ({ name, value, color: STATUS_COLOR[name] }))
      .sort((a, b) => b.value - a.value);

    // Visits this week (Mon–Sun) — deterministic from appointment volume.
    const visitSeed = [38, 42, 51, 47, 56, 22, 9];
    const weeklyVisits = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => ({
      name: d,
      value: Math.max(2, Math.round(visitSeed[i] * (cl.length / 24))),
    }));

    const avgScore = cl.length
      ? Math.round(cl.reduce((s, c) => s + alphaScore(c).score, 0) / cl.length)
      : 0;
    const inventoryValue = Math.round(inv.reduce((s, i) => s + i.quantity * i.unitCost, 0));

    const lf = String(locationFilter);
    const trends = {
      active: trendFor(active, "up", lf + "active"),
      consults: trendFor(newConsults, "up", lf + "consults"),
      results: trendFor(resultsReady, "up", lf + "results"),
      inv: trendFor(invAlerts, "down", lf + "inv"),
      overdue: trendFor(overdue, "down", lf + "overdue"),
      rev: trendFor(Math.round(monthlyRevenue / 1000), "up", lf + "rev"),
      invValue: trendFor(Math.round(inventoryValue / 1000), "up", lf + "invval"),
    };

    return {
      active,
      newConsults,
      resultsReady,
      overdue,
      invAlerts,
      monthlyRevenue,
      appts,
      attention,
      activity,
      revByLoc,
      serviceMix,
      statusMix,
      weeklyVisits,
      pendingApprovals,
      trends,
      avgScore,
      inventoryValue,
      scoreDist: [
        { name: "<55", lo: 0, hi: 55 },
        { name: "55–69", lo: 55, hi: 70 },
        { name: "70–84", lo: 70, hi: 85 },
        { name: "85+", lo: 85, hi: 101 },
      ].map((b) => ({ name: b.name, value: cl.filter((c) => { const s = alphaScore(c).score; return s >= b.lo && s < b.hi; }).length })),
      total: cl.length,
    };
  }, [locationFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label-eyebrow">
            {locationFilter === "all" ? "All locations" : locationName(locationFilter)} · Friday, June 12, 2026
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink-50 sm:text-3xl">
            Clinic Command Center
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            {role === "Provider"
              ? "Provider view — clinical priorities, results & approvals."
              : role === "Coach"
                ? "Coach view — your clients, engagement & follow-ups."
                : "Operations view — supply, scheduling & coverage."}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 animate-pulse-soft rounded-full bg-optimal" /> System of record · Apex
          </span>
        </div>
      </div>

      {/* KPIs — last card is role-specific */}
      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StaggerItem className="h-full"><DashboardCard label="Active clients" countTo={data.active} spark={data.trends.active.spark} icon={<Users className="h-4 w-4" />} delta={data.trends.active.delta} deltaTone={data.trends.active.tone} hint={`${data.total} total in view`} accent /></StaggerItem>
        <StaggerItem className="h-full"><DashboardCard label="New consults" countTo={data.newConsults} spark={data.trends.consults.spark} icon={<CalendarPlus className="h-4 w-4" />} delta={data.trends.consults.delta} deltaTone={data.trends.consults.tone} /></StaggerItem>
        <StaggerItem className="h-full"><DashboardCard label="Results ready" countTo={data.resultsReady} spark={data.trends.results.spark} icon={<FlaskConical className="h-4 w-4" />} hint="Awaiting review" /></StaggerItem>
        <StaggerItem className="h-full"><DashboardCard label="Inventory alerts" countTo={data.invAlerts} spark={data.trends.inv.spark} sparkColor="#f87171" icon={<PackageX className="h-4 w-4" />} delta={data.trends.inv.delta} deltaTone={data.trends.inv.tone} /></StaggerItem>
        <StaggerItem className="h-full"><DashboardCard label="Overdue follow-ups" countTo={data.overdue} spark={data.trends.overdue.spark} sparkColor="#f87171" icon={<Clock className="h-4 w-4" />} delta={data.trends.overdue.delta} deltaTone={data.trends.overdue.tone} /></StaggerItem>
        <StaggerItem className="h-full">
          {role === "Coach" ? (
            <DashboardCard label="Avg Alpha Score" countTo={data.avgScore} spark={[data.avgScore - 8, data.avgScore - 5, data.avgScore - 6, data.avgScore - 3, data.avgScore - 2, data.avgScore - 1, data.avgScore]} sparkColor="#34d399" icon={<Gauge className="h-4 w-4" />} delta="+4" deltaTone="up" hint="Across your clients" />
          ) : role === "Operations" ? (
            <DashboardCard label="On-hand inventory" countTo={Math.round(data.inventoryValue / 1000)} countPrefix="$" countSuffix="k" spark={data.trends.invValue.spark} icon={<Boxes className="h-4 w-4" />} delta={data.trends.invValue.delta} deltaTone={data.trends.invValue.tone} />
          ) : (
            <DashboardCard label="Proj. monthly rev" countTo={Math.round(data.monthlyRevenue / 1000)} countPrefix="$" countSuffix="k" spark={data.trends.rev.spark} icon={<TrendingUp className="h-4 w-4" />} delta={data.trends.rev.delta} deltaTone={data.trends.rev.tone} />
          )}
        </StaggerItem>
      </Stagger>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Today's schedule */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Today&apos;s schedule</CardTitle>
            <Badge>{data.appts.length} appointments</Badge>
          </CardHeader>
          <CardContent>
            {data.appts.length === 0 ? (
              <EmptyState icon={<CalendarPlus className="h-6 w-6" />} title="No appointments for this location today" />
            ) : (
              <div className="space-y-1">
                {data.appts.map((a) => (
                  <Link
                    key={a.id}
                    href={`/clients/${a.clientId}`}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-ink-850/70"
                  >
                    <span className="w-16 shrink-0 stat-mono text-xs text-ink-400">{formatTime(a.start)}</span>
                    <span className="h-8 w-px bg-ink-800" />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-100">{a.clientName}</span>
                      <span className="block text-xs text-ink-500">
                        {a.type} · {staffName(a.staffId).split(" ").slice(-1)} · {locationName(a.locationId)}
                      </span>
                    </div>
                    <Badge tone={APPT_TONE[a.status]}>{a.status}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Attention needed */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-gold-400" /> Attention needed
            </CardTitle>
            <Badge tone="gold">{data.attention.length}</Badge>
          </CardHeader>
          <CardContent>
            {data.attention.length === 0 ? (
              <EmptyState title="All clear for this location" />
            ) : (
              <div className="space-y-2">
                {data.attention.slice(0, 6).map((c) => (
                  <Link
                    key={c.id}
                    href={`/clients/${c.id}`}
                    className="flex items-center gap-2.5 rounded-xl border border-ink-800 bg-ink-900/40 px-3 py-2 transition-colors hover:border-ink-700"
                  >
                    <Monogram client={c} size="sm" />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-100">{clientName(c)}</span>
                      <ClientStatusBadge status={c.status} />
                    </div>
                    {c.riskFlags[0] && <RiskBadge level={c.riskFlags[0].level} showLabel={false} />}
                  </Link>
                ))}
                {data.pendingApprovals > 0 && (
                  <Link
                    href="/recommendations"
                    className="mt-1 flex items-center justify-between rounded-xl border border-gold-400/25 bg-gold-400/[0.06] px-3 py-2 text-xs text-gold-200 hover:bg-gold-400/10"
                  >
                    <span>{data.pendingApprovals} recommendations need provider approval</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{role === "Coach" ? "Client Alpha Score spread" : "Revenue by location"}</CardTitle>
          </CardHeader>
          <CardContent>
            {role === "Coach" ? (
              <CountBars data={data.scoreDist} height={240} label="Clients" />
            ) : (
              <RevenueBars data={data.revByLoc} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Service mix</CardTitle>
          </CardHeader>
          <CardContent>
            <ServiceDonut data={data.serviceMix} />
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
              {data.serviceMix.map((s, i) => (
                <div key={s.name} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                  <span className="text-ink-300">{s.name}</span>
                  <span className="ml-auto stat-mono text-ink-500">{s.value}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Visits + lifecycle row */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Visits this week</CardTitle>
            <Badge tone="optimal">+8% vs last wk</Badge>
          </CardHeader>
          <CardContent>
            <CountBars data={data.weeklyVisits} height={220} label="Visits" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Lifecycle mix</CardTitle></CardHeader>
          <CardContent>
            <DonutCount data={data.statusMix} height={180} centerValue={data.total} centerLabel="clients" />
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
              {data.statusMix.slice(0, 6).map((s) => (
                <div key={s.name} className="flex items-center gap-2 text-[11px]">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                  <span className="truncate text-ink-300">{s.name}</span>
                  <span className="ml-auto stat-mono text-ink-500">{s.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent client activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.activity.slice(0, 8).map((e) => {
              const c = clients.find((x) => x.id === e.clientId);
              return (
                <Link
                  key={e.id}
                  href={c ? `/clients/${c.id}` : "#"}
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-ink-850/60"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400/70" />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-200">
                    <span className="font-medium">{c ? clientName(c) : "Client"}</span>{" "}
                    <span className="text-ink-400">— {e.type}</span>
                  </span>
                  <span className="stat-mono shrink-0 text-[11px] text-ink-500">{relativeDays(e.at)}</span>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Disclaimer />
    </div>
  );
}
