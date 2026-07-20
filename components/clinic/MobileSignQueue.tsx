"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  PenLine,
  X,
  ShieldCheck,
  ShieldAlert,
  FlaskConical,
  Activity,
  FileText,
  Sparkles,
  CheckCircle2,
  Hash,
} from "lucide-react";
import { motion } from "framer-motion";
import { Badge, Button, Progress, EmptyState } from "@/components/ui/primitives";
import { SwitchView } from "@/components/motion";
import { Monogram } from "@/components/Monogram";
import { useToast } from "@/components/ui/Toast";
import { consults } from "@/lib/mock/consults";
import { seededRecommendations } from "@/lib/mock/recommendations";
import { clientMap, clientName } from "@/lib/mock/clients";
import { staffMap, staffName } from "@/lib/mock/staff";
import { locationName } from "@/lib/mock/locations";
import { appendLedger } from "@/lib/trace/ledger";
import { shortHash } from "@/lib/trace/hash";
import { ME_PROVIDER } from "@/lib/escalations/queue";
import type { Consult } from "@/lib/consult/types";
import type { Client, Recommendation } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

/**
 * Provider co-sign, built for a phone.
 *
 * ── The thing this is designed against ────────────────────────────────────
 * A clinician clearing a signature queue between patients, one-handed, on a
 * 390px screen. The failure mode is not an ugly layout — it is SIGNING BLIND.
 * Every mobile sign-off flow that fails clinically fails the same way: the
 * decision buttons are reachable and the evidence is not, so the fastest path
 * through the queue is to approve without reading. A queue that is faster to
 * clear than to read has, in effect, automated the signature away.
 *
 * So three rules drive the whole layout:
 *
 *  1. ONE ITEM AT A TIME. No list. A list invites bulk approval, and bulk
 *     approval of clinical work is the outcome we are trying to prevent.
 *  2. EVIDENCE ABOVE THE DECISION, NEVER BEHIND A TAP. The labs, the symptoms,
 *     and the contraindication checks are rendered inline and expanded. The
 *     clinician has to scroll past the basis for the recommendation to reach
 *     the buttons — that scroll IS the review.
 *  3. DECISIONS AT THE BOTTOM. Sticky, full width, 48px tall, inside the thumb
 *     arc of a hand holding the phone. Anything above roughly the top third of
 *     a 390×844 screen requires a grip change, and a grip change during a
 *     five-second window between patients does not happen.
 *
 * Both outcomes — sign and decline — append a ledger row and surface the
 * committed id. A decline that leaves no record is indistinguishable from
 * never having looked, which is the one ambiguity a signature queue exists to
 * remove.
 */

interface ConsultItem {
  id: string;
  kind: "consult";
  client: Client;
  consult: Consult;
}
interface RecItem {
  id: string;
  kind: "recommendation";
  client: Client;
  rec: Recommendation;
}
type QueueItem = ConsultItem | RecItem;

interface Decision {
  outcome: "signed" | "declined";
  ledgerId: string;
  hash: string;
}

/** Risk ordering — the sharpest item should not be the last one reached. */
const RISK_RANK: Record<string, number> = { high: 0, moderate: 1, low: 2, none: 3 };

/** How many items one between-patients sitting holds. See buildQueue. */
const SITTING_SIZE = 14;

function buildQueue(providerId: string): QueueItem[] {
  const provider = staffMap[providerId];
  const scope = new Set(provider?.locationIds ?? []);
  const inScope = (c?: Client) => Boolean(c && scope.has(c.locationId));

  const consultItems: ConsultItem[] = consults
    .filter((c) => c.status !== "Signed")
    .map((consult) => ({ consult, client: clientMap[consult.clientId] }))
    .filter((x) => inScope(x.client))
    .map(({ consult, client }) => ({
      id: `consult:${consult.id}`,
      kind: "consult",
      client,
      consult,
    }));

  const recItems: RecItem[] = seededRecommendations
    .filter((r) => r.status === "draft" || r.status === "coach reviewed")
    .map((rec) => ({ rec, client: clientMap[rec.clientId] }))
    .filter((x) => inScope(x.client))
    .map(({ rec, client }) => ({
      id: `rec:${rec.id}`,
      kind: "recommendation",
      client,
      rec,
    }));

  // Recommendations first (they gate a protocol), sharpest risk at the front;
  // consults after, oldest first so nothing rots at the back of the queue.
  recItems.sort(
    (a, b) =>
      RISK_RANK[a.rec.riskLevel] - RISK_RANK[b.rec.riskLevel] ||
      b.rec.confidence - a.rec.confidence ||
      a.rec.id.localeCompare(b.rec.id),
  );
  consultItems.sort((a, b) => a.consult.startedAt.localeCompare(b.consult.startedAt));

  // One sitting, not the whole backlog. The queue is deliberately finite: a
  // counter that reads "3 of 600" tells a clinician the work is hopeless, and a
  // clinician who believes the queue cannot be cleared starts clearing it
  // carelessly. Highest-risk first means a bounded sitting is also the right
  // bounded sitting.
  return [...recItems, ...consultItems].slice(0, SITTING_SIZE);
}

// ---------------------------------------------------------------------------
// Evidence blocks
// ---------------------------------------------------------------------------

function EvidenceSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-ink-700/70 bg-ink-900/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-ink-500">{icon}</span>
        <p className="label-eyebrow">{title}</p>
      </div>
      {children}
    </section>
  );
}

function ContraindicationList({ rec }: { rec: Recommendation }) {
  const failed = rec.contraindicationChecks.filter((c) => !c.passed);
  return (
    <div className="space-y-2">
      {failed.length > 0 && (
        <p className="rounded-lg border border-high/30 bg-high/10 px-2.5 py-1.5 text-detail font-medium text-high">
          {failed.length} check{failed.length === 1 ? "" : "s"} did not pass. Read before signing.
        </p>
      )}
      <ul className="space-y-1.5">
        {rec.contraindicationChecks.map((c) => (
          <li key={c.label} className="flex items-start gap-2">
            {c.passed ? (
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-optimal" />
            ) : (
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-high" />
            )}
            <div className="min-w-0">
              <p className={cn("text-detail font-medium", c.passed ? "text-ink-200" : "text-high")}>
                {c.label}
              </p>
              {c.note && <p className="text-micro leading-snug text-ink-500">{c.note}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecommendationEvidence({ rec, client }: { rec: Recommendation; client: Client }) {
  const labs = rec.supporting.labs;
  return (
    <div className="space-y-3">
      <EvidenceSection icon={<Sparkles className="h-3.5 w-3.5" />} title="WHY THIS FIRED">
        <p className="text-body leading-relaxed text-ink-200">{rec.rationale}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {rec.triggeredBy.map((t) => (
            <Badge key={t} tone="neutral">
              {t}
            </Badge>
          ))}
        </div>
      </EvidenceSection>

      <EvidenceSection icon={<FlaskConical className="h-3.5 w-3.5" />} title="SUPPORTING LABS">
        {labs.length === 0 ? (
          <p className="text-detail text-ink-500">
            No biomarker supports this recommendation. It fired on goals and symptoms alone.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-1.5">
            {labs.map((l) => (
              <li
                key={l.name}
                className="flex items-center justify-between gap-3 rounded-lg bg-ink-850/70 px-2.5 py-2"
              >
                <span className="min-w-0 truncate text-detail text-ink-300">{l.name}</span>
                <span className="flex items-center gap-2">
                  <span className="stat-mono text-body text-ink-50">{l.value}</span>
                  <Badge
                    tone={
                      l.status === "optimal"
                        ? "optimal"
                        : l.status === "high"
                          ? "high"
                          : l.status === "low"
                            ? "low"
                            : "watch"
                    }
                  >
                    {l.status}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </EvidenceSection>

      <EvidenceSection icon={<Activity className="h-3.5 w-3.5" />} title="GOALS & SYMPTOMS">
        <div className="flex flex-wrap gap-1.5">
          {client.goals.map((g) => (
            <Badge key={`g-${g}`} tone="gold">
              {g}
            </Badge>
          ))}
          {client.symptoms.map((s) => (
            <Badge key={`s-${s}`} tone="watch">
              {s}
            </Badge>
          ))}
          {client.goals.length === 0 && client.symptoms.length === 0 && (
            <p className="text-detail text-ink-500">Nothing recorded at intake.</p>
          )}
        </div>
      </EvidenceSection>

      <EvidenceSection icon={<ShieldCheck className="h-3.5 w-3.5" />} title="CONTRAINDICATION CHECKS">
        <ContraindicationList rec={rec} />
      </EvidenceSection>

      <EvidenceSection icon={<FileText className="h-3.5 w-3.5" />} title="CANDIDATES & NEXT STEP">
        <ul className="mb-2 space-y-1.5">
          {rec.candidates.map((c) => (
            <li key={c.name} className="flex items-center justify-between gap-3 text-detail">
              <span className="min-w-0 truncate text-ink-200">{c.name}</span>
              <Badge
                tone={
                  c.inventoryAvailable === null
                    ? "neutral"
                    : c.inventoryAvailable
                      ? "optimal"
                      : "high"
                }
              >
                {c.inventoryAvailable === null
                  ? c.kind
                  : c.inventoryAvailable
                    ? "in stock"
                    : "unavailable"}
              </Badge>
            </li>
          ))}
        </ul>
        {/* Category-level only. No dose, no schedule, no route — those are the
            provider's to write after this signature, never the engine's. */}
        <p className="text-detail leading-relaxed text-ink-400">{rec.suggestedNextStep}</p>
      </EvidenceSection>
    </div>
  );
}

function ConsultEvidence({ consult }: { consult: Consult }) {
  const summary = consult.finalSummary ?? consult.aiSummary;
  return (
    <div className="space-y-3">
      <EvidenceSection icon={<Sparkles className="h-3.5 w-3.5" />} title="AI SUMMARY — AWAITING REVIEW">
        <p className="text-body leading-relaxed text-ink-100">
          {summary?.headline ?? "No summary produced."}
        </p>
        {consult.aiProvenance && (
          <p className="mt-2 text-micro text-ink-500">
            {consult.aiProvenance.engine} v{consult.aiProvenance.engineVersion} ·{" "}
            <span className="stat-mono">{shortHash(consult.aiProvenance.inputHash)}</span>
          </p>
        )}
      </EvidenceSection>

      {summary && summary.subjective.length > 0 && (
        <EvidenceSection icon={<Activity className="h-3.5 w-3.5" />} title="MEMBER REPORTED">
          <ul className="space-y-1.5">
            {summary.subjective.map((s, i) => (
              <li key={i} className="text-detail leading-relaxed text-ink-200">
                • {s}
              </li>
            ))}
          </ul>
        </EvidenceSection>
      )}

      {summary && summary.objective.length > 0 && (
        <EvidenceSection icon={<FlaskConical className="h-3.5 w-3.5" />} title="COACH OBSERVED">
          <ul className="space-y-1.5">
            {summary.objective.map((s, i) => (
              <li key={i} className="text-detail leading-relaxed text-ink-200">
                • {s}
              </li>
            ))}
          </ul>
        </EvidenceSection>
      )}

      {summary && summary.escalations.length > 0 && (
        <EvidenceSection icon={<ShieldAlert className="h-3.5 w-3.5" />} title="FLAGGED TO PROVIDER">
          <ul className="space-y-2">
            {summary.escalations.map((e, i) => (
              <li key={i} className="rounded-lg border border-high/30 bg-high/10 p-2.5">
                <p className="text-detail font-medium text-high">{e.value}</p>
                <p className="mt-1 text-micro italic leading-snug text-ink-400">
                  “{e.sourceQuote}”
                </p>
              </li>
            ))}
          </ul>
        </EvidenceSection>
      )}

      {/* The coach's raw typing, verbatim. It is the only layer nothing has
          rewritten, so it is the layer that settles a disagreement about what
          was actually said. It belongs on the signing screen, not one tap away. */}
      <EvidenceSection icon={<FileText className="h-3.5 w-3.5" />} title="COACH'S RAW NOTES (VERBATIM)">
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words font-sans text-micro leading-relaxed text-ink-400">
          {consult.rawNotes}
        </pre>
      </EvidenceSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export function MobileSignQueue({ providerId = ME_PROVIDER }: { providerId?: string }) {
  const { toast } = useToast();
  const queue = React.useMemo(() => buildQueue(providerId), [providerId]);
  const [index, setIndex] = React.useState(0);
  const [decisions, setDecisions] = React.useState<Record<string, Decision>>({});

  const provider = staffMap[providerId];
  const item = queue[index];
  const decided = item ? decisions[item.id] : undefined;
  const remaining = queue.length - Object.keys(decisions).length;

  const go = React.useCallback(
    (delta: number) => {
      setIndex((i) => Math.min(queue.length - 1, Math.max(0, i + delta)));
    },
    [queue.length],
  );

  const decide = (outcome: "signed" | "declined") => {
    if (!item || decisions[item.id]) return;

    const row = appendLedger({
      actorId: providerId,
      actorName: provider?.name ?? staffName(providerId),
      actorRole: provider?.role ?? "Medical",
      action: outcome === "signed" ? (item.kind === "consult" ? "sign" : "approve") : "decline",
      entity: item.kind === "consult" ? "note" : "recommendation",
      entityId: item.kind === "consult" ? item.consult.id : item.rec.id,
      subjectId: item.client.id,
      subjectName: clientName(item.client),
      locationId: item.client.locationId,
      reason: `Mobile co-sign queue — reviewed on device by ${provider?.name ?? staffName(providerId)}`,
      before: {
        status: item.kind === "consult" ? item.consult.status : item.rec.status,
      },
      after: {
        status:
          outcome === "signed"
            ? item.kind === "consult"
              ? "Signed"
              : "provider approved"
            : "declined",
        surface: "mobile-sign-queue",
      },
    });

    setDecisions((d) => ({
      ...d,
      [item.id]: { outcome, ledgerId: row.id, hash: row.hash },
    }));
    toast(outcome === "signed" ? "Signed" : "Declined", {
      desc: `${row.id} · ${shortHash(row.hash)}`,
      tone: outcome === "signed" ? "success" : "warn",
    });

    // Advance only after a decision is recorded, so the row id is always
    // committed before the item leaves the screen.
    if (index < queue.length - 1) window.setTimeout(() => go(1), 320);
  };

  if (queue.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircle2 className="h-6 w-6" />}
        title="Signature queue is clear"
        hint="Nothing in your locations is waiting on a signature."
      />
    );
  }

  return (
    // Constrained to a phone column even on a desktop viewport. This surface is
    // not a responsive version of a desk workflow — it IS the phone workflow,
    // and widening it would quietly reintroduce the two-handed layout.
    <div className="mx-auto w-full max-w-md">
      {/* Progress — a queue with no visible end encourages skimming to finish. */}
      <div className="sticky top-0 z-20 -mx-1 bg-ink-950/90 px-1 pb-3 pt-1 backdrop-blur">
        <div className="flex items-baseline justify-between gap-3">
          <p className="stat-mono text-body text-ink-100">
            {index + 1} of {queue.length}
          </p>
          <p className="text-detail text-ink-500">
            {remaining} left · {provider?.name ?? staffName(providerId)}
          </p>
        </div>
        <Progress className="mt-2" value={((index + 1) / queue.length) * 100} />
      </div>

      <SwitchView k={item.id}>
        <motion.article
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.16}
          onDragEnd={(_, info) => {
            // Swipe to advance. A deliberate 72px threshold — small enough for
            // a thumb, large enough that scrolling a long evidence list never
            // trips it. Swiping only navigates; it never decides anything.
            if (info.offset.x < -72) go(1);
            else if (info.offset.x > 72) go(-1);
          }}
          className="card touch-pan-y select-none p-4 pb-2"
        >
          <header className="flex items-start gap-3">
            <Monogram client={item.client} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-heading font-semibold text-ink-50">
                {clientName(item.client)}
              </p>
              <p className="truncate text-detail text-ink-400">
                {item.client.age}
                {item.client.sex === "male" ? "M" : "F"} · MRN {item.client.mrn} ·{" "}
                {locationName(item.client.locationId)}
              </p>
            </div>
          </header>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge tone={item.kind === "consult" ? "info" : "gold"}>
              {item.kind === "consult" ? item.consult.kind : "Recommendation"}
            </Badge>
            {item.kind === "recommendation" ? (
              <>
                <Badge
                  tone={
                    item.rec.riskLevel === "high" || item.rec.riskLevel === "moderate"
                      ? "high"
                      : "neutral"
                  }
                >
                  {item.rec.riskLevel} risk
                </Badge>
                <Badge tone="neutral">
                  <span className="stat-mono">{Math.round(item.rec.confidence * 100)}%</span>{" "}
                  confidence
                </Badge>
              </>
            ) : (
              <>
                <Badge tone="watch">{item.consult.status}</Badge>
                <Badge tone="neutral">{formatDate(item.consult.startedAt)}</Badge>
              </>
            )}
          </div>

          <h2 className="mt-3 font-display text-heading font-semibold leading-snug text-ink-50">
            {item.kind === "recommendation"
              ? item.rec.title
              : `Consult note by ${staffName(item.consult.authorId)}`}
          </h2>

          <div className="mt-4">
            {item.kind === "recommendation" ? (
              <RecommendationEvidence rec={item.rec} client={item.client} />
            ) : (
              <ConsultEvidence consult={item.consult} />
            )}
          </div>

          {/* Padding so the sticky action bar never covers the last evidence
              block at the bottom of the scroll. */}
          <div className="h-4" />
        </motion.article>
      </SwitchView>

      {/* Decision bar — bottom of the screen, inside the thumb arc. 48px targets. */}
      <div className="sticky bottom-0 z-20 -mx-1 mt-3 border-t border-ink-800 bg-ink-950/95 px-1 pb-3 pt-3 backdrop-blur">
        {decided ? (
          <div className="rounded-xl border border-ink-700 bg-ink-850 p-3">
            <div className="flex items-center gap-2">
              {decided.outcome === "signed" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-optimal" />
              ) : (
                <X className="h-4 w-4 shrink-0 text-high" />
              )}
              <p className="text-body font-medium text-ink-50">
                {decided.outcome === "signed" ? "Signed" : "Declined"} — recorded
              </p>
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-detail text-ink-400">
              <Hash className="h-3 w-3 shrink-0" />
              <span className="stat-mono">{decided.ledgerId}</span>
              <span className="text-ink-600">·</span>
              <span className="stat-mono truncate">{shortHash(decided.hash)}</span>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="danger"
              onClick={() => decide("declined")}
              className="h-12 w-full text-body"
            >
              <X className="h-4 w-4" />
              Decline
            </Button>
            <Button
              variant="primary"
              onClick={() => decide("signed")}
              className="h-12 w-full text-body"
            >
              <PenLine className="h-4 w-4" />
              {item.kind === "consult" ? "Sign note" : "Approve"}
            </Button>
          </div>
        )}

        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button
            variant="ghost"
            onClick={() => go(-1)}
            disabled={index === 0}
            className="h-11 w-full text-detail"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            variant="ghost"
            onClick={() => go(1)}
            disabled={index === queue.length - 1}
            className="h-11 w-full text-detail"
          >
            Skip for now
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <p className="mt-2 text-center text-micro text-ink-500">
          Swipe to move between items. Skipping is recorded as nothing — only a decision writes.
        </p>
      </div>
    </div>
  );
}
