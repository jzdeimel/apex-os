"use client";

import * as React from "react";
import { Activity, TrendingDown, TrendingUp, Minus, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { WhyButton, ProvenanceDrawer } from "@/components/trace/ProvenanceDrawer";
import { LabVelocityChart } from "@/components/clinic/LabVelocityChart";
import {
  MIN_POINTS,
  markerVelocity,
  velocityInputs,
  type Velocity,
} from "@/lib/labs/velocity";
import { cn } from "@/lib/utils";

/**
 * Velocity for one marker, refusals included.
 *
 * The refusal path is not an error state and is not styled as one. "Only one
 * result on file — no direction to read" is a genuine clinical finding: it says
 * the clinic cannot yet answer the question, which is the cue to draw the
 * second sample. Rendering that as a grey empty box would waste the one moment
 * where the gap is actionable.
 */
export function LabVelocityPanel({
  clientId,
  markerKey,
  compact = false,
}: {
  clientId: string;
  markerKey: string;
  compact?: boolean;
}) {
  const [why, setWhy] = React.useState(false);
  const v: Velocity = React.useMemo(
    () => markerVelocity(clientId, markerKey),
    [clientId, markerKey],
  );

  if (!v.ok) {
    return (
      <div className="rounded-xl border border-dashed border-ink-700 bg-ink-900/30 p-3">
        <div className="flex items-start gap-2">
          <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-500" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-ink-300">
              {v.markerName ?? markerKey} — no projection offered
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-500">{v.message}</p>
            {v.reason === "too-few-points" && (
              <p className="mt-1 text-[11px] text-ink-600">
                {v.points} of {MIN_POINTS} results needed.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const rising = v.slopePerQuarter > 0;
  const Icon = !v.trendIsSignificant ? Minus : rising ? TrendingUp : TrendingDown;

  return (
    <div className="min-w-0 rounded-xl border border-ink-800 bg-ink-900/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Icon
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0",
              !v.trendIsSignificant ? "text-ink-500" : rising ? "text-high" : "text-low",
            )}
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-100">{v.markerName}</p>
            <p className="text-xs text-ink-300">{v.headline}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge tone={v.trendIsSignificant ? "watch" : "neutral"}>
            {v.points} results · {v.df} df
          </Badge>
          <WhyButton onClick={() => setWhy(true)} label="Provenance" />
        </div>
      </div>

      {/* The crossing claim, with its own uncertainty attached rather than
          stated as a single confident date. */}
      {v.crossing && (
        <div
          className={cn(
            "mt-2.5 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed",
            v.crossing.alreadyOutside
              ? "border-high/30 bg-high/[0.07] text-high"
              : "border-watch/25 bg-watch/[0.05] text-ink-200",
          )}
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0">{v.crossing.line}</span>
        </div>
      )}

      {!compact && (
        <div className="mt-3">
          <LabVelocityChart v={v} />
        </div>
      )}

      {/* Never a bare projection. The sample size and the residual scatter that
          set the band's width travel with it, always. */}
      <p className="mt-2.5 text-[11px] leading-relaxed text-ink-500">{v.caveat}</p>

      <ProvenanceDrawer
        open={why}
        onClose={() => setWhy(false)}
        title={`${v.markerName} velocity`}
        because={[
          `${v.points} results on file spanning ${v.spanDays} days.`,
          `Ordinary least squares on days since the first draw: slope ${v.slopePerQuarter.toFixed(3)} ${v.unit} per quarter.`,
          `95% confidence interval on that slope runs ${v.slopeCiPerQuarter[0].toFixed(3)} to ${v.slopeCiPerQuarter[1].toFixed(3)} ${v.unit} per quarter.`,
          v.trendIsSignificant
            ? "That interval excludes zero, so the direction of travel is distinguishable from measurement scatter at this sample size."
            : "That interval includes zero, so no crossing date is offered — the apparent trend cannot be told apart from scatter.",
          "The shaded band is a 95% prediction interval. It widens with distance from the observed data because the (x − x̄)² term in the interval says it must, not as a stylistic choice.",
          `The only boundaries used are this member's own lab reference range, ${v.refLow}–${v.refHigh} ${v.unit}. Apex applies no threshold of its own.`,
        ]}
        ruleIds={["labs.velocity.ols.v1", "labs.reference-band"]}
        inputs={velocityInputs(v)}
      />
    </div>
  );
}

/**
 * A member's markers ranked by how soon they meet the lab's reference band.
 *
 * Deliberately capped. A panel has thirty markers and about three of them are
 * moving in a way anybody should act on; rendering all thirty is how the three
 * get lost.
 */
export function VelocityStack({
  clientId,
  markerKeys,
  limit = 3,
}: {
  clientId: string;
  markerKeys: string[];
  limit?: number;
}) {
  const shown = markerKeys.slice(0, limit);
  if (shown.length === 0) {
    return (
      <p className="text-xs text-ink-500">
        No marker on this member&apos;s panel carries enough history to project.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3">
      {shown.map((k) => (
        <LabVelocityPanel key={k} clientId={clientId} markerKey={k} />
      ))}
    </div>
  );
}

/** Small inline marker used where a full panel would not fit. */
export function VelocityChip({ clientId, markerKey }: { clientId: string; markerKey: string }) {
  const v = React.useMemo(() => markerVelocity(clientId, markerKey), [clientId, markerKey]);
  if (!v.ok || !v.trendIsSignificant) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-ink-700 bg-ink-900/60 px-1.5 py-0.5 text-[11px] text-ink-300">
      <Activity className="h-3 w-3 shrink-0 text-watch" />
      <span className="stat-mono">{v.headline}</span>
    </span>
  );
}
