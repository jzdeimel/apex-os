"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Clock, Eye, FlaskConical, ShieldAlert } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle, Select } from "@/components/ui/primitives";
import { FadeIn, Stagger, StaggerItem } from "@/components/motion";
import { Tabs } from "@/components/ui/Tabs";
import { locations, locationName } from "@/lib/mock/locations";
import {
  PANEL_NAMES,
  REVIEW_BREACH_HOURS,
  REVIEW_TARGET_HOURS,
  formatHours,
  turnaroundByPanel,
  turnaroundByProvider,
  turnaroundOverall,
  turnaroundWindow,
  unreviewedWorklist,
  type TurnaroundStat,
} from "@/lib/analytics/labTurnaround";
import { cn, formatDate } from "@/lib/utils";
import type { LocationId } from "@/lib/types";

/**
 * LAB QUALITY — draw → resulted → reviewed.
 *
 * The whole page is arranged around one asymmetry: the first leg belongs to the
 * reference lab and the second belongs to the clinic. So the worklist — the
 * unreviewed panels, ordered by out-of-range markers first — is the default
 * view and sits above every aggregate. The medians are context for the
 * worklist, not the point of the page.
 *
 * The rule the ordering encodes: an eleven-day-old normal panel is an
 * embarrassment; a three-day-old panel with an out-of-range marker is a member
 * who should have had a phone call. A queue sorted by age alone buries the
 * second behind the first.
 */
export default function LabQualityPage() {
  const [locationId, setLocationId] = useState<LocationId | "all">("all");
  const [panelName, setPanelName] = useState<string>("all");
  const [tab, setTab] = useState<"worklist" | "panel" | "provider">("worklist");

  const filter = { locationId, panelName };
  const overall = useMemo(() => turnaroundOverall(filter), [locationId, panelName]);
  const worklist = useMemo(() => unreviewedWorklist(filter), [locationId, panelName]);
  const byPanel = useMemo(() => turnaroundByPanel({ locationId }), [locationId]);
  const byProvider = useMemo(() => turnaroundByProvider(filter), [locationId, panelName]);
  const range = useMemo(() => turnaroundWindow(), []);

  const abnormalOverdue = worklist.filter((r) => r.overdue && r.outOfRangeCount > 0);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <FadeIn>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="label-eyebrow">Quality</p>
            <h1 className="font-display text-2xl font-semibold text-ink-50">
              Lab turnaround &amp; review
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-400">
              A resulted panel nobody has opened is not &ldquo;in progress&rdquo; — it is a
              member with a number in their chart who does not know. This page
              exists for that leg.
            </p>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:w-auto">
            <Select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value as LocationId | "all")}
            >
              <option value="all">All locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.short}
                </option>
              ))}
            </Select>
            <Select value={panelName} onChange={(e) => setPanelName(e.target.value)}>
              <option value="all">All panels</option>
              {PANEL_NAMES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </FadeIn>

      <FadeIn delay={0.04}>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat
            label="Awaiting review"
            value={overall.awaitingReview.toString()}
            hint={`of ${overall.resulted} panels resulted`}
            tone={overall.awaitingReview > 0 ? "watch" : "neutral"}
          />
          <Stat
            label={`Overdue (> ${REVIEW_TARGET_HOURS}h)`}
            value={overall.overdue.toString()}
            hint="Past the clinic's own service commitment."
            tone={overall.overdue > 0 ? "high" : "neutral"}
          />
          <Stat
            label="Overdue with abnormal"
            value={overall.overdueWithAbnormal.toString()}
            hint="Unreviewed and carrying an out-of-range marker. Work these first."
            tone={overall.overdueWithAbnormal > 0 ? "high" : "neutral"}
          />
          <Stat
            label="Median review lag"
            value={formatHours(overall.medianResultToReviewHours)}
            hint="Resulted → reviewed, typical case."
          />
          <Stat
            label="p90 review lag"
            value={formatHours(overall.p90ResultToReviewHours)}
            hint="How badly it behaves when it misbehaves. This is the safety number."
            tone={overall.p90ResultToReviewHours > REVIEW_BREACH_HOURS ? "high" : "watch"}
          />
        </div>
      </FadeIn>

      {abnormalOverdue.length > 0 && (
        <FadeIn delay={0.06}>
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-high/40 bg-high/[0.07] p-4">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-high" />
            <p className="text-sm leading-relaxed text-ink-200">
              <span className="stat-mono text-high">{abnormalOverdue.length}</span>{" "}
              resulted panels are past {REVIEW_TARGET_HOURS}h unreviewed AND carry at
              least one marker outside its reference range. Nothing in the system
              is going to escalate these on its own — that is what makes them the
              quiet risk.
            </p>
          </div>
        </FadeIn>
      )}

      <div className="mt-5">
        <Tabs
          tabs={[
            { id: "worklist", label: "Unreviewed worklist", count: worklist.length },
            { id: "panel", label: "By panel", count: byPanel.length },
            { id: "provider", label: "By provider", count: byProvider.length },
          ]}
          active={tab}
          onChange={(id) => setTab(id as typeof tab)}
        />
      </div>

      {tab === "worklist" && (
        <Card className="mt-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Unreviewed panels</CardTitle>
            <span className="text-xs text-ink-500">
              Out-of-range first, then oldest
            </span>
          </CardHeader>
          <CardContent className="p-0">
            {worklist.length === 0 ? (
              <p className="p-5 text-sm text-ink-400">
                Nothing awaiting review in this filter.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-ink-700/60 text-left">
                      <Th className="pl-5">Member</Th>
                      <Th>Panel</Th>
                      <Th>Location</Th>
                      <Th>Owning provider</Th>
                      <Th className="text-right">Out of range</Th>
                      <Th className="text-right">Resulted</Th>
                      <Th className="text-right">Waiting</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {worklist.slice(0, 40).map((r) => (
                      <tr
                        key={r.labId}
                        className={cn(
                          "border-b border-ink-800/70",
                          r.breached && "bg-high/[0.05]",
                        )}
                      >
                        <td className="px-4 py-3 pl-5 text-ink-100">{r.clientName}</td>
                        <td className="px-4 py-3 text-ink-300">{r.panelName}</td>
                        <td className="px-4 py-3 text-ink-400">
                          {locationName(r.locationId)}
                        </td>
                        <td className="px-4 py-3 text-ink-300">{r.providerName}</td>
                        <td className="px-4 py-3 text-right">
                          {r.outOfRangeCount > 0 ? (
                            <Badge tone="high">{r.outOfRangeCount}</Badge>
                          ) : (
                            <span className="text-ink-600">—</span>
                          )}
                        </td>
                        <td className="stat-mono px-4 py-3 text-right text-xs text-ink-400">
                          {formatDate(r.resultedAt)}
                        </td>
                        <td
                          className={cn(
                            "stat-mono px-4 py-3 text-right",
                            r.breached ? "text-high" : r.overdue ? "text-watch" : "text-ink-300",
                          )}
                        >
                          {formatHours(r.waitingHours ?? 0)}
                        </td>
                        <td className="px-4 py-3 pr-5">
                          <Link
                            href={`/clients/${r.clientId}`}
                            className="focus-ring inline-flex items-center gap-1 rounded text-xs text-gold-300 hover:text-gold-200"
                          >
                            Chart <ArrowUpRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "panel" && (
        <Stagger className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {byPanel.map((s) => (
            <StaggerItem key={s.key}>
              <StatBlock stat={s} icon={<FlaskConical className="h-4 w-4" />} />
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {tab === "provider" && (
        <Card className="mt-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>By reviewing provider</CardTitle>
            <span className="text-xs text-ink-500">
              Ranked by abandoned panels, not by median
            </span>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-ink-700/60 text-left">
                    <Th className="pl-5">Provider</Th>
                    <Th className="text-right">Resulted</Th>
                    <Th className="text-right">Reviewed</Th>
                    <Th className="text-right">Awaiting</Th>
                    <Th className="text-right">Overdue</Th>
                    <Th className="text-right">Overdue + abnormal</Th>
                    <Th className="text-right">Median lag</Th>
                    <Th className="text-right">p90 lag</Th>
                  </tr>
                </thead>
                <tbody>
                  {byProvider.map((p) => (
                    <tr key={p.providerId} className="border-b border-ink-800/70">
                      <td className="px-4 py-3 pl-5">
                        <span className="text-ink-100">{p.label}</span>
                        {p.credentials && (
                          <span className="ml-2 text-xs text-ink-500">{p.credentials}</span>
                        )}
                      </td>
                      <td className="stat-mono px-4 py-3 text-right text-ink-300">{p.resulted}</td>
                      <td className="stat-mono px-4 py-3 text-right text-ink-300">{p.reviewed}</td>
                      <td className="stat-mono px-4 py-3 text-right text-ink-200">
                        {p.awaitingReview}
                      </td>
                      <td
                        className={cn(
                          "stat-mono px-4 py-3 text-right",
                          p.overdue > 0 ? "text-watch" : "text-ink-600",
                        )}
                      >
                        {p.overdue || "—"}
                      </td>
                      <td
                        className={cn(
                          "stat-mono px-4 py-3 text-right",
                          p.overdueWithAbnormal > 0 ? "text-high" : "text-ink-600",
                        )}
                      >
                        {p.overdueWithAbnormal || "—"}
                      </td>
                      <td className="stat-mono px-4 py-3 text-right text-ink-300">
                        {formatHours(p.medianResultToReviewHours)}
                      </td>
                      <td className="stat-mono px-4 py-3 text-right text-ink-300">
                        {formatHours(p.p90ResultToReviewHours)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Method note — the derivation is stated, not implied. */}
      <div className="mt-5 rounded-2xl border border-ink-700/70 bg-ink-850/60 p-4">
        <div className="flex items-start gap-2.5">
          <Eye className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" />
          <div className="space-y-1.5 text-xs leading-relaxed text-ink-400">
            <p>
              <span className="text-ink-200">Window:</span>{" "}
              <span className="stat-mono">{range.panels}</span> panels collected
              between {formatDate(range.from)} and {formatDate(range.to)}.
            </p>
            <p>
              <span className="text-ink-200">Thresholds:</span> a resulted panel
              is overdue past {REVIEW_TARGET_HOURS}h and breached past{" "}
              {Math.round(REVIEW_BREACH_HOURS / 24)} days. These are Alpha
              Health&rsquo;s own service commitments, not a clinical standard —
              there isn&rsquo;t one for routine outpatient wellness panels.
            </p>
            <p>
              <span className="text-ink-200">Derivation:</span> the source
              dataset stamps a single date per result and carries no review
              timestamp, so the resulted and reviewed times on this page are
              modelled deterministically per panel. They are operational
              timestamps only — no biomarker, reference range or result value is
              altered anywhere in this analysis.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn("label-eyebrow whitespace-nowrap px-4 py-2.5 font-medium", className)}>
      {children}
    </th>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "optimal" | "watch" | "high";
}) {
  const toneClass = {
    neutral: "text-ink-50",
    optimal: "text-optimal",
    watch: "text-watch",
    high: "text-high",
  }[tone];
  return (
    <div className="card p-4">
      <p className="label-eyebrow">{label}</p>
      <p className={cn("stat-mono mt-1 text-2xl", toneClass)}>{value}</p>
      <p className="mt-1 text-[11px] leading-snug text-ink-500">{hint}</p>
    </div>
  );
}

function StatBlock({ stat, icon }: { stat: TurnaroundStat; icon: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-medium text-ink-100">
          <span className="text-ink-500">{icon}</span>
          {stat.label}
        </p>
        <span className="stat-mono text-xs text-ink-500">n={stat.resulted}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Mini label="Draw → result" value={formatHours(stat.medianDrawToResultHours)} />
        <Mini label="Result → review" value={formatHours(stat.medianResultToReviewHours)} />
        <Mini label="p90 review" value={formatHours(stat.p90ResultToReviewHours)} />
        <Mini
          label="Overdue"
          value={stat.overdue.toString()}
          tone={stat.overdue > 0 ? "high" : "neutral"}
        />
      </div>
    </div>
  );
}

function Mini({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "high";
}) {
  return (
    <div>
      <p className="label-eyebrow">{label}</p>
      <p
        className={cn(
          "stat-mono mt-0.5 text-base",
          tone === "high" ? "text-high" : "text-ink-100",
        )}
      >
        {value}
      </p>
    </div>
  );
}
