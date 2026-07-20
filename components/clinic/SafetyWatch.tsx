"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Eye, EyeOff, ShieldAlert, ShieldCheck, Stethoscope, TrendingUp } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Select } from "@/components/ui/primitives";
import { clients, clientMap, clientName } from "@/lib/mock/clients";
import {
  SAFETY_DISCLAIMER,
  safetyFlags,
  severityCounts,
  type SafetyFlag,
  type SafetySeverity,
} from "@/lib/ai/safety";
import { cn } from "@/lib/utils";

/**
 * Safety Watch — the TRT monitoring board.
 *
 * Two design decisions carry the whole component:
 *
 *   1. Urgent items cannot be missed. They render first, in their own block,
 *      with a border that does not appear anywhere else in the product. A
 *      safety board where the worst finding looks like the third-worst is a
 *      safety board that has failed.
 *   2. The "Apex surfaces, the clinician decides" line is permanent. It is not
 *      a footnote that scrolls away — it sits at the top of the board and
 *      repeats on every flag, because this module is one edit away from
 *      looking like it is giving orders, and it must never read that way.
 */

const SEVERITY_META: Record<
  SafetySeverity,
  { label: string; tone: "high" | "watch" | "neutral"; ring: string; icon: React.ReactNode }
> = {
  urgent: {
    label: "Urgent",
    tone: "high",
    ring: "border-high/60 bg-high/[0.07] shadow-[0_0_0_1px_rgba(248,113,113,0.25)]",
    icon: <ShieldAlert className="h-4 w-4" />,
  },
  action: {
    label: "Action",
    tone: "watch",
    ring: "border-watch/40 bg-watch/[0.05]",
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  watch: {
    label: "Watch",
    tone: "neutral",
    ring: "border-ink-700/70 bg-ink-900/40",
    icon: <Eye className="h-4 w-4" />,
  },
};

function FlagCard({ flag, index }: { flag: SafetyFlag; index: number }) {
  const reduced = useReducedMotion();
  const meta = SEVERITY_META[flag.severity];

  return (
    <motion.article
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.4, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className={cn("rounded-2xl border p-4 sm:p-5", meta.ring)}
      // Urgent findings are announced immediately; the rest do not interrupt.
      role={flag.severity === "urgent" ? "alert" : undefined}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              flag.severity === "urgent"
                ? "bg-high/15 text-high"
                : flag.severity === "action"
                  ? "bg-watch/15 text-watch"
                  : "bg-ink-800 text-ink-300",
            )}
          >
            {meta.icon}
          </span>
          <h3 className="font-display text-heading font-semibold leading-snug text-ink-50">{flag.title}</h3>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <Badge tone={flag.memberSafe ? "optimal" : "neutral"}>
            {flag.memberSafe ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {flag.memberSafe ? "Member-visible" : "Clinician only"}
          </Badge>
        </div>
      </header>

      <p className="mt-3 text-body leading-relaxed text-ink-200">{flag.why}</p>

      {/* Evidence inline. A flag without its numbers in view is an assertion. */}
      <div className="mt-4">
        <p className="label-eyebrow text-ink-400">Evidence</p>
        <ul className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
          {flag.evidence.map((e, i) => (
            <li key={`${flag.id}-ev-${i}`} className="rounded-xl border border-ink-700/60 bg-ink-950/40 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-detail font-medium uppercase tracking-wide text-ink-400">{e.label}</span>
                <span className="stat-mono text-body text-ink-50">{e.value}</span>
              </div>
              {e.range && <p className="mt-1 stat-mono text-micro text-ink-500">{e.range}</p>}
              {e.trend && (
                <p className="mt-1 flex items-center gap-1.5 text-micro text-ink-400">
                  <TrendingUp className="h-3 w-3 shrink-0" />
                  <span className="stat-mono">{e.trend}</span>
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 rounded-xl border border-ink-700/60 bg-ink-900/50 p-3">
        <p className="label-eyebrow text-ink-400">Monitoring expectation</p>
        <p className="mt-1.5 text-body leading-relaxed text-ink-300">{flag.monitoringExpectation}</p>
      </div>

      <footer className="mt-3 flex items-center gap-2 text-detail text-ink-400">
        <Stethoscope className="h-3.5 w-3.5 shrink-0 text-gold-300" />
        <span>Surfaced by Apex. A licensed provider decides what happens next.</span>
      </footer>
    </motion.article>
  );
}

function SeverityGroup({ severity, flags, offset }: { severity: SafetySeverity; flags: SafetyFlag[]; offset: number }) {
  if (flags.length === 0) return null;
  const meta = SEVERITY_META[severity];
  return (
    <section className="mt-5 first:mt-0">
      <div className="flex items-center gap-2">
        <span className={cn(severity === "urgent" ? "text-high" : severity === "action" ? "text-watch" : "text-ink-400")}>
          {meta.icon}
        </span>
        <h4 className="label-eyebrow text-ink-300">{meta.label}</h4>
        <span className="stat-mono text-detail text-ink-500">{flags.length}</span>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-3">
        {flags.map((f, i) => (
          <FlagCard key={f.id} flag={f} index={offset + i} />
        ))}
      </div>
    </section>
  );
}

/** Members with at least one open safety flag, so the board opens on real content. */
function flaggedClients() {
  const withFlags = clients.filter((c) => safetyFlags(c.id).length > 0);
  return withFlags.length > 0 ? withFlags : clients;
}

export default function SafetyWatch({ clientId }: { clientId?: string }) {
  const pool = React.useMemo(flaggedClients, []);
  const [selected, setSelected] = React.useState(clientId ?? pool[0]?.id ?? "");
  const active = clientId ?? selected;

  const client = clientMap[active];
  const flags = React.useMemo(() => (active ? safetyFlags(active) : []), [active]);
  const counts = severityCounts(flags);

  const urgent = flags.filter((f) => f.severity === "urgent");
  const action = flags.filter((f) => f.severity === "action");
  const watch = flags.filter((f) => f.severity === "watch");

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle>Safety watch</CardTitle>
          <p className="mt-1 max-w-2xl text-body leading-relaxed text-ink-400">
            Testosterone-therapy monitoring: haematocrit, fertility, estradiol at both extremes, prostate, sleep-disordered
            breathing and cardiovascular markers.
          </p>
        </div>
        {!clientId && (
          <div className="w-full sm:w-56">
            <Select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Select member">
              {pool.map((c) => (
                <option key={c.id} value={c.id}>
                  {clientName(c)}
                </option>
              ))}
            </Select>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {/* Permanent, top of board — never a footnote. */}
        <div className="flex items-start gap-2.5 rounded-xl border border-gold-400/25 bg-gold-400/[0.06] p-3">
          <Stethoscope className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" />
          <p className="text-body leading-relaxed text-ink-200">{SAFETY_DISCLAIMER}</p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {(["urgent", "action", "watch"] as SafetySeverity[]).map((s) => (
            <div
              key={s}
              className={cn(
                "rounded-xl border p-3 text-center",
                s === "urgent" && counts.urgent > 0 ? "border-high/50 bg-high/[0.07]" : "border-ink-700/60 bg-ink-900/40",
              )}
            >
              <p className="stat-mono text-title text-ink-50">{counts[s]}</p>
              <p className="mt-0.5 text-micro uppercase tracking-wide text-ink-400">{SEVERITY_META[s].label}</p>
            </div>
          ))}
        </div>

        {client && (
          <p className="mt-3 text-detail text-ink-500">
            {clientName(client)} · <span className="stat-mono">{client.age}</span> ·{" "}
            {client.programs.length ? client.programs.map((p) => p.name).join(", ") : "No active program"}
          </p>
        )}

        <div className="mt-5">
          {flags.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="h-5 w-5" />}
              title="No safety flags open for this member"
              hint="Nothing on the current panel or program meets the threshold to surface. Absence of a flag is not clearance — routine monitoring still applies."
            />
          ) : (
            <>
              <SeverityGroup severity="urgent" flags={urgent} offset={0} />
              <SeverityGroup severity="action" flags={action} offset={urgent.length} />
              <SeverityGroup severity="watch" flags={watch} offset={urgent.length + action.length} />
            </>
          )}
        </div>

        <p className="mt-5 border-t border-ink-700/60 pt-4 text-detail leading-relaxed text-ink-500">
          This board never recommends starting, stopping or changing a dose. It reports findings, the evidence behind them
          and what monitoring they imply. Member-visible flags are marked; everything else stays clinician-only by default.
        </p>
      </CardContent>
    </Card>
  );
}
