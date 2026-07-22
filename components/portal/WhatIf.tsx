"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { RotateCcw, TrendingUp, Lock, MessageSquare, Sparkles } from "lucide-react";
import {
  LEVERS,
  simulate,
  baselineLevers,
  protocolQuestionRouting,
  type LeverId,
  type LeverValues,
  type ProjectionPoint,
} from "@/lib/ai/twin";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from "@/components/ui/primitives";
import { FadeIn } from "@/components/portal/still";
import { cn } from "@/lib/utils";

/**
 * What-if — the member moving the levers they actually control.
 *
 * Three product decisions are visible on this screen and none of them are
 * styling:
 *
 *  1. **There is no dose slider**, and the absence is stated rather than
 *     hidden. A member who came here to ask "what if I took more" gets a real
 *     answer — a route to their provider — instead of silently not finding the
 *     control. Saying nothing invites them to go and experiment.
 *  2. **Everything is a range, never a promise.** Every number on the chart is
 *     drawn inside a band, the copy says "typical", and the band widens with
 *     time because the uncertainty genuinely does. A single confident line at
 *     week 12 is the most misleading thing this component could draw.
 *  3. **The top-lever callout is theirs.** It names the member's own number and
 *     the gap it's measured against, so it reads as a fact about them rather
 *     than a slogan about sleep.
 */

const METRICS = [
  { id: "bodyFatPct", label: "Body fat", unit: "%", color: "var(--chart-brand)", lowerIsBetter: true },
  { id: "leanMassKg", label: "Lean mass", unit: "kg", color: "var(--c-optimal)", lowerIsBetter: false },
  { id: "alphaScore", label: "Alpha Score", unit: "", color: "var(--c-low)", lowerIsBetter: false },
  { id: "energy", label: "Energy", unit: "/100", color: "var(--c-watch)", lowerIsBetter: false },
] as const;

type MetricId = (typeof METRICS)[number]["id"];

const BOUNDS: Record<MetricId, [keyof ProjectionPoint, keyof ProjectionPoint]> = {
  bodyFatPct: ["bodyFatLow", "bodyFatHigh"],
  leanMassKg: ["leanMassLow", "leanMassHigh"],
  alphaScore: ["alphaLow", "alphaHigh"],
  energy: ["energyLow", "energyHigh"],
};

export function WhatIf({ clientId }: { clientId: string }) {
  const reduced = useReducedMotion();
  const base = useMemo(() => baselineLevers(clientId), [clientId]);
  const [levers, setLevers] = useState<LeverValues>(base);
  const [metric, setMetric] = useState<MetricId>("bodyFatPct");

  const sim = useMemo(() => simulate(clientId, levers), [clientId, levers]);
  if (!sim) return null;

  // Body composition needs a scan on file. Rather than modelling a body we have
  // never measured, those metrics are simply unavailable and say why.
  const metrics = METRICS.filter(
    (m) => sim.hasScan || (m.id !== "bodyFatPct" && m.id !== "leanMassKg"),
  );
  const active = metrics.find((m) => m.id === metric) ?? metrics[0];
  const [loKey, hiKey] = BOUNDS[active.id];

  const series = sim.path.map((p) => ({
    x: p.week,
    y: p[active.id] as number | null,
    lo: p[loKey] as number | null,
    hi: p[hiKey] as number | null,
  }));

  const startV = sim.start[active.id] as number | null;
  const endV = sim.end[active.id] as number | null;
  const endLo = sim.end[loKey] as number | null;
  const endHi = sim.end[hiKey] as number | null;
  const delta = startV !== null && endV !== null ? Math.round((endV - startV) * 10) / 10 : null;
  const goodDirection =
    delta === null ? null : active.lowerIsBetter ? delta < 0 : delta > 0;

  const route = protocolQuestionRouting();

  return (
    <div className="space-y-4">
      {/* ── The one that matters most ─────────────────────────────────── */}
      <FadeIn>
        <Card className="border-gold-400/30 bg-gradient-to-br from-gold-500/[0.09] to-transparent">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-panel bg-gold-500/15 text-gold-300">
              <Sparkles className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="label-eyebrow text-gold-300">Biggest lever for you</p>
              <p className="mt-1 font-display text-heading font-semibold text-ink-50">
                {sim.topLever.label}
              </p>
              <p className="mt-1 text-detail leading-relaxed text-ink-200">
                {sim.topLever.effectBasis}
              </p>
            </div>
          </CardContent>
        </Card>
      </FadeIn>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* ── Levers ───────────────────────────────────────────────────── */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Your week</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLevers(base)}
              disabled={sim.atBaseline}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Reset
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            {LEVERS.map((spec) => {
              const value = levers[spec.id];
              const moved = Math.round((value - base[spec.id]) * 100) / 100;
              const isTop = sim.topLever.id === spec.id;
              return (
                <div key={spec.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                    <label
                      htmlFor={`lever-${spec.id}`}
                      className="text-detail font-medium text-ink-100"
                    >
                      {spec.label}
                      {isTop && (
                        <Badge tone="gold" className="ml-2 align-middle">
                          biggest for you
                        </Badge>
                      )}
                    </label>
                    <span className="stat-mono text-detail text-ink-50">
                      {formatLever(value)}
                      <span className="ml-1 text-micro text-ink-500">{spec.unit}</span>
                    </span>
                  </div>
                  <input
                    id={`lever-${spec.id}`}
                    type="range"
                    min={spec.min}
                    max={spec.max}
                    step={spec.step}
                    value={value}
                    onChange={(e) =>
                      setLevers((v) => ({ ...v, [spec.id]: Number(e.target.value) }))
                    }
                    className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-700 accent-gold-500 focus-ring"
                    aria-describedby={`lever-help-${spec.id}`}
                  />
                  <p id={`lever-help-${spec.id}`} className="mt-1.5 text-micro text-ink-400">
                    {spec.help}{" "}
                    {moved !== 0 && (
                      <span className="text-ink-300">
                        You&rsquo;re usually around {formatLever(base[spec.id])}.
                      </span>
                    )}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* ── Projection ───────────────────────────────────────────────── */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Next 12 weeks</CardTitle>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {metrics.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMetric(m.id)}
                  className={cn(
                    "rounded-control px-2.5 py-1 text-micro font-medium transition-colors focus-ring",
                    m.id === active.id
                      ? "bg-ink-700 text-ink-50"
                      : "text-ink-400 hover:bg-ink-800 hover:text-ink-200",
                  )}
                  aria-pressed={m.id === active.id}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <BandChart
              series={series}
              color={active.color}
              reduced={!!reduced}
              label={`${active.label} projected over 12 weeks, shown as a range`}
            />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Today" value={fmtMetric(startV, active.unit)} />
              <Stat
                label="Week 12, typical"
                value={fmtMetric(endV, active.unit)}
                tone={goodDirection === null ? undefined : goodDirection ? "good" : "watch"}
              />
              <Stat
                label="Likely range"
                value={
                  endLo === null || endHi === null
                    ? "—"
                    : `${fmtNum(endLo)}–${fmtNum(endHi)}${active.unit}`
                }
                className="col-span-2 sm:col-span-1"
              />
            </div>

            <p className="text-micro leading-relaxed text-ink-400">
              <TrendingUp className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
              This is a <span className="text-ink-200">typical range</span> for someone starting
              where you are — not a promise, and not a target you owe anyone.{" "}
              {sim.confidenceBasis}
            </p>

            {!sim.hasScan && (
              <p className="rounded-control bg-ink-900 p-3 text-micro text-ink-400">
                Body fat and lean mass aren&rsquo;t shown because you don&rsquo;t have a body scan
                on file yet. We&rsquo;d rather leave them out than model a body we&rsquo;ve never
                measured — book a scan and they&rsquo;ll appear here.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── The lever that isn't here ─────────────────────────────────── */}
      <Card className="border-ink-700">
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-panel bg-ink-800 text-ink-400">
            <Lock className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-detail font-semibold text-ink-50">{route.title}</p>
            <p className="mt-1 text-detail leading-relaxed text-ink-300">{route.body}</p>
          </div>
          <Button variant="outline" size="sm" className="shrink-0 self-start">
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
            {route.cta}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

/**
 * Hand-rolled SVG rather than a chart library.
 *
 * The band is the point of this chart, and it has to be legible at 390px — a
 * shaded area with a centre line and nothing else. A `viewBox` with
 * `preserveAspectRatio: none` scales it to any width without a measurement pass,
 * which also keeps the first server render identical to the client's.
 */
function BandChart({
  series,
  color,
  reduced,
  label,
}: {
  series: { x: number; y: number | null; lo: number | null; hi: number | null }[];
  color: string;
  reduced: boolean;
  label: string;
}) {
  const pts = series.filter((p) => p.y !== null && p.lo !== null && p.hi !== null) as {
    x: number;
    y: number;
    lo: number;
    hi: number;
  }[];
  if (pts.length < 2) return null;

  const W = 320;
  const H = 140;
  const PAD = 6;
  const minY = Math.min(...pts.map((p) => p.lo));
  const maxY = Math.max(...pts.map((p) => p.hi));
  const span = maxY - minY || 1;
  const maxX = pts[pts.length - 1].x || 1;

  const px = (x: number) => PAD + (x / maxX) * (W - PAD * 2);
  const py = (y: number) => H - PAD - ((y - minY) / span) * (H - PAD * 2);

  const line = pts.map((p) => `${px(p.x)},${py(p.y)}`).join(" ");
  const band = [
    ...pts.map((p) => `${px(p.x)},${py(p.hi)}`),
    ...[...pts].reverse().map((p) => `${px(p.x)},${py(p.lo)}`),
  ].join(" ");

  // The line draws itself once on mount. Slider moves redraw instantly — an
  // animated re-draw on every drag would lag behind the thumb and read as
  // sluggishness. With reduced motion the chart mounts at its final state
  // rather than not appearing at all.
  const draw = reduced
    ? { initial: { pathLength: 1, opacity: 1 }, transition: { duration: 0 } }
    : {
        initial: { pathLength: 0, opacity: 0 },
        transition: { duration: 0.7, ease: "easeOut" as const },
      };

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-36 w-full sm:h-44"
        role="img"
        aria-label={label}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD}
            x2={W - PAD}
            y1={PAD + f * (H - PAD * 2)}
            y2={PAD + f * (H - PAD * 2)}
            stroke="var(--chart-grid)"
            strokeWidth="1"
          />
        ))}
        <motion.polygon
          points={band}
          fill={color}
          fillOpacity={0.14}
          initial={{ opacity: reduced ? 1 : 0 }}
          animate={{ opacity: 1 }}
          transition={draw.transition}
        />
        <motion.polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={draw.initial}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={draw.transition}
        />
        <circle cx={px(pts[pts.length - 1].x)} cy={py(pts[pts.length - 1].y)} r="3.5" fill={color} />
      </svg>
      <div className="mt-1 flex justify-between text-micro uppercase tracking-wide text-ink-500">
        <span>Now</span>
        <span>Week 6</span>
        <span>Week 12</span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: string;
  tone?: "good" | "watch";
  className?: string;
}) {
  return (
    <div className={cn("rounded-control bg-ink-900 p-3", className)}>
      <p className="label-eyebrow text-ink-500">{label}</p>
      <p
        className={cn(
          "stat-mono mt-1 text-heading font-semibold",
          tone === "good" ? "text-optimal" : tone === "watch" ? "text-watch" : "text-ink-50",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function fmtNum(v: number) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
function fmtMetric(v: number | null, unit: string) {
  return v === null ? "—" : `${fmtNum(v)}${unit}`;
}
function formatLever(v: number) {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, "");
}
