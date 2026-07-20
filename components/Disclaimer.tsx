import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Disclaimer({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-gold-400/25 bg-gold-400/[0.06] px-3.5 py-2.5",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
      <p className={cn("text-gold-200/90", compact ? "text-micro leading-snug" : "text-detail leading-relaxed")}>
        Demo only. Not medical advice. Recommendations require review and
        approval by a licensed provider.
      </p>
    </div>
  );
}

export function AiLabel({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-gold-400/30 bg-gold-400/10 px-2 py-0.5 text-micro font-medium text-gold-200",
        className,
      )}
    >
      AI-assisted · provider/coach review
    </span>
  );
}
