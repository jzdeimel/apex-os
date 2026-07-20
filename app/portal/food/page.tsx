"use client";

/**
 * Food — /portal/food
 *
 * Every plan of care ends with a calorie and protein target, and every member
 * then has to answer "so what do I cook". This page is that answer: the targets
 * with their origin visible, and a library of real recipes ranked against those
 * targets rather than against a generic idea of healthy.
 */

import { MealLibrary } from "@/components/portal/MealLibrary";
import { useMeClient, PortalPageHeader } from "@/components/portal/PortalHeader";

export default function PortalFoodPage() {
  // Audit fix (GAP_ANALYSIS.md, "Portal renderable as a woman"): this was the
  // module constant ME, which pinned the portal to one male member.
  const client = useMeClient();

  return (
    <div className="space-y-8">
      <PortalPageHeader
        eyebrow="Your food"
        title="What to actually eat"
        subtitle="Real recipes, ranked against the targets your plan set. Every card shows how much of your day it covers, so you never have to do the arithmetic yourself."
      />
      <MealLibrary client={client} />
    </div>
  );
}
