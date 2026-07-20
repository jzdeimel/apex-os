"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-1 overflow-x-auto rounded-xl border border-ink-700/70 bg-ink-850/60 p-1",
        className,
      )}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "relative whitespace-nowrap rounded-lg px-3.5 py-1.5 text-body font-medium transition-colors focus-ring",
            active === t.id
              ? "bg-gold-400/15 text-gold-200"
              : "text-ink-400 hover:text-ink-100",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span
              className={cn(
                "ml-1.5 rounded-full px-1.5 py-0.5 text-micro font-mono",
                active === t.id ? "bg-gold-400/20 text-gold-200" : "bg-ink-700 text-ink-300",
              )}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
