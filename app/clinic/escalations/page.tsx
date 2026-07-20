"use client";

import { EscalationQueue } from "@/components/escalations/EscalationQueue";

/**
 * Clinic · Escalations — the provider inbox.
 *
 * This page is the answer to the single most common failure in the clinic it
 * replaces: a coach flags something for the doctor by saying it out loud, and
 * from that moment nobody — not the coach, not the provider, not the member —
 * can tell whether it is being handled. Here it has an owner, a clock, and a
 * state both sides can read.
 */
export default function ClinicEscalationsPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="label-eyebrow">CLINIC</p>
        <h1 className="mt-1 font-display text-title font-semibold tracking-tight text-ink-50">
          Escalations
        </h1>
        <p className="mt-2 text-body text-ink-400">
          Everything a coach has handed to a provider, with the clock running. Overdue first —
          because an escalation nobody can see the state of is the same as no escalation.
        </p>
      </header>

        <EscalationQueue />
    </div>
  );
}
