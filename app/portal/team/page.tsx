"use client";

/**
 * Portal · Your care team.
 *
 * The "there are real people behind this" screen. It carries no data the member
 * couldn't infer from elsewhere in the portal, and it earns its route anyway:
 * for a clinic whose product is coach-supported care, the moment a member
 * stops picturing a person is the moment the product becomes a subscription
 * they're paying for out of habit.
 *
 * Deliberately no metrics, no status, no next action. Every other portal page
 * asks something of the member; this one doesn't.
 */

import { PortalPageHeader } from "@/components/portal/PortalHeader";
import { CareTeamProfiles } from "@/components/portal/CareTeamProfiles";

export default function PortalTeamPage() {
  return (
    <div className="space-y-8">
      <PortalPageHeader
        eyebrow="Your care team"
        title="The people in your corner"
        subtitle="A coach who knows how your week actually went and a provider who reads every number before they sign anything. Here's who they are, where they work, and how to reach them."
      />

      <CareTeamProfiles />
    </div>
  );
}
