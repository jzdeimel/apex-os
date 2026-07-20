"use client";

import { HandoffPacket } from "@/components/coach/HandoffPacket";

/**
 * Coach · Handoff — cover packets.
 *
 * The problem this replaces is not a missing screen, it is a missing
 * conversation: a coach goes on holiday and the covering coach inherits a
 * roster with none of the context that made it a relationship. Everything on
 * this page already existed in the record; it was just never assembled into
 * something a second person could read.
 */
export default function CoachHandoffPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="label-eyebrow">COACH</p>
        <h1 className="mt-1 font-display text-title font-semibold tracking-tight text-ink-50">
          Handoff packet
        </h1>
        <p className="mt-2 text-body text-ink-400">
          Everything a covering coach needs for the next two weeks: where each member is, what was
          last discussed, what is open, what is due, and the one thing that matters most — ranked
          by who will need the most attention while you are out.
        </p>
      </header>

        <HandoffPacket />
    </div>
  );
}
