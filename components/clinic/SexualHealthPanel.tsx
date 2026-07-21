"use client";

import { useMemo } from "react";
import { HeartPulse, Info, ChevronRight } from "lucide-react";
import { sexualHealthView } from "@/lib/clinical/sexualHealth";

/**
 * Sexual-health clinical panel. Sex-aware, hormone-linked decision support.
 * Renders nothing when there is neither a concern on file nor a lab pattern that
 * suggests one, so it appears where it is relevant and stays quiet otherwise.
 */
export function SexualHealthPanel({ clientId }: { clientId: string }) {
  const view = useMemo(() => sexualHealthView(clientId), [clientId]);
  if (!view.applicable) return null;

  return (
    <section className="rounded-panel border border-ink-700/70 bg-ink-850/60">
      <header className="flex items-center gap-2 border-b border-ink-800/70 px-5 py-4">
        <HeartPulse className="h-4 w-4 text-gold-400" aria-hidden />
        <h3 className="text-heading text-ink-50">Sexual health</h3>
      </header>

      <div className="space-y-4 px-5 py-5">
        <p className="text-detail text-ink-300">
          <span className="text-ink-500">Presenting:</span> {view.concern}
        </p>

        {view.drivers.length > 0 && (
          <div>
            <p className="mb-2 text-micro uppercase tracking-[0.14em] text-ink-500">Contributing factors on file</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {view.drivers.map((d, i) => (
                <div key={i} className="rounded-control border border-ink-800 bg-ink-900/40 px-3 py-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-detail text-ink-300">{d.label}</span>
                    <span className="stat-mono text-detail text-ink-100">{d.value}</span>
                  </div>
                  <p className="mt-0.5 text-micro leading-relaxed text-ink-500">{d.note}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-micro uppercase tracking-[0.14em] text-ink-500">Levers to weigh</p>
          {view.considerations.map((c, i) => (
            <div key={i} className="flex gap-2.5 rounded-control border border-ink-800 bg-ink-900/40 px-3 py-2.5">
              <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-400" aria-hidden />
              <div>
                <p className="text-detail font-medium text-ink-50">{c.headline}</p>
                <p className="mt-0.5 text-micro leading-relaxed text-ink-400">{c.detail}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="flex items-start gap-1.5 border-t border-ink-800/70 pt-3 text-micro leading-relaxed text-ink-600">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {view.disclaimer}
        </p>
      </div>
    </section>
  );
}
