"use client";

import * as React from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Eye,
  Info,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
} from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { WhyButton, ProvenanceDrawer } from "@/components/trace/ProvenanceDrawer";
import {
  SEVERITY_LABEL,
  findingInputs,
  type InteractionFinding,
  type InteractionSeverity,
  type ScreenResult,
} from "@/lib/clinical/interactions";
import { cn } from "@/lib/utils";

/**
 * The interaction screen, rendered at the point of signature.
 *
 * ── WHY THIS IS NOT A COLLAPSIBLE ───────────────────────────────────────────
 * The screen it replaces was a disclosure triangle under the approve button and
 * it was never opened. So this component has no collapsed state for blocking
 * findings: they render open, in full, above the decision, and each one carries
 * its own acknowledgement control. A provider can still proceed over every one
 * of them — that is their call to make — but the proceeding is deliberate and
 * it is attributable.
 *
 * ── WHY ACKNOWLEDGEMENT IS PER-FINDING ──────────────────────────────────────
 * One "I have reviewed the warnings" checkbox is a single click that discharges
 * an unbounded number of findings, which means its cost does not scale with the
 * risk it covers. Three separate checkboxes for three separate contraindications
 * is three times the friction for three times the exposure, which is the
 * correct shape. The same argument the batch-signature flow on this page makes.
 */

const SEVERITY_META: Record<
  InteractionSeverity,
  { tone: "high" | "watch" | "neutral" | "info"; ring: string; icon: React.ReactNode }
> = {
  /**
   * `ring` is a left rule, not a box.
   *
   * Each finding used to be a filled, fully-bordered card — sitting inside the
   * screen panel, inside the recommendation card. Three nested boxes to show one
   * sentence. A severity-coloured rule down the left edge carries exactly the
   * same information (and the same colour semantics) while letting the findings
   * read as a list rather than as a stack of competing containers.
   */
  contraindication: {
    tone: "high",
    ring: "border-high/70",
    icon: <AlertOctagon className="h-4 w-4" />,
  },
  major: {
    tone: "high",
    ring: "border-high/50",
    icon: <ShieldAlert className="h-4 w-4" />,
  },
  moderate: {
    tone: "watch",
    ring: "border-watch/50",
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  counsel: {
    tone: "neutral",
    ring: "border-ink-700",
    icon: <Info className="h-4 w-4" />,
  },
};

const KIND_LABEL = {
  interaction: "Interaction",
  contraindication: "Contraindication",
  "screening-gap": "Cannot be checked from the record",
} as const;

export interface InteractionScreenProps {
  result: ScreenResult;
  /** Ids of findings the signer has acknowledged. */
  acknowledged: ReadonlySet<string>;
  onAcknowledge: (findingId: string, next: boolean) => void;
  /** False when the viewer's role cannot sign — controls stay visible, disabled. */
  canAcknowledge: boolean;
}

/** Blocking findings that still need a tick before a signature is accepted. */
export function unacknowledgedBlocking(
  result: ScreenResult,
  acknowledged: ReadonlySet<string>,
): InteractionFinding[] {
  return result.blocking.filter((f) => !acknowledged.has(f.id));
}

export function InteractionScreen({
  result,
  acknowledged,
  onAcknowledge,
  canAcknowledge,
}: InteractionScreenProps) {
  const [why, setWhy] = React.useState<InteractionFinding | null>(null);
  const [showCoverage, setShowCoverage] = React.useState(false);
  const outstanding = unacknowledgedBlocking(result, acknowledged);

  return (
    <section
      className={cn(
        "min-w-0 rounded-xl border p-3",
        outstanding.length > 0 ? "border-high/40 bg-high/[0.05]" : "border-ink-800 bg-ink-900/40",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label-eyebrow flex items-center gap-1.5">
          <ShieldQuestion className="h-3.5 w-3.5" /> Interaction &amp; contraindication screen
        </span>
        <Badge tone={outstanding.length > 0 ? "high" : result.findings.length > 0 ? "watch" : "optimal"}>
          {outstanding.length > 0
            ? `${outstanding.length} blocking`
            : result.findings.length > 0
              ? `${result.findings.length} finding${result.findings.length === 1 ? "" : "s"}`
              : "No findings"}
        </Badge>
      </div>

      {/* What was actually looked at. A screen whose scope is invisible reads
          as a screen with no limits. */}
      <p className="mt-1.5 text-micro leading-relaxed text-ink-500">
        Screened{" "}
        <span className="text-ink-400">
          {result.screened.length > 0 ? result.screened.map((a) => a.label).join(", ") : "nothing — no agent on this proposal resolved to a known molecule"}
        </span>
        {result.unscreened.length > 0 && (
          <>
            {" · "}
            <span className="text-high">
              not screened: {result.unscreened.join(", ")}
            </span>
          </>
        )}
        .
      </p>

      {result.findings.length === 0 ? (
        <div className="mt-2.5 flex items-start gap-2 border-t border-ink-800/60 pt-2.5">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-optimal" />
          <p className="text-detail leading-relaxed text-ink-400">
            Nothing fired against the data Apex holds. Read that as narrowly as it is meant —
            see the limits of this screen below.
          </p>
        </div>
      ) : (
        <div className="mt-2.5 space-y-3">
          {result.findings.map((f) => (
            <FindingCard
              key={f.id}
              finding={f}
              acknowledged={acknowledged.has(f.id)}
              onAcknowledge={(next) => onAcknowledge(f.id, next)}
              canAcknowledge={canAcknowledge}
              onWhy={() => setWhy(f)}
            />
          ))}
        </div>
      )}

      {outstanding.length > 0 && (
        <p className="mt-2.5 text-micro font-medium leading-relaxed text-high">
          {outstanding.length} finding{outstanding.length === 1 ? "" : "s"} must be acknowledged
          before this can be signed. Acknowledging is not the same as clearing — each
          acknowledgement is recorded against your name.
        </p>
      )}

      {/* Coverage limits: always present, one click from open, never omitted. */}
      <button
        type="button"
        onClick={() => setShowCoverage((s) => !s)}
        aria-expanded={showCoverage}
        className="focus-ring mt-2.5 inline-flex items-center gap-1.5 rounded-md text-micro text-ink-400 hover:text-ink-200"
      >
        <Eye className="h-3 w-3" />
        {showCoverage ? "Hide" : "What this screen cannot see"} ({result.coverage.length})
      </button>
      {showCoverage && (
        <ul className="animate-fade-in mt-1.5 space-y-1 border-t border-ink-800/60 pt-2">
          {result.coverage.map((c, i) => (
            <li key={i} className="flex gap-2 text-micro leading-relaxed text-ink-400">
              <span className="text-ink-600">·</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )}

      <ProvenanceDrawer
        open={why !== null}
        onClose={() => setWhy(null)}
        title={why?.title ?? "Finding"}
        because={
          why
            ? [
                why.plain,
                `Basis: ${why.basis}`,
                why.blocking
                  ? "This finding blocks signature until it is individually acknowledged."
                  : "This finding is advisory and does not block signature.",
                ...(why.attestation
                  ? [`Acknowledging asserts: "${why.attestation}"`]
                  : []),
                ...result.coverage,
              ]
            : undefined
        }
        ruleIds={why ? [why.id] : []}
        inputs={why ? findingInputs(why, result) : undefined}
      />
    </section>
  );
}

function FindingCard({
  finding,
  acknowledged,
  onAcknowledge,
  canAcknowledge,
  onWhy,
}: {
  finding: InteractionFinding;
  acknowledged: boolean;
  onAcknowledge: (next: boolean) => void;
  canAcknowledge: boolean;
  onWhy: () => void;
}) {
  const meta = SEVERITY_META[finding.severity];
  return (
    <article
      className={cn("min-w-0 border-l-2 py-0.5 pl-3", meta.ring)}
      // A contraindication is announced rather than merely rendered.
      role={finding.severity === "contraindication" ? "alert" : undefined}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span
            className={cn(
              "mt-0.5 shrink-0",
              finding.severity === "contraindication" || finding.severity === "major"
                ? "text-high"
                : finding.severity === "moderate"
                  ? "text-watch"
                  : "text-ink-400",
            )}
          >
            {meta.icon}
          </span>
          <h4 className="min-w-0 text-body font-semibold leading-snug text-ink-50">{finding.title}</h4>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Badge tone={meta.tone}>{SEVERITY_LABEL[finding.severity]}</Badge>
          <Badge tone="info">{KIND_LABEL[finding.kind]}</Badge>
        </div>
      </header>

      <p className="mt-1.5 text-detail leading-relaxed text-ink-200">{finding.plain}</p>

      {/* The basis, never behind a toggle. An assertion without its source is
          the thing this whole product refuses to ship. */}
      <p className="mt-1.5 border-l-2 border-ink-700 pl-2 text-micro leading-relaxed text-ink-500">
        <span className="text-ink-400">Basis: </span>
        {finding.basis}
      </p>

      {/* Evidence reads as a definition list, not as tiles.
          Each pair used to sit in its own bordered, filled box — which put a
          fourth level of boxing inside a card inside a panel inside a card. A
          hairline above the group separates it just as clearly and lets the
          values line up as data instead of as a row of chips. */}
      {finding.evidence.length > 0 && (
        <dl className="mt-2 grid grid-cols-1 gap-x-5 gap-y-1.5 border-t border-ink-800/60 pt-2 sm:grid-cols-2">
          {finding.evidence.map((e, i) => (
            <div key={`${finding.id}-ev-${i}`} className="min-w-0">
              <dt className="label-eyebrow break-words">{e.label}</dt>
              <dd className="stat-mono mt-0.5 break-words text-detail text-ink-200">{e.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {finding.blocking ? (
          <label
            className={cn(
              "flex min-w-0 cursor-pointer items-start gap-2 text-micro leading-relaxed",
              acknowledged ? "text-ink-400" : "text-ink-200",
              !canAcknowledge && "cursor-not-allowed opacity-60",
            )}
          >
            <input
              type="checkbox"
              checked={acknowledged}
              disabled={!canAcknowledge}
              onChange={(e) => onAcknowledge(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#e93d3d]"
            />
            <span>
              {finding.attestation ??
                "I have read this finding and am proceeding with it in view."}
            </span>
          </label>
        ) : (
          <span className="text-micro text-ink-600">Advisory — does not block signature.</span>
        )}
        <WhyButton onClick={onWhy} label="Provenance" />
      </div>
    </article>
  );
}
