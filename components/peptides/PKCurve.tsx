"use client";

import { useId, useMemo, useState } from "react";
import {
  accumulationRatio,
  concentrationCurve,
  humanDuration,
  timeToSteadyState,
  type PharmacokineticProfile,
} from "@/lib/peptides/pharmacokinetics";
import { cn } from "@/lib/utils";

/**
 * Concentration over time for repeated dosing.
 *
 * This is the picture that explains things members and coaches ask constantly
 * and that no screen in the old product answered:
 *
 *   "Why does it take a month to feel anything?"     -> the climb to steady state
 *   "Why weekly and not daily?"                      -> the half-life sets the interval
 *   "I missed Saturday, does that matter?"           -> toggle it and watch the trough
 *
 * The curve is real first-order kinetics by superposition — every dose decays on
 * its own and the levels add — not a decorative spline. The y-axis is relative
 * to a single first dose on purpose: it makes accumulation legible without
 * implying a concentration in mg/L that we have no business asserting.
 *
 * DELIBERATELY NOT A DOSING TOOL. The interval comes from how the compound is
 * STUDIED, and is labelled as such. Nothing here tells anyone what to take or
 * when; a member's actual schedule lives on their signed plan.
 */

const W = 520;
const H = 170;
const PAD = { l: 26, r: 14, t: 14, b: 26 };

export function PKCurve({
  pk,
  accent,
  doses = 6,
  className,
  allowMissedDose = true,
}: {
  pk: PharmacokineticProfile;
  accent: string;
  doses?: number;
  className?: string;
  allowMissedDose?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const [missed, setMissed] = useState<number | null>(null);

  // Withheld rather than faked: without a characterised half-life there is no
  // honest curve to draw, and a plausible-looking one would be a lie.
  if (!pk.characterised || pk.halfLifeHours === null || pk.typicalIntervalHours === null) {
    return (
      <div className={cn("rounded-lg border border-ink-700/70 bg-ink-900/40 px-3 py-3", className)}>
        <p className="text-detail text-ink-300">
          No concentration curve for this compound — {pk.display.toLowerCase()}.
        </p>
        <p className="mt-1 text-micro leading-relaxed text-ink-500">{pk.basis}</p>
      </div>
    );
  }

  const half = pk.halfLifeHours;
  const interval = pk.typicalIntervalHours;

  const { full, skipped, maxLevel, ss, accum } = useMemo(() => {
    const full = concentrationCurve({ halfLifeHours: half, intervalHours: interval, doses });
    const skipped =
      missed === null
        ? null
        : concentrationCurve({
            halfLifeHours: half,
            intervalHours: interval,
            doses,
            skip: [missed],
          });
    const maxLevel = Math.max(...full.map((p) => p.level)) || 1;
    return {
      full,
      skipped,
      maxLevel,
      ss: timeToSteadyState(half),
      accum: accumulationRatio(half, interval),
    };
  }, [half, interval, doses, missed]);

  const totalHours = full[full.length - 1]?.hour || 1;
  const x = (h: number) => PAD.l + (h / totalHours) * (W - PAD.l - PAD.r);
  const y = (lvl: number) => H - PAD.b - (lvl / (maxLevel * 1.08)) * (H - PAD.t - PAD.b);

  const toPath = (pts: { hour: number; level: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.hour).toFixed(1)} ${y(p.level).toFixed(1)}`).join(" ");

  const doseHours = Array.from({ length: doses }, (_, i) => i * interval);
  // The steady-state plateau, drawn as a band rather than a single line because
  // levels oscillate between peak and trough forever; they never go flat.
  const ssPeak = maxLevel;
  const ssTrough = maxLevel * Math.exp(-(Math.LN2 / half) * interval);

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Concentration over time">
        <defs>
          <linearGradient id={`pk-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.32" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Steady-state band */}
        <rect
          x={PAD.l}
          y={y(ssPeak)}
          width={W - PAD.l - PAD.r}
          height={Math.max(1, y(ssTrough) - y(ssPeak))}
          fill={accent}
          opacity="0.07"
        />
        <text x={W - PAD.r} y={y(ssPeak) - 4} textAnchor="end" fontSize="8.5" fill="currentColor" opacity="0.45">
          steady state
        </text>

        {/* Baseline */}
        <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="currentColor" opacity="0.15" />

        {/* Filled area under the normal curve */}
        <path d={`${toPath(full)} L${x(totalHours)} ${H - PAD.b} L${PAD.l} ${H - PAD.b} Z`} fill={`url(#pk-${uid})`} />

        {/* The missed-dose comparison sits UNDER the normal curve so the gap
            between them is the thing the eye lands on. */}
        {skipped && (
          <path d={toPath(skipped)} fill="none" stroke="#f87171" strokeWidth="1.6" strokeDasharray="4 3" />
        )}

        <path d={toPath(full)} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" />

        {/* Dose markers */}
        {doseHours.map((h, i) => (
          <g key={i}>
            <line
              x1={x(h)}
              y1={H - PAD.b}
              x2={x(h)}
              y2={H - PAD.b + 5}
              stroke={missed === i ? "#f87171" : "currentColor"}
              opacity={missed === i ? 1 : 0.35}
            />
            {allowMissedDose && (
              <circle
                cx={x(h)}
                cy={H - PAD.b + 11}
                r={4}
                fill={missed === i ? "#f87171" : "currentColor"}
                opacity={missed === i ? 1 : 0.25}
                style={{ cursor: "pointer" }}
                onClick={() => setMissed(missed === i ? null : i)}
              />
            )}
          </g>
        ))}

        <text x={PAD.l} y={H - 3} fontSize="8.5" fill="currentColor" opacity="0.45">
          first dose
        </text>
        <text x={W - PAD.r} y={H - 3} textAnchor="end" fontSize="8.5" fill="currentColor" opacity="0.45">
          {humanDuration(totalHours)}
        </text>
      </svg>

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-micro sm:grid-cols-3">
        <Fact label="Half-life" value={pk.display} />
        <Fact label="To steady state" value={humanDuration(ss)} />
        <Fact label="Accumulation" value={`${accum.toFixed(1)}× first dose`} />
      </div>

      {allowMissedDose && (
        <p className="mt-2 text-micro leading-relaxed text-ink-500">
          {missed === null ? (
            <>Tap a dose marker to see what skipping it does to the level.</>
          ) : (
            <>
              <span className="text-red-300">Dashed line</span> is the same schedule with dose{" "}
              {missed + 1} skipped. It takes roughly {humanDuration(pk.halfLifeHours * 1.5)} to
              recover the difference.{" "}
              <button
                type="button"
                onClick={() => setMissed(null)}
                className="underline underline-offset-2 hover:text-ink-300"
              >
                Reset
              </button>
            </>
          )}
        </p>
      )}

      <p className="mt-1.5 text-micro leading-relaxed text-ink-600">
        Relative to a single first dose. Interval shown is how the compound is studied, not a
        recommendation — your own schedule is on your signed plan.
      </p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9.5px] uppercase tracking-[0.14em] text-ink-500">{label}</p>
      <p className="truncate text-ink-200">{value}</p>
    </div>
  );
}
