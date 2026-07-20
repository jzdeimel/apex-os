"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Shield, Plus } from "lucide-react";
import { questsFor, weekXp, type Quest } from "@/lib/play/quests";
import { CURRENT_WEEK } from "@/lib/mock/play";
import { Card, CardContent, Badge, Button, SectionTitle } from "@/components/ui/primitives";
import { RingCloseBurst } from "@/components/celebrate/RingCloseBurst";
import { Confetti } from "@/components/celebrate/Confetti";
import { cn } from "@/lib/utils";

/**
 * This week's three.
 *
 * Three, not ten. A board a member can actually clear by Sunday is a board they
 * open on Wednesday; a board of twelve is a board they stop opening. Every quest
 * here is something the member does with their own hands — train, log, eat,
 * book. None of them involve a dose, and none of them involve an outcome the
 * member does not fully control. `lib/play/quests.ts` enforces both at runtime.
 *
 * Completion is celebrated with the same `RingCloseBurst` the daily rings use,
 * in the quest's own lane colour, so finishing a quest feels continuous with
 * closing a ring rather than like a second, competing reward system. Clearing
 * all three earns the confetti — kept for the week, not for each quest, so it
 * still means something.
 */

const RING_R = 26;
const RING_C = 2 * Math.PI * RING_R;

export function Quests({
  clientId,
  weekIso = CURRENT_WEEK,
  className,
}: {
  clientId: string;
  weekIso?: string;
  className?: string;
}) {
  const base = useMemo(() => questsFor(clientId, weekIso), [clientId, weekIso]);

  // Local, demo-only progress on top of the deterministic seed. The server
  // number is the initial state, so first paint is SSR-stable; taps after that
  // are the member logging in the browser.
  const [logged, setLogged] = useState<Record<string, number>>({});
  const [bursts, setBursts] = useState<Record<string, number>>({});
  const [weekBurst, setWeekBurst] = useState(0);

  if (!base.length) return null;

  const quests: Quest[] = base.map((q) => {
    const done = Math.min(q.target, q.done + (logged[q.id] ?? 0));
    return { ...q, done, progress: done / q.target, complete: done >= q.target };
  });

  const cleared = quests.filter((q) => q.complete).length;
  const { earned, available } = weekXp(quests);

  const logOne = (q: Quest) => {
    const next = Math.min(q.target, q.done + 1);
    setLogged((m) => ({ ...m, [q.id]: (m[q.id] ?? 0) + 1 }));
    if (next >= q.target) {
      setBursts((b) => ({ ...b, [q.id]: (b[q.id] ?? 0) + 1 }));
      // Last one standing → the week is cleared.
      if (quests.filter((x) => x.complete).length + 1 === quests.length) {
        setWeekBurst((n) => n + 1);
      }
    }
  };

  return (
    <div className={cn("relative space-y-3", className)}>
      <Confetti trigger={weekBurst} seed={`quests-${clientId}-${weekIso}`} count={110} />

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <SectionTitle>This week</SectionTitle>
          <p className="mt-1 text-detail text-ink-400">
            Three things, all of them yours to do. They reset Monday.
          </p>
        </div>
        <Badge tone={cleared === quests.length ? "optimal" : "neutral"}>
          <span className="stat-mono">{cleared}</span> of{" "}
          <span className="stat-mono">{quests.length}</span> done ·{" "}
          <span className="stat-mono">
            {earned}/{available}
          </span>{" "}
          pts
        </Badge>
      </div>

      {/* Explicit base grid-cols-1 — an implicit column sizes to content and
          blows out the 390px viewport. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {quests.map((q) => (
          <QuestCard key={q.id} quest={q} burst={bursts[q.id] ?? 0} onLog={() => logOne(q)} />
        ))}
      </div>

      {cleared === quests.length && (
        <p className="text-detail text-optimal">
          All three. That&rsquo;s the week — nothing else is owed.
        </p>
      )}
    </div>
  );
}

function QuestCard({
  quest,
  burst,
  onLog,
}: {
  quest: Quest;
  burst: number;
  onLog: () => void;
}) {
  const reduced = useReducedMotion();
  const bookable = quest.unit === "booked";

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          {/* Progress ring doubles as the burst target on completion. */}
          <RingCloseBurst trigger={burst} hex={quest.hex} className="shrink-0">
            <div className="relative grid h-16 w-16 place-items-center">
              <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
                <circle cx="32" cy="32" r={RING_R} fill="none" stroke="#23272d" strokeWidth="6" />
                <motion.circle
                  cx="32"
                  cy="32"
                  r={RING_R}
                  fill="none"
                  stroke={quest.hex}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={RING_C}
                  initial={false}
                  animate={{ strokeDashoffset: RING_C - RING_C * quest.progress }}
                  transition={reduced ? { duration: 0 } : { duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                />
              </svg>
              <span className="absolute">
                {quest.complete ? (
                  <Check className="h-5 w-5" style={{ color: quest.hex }} strokeWidth={2.5} />
                ) : (
                  <span className="stat-mono text-detail font-semibold text-ink-100">
                    {quest.done}
                    <span className="text-ink-600">/{quest.target}</span>
                  </span>
                )}
              </span>
            </div>
          </RingCloseBurst>

          <div className="min-w-0 flex-1">
            <p className="font-display text-detail font-semibold leading-snug text-ink-50">
              {quest.title}
            </p>
            <p className="mt-1 text-micro leading-snug text-ink-400">{quest.detail}</p>
          </div>
        </div>

        {/* Every quest can answer "why is this on my board?" with the member's
            own record — never with what anyone else is doing. */}
        <p className="text-micro leading-snug text-ink-500">{quest.because}</p>

        {quest.holdsHarmless && !quest.complete && (
          <p className="flex items-start gap-1.5 text-micro leading-snug text-ink-600">
            <Shield className="mt-px h-3 w-3 shrink-0" />
            Days your provider paused you still count toward this.
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="stat-mono text-micro text-gold-300">+{quest.xp} pts</span>
          {quest.complete ? (
            <Badge tone="optimal">
              <Check className="h-3 w-3" /> Done
            </Badge>
          ) : (
            <Button size="sm" variant="outline" onClick={onLog}>
              <Plus className="h-3.5 w-3.5" />
              {bookable ? "Book it" : "Log one"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
