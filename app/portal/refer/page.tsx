"use client";

/**
 * Portal · Refer a friend.
 *
 * The anniversary card sits ABOVE the referral block on purpose, and the order
 * is the argument: the honest moment to ask a member for an introduction is
 * right after they've been reminded that this worked for them. Asking cold, on
 * a page that exists only to ask, is how a clinic turns patients into a channel.
 *
 * `Anniversary` renders nothing when the member has no milestone yet, so a
 * three-week member sees the referral block alone rather than an empty
 * celebration — which is the correct thing to show someone with nothing to
 * celebrate yet.
 */

import { PortalPageHeader } from "@/components/portal/PortalHeader";
import { Anniversary } from "@/components/portal/Anniversary";
import { ReferAFriend } from "@/components/portal/ReferAFriend";

export default function PortalReferPage() {
  return (
    <div className="space-y-8">
      <PortalPageHeader
        eyebrow="Refer a friend"
        title="Know someone we could help?"
        subtitle="No pressure and no quotas — but if someone in your life has been describing your symptoms back to you, this is the easiest introduction you'll ever make."
      />

      <Anniversary compact />

      <ReferAFriend />
    </div>
  );
}
