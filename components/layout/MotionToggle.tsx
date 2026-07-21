"use client";

import { Sparkles, Minus } from "lucide-react";
import { useGamification } from "@/lib/portalStore";

/**
 * Motion toggle.
 *
 * The real control behind whether the app animates. It was dead code until now
 * (the `playOn` state existed but nothing read it); wiring it here gives the
 * member a switch, and — more importantly — makes motion the DEFAULT again for
 * viewers whose OS had "reduce motion" on and were seeing a frozen app.
 *
 * On = animations play (the default). Off = calm, static, every transition
 * neutralised. Deliberately small and unobtrusive; it is a preference, not a
 * primary action.
 */
export function MotionToggle() {
  const { on, setOn } = useGamification();
  return (
    <button
      type="button"
      onClick={() => setOn(!on)}
      aria-pressed={on}
      title={on ? "Motion on — tap for a calm, still interface" : "Motion off — tap to bring the interface to life"}
      aria-label={on ? "Turn motion off" : "Turn motion on"}
      className={
        "focus-ring grid h-8 w-8 place-items-center rounded-lg border transition-colors " +
        (on
          ? "border-gold-400/30 bg-gold-400/10 text-gold-300 hover:bg-gold-400/15"
          : "border-ink-700 text-ink-500 hover:text-ink-200")
      }
    >
      {on ? <Sparkles className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
    </button>
  );
}
