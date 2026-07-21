import { communityHandles, handleFor, isInCommunity } from "@/lib/mock/community";
import { prescriptionsForClient } from "@/lib/dosing/prescriptions";
import { seededRandom, absolute } from "@/lib/utils";

/**
 * Milestones — the witnessed journey.
 *
 * A member's progress is the most motivating thing in the whole product, and it
 * mostly happens invisibly: the ninetieth day on protocol, the tenth pound, the
 * first week they didn't miss a dose. This surfaces those moments and lets the
 * community SEE them — because progress that gets witnessed is progress that
 * gets repeated.
 *
 * WHAT IS REAL, WHAT IS A COMMUNITY SIGNAL
 * ----------------------------------------
 * "Days on protocol" is derived from the member's actual signed prescription
 * (earliest signedAt), so those milestones are real and dated correctly. The
 * body-composition and consistency milestones are the kind of thing members
 * share in community — celebratory, coarse, never a clinical number nobody
 * consented to publish — and are deterministically seeded per member for the
 * demo feed. Everything is handle-based and only ever shown for opted-in
 * members. Nobody's dose, lab, or diagnosis is here.
 */

export type MilestoneKind =
  | "protocol-30"
  | "protocol-90"
  | "protocol-180"
  | "protocol-365"
  | "weight-10"
  | "weight-25"
  | "streak-7"
  | "streak-30"
  | "energy-up"
  | "first-pr"
  | "welcome";

export interface Milestone {
  id: string;
  clientId: string;
  handle: string;
  kind: MilestoneKind;
  label: string;
  detail: string;
  achievedAt: string; // ISO
}

const NOW = "2026-06-12T09:00:00";
const NOW_MS = absolute(NOW).getTime();
const DAY = 86_400_000;

const KIND_LABEL: Record<MilestoneKind, { label: string; detail: string }> = {
  "protocol-30": { label: "30 days on protocol", detail: "One month in — the habit is forming." },
  "protocol-90": { label: "90 days on protocol", detail: "A full quarter of consistency." },
  "protocol-180": { label: "6 months on protocol", detail: "Half a year of showing up." },
  "protocol-365": { label: "One year on protocol", detail: "A full year. This is who they are now." },
  "weight-10": { label: "Down 10 lbs", detail: "The first real, visible change." },
  "weight-25": { label: "Down 25 lbs", detail: "A different person in the mirror." },
  "streak-7": { label: "7-day logging streak", detail: "A full week, every day logged." },
  "streak-30": { label: "30-day streak", detail: "A month without missing a day." },
  "energy-up": { label: "Energy trending up", detail: "Check-ins climbing — it's working." },
  "first-pr": { label: "First strength PR", detail: "A number that wasn't possible before." },
  welcome: { label: "Joined the community", detail: "Day one. Everyone starts here." },
};

/** Real, from the signed prescription: which day-on-protocol milestones passed. */
function protocolMilestones(clientId: string): Milestone[] {
  const rxs = prescriptionsForClient(clientId);
  if (rxs.length === 0) return [];
  const startMs = Math.min(...rxs.map((r) => absolute(r.signedAt).getTime()));
  const daysOn = Math.floor((NOW_MS - startMs) / DAY);
  const handle = handleFor(clientId);

  const thresholds: { kind: MilestoneKind; d: number }[] = [
    { kind: "protocol-30", d: 30 },
    { kind: "protocol-90", d: 90 },
    { kind: "protocol-180", d: 180 },
    { kind: "protocol-365", d: 365 },
  ];
  return thresholds
    .filter((t) => daysOn >= t.d)
    .map((t) => ({
      id: `ms-${clientId}-${t.kind}`,
      clientId,
      handle,
      kind: t.kind,
      label: KIND_LABEL[t.kind].label,
      detail: KIND_LABEL[t.kind].detail,
      achievedAt: absolute(startMs + t.d * DAY).toISOString(),
    }));
}

/** Coarse, community-shareable achievements, seeded deterministically. */
function sharedMilestones(clientId: string): Milestone[] {
  const rand = seededRandom(`milestones:${clientId}`);
  const handle = handleFor(clientId);
  const pool: MilestoneKind[] = ["weight-10", "weight-25", "streak-7", "streak-30", "energy-up", "first-pr"];
  const out: Milestone[] = [];
  for (const kind of pool) {
    // Each member has some of these, not all — a deterministic coin flip.
    if (rand() > 0.55) {
      const daysAgo = Math.floor(rand() * 40);
      out.push({
        id: `ms-${clientId}-${kind}`,
        clientId,
        handle,
        kind,
        label: KIND_LABEL[kind].label,
        detail: KIND_LABEL[kind].detail,
        achievedAt: absolute(NOW_MS - daysAgo * DAY).toISOString(),
      });
    }
  }
  return out;
}

/** All milestones for one member, newest first. */
export function milestonesFor(clientId: string): Milestone[] {
  if (!isInCommunity(clientId)) return [];
  return [...protocolMilestones(clientId), ...sharedMilestones(clientId)].sort((a, b) =>
    b.achievedAt.localeCompare(a.achievedAt),
  );
}

/**
 * The community milestone feed — recent milestones across opted-in members,
 * newest first. This is the "witnessed journey", handle-based.
 */
export function milestoneFeed(limit = 40): Milestone[] {
  const all: Milestone[] = [];
  for (const h of communityHandles) {
    if (!h.optedIn) continue;
    all.push(...protocolMilestones(h.clientId), ...sharedMilestones(h.clientId));
  }
  return all
    .filter((m) => NOW_MS - absolute(m.achievedAt).getTime() < 60 * DAY) // last ~2 months
    .sort((a, b) => b.achievedAt.localeCompare(a.achievedAt))
    .slice(0, limit);
}
