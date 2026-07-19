"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { seededRecommendations } from "@/lib/mock/recommendations";
import { getClient, clientName } from "@/lib/mock/clients";
import { providers, staffName } from "@/lib/mock/staff";
import { locations } from "@/lib/mock/locations";
import { recommendationRules } from "@/lib/rules";
import { appendLedger } from "@/lib/trace/ledger";
import { shortHash, sha256, canonicalJson } from "@/lib/trace/hash";
import type { ProvenanceStamp } from "@/lib/consult/types";
import { WhyButton, ProvenanceDrawer } from "@/components/trace/ProvenanceDrawer";
import { RecStatusBadge } from "@/components/StatusBadge";
import { RiskBadge } from "@/components/RiskBadge";
import { PeptideIcon } from "@/components/PeptideIcon";
import { AiLabel, Disclaimer } from "@/components/Disclaimer";
import { useToast } from "@/components/ui/Toast";
import {
  Card,
  CardContent,
  Select,
  Button,
  Badge,
  Textarea,
  EmptyState,
} from "@/components/ui/primitives";
import { cn, formatDate } from "@/lib/utils";
import type {
  Recommendation,
  RecommendationStatus,
  RiskLevel,
  RecommendationRule,
} from "@/lib/types";
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  Package,
  PackageX,
  Target,
  FlaskConical,
  Activity,
  CheckCircle2,
  XCircle,
  StickyNote,
  ListPlus,
  AlertTriangle,
  Lock,
} from "lucide-react";

/**
 * The review queue, as a decision surface.
 *
 * The person on this screen is legally accountable for every row they approve.
 * Three consequences shape the whole page:
 *
 *  - EVIDENCE COMES FIRST, LITERALLY. The labs, symptoms and goals that fired
 *    the rule are rendered above the proposal, not behind a "show details"
 *    toggle. A conclusion presented before its evidence invites agreement;
 *    evidence presented first invites judgement.
 *  - THE SCREEN IS NEVER HIDDEN. Contraindication checks always render, passes
 *    included. "What did you check?" is a question this provider will be asked
 *    under oath, and "the ones that failed" is not an answer.
 *  - CONFIDENCE NEVER APPEARS ALONE. A bare 78% is a number a clinician can
 *    neither verify nor defend. It always ships with the rule baseline and the
 *    adjustments that moved it.
 *
 * Red (gold-*) is reserved for signature. If it is red on this page, a licensed
 * human is being asked to put their name on something.
 */

/** The rule that produced a recommendation — ids are `rec-<clientId>-<ruleId>`. */
function ruleFor(rec: Recommendation): RecommendationRule | undefined {
  return recommendationRules.find((r) => rec.id.endsWith(r.id));
}

/**
 * What actually drove the number.
 *
 * Confidence in this engine is a rule's published baseline plus deterministic
 * bumps for corroborating findings. Saying so is the difference between a score
 * a provider can audit and one they have to take on faith.
 */
function confidenceBasis(rec: Recommendation, rule?: RecommendationRule): string[] {
  const out: string[] = [];
  if (rule) {
    out.push(`Rule baseline ${rule.defaultConfidence.toFixed(2)} — ${rule.name}`);
    const delta = Math.round((rec.confidence - rule.defaultConfidence) * 100) / 100;
    if (delta > 0) out.push(`+${delta.toFixed(2)} corroborating findings beyond the minimum trigger`);
    if (delta < 0) out.push(`${delta.toFixed(2)} weakened by missing inputs`);
  } else {
    out.push("No published rule baseline resolved for this recommendation.");
  }
  const labs = rec.supporting.labs.length;
  const sx = rec.supporting.symptoms.length;
  out.push(
    labs > 0
      ? `${labs} lab value(s) on file support the trigger`
      : "No lab values support this — goal and symptom driven only",
  );
  if (sx > 0) out.push(`${sx} reported symptom(s) align with the pattern`);
  const flagged = rec.contraindicationChecks.filter((c) => !c.passed).length;
  if (flagged > 0) {
    out.push(`${flagged} contraindication check(s) FAILED — confidence does not account for this`);
  }
  return out;
}

/**
 * The stamp the engine would have written had it stamped its own output.
 *
 * Derived rather than stored, because the input hash has to be over the exact
 * inputs the rule consumed — the labs, symptoms and goals — not over the
 * conclusion. Re-running the engine at this version against these inputs
 * reproduces this recommendation, which is the only claim that matters a year
 * from now when someone asks why it was signed.
 */
function stampFor(rec: Recommendation, signedBy?: string): ProvenanceStamp {
  return {
    engine: "recommendationEngine",
    engineVersion: "1.0",
    inputHash: sha256(
      canonicalJson({
        clientId: rec.clientId,
        triggeredBy: rec.triggeredBy,
        supporting: rec.supporting,
      }),
    ),
    computedAt: rec.generatedOn,
    computedBy: signedBy ?? "system",
  };
}

export default function RecommendationsPage() {
  const { locationFilter, recStatus, setRecStatus, role, activeStaffId } = useStore();
  const [risk, setRisk] = useState<string>("all");
  const [provider, setProvider] = useState<string>("all");
  const [status, setStatus] = useState<string>("pending");
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  // Bulk approve is a two-stage commitment. Stage is deliberately page-level so
  // it resets whenever the filter changes the set being signed.
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkAck, setBulkAck] = useState(false);

  const { toast } = useToast();
  const canApprove = role === "Medical";

  const liveStatus = (recId: string, fallback: RecommendationStatus) => recStatus[recId] ?? fallback;

  const filtered = useMemo(() => {
    return seededRecommendations.filter((r) => {
      const client = getClient(r.clientId);
      if (!client) return false;
      if (locationFilter !== "all" && client.locationId !== locationFilter) return false;
      if (risk !== "all" && r.riskLevel !== risk) return false;
      if (provider !== "all" && client.providerId !== provider) return false;
      if (flaggedOnly && r.contraindicationChecks.every((c) => c.passed)) return false;
      const s = liveStatus(r.id, r.status);
      if (status === "pending" && !(s === "draft" || s === "coach reviewed")) return false;
      if (status !== "pending" && status !== "all" && s !== status) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationFilter, risk, provider, status, flaggedOnly, recStatus]);

  const stats = useMemo(() => {
    const all = seededRecommendations.map((r) => liveStatus(r.id, r.status));
    return {
      total: seededRecommendations.length,
      pending: all.filter((s) => s === "draft" || s === "coach reviewed").length,
      approved: all.filter((s) => s === "provider approved").length,
      declined: all.filter((s) => s === "declined").length,
      highRisk: seededRecommendations.filter(
        (r) => r.riskLevel === "high" || r.riskLevel === "moderate",
      ).length,
      flagged: seededRecommendations.filter((r) =>
        r.contraindicationChecks.some((c) => !c.passed),
      ).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recStatus]);

  /** The set a bulk signature would actually commit — never "everything". */
  const bulkTargets = useMemo(
    () => filtered.filter((r) => liveStatus(r.id, r.status) !== "provider approved"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, recStatus],
  );
  const bulkFlagged = bulkTargets.filter((r) => r.contraindicationChecks.some((c) => !c.passed));
  const bulkHighRisk = bulkTargets.filter((r) => r.riskLevel === "high" || r.riskLevel === "moderate");

  /**
   * One signature = one ledger row. The row is committed before the UI moves,
   * so there is no window in which a status changed and the audit trail did not.
   */
  const commit = (
    rec: Recommendation,
    next: "provider approved" | "declined",
    reason?: string,
  ) => {
    const client = getClient(rec.clientId);
    const before = liveStatus(rec.id, rec.status);
    const row = appendLedger({
      actorId: activeStaffId,
      actorName: staffName(activeStaffId),
      actorRole: role,
      action: next === "provider approved" ? "approve" : "decline",
      entity: "recommendation",
      entityId: rec.id,
      subjectId: client?.id,
      subjectName: client ? clientName(client) : undefined,
      locationId: client?.locationId,
      ...(reason ? { reason } : {}),
      before: { status: before },
      after: {
        status: next,
        confidence: rec.confidence,
        riskLevel: rec.riskLevel,
        contraindicationFlags: rec.contraindicationChecks.filter((c) => !c.passed).length,
      },
    });
    setRecStatus(rec.id, next);
    return row;
  };

  const approveOne = (rec: Recommendation, reason?: string) => {
    const row = commit(rec, "provider approved", reason);
    toast("Signed — committed to the ledger", {
      desc: `${row.id} · ${shortHash(row.hash)}`,
    });
  };

  const declineOne = (rec: Recommendation, reason?: string) => {
    const row = commit(rec, "declined", reason);
    toast("Declined — committed to the ledger", {
      desc: `${row.id} · ${shortHash(row.hash)}`,
      tone: "info",
    });
  };

  const bulkApprove = () => {
    if (!canApprove || !bulkAck || bulkTargets.length === 0) return;
    const rows = bulkTargets.map((r) =>
      commit(r, "provider approved", `Batch signature over ${bulkTargets.length} recommendations`),
    );
    const first = rows[0];
    const last = rows[rows.length - 1];
    toast(`Signed ${rows.length} recommendations`, {
      desc: `Ledger ${first.id} → ${last.id} · ${shortHash(last.hash)}`,
      tone: "warn",
    });
    setBulkOpen(false);
    setBulkAck(false);
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="label-eyebrow">Review queue · licensed provider signature required</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink-50">
          Recommendations
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-400">
          Every row below is a rule firing on this patient&apos;s labs, symptoms and goals. Nothing
          here is a prescription and nothing carries a dose — a provider decides what happens next,
          and that decision is written to the ledger.
        </p>
      </div>

      {/* Queue state — counts a clinician acts on, not growth metrics. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <QueueStat label="Awaiting signature" value={stats.pending} icon={<Clock className="h-4 w-4" />} tone="gold" hint="Draft + coach reviewed" />
        <QueueStat label="Contraindication flags" value={stats.flagged} icon={<ShieldAlert className="h-4 w-4" />} tone={stats.flagged > 0 ? "high" : "neutral"} hint="At least one check failed" />
        <QueueStat label="Moderate / high risk" value={stats.highRisk} icon={<AlertTriangle className="h-4 w-4" />} tone="watch" hint="Elevated review burden" />
        <QueueStat label="Signed / declined" value={stats.approved + stats.declined} icon={<ShieldCheck className="h-4 w-4" />} tone="neutral" hint={`${stats.total} generated in total`} />
      </div>

      <Disclaimer />

      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid flex-1 grid-cols-1 gap-2.5 sm:grid-cols-3 lg:max-w-2xl">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="pending">Awaiting signature</option>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="coach reviewed">Coach reviewed</option>
            <option value="provider approved">Provider approved</option>
            <option value="declined">Declined</option>
          </Select>
          <Select value={risk} onChange={(e) => setRisk(e.target.value)} aria-label="Risk level">
            <option value="all">All risk levels</option>
            {(["none", "low", "moderate", "high"] as RiskLevel[]).map((r) => (
              <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)} risk</option>
            ))}
          </Select>
          <Select value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Provider">
            <option value="all">All providers</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{staffName(p.id)}</option>
            ))}
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="focus-ring inline-flex cursor-pointer items-center gap-2 rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-ink-300">
            <input
              type="checkbox"
              checked={flaggedOnly}
              onChange={(e) => setFlaggedOnly(e.target.checked)}
              className="h-3.5 w-3.5 accent-[#e93d3d]"
            />
            Flagged checks only
          </label>
          <Badge>{filtered.length} in queue</Badge>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* BULK SIGNATURE — deliberately more friction than signing one      */}
      {/* ---------------------------------------------------------------- */}
      <div className="rounded-2xl border border-ink-700/70 bg-ink-900/40 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-100">Batch signature</p>
            <p className="mt-0.5 text-xs text-ink-500">
              Signing ten things at once should not be easier than signing one. This requires an
              explicit attestation.
            </p>
          </div>
          {!bulkOpen ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!canApprove || bulkTargets.length === 0}
              onClick={() => setBulkOpen(true)}
              title={
                canApprove
                  ? "Review the batch before signing"
                  : "Switch to the Medical role to sign"
              }
            >
              <Lock className="h-3.5 w-3.5" />
              Review batch ({bulkTargets.length})
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => { setBulkOpen(false); setBulkAck(false); }}>
              Cancel
            </Button>
          )}
        </div>

        {bulkOpen && (
          <div className="mt-4 animate-fade-in space-y-3 rounded-xl border border-gold-400/25 bg-gold-400/[0.05] p-4">
            <p className="text-sm text-ink-100">
              You are about to sign{" "}
              <span className="stat-mono font-semibold text-gold-300">{bulkTargets.length}</span>{" "}
              recommendations across{" "}
              <span className="stat-mono">{new Set(bulkTargets.map((r) => r.clientId)).size}</span>{" "}
              patients.
            </p>

            {/* The two facts that make a batch dangerous, stated before consent. */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs",
                  bulkFlagged.length > 0
                    ? "border-high/30 bg-high/10 text-high"
                    : "border-ink-700 bg-ink-900/50 text-ink-400",
                )}
              >
                <span className="stat-mono font-semibold">{bulkFlagged.length}</span> in this batch
                have a FAILED contraindication check
              </div>
              <div className="rounded-lg border border-ink-700 bg-ink-900/50 px-3 py-2 text-xs text-ink-400">
                <span className="stat-mono font-semibold text-watch">{bulkHighRisk.length}</span> are
                moderate or high risk
              </div>
            </div>

            {bulkFlagged.length > 0 && (
              <div className="rounded-lg border border-high/25 bg-ink-900/50 p-3">
                <p className="label-eyebrow">Flagged patients in this batch</p>
                <ul className="mt-1.5 space-y-1">
                  {bulkFlagged.slice(0, 6).map((r) => {
                    const c = getClient(r.clientId);
                    return (
                      <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                        <Link
                          href={c ? `/clients/${c.id}` : "#"}
                          className="font-medium text-ink-100 hover:text-gold-300"
                        >
                          {c ? clientName(c) : r.clientId}
                        </Link>
                        <span className="text-high">
                          {r.contraindicationChecks.filter((x) => !x.passed).map((x) => x.label).join(", ")}
                        </span>
                      </li>
                    );
                  })}
                  {bulkFlagged.length > 6 && (
                    <li className="text-xs text-ink-500">+{bulkFlagged.length - 6} more</li>
                  )}
                </ul>
              </div>
            )}

            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-200">
              <input
                type="checkbox"
                checked={bulkAck}
                onChange={(e) => setBulkAck(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#e93d3d]"
              />
              <span>
                I have reviewed each of these {bulkTargets.length} recommendations individually and
                I am signing them as {staffName(activeStaffId)}.
              </span>
            </label>

            <Button
              variant="primary"
              size="md"
              disabled={!canApprove || !bulkAck || bulkTargets.length === 0}
              onClick={bulkApprove}
            >
              <ShieldCheck className="h-4 w-4" />
              Sign {bulkTargets.length} recommendations
            </Button>
          </div>
        )}
      </div>

      {role !== "Medical" && (
        <p className="text-xs text-ink-500">
          You are viewing as <span className="text-ink-300">{role}</span>. Approval is restricted to
          the <span className="text-gold-300">Medical</span> role (top bar). You may still decline
          and annotate.
        </p>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-6 w-6" />}
          title="No recommendations match these filters"
          hint="Widen the status, risk or location filter."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filtered.map((r) => (
            <DecisionCard
              key={r.id}
              rec={r}
              status={liveStatus(r.id, r.status)}
              canApprove={canApprove}
              onApprove={(reason) => approveOne(r, reason)}
              onDecline={(reason) => declineOne(r, reason)}
              onCoachReviewed={() => setRecStatus(r.id, "coach reviewed")}
            />
          ))}
        </div>
      )}

      <p className="text-[11px] text-ink-600">
        Queue spans {locations.length} locations. Every recommendation is AI-assisted, category-level
        only, and requires review and approval by a licensed provider before any clinical action.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Queue stat — a count with a tone, not a KPI card with a trend line. A
// clinician does not need to know whether their unsigned pile is up 8% MoM.
// ---------------------------------------------------------------------------
function QueueStat({
  label,
  value,
  icon,
  hint,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  hint: string;
  tone: "gold" | "high" | "watch" | "neutral";
}) {
  const ring = {
    gold: "border-gold-400/30 bg-gold-400/[0.06] text-gold-300",
    high: "border-high/30 bg-high/10 text-high",
    watch: "border-watch/30 bg-watch/10 text-watch",
    neutral: "border-ink-700 bg-ink-900/50 text-ink-400",
  }[tone];
  return (
    <div className="card flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="label-eyebrow">{label}</span>
        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg border", ring)}>
          {icon}
        </span>
      </div>
      <span className="stat-mono mt-3 font-display text-2xl font-bold text-ink-50 sm:text-3xl">
        {value}
      </span>
      <span className="mt-1 text-xs text-ink-500">{hint}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DecisionCard
// ---------------------------------------------------------------------------
function DecisionCard({
  rec,
  status,
  canApprove,
  onApprove,
  onDecline,
  onCoachReviewed,
}: {
  rec: Recommendation;
  status: RecommendationStatus;
  canApprove: boolean;
  onApprove: (reason?: string) => void;
  onDecline: (reason?: string) => void;
  onCoachReviewed: () => void;
}) {
  const { role, addNote, addTask, activeStaffId } = useStore();
  const { toast } = useToast();
  const [why, setWhy] = useState(false);
  const [reason, setReason] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");

  const client = getClient(rec.clientId);
  const rule = ruleFor(rec);
  const basis = confidenceBasis(rec, rule);
  // SHA-256 over the rule inputs, memoised: the queue can hold hundreds of
  // cards and this would otherwise re-hash all of them on every keystroke in
  // the reason box.
  const signer = status === "provider approved" ? activeStaffId : undefined;
  const provenance = useMemo(() => stampFor(rec, signer), [rec, signer]);
  const confidencePct = Math.round(rec.confidence * 100);
  const failed = rec.contraindicationChecks.filter((c) => !c.passed);
  const decided = status === "provider approved" || status === "declined";
  const hasEvidence =
    rec.supporting.labs.length + rec.supporting.symptoms.length + rec.supporting.goals.length > 0;

  return (
    <Card
      className={cn(
        "flex flex-col overflow-hidden",
        // A failed screen is the one state that earns a border change. It is not
        // decoration — it means do not sign this without reading it.
        failed.length > 0 && "border-high/40",
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-700/60 p-4 sm:p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{rec.category}</Badge>
            <AiLabel />
          </div>
          {client && (
            <Link
              href={`/clients/${client.id}`}
              className="mt-2 block truncate font-display text-base font-semibold text-ink-50 hover:text-gold-300"
            >
              {clientName(client)}
              <span className="ml-2 text-xs font-normal text-ink-400">
                {client.age}
                {client.sex === "male" ? "M" : "F"} · {client.mrn}
              </span>
            </Link>
          )}
          <p className="mt-0.5 text-[11px] text-ink-500">
            Generated {formatDate(rec.generatedOn)} · {rule ? rule.id : "rule unresolved"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <RecStatusBadge status={status} />
          <RiskBadge level={rec.riskLevel} />
        </div>
      </div>

      <CardContent className="flex-1 space-y-4 p-4 pt-4 sm:p-5 sm:pt-5">
        {/* -------- 1. EVIDENCE, before the conclusion -------------------- */}
        <section>
          <div className="flex items-center justify-between gap-2">
            <span className="label-eyebrow">Evidence on file</span>
            <WhyButton onClick={() => setWhy(true)} label="Provenance" />
          </div>
          <div className="mt-2 space-y-2 rounded-xl border border-ink-800 bg-ink-900/40 p-3 text-xs">
            {rec.supporting.labs.length > 0 && (
              <div className="flex items-start gap-2">
                <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-watch" />
                <div className="min-w-0 space-y-0.5">
                  {rec.supporting.labs.map((l) => (
                    <div key={l.name} className="text-ink-200">
                      {l.name}: <span className="stat-mono">{l.value}</span>{" "}
                      <span
                        className={cn(
                          l.status === "high" && "text-high",
                          l.status === "low" && "text-low",
                          l.status === "watch" && "text-watch",
                          l.status === "optimal" && "text-optimal",
                        )}
                      >
                        ({l.status})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {rec.supporting.symptoms.length > 0 && (
              <div className="flex items-start gap-2">
                <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-low" />
                <span className="text-ink-300">Symptoms: {rec.supporting.symptoms.join(", ")}</span>
              </div>
            )}
            {rec.supporting.goals.length > 0 && (
              <div className="flex items-start gap-2">
                <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
                <span className="text-ink-300">Goals: {rec.supporting.goals.join(", ")}</span>
              </div>
            )}
            {!hasEvidence && (
              <p className="text-ink-500">
                No abnormal labs or matched symptoms. This fired on stated goals alone — weigh it
                accordingly.
              </p>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {rec.triggeredBy.map((t) => (
              <Badge key={t} tone="info">{t}</Badge>
            ))}
          </div>
          {rule && (
            <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
              <span className="text-ink-400">Rule:</span> {rule.triggerSummary}
            </p>
          )}
        </section>

        {/* -------- 2. THE PROPOSAL -------------------------------------- */}
        <section className="rounded-xl border border-ink-800 bg-ink-900/40 p-3">
          <span className="label-eyebrow">Proposal</span>
          <h3 className="mt-1.5 font-display text-sm font-semibold text-ink-50">{rec.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-300">{rec.rationale}</p>

          <div className="mt-3 space-y-1.5">
            <span className="label-eyebrow">Candidate options (no dosing)</span>
            {rec.candidates.map((c) => (
              <div key={c.name} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2 text-ink-200">
                  <PeptideIcon name={c.name} size="xs" />
                  <span className="truncate">{c.name}</span>
                </span>
                {c.inventoryAvailable === null ? (
                  <Badge>Service</Badge>
                ) : c.inventoryAvailable ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-optimal">
                    <Package className="h-3 w-3" /> In stock
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 text-high">
                    <PackageX className="h-3 w-3" /> Reorder
                  </span>
                )}
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-ink-400">
            <span className="font-medium text-ink-200">Suggested next step: </span>
            {rec.suggestedNextStep}
          </p>
        </section>

        {/* -------- 3. CONTRAINDICATION SCREEN — always open -------------- */}
        <section
          className={cn(
            "rounded-xl border p-3",
            failed.length > 0 ? "border-high/35 bg-high/[0.06]" : "border-ink-800 bg-ink-900/40",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="label-eyebrow">Contraindication screen</span>
            <Badge tone={failed.length > 0 ? "high" : "optimal"}>
              {rec.contraindicationChecks.length - failed.length}/{rec.contraindicationChecks.length} clear
            </Badge>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {rec.contraindicationChecks.map((c) => (
              <div key={c.label} className="flex items-start gap-2 text-xs">
                {c.passed ? (
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-optimal" />
                ) : (
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-high" />
                )}
                <span className={c.passed ? "text-ink-400" : "text-high"}>
                  <span className="font-medium">{c.label}:</span> {c.note}
                </span>
              </div>
            ))}
          </div>
          {failed.length > 0 && (
            <p className="mt-2 text-[11px] font-medium text-high">
              {failed.length} check(s) failed. Approving overrides them and that override is recorded
              against your name.
            </p>
          )}
        </section>

        {/* -------- 4. CONFIDENCE, never bare ---------------------------- */}
        <section className="rounded-xl border border-ink-800 bg-ink-900/40 p-3">
          <div className="flex items-baseline justify-between">
            <span className="label-eyebrow">Confidence</span>
            <span className="stat-mono text-sm font-semibold text-ink-100">{confidencePct}%</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
            <div
              className={cn(
                "h-full rounded-full",
                confidencePct >= 78 ? "bg-optimal" : confidencePct >= 65 ? "bg-watch" : "bg-low",
              )}
              style={{ width: `${confidencePct}%` }}
            />
          </div>
          <ul className="mt-2 space-y-1">
            {basis.map((b, i) => (
              <li key={i} className="flex gap-2 text-[11px] text-ink-400">
                <span className="text-ink-600">·</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* -------- 5. DECISION ------------------------------------------ */}
        <section>
          <span className="label-eyebrow">Decision</span>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Reason (optional on approve, recommended on decline) — written to the ledger row."
            className="mt-2 text-xs"
          />
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={!canApprove || status === "provider approved"}
              title={canApprove ? "Sign and commit to the ledger" : "Switch to the Medical role to sign"}
              onClick={() => {
                onApprove(reason.trim() || undefined);
                setReason("");
              }}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {failed.length > 0 ? "Approve with override" : "Approve"}
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={status === "declined"}
              onClick={() => {
                onDecline(reason.trim() || undefined);
                setReason("");
              }}
            >
              <XCircle className="h-3.5 w-3.5" /> Decline
            </Button>
            {status === "draft" && (
              <Button size="sm" variant="outline" onClick={onCoachReviewed}>
                Mark coach reviewed
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setNoteOpen((o) => !o)}>
              <StickyNote className="h-3.5 w-3.5" /> Note
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                addTask({
                  clientId: rec.clientId,
                  type: "Provider approval needed",
                  title: `Provider approval needed — ${client ? clientName(client) : rec.clientId}: ${rec.title}`,
                  assigneeId: client?.providerId ?? "st-001",
                  dueDate: "2026-06-14T12:00:00",
                  priority: "high",
                  done: false,
                });
                toast("Task created");
              }}
            >
              <ListPlus className="h-3.5 w-3.5" /> Task
            </Button>
          </div>
          {decided && (
            <p className="mt-2 text-[11px] text-ink-500">
              A decision is recorded for this row. Changing it appends a new ledger entry; it does
              not rewrite the old one.
            </p>
          )}
        </section>

        {/* Note composer */}
        {noteOpen && (
          <div className="animate-fade-in">
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={2}
              placeholder="Clinical note for the chart…"
            />
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={!noteText.trim()}
                onClick={() => {
                  addNote({
                    clientId: rec.clientId,
                    author: role === "Medical" ? "Provider" : "Coach",
                    body: `[${rec.title}] ${noteText.trim()}`,
                  });
                  setNoteText("");
                  setNoteOpen(false);
                  toast("Note added to chart");
                }}
              >
                Save note
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNoteOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <ProvenanceDrawer
        open={why}
        onClose={() => setWhy(false)}
        title={rec.title}
        // Once signed, the stamp names the human who took ownership — which is
        // what flips the drawer's badge from "not yet reviewed by a person".
        provenance={provenance}
        because={[
          ...rec.triggeredBy,
          ...(rule ? [`Rule "${rule.name}" matched: ${rule.triggerSummary}`] : []),
          ...basis,
        ]}
        ruleIds={rule ? [rule.id] : []}
        confidence={rec.confidence}
        inputs={[
          { label: "Recommendation", value: rec.id },
          { label: "Patient", value: client ? client.mrn : rec.clientId },
          { label: "Generated", value: rec.generatedOn },
          { label: "Risk level", value: rec.riskLevel },
          { label: "Checks run", value: String(rec.contraindicationChecks.length) },
          { label: "Checks failed", value: String(failed.length) },
          ...rec.supporting.labs.map((l) => ({ label: l.name, value: `${l.value} (${l.status})` })),
        ]}
      />
    </Card>
  );
}
