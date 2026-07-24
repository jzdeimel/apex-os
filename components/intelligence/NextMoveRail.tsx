"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  FlaskConical,
  MessageSquare,
  Package,
  PenLine,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Workflow,
} from "lucide-react";
import { motion } from "framer-motion";
import type { MoveIcon, NextMove } from "@/lib/intelligence/types";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const ICONS: Record<MoveIcon, React.ElementType> = {
  spark: Sparkles,
  message: MessageSquare,
  calendar: CalendarClock,
  flask: FlaskConical,
  signature: PenLine,
  package: Package,
  growth: TrendingUp,
  money: Banknote,
  room: Workflow,
  shield: ShieldCheck,
};

const TONE: Record<NextMove["tone"], { border: string; icon: string; badge: React.ComponentProps<typeof Badge>["tone"] }> = {
  neutral: { border: "border-ink-700/70", icon: "text-ink-400", badge: "neutral" },
  gold: { border: "border-gold-400/35", icon: "text-gold-300", badge: "gold" },
  optimal: { border: "border-optimal/35", icon: "text-optimal", badge: "optimal" },
  watch: { border: "border-watch/35", icon: "text-watch", badge: "watch" },
  high: { border: "border-high/35", icon: "text-high", badge: "high" },
  low: { border: "border-low/35", icon: "text-low", badge: "low" },
  info: { border: "border-low/30", icon: "text-low", badge: "info" },
};

function MoveCard({ move, index }: { move: NextMove; index: number }) {
  const Icon = ICONS[move.icon];
  const tone = TONE[move.tone];
  const inner = (
    <>
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink-900", tone.icon)}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone={tone.badge}>{move.owner}</Badge>
            {move.metric && <span className="stat-mono text-micro text-ink-500">{move.metric}</span>}
          </span>
          <span className="mt-2 block text-body font-semibold leading-tight text-ink-50">{move.title}</span>
          <span className="mt-1.5 line-clamp-2 block text-detail leading-snug text-ink-400">{move.detail}</span>
        </span>
        {move.href && <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-ink-600" />}
      </div>
    </>
  );

  const className = cn(
    "group block min-h-[9rem] rounded-lg border bg-ink-900/45 p-3.5 transition-colors",
    tone.border,
    move.href && "hover:border-ink-500 focus-ring",
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, delay: index * 0.045, ease: [0.22, 1, 0.36, 1] }}
      whileHover={move.href ? { y: -2 } : undefined}
    >
      {move.href ? (
        <Link href={move.href} className={className}>
          {inner}
        </Link>
      ) : (
        <div className={className}>{inner}</div>
      )}
    </motion.div>
  );
}

export function NextMoveRail({
  eyebrow = "Apex intelligence",
  title,
  detail,
  moves,
  className,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  moves: NextMove[];
  className?: string;
}) {
  if (moves.length === 0) return null;
  return (
    <section className={cn("rounded-panel border border-ink-800 bg-ink-950/35 p-4 sm:p-5", className)}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="label-eyebrow">{eyebrow}</p>
          <h2 className="mt-1 font-display text-heading font-semibold text-ink-50">{title}</h2>
        </div>
        {detail && <p className="max-w-xl text-detail leading-snug text-ink-500">{detail}</p>}
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        {moves.map((move, index) => (
          <MoveCard key={move.id} move={move} index={index} />
        ))}
      </div>
    </section>
  );
}
