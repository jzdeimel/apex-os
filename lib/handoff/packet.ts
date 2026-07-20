import type { Client } from "@/lib/types";
import { clients, clientName } from "@/lib/mock/clients";
import { staffName, staffMap } from "@/lib/mock/staff";
import { locationName } from "@/lib/mock/locations";
import { latestConsult, unsignedConsultsFor, consultsForClient } from "@/lib/mock/consults";
import { escalationsForClient, formatSla, isResolved, slaState } from "@/lib/escalations/queue";
import { ordersForClient } from "@/lib/mock/orders";
import { subscriptionsForClient } from "@/lib/mock/subscriptions";
import { catalogItem } from "@/lib/catalog/catalog";
import { recommendationsForClient } from "@/lib/mock/recommendations";
import { triageScore, churnRisk, nextBestAction } from "@/lib/aiInsights";
import { lastTouchFor, daysSinceTouch } from "@/lib/mock/contactLog";
import { membershipForClient } from "@/lib/mock/memberships";
import { appendLedger, type LedgerRow } from "@/lib/trace/ledger";
import { formatDate, absolute } from "@/lib/utils";

/**
 * Coach handoff packets.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * When a coach goes on holiday, the covering coach currently gets a roster and
 * nothing else. Everything that makes the relationship work — what was last
 * discussed, what was promised, what is quietly overdue, which member is one
 * bad week from cancelling — lives in the absent coach's head, and the cover
 * period is precisely when it is unavailable. The member experiences this as
 * being asked to re-explain themselves to a stranger, which is the single
 * fastest way to lose someone who is otherwise doing well.
 *
 * A packet is the written form of what the coach would have said in a five
 * minute hallway handoff, assembled from records that already exist. Nothing
 * here is authored; every line is a projection of a stored fact, so a packet
 * cannot drift from the chart and cannot assert something no one recorded.
 *
 * ── Why generating one is a ledger event ──────────────────────────────────
 * A handoff packet is a DISCLOSURE OF PHI TO ANOTHER WORKFORCE MEMBER. It moves
 * a named member's clinical picture — labs discussed, escalations, plan state —
 * from one staff member's view into another's, in bulk, outside the normal
 * per-chart access path. Under the same reasoning that makes `view` a
 * first-class ledger action, a bulk disclosure that leaves no trace is worse
 * than a chart open that does: it is larger, it is less scrutinised, and it is
 * the one an accounting-of-disclosures request will actually ask about.
 *
 * So `commitPacket` appends ONE LEDGER ROW PER MEMBER IN THE PACKET, not one
 * row for the packet. Accounting of disclosures is answered per patient — "who
 * received my information" — and a single row naming twenty subjects cannot
 * answer it for any of them. Twenty rows is the honest shape of the event.
 */

/** Pinned clock. Everything in Apex reads from this, never from a live Date. */
export const NOW = "2026-06-12T09:00:00";

const DAY_MS = 86_400_000;

/** The cover window a packet is written for. Two weeks is a typical holiday. */
export const COVER_WINDOW_DAYS = 14;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((absolute(toIso).getTime() - absolute(fromIso).getTime()) / DAY_MS);
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type DueKind = "Appointment" | "Refill" | "Escalation SLA" | "Lab recheck";

export interface DueItem {
  kind: DueKind;
  label: string;
  /** ISO date/datetime it lands. */
  on: string;
  /** Days from `nowIso`. Negative = already overdue when cover starts. */
  inDays: number;
  overdue: boolean;
}

export interface OpenItem {
  kind: "Escalation" | "Order" | "Unsigned consult" | "Recommendation";
  label: string;
  detail: string;
  urgent: boolean;
}

export interface HandoffBrief {
  clientId: string;
  name: string;
  mrn: string;
  age: number;
  sex: Client["sex"];
  locationId: Client["locationId"];
  locationLabel: string;
  status: Client["status"];
  planStatus: Client["planStatus"];
  membershipTier?: string;

  /** Where they are in the journey, in one readable line. */
  journey: string;
  monthsWithUs: number;
  goals: string[];
  programs: string[];

  /** What was last discussed — the AI summary headline of the latest consult. */
  lastDiscussed?: {
    consultId: string;
    at: string;
    kind: string;
    channel: string;
    headline: string;
    signed: boolean;
    /** Commitments made to the member that the covering coach now inherits. */
    actionItems: string[];
  };
  /** Last contact of any kind, even if it was not a consult. */
  lastTouch?: { at: string; channel: string; daysAgo: number };

  open: OpenItem[];
  dueNext: DueItem[];

  /**
   * The single thing the covering coach most needs to know. One sentence,
   * chosen by a fixed priority ladder over recorded facts — never generated
   * prose, and never a clinical instruction.
   */
  headline: string;

  attention: {
    /** 0..100 combined attention rank for the cover period. */
    score: number;
    triage: number;
    triageLevel: string;
    churn: number;
    churnLevel: string;
    factors: string[];
  };
  /** The system's existing next-best-action, carried through unchanged. */
  nextAction: { action: string; reason: string; owner: string };
}

export interface HandoffPacket {
  coachId: string;
  coachName: string;
  generatedAt: string;
  coverFrom: string;
  coverTo: string;
  briefs: HandoffBrief[];
  totals: {
    clients: number;
    needsAttention: number;
    openEscalations: number;
    overdueEscalations: number;
    unsignedConsults: number;
    openOrders: number;
    dueInWindow: number;
  };
}

export interface CommittedPacket {
  packet: HandoffPacket;
  /** One row per member disclosed. See the file header for why. */
  rows: LedgerRow[];
}

// ---------------------------------------------------------------------------
// Brief assembly
// ---------------------------------------------------------------------------

function journeyLine(c: Client, months: number): string {
  const parts = [
    `${c.status}`,
    months <= 0 ? "joined this month" : `${months} month${months === 1 ? "" : "s"} in`,
    `plan: ${c.planStatus}`,
  ];
  const active = c.programs.filter((p) => p.status === "Active");
  if (active.length) parts.push(active.map((p) => p.name).join(" + "));
  return parts.join(" · ");
}

function openItemsFor(c: Client, nowIso: string): OpenItem[] {
  const out: OpenItem[] = [];

  for (const e of escalationsForClient(c.id)) {
    if (isResolved(e)) continue;
    const state = slaState(e, nowIso);
    out.push({
      kind: "Escalation",
      label: `${e.priority} · ${e.kind}`,
      detail: `${e.question} — ${formatSla(e, nowIso)}, with ${staffName(e.assignedToStaffId)}`,
      urgent: state === "overdue" || e.priority === "Urgent",
    });
  }

  for (const o of ordersForClient(c.id)) {
    if (o.status === "Delivered" || o.status === "Cancelled" || o.status === "Failed") continue;
    out.push({
      kind: "Order",
      label: `Order ${o.id} · ${o.status}`,
      detail: `${o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}${o.delayed ? ` — delayed: ${o.delayReason ?? "no reason recorded"}` : ""}`,
      urgent: Boolean(o.delayed),
    });
  }

  for (const con of consultsForClient(c.id)) {
    if (con.status === "Signed") continue;
    out.push({
      kind: "Unsigned consult",
      label: `${con.kind} from ${formatDate(con.startedAt)} is unsigned`,
      detail: con.aiSummary?.headline ?? "Awaiting review.",
      // An unsigned note is the absent coach's obligation, not the cover's, but
      // it is also the reason the record the cover is reading may be incomplete.
      urgent: false,
    });
  }

  const pending = recommendationsForClient(c.id).filter(
    (r) => r.status === "draft" || r.status === "coach reviewed",
  );
  if (pending.length) {
    out.push({
      kind: "Recommendation",
      label: `${pending.length} recommendation${pending.length === 1 ? "" : "s"} awaiting provider approval`,
      detail: pending.map((r) => r.title).join("; "),
      urgent: false,
    });
  }

  return out;
}

function dueItemsFor(c: Client, nowIso: string, windowDays: number): DueItem[] {
  const out: DueItem[] = [];

  const push = (kind: DueKind, label: string, on: string) => {
    const inDays = daysBetween(nowIso, on);
    if (inDays > windowDays) return;
    out.push({ kind, label, on, inDays, overdue: inDays < 0 });
  };

  if (c.nextAppointment) push("Appointment", "Booked appointment", c.nextAppointment);

  for (const s of subscriptionsForClient(c.id)) {
    if (s.status !== "Active") continue;
    const name = catalogItem(s.sku)?.name ?? s.sku;
    push("Refill", `${name} refill due`, s.nextRefillOn);
  }

  for (const e of escalationsForClient(c.id)) {
    if (isResolved(e)) continue;
    const due = absolute(absolute(e.raisedAt).getTime()).toISOString();
    // The SLA text already carries the clock; the date here just orders it.
    push("Escalation SLA", `${e.priority} escalation answer owed (${formatSla(e, nowIso)})`, due);
  }

  if (c.latestLabDate) {
    const recheck = absolute(absolute(c.latestLabDate).getTime() + 90 * DAY_MS).toISOString();
    if (c.status === "Active Protocol") push("Lab recheck", "90-day lab recheck window opens", recheck);
  }

  return out.sort((a, b) => a.inDays - b.inDays);
}

/**
 * The one-sentence headline.
 *
 * A fixed ladder rather than a score, because the covering coach reads this
 * line first and it has to be predictable: the same situation must always
 * produce the same sentence. Every rung restates a recorded fact — no clinical
 * advice, no instruction, no invented context.
 */
function headlineFor(
  c: Client,
  open: OpenItem[],
  due: DueItem[],
  churn: ReturnType<typeof churnRisk>,
  daysQuiet: number,
): string {
  const urgentEsc = open.find((o) => o.kind === "Escalation" && o.urgent);
  if (urgentEsc) return `Open ${urgentEsc.label.toLowerCase()} — ${urgentEsc.detail}`;

  const highFlag = c.riskFlags.find((f) => f.level === "high");
  if (highFlag) return `Flagged ${highFlag.label.toLowerCase()}: ${highFlag.detail}`;

  const delayedOrder = open.find((o) => o.kind === "Order" && o.urgent);
  if (delayedOrder) return `Delayed order they are waiting on — ${delayedOrder.detail}`;

  const overdueAppt = due.find((d) => d.kind === "Appointment" && d.overdue);
  if (overdueAppt) return `Appointment date has passed (${formatDate(overdueAppt.on)}) with nothing rebooked.`;

  const moderateFlag = c.riskFlags.find((f) => f.level === "moderate");
  if (moderateFlag) return `Watch item on file: ${moderateFlag.label} — ${moderateFlag.detail}`;

  if (churn.level === "high")
    return `Retention risk — ${churn.drivers.join(", ").toLowerCase() || "low recent engagement"}. Worth a real conversation, not a check-in text.`;

  const refill = due.find((d) => d.kind === "Refill");
  if (refill)
    return `${refill.label} ${refill.overdue ? `${Math.abs(refill.inDays)}d ago` : `in ${refill.inDays}d`} — confirm they have supply before it lapses.`;

  const openEsc = open.find((o) => o.kind === "Escalation");
  if (openEsc) return `Waiting on a provider answer — ${openEsc.detail}`;

  if (daysQuiet >= 21) return `No contact recorded in ${daysQuiet} days. Re-open the relationship before anything else.`;

  if (c.status === "Active Protocol" && !c.nextAppointment)
    return "Stable and on protocol, but nothing is booked — get the next visit on the calendar.";

  return "On track. Light-touch check-in is enough during cover.";
}

export function buildBrief(c: Client, nowIso: string = NOW): HandoffBrief {
  const triage = triageScore(c);
  const churn = churnRisk(c);
  const nba = nextBestAction(c);
  const consult = latestConsult(c.id);
  const touch = lastTouchFor(c.id);
  const daysQuiet = daysSinceTouch(c.id);
  const open = openItemsFor(c, nowIso);
  const dueNext = dueItemsFor(c, nowIso, COVER_WINDOW_DAYS);
  const months = Math.max(0, Math.floor(daysBetween(c.joinedOn, nowIso) / 30));
  const summary = consult?.finalSummary ?? consult?.aiSummary;

  return {
    clientId: c.id,
    name: clientName(c),
    mrn: c.mrn,
    age: c.age,
    sex: c.sex,
    locationId: c.locationId,
    locationLabel: locationName(c.locationId),
    status: c.status,
    planStatus: c.planStatus,
    membershipTier: membershipForClient(c.id)?.tier,

    journey: journeyLine(c, months),
    monthsWithUs: months,
    goals: c.goals,
    programs: c.programs.map((p) => `${p.name} (${p.status})`),

    lastDiscussed: consult
      ? {
          consultId: consult.id,
          at: consult.startedAt,
          kind: consult.kind,
          channel: consult.channel,
          headline: summary?.headline ?? "No summary on file.",
          signed: consult.status === "Signed",
          actionItems: (summary?.actionItems ?? []).map((a) => a.value),
        }
      : undefined,
    lastTouch: touch
      ? { at: touch.at, channel: touch.channel, daysAgo: daysQuiet }
      : undefined,

    open,
    dueNext,
    headline: headlineFor(c, open, dueNext, churn, daysQuiet),

    attention: {
      // Triage is "who needs a human today"; churn is "who quietly leaves while
      // nobody is watching". Cover periods lose people to the second far more
      // often than the first, but the first is what hurts when it is missed —
      // hence weighted toward triage without letting churn drop out.
      score: Math.round(triage.score * 0.65 + churn.score * 0.35),
      triage: triage.score,
      triageLevel: triage.level,
      churn: churn.score,
      churnLevel: churn.level,
      factors: [...triage.factors, ...churn.drivers].slice(0, 5),
    },
    nextAction: { action: nba.action, reason: nba.reason, owner: nba.owner },
  };
}

/**
 * Build a handoff packet for one coach.
 *
 * Pure — it reads records and returns a document. The ledger write lives in
 * `commitPacket` so that assembling a preview in a render pass can never
 * accidentally record a disclosure that nobody actually received.
 */
export function buildPacket(coachId: string, nowIso: string = NOW): HandoffPacket {
  const mine = clients.filter((c) => c.coachId === coachId);
  const briefs = mine
    .map((c) => buildBrief(c, nowIso))
    .sort((a, b) => b.attention.score - a.attention.score || a.name.localeCompare(b.name));

  const openEsc = briefs.flatMap((b) => b.open.filter((o) => o.kind === "Escalation"));

  return {
    coachId,
    coachName: staffName(coachId),
    generatedAt: nowIso,
    coverFrom: nowIso,
    coverTo: absolute(absolute(nowIso).getTime() + COVER_WINDOW_DAYS * DAY_MS).toISOString(),
    briefs,
    totals: {
      clients: briefs.length,
      needsAttention: briefs.filter((b) => b.attention.score >= 45).length,
      openEscalations: openEsc.length,
      overdueEscalations: openEsc.filter((o) => o.urgent).length,
      unsignedConsults: unsignedConsultsFor(coachId).length,
      openOrders: briefs.reduce((n, b) => n + b.open.filter((o) => o.kind === "Order").length, 0),
      dueInWindow: briefs.reduce((n, b) => n + b.dueNext.length, 0),
    },
  };
}

/**
 * Record the disclosure and hand back the packet.
 *
 * `export` is the right action here rather than `view`: the covering coach is
 * receiving a durable copy of the member's picture, which outlives the session
 * and cannot be un-seen when cover ends. Naming that accurately in the ledger
 * is the difference between an audit trail and a comforting one.
 */
export function commitPacket(
  packet: HandoffPacket,
  actorId: string,
  coveringStaffId: string,
): CommittedPacket {
  const actor = staffMap[actorId];
  const reason = `Coach handoff packet — coverage for ${packet.coachName} through ${formatDate(packet.coverTo)}, disclosed to ${staffName(coveringStaffId)}`;

  const rows = packet.briefs.map((b) =>
    appendLedger({
      actorId,
      actorName: actor?.name ?? staffName(actorId),
      actorRole: actor?.role ?? "Coach",
      action: "export",
      entity: "chart",
      entityId: `handoff-${packet.coachId}-${b.clientId}`,
      subjectId: b.clientId,
      subjectName: b.name,
      locationId: b.locationId,
      reason,
      after: {
        packet: "coach-handoff",
        coveringStaffId,
        coverThrough: packet.coverTo,
        includedSections: "journey, last consult summary, open items, 14-day due list",
      },
    }),
  );

  return { packet, rows };
}

// ---------------------------------------------------------------------------
// Plain-text rendering — the copyable form
// ---------------------------------------------------------------------------

function briefToText(b: HandoffBrief, index: number): string {
  const lines: string[] = [];
  lines.push(`${index + 1}. ${b.name}  (${b.age}${b.sex === "male" ? "M" : "F"}, MRN ${b.mrn})`);
  lines.push(`   ${b.locationLabel} · ${b.journey}`);
  lines.push(`   MOST IMPORTANT: ${b.headline}`);
  if (b.lastDiscussed) {
    lines.push(
      `   Last discussed (${formatDate(b.lastDiscussed.at)}, ${b.lastDiscussed.kind} / ${b.lastDiscussed.channel}): ${b.lastDiscussed.headline}`,
    );
    for (const a of b.lastDiscussed.actionItems) lines.push(`     - committed: ${a}`);
  } else {
    lines.push("   Last discussed: no consult on file.");
  }
  if (b.open.length) {
    lines.push("   Open:");
    for (const o of b.open) lines.push(`     - ${o.label} — ${o.detail}`);
  } else {
    lines.push("   Open: nothing outstanding.");
  }
  if (b.dueNext.length) {
    lines.push(`   Due in the next ${COVER_WINDOW_DAYS} days:`);
    for (const d of b.dueNext)
      lines.push(
        `     - ${d.label} — ${formatDate(d.on)}${d.overdue ? " (OVERDUE)" : ` (in ${d.inDays}d)`}`,
      );
  } else {
    lines.push(`   Due in the next ${COVER_WINDOW_DAYS} days: nothing scheduled.`);
  }
  lines.push(
    `   Attention ${b.attention.score}/100 (triage ${b.attention.triage}, churn ${b.attention.churn}) · next action: ${b.nextAction.action} [${b.nextAction.owner}]`,
  );
  return lines.join("\n");
}

/** The whole packet as text a coach can paste into a message or a doc. */
export function packetToText(packet: HandoffPacket): string {
  const t = packet.totals;
  return [
    `COACH HANDOFF PACKET`,
    `Coach: ${packet.coachName}`,
    `Cover window: ${formatDate(packet.coverFrom)} → ${formatDate(packet.coverTo)}`,
    `Generated: ${formatDate(packet.generatedAt)}`,
    ``,
    `${t.clients} members · ${t.needsAttention} needing attention · ${t.openEscalations} open escalations (${t.overdueEscalations} urgent/overdue) · ${t.openOrders} open orders · ${t.unsignedConsults} unsigned consults · ${t.dueInWindow} dated items in window`,
    ``,
    `Ordered by how much attention they are likely to need during cover.`,
    ``,
    ...packet.briefs.map(briefToText),
    ``,
    `Contains protected health information. Generating this packet is recorded in the Apex ledger as a disclosure, one row per member.`,
  ].join("\n");
}
