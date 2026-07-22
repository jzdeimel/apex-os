"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  Filter,
  MapPin,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Select,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { locations, locationName } from "@/lib/mock/locations";
import { appendLedger } from "@/lib/trace/ledger";
import { VIEWER } from "@/lib/viewer";
import { cn } from "@/lib/utils";
import {
  CHECKS,
  CHECK_BY_ID,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  runRosterHealth,
  scoreBand,
  type CheckId,
  type Finding,
  type Severity,
} from "@/lib/roster/health";
import type { LocationId } from "@/lib/types";

/**
 * ROSTER HEALTH.
 *
 * The design constraint that shapes this entire page: every finding is one
 * click from its fix. The audited system's version of this page renders the
 * same findings as dead text, which costs roughly six navigations per fix and
 * is the reason its report has been growing for a year without ever being
 * worked.
 *
 * So: the whole row is a link to the client record, and any finding with an
 * unambiguous correction carries an inline resolve button that appends a
 * ledger row without leaving the page. Nothing here is a dead end.
 */

/** How many findings render per severity bucket before "show all". */
const PAGE_SIZE = 25;

export default function RosterHealthPage() {
  const { toast } = useToast();
  const [locationId, setLocationId] = useState<LocationId | "all">("all");
  const [checkId, setCheckId] = useState<CheckId | "all">("all");
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<Severity>>(new Set());

  const health = useMemo(
    () => runRosterHealth({ locationId, checkId, severity, resolvedIds: resolved }),
    [locationId, checkId, severity, resolved],
  );

  const band = scoreBand(health.score);

  function resolve(finding: Finding) {
    const fix = finding.inlineFix;
    if (!fix) return;

    // A data correction on a patient record is a chart change. It gets an
    // attributable ledger row with a real before/after diff — the same
    // treatment a clinical edit gets, because six months from now nobody will
    // remember that this one was "just a data fix".
    appendLedger({
      actorId: VIEWER.id,
      actorName: VIEWER.name,
      actorRole: VIEWER.role,
      action: "update",
      entity: "chart",
      entityId: finding.clientId,
      subjectId: finding.clientId,
      subjectName: finding.clientName,
      ...(finding.locationId ? { locationId: finding.locationId } : {}),
      reason: `Roster health: ${CHECK_BY_ID[finding.checkId].label}`,
      before: fix.before,
      after: fix.after,
    });

    setResolved((prev) => new Set(prev).add(finding.id));
    toast(fix.resolution, {
      desc: `${finding.clientName} · ledger row written`,
      tone: "success",
    });
  }

  const activeFilters =
    (locationId !== "all" ? 1 : 0) +
    (checkId !== "all" ? 1 : 0) +
    (severity !== "all" ? 1 : 0);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header ------------------------------------------------------------ */}
        <p className="label-eyebrow">OPERATIONS</p>
        <h1 className="mt-1 font-display text-title font-semibold tracking-tight text-ink-50">
          Roster health
        </h1>
        <p className="mt-1 text-body text-ink-400">
          Every gap in the client base that will cost someone something later — each one
          a single click from the record that fixes it.
        </p>

      {/* Score + counts ---------------------------------------------------- */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="flex items-center gap-5 p-5">
            <ScoreRing score={health.score} color={band.color} />
            <div className="min-w-0">
              <p className="label-eyebrow">Health score</p>
              <p className="mt-1 font-display text-heading font-semibold" style={{ color: band.color }}>
                {band.label}
              </p>
              <p className="mt-1 text-detail text-ink-400">
                <span className="stat-mono text-ink-200">{health.clientsAffected}</span> of{" "}
                <span className="stat-mono text-ink-200">{health.clientsScanned}</span> records
                carry a finding
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
            {health.bySeverity.map((bucket) => (
              <button
                key={bucket.severity}
                onClick={() =>
                  setSeverity((s) => (s === bucket.severity ? "all" : bucket.severity))
                }
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors focus-ring",
                  severity === bucket.severity
                    ? "border-gold-400/40 bg-gold-400/10"
                    : "border-ink-700/70 bg-ink-900/40 hover:border-ink-600",
                )}
              >
                <p className="label-eyebrow">{SEVERITY_LABEL[bucket.severity]}</p>
                <p className="stat-mono mt-1 text-title font-semibold text-ink-50">
                  {bucket.findings.length}
                </p>
                <p className="mt-0.5 text-micro text-ink-500">
                  {bucket.severity === "critical"
                    ? "Someone is unreachable or unowned"
                    : bucket.severity === "warning"
                      ? "Care or scheduling will misroute"
                      : "Churn risk, cheap to fix now"}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Filters ----------------------------------------------------------- */}
      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label-eyebrow mb-1.5 block">Location</label>
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
            </div>
            <div className="lg:col-span-2">
              <label className="label-eyebrow mb-1.5 block">Check</label>
              <Select
                value={checkId}
                onChange={(e) => setCheckId(e.target.value as CheckId | "all")}
              >
                <option value="all">All checks</option>
                {health.countsByCheck.map(({ check, count }) => (
                  <option key={check.id} value={check.id}>
                    {check.label} ({count})
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setLocationId("all");
                  setCheckId("all");
                  setSeverity("all");
                }}
                disabled={activeFilters === 0}
              >
                <Filter className="h-3.5 w-3.5" />
                Clear {activeFilters > 0 ? `(${activeFilters})` : ""}
              </Button>
            </div>
          </div>

          {checkId !== "all" && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-ink-700/70 bg-ink-900/50 p-3">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-300" />
              <p className="text-detail text-ink-300">
                <span className="font-medium text-ink-100">Why this matters. </span>
                {CHECK_BY_ID[checkId].whyItMatters}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Findings ---------------------------------------------------------- */}
      {health.findings.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<CheckCircle2 className="h-6 w-6" />}
            title="Nothing to fix here"
            hint={
              activeFilters > 0
                ? "No findings match these filters. Clear them to see the whole roster."
                : "Every record in scope has an owner, a way to reach them, and a current plan."
            }
          />
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {health.bySeverity
            .filter((b) => b.findings.length > 0)
            .map((bucket) => {
              const isOpen = expanded.has(bucket.severity);
              const shown = isOpen ? bucket.findings : bucket.findings.slice(0, PAGE_SIZE);
              return (
                <section key={bucket.severity}>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <SeverityIcon severity={bucket.severity} />
                    <h2 className="font-display text-heading font-semibold text-ink-50">
                      {SEVERITY_LABEL[bucket.severity]}
                    </h2>
                    <Badge tone={SEVERITY_TONE[bucket.severity]}>
                      <span className="stat-mono">{bucket.findings.length}</span>
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    {shown.map((f) => (
                      <div key={f.id}>
                        <FindingRow finding={f} onResolve={resolve} />
                      </div>
                    ))}
                  </div>

                  {bucket.findings.length > PAGE_SIZE && (
                    <div className="mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setExpanded((prev) => {
                            const next = new Set(prev);
                            if (next.has(bucket.severity)) next.delete(bucket.severity);
                            else next.add(bucket.severity);
                            return next;
                          })
                        }
                      >
                        {isOpen
                          ? "Show fewer"
                          : `Show all ${bucket.findings.length}`}
                      </Button>
                    </div>
                  )}
                </section>
              );
            })}
        </div>
      )}

      <p className="mt-8 text-detail text-ink-500">
        Scanned {health.clientsScanned} client records against {CHECKS.length} checks. Inline
        resolutions append an attributable row to the audit ledger; nothing here mutates a
        record without one.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function FindingRow({
  finding,
  onResolve,
}: {
  finding: Finding;
  onResolve: (f: Finding) => void;
}) {
  const check = CHECK_BY_ID[finding.checkId];

  return (
    <div className="card card-hover group relative overflow-hidden">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        {/* The whole identity block is the link to the fix. */}
        <Link
          href={finding.fixHref}
          className="focus-ring min-w-0 flex-1 rounded-lg"
          aria-label={`Open ${finding.clientName} to fix: ${check.label}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink-50 group-hover:text-gold-200">
              {finding.clientName}
            </span>
            <span className="stat-mono text-micro text-ink-500">{finding.mrn}</span>
            <Badge tone={SEVERITY_TONE[finding.severity]}>{check.label}</Badge>
            <span className="inline-flex items-center gap-1 text-micro text-ink-500">
              <MapPin className="h-3 w-3" />
              {finding.locationId ? locationName(finding.locationId) : "No location"}
            </span>
          </div>

          <p className="mt-1.5 text-body text-ink-300">{finding.detail}</p>

          <p className="mt-1 text-detail text-ink-500">
            <span className="text-ink-400">Why it matters. </span>
            {check.whyItMatters}
          </p>
        </Link>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          {finding.inlineFix && (
            <Button
              variant="success"
              size="sm"
              onClick={() => onResolve(finding)}
              className="w-full sm:w-auto"
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              {finding.inlineFix.label}
            </Button>
          )}
          <Link href={finding.fixHref} className="w-full sm:w-auto">
            <Button variant="outline" size="sm" className="w-full">
              {check.fixLabel}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function SeverityIcon({ severity }: { severity: Severity }) {
  if (severity === "critical")
    return <ShieldAlert className="h-4 w-4 shrink-0 text-high" />;
  if (severity === "warning")
    return <AlertTriangle className="h-4 w-4 shrink-0 text-watch" />;
  return <Sparkles className="h-4 w-4 shrink-0 text-ink-400" />;
}

// ---------------------------------------------------------------------------
// Score ring
// ---------------------------------------------------------------------------

function ScoreRing({ score, color }: { score: number; color: string }) {
  const size = 84;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * circ;

  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--chart-grid)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
        />
      </svg>
      <span className="stat-mono absolute text-title font-bold text-ink-50">{score}</span>
    </div>
  );
}
