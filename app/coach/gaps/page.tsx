"use client";

import * as React from "react";
import { staffName } from "@/lib/mock/staff";
import { CareGaps } from "@/components/coach/CareGaps";
import { ME_COACH } from "@/components/coach/TodayQueue";

/**
 * Coach · Care gaps
 *
 * The clinical counterpart to the member's "what's available" surface. Where
 * that page answers "what could I have", this one answers "what should this
 * member already have that they don't" — and it answers it from their own plan
 * of care, panel, protocol and calendar.
 *
 * Scoped to `ME_COACH`, same as every other coach surface. A gap board that
 * shows the whole practice under the heading "your members" is how a coach ends
 * up calling somebody else's patient about somebody else's lab.
 *
 * The board is the page: one framing paragraph, then rows. Everything a coach
 * needs to argue with a row — the dates, the markers, the plan checkpoint that
 * produced it — is inside the row itself.
 */
export default function CareGapsPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="label-eyebrow">COACH CONSOLE</p>
        <h1 className="mt-1 font-display text-title font-semibold tracking-tight text-ink-50">
          Care gaps
        </h1>
        <p className="mt-2 max-w-prose text-body text-ink-400">
          What the members on {staffName(ME_COACH)}&apos;s book are clinically missing — rechecks
          their plan scheduled and nobody drew, protocols with nothing booked, plans still waiting on
          a signature, and findings on a panel that no plan item addresses. Each row carries the
          records that produced it. Nothing here is an upsell.
        </p>
      </header>

      <CareGaps coachId={ME_COACH} />
    </div>
  );
}
