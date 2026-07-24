import {
  Dna,
  Sparkles,
  Zap,
  Flame,
  Wind,
  Moon,
  Droplet,
  Droplets,
  Dumbbell,
  Activity,
  FlaskConical,
  Syringe,
  TestTube,
  Leaf,
  Scale,
  HeartPulse,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface IconMeta {
  icon: LucideIcon;
  color: string;
  glow: string;
}

// Ordered matchers — first substring hit wins.
const MAP: { match: string[]; meta: IconMeta }[] = [
  { match: ["bpc-157", "bpc157"], meta: { icon: HeartPulse, color: "var(--c-optimal)", glow: "rgba(52,211,153,0.18)" } },
  { match: ["ghk-cu", "ghk"], meta: { icon: Sparkles, color: "var(--chart-series-4)", glow: "rgba(167,139,250,0.18)" } },
  { match: ["nad+", "nad"], meta: { icon: Zap, color: "var(--c-watch)", glow: "rgba(224,189,110,0.2)" } },
  { match: ["pt-141", "pt141"], meta: { icon: Flame, color: "var(--c-high)", glow: "rgba(248,113,113,0.18)" } },
  { match: ["vip nasal", "vip"], meta: { icon: Wind, color: "var(--chart-series-6)", glow: "rgba(45,212,191,0.18)" } },
  { match: ["mk-677", "ibutamoren", "mk677"], meta: { icon: Moon, color: "#818cf8", glow: "rgba(129,140,248,0.18)" } },
  { match: ["semaglutide", "sema"], meta: { icon: Droplet, color: "var(--c-low)", glow: "rgba(96,165,250,0.18)" } },
  { match: ["tirzepatide", "tirz"], meta: { icon: Droplets, color: "#38bdf8", glow: "rgba(56,189,248,0.18)" } },
  { match: ["tesofensine", "teso"], meta: { icon: Activity, color: "#fbbf24", glow: "rgba(251,191,36,0.18)" } },
  { match: ["testosterone", "hormone", "cypionate"], meta: { icon: Dumbbell, color: "var(--chart-brand)", glow: "rgba(233,61,61,0.2)" } },
  { match: ["thyroid"], meta: { icon: Activity, color: "var(--chart-series-6)", glow: "rgba(45,212,191,0.18)" } },
  { match: ["nutrition"], meta: { icon: Leaf, color: "#4ade80", glow: "rgba(74,222,128,0.18)" } },
  { match: ["body scan", "scan"], meta: { icon: Scale, color: "var(--chart-axis)", glow: "rgba(148,161,166,0.18)" } },
  { match: ["aesthetics"], meta: { icon: Sparkles, color: "#f0abfc", glow: "rgba(240,171,252,0.18)" } },
  { match: ["lab kit", "panel", "kit"], meta: { icon: TestTube, color: "#9ca3af", glow: "rgba(156,163,175,0.16)" } },
  { match: ["injection"], meta: { icon: Syringe, color: "#9ca3af", glow: "rgba(156,163,175,0.16)" } },
  { match: ["iv supplies", "iv ", "infusion"], meta: { icon: Droplet, color: "var(--c-low)", glow: "rgba(125,211,252,0.16)" } },
];

const FALLBACK: IconMeta = { icon: Dna, color: "var(--chart-brand)", glow: "rgba(233,61,61,0.18)" };

export function peptideMeta(name: string): IconMeta {
  const n = name.toLowerCase();
  for (const m of MAP) {
    if (m.match.some((k) => n.includes(k))) return m.meta;
  }
  return FALLBACK;
}

export function PeptideIcon({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const meta = peptideMeta(name);
  const Icon = meta.icon;
  const dims =
    size === "xs" ? "h-6 w-6" : size === "sm" ? "h-8 w-8" : size === "lg" ? "h-12 w-12" : "h-10 w-10";
  const iconSize = size === "xs" ? "h-3 w-3" : size === "sm" ? "h-4 w-4" : size === "lg" ? "h-6 w-6" : "h-5 w-5";
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-xl border", dims, className)}
      style={{ color: meta.color, borderColor: `${meta.color}40`, background: meta.glow }}
    >
      <Icon className={iconSize} />
    </span>
  );
}

export function PeptideDot({ name }: { name: string }) {
  const meta = peptideMeta(name);
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
    </span>
  );
}
