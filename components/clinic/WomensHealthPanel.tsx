"use client";

import { useMemo } from "react";
import { Flower2, Droplet, Shield, Sparkles, Activity, HeartPulse, Info } from "lucide-react";
import { womensHealthView, type WHMarker, type WHConsideration } from "@/lib/clinical/womensHealth";

/**
 * Women's health / HRT panel — the female counterpart to the titration
 * assistant. Stage first (where she is in the transition), her hormone picture
 * against FEMALE ranges, then the HRT levers a provider may weigh. Decision
 * support; the provider decides.
 */

const STAGE_STYLE: Record<string, string> = {
  premenopausal: "text-low border-low/30 bg-low/5",
  perimenopause: "text-gold-300 border-gold-400/30 bg-gold-400/5",
  menopausal: "text-high border-high/30 bg-high/5",
  postmenopausal: "text-high border-high/30 bg-high/5",
  indeterminate: "text-ink-300 border-ink-700 bg-ink-900/40",
};

const KIND_ICON: Record<WHConsideration["kind"], typeof Droplet> = {
  estrogen: Flower2,
  progesterone: Shield,
  testosterone: Activity,
  monitor: HeartPulse,
  lifestyle: Sparkles,
};

export function WomensHealthPanel({ clientId }: { clientId: string }) {
  const view = useMemo(() => womensHealthView(clientId), [clientId]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Flower2 className="h-5 w-5 text-gold-400" aria-hidden />
          <h2 className="text-title font-semibold text-ink-50">Women&apos;s health &amp; HRT</h2>
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
          {/* Menopause stage */}
          {view.stage && (
            <div className={"rounded-panel border px-5 py-4 " + (STAGE_STYLE[view.stage.stage] ?? STAGE_STYLE.indeterminate)}>
              <p className="text-micro uppercase tracking-[0.14em] opacity-80">Menopause stage</p>
              <p className="mt-1 text-heading font-semibold">{view.stage.label}</p>
              <p className="mt-1 text-detail leading-relaxed text-ink-300">{view.stage.detail}</p>
            </div>
          )}

          {/* Hormone markers */}
          {view.markers.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {view.markers.map((m) => (
                <MarkerCard key={m.key} m={m} />
              ))}
            </div>
          )}

          {/* Considerations */}
          <div className="space-y-3">
            {view.considerations.map((c, i) => {
              const Icon = KIND_ICON[c.kind];
              const emphatic = c.kind === "progesterone";
              return (
                <div
                  key={i}
                  className={
                    "rounded-panel border px-4 py-3.5 " +
                    (emphatic ? "border-high/30 bg-high/5" : "border-ink-800 bg-ink-900/40")
                  }
                >
                  <div className={"flex items-center gap-2 " + (emphatic ? "text-high" : "text-gold-300")}>
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="text-body font-medium text-ink-50">{c.headline}</span>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {c.rationale.map((r, j) => (
                      <li key={j} className="flex gap-2 text-detail leading-relaxed text-ink-300">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-600" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <p className="flex items-start gap-1.5 border-t border-ink-800 pt-3 text-micro leading-relaxed text-ink-600">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {view.disclaimer}
          </p>
        </>
      )}
    </div>
  );
}

function MarkerCard({ m }: { m: WHMarker }) {
  const pos: Record<WHMarker["position"], { t: string; c: string }> = {
    below: { t: "Below optimal", c: "text-low" },
    optimal: { t: "In range", c: "text-emerald" },
    "above-optimal": { t: "Above optimal", c: "text-gold-300" },
    "above-ref": { t: "Above reference", c: "text-high" },
  };
  const p = pos[m.position];
  return (
    <div className="rounded-control border border-ink-800 bg-ink-900/40 p-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-detail text-ink-300">
            <Droplet className="h-3.5 w-3.5 text-ink-500" aria-hidden /> {m.name}
          </p>
          <p className="stat-mono text-body text-ink-50">
            {m.value} <span className="text-micro text-ink-500">{m.unit}</span>
          </p>
        </div>
        <span className={"text-micro font-medium " + p.c}>{p.t}</span>
      </div>
      <p className="mt-1.5 text-micro leading-relaxed text-ink-500">{m.note}</p>
    </div>
  );
}
