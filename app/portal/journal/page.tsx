"use client";

/**
 * Journal — /portal/journal
 *
 * How a member feels is the highest-value data in the whole record and the only
 * data no panel can produce. Six ratings a day, a sentence when there is one to
 * write, and then the part that makes it worth doing: seeing where those ratings
 * line up with everything else on file.
 *
 * The correlation section is member-facing and therefore hedged in the data
 * itself, not only in the copy — see the header comment in
 * `lib/symptoms/journal.ts` before touching any of it.
 */

import { SymptomJournal } from "@/components/portal/SymptomJournal";
import { SymptomSignal } from "@/components/portal/SymptomSignal";
import { useMeClient, PortalPageHeader } from "@/components/portal/PortalHeader";

export default function PortalJournalPage() {
  // Audit fix (GAP_ANALYSIS.md, "Portal renderable as a woman"): this was the
  // module constant ME, which pinned the portal to one male member.
  const client = useMeClient();

  return (
    <div className="space-y-8">
      <PortalPageHeader
        eyebrow="Your journal"
        title="How you actually feel"
        subtitle="Six quick ratings a day. Over time it shows you the shape of your weeks and flags anything worth raising with your coach — as a question for them, never as an answer."
      />

      {/* The payoff, directly under the header rather than at the bottom.
          Logging is work and the reward for it was previously three screens
          down; a member who scrolls past the check-in should hit the reason to
          have done it before they hit the charts. Read
          lib/member/symptomSignal.ts before touching anything inside it — the
          safety constraints on this card are structural, not editorial. */}
      <SymptomSignal client={client} />

      <SymptomJournal client={client} />
    </div>
  );
}
