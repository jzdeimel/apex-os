"use client";

import { motion } from "framer-motion";
import type { AlphaScoreResult } from "@/lib/alphaScore";
import { scoreColor } from "@/lib/alphaScore";
import { cn } from "@/lib/utils";

export function AlphaScoreRing({
  result,
  size = 64,
  showLabel = true,
}: {
  result: AlphaScoreResult;
  size?: number;
  showLabel?: boolean;
}) {
  const stroke = size >= 56 ? 5 : 4;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const color = scoreColor(result.band);
  const dash = (result.score / 100) * circ;

  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#23272d" strokeWidth={stroke} />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ - dash }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
        <div className="absolute flex flex-col items-center leading-none">
          <span className="stat-mono font-bold text-ink-50" style={{ fontSize: size * 0.3 }}>
            {result.score}
          </span>
          {size >= 56 && <span className="text-[8px] uppercase tracking-wide text-ink-500">score</span>}
        </div>
      </div>
      {showLabel && (
        <div>
          <span className="block text-[10px] uppercase tracking-wide text-ink-600">Alpha Score</span>
          <span className="text-sm font-medium" style={{ color }}>
            {result.label}
          </span>
          {!result.hasLabs && <span className="block text-[10px] text-ink-600">provisional · pending labs</span>}
        </div>
      )}
    </div>
  );
}

export function AlphaScoreChip({ result }: { result: AlphaScoreResult }) {
  const color = scoreColor(result.band);
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium")}
      style={{ borderColor: `${color}55`, background: `${color}1a`, color }}
    >
      <span className="stat-mono font-bold">{result.score}</span>
      {result.hasLabs ? result.label : "prov."}
    </span>
  );
}
