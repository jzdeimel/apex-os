import type { LocationId } from "@/lib/types";
import type {
  Challenge,
  ChallengeTeam,
  CoachGroup,
  CommunityHandle,
  GroupPost,
  Meetup,
  Win,
} from "@/lib/community/types";
import { clients, getClient } from "@/lib/mock/clients";
import { locationName } from "@/lib/mock/locations";
import { staffName } from "@/lib/mock/staff";
import { seededRandom, absolute } from "@/lib/utils";

/**
 * Seeded community.
 *
 * Every string of member-authored content in this file is about training, food,
 * consistency or showing up — never a compound, never a number that could be a
 * dose, never a lab value. That is not squeamishness about the demo; it is the
 * fixture MODELLING the rule. If the seed data contained one post about a
 * protocol, every future engineer reading it would take that as permission, and
 * the guard in lib/community/guard.ts would be a control the product's own
 * sample data disagrees with.
 *
 * All timestamps are relative to the pinned clock, 2026-06-12T09:00:00.
 */

const NOW = "2026-06-12T09:00:00";

// ---------------------------------------------------------------------------
// Handles
// ---------------------------------------------------------------------------

/**
 * Handle vocabulary.
 *
 * Neutral and a bit gym-flavoured on purpose. Anything cute ("SwoleDaddy") ages
 * badly on a page a 52-year-old reads while deciding whether this clinic is
 * serious, and anything clinical would reintroduce exactly the vocabulary the
 * guard spends its life removing.
 */
const ADJ = [
  "Iron", "Granite", "North", "Steady", "Quiet", "Ember", "River", "Copper",
  "Atlas", "Cedar", "Summit", "Blue", "Bright", "Stone", "Field", "Harbor",
  "Ridge", "Slate", "Vantage", "Anchor",
];
const NOUN = [
  "Oak", "Fox", "Hawk", "Bear", "Wolf", "Pine", "Falcon", "Ram", "Elk",
  "Otter", "Heron", "Lynx", "Badger", "Crane", "Marlin", "Stag", "Osprey",
  "Bison", "Sable", "Kestrel",
];

/**
 * Handles are derived from the client id, so they are stable forever — a handle
 * that changed between renders would be worse than a real name, because members
 * would stop trusting that the person they cheered yesterday is the same person
 * today, and the social fabric is the entire point.
 *
 * Collisions are resolved by walking the numeric suffix rather than rehashing,
 * which keeps the result deterministic and independent of iteration order for
 * everyone except the (rare) loser of a collision.
 */
function buildHandles(): CommunityHandle[] {
  const taken = new Set<string>();
  return clients.map((c) => {
    const rand = seededRandom(`handle-${c.id}`);
    const adj = ADJ[Math.floor(rand() * ADJ.length)];
    const noun = NOUN[Math.floor(rand() * NOUN.length)];
    let n = 10 + Math.floor(rand() * 89);
    let handle = `${adj}${noun}${n}`;
    while (taken.has(handle)) {
      n = (n % 99) + 1;
      handle = `${adj}${noun}${n}`;
    }
    taken.add(handle);

    // Community participation is opt-in and most people lurk or skip it. A demo
    // showing 100% participation would set an expectation the real clinic will
    // never hit, and the empty-ish states are the ones worth designing for.
    const optedIn = rand() < 0.62;

    // Real-name display is a second, much rarer consent. Off for nearly
    // everyone, by design — see CommunityHandle.realNameOptIn.
    const realNameOptIn = optedIn && rand() < 0.08;

    return {
      clientId: c.id,
      handle,
      locationId: c.locationId,
      optedIn,
      realNameOptIn,
      displayName: realNameOptIn ? `${c.firstName} ${c.lastName[0]}.` : undefined,
      joinedCommunityOn: c.joinedOn,
    };
  });
}

export const communityHandles: CommunityHandle[] = buildHandles();

const handleByClient: Record<string, CommunityHandle> = Object.fromEntries(
  communityHandles.map((h) => [h.clientId, h]),
);

/**
 * The ONLY sanctioned way to get from a member to their community identity.
 *
 * Components call this once at the boundary and pass the string down. Nothing
 * below the boundary ever sees a clientId, so there is no code path where a
 * post can accidentally be rendered next to a chart link.
 */
/**
 * Is this member visible in community at all?
 *
 * `optedIn` was being generated and then read in exactly one place — a
 * headcount — while the wins wall and group threads published whoever the seed
 * data named. A consent flag that does not gate anything is not consent; it is
 * decoration on top of publishing people who never agreed to be published.
 *
 * Every render boundary now goes through this.
 */
export function isInCommunity(clientId: string): boolean {
  return communityHandleFor(clientId)?.optedIn === true;
}

export function handleFor(clientId: string): string {
  const h = handleByClient[clientId];
  if (!h) return "Member";
  return h.realNameOptIn && h.displayName ? h.displayName : h.handle;
}

export function communityHandleFor(clientId: string): CommunityHandle | undefined {
  return handleByClient[clientId];
}

// ---------------------------------------------------------------------------
// Wins
// ---------------------------------------------------------------------------

/**
 * Hand-written, not generated.
 *
 * A wins wall lives or dies on whether the entries sound like people. Generated
 * filler ("Completed 4 workouts") reads as a progress bar with a face on it, and
 * nobody cheers a progress bar. These are the sentences members actually say
 * out loud in a lobby.
 */
interface WinSeed {
  clientId: string;
  category: Win["category"];
  headline: string;
  detail?: string;
  /** Days before the pinned clock. */
  daysAgo: number;
  hour: number;
}

const WIN_SEEDS: WinSeed[] = [
  {
    clientId: "c-007",
    category: "Consistency",
    headline: "12 weeks consistent.",
    detail: "Not one missed session since March. Including the week I travelled.",
    daysAgo: 0,
    hour: 6,
  },
  {
    clientId: "c-011",
    category: "Training",
    headline: "First 5k since college.",
    detail: "Slow, ugly, finished it. Twenty-two years since the last one.",
    daysAgo: 1,
    hour: 19,
  },
  {
    clientId: "c-006",
    category: "Nutrition",
    headline: "Cooked every dinner this week.",
    detail: "Sunday prep took 90 minutes and saved me from four takeout decisions.",
    daysAgo: 1,
    hour: 20,
  },
  {
    clientId: "c-015",
    category: "Life",
    headline: "Carried all the groceries in one trip.",
    detail: "Two flights of stairs, no stopping at the landing. That's new.",
    daysAgo: 2,
    hour: 17,
  },
  {
    clientId: "c-002",
    category: "Consistency",
    headline: "30 days of tracking.",
    detail: "Didn't love every number I wrote down. Wrote them down anyway.",
    daysAgo: 3,
    hour: 7,
  },
  {
    clientId: "c-014",
    category: "Recovery",
    headline: "Seven hours, seven nights.",
    detail: "Phone charges in the kitchen now. That was the whole trick.",
    daysAgo: 3,
    hour: 21,
  },
  {
    clientId: "c-020",
    category: "Training",
    headline: "Back squat, full depth, no pain.",
    detail: "Took eight weeks of the boring hip work my coach kept nagging me about.",
    daysAgo: 4,
    hour: 12,
  },
  {
    clientId: "c-009",
    category: "Life",
    headline: "Played a full game of tag with my kid.",
    detail: "Whole thing. Didn't have to sit down halfway.",
    daysAgo: 5,
    hour: 18,
  },
  {
    clientId: "c-021",
    category: "Nutrition",
    headline: "Hit protein 6 of 7 days.",
    detail: "Turns out I just needed to eat breakfast like an adult.",
    daysAgo: 6,
    hour: 9,
  },
  {
    clientId: "c-016",
    category: "Consistency",
    headline: "Showed up on a day I really didn't want to.",
    detail: "Did half of what I planned. Still counted.",
    daysAgo: 7,
    hour: 6,
  },
  {
    clientId: "c-024",
    category: "Training",
    headline: "Walked 10k steps every day for a month.",
    detail: "Rain, work trips, all of it. The dog is thrilled.",
    daysAgo: 8,
    hour: 16,
  },
  {
    clientId: "c-018",
    category: "Recovery",
    headline: "Took a rest day without guilt.",
    detail: "Genuinely harder than the training.",
    daysAgo: 9,
    hour: 11,
  },
];

const p2 = (n: number) => String(n).padStart(2, "0");

/**
 * Local-wall-clock ISO, built by hand.
 *
 * The obvious `d.toISOString().slice(0,19)` is wrong here and quietly so: the
 * Date is constructed from a local-time string but toISOString converts to UTC,
 * so every timestamp shifts by the machine's offset. On an Eastern box that is
 * five hours, which is enough to make a win posted at 8pm yesterday render as
 * "Today" — relativeDays reads it back as local and the day boundary has moved.
 * The whole feed's ordering and every relative date inherit the same skew, and
 * it changes with the timezone of whoever runs the build, which also breaks the
 * determinism rule. Formatting the local parts directly avoids the round trip.
 */
function localIso(d: Date): string {
  return (
    `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}` +
    `T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:00`
  );
}

function isoDaysAgo(days: number, hour: number): string {
  const d = absolute(NOW);
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(hour, 0, 0, 0);
  return localIso(d);
}

/**
 * Only opted-in members appear. Filtered at the source rather than at render,
 * so there is no path by which a component can accidentally publish someone who
 * never agreed to be published.
 */
export const wins: Win[] = WIN_SEEDS.filter((s) => isInCommunity(s.clientId)).map((s, i) => {
  const client = getClient(s.clientId);
  const rand = seededRandom(`win-${s.clientId}-${i}`);
  return {
    id: `win-${String(i + 1).padStart(3, "0")}`,
    handle: handleFor(s.clientId),
    locationId: (client?.locationId ?? "raleigh") as LocationId,
    category: s.category,
    headline: s.headline,
    detail: s.detail,
    postedAt: isoDaysAgo(s.daysAgo, s.hour),
    cheers: 4 + Math.floor(rand() * 38),
  };
});

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------

const TEAM_LOCATIONS: LocationId[] = [
  "raleigh",
  "southern-pines",
  "myrtle-beach",
  "telehealth",
];

/**
 * Team goals scale with headcount.
 *
 * A flat target would hand the win to Raleigh every single time simply for
 * being the biggest clinic, and a contest with a predetermined winner stops
 * being a contest by week two. Per-head goals mean Southern Pines can beat
 * Raleigh by caring more, which is the only mechanic that keeps anyone playing.
 */
function buildTeams(challengeId: string, perHead: number): ChallengeTeam[] {
  return TEAM_LOCATIONS.map((loc) => {
    const rand = seededRandom(`${challengeId}-${loc}`);
    // Participants: the opted-in members at that location who are actually
    // engaged. Roughly a third of the opted-in roster, which is a realistic
    // active rate for a clinic community and keeps the numbers honest.
    const optedIn = communityHandles.filter((h) => h.optedIn && h.locationId === loc).length;
    const participants = Math.max(6, Math.round(optedIn * (0.24 + rand() * 0.16)));
    const goal = participants * perHead;
    // Progress runs 55–95% of goal: mid-challenge, nobody finished, everybody
    // still in it. A team at 100% would end the story on the card.
    const total = Math.round(goal * (0.55 + rand() * 0.4));
    return { locationId: loc, name: locationName(loc), participants, total, goal };
  });
}

export const challenges: Challenge[] = [
  {
    id: "ch-001",
    name: "Million Step June",
    premise:
      "Every step your clinic takes this month counts toward one total. Walk the dog, take the stairs, park at the back of the lot.",
    metric: "Movement",
    unit: "steps",
    startsOn: "2026-06-01",
    endsOn: "2026-06-30",
    teams: buildTeams("ch-001", 8000 * 30),
  },
  {
    id: "ch-002",
    name: "Protein Streak",
    premise:
      "One point for every day someone on your team hits their protein target. Missing a day doesn't reset anyone — it just doesn't score.",
    metric: "Nutrition",
    unit: "protein days",
    startsOn: "2026-06-02",
    endsOn: "2026-06-29",
    teams: buildTeams("ch-002", 28),
  },
];

// ---------------------------------------------------------------------------
// Coach group
// ---------------------------------------------------------------------------

/** Tyler Brooks (st-005) coaches Raleigh — the demo member's own coach. */
export const COACH_GROUP_ID = "grp-raleigh-tyler";

export const coachGroups: CoachGroup[] = [
  {
    id: COACH_GROUP_ID,
    name: "Tuesday Crew — Raleigh",
    coachId: "st-005",
    charter:
      "Training, food, sleep and showing up. Medication and lab questions go to your provider through the portal — I'll route them for you if you post one here.",
    memberCount: 34,
  },
];

interface PostSeed {
  /** Omit for a coach post. */
  clientId?: string;
  body: string;
  daysAgo: number;
  hour: number;
  replies?: { clientId?: string; body: string; hour: number }[];
}

const POST_SEEDS: PostSeed[] = [
  {
    body:
      "Reminder that Thursday's session moves to 6:30am — the 5:30 slot is booked for the new member onboarding. Same warm-up, bring the long band.",
    daysAgo: 0,
    hour: 7,
  },
  {
    clientId: "c-013",
    body:
      "Third week of getting up at 5. It has stopped feeling like a punishment. Whoever told me it takes about a month was right.",
    daysAgo: 0,
    hour: 8,
    replies: [
      { clientId: "c-007", body: "It flips fast once it flips. Hold the line.", hour: 8 },
    ],
  },
  {
    clientId: "c-023",
    body:
      "Anybody got a lunch that survives a job site? I'm on the road by six and everything I pack is soup by noon.",
    daysAgo: 1,
    hour: 12,
    replies: [
      {
        clientId: "c-001",
        body:
          "Frozen burrito wrapped in foil in the morning, it's thawed and fine by lunch. Been doing it two months.",
        hour: 13,
      },
      {
        body:
          "Cold is your friend here — cooked chicken, rice, whatever veg you'll actually eat, all mixed the night before. Doesn't need reheating so it can't go wrong.",
        hour: 14,
      },
    ],
  },
  {
    body:
      "Two of you asked me the same thing this week so I'll say it here: if the question involves a medication, a number on a lab, or something your body is doing that worries you, don't post it — send it through the portal and it lands on your provider's desk with a clock on it. You'll get a real answer faster than anyone here can guess at one.",
    daysAgo: 2,
    hour: 9,
  },
  {
    clientId: "c-007",
    body:
      "Travelled for work all last week and still got four sessions in. Hotel gym had two dumbbells and a broken treadmill. It counted.",
    daysAgo: 3,
    hour: 18,
    replies: [{ clientId: "c-020", body: "Two dumbbells is a whole gym if you're honest about it.", hour: 19 }],
  },
  {
    clientId: "c-001",
    body:
      "Sleep's been rough this week and I can feel it in everything — sessions, appetite, mood. Anyone found something that actually helps with the waking-up-at-3am thing?",
    daysAgo: 4,
    hour: 21,
    replies: [
      {
        body:
          // Deliberately anonymous and non-clinical. The original seed here
          // addressed a member by first name, referenced their actual
          // appointment date, and disclosed that a concern had been flagged on
          // their chart — in a thread visible to the whole group. It modelled
          // exactly the behaviour guard.ts exists to prevent. A coach replying
          // in public never names anyone and never touches the chart.
          "Bring this to your next provider visit — it's worth raising there rather than here. In the meantime the thing that moves it most for most people is a hard cutoff on screens and caffeine after 2pm. Not exciting, works.",
        hour: 22,
      },
      { clientId: "c-016", body: "Kitchen phone charger changed my life. Genuinely.", hour: 23 },
    ],
  },
  {
    clientId: "c-020",
    body:
      "Small thing: I stopped negotiating with myself in the car park. Engine off, walk in. The argument was costing me more than the session.",
    daysAgo: 6,
    hour: 6,
  },
];

function buildGroupPosts(): GroupPost[] {
  // Same rule as the wins wall: consent gates MEMBER authorship. A coach post
  // has no clientId — staff speaking in their own group is not a consent
  // question, so those always stand.
  return POST_SEEDS.filter((s) => !s.clientId || isInCommunity(s.clientId)).map((s, i) => {
    const id = `gp-${String(i + 1).padStart(3, "0")}`;
    const rand = seededRandom(`post-${id}`);
    const replies: GroupPost[] = (s.replies ?? [])
      .filter((r) => !r.clientId || isInCommunity(r.clientId))
      .map((r, j) => ({
      id: `${id}-r${j + 1}`,
      groupId: COACH_GROUP_ID,
      handle: r.clientId ? handleFor(r.clientId) : staffName("st-005"),
      author: r.clientId ? "member" : "coach",
      body: r.body,
      postedAt: isoDaysAgo(s.daysAgo, r.hour),
      cheers: Math.floor(seededRandom(`${id}-r${j}`)() * 9),
    }));
    return {
      id,
      groupId: COACH_GROUP_ID,
      handle: s.clientId ? handleFor(s.clientId) : staffName("st-005"),
      author: s.clientId ? "member" : "coach",
      body: s.body,
      postedAt: isoDaysAgo(s.daysAgo, s.hour),
      cheers: 2 + Math.floor(rand() * 22),
      replies: replies.length ? replies : undefined,
    };
  });
}

export const groupPosts: GroupPost[] = buildGroupPosts();

export function groupFor(clientId: string): CoachGroup | undefined {
  const client = getClient(clientId);
  if (!client) return undefined;
  return coachGroups.find((g) => g.coachId === client.coachId) ?? coachGroups[0];
}

export function postsForGroup(groupId: string): GroupPost[] {
  return groupPosts
    .filter((p) => p.groupId === groupId)
    .slice()
    .sort((a, b) => b.postedAt.localeCompare(a.postedAt));
}

// ---------------------------------------------------------------------------
// Meetups
// ---------------------------------------------------------------------------

/**
 * Physical clinics only.
 *
 * Telehealth members do not get their own meetup because a "virtual meetup" is
 * a webinar, and calling it a meetup would be the kind of small dishonesty that
 * teaches members to discount everything else on the page. They are explicitly
 * welcome at all four — see the note rendered in Meetups.tsx.
 */
interface MeetupSeed {
  locationId: LocationId;
  title: string;
  blurb: string;
  daysAhead: number;
  hour: number;
  durationMin: number;
  hostStaffId: string;
  capacity: number;
  fill: number;
}

const MEETUP_SEEDS: MeetupSeed[] = [
  {
    locationId: "raleigh",
    title: "Saturday Morning Hike — Umstead",
    blurb:
      "Easy 4 miles on Company Mill, coffee after at the trailhead. Bring whoever you live with, they're welcome.",
    daysAhead: 2,
    hour: 8,
    durationMin: 150,
    hostStaffId: "st-005",
    capacity: 30,
    fill: 0.73,
  },
  {
    locationId: "raleigh-boutique",
    title: "Meal Prep, Actually Done",
    blurb:
      "Sasha cooks four hours of food in ninety minutes and you take a container home. Bring a knife if you have a good one.",
    daysAhead: 5,
    hour: 18,
    durationMin: 90,
    hostStaffId: "st-006",
    capacity: 16,
    fill: 0.94,
  },
  {
    locationId: "southern-pines",
    title: "Lift Basics Clinic",
    blurb:
      "Squat, hinge, press, row. Two hours of somebody watching your form and telling you the truth about it.",
    daysAhead: 9,
    hour: 9,
    durationMin: 120,
    hostStaffId: "st-008",
    capacity: 20,
    fill: 0.45,
  },
  {
    locationId: "myrtle-beach",
    title: "Beach Walk & Breakfast",
    blurb:
      "Three miles on the sand at sunrise, then eggs at the place on 8th. The walk is optional. The eggs are not.",
    daysAhead: 12,
    hour: 6,
    durationMin: 120,
    hostStaffId: "st-007",
    capacity: 40,
    fill: 0.6,
  },
];

function isoDaysAhead(days: number, hour: number): string {
  const d = absolute(NOW);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return localIso(d);
}

export const meetups: Meetup[] = MEETUP_SEEDS.map((s, i) => ({
  id: `mt-${String(i + 1).padStart(3, "0")}`,
  locationId: s.locationId,
  title: s.title,
  blurb: s.blurb,
  startsAt: isoDaysAhead(s.daysAhead, s.hour),
  durationMin: s.durationMin,
  hostStaffId: s.hostStaffId,
  capacity: s.capacity,
  rsvps: Math.round(s.capacity * s.fill),
}));
