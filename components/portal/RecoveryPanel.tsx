"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Activity, Moon, Dumbbell, Zap, Info } from "lucide-react";
import { prescriptionsForClient } from "@/lib/dosing/prescriptions";
import { getClient } from "@/lib/mock/clients";
import { useMemberLog } from "@/lib/member/logStore";

/**
 * Recovery & Performance — the named service line, member-side.
 *
 * Recovery is the half of performance nobody photographs: sleep, tissue repair,
 * training load and the peptides that support them. This pulls the member's own
 * signals into one read — how recovered they actually are right now, what
 * recovery support is on their protocol, and the one honest instruction that
 * follows. Renders only for members with recovery-oriented compounds on file, so
 * it appears for the people on that track and stays out of everyone else's way.
 */

const RECOVERY_KEYS = ["bpc-157", "tb-500", "sermorelin", "ipamorelin", "cjc-1295", "ghk-cu", "nad"];

function isRecovery(name: string, libraryKey?: string): boolean {
  const hay = `${name} ${libraryKey ?? ""}`.toLowerCase();
  return RECOVERY_KEYS.some((k) => hay.includes(k)) || /recovery|repair|peptide|nad/.test(hay);
}

export function RecoveryPanel({ clientId }: { clientId: string }) {
  const { history, today, hydrated } = useMemberLog();

  const recoveryRx = useMemo(
    () => prescriptionsForClient(clientId).filter((rx) => isRecovery(rx.name, rx.libraryKey)),
    [clientId],
  );
  // Applies to members with recovery compounds OR on a recovery/performance
  // programme — the panel should follow the service line, not just the dice roll
  // that picked a specific script.
  const onRecoveryTrack = useMemo(
    () =>
      !!getClient(clientId)?.programs.some((p) => /Recovery|Performance|NAD/i.test(p.name) || p.category === "Recovery / tissue support"),
    [clientId],
  );

  // Recovery readiness from the member's own recent check-ins: sleep and
  // soreness are the two that move recovery. 1..5 each, averaged over the last
  // week of logged days, expressed 0..100. Computed before any early return so
  // the hook order is stable.
  const readiness = useMemo(() => {
    const days = [...history, today].slice(-7);
    const vals: number[] = [];
    for (const d of days) {
      const f = d.feel ?? {};
      if (typeof f.sleep === "number") vals.push(f.sleep);
      if (typeof f.soreness === "number") vals.push(f.soreness);
      if (typeof f.energy === "number") vals.push(f.energy);
    }
    if (vals.length === 0) return null;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.round((avg / 5) * 100);
  }, [history, today]);

  // Only for members on the recovery/performance track.
  if (recoveryRx.length === 0 && !onRecoveryTrack) return null;

  const band =
    readiness == null ? null : readiness >= 75 ? { label: "Recovered — push", tone: "text-emerald", ring: "var(--c-optimal)" } : readiness >= 50 ? { label: "Moderate — train smart", tone: "text-gold-300", ring: "var(--c-watch)" } : { label: "Under-recovered — ease off", tone: "text-high", ring: "var(--c-high)" };

  return (
    <section className="rounded-panel border border-ink-700/70 bg-ink-850/60">
      <header className="flex items-center gap-2 border-b border-ink-800/70 px-5 py-4">
        <Activity className="h-4 w-4 text-gold-400" aria-hidden />
        <h2 className="text-heading text-ink-50">Recovery &amp; performance</h2>
      </header>

      <div className="space-y-5 px-5 py-5">
        {/* Readiness */}
        <div className="flex items-center gap-4">
          <ReadinessRing value={readiness} color={band?.ring ?? "#7a838f"} hydrated={hydrated} />
          <div>
            <p className="text-micro uppercase tracking-[0.14em] text-ink-500">Recovery readiness</p>
            {!hydrated ? (
              <div className="mt-1 h-5 w-32 animate-pulse rounded bg-ink-800/40" />
            ) : readiness == null ? (
              <p className="mt-1 text-detail text-ink-400">Log a few days of sleep and soreness and your readiness shows here.</p>
            ) : (
              <p className={"mt-0.5 text-title font-semibold " + band!.tone}>{band!.label}</p>
            )}
          </div>
        </div>

        {/* Recovery support on protocol */}
        {recoveryRx.length > 0 && (
          <div>
            <p className="mb-2 text-micro uppercase tracking-[0.14em] text-ink-500">Recovery support on your protocol</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {recoveryRx.map((rx) => (
                <div key={rx.id} className="flex items-center gap-2.5 rounded-control border border-ink-800 bg-ink-900/40 px-3 py-2">
                  <Zap className="h-3.5 w-3.5 shrink-0 text-gold-400" aria-hidden />
                  <span className="text-detail text-ink-100">{rx.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* The two inputs that move it */}
        <div className="grid grid-cols-2 gap-3">
          <Lever icon={Moon} label="Sleep" note="The biggest recovery lever there is — protect it first." />
          <Lever icon={Dumbbell} label="Training load" note="Match effort to readiness; a hard day on an amber read costs more than it gives." />
        </div>

        <p className="flex items-start gap-1.5 border-t border-ink-800/70 pt-3 text-micro leading-relaxed text-ink-600">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Readiness is your own logged sleep and soreness, not a wearable — a Whoop/Oura link makes it
          continuous. It&apos;s a guide for training, not a medical measure.
        </p>
      </div>
    </section>
  );
}

function ReadinessRing({ value, color, hydrated }: { value: number | null; color: string; hydrated: boolean }) {
  const pct = value ?? 0;
  const r = 26;
  const circ = 2 * Math.PI * r;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0">
      <circle cx="36" cy="36" r={r} fill="none" stroke="var(--chart-grid)" strokeWidth="6" />
      {hydrated && value != null && (
        <motion.circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
          initial={{ strokeDasharray: circ, strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (pct / 100) * circ }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      )}
      <text x="36" y="40" textAnchor="middle" className="stat-mono" fontSize="15" fill="var(--chart-tooltip-text)">
        {hydrated && value != null ? value : "—"}
      </text>
    </svg>
  );
}

function Lever({ icon: Icon, label, note }: { icon: typeof Moon; label: string; note: string }) {
  return (
    <div className="rounded-control border border-ink-800 bg-ink-900/40 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-detail text-ink-200">
        <Icon className="h-3.5 w-3.5 text-ink-400" aria-hidden /> {label}
      </p>
      <p className="mt-0.5 text-micro leading-relaxed text-ink-500">{note}</p>
    </div>
  );
}
