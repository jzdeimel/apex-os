"use client";

/**
 * Rotation — /portal/sites
 *
 * The smallest feature in the portal and the one that most clearly says "this
 * was built for a hormone and peptide clinic, not adapted from a gym app".
 * Members already do this; they do it from memory, badly, and the tissue keeps
 * the score.
 *
 * The screen tracks WHERE and nothing else. No amount, no frequency, no
 * instruction that could be read as clinical direction — see the module header
 * in lib/protocol/sites.ts for why that boundary is structural rather than
 * editorial.
 */

import { InjectionSites } from "@/components/portal/InjectionSites";
import { me, PortalPageHeader } from "@/components/portal/PortalHeader";

export default function PortalSitesPage() {
  const client = me();

  return (
    <div className="space-y-8">
      <PortalPageHeader
        eyebrow="Rotation"
        title="Where to go next"
        subtitle="A map of the spots you use, so no single one takes more than its share. It records the place and the date — never an amount."
      />
      <InjectionSites client={client} />
    </div>
  );
}
