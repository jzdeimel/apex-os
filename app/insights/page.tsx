"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { clients, clientName } from "@/lib/mock/clients";
import { getLabsForClient } from "@/lib/mock/labs";
import { rankByTriage, nextBestAction, triageScore } from "@/lib/aiInsights";
import { Card, CardHeader, CardTitle, CardContent, Badge } from "@/components/ui/primitives";
import { Monogram } from "@/components/Monogram";
import { AiLabel, Disclaimer } from "@/components/Disclaimer";
import { WhyButton, ProvenanceDrawer } from "@/components/trace/ProvenanceDrawer";
import { CountBars, ScatterStat, DonutCount } from "@/components/charts";
import { locationName } from "@/lib/mock/locations";
import { staffName } from "@/lib/mock/staff";
import { cn, formatDate } from "@/lib/utils";
import type { Biomarker, Client } from "@/lib/types";
import {
  Gauge,
  Users,
  ArrowRight,
  FlaskConical,
  TrendingUp,
  TrendingDown,
  Activity,
} from "lucide-react";

/**
 * Population clinical insight.
 *
 * This screen used to answer marketing questions — goal mix, lifecycle funnel,
 * churn risk. Those are real questions, but they belong to whoever owns the P&L.
 * A clinician looking at a population asks four things instead:
 *
 *   What is prevalent?      → abnormal-marker prevalence across the cohort
 *   Who needs me?           → attention distribution and the ranked list
 *   Who is getting worse?   → markers drifting away from the optimal window
 *   Is treatment working?   → markers moving toward it on active protocols
 *
 * Prevalence is split into two columns on purpose. "Outside reference" is what
 * any lab would flag. "Inside reference, outside optimal" is the population this
 * clinic exists to treat and every other system reports as normal.
 */

const TRIAGE_TONE = {
  critical: "high",
  high: "watch",
  medium: "gold",
  low: "neutral",
} as const;

/**
 * How far a value sits outside its optimal window, normalised by the width of
 * that window.
 *
 * Normalising matters: without it, a TSH moving 0.4 mIU/L and a testosterone
 * moving 40 ng/dL are incomparable, and any "who is drifting" ranking becomes a
 * ranking of which markers happen to use large units.
 */
function distanceFromOptimal(b: Biomarker, value: number): number {
  const lo = b.optimalLow ?? b.refLow;
  const hi = b.optimalHigh ?? b.refHigh;
  const span = hi - lo || 1;
  if (value < lo) return (lo - value) / span;
  if (value > hi) return (value - hi) / span;
  return 0;
}

interface Movement {
  client: Client;
  /** Net change in optimal-window distance across the whole panel. + = worse. */
  net: number;
  /** The single marker that moved most, in the direction of `net`. */
  lead?: { marker: Biomarker; delta: number; from: number; to: number };
  resultedOn?: string;
}

/** Trend across each marker's own history. Only markers with ≥2 draws count. */
function movementFor(client: Client): Movement | null {
  const labs = getLabsForClient(client.id);
  if (!labs) return null;

  let net = 0;
  let lead: Movement["lead"];

  for (const b of labs.biomarkers) {
    const h = b.history;
    if (!h || h.length < 2) continue;
    const from = h[0].value;
    const to = h[h.length - 1].value;
    const delta = distanceFromOptimal(b, to) - distanceFromOptimal(b, from);
    if (delta === 0) continue;
    net += delta;
    if (!lead || Math.abs(delta) > Math.abs(lead.delta)) lead = { marker: b, delta, from, to };
  }

  if (!lead) return null;
  return { client, net, lead, resultedOn: labs.resultedOn };
}

export default function InsightsPage() {
  const { locationFilter } = useStore();
  const [whyClient, setWhyClient] = useState<Client | null>(null);

  const data = useMemo(() => {
    const scope = clients.filter((c) => locationFilter === "all" || c.locationId === locationFilter);

    // --- Prevalence -------------------------------------------------------
    // Two counters per marker, kept apart all the way to the table.
    const refCount = new Map<string, number>();
    const optCount = new Map<string, number>();
    let withLabs = 0;
    let anyOutOfRef = 0;
    let anyOutOfOptimalOnly = 0;

    const burden = new Map<string, number>();

    for (const c of scope) {
      const labs = getLabsForClient(c.id);
      if (!labs) continue;
      withLabs += 1;

      let ref = 0;
      let opt = 0;
      for (const b of labs.biomarkers) {
        if (b.status === "high" || b.status === "low") {
          ref += 1;
          refCount.set(b.name, (refCount.get(b.name) ?? 0) + 1);
        } else if (b.status === "watch") {
          opt += 1;
          optCount.set(b.name, (optCount.get(b.name) ?? 0) + 1);
        }
      }
      burden.set(c.id, ref + opt);
      if (ref > 0) anyOutOfRef += 1;
      else if (opt > 0) anyOutOfOptimalOnly += 1;
    }

    const markerNames = Array.from(new Set([...refCount.keys(), ...optCount.keys()]));
    const prevalence = markerNames
      .map((name) => ({
        name,
        ref: refCount.get(name) ?? 0,
        opt: optCount.get(name) ?? 0,
        total: (refCount.get(name) ?? 0) + (optCount.get(name) ?? 0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // --- Attention --------------------------------------------------------
    const triage = rankByTriage(scope);
    const needsClinician = triage.filter((t) => t.level === "critical" || t.level === "high").length;
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

    // Clinical axes only: how abnormal the panel is, against how urgently a
    // human is needed. Upper-right is a sick patient nobody has reached yet.
    const scatter = scope
      .filter((c) => burden.has(c.id))
      .map((c) => ({
        x: Math.min(100, (burden.get(c.id) ?? 0) * 10),
        y: triageScore(c).score,
        name: clientName(c),
      }));

    // --- Movement ---------------------------------------------------------
    const movements = scope
      .map(movementFor)
      .filter((m): m is Movement => m !== null && m.lead !== undefined);

    const drifting = movements.filter((m) => m.net > 0).sort((a, b) => b.net - a.net);
    const responding = movements
      .filter((m) => m.net < 0 && m.client.status === "Active Protocol")
      .sort((a, b) => a.net - b.net);

    const onProtocol = scope.filter((c) => c.status === "Active Protocol").length;
    const respondingOnProtocol = movements.filter(
      (m) => m.client.status === "Active Protocol" && m.net < 0,
    ).length;

    return {
      scope,
      withLabs,
      anyOutOfRef,
      anyOutOfOptimalOnly,
      prevalence,
      triage,
      needsClinician,
      triageLevels,
      scatter,
      drifting,
      responding,
      onProtocol,
      respondingOnProtocol,
      total: scope.length,
    };
  }, [locationFilter]);

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  const whyTriage = whyClient ? triageScore(whyClient) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="label-eyebrow">
            Population insight · {locationFilter === "all" ? "all locations" : locationName(locationFilter)}
          </p>
          <h1 className="mt-1 font-display text-title font-bold tracking-tight text-ink-50 sm:text-display">
            Cohort clinical picture
          </h1>
          <p className="mt-1 max-w-2xl text-body text-ink-400">
            Prevalence, attention load and protocol response across {data.total} patients in view.
            Every figure below is a count of patients, not of encounters or revenue.
          </p>
        </div>
        <AiLabel />
      </div>

      {/* Cohort counters — the four numbers that frame everything else. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CohortStat
          label="Panels on file"
          value={data.withLabs}
          hint={`of ${data.total} patients in view`}
          icon={<FlaskConical className="h-4 w-4" />}
        />
        <CohortStat
          label="Outside reference"
          value={data.anyOutOfRef}
          hint={`${pct(data.anyOutOfRef, data.withLabs)}% of panels — any lab would flag these`}
          icon={<Activity className="h-4 w-4" />}
          tone="high"
        />
        <CohortStat
          label="Normal, not optimal"
          value={data.anyOutOfOptimalOnly}
          hint={`${pct(data.anyOutOfOptimalOnly, data.withLabs)}% inside reference, outside optimal`}
          icon={<Gauge className="h-4 w-4" />}
          tone="watch"
        />
        <CohortStat
          label="Need a clinician"
          value={data.needsClinician}
          hint="Critical + high attention triage"
          icon={<Users className="h-4 w-4" />}
          tone="gold"
        />
      </div>

      <Disclaimer compact />

      {/* ------------------------------------------------------------------ */}
      {/* PREVALENCE                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-gold-400" /> Abnormal-marker prevalence
            </CardTitle>
            <Badge>{data.withLabs} panels</Badge>
          </CardHeader>
          <CardContent>
            {data.prevalence.length === 0 ? (
              <p className="text-body text-ink-500">No resulted panels in this view.</p>
            ) : (
              <>
                <CountBars
                  data={data.prevalence.map((m) => ({ name: m.name.split(" ")[0], value: m.total }))}
                  height={220}
                  label="Patients"
                />
                {/* The split is the point. Charting only the total would hide the
                    half of the cohort every other system calls healthy. */}
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[320px] text-detail">
                    <thead>
                      <tr className="text-left text-ink-500">
                        <th className="pb-1.5 font-medium">Marker</th>
                        <th className="pb-1.5 text-right font-medium">Out of ref</th>
                        <th className="pb-1.5 text-right font-medium">Not optimal</th>
                        <th className="pb-1.5 text-right font-medium">% cohort</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.prevalence.map((m) => (
                        <tr key={m.name} className="border-t border-ink-800">
                          <td className="py-1.5 pr-2 text-ink-200">{m.name}</td>
                          <td className="stat-mono py-1.5 text-right text-high">{m.ref}</td>
                          <td className="stat-mono py-1.5 text-right text-watch">{m.opt}</td>
                          <td className="stat-mono py-1.5 text-right text-ink-400">
                            {pct(m.total, data.withLabs)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-gold-400" /> Attention distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DonutCount
              data={data.triageLevels}
              height={210}
              centerValue={data.total}
              centerLabel="patients"
            />
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {data.triageLevels.map((t) => (
                <div key={t.name} className="flex items-center gap-2 text-micro">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: t.color }} />
                  <span className="flex-1 truncate capitalize text-ink-400">{t.name}</span>
                  <span className="stat-mono text-ink-500">{t.value}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-micro leading-relaxed text-ink-500">
              Attention level is a workload signal, not a diagnosis. It rises with lifecycle status,
              documented risk flags and unsigned work — not with lab severity alone.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* DRIFT vs RESPONSE                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-high" /> Drifting out of range
            </CardTitle>
            <Badge tone={data.drifting.length > 0 ? "high" : "optimal"}>{data.drifting.length}</Badge>
          </CardHeader>
          <CardContent>
            {data.drifting.length === 0 ? (
              <p className="text-body text-ink-500">No patient panels are moving away from optimal.</p>
            ) : (
              <div className="space-y-2">
                {data.drifting.slice(0, 6).map((m) => (
                  <MovementRow key={m.client.id} m={m} direction="worse" />
                ))}
              </div>
            )}
            <p className="mt-3 text-micro leading-relaxed text-ink-500">
              Movement is measured against each marker&apos;s own optimal window across its draw
              history, so markers in different units are comparable.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-optimal" /> Protocol response
            </CardTitle>
            <Badge tone="optimal">
              {data.respondingOnProtocol}/{data.onProtocol} on protocol
            </Badge>
          </CardHeader>
          <CardContent>
            {data.responding.length === 0 ? (
              <p className="text-body text-ink-500">
                No active-protocol patients show markers moving toward optimal yet.
              </p>
            ) : (
              <div className="space-y-2">
                {data.responding.slice(0, 6).map((m) => (
                  <MovementRow key={m.client.id} m={m} direction="better" />
                ))}
              </div>
            )}
            <p className="mt-3 text-micro leading-relaxed text-ink-500">
              Restricted to patients on an active protocol. Improvement without a protocol is not
              protocol response, and reporting it as such would overstate what the clinic did.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* WHO NEEDS A CLINICIAN                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-gold-400" /> Ranked by attention need
            </CardTitle>
            <Badge>rule-based · reviewable</Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.triage.slice(0, 8).map((t) => {
                const c = t.client;
                const nba = nextBestAction(c);
                return (
                  <div
                    key={c.id}
                    className="rounded-xl border border-ink-800 bg-ink-900/40 p-3 transition-colors hover:border-ink-700"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative grid h-11 w-11 shrink-0 place-items-center">
                        <svg className="h-11 w-11 -rotate-90" viewBox="0 0 36 36">
                          <circle cx="18" cy="18" r="15.5" fill="none" stroke="#23272d" strokeWidth="3" />
                          <circle
                            cx="18"
                            cy="18"
                            r="15.5"
                            fill="none"
                            stroke={
                              t.level === "critical" ? "#f87171" : t.level === "high" ? "#e0bd6e" : "#e93d3d"
                            }
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeDasharray={`${(t.score / 100) * 97.4} 97.4`}
                          />
                        </svg>
                        <span className="absolute stat-mono text-detail font-bold text-ink-100">{t.score}</span>
                      </div>
                      <Monogram client={c} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/clients/${c.id}`}
                            className="truncate text-body font-medium text-ink-50 hover:text-gold-300"
                          >
                            {clientName(c)}
                          </Link>
                          <Badge tone={TRIAGE_TONE[t.level]}>{t.level}</Badge>
                        </div>
                        <span className="block truncate text-micro text-ink-500">
                          {locationName(c.locationId)} · {c.status} · {staffName(c.providerId)}
                        </span>
                      </div>
                      <Link
                        href={`/clients/${c.id}`}
                        className="focus-ring shrink-0 rounded-lg p-1 text-ink-600 hover:text-ink-200"
                        aria-label={`Open chart for ${clientName(c)}`}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>

                    {/* Drivers before the suggestion — same rule as the review
                        queue. The suggestion is worth less than its reasons. */}
                    {t.factors.length > 0 && (
                      <p className="mt-2 text-micro leading-relaxed text-ink-400">
                        <span className="text-ink-500">Drivers: </span>
                        {t.factors.join(" · ")}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2 text-detail">
                        <span className="text-ink-500">Suggested owner</span>
                        <Badge tone="neutral">{nba.owner}</Badge>
                        <span className="truncate text-ink-300">{nba.action}</span>
                      </div>
                      <WhyButton onClick={() => setWhyClient(c)} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-gold-400" /> Burden vs attention
            </CardTitle>
            <Badge>per patient</Badge>
          </CardHeader>
          <CardContent>
            <ScatterStat
              data={data.scatter}
              xLabel="Abnormal marker burden"
              yLabel="Attention score"
              height={260}
            />
            <p className="mt-2 text-micro leading-relaxed text-ink-500">
              Upper-right: an abnormal panel that no workflow has picked up. Lower-right is the
              quieter failure — a genuinely abnormal panel that scores low because nothing about the
              patient&apos;s status is overdue.
            </p>
          </CardContent>
        </Card>
      </div>

      <ProvenanceDrawer
        open={whyClient !== null}
        onClose={() => setWhyClient(null)}
        title={whyClient ? `Attention score — ${clientName(whyClient)}` : "Attention score"}
        because={whyTriage?.factors}
        ruleIds={["triage.v1"]}
        inputs={
          whyClient && whyTriage
            ? [
                { label: "Score", value: `${whyTriage.score} / 100` },
                { label: "Level", value: whyTriage.level },
                { label: "Status", value: whyClient.status },
                { label: "Plan status", value: whyClient.planStatus },
                { label: "Risk flags", value: String(whyClient.riskFlags.length) },
                { label: "Latest panel", value: whyClient.latestLabDate ?? "none on file" },
              ]
            : undefined
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function CohortStat({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  tone?: "neutral" | "high" | "watch" | "gold";
}) {
  const ring = {
    neutral: "border-ink-700 bg-ink-900/50 text-ink-400",
    high: "border-high/30 bg-high/10 text-high",
    watch: "border-watch/30 bg-watch/10 text-watch",
    gold: "border-gold-400/30 bg-gold-400/[0.06] text-gold-300",
  }[tone];
  return (
    <div className="card flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="label-eyebrow">{label}</span>
        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg border", ring)}>
          {icon}
        </span>
      </div>
      <span className="stat-mono mt-3 font-display text-title font-bold text-ink-50">
        {value}
      </span>
      <span className="mt-1 text-detail leading-snug text-ink-500">{hint}</span>
    </div>
  );
}

function MovementRow({ m, direction }: { m: Movement; direction: "worse" | "better" }) {
  const lead = m.lead!;
  const b = lead.marker;
  const lo = b.optimalLow ?? b.refLow;
  const hi = b.optimalHigh ?? b.refHigh;
  return (
    <Link
      href={`/clients/${m.client.id}`}
      className="block rounded-xl border border-ink-800 bg-ink-900/40 p-3 transition-colors hover:border-ink-700"
    >
      <div className="flex items-center gap-2.5">
        <Monogram client={m.client} size="sm" />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-body font-medium text-ink-100">
            {clientName(m.client)}
          </span>
          <span className="block truncate text-micro text-ink-500">
            {locationName(m.client.locationId)} · panel {formatDate(m.resultedOn)}
          </span>
        </div>
        <Badge tone={direction === "worse" ? "high" : "optimal"}>
          {direction === "worse" ? "+" : ""}
          {m.net.toFixed(2)}
        </Badge>
      </div>
      {/* The lead marker with its actual numbers — a clinician should never have
          to open the chart to find out which marker moved. */}
      <p className="mt-1.5 text-micro text-ink-400">
        <span className="text-ink-200">{b.name}</span>{" "}
        <span className="stat-mono">
          {lead.from} → {lead.to} {b.unit}
        </span>{" "}
        <span className="text-ink-600">
          (optimal {lo}–{hi})
        </span>
      </p>
    </Link>
  );
}
