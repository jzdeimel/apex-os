"use client";

import { staffName } from "@/lib/mock/staff";
import { OrderBoard } from "@/components/orders/OrderBoard";
import { ME_COACH } from "@/components/coach/TodayQueue";
import { AuthoritativeOrderBoard } from "@/components/orders/AuthoritativeOrderBoard";

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
    <div className="space-y-8">
      <header>
        <p className="label-eyebrow">COACH CONSOLE</p>
        <h1 className="mt-1 font-display text-title font-semibold tracking-tight text-ink-50">
          Order Board
        </h1>
        <p className="mt-2 text-body text-ink-400">
          Every order for {staffName(ME_COACH)}&apos;s members, problems first — with the actor and
          the system behind every status change, so nothing can move without someone owning it.
        </p>
      </header>

      <AuthoritativeOrderBoard />

      <div className="border-t border-ink-800 pt-5">
        <p className="label-eyebrow">PLANNING FIXTURES</p>
        <p className="mt-1 text-detail text-ink-500">The visual board below still contains seeded scenarios for workflow design. It is not a list of orders owed to real patients.</p>
      </div>

      <OrderBoard />
    </div>
  );
}
