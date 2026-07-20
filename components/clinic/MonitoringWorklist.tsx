"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  BookOpen,
  CalendarClock,
  ChevronDown,
  CircleSlash,
  ClipboardCheck,
  FlaskConical,
  ShieldCheck,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/primitives";
import { WhyButton, ProvenanceDrawer } from "@/components/trace/ProvenanceDrawer";
import { Monogram } from "@/components/Monogram";
import { LabVelocityPanel } from "@/components/clinic/LabVelocityPanel";
import { useToast } from "@/components/ui/Toast";
import { getClient, clientName } from "@/lib/mock/clients";
import { locationName } from "@/lib/mock/locations";
import { staffName } from "@/lib/mock/staff";
import { appendLedger } from "@/lib/trace/ledger";
import { shortHash } from "@/lib/trace/hash";
import {
  BASIS_LABEL,
  DUE_SOON_DAYS,
  STATUS_LABEL,
  monitoringBecause,
  monitoringInputs,
  monitoringSummary,
  monitoringWorklist,
  type EvidenceBasis,
  type MemberMonitoring,
  type MonitoringItem,
} from "@/lib/clinical/monitoring";
import { cn, formatDate } from "@/lib/utils";

/**
 * MONITORING WORKLIST — who is overdue for the surveillance their protocol
 * already committed the clinic to.
 *
 * Two things make this different from the follow-up list it superficially
 * resembles:
 *
 *  1. NOBODY CREATED THESE TASKS. Every row is derived from an active protocol
 *     item and the absence of a result. There is no queue to maintain and no
 *     way for a member to fall off it by nobody remembering — which is exactly
 *     how members fell off the audited system's version.
 *  2. THE BASIS CHIP IS LOAD-BEARING. Each requirement says whether its
 *     interval comes from a published guideline, from Alpha Health policy, or
 *     from nowhere at all. A provider triaging this list needs to know which of
 *     these rows they are professionally obliged to clear and which are the
 *     clinic's own housekeeping, and no amount of ordering conveys that.
 */

const BASIS_TONE: Record<EvidenceBasis, "optimal" | "gold" | "neutral"> = {
  "published-standard": "optimal",
  "clinic-policy": "gold",
  "no-established-standard": "neutral",
};

const BASIS_ICON: Record<EvidenceBasis, React.ReactNode> = {
  "published-standard": <BookOpen className="h-3 w-3" />,
  "clinic-policy": <ClipboardCheck className="h-3 w-3" />,
  "no-established-standard": <CircleSlash className="h-3 w-3" />,
};

function statusTone(status: MonitoringItem["status"]): "high" | "watch" | "optimal" | "neutral" {
  if (status === "never-done" || status === "overdue") return "high";
  if (status === "due-soon") return "watch";
  if (status === "current") return "optimal";
  return "neutral";
}

export function MonitoringWorklist({
  locationId,
  providerId,
  actorId,
  actorRole,
  limit = 8,
}: {
  locationId?: string;
  providerId?: string;
  /** Who is acting. Ordering writes a ledger row against this identity. */
  actorId: string;
  actorRole: string;
  limit?: number;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [why, setWhy] = React.useState<MonitoringItem | null>(null);
  const [ordered, setOrdered] = React.useState<Record<string, string>>({});
  const [showAll, setShowAll] = React.useState(false);

  const worklist = React.useMemo(
    () => monitoringWorklist({ locationId, providerId }),
    [locationId, providerId],
  );
  const summary = React.useMemo(() => monitoringSummary(worklist), [worklist]);

  /**
   * Ordering the outstanding checks is an event, so it is written before the
   * button changes. The row records exactly which requirements were covered —
   * "ordered monitoring" with no list is unauditable a year later, which is the
   * failure mode the ledger exists to prevent.
   */
  const orderFor = (m: MemberMonitoring) => {
    const client = getClient(m.clientId);
    const due = [...m.overdue, ...m.dueSoon];
    const row = appendLedger({
      actorId,
      actorName: staffName(actorId),
      actorRole,
      action: "create",
      entity: "order",
      entityId: `mon-${m.clientId}`,
      subjectId: m.clientId,
      subjectName: client ? clientName(client) : m.clientId,
      locationId: client?.locationId,
      reason: "Monitoring derived from active protocol — ordered from the clinical console",
      after: {
        status: "Monitoring ordered",
        requirements: due.map((i) => `${i.rule.targetLabel} (${i.rule.id}, ${BASIS_LABEL[i.rule.basis]})`),
        overdue: m.overdue.length,
        dueSoon: m.dueSoon.length,
        worstDaysOverdue: m.worstDaysOverdue,
      },
    });
    setOrdered((o) => ({ ...o, [m.clientId]: row.id }));
    toast("Monitoring ordered — committed to the ledger", {
      desc: `${row.id} · ${shortHash(row.hash)}`,
    });
  };

  const shown = showAll ? worklist : worklist.slice(0, limit);

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-gold-400" /> Monitoring the protocol implies
          </CardTitle>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-500">
            Derived from what each member is actually on. Nobody creates these — the protocol item
            creates the obligation and only a result on file clears it.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Badge tone={summary.membersOverdue > 0 ? "high" : "optimal"}>
            {summary.membersOverdue} overdue
          </Badge>
          <Badge tone={summary.membersDueSoon > 0 ? "watch" : "neutral"}>
            {summary.membersDueSoon} due within {DUE_SOON_DAYS}d
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* The honest headline. When guideline-mandated surveillance is clear,
            saying so is more useful than hiding a zero — and it stops the
            clinic's own cadence from being read as a guideline breach. */}
        <div
          className={cn(
            "grid grid-cols-1 gap-2 rounded-xl border p-3 sm:grid-cols-3",
            summary.publishedStandardOverdue > 0
              ? "border-high/30 bg-high/[0.05]"
              : "border-ink-800 bg-ink-900/40",
          )}
        >
          <Stat
            label="Published standard, overdue"
            value={summary.publishedStandardOverdue}
            tone={summary.publishedStandardOverdue > 0 ? "high" : "optimal"}
            hint={
              summary.publishedStandardOverdue > 0
                ? "Guideline-backed surveillance has lapsed"
                : "Guideline-backed surveillance is current across this view"
            }
          />
          <Stat
            label="Clinic policy, overdue"
            value={summary.clinicPolicyOverdue}
            tone={summary.clinicPolicyOverdue > 0 ? "watch" : "neutral"}
            hint="Our own cadence, labelled as ours"
          />
          <Stat
            label="No published interval"
            value={summary.unscheduledRequirements}
            tone="neutral"
            hint="Requirements Apex will not put a date on"
          />
        </div>

        {worklist.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="h-6 w-6" />}
            title="No monitoring overdue or approaching in this view"
            hint="Every active protocol item's required checks are on file and inside their interval."
          />
        ) : (
          <div className="space-y-2">
            {shown.map((m) => {
              const client = getClient(m.clientId);
              const open = expanded === m.clientId;
              const late = m.overdue.length > 0;
              return (
                <div
                  key={m.clientId}
                  className={cn(
                    "min-w-0 rounded-xl border bg-ink-900/40 transition-colors",
                    late ? "border-high/25" : "border-ink-800",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2.5 p-3">
                    {client && <Monogram client={client} size="sm" />}
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/clients/${m.clientId}`}
                        className="block truncate text-sm font-medium text-ink-50 hover:text-gold-300"
                      >
                        {m.clientName}
                      </Link>
                      <span className="block truncate text-[11px] text-ink-500">
                        {client ? `${locationName(client.locationId)} · ${staffName(client.providerId)}` : m.clientId}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {late ? (
                        <Badge tone="high">{m.worstDaysOverdue}d overdue</Badge>
                      ) : (
                        <Badge tone="watch">due soon</Badge>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpanded(open ? null : m.clientId)}
                        aria-expanded={open}
                      >
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
                        {m.items.length} requirement{m.items.length === 1 ? "" : "s"}
                      </Button>
                    </div>
                  </div>

                  {/* Collapsed summary line: the single worst finding, in words. */}
                  {!open && (m.overdue[0] ?? m.dueSoon[0]) && (
                    <p className="px-3 pb-3 text-xs leading-relaxed text-ink-400">
                      {(m.overdue[0] ?? m.dueSoon[0]).line}
                    </p>
                  )}

                  {open && (
                    <div className="animate-fade-in space-y-2 border-t border-ink-800 p-3">
                      {m.items.map((item) => (
                        <RequirementRow key={item.id} item={item} onWhy={() => setWhy(item)} />
                      ))}

                      {/* Trajectory for the marker actually in question — the
                          monitoring answer and the trend answer belong in one
                          place, because "draw it again" and "here is why" are
                          the same conversation. */}
                      <TrajectoryFor member={m} />

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={Boolean(ordered[m.clientId])}
                          onClick={() => orderFor(m)}
                        >
                          <FlaskConical className="h-3.5 w-3.5" />
                          {ordered[m.clientId] ? "Ordered" : "Order outstanding monitoring"}
                        </Button>
                        {ordered[m.clientId] && (
                          <span className="stat-mono text-[11px] text-ink-500">
                            {ordered[m.clientId]} written to the ledger
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {worklist.length > limit && (
              <Button variant="outline" size="sm" onClick={() => setShowAll((s) => !s)}>
                {showAll ? "Show fewer" : `Show all ${worklist.length} members`}
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <ProvenanceDrawer
        open={why !== null}
        onClose={() => setWhy(null)}
        title={why ? `${why.rule.targetLabel} — monitoring requirement` : "Monitoring requirement"}
        because={why ? monitoringBecause(why) : undefined}
        ruleIds={why ? [why.rule.id] : []}
        inputs={why ? monitoringInputs(why) : undefined}
      />
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: "high" | "watch" | "optimal" | "neutral";
  hint: string;
}) {
  const colour = {
    high: "text-high",
    watch: "text-watch",
    optimal: "text-optimal",
    neutral: "text-ink-300",
  }[tone];
  // min-w-0 so a long hint wraps instead of forcing the grid wider than the
  // viewport — this grid has bitten us at 390px before.
  return (
    <div className="min-w-0">
      <p className="label-eyebrow break-words">{label}</p>
      <p className={cn("stat-mono mt-1 font-display text-xl font-bold", colour)}>{value}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500">{hint}</p>
    </div>
  );
}

function RequirementRow({ item, onWhy }: { item: MonitoringItem; onWhy: () => void }) {
  const tone = statusTone(item.status);
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border p-2.5",
        tone === "high" ? "border-high/25 bg-high/[0.05]" : "border-ink-800 bg-ink-950/30",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-100">{item.rule.targetLabel}</p>
          <p className="mt-0.5 text-[11px] text-ink-500">
            {item.therapyName}
            {item.from.specificity === "program-category" && (
              <span className="text-ink-600"> · inferred from a program, not a dispensed product</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Badge tone={BASIS_TONE[item.rule.basis]}>
            {BASIS_ICON[item.rule.basis]}
            {BASIS_LABEL[item.rule.basis]}
          </Badge>
          <Badge tone={tone}>{STATUS_LABEL[item.status]}</Badge>
        </div>
      </div>

      <p className="mt-1.5 text-xs leading-relaxed text-ink-300">{item.line}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-500">
        <span>
          Interval: <span className="text-ink-400">{item.rule.windowLabel}</span>
        </span>
        {item.lastDoneOn && (
          <span>
            Last: <span className="stat-mono text-ink-400">{formatDate(`${item.lastDoneOn}T12:00:00`)}</span>
            {item.lastValue && <span className="stat-mono text-ink-400"> · {item.lastValue}</span>}
          </span>
        )}
        {item.nextDueOn && (
          <span>
            Next due: <span className="stat-mono text-ink-400">{formatDate(`${item.nextDueOn}T12:00:00`)}</span>
          </span>
        )}
        <WhyButton onClick={onWhy} label="Why?" />
      </div>

      {/* The guideline figure, quoted rather than applied. */}
      {item.rule.guidelineNote && (
        <p className="mt-2 rounded-md border border-ink-800 bg-ink-950/50 px-2 py-1.5 text-[11px] leading-relaxed text-ink-500">
          {item.rule.guidelineNote}
        </p>
      )}
    </div>
  );
}

/**
 * The trend behind the requirement.
 *
 * Only lab-source requirements get one — there is no velocity to compute for a
 * body-composition scan through this engine — and only the first, because a
 * member three checks behind does not need three charts to make the point.
 */
function TrajectoryFor({ member }: { member: MemberMonitoring }) {
  const target = [...member.overdue, ...member.dueSoon, ...member.items].find(
    (i) => i.rule.source === "lab" && i.rule.target !== "—",
  );
  if (!target) return null;
  return (
    <div className="min-w-0 pt-1">
      <p className="label-eyebrow mb-1.5 flex items-center gap-1.5">
        <Activity className="h-3 w-3" /> Trajectory of {target.rule.targetLabel}
      </p>
      <LabVelocityPanel clientId={member.clientId} markerKey={target.rule.target} />
    </div>
  );
}
