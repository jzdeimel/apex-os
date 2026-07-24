"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, ShieldAlert, Stethoscope, ArrowUpRight, ArrowDownRight, Equal, MessageSquare } from "lucide-react";
import {
  titrationFor,
  type TitrationMarker,
  type Consideration,
  type Direction,
} from "@/lib/clinical/titration";

/**
 * The titration assistant, rendered.
 *
 * The screen is built to read like a clinician's own reasoning laid out, not an
 * answer handed down: the trajectory first, the open safety gates second and
 * loud, the levers last and framed as "consider". The "Provider decides" chip is
 * not decoration — it is the honest label for what this is.
 */

const DIR_STYLE: Record<
  Direction,
  { label: string; icon: typeof ArrowUpRight; cls: string }
> = {
  "consider-increase": { label: "Consider increase", icon: ArrowUpRight, cls: "text-emerald border-emerald/30 bg-emerald/5" },
  "consider-reduce": { label: "Consider reducing", icon: ArrowDownRight, cls: "text-gold-300 border-gold-400/30 bg-gold-400/5" },
  "hold-increase": { label: "Hold — gate open", icon: ShieldAlert, cls: "text-high border-high/30 bg-high/5" },
  maintain: { label: "Maintain", icon: Equal, cls: "text-low border-low/30 bg-low/5" },
  discuss: { label: "Discuss", icon: MessageSquare, cls: "text-ink-200 border-ink-700 bg-ink-900/40" },
};

export function TitrationAssistant({ clientId }: { clientId: string }) {
  const view = useMemo(() => titrationFor(clientId), [clientId]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-5 w-5 text-gold-400" aria-hidden />
          <h2 className="text-title font-semibold text-ink-50">Titration assistant</h2>
        </div>
        <span className="rounded-full border border-gold-400/30 bg-gold-400/5 px-3 py-1 text-micro font-medium uppercase tracking-[0.12em] text-gold-300">
          Decision support · provider decides
        </span>
      </header>

      {!view.applicable ? (
        <div className="rounded-panel border border-ink-800 bg-ink-900/40 px-5 py-8 text-center">
          <p className="text-detail leading-relaxed text-ink-400">{view.reason}</p>
        </div>
      ) : (
        <>
          {view.regimen && (
            <div className="rounded-control border border-ink-800 bg-ink-900/40 px-4 py-3 text-detail">
              <span className="text-ink-500">On file: </span>
              <span className="text-ink-100">{view.regimen.name}</span>
              <span className="text-ink-500"> · {view.regimen.dose} · {view.regimen.cadence}</span>
            </div>
          )}

          {/* Gates — loud, and above the levers, because they change what the
              levers may be. */}
          {view.gates.length > 0 && (
            <div className="space-y-2">
              {view.gates.map((g, i) => (
                <div
                  key={i}
                  className={
                    "flex items-start gap-2.5 rounded-control border px-4 py-3 " +
                    (g.severity === "urgent" ? "border-high/40 bg-high/10" : "border-watch/30 bg-watch/5")
                  }
                >
                  <ShieldAlert className={"mt-0.5 h-4 w-4 shrink-0 " + (g.severity === "urgent" ? "text-high" : "text-watch")} aria-hidden />
                  <div>
                    <p className={"text-detail font-medium " + (g.severity === "urgent" ? "text-high" : "text-watch")}>
                      {g.title} — clear before any increase
                    </p>
                    <p className="mt-0.5 text-micro leading-relaxed text-ink-400">{g.note}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Marker trajectory */}
          <div className="grid gap-3 sm:grid-cols-2">
            {view.markers.map((m) => (
              <MarkerCard key={m.key} m={m} />
            ))}
          </div>

          {/* Considerations */}
          <div className="space-y-3">
            {view.considerations.map((c, i) => (
              <ConsiderationCard key={i} c={c} />
            ))}
          </div>

          <p className="border-t border-ink-800 pt-3 text-micro leading-relaxed text-ink-600">{view.disclaimer}</p>
        </>
      )}
    </div>
  );
}

function MarkerCard({ m }: { m: TitrationMarker }) {
  const posLabel: Record<TitrationMarker["position"], { t: string; c: string }> = {
    below: { t: "Below optimal", c: "text-low" },
    optimal: { t: "In optimal", c: "text-emerald" },
    "above-optimal": { t: "Above optimal", c: "text-gold-300" },
    "above-ref": { t: "Above reference", c: "text-high" },
  };
  const TrendIcon = m.trend === "rising" ? TrendingUp : m.trend === "falling" ? TrendingDown : Minus;
  const pos = posLabel[m.position];

  return (
    <div className="rounded-control border border-ink-800 bg-ink-900/40 p-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-detail text-ink-300">{m.name}</p>
          <p className="stat-mono text-body text-ink-50">
            {m.value} <span className="text-micro text-ink-500">{m.unit}</span>
          </p>
        </div>
        <div className="text-right">
          <p className={"text-micro font-medium " + pos.c}>{pos.t}</p>
          <p className="mt-0.5 flex items-center justify-end gap-1 text-micro text-ink-500">
            <TrendIcon className="h-3 w-3" aria-hidden />
            {m.delta === null ? "single draw" : `${m.delta > 0 ? "+" : ""}${m.delta}`}
          </p>
        </div>
      </div>
      <Spark m={m} />
      {m.projection && <p className="mt-1.5 text-micro leading-relaxed text-ink-600">{m.projection}</p>}
    </div>
  );
}

/** A sparkline with the optimal band drawn behind the member's own trace. */
function Spark({ m }: { m: TitrationMarker }) {
  const W = 220;
  const H = 40;
  const pad = 3;
  const vals = m.series.map((s) => s.value);
  const lo = Math.min(...vals, m.optimalLow, m.refLow);
  const hi = Math.max(...vals, m.optimalHigh, m.value);
  const span = Math.max(hi - lo, 0.001);
  const x = (i: number) => pad + (i / Math.max(m.series.length - 1, 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - lo) / span) * (H - pad * 2);

  const bandTop = y(m.optimalHigh);
  const bandBot = y(m.optimalLow);
  const path = m.series.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(s.value).toFixed(1)}`).join(" ");
  const last = m.series.length - 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="mt-2 text-ink-600" role="img" aria-label={`${m.name} trend`}>
      {/* optimal band */}
      <rect x={0} y={Math.min(bandTop, bandBot)} width={W} height={Math.abs(bandBot - bandTop)} fill="var(--c-optimal)" opacity="0.10" />
      <motion.path
        d={path}
        fill="none"
        stroke="var(--c-watch)"
        strokeWidth="1.6"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
      <circle cx={x(last)} cy={y(m.value)} r="2.6" fill="var(--c-watch)" />
    </svg>
  );
}

function ConsiderationCard({ c }: { c: Consideration }) {
  const s = DIR_STYLE[c.direction];
  const Icon = s.icon;
  return (
    <div className={"rounded-panel border px-4 py-3.5 " + s.cls}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="text-micro font-medium uppercase tracking-[0.12em]">{s.label}</span>
      </div>
      <p className="mt-1.5 text-body font-medium text-ink-50">{c.headline}</p>
      <ul className="mt-2 space-y-1.5">
        {c.rationale.map((r, i) => (
          <li key={i} className="flex gap-2 text-detail leading-relaxed text-ink-300">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-600" />
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}
