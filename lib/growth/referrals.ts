/**
 * Referrals — attribution the clinic can actually bank.
 *
 * Alpha Health grows almost entirely by word of mouth and, until this file,
 * nothing recorded it. Front desk heard "my buddy Jake sent me" at intake, wrote
 * it in a note nobody queried, and the member who did the sending was never
 * thanked or credited. Two things follow from that: the clinic cannot tell which
 * members are its advocates, and advocates stop advocating.
 *
 * The privacy shape of this feature is the hard part, not the funnel maths.
 * See the note on `Referral.refereeConsentedToShare` below — whether a named
 * person became a patient here is itself protected health information, and a
 * referral program is the easiest place in a clinical product to leak it by
 * accident, because leaking it feels like good news.
 *
 * NOTE ON THE IMPORT BELOW: this module and `lib/mock/referrals.ts` reference
 * each other — data flows one way, `referralCodeFor` and the reward constant
 * the other. That cycle is only safe because neither module touches the other
 * while its own body is evaluating: the selectors here read the book inside
 * function bodies, and the book itself is built lazily on first read. An eager
 * `const BOOK = (() => ...)()` over there crashed on a temporal-dead-zone
 * reference to `REFERRER_REWARD_CENTS`, which is the failure mode to remember
 * if either file grows a new top-level dependency on the other.
 */

import { referralsForReferrer } from "@/lib/mock/referrals";

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/**
 * The visible lifecycle of one invite.
 *
 * The ladder stops at Joined on purpose. There is no "Started protocol", no
 * "First labs back", no "Active" — the referrer's view of another human being
 * ends the moment that human becomes a patient, and everything after that point
 * belongs to the patient alone.
 */
export type ReferralStatus = "Shared" | "Clicked" | "Booked" | "Joined" | "Rewarded";

export const REFERRAL_STAGES: ReferralStatus[] = [
  "Shared",
  "Clicked",
  "Booked",
  "Joined",
  "Rewarded",
];

export interface Referral {
  id: string;
  referrerClientId: string;
  /** The referrer's code, denormalised onto the row so attribution survives. */
  code: string;
  sharedAt: string;
  status: ReferralStatus;
  /**
   * Only ever the name the REFEREE gave us, and only shown when they said we
   * could. Never derived from the chart.
   */
  refereeName?: string;
  /**
   * Consent captured at the referee's intake, in their own words: "may we tell
   * <referrer> that you joined?"
   *
   * This flag is the whole privacy design. A referral reward requires the clinic
   * to tell one person that another person became a patient — which is a
   * disclosure, however warm the framing. So the referrer's credit does NOT
   * depend on it: the reward pays either way, and when consent is absent the
   * member simply sees an anonymous "someone you invited joined". The clinic
   * eats the ambiguity rather than making the referee's privacy the price of a
   * $100 credit.
   */
  refereeConsentedToShare: boolean;
  joinedAt?: string;
  /** Integer cents. Account credit, never cash. */
  rewardCents?: number;
}

// ---------------------------------------------------------------------------
// Reward rules — stated here once, rendered verbatim on the member surface.
// ---------------------------------------------------------------------------

/** What the referring member earns, in cents, once their invite joins. */
export const REFERRER_REWARD_CENTS = 10_000;

/** What the person they invited gets off their first visit, in cents. */
export const REFEREE_REWARD_CENTS = 5_000;

/**
 * The rules as a member reads them. Kept as data, not prose baked into JSX, so
 * the screen and the engine can never drift — if the number changes here, the
 * sentence on the page changes with it.
 */
export const REWARD_RULES: string[] = [
  `You get $${REFERRER_REWARD_CENTS / 100} in account credit when someone you invite joins.`,
  `They get $${REFEREE_REWARD_CENTS / 100} off their first visit.`,
  "Credit applies to anything you're billed for here. It is not cash and we can't pay it out.",
  "No limit on how many people you invite, and credit doesn't expire.",
  "We'll never tell you anything about their care — only that they joined, and only if they said that was OK.",
];

// ---------------------------------------------------------------------------
// Codes
// ---------------------------------------------------------------------------

/**
 * A member's referral code. Deterministic, stable forever, readable out loud.
 *
 * Deliberately self-contained — no module-level constants, no imports. This
 * module and `lib/mock/referrals.ts` reference each other (types and data one
 * way, this function the other), and a function that touches a module-scope
 * `const` during a circular evaluation hits the temporal dead zone. Keeping the
 * alphabet inside the body makes the cycle harmless instead of load-order
 * dependent.
 *
 * The alphabet drops 0/O/1/I/L/S/5 because these codes get read over a gym
 * counter, not copy-pasted.
 */
export function referralCodeFor(clientId: string): string {
  const ALPHABET = "ABCDEFGHJKMNPQRTUVWXYZ2346789";
  // Inline FNV-ish hash — same construction as seededRandom in lib/utils, but
  // duplicated rather than imported for the reason above.
  let h = 1779033703 ^ clientId.length;
  for (let i = 0; i < clientId.length; i++) {
    h = Math.imul(h ^ clientId.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let out = "";
  for (let i = 0; i < 5; i++) {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    out += ALPHABET[(h >>> 0) % ALPHABET.length];
  }
  return `ALPHA-${out}`;
}

/** The link a member actually shares. Relative host so it works in any env. */
export function referralLinkFor(clientId: string): string {
  return `goalphahealth.com/join/${referralCodeFor(clientId)}`;
}

// ---------------------------------------------------------------------------
// Funnel
// ---------------------------------------------------------------------------

export function stageRank(status: ReferralStatus): number {
  return REFERRAL_STAGES.indexOf(status);
}

export interface FunnelStage {
  stage: ReferralStatus;
  /** What the member sees. Staff vocabulary ("Clicked") is not member voice. */
  label: string;
  /** How many invites have reached AT LEAST this stage. */
  count: number;
}

/** Member-facing wording for each stage. */
const STAGE_LABEL: Record<ReferralStatus, string> = {
  Shared: "Invites sent",
  Clicked: "Opened your link",
  Booked: "Booked a consult",
  Joined: "Joined Alpha",
  Rewarded: "Credit applied",
};

/**
 * Cumulative funnel: an invite that Joined also counts as Opened and Booked.
 *
 * Terminal-only counting is the classic funnel bug — it makes a healthy program
 * look like it leaks at every step, because the member who converted vanishes
 * from every stage above the one they landed on.
 */
export function funnelFrom(referrals: Referral[]): FunnelStage[] {
  return REFERRAL_STAGES.map((stage) => ({
    stage,
    label: STAGE_LABEL[stage],
    count: referrals.filter((r) => stageRank(r.status) >= stageRank(stage)).length,
  }));
}

export interface ReferralEarnings {
  /** Credit already applied to the account, in cents. */
  earnedCents: number;
  /** Joined but not yet credited — shown so nobody thinks we forgot. */
  pendingCents: number;
  joinedCount: number;
}

export function earningsFrom(referrals: Referral[]): ReferralEarnings {
  const earnedCents = referrals
    .filter((r) => r.status === "Rewarded")
    .reduce((s, r) => s + (r.rewardCents ?? 0), 0);
  const pendingCents = referrals.filter((r) => r.status === "Joined").length * REFERRER_REWARD_CENTS;
  const joinedCount = referrals.filter((r) => stageRank(r.status) >= stageRank("Joined")).length;
  return { earnedCents, pendingCents, joinedCount };
}

/**
 * What the referrer is allowed to see on a row.
 *
 * Single choke point on purpose: every surface that renders a referral must go
 * through this, so a future screen cannot casually read `refereeName` and
 * publish a name the referee never agreed to share.
 */
export function refereeLabel(r: Referral): string {
  if (stageRank(r.status) < stageRank("Joined")) return "Invite sent";
  if (r.refereeConsentedToShare && r.refereeName) return r.refereeName;
  return "Someone you invited";
}

/**
 * The one sentence we're permitted to say about an invite that converted.
 *
 * Note what is absent: no program, no location, no visit date, no "they're
 * doing great". A referrer asking "so how's he doing?" is a question the
 * product must be structurally unable to answer.
 */
export function referralStatusLine(r: Referral): string {
  switch (r.status) {
    case "Shared":
      return "Sent — nothing back yet.";
    case "Clicked":
      return "They opened your link.";
    case "Booked":
      return "They booked a consult.";
    case "Joined":
      return "They joined. Your credit is on its way.";
    case "Rewarded":
      return "They joined. Credit applied to your account.";
  }
}

// ---------------------------------------------------------------------------
// Selectors over the stored book
// ---------------------------------------------------------------------------

export function referralsFor(clientId: string): Referral[] {
  return referralsForReferrer(clientId);
}

export function funnelFor(clientId: string): FunnelStage[] {
  return funnelFrom(referralsFor(clientId));
}

export function earningsFor(clientId: string): ReferralEarnings {
  return earningsFrom(referralsFor(clientId));
}
