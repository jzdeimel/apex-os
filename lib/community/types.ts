import type { LocationId } from "@/lib/types";
import type { EscalationKind } from "@/lib/escalations/types";

/**
 * Community — the 80% of the journey that is not medical.
 *
 * ── The one rule this whole module exists to enforce ──────────────────────
 * A clinic community is worth building because adherence is social: people
 * show up for other people. It is dangerous to build because the moment two
 * members start comparing what they are prescribed, the platform is hosting
 * a dosing conversation it did not supervise and cannot defend. Both things
 * are true at once, so the shape of the data has to make the good half easy
 * and the bad half structurally hard.
 *
 * Concretely, two decisions run through every type below:
 *
 *  1. NO CLINICAL SURFACE. There is nowhere in these types to put a dose, a
 *     compound, a lab value or a protocol. Not "we agreed not to" — there is
 *     no field. A `Win` has a headline and a category; the categories are
 *     training, nutrition, consistency and showing up. If a future feature
 *     needs to celebrate a clinical result, that belongs on the member's own
 *     Progress page where only they can see it, not on a wall.
 *
 *  2. HANDLES, NOT NAMES. Every member-visible object carries a `handle`
 *     string at the render boundary — never a `clientId`, never a first and
 *     last name. `CommunityHandle` is the only place the mapping exists, and
 *     it is staff-side data. A member is identified by a real name in the
 *     community ONLY if `realNameOptIn` is true, which is off by default and
 *     is a per-member choice, not a per-post one. People in this clinic are
 *     being treated for low testosterone and obesity; a neighbour recognising
 *     them in a public feed is a disclosure, and defaults decide disclosures.
 */

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * The pseudonymous identity a member wears in community.
 *
 * The clientId lives here and ONLY here. Components receive `handle` and
 * `locationId`; nothing downstream of this record can join a post back to a
 * chart, which is the property that makes the feed safe to render.
 */
export interface CommunityHandle {
  /** Internal join key. Never rendered. Never passed to a component. */
  clientId: string;
  /** What everyone else sees. Generated, stable, e.g. "IronOak42". */
  handle: string;
  /** Drives location-team challenges and meetup relevance. Not a home address. */
  locationId: LocationId;
  /** Community itself is opt-in. False means this member is not in the feed at all. */
  optedIn: boolean;
  /**
   * Explicit, separate consent to be shown under a real name. Default false.
   * Even when true it is a display preference — the handle stays the join key,
   * so revoking it is one boolean and no data migration.
   */
  realNameOptIn: boolean;
  /** Only populated when realNameOptIn is true. */
  displayName?: string;
  /** Member since, for the "been here a while" cue on a post. */
  joinedCommunityOn: string;
}

// ---------------------------------------------------------------------------
// Wins
// ---------------------------------------------------------------------------

/**
 * What a win is allowed to be about.
 *
 * Deliberately closed. An open string here would within a month contain
 * "hit 900 total T" because someone would type it, and a category enum is a
 * cheaper guardrail than a moderation policy nobody reads.
 */
export type WinCategory =
  /** Turned up. The one that actually predicts outcomes. */
  | "Consistency"
  /** Lifted, ran, moved. */
  | "Training"
  /** Cooked it, hit protein, packed lunch. */
  | "Nutrition"
  /** Slept, walked, took the recovery day. */
  | "Recovery"
  /** Life outside the gym that got easier. */
  | "Life";

export interface Win {
  id: string;
  /** Pseudonymous author. Never a clientId. */
  handle: string;
  locationId: LocationId;
  category: WinCategory;
  /** Short, human, no numbers that could be clinical. "12 weeks consistent." */
  headline: string;
  /** One sentence of colour. Still no clinical content. */
  detail?: string;
  postedAt: string;
  /** Cheer count. The only reaction — see WinsWall for why there is no reply. */
  cheers: number;
}

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------

/**
 * A team is a LOCATION, always.
 *
 * The alternative — individual leaderboards — is the single worst thing you
 * can ship to this population. See components/community/Challenges.tsx for the
 * full argument; the type enforces the conclusion by having no per-member
 * score field to render.
 */
export interface ChallengeTeam {
  locationId: LocationId;
  /** Display label, e.g. "Raleigh". */
  name: string;
  /** How many members are contributing. A headcount, not a ranking. */
  participants: number;
  /** Aggregate progress toward `goal`, in the challenge's unit. */
  total: number;
  /** The team's target. Scaled by headcount so a small clinic can still win. */
  goal: number;
}

export type ChallengeMetric =
  /** Steps, miles, sessions — anything you do. */
  | "Movement"
  /** Meals hit, protein days logged. */
  | "Nutrition"
  /** Days shown up, streaks held. */
  | "Consistency";

export interface Challenge {
  id: string;
  name: string;
  /** One line a member reads and instantly knows what to do today. */
  premise: string;
  metric: ChallengeMetric;
  /** Unit for the aggregate, e.g. "steps", "protein days". */
  unit: string;
  startsOn: string;
  endsOn: string;
  teams: ChallengeTeam[];
}

// ---------------------------------------------------------------------------
// Coach group
// ---------------------------------------------------------------------------

/**
 * A group is hosted by a named, licensed-or-certified human who is visibly the
 * moderator. There is no such thing here as an unmoderated forum — see
 * components/community/CoachGroup.tsx.
 */
export interface CoachGroup {
  id: string;
  name: string;
  /** StaffMember id. Rendered with name and credentials, always. */
  coachId: string;
  /** What this group is for, and — importantly — what it is not for. */
  charter: string;
  memberCount: number;
}

export interface GroupPost {
  id: string;
  groupId: string;
  /** Pseudonymous for members. For a coach post this is their real name. */
  handle: string;
  /** Coach posts render with the moderator badge and are never anonymous. */
  author: "member" | "coach";
  body: string;
  postedAt: string;
  cheers: number;
  replies?: GroupPost[];
}

// ---------------------------------------------------------------------------
// Meetups
// ---------------------------------------------------------------------------

/**
 * The kind of event. Drives the icon and a little of the copy. Seeded meetups
 * predate this field, so it is optional and defaults to "social" when absent.
 */
export type EventKind =
  | "hike"
  | "meal-prep"
  | "workshop"
  | "qa"
  | "strength"
  | "social"
  | "virtual";

export interface Meetup {
  id: string;
  /** Physical clinics only. Telehealth members are welcome at any of them. */
  locationId: LocationId;
  title: string;
  blurb: string;
  startsAt: string;
  durationMin: number;
  /** Staff id of whoever is running it, so it has a face before you arrive. */
  hostStaffId: string;
  capacity: number;
  rsvps: number;
  /** New, optional so seeded meetups still satisfy the type. */
  kind?: EventKind;
  /** A longer description for created events; the card shows it under the blurb. */
  description?: string;
  /** True for an online event — no address, a join note instead. */
  virtual?: boolean;
  /** Handle or name of whoever created it, when member/staff-created in-app. */
  createdBy?: string;
  /** ISO timestamp of creation, for created events. */
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Guard result
// ---------------------------------------------------------------------------

/**
 * What the composer gets back from classifyPost.
 *
 * `safe: false` does not mean "bad member". It means "right question, wrong
 * room" — and the payload carries everything needed to put it in the right
 * room instead of just refusing it.
 */
export interface PostClassification {
  safe: boolean;
  /** Member-facing explanation. Written to be read by the person blocked. */
  reason?: string;
  /** The terms that tripped it. Shown to the member — opacity breeds workarounds. */
  matched?: string[];
  /**
   * The offer. Present whenever the block is something a provider should
   * actually answer, which is almost always.
   */
  suggestedEscalation?: {
    kind: EscalationKind;
    /** Pre-written question the member can send to their provider as-is. */
    question: string;
  };
}
