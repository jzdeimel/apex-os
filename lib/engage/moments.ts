import type { Client } from "@/lib/types";
import { getClient } from "@/lib/mock/clients";
import { staffMap } from "@/lib/mock/staff";
import { contactLogForClient } from "@/lib/mock/contactLog";
import { escalationsForClient } from "@/lib/escalations/queue";
import { getLabsForClient } from "@/lib/mock/labs";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { ordersForClient } from "@/lib/mock/orders";
import { clientFacingStatus, clientFacingDetail } from "@/lib/orders/lifecycle";
import { appointmentsForClient } from "@/lib/mock/appointments";
import { tightestLine, REORDER_SOON_DAYS } from "@/lib/protocol/runway";
import { buildDailyPlan } from "@/lib/daily/today";
import { relativeDays } from "@/lib/utils";

/**
 * DAILY MOMENTS — the handful of genuinely-new things in a member's day.
 *
 * ── The insight this whole module is built on ─────────────────────────────
 * Duolingo's owl is fake. It has no idea whether you learned anything; it
 * manufactures urgency out of nothing but a counter it invented, and every
 * member eventually works that out. Apex has two hooks a consumer streak app
 * structurally cannot fake:
 *
 *   1. A REAL HUMAN WHO NOTICES. Tyler actually read the message. Dr. Vale
 *      actually answered the question. That is not a push notification wearing
 *      a friendly voice — it is a person, with a name and a face, who did
 *      something on the member's behalf while they were asleep.
 *   2. THE MEMBER'S OWN BODY CHANGING. The scanner measured it. The panel came
 *      back. Nobody had to invent a reason to open the app; the reason arrived
 *      on its own.
 *
 * So every moment below is sourced from a record that already exists — a
 * contact log row, an answered escalation, a resulted panel, a carrier scan, a
 * measured scan delta. Nothing here is generated to fill a slot. If the day is
 * genuinely quiet, we say so and get out of the way (see `quietDayMoment`),
 * because manufacturing a reason to re-engage someone is exactly the behaviour
 * that teaches members to stop trusting the surface.
 *
 * ── The ranking rule that matters ─────────────────────────────────────────
 * A human message from the member's coach outranks anything automated, always,
 * regardless of recency. See `BASE_IMPORTANCE`: the gap between `coach-message`
 * and the highest automated kind is wider than the maximum recency bonus, so no
 * amount of freshness can float a shipping notification above a person. That is
 * not a UI preference — a coach's sentence is worth more than a carrier scan,
 * and the ordering should say so out loud.
 */

/** Pinned clock. Nothing in Apex reads the wall clock. */
export const NOW = "2026-06-12T09:00:00";

const DAY_MS = 86_400_000;

export type MomentKind =
  | "coach-message"
  | "provider-answer"
  | "labs-back"
  | "plan-change"
  | "order-moving"
  | "milestone"
  | "visit-soon"
  | "refill-soon"
  | "quiet-day";

/**
 * Icon is a token, not a component. This module is imported by server code and
 * by tests; binding it to lucide would make a pure ranking function depend on a
 * rendering library.
 */
export type MomentIcon =
  | "message"
  | "stethoscope"
  | "flask"
  | "clipboard"
  | "package"
  | "trend"
  | "calendar"
  | "refill"
  | "calm";

/** The person behind a moment, when there is one. Present only on human kinds. */
export interface MomentPerson {
  staffId: string;
  name: string;
  /** "Your coach", "Your provider" — never a job title the member has to decode. */
  role: string;
  initials: string;
}

export interface Moment {
  id: string;
  kind: MomentKind;
  /** One line. Reads as a fact, never as a prompt. */
  headline: string;
  /** The substance — what actually happened, in the member's language. */
  detail: string;
  /** ISO timestamp of the underlying event. Forward-dated for upcoming things. */
  at: string;
  /** Higher sorts first. Composed of a kind floor plus a recency bonus. */
  importance: number;
  href: string;
  icon: MomentIcon;
  /** Set on `coach-message` and `provider-answer`. Render the human, not a chip. */
  from?: MomentPerson;
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/**
 * Kind floors. The spacing is the policy.
 *
 * `coach-message` sits 8 points above `provider-answer` and 22 above the best
 * automated kind, while `RECENCY_BONUS_MAX` is 12. A three-day-old sentence
 * from a coach therefore still outranks a shipment that moved an hour ago.
 */
const BASE_IMPORTANCE: Record<MomentKind, number> = {
  "coach-message": 100,
  "provider-answer": 92,
  "labs-back": 78,
  "plan-change": 72,
  "order-moving": 62,
  milestone: 56,
  "visit-soon": 50,
  "refill-soon": 44,
  "quiet-day": 0,
};

/** Ceiling on how much freshness can move a moment. Deliberately small. */
const RECENCY_BONUS_MAX = 12;

/** Past this, an event stops being "new" and stops earning any bonus. */
const RECENCY_WINDOW_DAYS = 7;

/**
 * Bonus for something that just happened, decaying linearly to zero across a
 * week. Future-dated events (a visit tomorrow) get the bonus by proximity too —
 * "tomorrow" is more urgent than "in six days".
 */
function recencyBonus(atIso: string, nowIso: string): number {
  const deltaDays = Math.abs(new Date(nowIso).getTime() - new Date(atIso).getTime()) / DAY_MS;
  if (deltaDays >= RECENCY_WINDOW_DAYS) return 0;
  return Math.round(RECENCY_BONUS_MAX * (1 - deltaDays / RECENCY_WINDOW_DAYS));
}

function daysAgo(atIso: string, nowIso: string): number {
  return (new Date(nowIso).getTime() - new Date(atIso).getTime()) / DAY_MS;
}

function personFor(staffId: string, role: string): MomentPerson | undefined {
  const s = staffMap[staffId];
  if (!s) return undefined;
  return { staffId, name: s.name, role, initials: s.avatarInitials };
}

/** First name only for headlines — "Tyler replied", not "Tyler Brooks replied". */
function firstNameOf(fullName: string): string {
  return fullName.replace(/^Dr\.\s+/, "").split(" ")[0];
}

function truncate(text: string, max = 140): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// Sources — one function per real record type. Each returns 0 or 1 moment.
// ---------------------------------------------------------------------------

/** How far back each source is willing to look. Tuned per source, not global. */
const WINDOWS = {
  /** A message older than this is history, not news. */
  message: 5,
  /** An answer the member has probably already read. */
  answer: 5,
  /** A panel stays newsworthy longer — most members don't open it same-day. */
  labs: 14,
  /** Fulfilment moves fast; a week-old scan is not a moment. */
  order: 5,
  /** A measured change is worth surfacing well after the scan itself. */
  milestone: 21,
  /** How far ahead a visit counts as "coming up". */
  visitAhead: 2,
} as const;

/**
 * The coach said something.
 *
 * "Replied" is only claimed when the member actually said something first in
 * that thread — the honest distinction between a person answering you and a
 * person contacting you. `direction` in the contact log is generated truthfully
 * (inbound rows are authored by the member), so this is checkable rather than
 * assumed.
 */
function coachMessageMoment(clientId: string, nowIso: string): Moment | undefined {
  const log = contactLogForClient(clientId); // newest first
  const latest = log.find(
    (e) =>
      e.direction === "outbound" &&
      // Phone and in-person touches are logged summaries written by staff, not
      // something the member can open and read. Surfacing "your coach called"
      // as unread mail sends them looking for a message that does not exist.
      (e.channel === "Portal message" || e.channel === "SMS" || e.channel === "Email") &&
      daysAgo(e.at, nowIso) <= WINDOWS.message &&
      daysAgo(e.at, nowIso) >= 0,
  );
  if (!latest) return undefined;

  const person = personFor(latest.staffId, "Your coach");
  const memberSpokeFirst = log.some(
    (e) => e.direction === "inbound" && e.threadId === latest.threadId && e.at < latest.at,
  );
  const who = person ? firstNameOf(person.name) : "Your coach";

  return {
    id: `mo-msg-${latest.id}`,
    kind: "coach-message",
    headline: memberSpokeFirst ? `${who} replied` : `${who} sent you a note`,
    detail: truncate(latest.subject ? `${latest.subject} — ${latest.body}` : latest.body),
    at: latest.at,
    importance: BASE_IMPORTANCE["coach-message"] + recencyBonus(latest.at, nowIso),
    href: "/portal/messages",
    icon: "message",
    from: person,
  };
}

/**
 * A provider answered a question the coach escalated on the member's behalf.
 *
 * This is the single most under-shown event in the audited system: the answer
 * existed, on the record, hours before anyone told the member it did.
 */
function providerAnswerMoment(clientId: string, nowIso: string): Moment | undefined {
  const answered = escalationsForClient(clientId)
    .filter((e) => e.answeredAt && daysAgo(e.answeredAt, nowIso) <= WINDOWS.answer)
    .sort((a, b) => (b.answeredAt as string).localeCompare(a.answeredAt as string))[0];
  if (!answered?.answeredAt) return undefined;

  const staffId = answered.answeredByStaffId ?? answered.assignedToStaffId;
  const person = personFor(staffId, "Your provider");
  const who = person ? person.name : "Your provider";

  return {
    id: `mo-esc-${answered.id}`,
    kind: "provider-answer",
    headline: `${who} answered your question`,
    // The question is quoted back so the member does not have to remember which
    // one this was. The answer itself lives behind the link, with its full
    // clinical context — a truncated clinical answer is worse than none.
    detail: truncate(`You asked: ${answered.question}`),
    at: answered.answeredAt,
    importance: BASE_IMPORTANCE["provider-answer"] + recencyBonus(answered.answeredAt, nowIso),
    href: "/portal/messages",
    icon: "stethoscope",
    from: person,
  };
}

/**
 * The panel is back.
 *
 * We count flagged markers rather than interpreting them. Counting is a fact;
 * interpreting on a home screen without the provider's context is not ours to
 * do, and "3 markers your provider wants to talk about" is both true and the
 * thing that actually gets someone to open the page.
 */
function labsMoment(clientId: string, nowIso: string): Moment | undefined {
  const lab = getLabsForClient(clientId);
  if (!lab || lab.status !== "Resulted") return undefined;
  const age = daysAgo(lab.resultedOn, nowIso);
  if (age < 0 || age > WINDOWS.labs) return undefined;

  const flagged = lab.biomarkers.filter((b) => b.status !== "optimal").length;

  return {
    id: `mo-lab-${lab.id}`,
    kind: "labs-back",
    headline: "Your lab results are back",
    detail: flagged
      ? `${lab.panelName} — ${flagged} marker${flagged === 1 ? "" : "s"} outside your optimal range, with the rest where they should be. Your coach walks you through it, you don't have to decode it.`
      : `${lab.panelName} — everything landed inside your optimal ranges.`,
    at: lab.resultedOn,
    importance: BASE_IMPORTANCE["labs-back"] + recencyBonus(lab.resultedOn, nowIso),
    href: "/portal/labs",
    icon: "flask",
  };
}

/**
 * Something on the plan changed.
 *
 * Sourced from a provider hold on today's protocol, which is a real, dated
 * change to what the member does today — not from `PlanOfCare.createdAt`, which
 * is stamped at build time and would report "your plan changed" every morning
 * forever. A hold is also the change most worth surfacing: it is the one the
 * member is most likely to mistake for a mistake and quietly override.
 */
function planChangeMoment(client: Client, nowIso: string): Moment | undefined {
  const plan = buildDailyPlan(client, nowIso);
  const held = plan.doses.find((d) => d.heldReason);
  if (!held) return undefined;

  return {
    id: `mo-plan-${client.id}-${held.id}`,
    kind: "plan-change",
    headline: "Your provider paused one item",
    // Rule B, stated to the member's face: this is not a miss, and their record
    // will not treat it as one.
    detail: `${held.name} is on hold — ${held.heldReason}. Skipping it is following the plan, not breaking it, and your streak is held for the days it's paused.`,
    at: nowIso,
    importance: BASE_IMPORTANCE["plan-change"] + RECENCY_BONUS_MAX,
    href: "/portal/protocol",
    icon: "clipboard",
  };
}

/** Statuses worth interrupting someone's morning for. The rest is noise. */
const NOTEWORTHY_ORDER_STATUSES = new Set([
  "Out for delivery",
  "In transit",
  "Delivered",
  "Insufficient stock",
]);

function orderMoment(clientId: string, nowIso: string): Moment | undefined {
  const order = ordersForClient(clientId)
    .filter((o) => o.visibleToClient && NOTEWORTHY_ORDER_STATUSES.has(o.status))
    .filter((o) => {
      const at = o.lastActivity ?? o.placedAt;
      const age = daysAgo(at, nowIso);
      return age >= 0 && age <= WINDOWS.order;
    })
    .sort((a, b) => (b.lastActivity ?? b.placedAt).localeCompare(a.lastActivity ?? a.placedAt))[0];
  if (!order) return undefined;

  const at = order.lastActivity ?? order.placedAt;
  // "Arriving today" deserves to beat "on its way" — a bump, not a new floor,
  // so it still cannot outrank a human.
  const urgency = order.status === "Out for delivery" ? 6 : 0;

  return {
    id: `mo-ord-${order.id}`,
    kind: "order-moving",
    headline: clientFacingStatus(order.status),
    detail: clientFacingDetail(order.status),
    at,
    importance: BASE_IMPORTANCE["order-moving"] + urgency + recencyBonus(at, nowIso),
    href: "/portal",
    icon: "package",
  };
}

/**
 * A measured change — the second real hook.
 *
 * Compared against the PREVIOUS scan, not the first one, so this fires when
 * something new was measured rather than restating a lifetime total every day.
 * Thresholds are above scanner noise on purpose; a 0.2% swing is not a
 * milestone, it is a different pair of shorts.
 */
const BODY_FAT_MILESTONE_PCT = 1.0;
const LEAN_MASS_MILESTONE_KG = 0.5;

function milestoneMoment(clientId: string, nowIso: string): Moment | undefined {
  const scan = getScanForClient(clientId);
  if (!scan?.history || scan.history.length < 2) return undefined;
  const age = daysAgo(scan.scannedOn, nowIso);
  if (age < 0 || age > WINDOWS.milestone) return undefined;

  const latest = scan.history[scan.history.length - 1];
  const prior = scan.history[scan.history.length - 2];

  const fatDrop = prior.bodyFatPct - latest.bodyFatPct;
  const leanGain = latest.skeletalMuscleKg - prior.skeletalMuscleKg;

  // Lean mass leads when both moved: keeping muscle is the part members are
  // least likely to notice on their own, and the part the scale actively lies
  // about. Nothing here is a rank against anybody — it is this member's own
  // previous measurement (rule C).
  let headline: string;
  let detail: string;
  if (leanGain >= LEAN_MASS_MILESTONE_KG) {
    headline = `+${leanGain.toFixed(1)} kg lean mass since your last scan`;
    detail = `Measured on ${scan.device.replace(" (simulated)", "")}, not estimated. Holding muscle is the hard half of this.`;
  } else if (fatDrop >= BODY_FAT_MILESTONE_PCT) {
    headline = `Down ${fatDrop.toFixed(1)}% body fat since your last scan`;
    detail = `${prior.bodyFatPct}% → ${latest.bodyFatPct}%, measured on the same device under the same conditions.`;
  } else {
    return undefined;
  }

  return {
    id: `mo-scan-${scan.id}-${scan.scannedOn}`,
    kind: "milestone",
    headline,
    detail,
    at: scan.scannedOn,
    importance: BASE_IMPORTANCE.milestone + recencyBonus(scan.scannedOn, nowIso),
    href: "/portal/progress",
    icon: "trend",
  };
}

function visitMoment(clientId: string, nowIso: string): Moment | undefined {
  const now = new Date(nowIso).getTime();
  const next = appointmentsForClient(clientId).find((a) => {
    if (a.status === "Completed" || a.status === "No Show") return false;
    const delta = (new Date(a.start).getTime() - now) / DAY_MS;
    return delta >= 0 && delta <= WINDOWS.visitAhead;
  });
  if (!next) return undefined;

  const when = relativeDays(next.start);
  return {
    id: `mo-appt-${next.id}`,
    kind: "visit-soon",
    headline: `${next.type} ${when.toLowerCase()}`,
    detail: `With ${staffMap[next.staffId]?.name ?? "your care team"}. Bring anything you've been meaning to ask — that is what the slot is for.`,
    at: next.start,
    importance: BASE_IMPORTANCE["visit-soon"] + recencyBonus(next.start, nowIso),
    href: "/portal",
    icon: "calendar",
  };
}

/**
 * The refill countdown, but only when it is actually close.
 *
 * Above `REORDER_SOON_DAYS` this is not news, it is nagging — the runway page
 * exists for members who want to check, and a moment that fires every single
 * day of a 28-day cycle trains people to skim past the one that matters.
 */
function refillMoment(clientId: string, nowIso: string): Moment | undefined {
  const line = tightestLine(clientId, nowIso);
  if (!line || line.daysLeft > REORDER_SOON_DAYS) return undefined;

  return {
    id: `mo-refill-${line.subscriptionId}`,
    kind: "refill-soon",
    headline: line.memberLine,
    detail: line.automatic,
    at: nowIso,
    // Running out entirely is materially worse than being close to it.
    importance:
      BASE_IMPORTANCE["refill-soon"] +
      (line.status === "out" || line.status === "at risk" ? 10 : 0) +
      RECENCY_BONUS_MAX,
    href: "/portal/protocol",
    icon: "refill",
  };
}

// ---------------------------------------------------------------------------
// The quiet day
// ---------------------------------------------------------------------------

/**
 * Nothing new happened. That is a normal Tuesday, not a failure state.
 *
 * The temptation here is to invent something — a fake streak warning, a
 * manufactured "you haven't logged in a while". We say the true thing instead
 * and point at the single most useful action available from the member's real
 * record. If there is nothing useful either, we say that too, and let them
 * close the app. A product that cannot tolerate a quiet day will eventually
 * fabricate a loud one.
 */
function quietDayMoment(client: Client, nowIso: string): Moment {
  const line = tightestLine(client.id, nowIso);
  const labDate = client.latestLabDate;
  const daysSinceLabs = labDate ? Math.floor(daysAgo(labDate, nowIso)) : undefined;
  const hasUpcoming = appointmentsForClient(client.id).some(
    (a) => a.status === "Scheduled" && new Date(a.start).getTime() > new Date(nowIso).getTime(),
  );

  let detail: string;
  let href = "/portal";
  if (daysSinceLabs !== undefined && daysSinceLabs >= 90) {
    detail = `Your last panel was ${daysSinceLabs} days ago. Booking the next draw is the one thing that would make your next visit worth more.`;
    href = "/portal/labs";
  } else if (!hasUpcoming) {
    detail =
      "You don't have a visit on the books. Getting one in the diary is the single highest-value thing on this screen today.";
    href = "/portal/messages";
  } else if (line && line.daysLeft <= REORDER_SOON_DAYS * 2) {
    detail = `${line.memberLine} ${line.automatic}`;
    href = "/portal/protocol";
  } else {
    detail =
      "Close today's three rings and that's the whole job. We'll tell you the moment something actually changes.";
  }

  return {
    id: `mo-quiet-${client.id}-${nowIso.slice(0, 10)}`,
    kind: "quiet-day",
    headline: "Nothing new since yesterday",
    detail,
    at: nowIso,
    importance: BASE_IMPORTANCE["quiet-day"],
    href,
    icon: "calm",
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Today's moments for one member, ranked.
 *
 * Always returns at least one element — a quiet day yields exactly one
 * `quiet-day` moment, so callers never have to render an empty region and
 * never have to invent copy of their own.
 */
export function momentsFor(clientId: string, nowIso: string = NOW): Moment[] {
  const client = getClient(clientId);
  if (!client) return [];

  const found = [
    coachMessageMoment(clientId, nowIso),
    providerAnswerMoment(clientId, nowIso),
    labsMoment(clientId, nowIso),
    planChangeMoment(client, nowIso),
    orderMoment(clientId, nowIso),
    milestoneMoment(clientId, nowIso),
    visitMoment(clientId, nowIso),
    refillMoment(clientId, nowIso),
  ].filter((m): m is Moment => m !== undefined);

  if (found.length === 0) return [quietDayMoment(client, nowIso)];

  return found.sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance;
    // Stable, deterministic tiebreak: newer first, then id. Never random.
    if (a.at !== b.at) return b.at.localeCompare(a.at);
    return a.id.localeCompare(b.id);
  });
}

/** The top N, for surfaces with a fixed budget. Two or three is the ceiling. */
export function topMoments(clientId: string, limit = 3, nowIso: string = NOW): Moment[] {
  return momentsFor(clientId, nowIso).slice(0, limit);
}

/** True when the only thing we have to say is that there is nothing to say. */
export function isQuietDay(moments: Moment[]): boolean {
  return moments.length === 1 && moments[0].kind === "quiet-day";
}

export { BASE_IMPORTANCE, RECENCY_BONUS_MAX, RECENCY_WINDOW_DAYS, WINDOWS, quietDayMoment };
