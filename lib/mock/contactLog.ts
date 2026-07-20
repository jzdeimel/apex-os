import { clients, getClient } from "@/lib/mock/clients";
import { staffMap } from "@/lib/mock/staff";
import { seededRandom, absolute } from "@/lib/utils";
import { sha256 } from "@/lib/trace/hash";
import { hasConsent } from "@/lib/comms/consent";
import type {
  ContactChannel,
  ContactEntry,
  ContactOutcome,
  ConsentScope,
} from "@/lib/comms/types";

/**
 * Deterministic contact history for every member.
 *
 * Two decisions worth stating outright, both taken from what the audited system
 * got wrong and got right:
 *
 *  WRONG — direction was decorative. Every row rendered as an outbound coach
 *  bubble, so a member's unanswered inbound question was visually identical to
 *  a coach's follow-up. Coaches learned to distrust the thread and re-read the
 *  raw SMS export instead. Here `direction` is generated honestly: inbound
 *  entries are authored by the member, carry outcome "Replied", and are the
 *  only rows that can follow an outbound message in a thread.
 *
 *  RIGHT — same-day disposition collapse. Their reporting counts the *best*
 *  outcome per member per day rather than raw dial count, which removes the
 *  incentive to dial a member four times to log four "touches". We keep that
 *  exactly, as `dispositionRank` + `bestTouchPerDay`.
 */

const NOW = absolute("2026-06-12T09:00:00");

// ---------------------------------------------------------------------------
// Disposition ranking
// ---------------------------------------------------------------------------

/**
 * Higher is a better outcome. Used to collapse a day's touches to one.
 *
 * The ordering is deliberate: an inbound "Replied" outranks an outbound
 * "Connected" because a member who initiates is more engaged than one who
 * merely picked up. "Opted out" ranks lowest of all — below a bounce — because
 * it is the one disposition that should stop the sequence entirely rather than
 * count as contact.
 */
export const dispositionRank: Record<ContactOutcome, number> = {
  Replied: 6,
  Connected: 5,
  Delivered: 3,
  "Left voicemail": 2,
  "No answer": 1,
  Bounced: 0,
  "Opted out": -1,
};

// ---------------------------------------------------------------------------
// Message content pools
// ---------------------------------------------------------------------------

interface Template {
  channel: ContactChannel;
  scope: ConsentScope;
  subject?: string;
  body: (first: string, coach: string) => string;
  outcomes: ContactOutcome[];
  /** Likelihood the member answers this kind of touch. */
  replyChance: number;
  weight: number;
}

const OUTBOUND_TEMPLATES: Template[] = [
  {
    channel: "SMS",
    scope: "operational",
    body: (f) => `Hi ${f} — reminder of your visit tomorrow. Reply C to confirm or R to reschedule.`,
    outcomes: ["Delivered"],
    replyChance: 0.55,
    weight: 16,
  },
  {
    channel: "SMS",
    scope: "operational",
    body: (f) => `${f}, your order shipped today and should arrive in 2 business days. Track it in your Apex portal.`,
    outcomes: ["Delivered"],
    replyChance: 0.2,
    weight: 12,
  },
  {
    channel: "SMS",
    scope: "clinical",
    body: (f, coach) => `${f} — ${coach} here. Checking in on week 3. How are energy levels and sleep tracking since the dose change?`,
    outcomes: ["Delivered"],
    replyChance: 0.62,
    weight: 15,
  },
  {
    channel: "Portal message",
    scope: "clinical",
    subject: "Your lab results are ready",
    body: (f) => `${f}, your panel is back and your provider has reviewed it. Results and the plan summary are in your portal — no action needed before your visit.`,
    outcomes: ["Delivered"],
    replyChance: 0.45,
    weight: 11,
  },
  {
    channel: "Email",
    scope: "clinical",
    subject: "Protocol summary + what changed",
    body: (f, coach) => `Hi ${f},\n\nSummary of what we adjusted this cycle and why, plus your monitoring checkpoints. Bring questions to your next visit.\n\n— ${coach}`,
    outcomes: ["Delivered", "Bounced"],
    replyChance: 0.3,
    weight: 9,
  },
  {
    channel: "Phone",
    scope: "clinical",
    body: (f, coach) => `Outbound call from ${coach} — reviewed adherence, side effects, and injection technique. Member reports no issues.`,
    outcomes: ["Connected", "Left voicemail", "No answer"],
    replyChance: 0,
    weight: 13,
  },
  {
    channel: "Phone",
    scope: "operational",
    body: (f) => `Call re: card on file declined at renewal. Requested updated payment method.`,
    outcomes: ["Connected", "Left voicemail", "No answer"],
    replyChance: 0,
    weight: 5,
  },
  {
    channel: "In person",
    scope: "clinical",
    body: (f, coach) => `In-clinic check-in with ${coach} after body scan. Reviewed composition trend and set the next 4-week target.`,
    outcomes: ["Connected"],
    replyChance: 0,
    weight: 7,
  },
  {
    channel: "Email",
    scope: "marketing",
    subject: "Member-only: peptide protocol workshop",
    body: (f) => `${f}, we're hosting a members-only session on recovery peptides at the Raleigh studio. Seats are limited.`,
    outcomes: ["Delivered", "Opted out"],
    replyChance: 0.08,
    weight: 6,
  },
  {
    channel: "SMS",
    scope: "clinical",
    body: (f) => `${f} — labs are due before your next visit. Fasting draw, any morning this week. Walk-ins fine.`,
    outcomes: ["Delivered"],
    replyChance: 0.5,
    weight: 10,
  },
];

const INBOUND_REPLIES: { channel: ContactChannel; scope: ConsentScope; body: string }[] = [
  { channel: "SMS", scope: "operational", body: "C — confirmed, see you then." },
  { channel: "SMS", scope: "operational", body: "Can we push it to Thursday? Something came up at work." },
  { channel: "SMS", scope: "clinical", body: "Energy is way better, sleeping through the night now. Still some soreness at the injection site." },
  { channel: "SMS", scope: "clinical", body: "Down 6 lbs since we started. Appetite is way down — is that expected?" },
  { channel: "SMS", scope: "clinical", body: "I missed two doses last week traveling. Do I double up or just resume?" },
  { channel: "Portal message", scope: "clinical", body: "Saw the results — what does the free testosterone number actually mean for me day to day?" },
  { channel: "Portal message", scope: "operational", body: "Order still says processing on my end. Any update?" },
  { channel: "Email", scope: "clinical", body: "Thanks for the summary. One question on the training block — should I keep lifting on rest days?" },
  { channel: "SMS", scope: "operational", body: "Card updated in the portal, thanks for the heads up." },
  { channel: "Phone", scope: "clinical", body: "Inbound call from member — asked about timing of the morning dose relative to training." },
];

const TEMPLATE_TOTAL = OUTBOUND_TEMPLATES.reduce((s, t) => s + t.weight, 0);

function pickTemplate(r: number): Template {
  let acc = 0;
  const target = r * TEMPLATE_TOTAL;
  for (const t of OUTBOUND_TEMPLATES) {
    acc += t.weight;
    if (target <= acc) return t;
  }
  return OUTBOUND_TEMPLATES[0];
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function entryId(clientId: string, n: number): string {
  return `ct-${clientId.slice(-3)}-${String(n).padStart(3, "0")}`;
}

/** Contact events carry a ledger row id so the touch is verifiable, not asserted. */
function ledgerIdFor(id: string): string {
  return `led-cm-${sha256(id).slice(0, 8)}`;
}

function buildLog(clientId: string): ContactEntry[] {
  const client = getClient(clientId);
  if (!client) return [];

  const rand = seededRandom(`apex-contactlog-v1:${clientId}`);
  const coachId = client.coachId;
  const coachName = staffMap[coachId]?.name ?? "your coach";
  const coachFirst = coachName.replace(/^Dr\.\s+/, "").split(" ")[0];

  // Volume tracks engagement: an active member on protocol gets touched far
  // more than a dormant lead. A flat count per member is the tell of fake data.
  const base =
    client.status === "Active Protocol" || client.status === "Follow-Up Due"
      ? 14
      : client.status === "Inactive" || client.status === "Lead"
        ? 5
        : 9;
  const count = base + Math.floor(rand() * 6);

  const out: ContactEntry[] = [];
  let n = 0;
  // Walk forward from ~150 days before NOW so the newest touch lands near today.
  let cursor = NOW.getTime() - 150 * 86_400_000;
  const stepMs = (150 * 86_400_000) / (count + 1);

  for (let i = 0; i < count; i++) {
    // Irregular gaps, clustered around the nominal cadence.
    cursor += Math.floor(stepMs * (0.45 + rand() * 1.2));
    if (cursor > NOW.getTime()) break;

    const tpl = pickTemplate(rand());

    // A member with no live consent on that scope/channel simply never received
    // that message — the log reflects the guard, it does not narrate around it.
    const machineSent = tpl.channel === "SMS" || tpl.channel === "Email" || tpl.channel === "Portal message";

    // Business hours, 8:00–19:00 — quiet hours are enforced, so nothing at 2am.
    const day = absolute(cursor);
    day.setHours(8 + Math.floor(rand() * 11), Math.floor(rand() * 60), 0, 0);

    // Consent is evaluated AS OF the message date, not as of today. The
    // auditor's question is never "may we text them now" — it is "were we
    // permitted to text them on the day we did." Checking against the current
    // grant would retroactively erase a year of lawful history the moment a
    // member replies STOP.
    if (machineSent && !hasConsent(clientId, tpl.scope, tpl.channel, day)) continue;
    const at = day.toISOString();

    n += 1;
    const id = entryId(clientId, n);
    const threadId = `th-${clientId.slice(-3)}-${String(Math.floor(n / 2) + 1).padStart(2, "0")}`;
    const outcome = tpl.outcomes[Math.floor(rand() * tpl.outcomes.length)];

    out.push({
      id,
      clientId,
      staffId: coachId,
      channel: tpl.channel,
      direction: "outbound",
      outcome,
      at,
      body: tpl.body(client.firstName, coachFirst),
      ...(tpl.subject ? { subject: tpl.subject } : {}),
      threadId,
      ledgerEventId: ledgerIdFor(id),
      consentScopeUsed: tpl.scope,
      ...(machineSent ? { deliveryId: `acs-demo-${sha256(id).slice(0, 12)}` } : {}),
    });

    // --- the inbound reply -------------------------------------------------
    // Genuinely inbound: authored by the member, direction "inbound", outcome
    // "Replied", same thread. A bounced or opted-out send can never be replied
    // to, and a voicemail is not a reply.
    const replyable = outcome === "Delivered" && machineSent;
    if (replyable && rand() < tpl.replyChance) {
      const pool = INBOUND_REPLIES.filter((r) => r.channel === tpl.channel);
      const reply = (pool.length > 0 ? pool : INBOUND_REPLIES)[
        Math.floor(rand() * (pool.length > 0 ? pool.length : INBOUND_REPLIES.length))
      ];
      // Replies land minutes to hours later, never before the message.
      const replyAt = absolute(day.getTime() + Math.floor((6 + rand() * 400) * 60_000));
      if (replyAt.getTime() <= NOW.getTime()) {
        n += 1;
        const rid = entryId(clientId, n);
        out.push({
          id: rid,
          clientId,
          // Inbound is still attributed to the owning coach — that is who has
          // to act on it — but direction, not staffId, drives the rendering.
          staffId: coachId,
          channel: reply.channel,
          direction: "inbound",
          outcome: "Replied",
          at: replyAt.toISOString(),
          body: reply.body,
          threadId,
          ledgerEventId: ledgerIdFor(rid),
          consentScopeUsed: reply.scope,
        });
      }
    }
  }

  return out;
}

const LOG_BY_CLIENT: Record<string, ContactEntry[]> = (() => {
  const map: Record<string, ContactEntry[]> = {};
  for (const c of clients) {
    // Stored newest-first, which is how every surface reads it.
    map[c.id] = buildLog(c.id).sort((a, b) => b.at.localeCompare(a.at));
  }
  return map;
})();

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Full history for one member, newest first. */
export function contactLogForClient(clientId: string): ContactEntry[] {
  return LOG_BY_CLIENT[clientId] ?? [];
}

/** The most recent touch in either direction. */
export function lastTouchFor(clientId: string): ContactEntry | undefined {
  return contactLogForClient(clientId)[0];
}

/**
 * Days since the last touch. Returns Infinity for a member never contacted so
 * "no contact ever" sorts to the top of a stale-list rather than reading as 0.
 */
export function daysSinceTouch(clientId: string): number {
  const last = lastTouchFor(clientId);
  if (!last) return Infinity;
  return Math.floor((NOW.getTime() - Date.parse(last.at)) / 86_400_000);
}

/** Last inbound only — "have they actually said anything back?" */
export function lastInboundFor(clientId: string): ContactEntry | undefined {
  return contactLogForClient(clientId).find((e) => e.direction === "inbound");
}

/**
 * Collapse a member's history to one entry per calendar day, keeping the best
 * disposition. Ties break toward the later entry.
 *
 * This is the anti-gaming rule: three "No answer" dials and one "Connected" on
 * the same day is one connected touch, not four touches. Coach activity
 * reporting must read from this, never from the raw log.
 */
export function bestTouchPerDay(entries: ContactEntry[]): ContactEntry[] {
  const byDay = new Map<string, ContactEntry>();
  for (const e of entries) {
    const day = e.at.slice(0, 10);
    const held = byDay.get(day);
    if (
      !held ||
      dispositionRank[e.outcome] > dispositionRank[held.outcome] ||
      (dispositionRank[e.outcome] === dispositionRank[held.outcome] && e.at > held.at)
    ) {
      byDay.set(day, e);
    }
  }
  return [...byDay.values()].sort((a, b) => b.at.localeCompare(a.at));
}

/** Effective touch count over a window — collapsed, so it cannot be inflated. */
export function touchCount(clientId: string, days = 7): number {
  const cutoff = NOW.getTime() - days * 86_400_000;
  const recent = contactLogForClient(clientId).filter((e) => Date.parse(e.at) >= cutoff);
  return bestTouchPerDay(recent).length;
}

/** Outbound-only count in the last 7 days — the input to the weekly cap guard. */
export function outboundThisWeek(clientId: string): number {
  const cutoff = NOW.getTime() - 7 * 86_400_000;
  return contactLogForClient(clientId).filter(
    (e) => e.direction === "outbound" && Date.parse(e.at) >= cutoff,
  ).length;
}

/** Threaded view for the conversation pane. Newest thread first. */
export function threadsForClient(clientId: string): { threadId: string; entries: ContactEntry[] }[] {
  const groups = new Map<string, ContactEntry[]>();
  for (const e of contactLogForClient(clientId)) {
    const key = e.threadId ?? e.id;
    const arr = groups.get(key);
    if (arr) arr.push(e);
    else groups.set(key, [e]);
  }
  return [...groups.entries()]
    .map(([threadId, entries]) => ({
      threadId,
      // Within a thread, oldest first — a conversation reads downward.
      entries: [...entries].sort((a, b) => a.at.localeCompare(b.at)),
    }))
    .sort((a, b) =>
      b.entries[b.entries.length - 1].at.localeCompare(a.entries[a.entries.length - 1].at),
    );
}

/** Every touch across the clinic, newest first — powers the ops comms feed. */
export const contactLog: ContactEntry[] = clients
  .flatMap((c) => LOG_BY_CLIENT[c.id] ?? [])
  .sort((a, b) => b.at.localeCompare(a.at));

/** Members with no touch in `days` — the coach's real worklist. */
export function staleContacts(days = 21): { clientId: string; days: number }[] {
  return clients
    .map((c) => ({ clientId: c.id, days: daysSinceTouch(c.id) }))
    .filter((r) => r.days >= days)
    .sort((a, b) => b.days - a.days);
}
