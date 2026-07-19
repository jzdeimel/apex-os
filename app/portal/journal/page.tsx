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
import { me, PortalPageHeader } from "@/components/portal/PortalHeader";

export default function PortalJournalPage() {
  const client = me();

  return (
    <div className="space-y-8">
      <PortalPageHeader
        eyebrow="Your journal"
        title="How you actually feel"
        subtitle="Six quick ratings a day. Over time it shows you the shape of your weeks and flags anything worth raising with your coach — as a question for them, never as an answer."
      />
      <SymptomJournal client={client} />
    </div>
  );
}
