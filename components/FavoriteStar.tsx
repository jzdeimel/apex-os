"use client";

import { Star } from "lucide-react";
import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function FavoriteStar({
  clientId,
  className,
  size = 16,
}: {
  clientId: string;
  className?: string;
  size?: number;
}) {
  const { favorites, toggleFavorite } = useStore();
  const active = !!favorites[clientId];

  return (
    <motion.button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(clientId);
      }}
      whileTap={{ scale: 0.8 }}
      aria-label={active ? "Remove from favorites" : "Add to favorites"}
      className={cn(
        "pointer-events-auto grid place-items-center rounded-full p-1.5 transition-colors",
        active ? "text-gold-400 hover:text-gold-300" : "text-ink-500 hover:text-ink-200",
        className,
      )}
    >
      <Star className={cn(active && "fill-gold-400")} style={{ width: size, height: size }} />
    </motion.button>
  );
}
