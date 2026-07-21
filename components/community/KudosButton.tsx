"use client";

import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import { useKudos } from "@/lib/community/kudos";
import { cn } from "@/lib/utils";

/**
 * One-tap kudos. Warm, tiny, and instant — the reaction is the whole point, so
 * it animates on tap and never opens a menu.
 */
export function KudosButton({ itemId, className }: { itemId: string; className?: string }) {
  const { hydrated, hasGiven, countFor, give } = useKudos();
  const given = hydrated && hasGiven(itemId);

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.9 }}
      onClick={() => give(itemId)}
      aria-pressed={given}
      aria-label={given ? "Kudos given" : "Give kudos"}
      className={cn(
        "focus-ring inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-micro font-medium transition-colors",
        given
          ? "border-gold-400/40 bg-gold-400/10 text-gold-300"
          : "border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-100",
        className,
      )}
    >
      <Flame className={cn("h-3.5 w-3.5", given && "fill-gold-400/40")} />
      <span className="stat-mono">{countFor(itemId)}</span>
    </motion.button>
  );
}
