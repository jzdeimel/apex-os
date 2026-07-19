"use client";

import { staffName } from "@/lib/mock/staff";
import { FadeIn } from "@/components/motion";
import { OrderBoard } from "@/components/orders/OrderBoard";
import { ME_COACH } from "@/components/coach/TodayQueue";

/**
 * Coach · Order Board
 *
 * One screen that answers the two questions the old fulfillment view could not:
 * where are all my orders, and which ones are in trouble. Trouble is a first
 * class concept here — an SLA breach is a row on a board, not a phone call from
 * a member three weeks later.
 */
export default function CoachOrdersPage() {
  return (
    <div className="space-y-6">
      <FadeIn>
        <p className="label-eyebrow">COACH CONSOLE</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink-50">
          Order Board
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          Every order for {staffName(ME_COACH)}&apos;s members, problems first — with the actor and
          the system behind every status change, so nothing can move without someone owning it.
        </p>
      </FadeIn>

      <OrderBoard />
    </div>
  );
}
