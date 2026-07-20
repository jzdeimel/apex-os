import { absolute } from "@/lib/utils";
import type { Client } from "@/lib/types";
import { getClient } from "@/lib/mock/clients";
import { staffMap } from "@/lib/mock/staff";
import { contactLogForClient } from "@/lib/mock/contactLog";
import type { ContactEntry, ConsentScope } from "@/lib/comms/types";
import { QUIET_HOURS, WEEKLY_CAP } from "@/lib/comms/send";
import { buildDailyPlan } from "@/lib/daily/today";
import { levelFor } from "@/lib/play/levels";
import { tightestLine, REORDER_SOON_DAYS } from "@/lib/protocol/runway";
import { appointmentsForClient } from "@/lib/mock/appointments";

/**
 * THE NUDGE ENGINE — when to reach out, and much more importantly when to shut
 * up.
 *
 * ── The insight this module is built on ───────────────────────────────────
 * Duolingo's owl is fake, and it can afford to be: the worst outcome of an
 * ignored streak notification is that you don't learn Portuguese. Apex has two
 * real hooks instead — a HUMAN WHO NOTICES, and the member's OWN BODY CHANGING
 * — and it also has a real downside the owl does not have. A member who gets
 * fatigued and opts out does not just leave a funnel; they leave a clinical
 * relationship, and the channel we lose is the same channel we needed to tell
 * them their hematocrit came back high.
 *
 * That asymmetry is the entire design. Every constant below is a limit, not a
 * target. There is no "engagement goal" in this file, no dial to increase send
 * volume, and no code path that can emit two nudges in a day. `nudgeFor`
 * returns at most ONE nudge or null, and null is the expected answer most days.
 *
 * ── The seam this file does NOT cross ─────────────────────────────────────
 * Nothing here sends anything. A nudge is a *proposal*. Delivery goes through
 * `sendMessage` in lib/comms/send.ts, which is the single guarded entry point
 * and takes a `ConsentScope` as a required argument — a member with no live
 * grant on that scope and channel simply never receives it, and that check
 * belongs there, not duplicated here. This module imports `QUIET_HOURS` and
 * `WEEKLY_CAP` from that module rather than restating them, because two
 * implementations of a compliance limit is the same as none. Each nudge carries
 * `scope` so the caller passes the right one instead of guessing.
 */

/** Pinned clock. */
export const NOW = "2026-06-12T09:00:00";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

// ---------------------------------------------------------------------------
// HARD LIMITS — each named for the failure it prevents
// ---------------------------------------------------------------------------

/**
 * NOTHING BETWEEN 21:00 AND 08:00, ever, no override.
 *
 * FAILURE PREVENTED: the 2:40am reminder. A batched job on a UTC cron fires
 * overnight, a phone lights up on a bedside table, and the member replies STOP.
 * They do not opt out scope-by-scope — they opt out of the clinic — so one
 * badly-timed text costs us the ability to tell that member their labs are
 * back. `lib/comms/send.ts` permits an explicit `urgent: true` override for a
 * provider escalation; engagement nudges are never that, so this module has no
 * override parameter at all. A safety-critical message is a provider action,
 * not a nudge.
 */
export const NUDGE_QUIET_HOURS = QUIET_HOURS;

/**
 * AT MOST ONE NUDGE PER CALENDAR DAY.
 *
 * FAILURE PREVENTED: the stacking problem. Streak, refill, labs and follow-up
 * are four independent conditions that routinely become true on the same
 * morning. Four true statements sent together read as one anxious product.
 * `nudgeFor` evaluates every candidate and returns the highest-priority one —
 * the rest are simply not sent, not queued for later.
 */
export const MAX_NUDGES_PER_DAY = 1;

/**
 * MINIMUM GAP BETWEEN NUDGES, in days.
 *
 * FAILURE PREVENTED: daily-drip fatigue. One-a-day is technically within the
 * weekly cap and is still far too much for a clinic. Three days is long enough
 * that a nudge reads as "someone noticed something", not as a scheduled
 * broadcast the member learns to ignore.
 */
export const MIN_GAP_DAYS = 3;

/**
 * WEEKLY CEILING ON *ALL* OUTBOUND, not just nudges.
 *
 * FAILURE PREVENTED: per-surface accounting. In the audited system each surface
 * — reminders, campaigns, refill jobs, coach check-ins — counted only its own
 * sends, so a member on three programs received eleven messages in a week from
 * four systems that each believed they had sent two. The member experiences the
 * total, so the cap is measured on the total. We deliberately sit BELOW the
 * platform cap: an automated nudge must never be the message that consumes the
 * last slot a human coach needed.
 */
export const NUDGE_WEEKLY_CAP = Math.max(1, WEEKLY_CAP - 3);

/**
 * ESCALATING SILENCE — ignore three, and we stop for a week.
 *
 * FAILURE PREVENTED: shouting at someone who has already disengaged. This is
 * the one limit that is not about compliance. A member who has not responded to
 * three consecutive outbound touches is telling us something, and the correct
 * response is a human picking up a phone, not a fourth automated message. Every
 * additional nudge after that point measurably raises the chance of an opt-out,
 * and an opt-out costs us the clinical channel permanently. The clinical
 * relationship is worth more than the engagement metric — so the metric loses.
 *
 * Backing off is not giving up. `nudgeFor` returns null with an explicit
 * `suppressed` reason, which is exactly the signal a coach's worklist should be
 * reading (see `lib/mock/contactLog.ts` → `staleContacts`).
 */
export const IGNORED_LIMIT = 3;
export const BACKOFF_DAYS = 7;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NudgeKind =
  | "streak-at-risk"
  | "rings-open-late"
  | "refill-running-out"
  | "labs-due"
  | "follow-up-unbooked"
  | "coach-message-unread"
  | "chapter-reached";

export interface Nudge {
  id: string;
  kind: NudgeKind;
  /** Notification title. Short, factual, never alarmed. */
  title: string;
  /** The body. Reads like a person wrote it, because one specified it. */
  body: string;
  /**
   * WHY THIS FIRED — shown to the member verbatim in Notification settings.
   *
   * Not telemetry. A member who can see "we sent this because your refill is 4
   * days out" can evaluate whether they want that category at all, which is the
   * difference between a preference screen and a decorative toggle.
   */
  reason: string;
  /** Which legal regime the send falls under. Passed straight to `sendMessage`. */
  scope: ConsentScope;
  href: string;
  /** Higher wins when several conditions are true on the same morning. */
  priority: number;
  at: string;
}

/** Why nothing was sent. Every suppression is explainable, never silent. */
export type SuppressionReason =
  | "quiet-hours"
  | "already-nudged-today"
  | "min-gap"
  | "weekly-cap"
  | "backoff-disengaged"
  | "nothing-to-say";

export interface NudgeDecision {
  clientId: string;
  at: string;
  /** The single nudge to send, or null. Null is the common, healthy answer. */
  nudge: Nudge | null;
  /** Populated exactly when `nudge` is null. */
  suppressed?: { reason: SuppressionReason; detail: string };
  /** Candidates that were true but lost. Never sent — recorded for the audit. */
  alsoTrue: NudgeKind[];
}

// ---------------------------------------------------------------------------
// Engagement state, derived from the real contact log
// ---------------------------------------------------------------------------

/** Channels a nudge could actually be delivered on. Phone/in-person are humans. */
const MACHINE_CHANNELS = new Set(["SMS", "Email", "Portal message"]);

function machineOutbound(clientId: string): ContactEntry[] {
  return contactLogForClient(clientId).filter(
    (e) => e.direction === "outbound" && MACHINE_CHANNELS.has(e.channel),
  );
}

export interface EngagementState {
  /** Most recent automated touch of any kind. */
  lastOutboundAt?: string;
  /** Most recent time the member said something back. */
  lastInboundAt?: string;
  /** Consecutive outbound touches since the member last responded. */
  ignoredInARow: number;
  /** Machine sends inside the trailing 7 days. */
  outboundLast7: number;
  /** True if an automated touch already went out today. */
  touchedToday: boolean;
}

/**
 * What the record says about whether this member is still listening.
 *
 * Derived entirely from `contactLogForClient` — real, dated rows — rather than
 * from a separate "notification log" that would inevitably drift out of sync
 * with what the member actually received.
 */
export function engagementState(clientId: string, nowIso: string = NOW): EngagementState {
  const log = contactLogForClient(clientId); // newest first
  const now = absolute(nowIso).getTime();
  const today = nowIso.slice(0, 10);

  const lastInbound = log.find((e) => e.direction === "inbound");
  const outbound = machineOutbound(clientId).filter((e) => absolute(e.at).getTime() <= now);

  // Walk back from the newest send and count until we hit the member's last
  // reply. That count IS the ignore streak — no separate counter to maintain,
  // and no way for it to disagree with the thread the coach is reading.
  let ignored = 0;
  for (const e of outbound) {
    if (lastInbound && e.at <= lastInbound.at) break;
    ignored += 1;
  }

  return {
    lastOutboundAt: outbound[0]?.at,
    lastInboundAt: lastInbound?.at,
    ignoredInARow: ignored,
    outboundLast7: outbound.filter((e) => now - absolute(e.at).getTime() <= 7 * DAY_MS).length,
    // Compare on the local calendar day. Contact rows are stored as UTC
    // instants, so this is a day-boundary comparison in the reader's zone,
    // which is the boundary a member experiences.
    touchedToday: outbound.some((e) => absolute(e.at).toISOString().slice(0, 10) === today),
  };
}

/** True inside the do-not-disturb window. Handles the midnight wrap. */
export function inQuietHours(nowIso: string = NOW): boolean {
  const hour = absolute(nowIso).getHours();
  return hour >= NUDGE_QUIET_HOURS.startHour || hour < NUDGE_QUIET_HOURS.endHour;
}

// ---------------------------------------------------------------------------
// Candidates — each one reads a real record and returns a nudge or nothing
// ---------------------------------------------------------------------------

/**
 * Priorities. Two things are load-bearing here:
 *
 *  - `coach-message-unread` is top. A person is waiting on a reply; nothing
 *    automated is more worth a member's attention than that.
 *  - `chapter-reached` is bottom, and it is the only celebratory kind. Good
 *    news can wait for a quiet day; a refill running out cannot.
 */
const PRIORITY: Record<NudgeKind, number> = {
  "coach-message-unread": 100,
  "refill-running-out": 84,
  "labs-due": 70,
  "follow-up-unbooked": 62,
  "streak-at-risk": 50,
  "rings-open-late": 40,
  "chapter-reached": 20,
};

function nudge(
  clientId: string,
  kind: NudgeKind,
  parts: Pick<Nudge, "title" | "body" | "reason" | "scope" | "href">,
  nowIso: string,
): Nudge {
  return {
    id: `nudge-${clientId}-${kind}-${nowIso.slice(0, 10)}`,
    kind,
    priority: PRIORITY[kind],
    at: nowIso,
    ...parts,
  };
}

/** Late in the day, in the member's own evening — not "late" by server clock. */
const RINGS_LATE_HOUR = 18;

/** A streak is at risk once the evening is genuinely running out. */
const STREAK_LATE_HOUR = 19;

/** Only worth mentioning a streak that took real effort to build. */
const STREAK_WORTH_PROTECTING = 5;

/** Panels are typically 90 days apart; we start asking once one is overdue. */
const LABS_DUE_DAYS = 100;

function candidates(client: Client, nowIso: string): Nudge[] {
  const out: Nudge[] = [];
  const hour = absolute(nowIso).getHours();
  const plan = buildDailyPlan(client, nowIso);

  // --- a person is waiting on them -----------------------------------------
  // Fires only when the newest exchange is a staff message the member has not
  // answered. That is the one automated ping which is really about a human.
  const log = contactLogForClient(client.id);
  const newest = log[0];
  if (
    newest &&
    newest.direction === "outbound" &&
    newest.channel === "Portal message" &&
    (absolute(nowIso).getTime() - absolute(newest.at).getTime()) / DAY_MS >= 1
  ) {
    const coach = staffMap[newest.staffId];
    const who = coach ? coach.name.replace(/^Dr\.\s+/, "").split(" ")[0] : "your coach";
    out.push(
      nudge(
        client.id,
        "coach-message-unread",
        {
          title: `${who} is waiting on you`,
          body: `There's a message in your portal from ${who} you haven't answered yet. A one-line reply is plenty.`,
          reason: `Your coach sent a portal message on ${newest.at.slice(0, 10)} and there's no reply from you after it.`,
          scope: "clinical",
          href: "/portal/messages",
        },
        nowIso,
      ),
    );
  }

  // --- supply ---------------------------------------------------------------
  const line = tightestLine(client.id, nowIso);
  if (line && line.daysLeft <= REORDER_SOON_DAYS) {
    out.push(
      nudge(
        client.id,
        "refill-running-out",
        {
          title: line.memberLine,
          body: line.automatic,
          // Negative runway is a real state — a refill that never went out —
          // and "-11 days of supply left" is the kind of arithmetic-shaped
          // sentence that makes a member distrust every other number we show.
          reason:
            line.daysLeft < 0
              ? `${line.itemName} ran out ${Math.abs(line.daysLeft)} day${line.daysLeft === -1 ? "" : "s"} ago and has not been replaced.`
              : `${line.itemName} has ${line.daysLeft} day${line.daysLeft === 1 ? "" : "s"} of supply left, and we flag anything under ${REORDER_SOON_DAYS}.`,
          // Supply logistics, not clinical detail — the scope a member who
          // revoked marketing still expects to hear on.
          scope: "operational",
          href: "/portal/protocol",
        },
        nowIso,
      ),
    );
  }

  // --- labs due -------------------------------------------------------------
  if (client.latestLabDate) {
    const since = Math.floor(
      (absolute(nowIso).getTime() - absolute(client.latestLabDate).getTime()) / DAY_MS,
    );
    if (since >= LABS_DUE_DAYS) {
      out.push(
        nudge(
          client.id,
          "labs-due",
          {
            title: "Your next panel is due",
            body: "Any morning this week, fasted. Walk-ins are fine — it takes about ten minutes and it's what makes the next plan review worth having.",
            reason: `Your last panel was ${since} days ago.`,
            scope: "clinical",
            href: "/portal/labs",
          },
          nowIso,
        ),
      );
    }
  }

  // --- follow-up unbooked ---------------------------------------------------
  const hasUpcoming = appointmentsForClient(client.id).some(
    (a) => a.status === "Scheduled" && absolute(a.start).getTime() > absolute(nowIso).getTime(),
  );
  if (!hasUpcoming) {
    out.push(
      nudge(
        client.id,
        "follow-up-unbooked",
        {
          title: "Nothing on the books",
          body: "You don't have a next visit scheduled. Fifteen minutes with your coach is the difference between a plan and a subscription.",
          reason: "You have no scheduled appointment ahead of today.",
          scope: "operational",
          href: "/portal/messages",
        },
        nowIso,
      ),
    );
  }

  // --- streak at risk -------------------------------------------------------
  //
  // Rule E, applied precisely. Loss framing about a STREAK is fair — it is a
  // counter the member built and can see. It is never applied to their body:
  // nothing in this file says "you'll lose your progress" about a person's
  // health, because that sentence is a manipulation dressed as a reminder.
  //
  // Rule A, applied too: closing the Protocol ring means taking what was
  // prescribed. There is no nudge anywhere in this catalogue that asks anyone
  // to take more of anything.
  if (
    !plan.streak.todayClosed &&
    plan.streak.current >= STREAK_WORTH_PROTECTING &&
    hour >= STREAK_LATE_HOUR
  ) {
    out.push(
      nudge(
        client.id,
        "streak-at-risk",
        {
          title: `${plan.streak.current} days on the board`,
          body: `${plan.focus} If today isn't the day, that's fine — a day your provider told you to pause is held, not lost.`,
          reason: `You're on a ${plan.streak.current}-day streak and today's rings aren't closed yet.`,
          scope: "operational",
          href: "/portal",
        },
        nowIso,
      ),
    );
  }

  // --- rings still open, evening -------------------------------------------
  const open = plan.rings.filter((r) => r.progress < 1);
  if (open.length && open.length < plan.rings.length && hour >= RINGS_LATE_HOUR) {
    out.push(
      nudge(
        client.id,
        "rings-open-late",
        {
          title: open.length === 1 ? "One ring left" : `${open.length} rings left`,
          body: plan.focus,
          reason: `It's after ${RINGS_LATE_HOUR}:00 and ${open.map((r) => r.label).join(" and ")} ${open.length === 1 ? "is" : "are"} still open.`,
          scope: "operational",
          href: "/portal",
        },
        nowIso,
      ),
    );
  }

  // --- a chapter reached ----------------------------------------------------
  //
  // The one piece of good news in the catalogue, and it is sourced from
  // `lib/play/levels.ts`, where every point traces to a counted BEHAVIOUR — days
  // closed, consults attended, panels drawn. Never a dose, never a biomarker,
  // never a bodyweight (rule A), and never a position relative to another
  // member (rule C). A level that rises with your labs is a level that falls
  // with them.
  const level = levelFor(client.id);
  if (level && level.progress >= 0.98 && level.nextMilestone) {
    out.push(
      nudge(
        client.id,
        "chapter-reached",
        {
          title: `You're at the edge of ${level.nextMilestone.name}`,
          body: `${level.nextMilestone.xpAway} to go. ${level.nextMilestone.hint}`,
          reason: `You're ${Math.round(level.progress * 100)}% of the way through ${level.name}.`,
          scope: "operational",
          href: "/portal/progress",
        },
        nowIso,
      ),
    );
  }

  // Rule D, structurally: this catalogue is fixed and every entry is triggered
  // by a named condition on the member's own record. There is no random
  // selection, no surprise reward, no variable-ratio anything. A member could
  // read this file and predict exactly what they will receive and why — which
  // is the opposite of a slot machine, and the only defensible design in a
  // product that also prescribes medication.
  return out.sort((a, b) => b.priority - a.priority);
}

// ---------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------

function no(
  clientId: string,
  at: string,
  reason: SuppressionReason,
  detail: string,
  alsoTrue: NudgeKind[] = [],
): NudgeDecision {
  return { clientId, at, nudge: null, suppressed: { reason, detail }, alsoTrue };
}

/**
 * At most one nudge, or null.
 *
 * The limits are checked BEFORE the candidates are built where they can be, so
 * a suppressed member costs nothing to evaluate and — more importantly — so a
 * future contributor cannot accidentally reorder a limit behind a "but this one
 * is important" branch. There is no such branch. Urgency is a provider's job,
 * routed through the escalation queue with a real SLA and a real human; it is
 * not a louder notification.
 */
export function nudgeDecision(clientId: string, nowIso: string = NOW): NudgeDecision {
  const client = getClient(clientId);
  if (!client) return no(clientId, nowIso, "nothing-to-say", "Unknown member.");

  const state = engagementState(clientId, nowIso);

  // 1. Escalating silence. Checked first because it is the only limit that is
  //    about the member as a person rather than about volume.
  if (state.ignoredInARow >= IGNORED_LIMIT) {
    const since = state.lastOutboundAt
      ? (absolute(nowIso).getTime() - absolute(state.lastOutboundAt).getTime()) / DAY_MS
      : Infinity;
    if (since < BACKOFF_DAYS) {
      return no(
        clientId,
        nowIso,
        "backoff-disengaged",
        `${state.ignoredInARow} messages with no reply. Automated contact is paused for ${BACKOFF_DAYS} days — this one needs a coach, not another notification.`,
      );
    }
  }

  // 2. Quiet hours. No override exists.
  if (inQuietHours(nowIso)) {
    return no(
      clientId,
      nowIso,
      "quiet-hours",
      `Inside quiet hours (${NUDGE_QUIET_HOURS.startHour}:00–0${NUDGE_QUIET_HOURS.endHour}:00). Nothing goes out.`,
    );
  }

  // 3. One a day, hard.
  if (state.touchedToday) {
    return no(
      clientId,
      nowIso,
      "already-nudged-today",
      `Already contacted today. The cap is ${MAX_NUDGES_PER_DAY} per day and it does not carry over.`,
    );
  }

  // 4. Minimum gap.
  if (state.lastOutboundAt) {
    const gap = (absolute(nowIso).getTime() - absolute(state.lastOutboundAt).getTime()) / DAY_MS;
    if (gap < MIN_GAP_DAYS) {
      return no(
        clientId,
        nowIso,
        "min-gap",
        `Last contact was ${gap.toFixed(1)} days ago; the minimum gap is ${MIN_GAP_DAYS} days.`,
      );
    }
  }

  // 5. Weekly ceiling, measured across ALL automated outbound.
  if (state.outboundLast7 >= NUDGE_WEEKLY_CAP) {
    return no(
      clientId,
      nowIso,
      "weekly-cap",
      `${state.outboundLast7} messages already this week; the nudge ceiling is ${NUDGE_WEEKLY_CAP} (platform cap ${WEEKLY_CAP}, held back so a coach always has room).`,
    );
  }

  const ranked = candidates(client, nowIso);
  if (!ranked.length) {
    return no(
      clientId,
      nowIso,
      "nothing-to-say",
      "Nothing on this member's record warrants an interruption today.",
    );
  }

  return {
    clientId,
    at: nowIso,
    nudge: ranked[0],
    // Everything else that was true and is being dropped on the floor rather
    // than queued. A queued nudge is tomorrow's stale nudge.
    alsoTrue: ranked.slice(1).map((n) => n.kind),
  };
}

/** The one-line answer most callers want. Null means say nothing today. */
export function nudgeFor(clientId: string, nowIso: string = NOW): Nudge | null {
  return nudgeDecision(clientId, nowIso).nudge;
}

/**
 * Every hard limit, as data — rendered verbatim in the member's notification
 * settings. A limit a member cannot read is a limit they have to take on trust.
 */
export const NUDGE_LIMITS: { label: string; value: string; prevents: string }[] = [
  {
    label: "Quiet hours",
    value: `${NUDGE_QUIET_HOURS.startHour}:00 – 0${NUDGE_QUIET_HOURS.endHour}:00`,
    prevents: "Nothing reaches you overnight. There is no override for this.",
  },
  {
    label: "Per day",
    value: `${MAX_NUDGES_PER_DAY} maximum`,
    prevents:
      "Four true things on one morning still only ever gets you one message. The rest are dropped, not queued.",
  },
  {
    label: "Minimum gap",
    value: `${MIN_GAP_DAYS} days`,
    prevents: "So a nudge means something noticed, not something scheduled.",
  },
  {
    label: "Per week",
    value: `${NUDGE_WEEKLY_CAP} maximum`,
    prevents:
      "Counted across everything automated, not per feature — because you experience the total.",
  },
  {
    label: "If you're not answering",
    value: `stop after ${IGNORED_LIMIT}`,
    prevents: `Ignore ${IGNORED_LIMIT} in a row and we go quiet for ${BACKOFF_DAYS} days and hand it to your coach instead.`,
  },
];
