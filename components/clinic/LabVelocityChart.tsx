"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { formatDateShort } from "@/lib/utils";
import type { VelocityResult } from "@/lib/labs/velocity";

/**
 * The projection chart — one observed line, one dotted forecast, and a band
 * that visibly flares.
 *
 * ── WHY THE BAND IS DRAWN AS A STACK AND NOT AS TWO AREAS ───────────────────
 * Recharts has no native "band" mark. The standard trick is two stacked areas:
 * a transparent one up to the lower bound, then a visible one of height
 * (hi − lo) on top of it. Drawing two independent areas from zero instead
 * produces a filled region under the lower bound as well, which reads as part
 * of the interval and makes the uncertainty look like it extends to the axis.
 *
 * That is why `lo` and `band` are precomputed onto the row rather than being
 * expressed with `dataKey` functions: the stack has to sum, so the second
 * series must carry the DIFFERENCE, and hiding that arithmetic inside an
 * accessor is how someone later "fixes" it into two absolute areas.
 *
 * ── WHY THE OBSERVED SERIES IS SEPARATE FROM THE FIT ────────────────────────
 * The measured values and the model's line are different claims. Merging them
 * into one series — which is tempting because it renders as one continuous
 * stroke — would leave a clinician unable to see how far the fit sits from the
 * points it was drawn through, which is the single most useful thing on the
 * chart when the residual scatter is large.
 */

const OBSERVED = "#e93d3d";
const FIT = "#e0bd6e";
const BAND = "#e0bd6e";
const REF = "#6f7884";

const tooltipStyle = {
  background: "#17191e",
  border: "1px solid #343a42",
  borderRadius: 10,
  fontSize: 12,
  color: "#e7e9ec",
  padding: "8px 10px",
};

interface Row {
  date: string;
  observed?: number;
  fit: number;
  lo: number;
  /** hi − lo. Stacked on top of `lo`; see the header. */
  band: number;
  hi: number;
}

export function LabVelocityChart({ v, height = 240 }: { v: VelocityResult; height?: number }) {
  const rows: Row[] = React.useMemo(
    () =>
      v.series.map((p) => ({
        date: p.date,
        ...(p.value !== undefined ? { observed: p.value } : {}),
        fit: p.fit,
        lo: p.lo,
        band: Math.max(0, p.hi - p.lo),
        hi: p.hi,
      })),
    [v.series],
  );

  // Let the axis breathe past the band and past the reference lines, so a
  // crossing is visible as a crossing rather than as a line touching the frame.
  const [lo, hi] = React.useMemo(() => {
    const values = rows.flatMap((r) => [r.lo, r.hi, ...(r.observed !== undefined ? [r.observed] : [])]);
    values.push(v.refLow, v.refHigh);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.08 || 1;
    return [min - pad, max + pad];
  }, [rows, v.refLow, v.refHigh]);

  const firstProjected = v.series.find((p) => p.projected)?.date;

  return (
    // min-w-0 on the wrapper: ResponsiveContainer measures its parent, and a
    // flex/grid child at default min-width:auto refuses to shrink, so the chart
    // pushes the card past the viewport on a phone instead of resizing.
    <div className="min-w-0">
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} margin={{ top: 8, right: 12, left: -6, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#262a30" />

          {/* The clinic's optimal window, where the panel defines one. */}
          {v.optimalLow !== undefined && v.optimalHigh !== undefined && (
            <ReferenceArea y1={v.optimalLow} y2={v.optimalHigh} fill="#34d399" fillOpacity={0.06} />
          )}

          <XAxis
            dataKey="date"
            tickFormatter={(d) => formatDateShort(d as string)}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            tick={{ fontSize: 11, fill: "#6f7884" }}
          />
          <YAxis
            domain={[lo, hi]}
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fontSize: 11, fill: "#6f7884" }}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(d) => formatDateShort(d as string)}
            formatter={(value, name) => {
              // The stacked band series carries a difference, so reporting its
              // raw value in the tooltip would show a number that appears
              // nowhere on the chart. Report the interval instead.
              if (name === "band") return [null, null] as unknown as [string, string];
              return [`${Number(value).toFixed(2)} ${v.unit}`, String(name)];
            }}
          />

          {/* Lab reference band edges — the only boundaries used anywhere here. */}
          <ReferenceLine y={v.refHigh} stroke={REF} strokeDasharray="4 4" />
          <ReferenceLine y={v.refLow} stroke={REF} strokeDasharray="4 4" />

          {/* Where measurement stops and extrapolation starts. */}
          {firstProjected && <ReferenceLine x={firstProjected} stroke="#343a42" />}

          <Area
            type="monotone"
            dataKey="lo"
            stackId="ci"
            stroke="none"
            fill="none"
            fillOpacity={0}
            isAnimationActive={false}
            name="lower"
            legendType="none"
          />
          <Area
            type="monotone"
            dataKey="band"
            stackId="ci"
            stroke="none"
            fill={BAND}
            fillOpacity={0.16}
            isAnimationActive={false}
            name="band"
            legendType="none"
          />

          <Line
            type="monotone"
            dataKey="fit"
            name="Projected"
            stroke={FIT}
            strokeWidth={1.8}
            strokeDasharray="5 4"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="observed"
            name="Measured"
            stroke={OBSERVED}
            strokeWidth={2.2}
            dot={{ r: 3, fill: OBSERVED }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-micro text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: OBSERVED }} /> Measured
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full border-t border-dashed" style={{ borderColor: FIT }} />
          Projected
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm" style={{ background: BAND, opacity: 0.28 }} /> 95%
          prediction interval
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 border-t border-dashed" style={{ borderColor: REF }} /> Lab
          reference {v.refLow}–{v.refHigh} {v.unit}
        </span>
      </div>
    </div>
  );
}
