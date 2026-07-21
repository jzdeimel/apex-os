"use client";

/**
 * Cost clarity — /portal/costs
 *
 * The clinic advertises "HSA/FSA accepted" and then shows people a card
 * charge. This page does the arithmetic in front of the member and shows the
 * working, because a member who cannot explain their own bill assumes the worst
 * number they can imagine and cancels a protocol that was working.
 *
 * ── WHY THE REFILL RUNWAY IS ALSO HERE ────────────────────────────────────
 * Supply and money are the same question asked twice. "What am I paying for
 * every month" and "what is arriving, and when" have the same answer — the
 * recurring items — and a member reading the cost of an auto-refill is exactly
 * the member who wants to know when the next one lands and whether they can
 * pull it forward. `RefillRunway` is self-contained, so it also stands alone
 * anywhere else in the portal it is mounted.
 */

import { RefillRunway } from "@/components/portal/RefillRunway";
import { CostClarity } from "@/components/portal/CostClarity";
import { MembershipTiers } from "@/components/portal/MembershipTiers";
import { useMeClient, PortalPageHeader } from "@/components/portal/PortalHeader";

export default function PortalCostsPage() {
  // Audit fix (GAP_ANALYSIS.md, "Portal renderable as a woman"): this was the
  // module constant ME, which pinned the portal to one male member.
  const client = useMeClient();

  return (
    <div className="space-y-8">
      <PortalPageHeader
        eyebrow="Your money"
        title="What this actually costs"
        subtitle="Every figure with the sentence that produced it, what your membership already covers, and what is plausibly HSA or FSA eligible."
      />

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-title font-semibold text-ink-50">What is on its way</h2>
          <p className="mt-1.5 max-w-prose text-detail leading-relaxed text-ink-400">
            The recurring items below are what you are paying for. Here is how much of each you have left
            and when the next one is due.
          </p>
        </div>
        <RefillRunway client={client} />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-title font-semibold text-ink-50">The numbers</h2>
          <p className="mt-1.5 max-w-prose text-detail leading-relaxed text-ink-400">
            Membership, recurring protocol, one-offs, and what the membership takes off the top.
          </p>
        </div>
        <CostClarity client={client} />
      </section>

      <section className="space-y-4">
        <MembershipTiers clientId={client.id} />
      </section>
    </div>
  );
}
