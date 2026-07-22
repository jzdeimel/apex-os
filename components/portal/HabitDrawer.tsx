"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Flame, Trophy } from "lucide-react";
import { useGamification } from "@/lib/portalStore";
import { SeasonArc } from "@/components/portal/SeasonArc";
import { Quests } from "@/components/portal/Quests";
import { LevelCard } from "@/components/portal/LevelCard";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export function HabitDrawer({ clientId }: { clientId: string }) {
  const { on } = useGamification();
  const [open, setOpen] = React.useState(false);

  if (!on) return null;

  return (
    <section className="rounded-panel border border-ink-800 bg-ink-900/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="focus-ring flex w-full items-center justify-between gap-3 rounded-panel px-4 py-3 text-left transition-colors hover:bg-ink-800/35"
      >
        <span className="min-w-0">
          <span className="label-eyebrow block">Habit layer</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone="gold">
              <Flame className="h-3 w-3" />
              streak
            </Badge>
            <Badge tone="neutral">
              <Trophy className="h-3 w-3" />
              quests
            </Badge>
            <span className="text-detail text-ink-500">Season, level and extra challenges</span>
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-ink-500 transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-4 px-4 pb-4">
              <SeasonArc clientId={clientId} />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Quests clientId={clientId} />
                <LevelCard clientId={clientId} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
