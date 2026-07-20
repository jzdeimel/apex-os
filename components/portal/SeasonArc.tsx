"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Circle, Dot, Flag } from "lucide-react";
import { seasonFor, type SeasonChapter } from "@/lib/play/season";
import { Card, CardContent, Badge } from "@/components/ui/primitives";
import { cn, formatDateShort } from "@/lib/utils";

/**
 * The season arc — a horizontal chapter rail for the member's 12-week block.
 *
 * Built for 390px first, because that is where it will almost always be read.
 * The rail scrolls horizontally inside its own container rather than wrapping:
 * a wrapped timeline stops reading as a timeline, and the whole point of this
 * component is that a member can see at a glance that they are *between* two
 * fixed clinical events rather than floating in an indefinite programme.
 *
 * The chapters are the plan of care's real monitoring checkpoints — see
 * `lib/play/season.ts`. Nothing on this rail is invented; week 6 is on it
 * because week 6 is a blood draw.
 *
 * Deliberately absent: any countdown framed as a threat, and any suggestion
 * that results expire at the end of the block. The recap is something to arrive
 * at, not something to avoid missing.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

export function SeasonArc({
  clientId,
  nowIso,
  className,
}: {
  clientId: string;
  nowIso?: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const season = useMemo(() => seasonFor(clientId, nowIso), [clientId, nowIso]);

  if (!season) return null;

  const current = season.chapters.find((c) => c.state === "current");
  const next = season.chapters.find((c) => c.state === "ahead");

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-5">
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <p className="label-eyebrow">Season {season.number}</p>
            <h3 className="mt-1.5 font-display text-title font-semibold text-ink-50">{season.name}</h3>
          </div>
          <Badge tone="gold">
            Week <span className="stat-mono">{season.week}</span> of{" "}
            <span className="stat-mono">{season.totalWeeks}</span>
          </Badge>
        </div>

        <p className="mt-2 max-w-prose text-detail leading-relaxed text-ink-400">{season.premise}</p>

        {/* ── Block progress ───────────────────────────────────────────── */}
        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
            <motion.div
              className="h-full rounded-full bg-gold-500"
              initial={reduced ? false : { width: 0 }}
              animate={{ width: `${season.progress * 100}%` }}
              transition={reduced ? { duration: 0 } : { duration: 0.9, ease: EASE }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-micro text-ink-500">
            <span>
              Started <span className="stat-mono text-ink-400">{formatDateShort(season.startedOn)}</span>
            </span>
            <span>
              {season.daysToRecap > 0 ? (
                <>
                  <span className="stat-mono text-ink-300">{season.daysToRecap}</span> days to your
                  recap
                </>
              ) : (
                "Recap ready"
              )}
            </span>
          </div>
        </div>

        {/* ── Chapter rail ─────────────────────────────────────────────── */}
        {/* Scrolls inside itself so the page body never scrolls sideways at
            390px. -mx-5/px-5 lets the first and last chapter bleed to the card
            edge instead of looking clipped mid-scroll. */}
        <div className="-mx-5 mt-5 overflow-x-auto px-5 pb-1">
          <ol className="flex min-w-max items-stretch gap-0">
            {season.chapters.map((c, i) => (
              <ChapterNode
                key={c.id}
                chapter={c}
                first={i === 0}
                last={i === season.chapters.length - 1}
                reduced={Boolean(reduced)}
                index={i}
              />
            ))}
          </ol>
        </div>

        {/* ── Where you are / what's next ──────────────────────────────── */}
        {/* Two labelled facts, not two panels inside a panel. "You are here"
            keeps the accent on its eyebrow alone — the tinted, bordered box
            around it was saying the same thing three times. */}
        <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-5 border-t border-ink-800/60 pt-5 sm:grid-cols-2">
          {current && (
            <div className="min-w-0">
              <p className="label-eyebrow text-gold-300">You are here</p>
              <p className="mt-1.5 text-detail font-medium text-ink-100">{current.title}</p>
              <p className="mt-1 text-micro leading-relaxed text-ink-400">{current.meaning}</p>
            </div>
          )}
          {next ? (
            <div className="min-w-0">
              <p className="label-eyebrow">Next chapter</p>
              <p className="mt-1.5 text-detail font-medium text-ink-100">{next.title}</p>
              <p className="mt-1 text-micro leading-relaxed text-ink-400">
                Week {next.week} · {formatDateShort(next.on)} · led by {next.owner.toLowerCase()}
              </p>
            </div>
          ) : (
            <div className="min-w-0">
              <p className="label-eyebrow">Next chapter</p>
              <p className="mt-1.5 text-detail font-medium text-ink-100">The recap</p>
              <p className="mt-1 text-micro leading-relaxed text-ink-400">
                Every checkpoint in this block is behind you. What moved gets written up next.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Chapter node
// ---------------------------------------------------------------------------

function ChapterNode({
  chapter,
  first,
  last,
  reduced,
  index,
}: {
  chapter: SeasonChapter;
  first: boolean;
  last: boolean;
  reduced: boolean;
  index: number;
}) {
  const done = chapter.state === "done";
  const isCurrent = chapter.state === "current";

  return (
    <li className="flex w-[126px] shrink-0 flex-col sm:w-[148px]">
      {/* Connector + marker share a row so the line lands dead centre on the
          dot at every breakpoint. */}
      <div className="flex items-center">
        <span
          className={cn("h-px flex-1", first ? "bg-transparent" : done || isCurrent ? "bg-gold-500/60" : "bg-ink-700")}
        />
        <motion.span
          initial={reduced ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={reduced ? { duration: 0 } : { duration: 0.35, ease: EASE, delay: 0.05 * index }}
          className={cn(
            "grid h-7 w-7 shrink-0 place-items-center rounded-full border",
            done && "border-gold-500/50 bg-gold-500/15 text-gold-300",
            isCurrent && "border-gold-400 bg-gold-500 text-white",
            chapter.state === "ahead" && "border-ink-700 bg-ink-900 text-ink-600",
          )}
        >
          {done ? (
            <Check className="h-3.5 w-3.5" />
          ) : isCurrent ? (
            <Dot className="h-5 w-5" />
          ) : last ? (
            <Flag className="h-3.5 w-3.5" />
          ) : (
            <Circle className="h-2.5 w-2.5" />
          )}
        </motion.span>
        <span className={cn("h-px flex-1", last ? "bg-transparent" : done ? "bg-gold-500/60" : "bg-ink-700")} />
      </div>

      {/* Copy is centred under the marker and allowed to wrap to three lines —
          truncating a chapter title turns the rail into decoration. */}
      <div className="mt-2 px-1.5 text-center">
        <p className={cn("stat-mono text-micro", isCurrent ? "text-gold-300" : "text-ink-500")}>
          Week {chapter.week}
        </p>
        <p
          className={cn(
            "mt-0.5 text-micro font-medium leading-snug",
            isCurrent ? "text-ink-50" : done ? "text-ink-200" : "text-ink-400",
          )}
        >
          {chapter.title}
        </p>
        <p className="mt-1 text-micro leading-snug text-ink-600">{formatDateShort(chapter.on)}</p>
      </div>
    </li>
  );
}
