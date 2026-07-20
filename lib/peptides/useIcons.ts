import {
  Activity,
  Baby,
  BatteryCharging,
  Bone,
  Droplet,
  Dumbbell,
  Flame,
  Moon,
  Scale,
  Sparkles,
  TrendingDown,
  Zap,
} from "lucide-react";
import type { PeptideUse } from "@/lib/peptides/library";

/**
 * An icon for what a compound is FOR, not what it is made of.
 *
 * The library used to lead with a molecular diagram. It was accurate and it was
 * useless: a member scanning for "what helps me sleep" cannot read a backbone,
 * and neither can most coaches. The molecule answered a question nobody in
 * either portal was asking.
 *
 * Leading with the outcome instead makes the gallery scannable at a glance,
 * which is the actual job of a card in a grid.
 */
export const USE_ICON: Record<PeptideUse, typeof Activity> = {
  "Injury repair": Activity,
  "Joint & tendon": Bone,
  "Weight loss": TrendingDown,
  "Blood sugar": Droplet,
  "Sleep quality": Moon,
  "Lean mass": Dumbbell,
  Recovery: BatteryCharging,
  Libido: Flame,
  Energy: Zap,
  "Skin & antioxidant": Sparkles,
  Fertility: Baby,
  "Hormone balance": Scale,
};

/**
 * The use a compound leads with.
 *
 * `commonlyUsedFor` is ordered most-characteristic-first in the library, so the
 * first entry is the honest headline rather than an arbitrary pick.
 */
export function primaryUse(uses: PeptideUse[]): PeptideUse | undefined {
  return uses[0];
}

export function iconForUses(uses: PeptideUse[]): typeof Activity {
  const u = primaryUse(uses);
  return u ? USE_ICON[u] : Activity;
}
