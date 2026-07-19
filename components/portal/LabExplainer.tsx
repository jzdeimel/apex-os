"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight, Info, MessageSquare } from "lucide-react";
import {
  explainMarker,
  explainableMarkers,
  panelOverview,
  type MarkerExplanation,
  type WhereItSits,
} from "@/lib/ai/explain";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  EmptyState,
} from "@/components/ui/primitives";
import { TrendLine } from "@/components/charts";
import { Stagger, StaggerItem, SwitchView } from "@/components/motion";
import { cn, formatDate } from "@/lib/utils";

/**
 * The member reading their own panel.
 *
 * The visual centrepiece is the two-band scale, and it exists because of a
 * claim the clinic makes out loud: *we look past normal labs*. That claim is
 * abstract until someone sees their own marker sitting inside the wide grey
 * band the lab prints and outside the narrow one we actually aim for. This is
 * the screen where "your labs came back normal, but you feel terrible" stops
 * being a contradiction — so the two bands are drawn to scale, together, with
 * the member's own value on top of them.
 *
 * Everything else follows the rules in lib/ai/explain.ts: member phrasing only
 * (in range / worth watching / let's discuss), their own trend before any
 * general explanation, lifestyle-only levers, and a route to a human wherever
 * the honest answer is a conversation.
 */

const TONE: Record<WhereItSits, "optimal" | "watch" | "high"> = {
  "in range": "optimal",
  "worth watching": "watch",
  "let's discuss": "high",
};

const HEX: Record<WhereItSits, string> = {
  "in range": "#34d399",
  "worth watching": "#e0bd6e",
  "let's discuss": "#f87171",
};

export function LabExplainer({ clientId }: { clientId: string }) {
  const markers = useMemo(() => explainableMarkers(clientId), [clientId]);
  const overview = useMemo(() => panelOverview(clientId), [clientId]);
  const [openKey, setOpenKey] = useState<string | null>(markers[0]?.key ?? null);

  const explanation = useMemo(
    () => (openKey ? explainMarker(clientId, openKey) : null),
    [clientId, openKey],
  );

  if (!markers.length) {
    return (
      <EmptyState
        title="No results yet"
        hint="Once your first panel is back, every marker on it gets explained here in plain language."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {/* ── Marker list ────────────────────────────────────────────────── */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Your results</CardTitle>
          {overview && (
            <>
              <p className="mt-1 text-sm text-ink-300">{overview.line}</p>
              <p className="mt-0.5 text-xs text-ink-500">{overview.source}</p>
            </>
          )}
        </CardHeader>
        <CardContent className="p-0 pb-2">
          <Stagger className="max-h-[28rem] overflow-y-auto px-2">
            {markers.map((m) => {
              const sits: WhereItSits =
                m.status === "optimal"
                  ? "in range"
                  : m.status === "watch"
                    ? "worth watching"
                    : "let's discuss";
              const open = m.key === openKey;
              return (
                <StaggerItem key={m.key}>
                  <button
                    onClick={() => setOpenKey(m.key)}
                    aria-expanded={open}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus-ring",
                      open ? "bg-ink-800" : "hover:bg-ink-800/60",
                    )}
                  >
                    <span
                      className="h-8 w-1 shrink-0 rounded-full"
                      style={{ background: HEX[sits] }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink-100">{m.name}</span>
                      <span className="block text-xs text-ink-500">{sits}</span>
                    </span>
                    <span className="stat-mono shrink-0 text-sm text-ink-200">
                      {m.value}
                      <span className="ml-1 text-[10px] text-ink-500">{m.unit}</span>
                    </span>
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 shrink-0 text-ink-600",
                        open && "text-ink-300",
                      )}
                      aria-hidden
                    />
                  </button>
                </StaggerItem>
              );
            })}
          </Stagger>
        </CardContent>
      </Card>

      {/* ── Explanation ────────────────────────────────────────────────── */}
      <div className="lg:col-span-3">
        {explanation && (
          <SwitchView k={explanation.key}>
            <MarkerDetail x={explanation} />
          </SwitchView>
        )}
      </div>
    </div>
  );
}

function MarkerDetail({ x }: { x: MarkerExplanation }) {
  const reduced = useReducedMotion();
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="mr-auto">{x.name}</CardTitle>
          <Badge tone={TONE[x.whereItSits]}>{x.whereItSits}</Badge>
        </div>
        <p className="mt-2 font-display text-lg font-semibold leading-snug text-ink-50">
          {x.headline}
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ── The two bands ────────────────────────────────────────── */}
        <BandScale x={x} reduced={!!reduced} />

        {/* ── Their own trend, before any general explanation ──────── */}
        <section>
          <p className="label-eyebrow text-ink-500">Your trend</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-100">{x.trendDetail}</p>
          {x.history.length > 1 && (
            <div className="mt-3">
              <TrendLine
                data={x.history}
                unit={x.unit}
                optimalLow={x.optimalBand?.[0]}
                optimalHigh={x.optimalBand?.[1]}
                height={170}
              />
              <p className="mt-1 text-xs text-ink-500">
                Shaded band is the window we aim for. Latest draw {formatDate(
                  x.history[x.history.length - 1].date,
                )}.
              </p>
            </div>
          )}
        </section>

        <section className="rounded-xl bg-ink-900 p-4">
          <p className="label-eyebrow text-ink-500">What this actually is</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-200">{x.plain}</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-300">{x.whyItMatters}</p>
        </section>

        {/* ── Lifestyle levers only ────────────────────────────────── */}
        <section>
          <p className="label-eyebrow text-ink-500">What moves it</p>
          <ul className="mt-2 space-y-1.5">
            {x.whatMovesIt.map((m) => (
              <li key={m} className="flex gap-2 text-sm text-ink-200">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gold-400" aria-hidden />
                <span className="leading-relaxed">{m}</span>
              </li>
            ))}
          </ul>
          {!x.lifestyleAlone && (
            <p className="mt-3 flex gap-2 rounded-lg bg-ink-900 p-3 text-xs leading-relaxed text-ink-300">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
              {/* Saying "just sleep more" about a marker that lifestyle barely
                  touches is a quietly false promise — and the member finds out
                  it was false eight weeks later. */}
              <span>
                Day-to-day habits only move this one so far. What to actually do about it is a
                conversation with your provider, and it&rsquo;s a reasonable thing to ask for.
              </span>
            </p>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-3 border-t border-ink-800 pt-4">
          <Button variant="outline" size="sm">
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
            Ask about this result
          </Button>
          <p className="text-xs text-ink-500">{x.source}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Reference band vs optimal band, drawn to the same scale.
 *
 * The wide bar is what the lab prints as "normal" — a range built to catch
 * disease, not to describe someone who feels good. The inset bar is the window
 * we work toward. A member whose marker sits between the two is looking at the
 * exact picture behind every "your labs are normal" they have ever been told.
 */
function BandScale({ x, reduced }: { x: MarkerExplanation; reduced: boolean }) {
  const [refLo, refHi] = x.refBand;
  const opt = x.optimalBand;
  const value = Number(x.yourValue.split(" ")[0]);

  // Pad the axis so a value outside the reference range still lands on screen.
  const lo = Math.min(refLo, value) - (refHi - refLo) * 0.12;
  const hi = Math.max(refHi, value) + (refHi - refLo) * 0.12;
  const span = hi - lo || 1;
  const pct = (v: number) => ((v - lo) / span) * 100;

  const left = pct(refLo);
  const width = pct(refHi) - pct(refLo);
  const optLeft = opt ? pct(opt[0]) : 0;
  const optWidth = opt ? pct(opt[1]) - pct(opt[0]) : 0;
  const markPct = Math.max(0, Math.min(100, pct(value)));

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="label-eyebrow text-ink-500">Where yours sits</p>
        <p className="stat-mono text-xl font-semibold text-ink-50">{x.yourValue}</p>
      </div>

      <div className="relative mt-6 h-3 w-full rounded-full bg-ink-800">
        {/* Lab reference range */}
        <div
          className="absolute inset-y-0 rounded-full bg-ink-700"
          style={{ left: `${left}%`, width: `${width}%` }}
          aria-hidden
        />
        {/* The tighter window we aim for */}
        {opt && (
          <div
            className="absolute inset-y-0 rounded-full bg-optimal/45"
            style={{ left: `${optLeft}%`, width: `${optWidth}%` }}
            aria-hidden
          />
        )}
        {/* The member's own value */}
        <motion.span
          className="absolute -top-1 h-5 w-[3px] -translate-x-1/2 rounded-full"
          style={{ background: HEX[x.whereItSits] }}
          initial={{ left: reduced ? `${markPct}%` : "0%", opacity: reduced ? 1 : 0 }}
          animate={{ left: `${markPct}%`, opacity: 1 }}
          transition={reduced ? { duration: 0 } : { duration: 0.55, ease: "easeOut" }}
          aria-hidden
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full bg-ink-700" aria-hidden />
          Lab&rsquo;s normal range {refLo}–{refHi} {x.unit}
        </span>
        {opt && (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-full bg-optimal/45" aria-hidden />
            What we aim for {opt[0]}–{opt[1]} {x.unit}
          </span>
        )}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-500">
        Most labs call anything inside the wide band &ldquo;normal&rdquo;. We work to the narrow
        one, which is why a result can be normal and still be worth doing something about.
      </p>
    </section>
  );
}
