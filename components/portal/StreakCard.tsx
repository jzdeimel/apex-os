"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Flame, Shield, ShieldCheck, Check, Pause, Target } from "lucide-react";
import { atRiskToday, shieldExplainer, streakFor, SHIELD_CAP, SHIELD_EVERY } from "@/lib/play/streak";
import { Card, CardContent, Badge, Progress } from "@/components/ui/primitives";
import { cn, formatDateShort } from "@/lib/utils";

/**
 * The streak card.
 *
 * Three things earn their space here, in this order:
 *
 *  1. **How far off their personal best they are.** It is the most motivating
 *     number a member has and almost no product shows it, because most products
 *     would rather compare you to a stranger. Four days from your own record is
 *     a sentence people act on.
 *
 *  2. **Shields.** A streak with no cushion makes people train while ill to
 *     protect a number, which is a genuinely bad outcome in a clinic. Shields
 *     are shown *before* they are needed so the safety net is known in advance,
 *     and the copy states plainly that they are earned and cannot be bought.
 *
 *  3. **What is still open today**, only when the streak is actually at risk —
 *     phrased as an invitation to finish one specific thing. "46 g of protein
 *     left" is an action. "Don't lose your streak!" is just anxiety with a
 *     flame icon on it.
 *
 * The jeopardy on this card is about the streak and nothing else. Nowhere does
 * it suggest a member loses *progress*, *results* or *money* — see rule 1 in
 * `lib/play/streak.ts`.
 */

export function StreakCard({
  clientId,
  nowIso,
  className,
}: {
  clientId: string;
  nowIso?: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const state = useMemo(() => streakFor(clientId, nowIso), [clientId, nowIso]);
  const risk = useMemo(() => atRiskToday(clientId, nowIso), [clientId, nowIso]);

  if (!state) return null;

  const held = state.shieldsHeld.length;
  const shieldProgress = state.closedTowardNextShield / SHIELD_EVERY;
  const recent = state.history.slice(-14);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-5">
        {/* ── Headline ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="label-eyebrow">Current streak</p>
            <div className="mt-1.5 flex items-baseline gap-2">
              <motion.span
                initial={reduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="stat-mono text-4xl font-semibold leading-none text-ink-50"
              >
                {state.current}
              </motion.span>
              <span className="text-sm text-ink-400">day{state.current === 1 ? "" : "s"}</span>
              <Flame className={cn("h-5 w-5", state.current > 0 ? "text-gold-400" : "text-ink-600")} />
            </div>
          </div>

          {state.todayClosed ? (
            <Badge tone="optimal">
              <Check className="h-3 w-3" /> Today closed
            </Badge>
          ) : (
            <Badge tone="neutral">Today still open</Badge>
          )}
        </div>

        {/* ── Personal best ────────────────────────────────────────────── */}
        <div className="mt-4 rounded-xl border border-ink-800 bg-ink-900/60 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-xs text-ink-400">
              <Target className="h-3.5 w-3.5 text-ink-500" />
              Personal best
            </p>
            <p className="stat-mono text-sm text-ink-200">{state.best} days</p>
          </div>
          <Progress
            value={state.best ? (state.current / state.best) * 100 : 0}
            tone={state.atPersonalBest ? "optimal" : "gold"}
            className="mt-2.5"
          />
          <p className="mt-2 text-sm leading-snug text-ink-300">
            {state.atPersonalBest ? (
              <>You are standing on your own record. Every day from here is a new one.</>
            ) : (
              <>
                <span className="stat-mono text-ink-50">{state.daysUntilPersonalBest}</span> more
                day{state.daysUntilPersonalBest === 1 ? "" : "s"} and this becomes the longest run
                you&apos;ve ever put together.
              </>
            )}
          </p>
        </div>

        {/* ── Shields ──────────────────────────────────────────────────── */}
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="label-eyebrow">Streak shields</p>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: SHIELD_CAP }, (_, i) => {
                const filled = i < held;
                return (
                  <span
                    key={i}
                    title={
                      filled
                        ? `Earned ${formatDateShort(state.shieldsHeld[i].earnedOn)}`
                        : "Not yet earned"
                    }
                    className={cn(
                      "grid h-7 w-7 place-items-center rounded-lg border",
                      filled
                        ? "border-gold-400/40 bg-gold-400/12 text-gold-300"
                        : "border-dashed border-ink-700 text-ink-600",
                    )}
                  >
                    {filled ? <ShieldCheck className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                  </span>
                );
              })}
            </div>
          </div>

          {state.daysToNextShield !== null && (
            <Progress value={shieldProgress * 100} className="mt-2.5" />
          )}
          <p className="mt-2 text-xs leading-snug text-ink-500">{shieldExplainer(state)}</p>

          {state.shieldsSpent.length > 0 && (
            <p className="mt-1.5 text-xs text-ink-500">
              A shield covered{" "}
              <span className="text-ink-300">{formatDateShort(state.shieldsSpent[0].spentOn)}</span>{" "}
              for you. That day is closed as far as your streak is concerned.
            </p>
          )}
        </div>

        {/* ── At risk today ────────────────────────────────────────────── */}
        {risk?.protectedReason ? (
          /* A protected day is never styled as a warning. It is the member doing
             exactly what they were told, and it costs them nothing. */
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-ink-800 bg-ink-900/60 p-3.5">
            <Pause className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink-200">Today is held — {risk.protectedReason.toLowerCase()}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-400">{risk.invitation}</p>
            </div>
          </div>
        ) : risk?.atRisk ? (
          <div className="mt-4 rounded-xl border border-gold-400/25 bg-gold-400/[0.06] p-3.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-gold-300">Still open today</p>
              <p className="stat-mono text-[11px] text-ink-500">{risk.hoursLeft}h left</p>
            </div>

            <ul className="mt-2.5 grid grid-cols-1 gap-1.5">
              {risk.openRings.map((r) => (
                <li
                  key={r.id}
                  className="flex items-start justify-between gap-3 rounded-lg bg-ink-900/70 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-ink-200">
                      <span
                        className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                        style={{ backgroundColor: r.hex }}
                      />
                      {r.label}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-ink-500">{r.detail}</p>
                  </div>
                  <span className="stat-mono shrink-0 text-xs text-ink-300">
                    {r.remaining} {r.unit}
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-2.5 text-xs leading-relaxed text-ink-400">{risk.invitation}</p>
          </div>
        ) : null}

        {/* ── Last two weeks ───────────────────────────────────────────── */}
        <div className="mt-4 border-t border-ink-800 pt-4">
          <p className="label-eyebrow">Last 14 days</p>
          {/* Explicit base grid — 14 fixed columns would overflow a 390px
              screen, so the strip is a wrapping flex row of fixed chips. */}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {recent.map((d) => (
              <span
                key={d.date}
                title={`${formatDateShort(d.date)} — ${
                  d.protectedDay
                    ? "held, provider-directed"
                    : d.shielded
                      ? "covered by a shield"
                      : d.closed
                        ? "closed"
                        : "missed"
                }`}
                className={cn(
                  "h-6 w-6 rounded-md border",
                  d.protectedDay
                    ? "border-ink-600 bg-ink-700/60"
                    : d.shielded
                      ? "border-gold-400/40 bg-gold-400/15"
                      : d.closed
                        ? "border-optimal/40 bg-optimal/25"
                        : "border-ink-800 bg-ink-900",
                )}
              />
            ))}
          </div>
          <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-optimal/40 bg-optimal/25" /> Closed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-gold-400/40 bg-gold-400/15" /> Shield used
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-ink-600 bg-ink-700/60" /> Held
            </span>
          </p>
          {state.protectedDays > 0 && (
            <p className="mt-2 text-[11px] leading-snug text-ink-500">
              <span className="stat-mono text-ink-300">{state.protectedDays}</span> day
              {state.protectedDays === 1 ? "" : "s"} were held on your care team&apos;s instruction.
              Held days extend your streak and never spend a shield.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
