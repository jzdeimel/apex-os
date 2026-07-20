"use client";

import * as React from "react";
import { Dumbbell, Timer, Repeat, ShieldCheck, Info } from "lucide-react";
import type { Client } from "@/lib/types";
import {
  DAYS,
  FOCUS_LABEL,
  needsJointCare,
  totalSets,
  weekFor,
  workoutsFor,
  type DaySession,
  type Workout,
  type WorkoutBlockItem,
} from "@/lib/training/workouts";
import { Card, CardContent, Badge, EmptyState } from "@/components/ui/primitives";
import { cn, absolute } from "@/lib/utils";

/**
 * WORKOUT LIBRARY.
 *
 * The plan says "Thu — Lower, pull — Trap-bar RDL, leg curl, calves". This turns
 * that line into something a member can train off: sets, reps, rest, and one cue
 * per movement.
 *
 * ── TWO DELIBERATE CHOICES ────────────────────────────────────────────────
 *
 * The plan's own line for the day renders VERBATIM at the top of the page, above
 * anything this library adds. The member should always be able to see that the
 * session they are being shown descends from their plan rather than from a
 * generic app.
 *
 * The joint-friendly toggle defaults ON for a member whose plan flagged joint
 * pain, and is available to everyone else. A member having a bad shoulder day
 * should not have to justify themselves to a phone.
 */

/** Pinned NOW. Parsed at midday so the weekday cannot slip across a boundary. */
const TODAY_INDEX = absolute("2026-06-12T12:00:00").getDay(); // 0 = Sunday
const TODAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][TODAY_INDEX];

function BlockRow({
  block,
  jointFriendly,
}: {
  block: WorkoutBlockItem;
  jointFriendly: boolean;
}) {
  const swapped = jointFriendly && block.jointFriendly;
  const name = swapped ? block.jointFriendly!.exercise : block.exercise;

  return (
    <li className="hairline rounded-2xl border bg-ink-900/50 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 text-[15px] font-medium leading-snug text-ink-50">{name}</p>
        <p className="stat-mono shrink-0 text-[13px] text-ink-300">
          {block.sets} × {block.repRange}
        </p>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-500">
        {block.restSeconds > 0 && (
          <span className="inline-flex items-center gap-1">
            <Timer className="h-3.5 w-3.5" />
            <span className="stat-mono">{block.restSeconds}</span>s rest
          </span>
        )}
        {swapped && (
          <Badge tone="optimal">
            <ShieldCheck className="h-3 w-3" />
            Swapped from {block.exercise}
          </Badge>
        )}
      </div>

      <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-400">{block.cue}</p>

      {swapped && (
        <p className="mt-2 max-w-prose text-[12px] leading-relaxed text-ink-500">
          {block.jointFriendly!.why}
        </p>
      )}

      {!jointFriendly && block.jointFriendly && (
        <p className="mt-2 text-[12px] leading-relaxed text-ink-500">
          Easier on the joints: {block.jointFriendly.exercise}.
        </p>
      )}
    </li>
  );
}

function WorkoutCard({
  workout,
  jointFriendly,
  index,
}: {
  workout: Workout;
  jointFriendly: boolean;
  index: number;
}) {
  return (
    <Card
      className="motion-safe:animate-fade-up"
      style={{ animationDelay: `${Math.min(index, 6) * 50}ms` }}
    >
      <CardContent className="p-4 pt-4 sm:p-6 sm:pt-6">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-semibold leading-snug text-ink-50">
              {workout.name}
            </h3>
            <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-ink-400">
              {workout.intent}
            </p>
          </div>
          <Badge tone="neutral" className="shrink-0">
            {workout.level}
          </Badge>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-500">
          <span className="inline-flex items-center gap-1">
            <Timer className="h-3.5 w-3.5" />
            about <span className="stat-mono">{workout.minutes}</span> min
          </span>
          <span className="inline-flex items-center gap-1">
            <Repeat className="h-3.5 w-3.5" />
            <span className="stat-mono">{totalSets(workout)}</span> working sets
          </span>
          <span className="inline-flex items-center gap-1">
            <Dumbbell className="h-3.5 w-3.5" />
            <span className="stat-mono">{workout.blocks.length}</span> movements
          </span>
        </div>

        <ul className="mt-4 space-y-2.5">
          {workout.blocks.map((b) => (
            <BlockRow key={b.exercise} block={b} jointFriendly={jointFriendly} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function DayStrip({
  week,
  active,
  onPick,
}: {
  week: DaySession[];
  active: string;
  onPick: (day: string) => void;
}) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {DAYS.map((d) => {
        const session = week.find((s) => s.block.day === d);
        const isActive = d === active;
        return (
          <button
            key={d}
            onClick={() => onPick(d)}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "focus-ring w-[86px] shrink-0 rounded-2xl border px-2.5 py-2.5 text-left transition-colors motion-reduce:transition-none",
              isActive
                ? "border-gold-400/40 bg-gold-400/12"
                : "border-ink-700 bg-ink-900/40 hover:border-ink-600",
            )}
          >
            <span
              className={cn(
                "block text-[11px] font-semibold uppercase tracking-wide",
                isActive ? "text-gold-200" : "text-ink-400",
              )}
            >
              {d}
              {d === TODAY && <span className="ml-1 text-gold-300">•</span>}
            </span>
            <span className="mt-1 block text-[11px] leading-tight text-ink-500">
              {session ? session.block.focus.replace(" — ", " ") : "—"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function WorkoutLibrary({ client }: { client: Client }) {
  const week = React.useMemo(() => weekFor(client.id), [client.id]);
  const [day, setDay] = React.useState<string>(TODAY);
  // Defaults to on when the plan flagged joint pain; always available to change.
  const [jointFriendly, setJointFriendly] = React.useState(needsJointCare(client));

  const session = workoutsFor(client.id, day);

  if (week.length === 0 || !session) {
    return (
      <EmptyState
        title="Your week isn't built yet"
        hint="Once your plan is set, your sessions for each day show up here."
      />
    );
  }

  return (
    <div className="space-y-5">
      <DayStrip week={week} active={day} onPick={setDay} />

      {/* The plan's own line, verbatim ----------------------------------- */}
      <Card className="border-gold-400/25 bg-gold-400/[0.05]">
        <CardContent className="p-4 pt-4 sm:p-6 sm:pt-6">
          <p className="label-eyebrow">From your plan — {session.block.day}</p>
          <h2 className="mt-2 font-display text-xl font-semibold text-ink-50 sm:text-2xl">
            {FOCUS_LABEL[session.focus]}
          </h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-300">
            {session.block.detail}
          </p>
          <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-ink-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Your coach set this split. The sessions below are ways to train it — pick whichever one suits
            the day, the gym you are in, and how you feel.
          </p>
        </CardContent>
      </Card>

      {/* Joint-friendly switch ------------------------------------------- */}
      {session.workouts.length > 0 && (
        <div className="hairline flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-ink-900/50 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-50">Joint-friendly versions</p>
            <p className="mt-1 max-w-prose text-[12px] leading-relaxed text-ink-500">
              {session.jointCare
                ? "Your plan flagged joint pain, so these are on by default. Turn them off any time you feel good."
                : "Swaps that keep the same stimulus with less load through the joint. Use them on any day your body is asking you to."}
            </p>
          </div>
          <button
            role="switch"
            aria-checked={jointFriendly}
            onClick={() => setJointFriendly((v) => !v)}
            className={cn(
              "focus-ring relative h-7 w-12 shrink-0 rounded-full border transition-colors motion-reduce:transition-none",
              jointFriendly ? "border-gold-400/40 bg-gold-500/70" : "border-ink-600 bg-ink-700",
            )}
          >
            <span className="sr-only">Use joint-friendly substitutions</span>
            <span
              className={cn(
                "absolute top-0.5 h-5 w-5 rounded-full bg-ink-50 transition-transform motion-reduce:transition-none",
                jointFriendly ? "translate-x-[26px]" : "translate-x-1",
              )}
            />
          </button>
        </div>
      )}

      {/* Sessions --------------------------------------------------------- */}
      {session.workouts.length === 0 ? (
        <EmptyState
          title={`Nothing to train on ${session.block.day}`}
          hint={session.block.detail}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {session.workouts.map((w, i) => (
            <WorkoutCard key={w.id} workout={w} jointFriendly={jointFriendly} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
