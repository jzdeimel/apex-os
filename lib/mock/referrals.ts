import type { Referral, ReferralStatus } from "@/lib/growth/referrals";
import { referralCodeFor, REFERRER_REWARD_CENTS } from "@/lib/growth/referrals";
import { clients } from "@/lib/mock/clients";
import { seededRandom } from "@/lib/utils";

/**
 * The referral book.
 *
 * Generated deterministically from the member roster, with two properties that
 * matter more than volume:
 *
 *  1. VOLUME TRACKS TENURE AND SPEND, not member id. A member three weeks in
 *    has not referred four people. Flat referral counts across a roster are the
 *    tell that a growth dashboard is decorative.
 *  2. THE FUNNEL LEAKS HONESTLY. Most shares go nowhere. A book where half the
 *    invites convert would let the clinic plan against a number that does not
 *    exist.
 *
 * Referee names are invented people who exist nowhere else in the dataset — a
 * referee is deliberately NOT joined to a client record here. Making that join
 * would mean the referrer's screen is one careless `getClient()` away from the
 * referee's chart, and the safest version of that bug is the one you cannot
 * write because the foreign key isn't there.
 */

const NOW = new Date("2026-06-12T09:00:00");

const REFEREE_FIRST = [
  "Dan", "Rob", "Marcus", "Ty", "Kev", "Nate", "Jordan", "Ellie", "Sam",
  "Priya", "Court", "Bri", "Alex", "Mo", "Jess", "Ray", "Dev", "Hannah",
];
const REFEREE_LAST_INITIAL = "BCDFGHKLMNPRSTVW";

/**
 * Where an invite ends up. Weighted toward the top of the funnel because that
 * is where real word-of-mouth sits.
 */
const OUTCOME_WEIGHTS: [ReferralStatus, number][] = [
  ["Shared", 0.34],
  ["Clicked", 0.58],
  ["Booked", 0.74],
  ["Joined", 0.85],
  ["Rewarded", 1.0],
];

function outcomeFor(r: number): ReferralStatus {
  for (const [status, ceiling] of OUTCOME_WEIGHTS) if (r <= ceiling) return status;
  return "Shared";
}

function isoDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

/**
 * How many invites a member has sent. Tenure and spend are proxies for the two
 * things that actually produce a referral: having been here long enough to have
 * a result worth mentioning, and liking the place enough to keep paying for it.
 */
function inviteCount(joinedOn: string, lifetimeValue: number, rand: () => number): number {
  const tenureDays = Math.floor((NOW.getTime() - Date.parse(joinedOn)) / 86_400_000);
  if (tenureDays < 60) return 0;
  let n = 0;
  if (tenureDays > 120) n += 1;
  if (lifetimeValue > 4_000) n += 1;
  if (lifetimeValue > 8_000) n += 1;
  // A quiet majority never share at all, and a few members carry the program.
  if (rand() < 0.35) n = 0;
  else if (rand() > 0.9) n += 2;
  return Math.min(n, 5);
}

/**
 * The member whose portal the demo opens on. Kept in sync with `ME` in
 * components/portal/PortalHeader.tsx — if that changes, change this.
 */
const DEMO_REFERRER_ID = "c-001";

/**
 * Floor for the demo subject only.
 *
 * The honest distribution above gives this particular member zero invites,
 * which would leave /portal/refer rendering an empty funnel — the one state
 * where "the feature is broken" and "this member hasn't shared yet" look
 * identical. Same reasoning and same shape as `DEMO_SUBJECT_SHARE` in
 * lib/trace/ledger.ts. A real deployment needs neither.
 */
const DEMO_MIN_INVITES = 5;

/**
 * One staged row on the demo subject's book: joined, credit still pending, and
 * the referee declined to be named.
 *
 * Staged rather than drawn because the honest distribution does not produce it
 * at this sample size — five invites give this member exactly one conversion,
 * and that one consented. Which would leave the two states the feature exists
 * to demonstrate unrenderable: the anonymous "someone you invited joined", and
 * credit that is owed but not yet applied. A privacy guarantee nobody can see
 * working is indistinguishable from one that was never built.
 */
function stageDemoRow(rows: Referral[]): Referral[] {
  // Oldest row that has NOT already converted. Overwriting a converted row
  // would take the "credit applied" state away to buy the pending one, which is
  // no better than where we started.
  const target = [...rows]
    .reverse()
    .find((r) => r.status !== "Joined" && r.status !== "Rewarded");
  if (!target) return rows;
  const sharedDaysAgo = Math.floor((NOW.getTime() - Date.parse(target.sharedAt)) / 86_400_000);
  return rows.map((r) =>
    r.id === target.id
      ? {
          ...r,
          status: "Joined" as const,
          // The name IS held — intake captured it. It simply never reaches the
          // referrer, which is the point: refereeLabel is what enforces this,
          // not the absence of the data.
          refereeName: "Danielle R.",
          refereeConsentedToShare: false,
          joinedAt: isoDaysAgo(Math.max(1, sharedDaysAgo - 12)),
          rewardCents: undefined,
        }
      : r,
  );
}

function buildFor(clientId: string, joinedOn: string, lifetimeValue: number): Referral[] {
  const rand = seededRandom(`apex-referrals-v1:${clientId}`);
  const count = Math.max(
    inviteCount(joinedOn, lifetimeValue, rand),
    clientId === DEMO_REFERRER_ID ? DEMO_MIN_INVITES : 0,
  );
  if (count === 0) return [];

  const code = referralCodeFor(clientId);
  const tenureDays = Math.floor((NOW.getTime() - Date.parse(joinedOn)) / 86_400_000);
  const out: Referral[] = [];

  for (let i = 0; i < count; i++) {
    // Shares land after the member had something to talk about — never on the
    // day they joined.
    const sharedDaysAgo = Math.max(3, Math.floor(rand() * Math.max(1, tenureDays - 45)));
    const status = outcomeFor(rand());
    const converted = status === "Joined" || status === "Rewarded";

    // A join always lands after the share, by a plausible booking-to-intake gap.
    const joinedDaysAgo = converted
      ? Math.max(1, sharedDaysAgo - (5 + Math.floor(rand() * 20)))
      : undefined;

    out.push({
      id: `ref-${clientId.slice(-3)}-${String(i + 1).padStart(2, "0")}`,
      referrerClientId: clientId,
      code,
      sharedAt: isoDaysAgo(sharedDaysAgo),
      status,
      // Name is captured at the referee's intake, not from the referrer's
      // contacts — we never hold a name for someone who never showed up.
      ...(converted
        ? {
            refereeName: `${REFEREE_FIRST[Math.floor(rand() * REFEREE_FIRST.length)]} ${
              REFEREE_LAST_INITIAL[Math.floor(rand() * REFEREE_LAST_INITIAL.length)]
            }.`,
          }
        : {}),
      // Roughly a quarter of referees decline to be named. The referrer still
      // gets paid — see the note on the field in lib/growth/referrals.ts.
      refereeConsentedToShare: converted ? rand() > 0.25 : false,
      ...(joinedDaysAgo !== undefined ? { joinedAt: isoDaysAgo(joinedDaysAgo) } : {}),
      ...(status === "Rewarded" ? { rewardCents: REFERRER_REWARD_CENTS } : {}),
    });
  }

  const sorted = out.sort((a, b) => b.sharedAt.localeCompare(a.sharedAt));
  return clientId === DEMO_REFERRER_ID ? stageDemoRow(sorted) : sorted;
}

/**
 * The book is built on FIRST READ, not at module load.
 *
 * This module and `lib/growth/referrals.ts` form a cycle — the engine reads the
 * book, the book uses the engine's code generator and reward constant. Building
 * eagerly means whichever module loads second gets evaluated mid-cycle and hits
 * the temporal dead zone on `REFERRER_REWARD_CENTS`, which is a crash, not a
 * warning. Deferring to first call means both modules have finished evaluating
 * before a single referral is generated, and load order stops mattering.
 *
 * Memoised, so the data is generated exactly once and stays reference-stable —
 * a selector that returned a fresh array each call would re-render every
 * consumer forever.
 */
let BOOK: Record<string, Referral[]> | null = null;

function book(): Record<string, Referral[]> {
  if (BOOK) return BOOK;
  const map: Record<string, Referral[]> = {};
  for (const c of clients) {
    const rows = buildFor(c.id, c.joinedOn, c.lifetimeValue);
    if (rows.length) map[c.id] = rows;
  }
  BOOK = map;
  return map;
}

/** Every referral in the clinic, newest share first. */
export function allReferrals(): Referral[] {
  return Object.values(book())
    .flat()
    .sort((a, b) => b.sharedAt.localeCompare(a.sharedAt));
}

/** One member's own invites, newest first. */
export function referralsForReferrer(clientId: string): Referral[] {
  return book()[clientId] ?? [];
}

/**
 * Attribution lookup: which member does this code belong to?
 *
 * This is the query the front desk needs at intake and never had — "my buddy
 * sent me" resolves to a member id instead of a note nobody reads.
 */
export function referrerForCode(code: string): string | undefined {
  const target = code.trim().toUpperCase();
  return clients.find((c) => referralCodeFor(c.id) === target)?.id;
}
