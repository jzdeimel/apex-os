"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Award, Lock, ShieldCheck } from "lucide-react";
import { levelFor } from "@/lib/play/levels";
import { Card, CardContent, Badge, Progress } from "@/components/ui/primitives";
import { Confetti } from "@/components/celebrate/Confetti";
import { cn } from "@/lib/utils";

/**
 * The member's level card.
 *
 * Warm and adult. The members reading this are forty-year-old men paying $400 a
 * month for their health — the tone has to be closer to a training log than to a
 * mobile game, or they will read the whole product as unserious and stop
 * trusting the parts that are clinical.
 *
 * The load-bearing element on this card is **"What earned it"**. A level with no
 * receipts is a number the member has to take on faith, and the first time they
 * don't understand why it moved they stop believing it. Every point traces back
 * to a counted behaviour in `lib/mock/play.ts`.
 *
 * What is deliberately absent: any comparison to another member, and any XP that
 * came from a dose or a health outcome. See the header comments in
 * `lib/play/levels.ts` — those are rules, not preferences.
 */

const R = 42;
const C = 2 * Math.PI * R;

export function LevelCard({
  clientId,
  /** Fire the confetti — the parent owns "did they just level up?". */
  celebrate = false,
  className,
}: {
  clientId: string;
  celebrate?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const state = useMemo(() => levelFor(clientId), [clientId]);

  if (!state) return null;

  const earnedBadges = state.badges.filter((b) => b.earned);
  const nextBadge = state.badges.find((b) => !b.earned);

  return (
    <Card className={cn("relative overflow-hidden", className)}>
      <Confetti trigger={celebrate} seed={`level-${clientId}-${state.level}`} count={80} />

      <CardContent className="p-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          {/* ── Level ring ──────────────────────────────────────────── */}
          <div className="relative grid shrink-0 place-items-center self-center">
            <svg width="104" height="104" viewBox="0 0 104 104" className="-rotate-90">
              <circle cx="52" cy="52" r={R} fill="none" stroke="#23272d" strokeWidth="8" />
              <motion.circle
                cx="52"
                cy="52"
                r={R}
                fill="none"
                stroke="#e93d3d"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={C}
                initial={{ strokeDashoffset: C }}
                animate={{ strokeDashoffset: C - C * state.progress }}
                transition={reduced ? { duration: 0 } : { duration: 1, ease: [0.22, 1, 0.36, 1] }}
              />
            </svg>
            <span className="absolute flex flex-col items-center">
              <span className="label-eyebrow text-[9px]">Level</span>
              <span className="stat-mono text-2xl font-semibold leading-none text-ink-50">
                {state.level}
              </span>
            </span>
          </div>

          {/* ── Name, blurb, progress ───────────────────────────────── */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-xl font-semibold text-ink-50">{state.name}</h3>
              <Badge tone="gold">
                <span className="stat-mono">{state.xp.toLocaleString()}</span> pts
              </Badge>
            </div>
            <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-400">{state.blurb}</p>

            {state.nextMilestone ? (
              <div className="mt-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-xs text-ink-400">
                    Next: <span className="text-ink-200">{state.nextMilestone.name}</span>
                  </p>
                  <p className="stat-mono text-xs text-ink-500">
                    {state.xpIntoLevel.toLocaleString()} / {state.xpForNext.toLocaleString()}
                  </p>
                </div>
                <Progress value={state.progress * 100} className="mt-2" />
                <p className="mt-2 text-xs text-ink-500">{state.nextMilestone.hint}</p>
              </div>
            ) : (
              <p className="mt-4 text-xs text-ink-400">
                Top of the ladder. From here the record simply gets longer.
              </p>
            )}
          </div>
        </div>

        {/* ── What earned it ────────────────────────────────────────── */}
        <div className="mt-5 border-t border-ink-800 pt-4">
          <p className="label-eyebrow">What earned it</p>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {state.earnedFrom.map((e) => (
              <li
                key={e.source}
                className="flex items-start justify-between gap-3 rounded-lg bg-ink-900/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm text-ink-200">
                    <span className="stat-mono text-ink-50">{e.count}</span> {e.label.toLowerCase()}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-ink-500">{e.detail}</p>
                </div>
                <span className="stat-mono shrink-0 text-xs text-gold-300">
                  +{e.xp.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
          {/* Stated plainly so nobody has to infer it. */}
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-ink-600">
            <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
            Points come from what you do, never from a dose or a lab result. Days your provider
            paused you count in full.
          </p>
        </div>

        {/* ── Badges ────────────────────────────────────────────────── */}
        <div className="mt-4 border-t border-ink-800 pt-4">
          <p className="label-eyebrow">Milestones</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {earnedBadges.map((b) => (
              <span
                key={b.id}
                title={b.detail}
                className="inline-flex items-center gap-1.5 rounded-full border border-gold-400/30 bg-gold-400/10 px-2.5 py-1 text-[11px] font-medium text-gold-300"
              >
                <Award className="h-3.5 w-3.5" />
                {b.name}
              </span>
            ))}
            {nextBadge && (
              <span
                title={nextBadge.detail}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink-700 px-2.5 py-1 text-[11px] text-ink-500"
              >
                <Lock className="h-3.5 w-3.5" />
                {nextBadge.name}
                <span className="stat-mono text-ink-600">
                  {Math.round(nextBadge.progress * 100)}%
                </span>
              </span>
            )}
          </div>
          {nextBadge && <p className="mt-2 text-[11px] text-ink-600">{nextBadge.detail}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
