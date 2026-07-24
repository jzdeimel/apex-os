import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { CountUp } from "@/components/CountUp";
import { Sparkline } from "@/components/charts";

export function DashboardCard({
  label,
  value,
  countTo,
  countPrefix,
  countSuffix,
  countDecimals,
  spark,
  sparkColor,
  icon,
  delta,
  deltaTone = "up",
  hint,
  accent,
  className,
}: {
  label: string;
  value?: React.ReactNode;
  countTo?: number;
  countPrefix?: string;
  countSuffix?: string;
  countDecimals?: number;
  spark?: number[];
  sparkColor?: string;
  icon?: React.ReactNode;
  delta?: string;
  deltaTone?: "up" | "down" | "flat";
  hint?: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "card card-hover group relative flex h-full flex-col overflow-hidden p-4 transition-all hover:-translate-y-0.5 sm:p-5",
        accent && "border-gold-400/30 bg-gradient-to-br from-gold-400/[0.07] to-transparent",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="label-eyebrow">{label}</span>
        {icon && (
          <span
            className={cn(
              "grid h-8 w-8 place-items-center rounded-lg transition-transform group-hover:scale-110",
              accent ? "bg-gold-400/15 text-gold-300" : "bg-ink-800 text-ink-400",
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className="font-display text-title font-bold tracking-tight text-ink-50 sm:text-title">
          {countTo !== undefined ? (
            <CountUp value={countTo} prefix={countPrefix} suffix={countSuffix} decimals={countDecimals} />
          ) : (
            value
          )}
        </span>
        {delta && (
          <span
            className={cn(
              "mb-1 inline-flex items-center gap-0.5 text-detail font-medium",
              deltaTone === "up" && "text-optimal",
              deltaTone === "down" && "text-high",
              deltaTone === "flat" && "text-ink-400",
            )}
          >
            {deltaTone === "up" && <ArrowUpRight className="h-3 w-3" />}
            {deltaTone === "down" && <ArrowDownRight className="h-3 w-3" />}
            {delta}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-detail text-ink-500">{hint}</p>}
      {spark && spark.length > 1 && (
        <div className="-mx-1 mt-auto pt-2 opacity-70 transition-opacity group-hover:opacity-100">
          <Sparkline data={spark} color={sparkColor ?? (accent ? "var(--chart-brand)" : "#5d646f")} />
        </div>
      )}
    </div>
  );
}
