"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { clients, clientName, getClient } from "@/lib/mock/clients";
import { usePortal } from "@/lib/portalStore";
import { visibleClientsForPortal } from "@/lib/access/clientScope";
import { todaysAppointments } from "@/lib/mock/appointments";
import { recentActivity } from "@/lib/mock/timeline";
import { inventory } from "@/lib/mock/inventory";
import { seededRecommendations } from "@/lib/mock/recommendations";
import { getLabsForClient } from "@/lib/mock/labs";
import { consults } from "@/lib/mock/consults";
import {
  ME_PROVIDER,
  NOW,
  queueFor,
  overdueEscalations,
  isResolved,
  sortQueue,
  slaState,
  formatSla,
} from "@/lib/escalations/queue";
import { monitoringSummary, monitoringWorklist } from "@/lib/clinical/monitoring";
import { MonitoringWorklist } from "@/components/clinic/MonitoringWorklist";
import { TrajectoryBoard } from "@/components/clinic/TrajectoryBoard";
import SafetyWatch from "@/components/clinic/SafetyWatch";
import { triageScore } from "@/lib/aiInsights";
import { alphaScore } from "@/lib/alphaScore";
import { locationName } from "@/lib/mock/locations";
import { staffName, staffMap } from "@/lib/mock/staff";
import { formatTime, relativeDays, seededRandom, cn } from "@/lib/utils";
import { DashboardCard } from "@/components/DashboardCard";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, EmptyState } from "@/components/ui/primitives";
import { ClientStatusBadge } from "@/components/StatusBadge";
import { RiskBadge } from "@/components/RiskBadge";
import { Monogram } from "@/components/Monogram";
import { Disclaimer } from "@/components/Disclaimer";
import { WhyButton, ProvenanceDrawer } from "@/components/trace/ProvenanceDrawer";
// Revenue, service-mix and lifecycle charts were removed from the clinic
// dashboard: money is an owner's view and now lives only on the exec console and
// /analytics. A clinician's morning screen is clinical, not financial.
import { Stagger, StaggerItem } from "@/components/motion";
import type { Client, LocationId } from "@/lib/types";
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
  PenLine,
  Stethoscope,
  ChevronDown,
  Signature,
  CalendarClock,
} from "lucide-react";

/**
 * The clinician's command center.
 *
 * Ranking here is the whole design. The screen this replaces opened on revenue,
 * which is a real number that no provider can act on between two patients. What
 * a clinician needs at 8am, in order:
 *
 *   1. WHO IS WAITING ON ME — escalations past SLA, recommendations unsigned,
 *      consult notes unreviewed. Work that is blocked on this person's signature.
 *   2. TODAY — the schedule they cannot reorder but must anticipate.
 *   3. WHAT LOOKS WRONG — abnormal panels and risk flags that nobody has queued
 *      yet, because the dangerous item is the one no workflow has picked up.
 *
 * Practice-wide business metrics still exist — an owner opens this app too — but
 * they live behind a disclosure at the bottom. Nothing is deleted; it is ranked.
 */

const APPT_TONE: Record<string, "neutral" | "optimal" | "gold" | "info"> = {
  Completed: "optimal",
  "Checked In": "gold",
  Scheduled: "info",
  "No Show": "neutral",
};

/**
 * Deterministic delta + 7-point sparkline for a KPI, derived from the value and
 * a seed (which includes the active location) so it tracks the filter.
 *
 * SEEDED ILLUSTRATION — NOT A TREND. The audit named this (GAP_ANALYSIS P0,
 * "seededRandom sparklines"): the KPI values these decorate are real counts,
 * but the movement is invented. `dir` is passed in per metric, so the sign of
 * every delta was decided by the author rather than by any prior period — Apex
 * stores no history for any of these counters, so there is nothing to compare
 * against. The six preceding sparkline points are interpolation plus jitter.
 *
 * Kept because a bare number reads as a dashboard nobody finished, and deleted
 * movement is its own kind of lie. Labelled instead, at readable size, directly
 * above the grid that renders it — see the notice at the practice-volume block.
 */
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

/**
 * Two different kinds of abnormal, kept separate deliberately.
 *
 * `outOfRef` is outside the lab's own reference band — the thing any EMR would
 * flag. `outOfOptimal` is inside the reference band but outside the range this
 * clinic actually treats to. The second list is the clinic's entire thesis
 * ("we look past 'normal' labs"), so collapsing the two into one count would
 * erase the distinction the provider is here to make.
 */
function labFlags(clientId: string) {
  const labs = getLabsForClient(clientId);
  if (!labs) return null;
  const outOfRef = labs.biomarkers.filter((b) => b.status === "high" || b.status === "low");
  const outOfOptimal = labs.biomarkers.filter((b) => b.status === "watch");
  return { labs, outOfRef, outOfOptimal };
}

export default function DashboardPage() {
  const { locationFilter, role, recStatus, activeStaffId } = useStore();
  const { portal } = usePortal();
  const [whyClient, setWhyClient] = useState<Client | null>(null);

  /**
   * The acting clinician. A Coach or Admin viewing this screen still needs the
   * provider queue to be legible — an empty "waiting on me" would read as "no
   * work exists" rather than "you are not the one it is waiting on" — so we fall
   * back to the medical director and label the panel with whose queue it is.
   */
  const meId = staffMap[activeStaffId]?.canApprove ? activeStaffId : ME_PROVIDER;
  const meName = staffName(meId);
  const isMine = role === "Medical";

  const data = useMemo(() => {
    const inLoc = (loc: LocationId) => locationFilter === "all" || loc === locationFilter;
    // Scoped to the viewer's locations first, then narrowed by the topbar
    // filter — so the command centre's counts, queues and worklists never span
    // locations the staff member may not see. See lib/access/clientScope.ts.
    const cl = visibleClientsForPortal(portal.id).filter((c) => inLoc(c.locationId));
    const mine = cl.filter((c) => c.providerId === meId);

    // --- 1. Waiting on me -------------------------------------------------
    const myEscalations = sortQueue(
      queueFor(meId).filter((e) => {
        const c = getClient(e.clientId);
        return !isResolved(e) && c !== undefined && inLoc(c.locationId);
      }),
      NOW,
    );
    const myOverdue = overdueEscalations(NOW).filter((e) => {
      const c = getClient(e.clientId);
      return e.assignedToStaffId === meId && c !== undefined && inLoc(c.locationId);
    });

    const liveStatus = (id: string, fallback: string) => recStatus[id] ?? fallback;
    const pendingRecs = seededRecommendations.filter((r) => {
      const c = getClient(r.clientId);
      if (!c || !inLoc(c.locationId) || c.providerId !== meId) return false;
      const s = liveStatus(r.id, r.status);
      return s === "draft" || s === "coach reviewed";
    });

    // Consult notes authored by a coach on this provider's panel that nobody has
    // signed. These are the notes a provider is asked to stand behind later.
    const unreviewedConsults = consults
      .filter((c) => {
        if (c.status === "Signed") return false;
        const cl2 = getClient(c.clientId);
        return cl2 !== undefined && inLoc(cl2.locationId) && cl2.providerId === meId;
      })
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

    const waitingOnMe = myEscalations.length + pendingRecs.length + unreviewedConsults.length;

    // --- 2. Today ---------------------------------------------------------
    const appts = todaysAppointments.filter((a) => inLoc(a.locationId));
    const myAppts = appts.filter((a) => a.staffId === meId);

    // --- 3. Abnormal, unqueued -------------------------------------------
    // Ranked by how far outside the lab's own reference band the panel sits,
    // then by triage. A high-risk flag alone is enough to make the list.
    const abnormal = cl
      .map((c) => {
        const f = labFlags(c.id);
        const highFlag = c.riskFlags.some((r) => r.level === "high" || r.level === "moderate");
        return {
          client: c,
          outOfRef: f?.outOfRef.length ?? 0,
          outOfOptimal: f?.outOfOptimal.length ?? 0,
          markers: f?.outOfRef.slice(0, 3) ?? [],
          resultedOn: f?.labs.resultedOn,
          highFlag,
          triage: triageScore(c),
        };
      })
      .filter((x) => x.outOfRef > 0 || x.highFlag)
      .sort(
        (a, b) =>
          b.outOfRef - a.outOfRef ||
          b.triage.score - a.triage.score ||
          b.outOfOptimal - a.outOfOptimal,
      );

    const resultsReady = cl.filter((c) => c.status === "Results Ready").length;

    // --- 4. Monitoring the protocol already committed us to --------------
    // Location-scoped rather than provider-scoped: a lapsed haematocrit is the
    // clinic's failure regardless of whose name is on the chart, and scoping it
    // to one panel is how it becomes nobody's job on the days that provider is
    // not in.
    const monitoring = monitoringWorklist({ locationId: String(locationFilter) });
    const monSummary = monitoringSummary(monitoring);

    // --- Practice volume (owner's numbers, kept but demoted) --------------
    const active = cl.filter((c) => c.status === "Active Protocol").length;
    const newConsults = cl.filter((c) => ["Lead", "Consult Booked"].includes(c.status)).length;
    const overdueFollowUp = cl.filter((c) => c.status === "Follow-Up Due").length;
    const inv = inventory.filter((i) => inLoc(i.locationId));
    const invAlerts = inv.filter((i) => i.status !== "in stock").length;
    const monthlyRevenue = cl.reduce((s, c) => s + c.lifetimeValue, 0) * 0.06 + active * 420 + 18500;
    const inventoryValue = Math.round(inv.reduce((s, i) => s + i.quantity * i.unitCost, 0));

    const activity = recentActivity.filter((e) => {
      const c = getClient(e.clientId);
      return c && inLoc(c.locationId);
    });

    const revByLoc = ["raleigh", "southern-pines", "myrtle-beach", "telehealth"]
      .filter((l) => locationFilter === "all" || l === locationFilter)
      .map((l) => {
        const sub = clients.filter((c) => c.locationId === l);
        return {
          name: locationName(l as LocationId),
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

    const STATUS_COLOR: Record<string, string> = {
      "Active Protocol": "var(--c-optimal)",
      "Results Ready": "var(--chart-brand)",
      "Plan Review": "var(--c-watch)",
      "Follow-Up Due": "var(--c-high)",
      "Labs Ordered": "#38bdf8",
      "Consult Booked": "var(--c-low)",
      Lead: "var(--chart-axis)",
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

    const visitSeed = [38, 42, 51, 47, 56, 22, 9];
    const weeklyVisits = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => ({
      name: d,
      value: Math.max(2, Math.round(visitSeed[i] * (cl.length / 24))),
    }));

    const avgScore = cl.length
      ? Math.round(cl.reduce((s, c) => s + alphaScore(c).score, 0) / cl.length)
      : 0;

    const lf = String(locationFilter);
    const trends = {
      active: trendFor(active, "up", lf + "active"),
      consults: trendFor(newConsults, "up", lf + "consults"),
      results: trendFor(resultsReady, "up", lf + "results"),
      inv: trendFor(invAlerts, "down", lf + "inv"),
      overdue: trendFor(overdueFollowUp, "down", lf + "overdue"),
      rev: trendFor(Math.round(monthlyRevenue / 1000), "up", lf + "rev"),
      invValue: trendFor(Math.round(inventoryValue / 1000), "up", lf + "invval"),
    };

    return {
      myEscalations,
      myOverdue,
      pendingRecs,
      unreviewedConsults,
      waitingOnMe,
      appts,
      myAppts,
      abnormal,
      resultsReady,
      monSummary,
      panel: mine.length,
      active,
      newConsults,
      overdueFollowUp,
      invAlerts,
      monthlyRevenue,
      inventoryValue,
      activity,
      revByLoc,
      serviceMix,
      statusMix,
      weeklyVisits,
      avgScore,
      trends,
      scoreDist: [
        { name: "<55", lo: 0, hi: 55 },
        { name: "55–69", lo: 55, hi: 70 },
        { name: "70–84", lo: 70, hi: 85 },
        { name: "85+", lo: 85, hi: 101 },
      ].map((b) => ({
        name: b.name,
        value: cl.filter((c) => {
          const s = alphaScore(c).score;
          return s >= b.lo && s < b.hi;
        }).length,
      })),
      total: cl.length,
    };
  }, [locationFilter, meId, recStatus]);

  const whyTriage = whyClient ? triageScore(whyClient) : null;
  const whyFlags = whyClient ? labFlags(whyClient.id) : null;

  return (
    <div className="space-y-6">
      {/* Header — no greeting, no exclamation. A masthead, not a welcome. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="label-eyebrow">
            {locationFilter === "all" ? "All locations" : locationName(locationFilter)} · preview data · Friday, June 12, 2026
          </p>
          <h1 className="mt-1 font-display text-title font-bold tracking-tight text-ink-50 sm:text-display">
            Clinical console
          </h1>
          <p className="mt-1 text-body text-ink-400">
            {isMine ? (
              <>
                Signing as <span className="text-ink-200">{meName}</span> · {data.panel} patients on panel
              </>
            ) : (
              <>
                Viewing <span className="text-ink-200">{meName}</span>&apos;s clinical queue as{" "}
                <span className="text-ink-200">{role}</span> — read-only. Signature actions require the
                Medical role.
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 text-detail text-ink-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-optimal" /> System of record · Apex
          </span>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 1. WAITING ON ME                                                  */}
      {/* ---------------------------------------------------------------- */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Signature className="h-4 w-4 text-gold-400" />
          <h2 className="font-display text-heading font-semibold text-ink-50">Waiting on me</h2>
          <Badge tone={data.waitingOnMe > 0 ? "gold" : "optimal"}>{data.waitingOnMe} open</Badge>
          {data.myOverdue.length > 0 && (
            <Badge tone="high">{data.myOverdue.length} past SLA</Badge>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Escalations — the only queue with a clock on it */}
          <div className="h-full">
            <Card className="flex h-full flex-col">
              <CardHeader className="flex items-start justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-gold-400" /> Escalations
                </CardTitle>
                <span className="stat-mono text-body text-ink-200">{data.myEscalations.length}</span>
              </CardHeader>
              <CardContent className="flex-1">
                {data.myEscalations.length === 0 ? (
                  <p className="text-body text-ink-500">Nothing open in your queue.</p>
                ) : (
                  <div className="space-y-2">
                    {data.myEscalations.slice(0, 4).map((e) => {
                      const c = getClient(e.clientId);
                      const sla = slaState(e, NOW);
                      return (
                        <Link
                          key={e.id}
                          href="/clinic/escalations"
                          className="block rounded-xl border border-ink-800 bg-ink-900/40 p-2.5 transition-colors hover:border-ink-700"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-body font-medium text-ink-100">
                              {c ? clientName(c) : e.clientId}
                            </span>
                            <Badge
                              tone={sla === "overdue" ? "high" : sla === "due-soon" ? "watch" : "neutral"}
                            >
                              {formatSla(e, NOW)}
                            </Badge>
                          </div>
                          <p className="mt-1 line-clamp-2 text-detail text-ink-400">{e.question}</p>
                          <p className="mt-1 text-micro text-ink-600">
                            {e.kind} · {e.priority}
                          </p>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
              <div className="px-5 pb-4">
                <Link
                  href="/clinic/escalations"
                  className="focus-ring inline-flex items-center gap-1 text-detail text-gold-300 hover:text-gold-200"
                >
                  Open escalation queue <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </Card>
          </div>

          {/* Recommendations awaiting a signature */}
          <div className="h-full">
            <Card className="flex h-full flex-col">
              <CardHeader className="flex items-start justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-gold-400" /> Unsigned recommendations
                </CardTitle>
                <span className="stat-mono text-body text-ink-200">{data.pendingRecs.length}</span>
              </CardHeader>
              <CardContent className="flex-1">
                {data.pendingRecs.length === 0 ? (
                  <p className="text-body text-ink-500">No recommendations awaiting your approval.</p>
                ) : (
                  <div className="space-y-2">
                    {data.pendingRecs.slice(0, 4).map((r) => {
                      const c = getClient(r.clientId);
                      const flagged = r.contraindicationChecks.filter((x) => !x.passed).length;
                      return (
                        <Link
                          key={r.id}
                          href="/recommendations"
                          className="block rounded-xl border border-ink-800 bg-ink-900/40 p-2.5 transition-colors hover:border-ink-700"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-body font-medium text-ink-100">
                              {c ? clientName(c) : r.clientId}
                            </span>
                            {flagged > 0 ? (
                              <Badge tone="high">{flagged} flag{flagged > 1 ? "s" : ""}</Badge>
                            ) : (
                              <RiskBadge level={r.riskLevel} showLabel={false} />
                            )}
                          </div>
                          <p className="mt-1 truncate text-detail text-ink-400">{r.title}</p>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
              <div className="px-5 pb-4">
                <Link
                  href="/recommendations"
                  className="focus-ring inline-flex items-center gap-1 text-detail text-gold-300 hover:text-gold-200"
                >
                  Open review queue <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </Card>
          </div>

          {/* Consult notes nobody has signed */}
          <div className="h-full">
            <Card className="flex h-full flex-col">
              <CardHeader className="flex items-start justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <PenLine className="h-4 w-4 text-gold-400" /> Unsigned notes
                </CardTitle>
                <span className="stat-mono text-body text-ink-200">{data.unreviewedConsults.length}</span>
              </CardHeader>
              <CardContent className="flex-1">
                {data.unreviewedConsults.length === 0 ? (
                  <p className="text-body text-ink-500">Every note on your panel is signed.</p>
                ) : (
                  <div className="space-y-2">
                    {data.unreviewedConsults.slice(0, 4).map((k) => {
                      const c = getClient(k.clientId);
                      return (
                        <Link
                          key={k.id}
                          href={c ? `/clients/${c.id}` : "#"}
                          className="block rounded-xl border border-ink-800 bg-ink-900/40 p-2.5 transition-colors hover:border-ink-700"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-body font-medium text-ink-100">
                              {c ? clientName(c) : k.clientId}
                            </span>
                            <span className="stat-mono shrink-0 text-micro text-ink-500">
                              {relativeDays(k.startedAt)}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-detail text-ink-400">
                            {k.kind} · {staffName(k.authorId)}
                          </p>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
              <div className="px-5 pb-4">
                <span className="text-micro text-ink-600">
                  Authored by a coach. Unsigned means unattested.
                </span>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 2. TODAY                                                          */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Today&apos;s schedule</CardTitle>
            <div className="flex items-center gap-2">
              <Badge tone="gold">{data.myAppts.length} mine</Badge>
              <Badge>{data.appts.length} clinic-wide</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {data.appts.length === 0 ? (
              <EmptyState icon={<CalendarPlus className="h-6 w-6" />} title="No appointments for this location today" />
            ) : (
              <div className="space-y-1">
                {data.appts.map((a) => {
                  const mineAppt = a.staffId === meId;
                  const href =
                    mineAppt && a.type !== "Lab Draw"
                      ? `/clients/${a.clientId}?tab=consults&new=1`
                      : a.type === "Lab Draw"
                        ? "/clinic/lab-draws"
                        : `/clients/${a.clientId}`;
                  return (
                    <Link
                      key={a.id}
                      href={href}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-ink-850/70",
                        // A provider scans this list for their own name first.
                        // The left rule does that job without adding a filter.
                        mineAppt && "border-l-2 border-gold-500 bg-ink-900/30",
                      )}
                    >
                      <span className="w-16 shrink-0 stat-mono text-detail text-ink-400">{formatTime(a.start)}</span>
                      <span className="h-8 w-px bg-ink-800" />
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-body font-medium text-ink-100">{a.clientName}</span>
                        <span className="block truncate text-detail text-ink-500">
                          {a.type} · {staffName(a.staffId).split(" ").slice(-1)} · {locationName(a.locationId)}
                        </span>
                      </div>
                      <Badge tone={APPT_TONE[a.status]}>{a.status}</Badge>
                      {mineAppt && a.type !== "Lab Draw" && (
                        <span className="hidden shrink-0 items-center gap-1 text-micro font-medium text-gold-300 sm:inline-flex">
                          <PenLine className="h-3 w-3" /> Start note
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Clinician-scoped counters. No revenue, no growth. */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <DashboardCard
            label="Past SLA"
            countTo={data.myOverdue.length}
            icon={<Clock className="h-4 w-4" />}
            hint="Escalations owed an answer"
            accent={data.myOverdue.length > 0}
          />
          <DashboardCard
            label="Results to interpret"
            countTo={data.resultsReady}
            icon={<FlaskConical className="h-4 w-4" />}
            hint="Resulted, not yet reviewed"
          />
          <DashboardCard
            label="Abnormal panels"
            countTo={data.abnormal.length}
            icon={<AlertTriangle className="h-4 w-4" />}
            hint="Outside reference or flagged"
          />
          <DashboardCard
            label="Monitoring overdue"
            countTo={data.monSummary.membersOverdue}
            icon={<CalendarClock className="h-4 w-4" />}
            hint={`${data.monSummary.publishedStandardOverdue} against a published standard`}
            accent={data.monSummary.publishedStandardOverdue > 0}
          />
          <DashboardCard
            label="On my panel"
            countTo={data.panel}
            icon={<Users className="h-4 w-4" />}
            hint={`${data.total} in this view`}
          />
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 3. WHAT WE ALREADY COMMITTED TO                                   */}
      {/* ---------------------------------------------------------------- */}
      {/*
          Above "needs eyes" on purpose. An abnormal panel is work somebody has
          at least seen; a lapsed monitoring interval is work nobody has seen,
          because no human ever created the task. Unqueued and invisible beats
          unqueued and visible for danger, so it is ranked higher.
      */}
      {/*
          SAFETY WATCH — mounted here after the audit found it had ZERO import
          sites anywhere in the repo. `lib/ai/safety.ts` computes urgent
          haematocrit and estradiol-at-both-extremes severity, the component
          renders it correctly, and no route reached either of them. In a
          testosterone product that is the single worst thing to have built and
          not hung on a wall.

          Placed at the head of section 3 rather than in "Waiting on me" for a
          specific reason: section 1 is a triage LIST — items with an owner and
          a clock — and this board shows one member at a time behind a picker.
          Dropping a single-member drill-down into a queue would make the queue
          lie about its own length. It leads section 3 instead, above the
          monitoring worklist, because the ordering there is "what the last
          panel actually said" before "what interval we owe next": an urgent
          haematocrit is a finding in hand, a lapsed interval is a finding we
          have not gone to look for yet.

          Deliberately NOT passed a clientId. The prop exists and suppresses the
          member selector, which is right on a chart page and wrong here — the
          component's own flaggedClients() opens it on somebody who actually has
          an open flag, and the provider keeps the ability to page through.
      */}
      <SafetyWatch />

      <MonitoringWorklist
        locationId={String(locationFilter)}
        actorId={meId}
        actorRole={role}
      />

      {/* Cohort capped at the abnormal list: fitting every marker on every
          panel in the practice is affordable but the board would be forty rows
          long, and the signal is entirely in the first few. */}
      <TrajectoryBoard clientIds={data.abnormal.slice(0, 24).map((x) => x.client.id)} />

      {/* ---------------------------------------------------------------- */}
      {/* 4. NEEDS EYES                                                     */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-gold-400" /> Abnormal, not yet queued
          </CardTitle>
          <Badge tone={data.abnormal.length > 0 ? "watch" : "optimal"}>{data.abnormal.length}</Badge>
        </CardHeader>
        <CardContent>
          {data.abnormal.length === 0 ? (
            <EmptyState title="No out-of-range panels or risk flags in this view" />
          ) : (
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {data.abnormal.slice(0, 8).map((x) => (
                <div
                  key={x.client.id}
                  className="rounded-xl border border-ink-800 bg-ink-900/40 p-3 transition-colors hover:border-ink-700"
                >
                  <div className="flex items-center gap-2.5">
                    <Monogram client={x.client} size="sm" />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/clients/${x.client.id}`}
                        className="block truncate text-body font-medium text-ink-50 hover:text-gold-300"
                      >
                        {clientName(x.client)}
                      </Link>
                      <span className="text-micro text-ink-500">
                        {locationName(x.client.locationId)} · {staffName(x.client.providerId)}
                      </span>
                    </div>
                    {x.client.riskFlags[0] && <RiskBadge level={x.client.riskFlags[0].level} showLabel={false} />}
                  </div>

                  {/* Evidence before conclusion: the actual markers, with the
                      value, not a summary adjective. */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {x.markers.map((m) => (
                      <span
                        key={m.key}
                        className={cn(
                          "stat-mono rounded-md border px-1.5 py-0.5 text-micro",
                          m.status === "high"
                            ? "border-high/30 bg-high/10 text-high"
                            : "border-low/30 bg-low/10 text-low",
                        )}
                      >
                        {m.name} {m.value}
                        <span className="text-ink-500"> / {m.refLow}–{m.refHigh}</span>
                      </span>
                    ))}
                    {x.outOfRef > x.markers.length && (
                      <span className="text-micro text-ink-500">+{x.outOfRef - x.markers.length} more</span>
                    )}
                    {x.outOfRef === 0 && x.highFlag && (
                      <span className="text-micro text-ink-500">
                        Risk flag only — panel is within reference.
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <ClientStatusBadge status={x.client.status} />
                      {x.outOfOptimal > 0 && (
                        <span className="text-micro text-watch">
                          {x.outOfOptimal} sub-optimal within reference
                        </span>
                      )}
                    </div>
                    <WhyButton onClick={() => setWhyClient(x.client)} label="Why ranked here?" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent activity — context, not a task list. */}
      <Card>
        <CardHeader>
          <CardTitle>Recent client activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.activity.slice(0, 8).map((e) => {
              const c = getClient(e.clientId);
              return (
                <Link
                  key={e.id}
                  href={c ? `/clients/${c.id}` : "#"}
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-ink-850/60"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-600" />
                  <span className="min-w-0 flex-1 truncate text-body text-ink-200">
                    <span className="font-medium">{c ? clientName(c) : "Client"}</span>{" "}
                    <span className="text-ink-400">— {e.type}</span>
                  </span>
                  <span className="stat-mono shrink-0 text-micro text-ink-500">{relativeDays(e.at)}</span>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Disclaimer />

      {/* The ranking is answerable. A clinician who disagrees with the order
          should be able to see the inputs, not argue with a black box. */}
      <ProvenanceDrawer
        open={whyClient !== null}
        onClose={() => setWhyClient(null)}
        title={whyClient ? `Attention rank — ${clientName(whyClient)}` : "Attention rank"}
        because={
          whyTriage && whyFlags
            ? [
                ...(whyFlags.outOfRef.length
                  ? [
                      `${whyFlags.outOfRef.length} marker(s) outside the lab reference range: ${whyFlags.outOfRef
                        .slice(0, 4)
                        .map((b) => `${b.name} ${b.value} ${b.unit}`)
                        .join(", ")}`,
                    ]
                  : ["No markers outside the lab reference range."]),
                ...(whyFlags.outOfOptimal.length
                  ? [
                      `${whyFlags.outOfOptimal.length} marker(s) inside reference but outside the optimal window this clinic treats to.`,
                    ]
                  : []),
                ...whyTriage.factors,
              ]
            : whyTriage?.factors
        }
        ruleIds={["triage.v1", "labs.reference-band", "labs.optimal-band"]}
        inputs={
          whyClient && whyTriage
            ? [
                { label: "Triage score", value: `${whyTriage.score} / 100` },
                { label: "Triage level", value: whyTriage.level },
                { label: "Lifecycle status", value: whyClient.status },
                { label: "Risk flags", value: String(whyClient.riskFlags.length) },
                { label: "Outside reference", value: String(whyFlags?.outOfRef.length ?? 0) },
                { label: "Outside optimal", value: String(whyFlags?.outOfOptimal.length ?? 0) },
                { label: "Panel resulted", value: whyFlags?.labs.resultedOn ?? "no panel on file" },
              ]
            : undefined
        }
      />
    </div>
  );
}
