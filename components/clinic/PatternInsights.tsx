"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Activity, ArrowRight, FlaskConical, Stethoscope, User } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Select } from "@/components/ui/primitives";
import { clients, clientMap, clientName } from "@/lib/mock/clients";
import { getLabsForClient } from "@/lib/mock/labs";
import { confidenceLabel, detectPatterns, type Pattern, type PatternMarker } from "@/lib/ai/patterns";
import { cn } from "@/lib/utils";

/**
 * Pattern Insights — clinician-facing.
 *
 * The layout argument: evidence appears ABOVE the conclusion, never behind a
 * disclosure triangle. A clinician asked to accept "secondary hypogonadism
 * pattern" has to see the LH and FSH that produced it in the same glance, or
 * the card is asking for trust it has not earned. Anything a reader has to
 * click to verify is something most readers will not verify.
 */

const STATUS_TONE: Record<PatternMarker["status"], "optimal" | "watch" | "low" | "high"> = {
  optimal: "optimal",
  watch: "watch",
  low: "low",
  high: "high",
};

const STATUS_DOT: Record<PatternMarker["status"], string> = {
  optimal: "bg-optimal",
  watch: "bg-watch",
  low: "bg-low",
  high: "bg-high",
};

/**
 * A scale strip: reference span as the track, optimal window highlighted, the
 * member's value marked. Reading "412 ng/dL" means nothing without the window
 * it is being judged against, so they are never shown apart.
 */
function MarkerScale({ m }: { m: PatternMarker }) {
  const lo = Math.min(m.refLow, m.value);
  const hi = Math.max(m.refHigh, m.value);
  const span = hi - lo || 1;
  const pct = (v: number) => ((v - lo) / span) * 100;
  const optLeft = Math.max(0, pct(m.optimalLow));
  const optWidth = Math.max(2, pct(m.optimalHigh) - pct(m.optimalLow));

  return (
    <div className="mt-2">
      <div className="relative h-1.5 w-full rounded-full bg-ink-900">
        <div
          className="absolute inset-y-0 rounded-full bg-optimal/30"
          style={{ left: `${optLeft}%`, width: `${optWidth}%` }}
        />
        <div
          className={cn("absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-ink-850", STATUS_DOT[m.status])}
          style={{ left: `${Math.min(100, Math.max(0, pct(m.value)))}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-micro text-ink-500">
        <span className="stat-mono">{m.refLow}</span>
        <span className="stat-mono text-optimal/70">
          optimal {m.optimalLow}–{m.optimalHigh}
        </span>
        <span className="stat-mono">{m.refHigh}</span>
      </div>
    </div>
  );
}

function MarkerRow({ m }: { m: PatternMarker }) {
  return (
    <li className="rounded-xl border border-ink-700/60 bg-ink-900/40 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-body font-medium text-ink-100">{m.name}</span>
        <span className="flex items-center gap-2">
          <span className="stat-mono text-body text-ink-50">
            {m.value}
            <span className="ml-1 text-micro text-ink-400">{m.unit}</span>
          </span>
          <Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge>
        </span>
      </div>
      <MarkerScale m={m} />
      <p className="mt-2 text-detail leading-relaxed text-ink-400">{m.note}</p>
    </li>
  );
}

function ConfidenceChip({ confidence }: { confidence: number }) {
  const label = confidenceLabel(confidence);
  const tone = label === "Strong" ? "gold" : label === "Moderate" ? "watch" : "neutral";
  return (
    <Badge tone={tone}>
      {label} · <span className="stat-mono">{Math.round(confidence * 100)}%</span>
    </Badge>
  );
}

function PatternCard({ pattern, index }: { pattern: Pattern; index: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.article
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.4, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className="card p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold-400/12 text-gold-300">
            <Activity className="h-4 w-4" />
          </span>
          <h3 className="font-display text-heading font-semibold leading-snug text-ink-50">{pattern.name}</h3>
        </div>
        <ConfidenceChip confidence={pattern.confidence} />
      </header>

      {/* Evidence first — deliberately. The conclusion sits underneath it. */}
      <div className="mt-4">
        <p className="label-eyebrow flex items-center gap-1.5 text-ink-400">
          <FlaskConical className="h-3 w-3" /> Markers that fired this
        </p>
        <ul className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
          {pattern.markers.map((m) => (
            <MarkerRow key={m.key} m={m} />
          ))}
        </ul>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 border-t border-ink-700/60 pt-4 lg:grid-cols-2">
        <div>
          <p className="label-eyebrow text-ink-400">Clinical read</p>
          <p className="mt-1.5 text-body leading-relaxed text-ink-200">{pattern.explanation}</p>
        </div>
        <div>
          <p className="label-eyebrow text-ink-400">What it suggests</p>
          <p className="mt-1.5 text-body leading-relaxed text-ink-200">{pattern.whatItSuggests}</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-ink-700/60 bg-ink-900/50 p-3">
        <p className="label-eyebrow text-ink-400">In the member&rsquo;s words</p>
        <p className="mt-1.5 text-body leading-relaxed text-ink-300">{pattern.memberExplanation}</p>
      </div>

      <footer className="mt-4 flex flex-wrap items-start gap-3 rounded-xl border border-gold-400/25 bg-gold-400/[0.06] p-3">
        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" />
        <div className="min-w-0 flex-1">
          <p className="label-eyebrow text-gold-300">Next step</p>
          <p className="mt-1 text-body leading-relaxed text-ink-200">{pattern.nextStep}</p>
        </div>
        <Badge tone="gold" className="shrink-0">
          <Stethoscope className="h-3 w-3" /> Provider decision
        </Badge>
      </footer>
    </motion.article>
  );
}

/** Members with a resulted panel — the only ones patterns can be computed for. */
function analysableClients() {
  return clients.filter((c) => Boolean(getLabsForClient(c.id)));
}

export default function PatternInsights({ clientId }: { clientId?: string }) {
  const pool = React.useMemo(analysableClients, []);
  const [selected, setSelected] = React.useState(clientId ?? pool[0]?.id ?? "");
  const active = clientId ?? selected;

  const client = clientMap[active];
  const patterns = React.useMemo(() => (active ? detectPatterns(active) : []), [active]);
  const labs = active ? getLabsForClient(active) : undefined;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle>Pattern insights</CardTitle>
          <p className="mt-1 max-w-2xl text-body leading-relaxed text-ink-400">
            Combinations across the panel, not single flagged markers. Every pattern below names the exact values that
            produced it — a pattern that cannot point at its evidence is not shown.
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
        {client && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-detail text-ink-400">
            <Badge tone="neutral">
              <User className="h-3 w-3" /> {clientName(client)}
            </Badge>
            <Badge tone="neutral">
              <span className="stat-mono">{client.age}</span> · {client.sex}
            </Badge>
            {labs && (
              <Badge tone="neutral">
                {labs.panelName} · <span className="stat-mono">{labs.biomarkers.length}</span> markers
              </Badge>
            )}
          </div>
        )}

        {patterns.length === 0 ? (
          <EmptyState
            icon={<Activity className="h-5 w-5" />}
            title="No multi-marker patterns detected"
            hint={
              labs
                ? "Individual markers may still be outside optimal — this view only reports combinations that meet their full evidence requirement."
                : "No resulted panel on file for this member."
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {patterns.map((p, i) => (
              <PatternCard key={p.id} pattern={p} index={i} />
            ))}
          </div>
        )}

        <p className="mt-5 border-t border-ink-700/60 pt-4 text-detail leading-relaxed text-ink-500">
          Pattern detection is decision support, not a diagnosis. Thresholds are read from each marker&rsquo;s own
          reference and optimal windows on the resulted panel. A licensed provider interprets, orders and decides.
        </p>
      </CardContent>
    </Card>
  );
}
