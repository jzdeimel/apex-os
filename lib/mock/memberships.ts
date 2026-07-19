import type { Membership, MembershipTier } from "@/lib/types";
import { clients } from "@/lib/mock/clients";
import { seededRandom } from "@/lib/utils";

/**
 * Memberships — owned by Apex.
 *
 * This file replaces the former `mindbody.ts`, and the difference is the whole
 * point of the architecture: that file modelled a *mirror* of an external
 * record, complete with a `lastSyncedAt` timestamp and a sync state that could
 * read "Conflict". Apex is the system of record, so none of those fields exist
 * here. There is no sync, therefore there is nothing to be out of sync.
 *
 * What used to be an integration concern is now three plain questions Apex can
 * answer itself: what plan is this member on, what does it bill, and when does
 * it renew.
 */

const TIER_ORDER: MembershipTier[] = [
  "Single Visit",
  "Alpha Monthly",
  "Alpha Elite",
  "Alpha Concierge",
];

/** Monthly recurring price in whole dollars. Single Visit is pay-as-you-go. */
export const TIER_PRICE: Record<MembershipTier, number> = {
  "Single Visit": 0,
  "Alpha Monthly": 299,
  "Alpha Elite": 549,
  "Alpha Concierge": 1200,
};

/** What each tier actually includes — surfaced to the client in the portal. */
export const TIER_BENEFITS: Record<MembershipTier, string[]> = {
  "Single Visit": ["Pay per visit", "Lab panels billed separately"],
  "Alpha Monthly": [
    "Monthly provider check-in",
    "Quarterly lab panel",
    "Coach messaging",
  ],
  "Alpha Elite": [
    "Everything in Monthly",
    "Body composition scan each visit",
    "Priority booking",
    "10% protocol credit",
  ],
  "Alpha Concierge": [
    "Everything in Elite",
    "Direct provider line",
    "Same-week appointments",
    "Included peptide protocol allowance",
  ],
};

const STATUS_ROLL: Membership["status"][] = ["Active", "Active", "Active", "Paused", "Lapsed"];

function tierFor(lifetimeValue: number): MembershipTier {
  if (lifetimeValue > 9000) return "Alpha Concierge";
  if (lifetimeValue > 5000) return "Alpha Elite";
  if (lifetimeValue > 1000) return "Alpha Monthly";
  return "Single Visit";
}

export const memberships: Membership[] = clients.map((c) => {
  const rand = seededRandom(c.id + "mem");
  const tier = tierFor(c.lifetimeValue);
  const isPaid = tier !== "Single Visit";

  // Renewal day is stable per member so the billing calendar is deterministic.
  const renewalDay = 1 + Math.floor(rand() * 27);
  const status: Membership["status"] = isPaid
    ? STATUS_ROLL[Math.floor(rand() * STATUS_ROLL.length)]
    : "Active";

  return {
    id: `mem-${c.id.slice(-3)}`,
    clientId: c.id,
    tier,
    status,
    monthlyRate: TIER_PRICE[tier],
    startedOn: c.joinedOn,
    renewsOn: status === "Lapsed" ? undefined : `2026-07-${String(renewalDay).padStart(2, "0")}`,
    visitsYTD: Math.round(2 + rand() * 22),
    lifetimeSpend: c.lifetimeValue,
    /** Credit carried by the higher tiers, spendable against protocols. */
    protocolCreditCents: tier === "Alpha Concierge" ? 25_000 : tier === "Alpha Elite" ? 7_500 : 0,
  };
});

export const membershipByClient: Record<string, Membership> = Object.fromEntries(
  memberships.map((m) => [m.clientId, m]),
);

export function membershipForClient(clientId: string): Membership | undefined {
  return membershipByClient[clientId];
}

/** Members whose plan bills — the population MRR is computed from. */
export function billingMembers(): Membership[] {
  return memberships.filter((m) => m.status === "Active" && m.monthlyRate > 0);
}

export function tierRank(tier: MembershipTier): number {
  return TIER_ORDER.indexOf(tier);
}
