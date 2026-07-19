/**
 * Win-back plays.
 *
 * The failure this replaces is specific. When a member lapsed, the old system
 * produced a row in a "reactivation" list and nothing else, so every coach sent
 * the same message: "Hey {first}, we miss you! Let's get you back on track."
 * Members who had spent five figures and lost twenty pounds got the same
 * sentence as a lead who never made it past intake. It reads as a mailshot
 * because it is one, and it converts like one.
 *
 * A play here is assembled from that member's own record and every line of it
 * carries the row it came from. Two rules govern the whole file:
 *
 *  1. A GUESS IS LABELLED A GUESS. Why someone left is almost never in the
 *     record. What IS in the record is the shape of their exit — billing
 *     lapsed, refills stopped, nobody called for nine weeks. So the play states
 *     the evidence and offers a *hypothesis*, and the coach judges it. Printing
 *     "they left because of cost" as fact would put a fiction in a member's
 *     file and then read it back as truth six months later.
 *  2. NOTHING CLINICAL IS OFFERED. Offers are commercial — rate, credit, a
 *     scan, a conversation. A win-back script must never propose a protocol,
 *     a dose, or a change in care; that is a provider's decision and this is a
 *     retention tool.
 */

import type { Client } from "@/lib/types";
import { clients, clientName, getClient } from "@/lib/mock/clients";
import { staffMap, staffName } from "@/lib/mock/staff";
import { membershipForClient } from "@/lib/mock/memberships";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { ordersForClient } from "@/lib/mock/orders";
import { subscriptions } from "@/lib/mock/subscriptions";
import { lastTouchFor, daysSinceTouch } from "@/lib/mock/contactLog";
import { churnRisk } from "@/lib/aiInsights";
import { alphaScore } from "@/lib/alphaScore";
import { appendLedger, type LedgerRow } from "@/lib/trace/ledger";
import { clamp, formatDate } from "@/lib/utils";

const NOW = "2026-06-12T09:00:00";
const KG_TO_LB = 2.20462;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}

function monthsSince(iso: string, nowIso: string): number {
  return Math.max(0, Math.floor(daysBetween(iso, nowIso) / 30.44));
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/**
 * One citation. `source` names the record, not the screen — a coach challenged
 * on a claim needs to know where to go look, and "the dashboard said so" is not
 * an answer.
 */
export interface Evidence {
  claim: string;
  source: string;
  recordedOn?: string;
}

export type LapseKind = "billing-lapsed" | "went-cold" | "never-started" | "paused";

export interface LapsedMember {
  client: Client;
  kind: LapseKind;
  /** 0–100. How recoverable this member looks, not how valuable they were. */
  winnability: number;
  /** Days since anyone from the clinic spoke to them. Infinity if never. */
  daysDark: number;
  lifetimeValue: number;
  tenureMonths: number;
  /** Why they surfaced in this list at all. */
  trigger: string;
}

// ---------------------------------------------------------------------------
// Who has lapsed
// ---------------------------------------------------------------------------

/** No touch in this long, with no visit booked, counts as gone quiet. */
const COLD_DAYS = 45;

/**
 * Members on this coach's book who have stopped.
 *
 * "Lapsed" is deliberately wider than "membership.status === 'Lapsed'". A
 * member whose card is still billing but who has not been spoken to since April
 * and has no visit booked has left; the billing just hasn't caught up. Waiting
 * for the billing signal means the clinic finds out a month after the member did.
 */
export function lapsedMembers(coachId: string, nowIso: string = NOW): LapsedMember[] {
  return clients
    .filter((c) => c.coachId === coachId)
    .map((c) => classify(c, nowIso))
    .filter((r): r is LapsedMember => r !== null)
    .sort((a, b) => b.winnability - a.winnability);
}

function classify(client: Client, nowIso: string): LapsedMember | null {
  const membership = membershipForClient(client.id);
  const dark = daysSinceTouch(client.id);
  const tenureMonths = monthsSince(client.joinedOn, nowIso);
  const hasUpcoming = Boolean(
    client.nextAppointment && Date.parse(client.nextAppointment) >= Date.parse(nowIso),
  );

  let kind: LapseKind | null = null;
  let trigger = "";

  if (membership?.status === "Lapsed") {
    kind = "billing-lapsed";
    trigger = `${membership.tier} membership lapsed — no renewal date on file.`;
  } else if (client.status === "Inactive") {
    kind = "went-cold";
    trigger = "Chart marked inactive.";
  } else if (membership?.status === "Paused") {
    kind = "paused";
    trigger = `${membership.tier} membership paused.`;
  } else if (dark >= COLD_DAYS && !hasUpcoming) {
    kind = "went-cold";
    trigger =
      dark === Infinity
        ? "No recorded contact, ever, and nothing booked."
        : `${dark} days since the last contact, nothing booked.`;
  } else if (
    client.programs.length === 0 &&
    client.planStatus === "No plan" &&
    tenureMonths >= 2 &&
    !hasUpcoming
  ) {
    kind = "never-started";
    trigger = "Joined, never started a plan, nothing booked.";
  }

  if (!kind) return null;

  return {
    client,
    kind,
    winnability: winnability(client, kind, dark, tenureMonths),
    daysDark: dark,
    lifetimeValue: client.lifetimeValue,
    tenureMonths,
    trigger,
  };
}

/**
 * Winnability, 0–100.
 *
 * Not the same question as "who was worth the most" — a $13k member who has
 * been dark for a year is a harder call than a $4k member who lapsed last
 * month. The weights encode that: spend and tenure raise the ceiling, but going
 * dark and a high churn score pull it back down, and getting far into the
 * programme (a real measured result) is the strongest single positive because
 * there is something concrete to point at in the opening line.
 */
function winnability(
  client: Client,
  kind: LapseKind,
  daysDark: number,
  tenureMonths: number,
): number {
  let score = 30;

  // Spend, to a ceiling — the top of the book is not infinitely persuadable.
  score += clamp(client.lifetimeValue / 12_000, 0, 1) * 22;

  // Tenure: a member of eighteen months has a habit to restart, not a decision
  // to make from scratch.
  score += clamp(tenureMonths / 18, 0, 1) * 16;

  // How far they got. A measured body-composition improvement is the single
  // best thing a coach can open with, so it is weighted hardest.
  const scan = getScanForClient(client.id);
  const history = scan?.history ?? [];
  if (history.length >= 2) {
    const bfDrop = history[0].bodyFatPct - history[history.length - 1].bodyFatPct;
    if (bfDrop > 0) score += clamp(bfDrop / 5, 0, 1) * 18;
  }
  if (client.programs.length > 0) score += 6;

  // Going dark is the real decay curve. Six weeks is recoverable; six months is
  // a different conversation.
  const dark = Number.isFinite(daysDark) ? daysDark : 365;
  score -= clamp(dark / 180, 0, 1) * 22;

  // Churn model as a discount, not a veto.
  score -= (churnRisk(client).score / 100) * 12;

  // Somebody who never started has nothing to restart.
  if (kind === "never-started") score -= 10;
  // A pause is an intention to come back; it converts far better than a lapse.
  if (kind === "paused") score += 8;

  return Math.round(clamp(score, 0, 100));
}

// ---------------------------------------------------------------------------
// The play
// ---------------------------------------------------------------------------

export interface WinBackPlay {
  clientId: string;
  clientName: string;
  coachName: string;
  kind: LapseKind;
  winnability: number;
  /**
   * Hypotheses, phrased as hypotheses. Each carries the evidence that suggested
   * it — the coach agrees or discards it, they do not read it out.
   */
  likelyReasons: { hypothesis: string; evidence: Evidence[] }[];
  /** What they actually achieved here, in their own measured numbers. */
  achievements: { headline: string; evidence: Evidence }[];
  /** A first line, not a script. Uses only facts cited above. */
  openingLine: string;
  offer: { title: string; detail: string; evidence: Evidence };
  /** Everything the play leaned on, for the coach to audit at a glance. */
  evidence: Evidence[];
}

export function buildPlay(client: Client, nowIso: string = NOW): WinBackPlay {
  const record = classify(client, nowIso);
  const kind = record?.kind ?? "went-cold";
  const membership = membershipForClient(client.id);
  const coach = staffMap[client.coachId];
  const coachFirst = (coach?.name ?? "Your coach").replace(/^Dr\.\s+/, "").split(" ")[0];
  const dark = daysSinceTouch(client.id);
  const last = lastTouchFor(client.id);
  const tenureMonths = monthsSince(client.joinedOn, nowIso);

  const evidence: Evidence[] = [];
  const cite = (e: Evidence): Evidence => {
    evidence.push(e);
    return e;
  };

  // --- the record -----------------------------------------------------------

  const membershipEvidence = cite({
    claim: membership
      ? `${membership.tier} · ${membership.status}${
          membership.renewsOn ? ` · renews ${formatDate(membership.renewsOn)}` : " · no renewal on file"
        }`
      : "No membership on file.",
    source: "Membership record",
    recordedOn: membership?.startedOn,
  });

  const contactEvidence = cite({
    claim: last
      ? `Last contact ${dark}d ago — ${last.channel.toLowerCase()}, ${last.outcome.toLowerCase()}.`
      : "No contact of any kind on record.",
    source: "Contact log",
    recordedOn: last?.at.slice(0, 10),
  });

  const memberOrders = ordersForClient(client.id);
  const lastOrder = memberOrders[0];
  const orderEvidence = cite({
    claim: lastOrder
      ? `${memberOrders.length} order(s) on file, most recent ${formatDate(lastOrder.placedAt.slice(0, 10))}.`
      : "No orders ever placed.",
    source: "Order history",
    recordedOn: lastOrder?.placedAt.slice(0, 10),
  });

  const subs = subscriptions.filter((s) => s.clientId === client.id);
  const stoppedSub = subs.find((s) => s.status !== "Active");
  const heldSub = subs.find((s) => s.heldReason);

  const tenureEvidence = cite({
    claim: `Joined ${formatDate(client.joinedOn)} — ${tenureMonths} months with us, $${client.lifetimeValue.toLocaleString(
      "en-US",
    )} lifetime.`,
    source: "Client record",
    recordedOn: client.joinedOn,
  });

  // --- what they achieved ---------------------------------------------------

  const achievements: WinBackPlay["achievements"] = [];
  const scan = getScanForClient(client.id);
  const history = scan?.history ?? [];
  if (history.length >= 2) {
    const first = history[0];
    const lastScan = history[history.length - 1];
    const scanCite: Evidence = {
      claim: `${history.length} scans on ${scan!.device.replace(" (simulated)", "")}, ${formatDate(
        first.date,
      )} → ${formatDate(lastScan.date)}.`,
      source: "Body composition history",
      recordedOn: lastScan.date,
    };
    cite(scanCite);

    const bfDrop = Math.round((first.bodyFatPct - lastScan.bodyFatPct) * 10) / 10;
    const muscleGain =
      Math.round((lastScan.skeletalMuscleKg - first.skeletalMuscleKg) * KG_TO_LB * 10) / 10;
    const weightDrop = Math.round((first.weightKg - lastScan.weightKg) * KG_TO_LB * 10) / 10;

    if (bfDrop > 0.5)
      achievements.push({
        headline: `Dropped ${bfDrop.toFixed(1)} points of body fat`,
        evidence: scanCite,
      });
    if (muscleGain > 0.3)
      achievements.push({
        headline: `Put on ${muscleGain.toFixed(1)} lb of muscle`,
        evidence: scanCite,
      });
    if (weightDrop > 2)
      achievements.push({
        headline: `Down ${weightDrop.toFixed(1)} lb`,
        evidence: scanCite,
      });
  }

  const score = alphaScore(client);
  if (score.hasLabs && score.trend.length >= 2) {
    const gain = score.trend[score.trend.length - 1].value - score.trend[0].value;
    if (gain > 0) {
      const e: Evidence = {
        claim: `Alpha Score ${score.trend[0].value} → ${score.trend[score.trend.length - 1].value} across ${score.trend.length} panels.`,
        source: "Alpha Score trend",
        recordedOn: score.trend[score.trend.length - 1].date,
      };
      cite(e);
      achievements.push({ headline: `Alpha Score up ${gain} points`, evidence: e });
    }
  }

  if (achievements.length === 0 && client.programs.length > 0) {
    achievements.push({
      headline: `Completed time on ${client.programs[0].name}`,
      evidence: cite({
        claim: `${client.programs[0].name} started ${formatDate(client.programs[0].startedOn)} · ${client.programs[0].status}.`,
        source: "Program enrolment",
        recordedOn: client.programs[0].startedOn,
      }),
    });
  }

  // --- why they might have gone ---------------------------------------------

  const likelyReasons: WinBackPlay["likelyReasons"] = [];

  if (heldSub) {
    likelyReasons.push({
      // Money is the most common and most misread reason, so it is stated at
      // its weakest defensible strength: a payment failed, that is all we know.
      hypothesis: "A payment problem may have ended this quietly, not a decision to leave.",
      evidence: [
        cite({
          claim: `Refill held: ${heldSub.heldReason}`,
          source: "Subscription hold",
          recordedOn: heldSub.nextRefillOn,
        }),
        membershipEvidence,
      ],
    });
  }

  if (kind === "billing-lapsed" && !heldSub) {
    likelyReasons.push({
      hypothesis: "Membership stopped billing before anyone called — the lapse may have been passive.",
      evidence: [membershipEvidence, contactEvidence],
    });
  }

  if (Number.isFinite(dark) && dark >= COLD_DAYS) {
    likelyReasons.push({
      hypothesis: `Possibly a service gap on our side — ${dark} days with no contact from us.`,
      evidence: [contactEvidence],
    });
  }

  if (stoppedSub) {
    likelyReasons.push({
      hypothesis: "They may have simply run out and not restarted.",
      evidence: [
        cite({
          claim: `Subscription ${stoppedSub.status.toLowerCase()} after ${stoppedSub.refillsPlaced} refill(s); last placed ${
            stoppedSub.lastPlacedOn ? formatDate(stoppedSub.lastPlacedOn) : "never"
          }.`,
          source: "Subscription record",
          recordedOn: stoppedSub.lastPlacedOn,
        }),
        orderEvidence,
      ],
    });
  }

  if (kind === "never-started") {
    likelyReasons.push({
      hypothesis: "They never got to a plan — the drop-off is at onboarding, not at value.",
      evidence: [tenureEvidence, orderEvidence],
    });
  }

  if (likelyReasons.length === 0) {
    // The honest default. An empty reason list is better than a manufactured one.
    likelyReasons.push({
      hypothesis: "Nothing in the record explains this. Worth asking them directly.",
      evidence: [contactEvidence, membershipEvidence],
    });
  }

  // --- the opening line -----------------------------------------------------

  const openingLine = buildOpening({
    coachFirst,
    firstName: client.firstName,
    achievement: achievements[0]?.headline,
    tenureMonths,
    kind,
    dark,
  });

  // --- the offer ------------------------------------------------------------

  const offer = buildOffer(kind, membership, heldSub?.heldReason, {
    membershipEvidence,
    tenureEvidence,
    contactEvidence,
  });

  return {
    clientId: client.id,
    clientName: clientName(client),
    coachName: coach?.name ?? staffName(client.coachId),
    kind,
    winnability: record?.winnability ?? winnability(client, kind, dark, tenureMonths),
    likelyReasons,
    achievements,
    openingLine,
    offer,
    // De-duplicated: the same row gets cited by several claims and a coach
    // should see the source list, not the citation count.
    evidence: evidence.filter(
      (e, i, all) => all.findIndex((x) => x.claim === e.claim && x.source === e.source) === i,
    ),
  };
}

/**
 * The opening line leads with THEIR number when we have one.
 *
 * "We miss you" is about us. "You dropped 4.2 points of body fat between January
 * and May" is about them, and it is checkable — which is the point: a member can
 * open their portal and confirm every word of it.
 */
function buildOpening(args: {
  coachFirst: string;
  firstName: string;
  achievement?: string;
  tenureMonths: number;
  kind: LapseKind;
  dark: number;
}): string {
  const { coachFirst, firstName, achievement, tenureMonths, kind, dark } = args;
  const opener = `${firstName} — ${coachFirst} here.`;

  if (achievement) {
    return `${opener} I was back through your scans this morning: ${achievement.toLowerCase()} while you were with us. That doesn't undo itself overnight, but it does drift. Can I get fifteen minutes with you this week to see where you're actually at now?`;
  }
  if (kind === "never-started") {
    return `${opener} You signed up ${tenureMonths} months ago and we never got you to a starting point — that's on us, not you. If you still want to, I'll walk you through what the first month actually looks like. No pressure either way.`;
  }
  if (Number.isFinite(dark) && dark >= 90) {
    return `${opener} It's been ${Math.round(dark / 30)} months since anyone here checked in with you, which isn't good enough. I'm not calling to sell you anything — I'd genuinely like to know how you're doing and whether we dropped the ball.`;
  }
  return `${opener} I noticed your membership stopped and I don't want to assume why. Was it the cost, the schedule, or did it just stop being useful? Whichever it is, I'd rather hear it than guess.`;
}

/**
 * The offer.
 *
 * Every branch is commercial or logistical. Nothing here proposes care — a
 * retention tool that suggests protocols is a retention tool writing
 * prescriptions.
 */
function buildOffer(
  kind: LapseKind,
  membership: ReturnType<typeof membershipForClient>,
  heldReason: string | undefined,
  cites: { membershipEvidence: Evidence; tenureEvidence: Evidence; contactEvidence: Evidence },
): WinBackPlay["offer"] {
  if (heldReason) {
    return {
      title: "Clear the balance, restart the schedule",
      detail:
        "The block is a payment, not a decision. Offer to sort the card on the call and put the refill back on its original date — no re-enrollment.",
      evidence: cites.membershipEvidence,
    };
  }
  if (kind === "billing-lapsed" && membership) {
    return {
      title: `Reinstate ${membership.tier} at the rate they were paying`,
      detail: `$${membership.monthlyRate}/mo, no re-enrollment fee, keeping their original start date so tenure isn't reset. Offer only if they raise cost — leading with a discount teaches the book to lapse.`,
      evidence: cites.membershipEvidence,
    };
  }
  if (kind === "paused") {
    return {
      title: "Set a restart date rather than an open pause",
      detail:
        "A pause with no date is a cancellation nobody has admitted to. Ask for a specific week and book the visit on the call.",
      evidence: cites.membershipEvidence,
    };
  }
  if (kind === "never-started") {
    return {
      title: "Complimentary onboarding visit",
      detail:
        "They paid and never got value. A no-charge visit to get them to a starting point is cheaper than the refund conversation.",
      evidence: cites.tenureEvidence,
    };
  }
  return {
    title: "Complimentary body scan and a 20-minute review",
    detail:
      "Concrete, low-commitment, and it produces the one thing that restarts people: a current number next to their old one.",
    evidence: cites.contactEvidence,
  };
}

// ---------------------------------------------------------------------------
// Acting on a play
// ---------------------------------------------------------------------------

export type PlayAction = "logged-outreach" | "dismissed";

/**
 * Record that a coach acted on a play.
 *
 * Written to the ledger for the same reason every other member-affecting action
 * is: a member who asks "who has been looking at my file and why" gets a
 * complete answer or a misleading one. Retention outreach is not exempt because
 * it is well-meant.
 *
 * The ledger vocabulary is closed by design — a win-back play is a note about a
 * member, so it records as `note`, and we do not mint a new entity type for a
 * new screen.
 */
export function recordPlayAction(
  play: WinBackPlay,
  action: PlayAction,
  actor: { id: string; name: string; role: string },
  nowIso: string = NOW,
): LedgerRow {
  const client = getClient(play.clientId);
  return appendLedger(
    {
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: "create",
      entity: "note",
      entityId: `winback-${play.clientId}`,
      subjectId: play.clientId,
      subjectName: play.clientName,
      locationId: client?.locationId,
      reason:
        action === "logged-outreach"
          ? `Win-back outreach logged — offer: ${play.offer.title}`
          : "Win-back play dismissed by coach as not appropriate",
      after: {
        action,
        offer: play.offer.title,
        winnability: play.winnability,
        // The citations travel with the row. A year from now, "why did we call
        // this member" resolves without re-running the engine.
        evidence: play.evidence.map((e) => `${e.source}: ${e.claim}`),
      },
    },
    nowIso,
  );
}
