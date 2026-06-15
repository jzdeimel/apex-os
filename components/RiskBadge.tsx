import type { RiskLevel } from "@/lib/types";
import { Badge } from "@/components/ui/primitives";
import { ShieldAlert, ShieldCheck, Shield } from "lucide-react";

const TONE: Record<RiskLevel, "optimal" | "watch" | "high" | "neutral"> = {
  none: "neutral",
  low: "watch",
  moderate: "watch",
  high: "high",
};
const LABEL: Record<RiskLevel, string> = {
  none: "No flags",
  low: "Low",
  moderate: "Moderate",
  high: "High",
};

export function RiskBadge({ level, showLabel = true }: { level: RiskLevel; showLabel?: boolean }) {
  const Icon = level === "high" ? ShieldAlert : level === "none" ? ShieldCheck : Shield;
  return (
    <Badge tone={TONE[level]}>
      <Icon className="h-3 w-3" />
      {showLabel && LABEL[level]}
    </Badge>
  );
}
