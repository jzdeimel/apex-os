"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ClipboardList,
  Clock3,
  GraduationCap,
  Plus,
  ShieldAlert,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { locations, locationName } from "@/lib/mock/locations";
import { staffName } from "@/lib/mock/staff";
import {
  ALLOWED_TRANSITIONS,
  RESOLUTION_TARGET_DAYS,
  SEVERITY_DEFINITION,
  SEVERITY_ORDER,
  SEVERITY_TONE,
  addAction,
  ageDays,
  clientMap,
  fileIncident,
  filterIncidents,
  incidentStats,
  isOverdue,
  reportingLagDays,
  transitionIncident,
  type Incident,
  type IncidentKind,
  type IncidentSeverity,
  type IncidentStatus,
} from "@/lib/ops/incidents";
import {
  attestStep,
  onboardingSummary,
  teamOnboarding,
  type CoachOnboarding,
  type StepStatus,
} from "@/lib/ops/onboarding";
import { clientName } from "@/lib/mock/clients";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import type { LocationId } from "@/lib/types";

/**
 * INCIDENTS & READINESS.
 *
 * The audit surface. Two things an auditor asks for in the first ten minutes —
 * "show me your incident log" and "show me what you trained your coaches on" —
 * and neither is a thing anyone demos.
 *
 * Ordering is severity-first then OLDEST-first, not newest-first. A work queue
 * sorted by recency re-buries the row that has already been ignored longest,
 * which is the mechanism by which a three-week-old high-severity item stays
 * three weeks old.
 */
const KINDS: IncidentKind[] = [
  "Clinical safety",
  "Medication / protocol error",
  "Privacy / PHI",
  "Member complaint",
  "Billing dispute",
  "Facility / equipment",
  "Staff conduct",
  "Supply / cold chain",
];

export default function IncidentsPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"log" | "readiness">("log");

  // Mutations below append to a module-level array; this counter forces the
  // recompute. The demo has no store — in production these are queries.
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  const [status, setStatus] = useState<IncidentStatus | "all" | "open">("open");
  const [severity, setSeverity] = useState<IncidentSeverity | "all">("all");
  const [kind, setKind] = useState<IncidentKind | "all">("all");
  const [locationId, setLocationId] = useState<LocationId | "all">("all");
  const [filing, setFiling] = useState(false);
  const [sessionAttested, setSessionAttested] = useState<Record<string, Set<string>>>({});

  const rows = useMemo(
    () => filterIncidents({ status, severity, kind, locationId }),
    [status, severity, kind, locationId, version],
  );
  const stats = useMemo(() => incidentStats(), [version]);
  const team = useMemo(() => teamOnboarding(sessionAttested), [sessionAttested]);
  const readiness = useMemo(() => onboardingSummary(team), [team]);

  function move(inc: Incident, to: IncidentStatus) {
    const reason = window.prompt(
      `Reason for moving ${inc.id} to "${to}". This is recorded on the ledger and cannot be edited later.`,
    );
    if (!reason) return;
    try {
      const { ledger } = transitionIncident(inc.id, to, reason);
      bump();
      toast(`${inc.id} → ${to}`, { desc: `Ledger row ${ledger.id}.`, tone: "success" });
    } catch (e) {
      toast("Transition rejected", {
        desc: e instanceof Error ? e.message : "Illegal state change.",
        tone: "warn",
      });
    }
  }

  function act(inc: Incident) {
    const detail = window.prompt(`What was done about ${inc.id}?`);
    if (!detail) return;
    try {
      const { ledger } = addAction(inc.id, detail);
      bump();
      toast("Action recorded", { desc: `Ledger row ${ledger.id}.`, tone: "success" });
    } catch (e) {
      toast("Not recorded", {
        desc: e instanceof Error ? e.message : "Action requires a description.",
        tone: "warn",
      });
    }
  }

  function attest(coachId: string, step: StepStatus) {
    try {
      const ledger = attestStep(coachId, step.step.id);
      setSessionAttested((prev) => {
        const next = { ...prev };
        next[coachId] = new Set(next[coachId] ?? []).add(step.step.id);
        return next;
      });
      toast("Attested", { desc: `Ledger row ${ledger.id}.`, tone: "success" });
    } catch (e) {
      toast("Cannot attest", {
        desc: e instanceof Error ? e.message : "Step is evidenced by certification.",
        tone: "warn",
      });
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        <p className="label-eyebrow">Compliance</p>
        <h1 className="font-display text-title font-semibold text-ink-50">
          Incidents &amp; coach readiness
        </h1>
        <p className="mt-1 max-w-2xl text-body text-ink-400">
          Nothing here is edited in place. Every state change, action and
          severity reclassification appends a hash-chained ledger row carrying
          the before and the after.
        </p>

      <div className="mt-5">
        <Tabs
          tabs={[
            { id: "log", label: "Incident log", count: stats.open },
            { id: "readiness", label: "Coach readiness", count: readiness.blocked },
          ]}
          active={tab}
          onChange={(id) => setTab(id as typeof tab)}
        />
      </div>

      {tab === "log" && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Stat label="Open" value={stats.open} hint={`of ${stats.total} on file`} />
            <Stat
              label="Overdue"
              value={stats.overdue}
              hint="Past the resolution target for its severity."
              tone={stats.overdue > 0 ? "high" : "neutral"}
            />
            <Stat
              label="Open critical / high"
              value={stats.criticalOpen}
              hint="Harm occurred, or was avoided by chance."
              tone={stats.criticalOpen > 0 ? "high" : "neutral"}
            />
            <Stat
              label="Median reporting lag"
              value={`${stats.medianReportingLagDays}d`}
              hint="Occurrence to filing. A culture measure, not a process one."
            />
            <Stat
              label="Filed late"
              value={stats.lateFiled}
              hint="More than a day after the event happened."
              tone={stats.lateFiled > 0 ? "watch" : "neutral"}
            />
          </div>

          <Card className="mt-4">
            <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
              <Select value={status} onChange={(e) => setStatus(e.target.value as never)}>
                <option value="open">Open only</option>
                <option value="all">All statuses</option>
                <option value="Open">Open</option>
                <option value="Under review">Under review</option>
                <option value="Action taken">Action taken</option>
                <option value="Escalated">Escalated</option>
                <option value="Resolved">Resolved</option>
              </Select>
              <Select value={severity} onChange={(e) => setSeverity(e.target.value as never)}>
                <option value="all">All severities</option>
                {SEVERITY_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
              <Select value={kind} onChange={(e) => setKind(e.target.value as never)}>
                <option value="all">All types</option>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
              <Select value={locationId} onChange={(e) => setLocationId(e.target.value as never)}>
                <option value="all">All locations</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.short}
                  </option>
                ))}
              </Select>
              <Button variant="outline" onClick={() => setFiling((v) => !v)}>
                <Plus className="h-3.5 w-3.5" />
                File incident
              </Button>
            </CardContent>
          </Card>

          {filing && (
            <FileIncidentForm
              onDone={(msg) => {
                setFiling(false);
                bump();
                toast("Incident filed", { desc: msg, tone: "success" });
              }}
            />
          )}

          <div className="mt-4 flex flex-col gap-3">
            {rows.map((inc) => (
              <div key={inc.id}>
                <IncidentRow inc={inc} onMove={move} onAct={act} />
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-ink-700/70 bg-ink-850/60 p-4">
            <p className="label-eyebrow">Severity definitions</p>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
              {SEVERITY_ORDER.map((s) => (
                <div key={s} className="flex items-start gap-2.5">
                  <Badge tone={SEVERITY_TONE[s]}>{s}</Badge>
                  <p className="text-detail leading-relaxed text-ink-400">
                    {SEVERITY_DEFINITION[s]} Target resolution:{" "}
                    <span className="stat-mono text-ink-300">
                      {RESOLUTION_TARGET_DAYS[s]}d
                    </span>
                    .
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-detail leading-relaxed text-ink-500">
              Severity is assigned by a person, not computed from the incident
              type — a missed appointment is trivial unless the member had an
              out-of-range panel, and only a human knows which one this is.
              Changing it is its own logged act with the old and new value on the
              row.
            </p>
          </div>
        </>
      )}

      {tab === "readiness" && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Coaches" value={readiness.coaches} hint="On the roster." />
            <Stat
              label="Cleared for caseload"
              value={readiness.ready}
              hint="Every blocking step complete."
              tone={readiness.ready === readiness.coaches ? "optimal" : "neutral"}
            />
            <Stat
              label="Blocked"
              value={readiness.blocked}
              hint="Holding members without a complete blocking step."
              tone={readiness.blocked > 0 ? "high" : "neutral"}
            />
            <Stat
              label="Lapsed certifications"
              value={readiness.lapsedCerts}
              hint="Steps that reopened on their own when a badge expired."
              tone={readiness.lapsedCerts > 0 ? "watch" : "neutral"}
            />
          </div>

          <div className="mt-4 flex flex-col gap-3">
            {team.map((c) => (
              <div key={c.coachId}>
                <CoachCard coach={c} onAttest={attest} />
              </div>
            ))}
          </div>

          <p className="mt-4 text-detail leading-relaxed text-ink-500">
            Certification steps cannot be ticked. They are derived from a passed,
            unexpired quiz attempt, and they reopen on their own when the annual
            certification lapses — a checklist where completion is permanent will
            show a fully-onboarded coach whose scope-of-practice badge expired
            eight months ago.
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
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
      <p className={cn("stat-mono mt-1 text-title", toneClass)}>{value}</p>
      <p className="mt-1 text-micro leading-snug text-ink-500">{hint}</p>
    </div>
  );
}

function IncidentRow({
  inc,
  onMove,
  onAct,
}: {
  inc: Incident;
  onMove: (inc: Incident, to: IncidentStatus) => void;
  onAct: (inc: Incident) => void;
}) {
  const [open, setOpen] = useState(false);
  const overdue = isOverdue(inc);
  const lag = reportingLagDays(inc);
  const client = inc.clientId ? clientMap[inc.clientId] : undefined;

  return (
    <Card className={cn(overdue && "border-high/40")}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="stat-mono text-detail text-ink-500">{inc.id}</span>
              <Badge tone={SEVERITY_TONE[inc.severity]}>{inc.severity}</Badge>
              <Badge tone="neutral">{inc.kind}</Badge>
              <Badge tone={inc.status === "Resolved" ? "optimal" : "info"}>{inc.status}</Badge>
              {overdue && (
                <Badge tone="high">
                  Overdue · {ageDays(inc)}d open vs {RESOLUTION_TARGET_DAYS[inc.severity]}d target
                </Badge>
              )}
            </div>
            <p className="mt-2 text-body leading-relaxed text-ink-100">{inc.summary}</p>
            <p className="mt-1.5 text-detail text-ink-500">
              Occurred {formatDateTime(inc.at)} · filed {formatDateTime(inc.reportedAt)}
              {lag > 0 && (
                <span className={cn("ml-1", lag > 1 ? "text-watch" : "text-ink-500")}>
                  ({lag}d lag)
                </span>
              )}{" "}
              · {locationName(inc.locationId)} · reported by {staffName(inc.reportedBy)}
              {client && (
                <>
                  {" · "}
                  <Link
                    href={`/clients/${client.id}`}
                    className="focus-ring inline-flex items-center gap-0.5 rounded text-gold-300 hover:text-gold-200"
                  >
                    {clientName(client)} <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </>
              )}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
              <ClipboardList className="h-3.5 w-3.5" />
              {inc.actions.length} action{inc.actions.length === 1 ? "" : "s"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onAct(inc)}>
              Record action
            </Button>
            {ALLOWED_TRANSITIONS[inc.status].map((to) => (
              <Button
                key={to}
                size="sm"
                variant={to === "Resolved" ? "success" : "secondary"}
                onClick={() => onMove(inc, to)}
              >
                {to}
              </Button>
            ))}
          </div>
        </div>

        {open && (
          <div className="mt-3 border-t border-ink-700/60 pt-3">
            {inc.actions.length === 0 ? (
              <p className="text-detail text-ink-500">
                No actions recorded. &ldquo;We addressed it&rdquo; is not a record.
              </p>
            ) : (
              <ul className="space-y-2">
                {inc.actions.map((a) => (
                  <li key={a.id} className="flex items-start gap-2.5 text-detail">
                    <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-600" />
                    <span className="text-ink-300">
                      <span className="stat-mono text-ink-500">{formatDate(a.at)}</span> ·{" "}
                      <span className="text-ink-200">{a.byName}</span> — {a.detail}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {inc.resolvedAt && (
              <p className="mt-2 text-detail text-optimal">
                Resolved {formatDateTime(inc.resolvedAt)}.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FileIncidentForm({ onDone }: { onDone: (msg: string) => void }) {
  const { toast } = useToast();
  const [kind, setKind] = useState<IncidentKind>("Member complaint");
  const [severity, setSeverity] = useState<IncidentSeverity>("low");
  const [locationId, setLocationId] = useState<LocationId>("raleigh");
  const [summary, setSummary] = useState("");

  function submit() {
    try {
      const { incident, ledger } = fileIncident({ kind, severity, locationId, summary });
      onDone(`${incident.id} · ledger row ${ledger.id}`);
      setSummary("");
    } catch (e) {
      toast("Not filed", {
        desc: e instanceof Error ? e.message : "An incident requires a summary.",
        tone: "warn",
      });
    }
  }

  return (
    <Card className="mt-3">
      <CardHeader>
        <CardTitle>File an incident</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select value={kind} onChange={(e) => setKind(e.target.value as IncidentKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Select>
          <Select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
          >
            {SEVERITY_ORDER.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value as LocationId)}
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.short}
              </option>
            ))}
          </Select>
        </div>
        <p className="text-detail text-ink-400">{SEVERITY_DEFINITION[severity]}</p>
        <Textarea
          rows={3}
          placeholder="What happened. Facts only — this record is read years later by people who were not there."
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={submit} disabled={!summary.trim()}>
            <ShieldAlert className="h-3.5 w-3.5" />
            File
          </Button>
          <span className="text-detail text-ink-500">
            Filing stamps the occurrence time as now. Backdating is not offered.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function CoachCard({
  coach,
  onAttest,
}: {
  coach: CoachOnboarding;
  onAttest: (coachId: string, step: StepStatus) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card className={cn(!coach.readyForCaseload && "border-high/40")}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <GraduationCap className="h-4 w-4 text-ink-500" />
              <span className="font-display text-body font-semibold text-ink-50">
                {coach.coachName}
              </span>
              <Badge tone={coach.readyForCaseload ? "optimal" : "high"}>
                {coach.readyForCaseload ? "Cleared for caseload" : "Blocked"}
              </Badge>
              {coach.overdue.length > 0 && (
                <Badge tone="watch">{coach.overdue.length} overdue</Badge>
              )}
            </div>
            <p className="mt-1.5 text-detail text-ink-500">
              Started {formatDate(coach.startedOn)} ·{" "}
              <span className="stat-mono">{coach.daysSinceStart}</span> days ·{" "}
              <span className="stat-mono">{coach.completeCount}</span>/
              <span className="stat-mono">{coach.totalCount}</span> steps complete
            </p>
            {!coach.readyForCaseload && (
              <p className="mt-1.5 text-detail text-high">
                Blocking:{" "}
                {coach.blockingOutstanding.map((s) => s.step.title).join(", ")}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="stat-mono text-heading text-ink-200">{coach.percent}%</span>
            <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
              {open ? "Hide" : "Checklist"}
            </Button>
          </div>
        </div>

        {open && (
          <ul className="mt-3 space-y-2 border-t border-ink-700/60 pt-3">
            {coach.steps.map((s) => (
              <li
                key={s.step.id}
                className="flex flex-col gap-2 rounded-xl border border-ink-700/60 bg-ink-900/40 p-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-body text-ink-100">{s.step.title}</span>
                    <Badge
                      tone={
                        s.state === "complete"
                          ? "optimal"
                          : s.state === "lapsed" || s.state === "overdue"
                            ? "high"
                            : "neutral"
                      }
                    >
                      {s.state}
                    </Badge>
                    {s.step.blocksCaseload && <Badge tone="watch">Blocks caseload</Badge>}
                    <Badge tone="info">{s.step.kind}</Badge>
                  </div>
                  <p className="mt-1 text-detail text-ink-500">{s.step.definitionOfDone}</p>
                  {s.evidence && (
                    <p className="mt-1 text-detail text-ink-400">{s.evidence}</p>
                  )}
                  {s.daysOverdue > 0 && s.state !== "complete" && (
                    <p className="mt-1 text-detail text-watch">
                      <span className="stat-mono">{s.daysOverdue}</span> days past the
                      day-{s.step.dueByDay} target.
                    </p>
                  )}
                </div>
                {s.step.kind === "attested" && s.state !== "complete" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => onAttest(coach.coachId, s)}
                  >
                    Attest
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
