"use client";

import { useMemo, useState } from "react";
import { FlaskConical, Info, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Badge, Card, CardContent, Select } from "@/components/ui/primitives";
import { FadeIn, Stagger, StaggerItem } from "@/components/motion";
import {
  CONFIDENCE_LABEL,
  CONFIDENCE_NOTE,
  buildEffectivenessReport,
  deltaTone,
  observationSentence,
  type MarkerResult,
  type ProtocolResult,
} from "@/lib/analytics/effectiveness";
import { cn } from "@/lib/utils";

/**
 * PROTOCOL EFFECTIVENESS.
 *
 * The layout is an argument about what this page is. A dashboard puts the
 * biggest number at the top; this one puts the method statement there, because
 * a reader who takes one number off this page and repeats it as a claim has
 * been failed by the page, not by themselves.
 *
 * Three rules the layout enforces:
 *  - The observational banner and the confounder list are above the first
 *    number, always rendered, never collapsed. A caveat behind a disclosure is
 *    a caveat that does not exist.
 *  - Suppressed cohorts render as suppressed rather than being filtered out.
 *    An absent row is indistinguishable from a row that was never run.
 *  - Every sentence about a result comes from `observationSentence`, so the
 *    causal-language ban lives in one function instead of in a reviewer's
 *    memory of this file.
 */
export default function EffectivenessPage() {
  const report = useMemo(() => buildEffectivenessReport(), []);
  const [protocolId, setProtocolId] = useState<string>("all");

  const shown = report.protocols.filter(
    (p) => protocolId === "all" || p.protocol === protocolId,
  );

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <FadeIn>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="label-eyebrow">Analytics</p>
            <h1 className="font-display text-2xl font-semibold text-ink-50">
              Protocol effectiveness by cohort
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-400">
              What moved, in this population, alongside each protocol. Read the
              method statement before any number below.
            </p>
          </div>
          <div className="w-full sm:w-64">
            <Select value={protocolId} onChange={(e) => setProtocolId(e.target.value)}>
              <option value="all">All protocols</option>
              {report.protocols.map((p) => (
                <option key={p.protocol} value={p.protocol}>
                  {p.protocol}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </FadeIn>

      {/* ------------------------------------------------------------------ */}
      {/* Method statement. Above the first number, by design.                */}
      {/* ------------------------------------------------------------------ */}
      <FadeIn delay={0.04}>
        <div className="mt-5 rounded-2xl border border-high/40 bg-high/[0.07] p-5">
          <div className="flex items-start gap-3">
            <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-high" />
            <div>
              <p className="font-display text-sm font-semibold text-ink-50">
                Observational analysis of routine care — not a trial
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-300">
                {report.methodStatement}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-300">
                Nothing on this page may be used as a claim about what a
                protocol does. It is a hypothesis generator: it tells you which
                questions are worth designing a real study around.
              </p>
            </div>
          </div>
        </div>
      </FadeIn>

      {/* ------------------------------------------------------------------ */}
      {/* Confounders. Named on screen, not in a footnote.                    */}
      {/* ------------------------------------------------------------------ */}
      <FadeIn delay={0.08}>
        <div className="mt-4">
          <p className="label-eyebrow">Confounders present in every number below</p>
          <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {report.confounders.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-ink-700/70 bg-ink-850/60 p-4"
              >
                <p className="text-sm font-medium text-ink-100">{c.title}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{c.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>

      {/* ------------------------------------------------------------------ */}
      {/* Floors                                                              */}
      {/* ------------------------------------------------------------------ */}
      <FadeIn delay={0.12}>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Floor label="Reporting floor" value={`n ≥ ${report.minCohortN}`} hint="Below this, no estimate is shown." />
          <Floor
            label="Minimum observation"
            value={`${report.minObservationDays} days`}
            hint="Between the pre-protocol panel and the follow-up."
          />
          <Floor
            label="Population"
            value={report.populationSize.toLocaleString()}
            hint="Members in the book of business."
          />
          <Floor
            label="Comparison group"
            value={report.comparisonGroupSize.toLocaleString()}
            hint="On no protocol. Not a control arm."
          />
        </div>
      </FadeIn>

      {/* ------------------------------------------------------------------ */}
      {/* Cohorts                                                             */}
      {/* ------------------------------------------------------------------ */}
      <Stagger className="mt-6 flex flex-col gap-4">
        {shown.map((p) => (
          <StaggerItem key={p.protocol}>
            <ProtocolCard result={p} minN={report.minCohortN} />
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}

function Floor({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card p-4">
      <p className="label-eyebrow">{label}</p>
      <p className="stat-mono mt-1 text-xl text-ink-50">{value}</p>
      <p className="mt-1 text-[11px] leading-snug text-ink-500">{hint}</p>
    </div>
  );
}

function ProtocolCard({ result, minN }: { result: ProtocolResult; minN: number }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-col gap-2 border-b border-ink-700/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-ink-50">
              {result.protocol}
            </h2>
            <p className="mt-1 text-xs text-ink-400">
              <span className="stat-mono text-ink-200">{result.cohortSize}</span>{" "}
              members on protocol ·{" "}
              <span className="stat-mono text-ink-200">{result.analysedSize}</span>{" "}
              with a paired pre/post panel · median{" "}
              <span className="stat-mono text-ink-200">{result.medianDaysOnProtocol}</span>{" "}
              days on protocol
            </p>
          </div>
          {result.suppressed && (
            <Badge tone="neutral">Nothing clears the n ≥ {minN} floor</Badge>
          )}
        </div>

        {result.markers.length === 0 ? (
          <p className="p-5 text-sm text-ink-400">
            No markers with paired panels in this cohort.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-ink-700/60 text-left">
                  <Th>Marker</Th>
                  <Th className="text-right">n</Th>
                  <Th className="text-right">Median change</Th>
                  <Th className="text-right">IQR</Th>
                  <Th className="text-right">Median days</Th>
                  <Th className="text-right">Toward target</Th>
                  <Th className="text-right">No-protocol group</Th>
                  <Th>Signal</Th>
                </tr>
              </thead>
              <tbody>
                {result.markers.map((m) => (
                  <MarkerRow key={m.markerKey} protocol={result.protocol} m={m} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn("label-eyebrow whitespace-nowrap px-4 py-2.5 font-medium", className)}>
      {children}
    </th>
  );
}

function MarkerRow({ protocol, m }: { protocol: string; m: MarkerResult }) {
  const [open, setOpen] = useState(false);
  const tone = deltaTone(m);
  const Icon = m.medianDelta === 0 ? Minus : m.medianDelta > 0 ? TrendingUp : TrendingDown;

  // Unreportable rows still render — see the module docblock. They render as
  // suppressed, with the count, so the reader knows the cohort exists.
  if (!m.reportable) {
    return (
      <tr className="border-b border-ink-800/70 text-ink-500">
        <td className="px-4 py-3">{m.markerName}</td>
        <td className="stat-mono px-4 py-3 text-right">{m.n}</td>
        <td className="px-4 py-3 text-right text-xs" colSpan={5}>
          Below the reporting floor — no estimate shown.
        </td>
        <td className="px-4 py-3">
          <Badge tone="neutral">{CONFIDENCE_LABEL.insufficient}</Badge>
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr
        className="cursor-pointer border-b border-ink-800/70 transition-colors hover:bg-ink-800/40"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="px-4 py-3 text-ink-100">{m.markerName}</td>
        <td className="stat-mono px-4 py-3 text-right text-ink-200">{m.n}</td>
        <td className="px-4 py-3 text-right">
          <span
            className={cn(
              "stat-mono inline-flex items-center gap-1.5",
              tone === "optimal" ? "text-optimal" : tone === "watch" ? "text-watch" : "text-ink-300",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {m.medianDelta > 0 ? "+" : ""}
            {m.medianDelta.toFixed(Math.abs(m.medianDelta) < 10 ? 2 : 0)} {m.unit}
          </span>
        </td>
        <td className="stat-mono px-4 py-3 text-right text-xs text-ink-400">
          {m.q1Delta.toFixed(2)} to {m.q3Delta.toFixed(2)}
        </td>
        <td className="stat-mono px-4 py-3 text-right text-ink-300">
          {m.medianObservationDays}
        </td>
        <td className="stat-mono px-4 py-3 text-right text-ink-300">
          {Math.round(m.towardTargetShare * 100)}%
          <span className="ml-1 text-[11px] text-ink-500">({m.towardTarget}/{m.n})</span>
        </td>
        <td className="px-4 py-3 text-right text-xs">
          {m.comparison?.reportable ? (
            <span className="stat-mono text-ink-300">
              {m.comparison.medianDelta > 0 ? "+" : ""}
              {m.comparison.medianDelta.toFixed(2)}
              <span className="ml-1 text-ink-500">n={m.comparison.n}</span>
            </span>
          ) : (
            <span className="text-ink-600">n={m.comparison?.n ?? 0} — too few</span>
          )}
        </td>
        <td className="px-4 py-3">
          <Badge tone={m.confidence === "moderate" ? "watch" : "neutral"}>
            {CONFIDENCE_LABEL[m.confidence]}
          </Badge>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-ink-800/70 bg-ink-900/40">
          <td colSpan={8} className="px-4 py-3">
            <div className="flex items-start gap-2.5">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" />
              <div className="space-y-1.5">
                <p className="text-sm text-ink-200">{observationSentence(protocol, m)}</p>
                <p className="text-xs text-ink-400">{CONFIDENCE_NOTE[m.confidence]}</p>
                <p className="text-xs text-ink-500">
                  The no-protocol column is a comparison, not a control. Those
                  members were not randomised — they are on no protocol because
                  a clinician judged they did not need one.
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
