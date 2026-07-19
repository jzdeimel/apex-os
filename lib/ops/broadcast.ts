import type { Client, LocationId } from "@/lib/types";
import { clients, clientName } from "@/lib/mock/clients";
import { hasConsent } from "@/lib/comms/consent";
import { previewSend, sendMessage, WEEKLY_CAP } from "@/lib/comms/send";
import type { ConsentScope, ContactChannel } from "@/lib/comms/types";
import { appendLedger } from "@/lib/trace/ledger";
import { sha256 } from "@/lib/trace/hash";
import { VIEWER } from "@/lib/viewer";

/**
 * BROADCAST — one message, many members, every guard already in the path.
 *
 * ---------------------------------------------------------------------------
 * THE EXCLUDED COUNT IS THE PRODUCT
 * ---------------------------------------------------------------------------
 * A campaign tool's headline number is normally "reach 412 members", with the
 * people it skipped rolled up into a footnote or dropped silently. That is
 * backwards, and expensively so. Under the TCPA a promotional SMS to somebody
 * who revoked consent carries statutory damages per message, so the number that
 * protects the clinic is not the 412 it sent to — it is the 88 it did not. The
 * excluded count is the compliance artifact. The reach number is just volume.
 *
 * So `BroadcastPreview` puts `excluded` beside `eligible` as a peer, broken out
 * by reason, with named members behind each reason. The page renders it at the
 * same weight as reach and the send control is disabled until a preview has
 * been produced. There is no code path here that sends without first computing
 * the exclusions.
 *
 * ---------------------------------------------------------------------------
 * NOTHING HERE RE-IMPLEMENTS A GUARD
 * ---------------------------------------------------------------------------
 * This module owns segmentation and nothing else. Consent, quiet hours, the
 * weekly cap and idempotency all belong to `lib/comms/send.ts`, and the preview
 * below calls that module's own `previewSend` rather than re-deriving the same
 * predicates. That matters: a broadcast tool with its own copy of the consent
 * check is precisely how a system ends up with two answers to "may we message
 * this person", and the campaign screen is always the one with the stale copy.
 */

/** Pinned clock. */
const NOW = new Date("2026-06-12T09:00:00");
const DAY_MS = 86_400_000;

export interface Segment {
  id: string;
  name: string;
  /** What this segment is, in words an operator can check against the count. */
  description: string;
  /** The scope this segment's messages inherently are. See lib/comms/types.ts. */
  naturalScope: ConsentScope;
  match: (c: Client) => boolean;
}

function daysSince(iso?: string): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  return Math.round((NOW.getTime() - new Date(iso).getTime()) / DAY_MS);
}

/**
 * Segments.
 *
 * Each declares a `naturalScope`. This is the guard against the most common
 * compliance error in clinic messaging: a promotional offer sent under the
 * operational scope because operational consent is near-universal and marketing
 * consent is not. A segment defined by a commercial intent carries `marketing`
 * and cannot be quietly re-labelled at send time without the operator changing
 * it on screen and seeing the reach number collapse.
 */
export const SEGMENTS: Segment[] = [
  {
    id: "lab-due",
    name: "Follow-up labs due",
    description: "Active members whose last panel is more than 120 days old.",
    naturalScope: "operational",
    match: (c) =>
      (c.status === "Active Protocol" || c.status === "Follow-Up Due") &&
      daysSince(c.latestLabDate) > 120,
  },
  {
    id: "results-ready",
    name: "Results ready, no review booked",
    description: "Panel is back and the member has nothing on the calendar.",
    naturalScope: "clinical",
    match: (c) => c.status === "Results Ready" && !c.nextAppointment,
  },
  {
    id: "no-next-appt",
    name: "Active, nothing booked",
    description: "On an active protocol with no next appointment scheduled.",
    naturalScope: "operational",
    match: (c) => c.status === "Active Protocol" && !c.nextAppointment,
  },
  {
    id: "lapsed",
    name: "Lapsed members",
    description: "Inactive, joined more than 90 days ago. Win-back audience.",
    naturalScope: "marketing",
    match: (c) => c.status === "Inactive" && daysSince(c.joinedOn) > 90,
  },
  {
    id: "cold-leads",
    name: "Leads with no consult",
    description: "Leads and consult-booked members who have never been seen.",
    naturalScope: "marketing",
    match: (c) => c.status === "Lead" || c.status === "Consult Booked",
  },
  {
    id: "high-value",
    name: "Top members by lifetime value",
    description: "Lifetime value above $6,000 and currently active.",
    naturalScope: "marketing",
    match: (c) => c.lifetimeValue > 6000 && c.status !== "Inactive",
  },
];

export const SEGMENT_BY_ID: Record<string, Segment> = Object.fromEntries(
  SEGMENTS.map((s) => [s.id, s]),
);

export type ExclusionReason =
  | "no-consent"
  | "quiet-hours"
  | "weekly-cap"
  | "missing-address";

export const EXCLUSION_LABEL: Record<ExclusionReason, string> = {
  "no-consent": "No live consent for this scope and channel",
  "quiet-hours": "Would land inside quiet hours",
  "weekly-cap": `Already at the ${WEEKLY_CAP}-message weekly cap`,
  "missing-address": "No address on file for this channel",
};

/** Why each reason exists, in the words an auditor would want. */
export const EXCLUSION_WHY: Record<ExclusionReason, string> = {
  "no-consent":
    "Consent is revoked, expired, or was never granted for this scope on this channel. Sending anyway is the exposure this whole module exists to prevent.",
  "quiet-hours":
    "Non-urgent outbound is blocked 21:00–08:00. A 2am text costs the operational channel too, because members opt out of the clinic, not the campaign.",
  "weekly-cap":
    "The cap is per member across every surface — reminders, coach texts and campaigns share one budget, because the member experiences the total.",
  "missing-address":
    "No phone or email on the record. Counted rather than skipped so a data gap does not read as an opt-out.",
};

export interface ExcludedMember {
  clientId: string;
  name: string;
  locationId: LocationId;
  reason: ExclusionReason;
  detail: string;
}

export interface EligibleMember {
  clientId: string;
  name: string;
  locationId: LocationId;
  to: string;
}

export interface BroadcastPreview {
  segmentId: string;
  segmentName: string;
  channel: ContactChannel;
  scope: ConsentScope;
  /** Everyone the segment matched, before any guard ran. */
  matched: number;
  eligible: EligibleMember[];
  excluded: ExcludedMember[];
  /** Excluded, grouped by reason, largest first. */
  exclusionBreakdown: { reason: ExclusionReason; count: number; members: ExcludedMember[] }[];
  /**
   * True when the scope selected for the send is weaker than the segment's
   * natural scope — e.g. a win-back offer being sent as "operational".
   *
   * This is a hard stop rather than a warning. Scope laundering is the one
   * mistake here that is deliberate rather than careless.
   */
  scopeMismatch: boolean;
  scopeMismatchDetail?: string;
  /** Composite guard: false blocks the send control entirely. */
  canSend: boolean;
}

const SCOPE_STRENGTH: Record<ConsentScope, number> = {
  operational: 0,
  clinical: 1,
  marketing: 2,
};

function addressFor(c: Client, channel: ContactChannel): string | undefined {
  if (channel === "SMS") return c.phone || undefined;
  if (channel === "Email") return c.email || undefined;
  if (channel === "Portal message") return `portal:${c.id}`;
  return undefined;
}

/**
 * Compute reach and exclusions. Pure, synchronous, no side effects.
 *
 * Called on every keystroke of the composer, which is the point: the excluded
 * count has to move while the operator is still choosing the audience, not
 * appear in a confirmation dialog after they have already decided.
 */
export function previewBroadcast(
  segmentId: string,
  channel: ContactChannel,
  scope: ConsentScope,
  at: Date = NOW,
): BroadcastPreview {
  const segment = SEGMENT_BY_ID[segmentId];
  const matchedClients = segment ? clients.filter(segment.match) : [];

  const eligible: EligibleMember[] = [];
  const excluded: ExcludedMember[] = [];

  for (const c of matchedClients) {
    const to = addressFor(c, channel);
    if (!to) {
      excluded.push({
        clientId: c.id,
        name: clientName(c),
        locationId: c.locationId,
        reason: "missing-address",
        detail: `No ${channel.toLowerCase()} address on record.`,
      });
      continue;
    }

    // Consent is asked first and separately, so a member with no consent is
    // never evaluated against the rate limiter — the same ordering the send
    // path uses, for the same reason.
    if (!hasConsent(c.id, scope, channel, at)) {
      excluded.push({
        clientId: c.id,
        name: clientName(c),
        locationId: c.locationId,
        reason: "no-consent",
        detail: `No live ${scope} consent for ${channel}.`,
      });
      continue;
    }

    // Everything else defers to the send module's own predicates.
    const pre = previewSend({
      clientId: c.id,
      staffId: VIEWER.id,
      channel,
      scope,
      body: "preview",
      to,
      at,
    });

    if (!pre.allowed) {
      const reason: ExclusionReason =
        pre.refusal === "quiet-hours" ? "quiet-hours" : pre.refusal === "weekly-cap" ? "weekly-cap" : "no-consent";
      excluded.push({
        clientId: c.id,
        name: clientName(c),
        locationId: c.locationId,
        reason,
        detail: pre.message,
      });
      continue;
    }

    eligible.push({ clientId: c.id, name: clientName(c), locationId: c.locationId, to });
  }

  const byReason = new Map<ExclusionReason, ExcludedMember[]>();
  for (const e of excluded) {
    const list = byReason.get(e.reason);
    if (list) list.push(e);
    else byReason.set(e.reason, [e]);
  }

  const scopeMismatch =
    !!segment && SCOPE_STRENGTH[scope] < SCOPE_STRENGTH[segment.naturalScope];

  return {
    segmentId,
    segmentName: segment?.name ?? "Unknown segment",
    channel,
    scope,
    matched: matchedClients.length,
    eligible,
    excluded,
    exclusionBreakdown: [...byReason.entries()]
      .map(([reason, members]) => ({ reason, count: members.length, members }))
      .sort((a, b) => b.count - a.count),
    scopeMismatch,
    scopeMismatchDetail: scopeMismatch
      ? `"${segment?.name}" is a ${segment?.naturalScope} audience. Sending it as ${scope} would reach members who never consented to be marketed to. Change the scope, or change the audience.`
      : undefined,
    canSend: !scopeMismatch && eligible.length > 0,
  };
}

export interface BroadcastResult {
  sent: number;
  refused: number;
  /** Refusals that happened at send time despite passing preview. */
  lateRefusals: { clientId: string; message: string }[];
  ledgerRowId: string;
  batchId: string;
}

/**
 * Execute the broadcast.
 *
 * Every message goes through `sendMessage` individually. Not a bulk API, not a
 * loop with the consent check hoisted out — one guarded call per member, each
 * with its own idempotency key derived from the batch and the member, so a
 * double-clicked "Send" produces the same keys and the provider treats the
 * second attempt as a no-op.
 *
 * The batch also gets a single ledger row of its own. Per-message rows already
 * exist inside the send path; this one records the *decision* — who sent what,
 * to which segment, and critically how many were excluded and why. That is the
 * row an auditor asks for, and it cannot be reconstructed from the per-message
 * rows because the excluded members produced no message.
 */
export async function sendBroadcast(
  preview: BroadcastPreview,
  body: string,
  subject: string | undefined,
  at: Date = NOW,
): Promise<BroadcastResult> {
  if (!preview.canSend) {
    throw new Error(
      "Broadcast blocked: preview did not clear. Scope mismatch or empty audience.",
    );
  }

  const batchId = `bc-${sha256(`${preview.segmentId}:${preview.channel}:${preview.scope}:${body}`).slice(0, 10)}`;

  let sent = 0;
  const lateRefusals: { clientId: string; message: string }[] = [];

  for (const m of preview.eligible) {
    const result = await sendMessage({
      clientId: m.clientId,
      staffId: VIEWER.id,
      channel: preview.channel,
      scope: preview.scope,
      body,
      subject,
      to: m.to,
      idempotencyKey: `${batchId}:${m.clientId}`,
      at,
    });
    if (result.ok) sent += 1;
    else lateRefusals.push({ clientId: m.clientId, message: result.message });
  }

  const row = appendLedger({
    actorId: VIEWER.id,
    actorName: VIEWER.name,
    actorRole: VIEWER.role,
    action: "create",
    entity: "note",
    entityId: batchId,
    reason: `Broadcast to segment "${preview.segmentName}" via ${preview.channel} (${preview.scope})`,
    after: {
      batchId,
      segmentId: preview.segmentId,
      channel: preview.channel,
      scope: preview.scope,
      matched: preview.matched,
      sent,
      // The exclusion tally is on the ledger row, not just on the screen. A
      // compliance record that only proves what was sent cannot answer the
      // question that actually gets asked, which is who was protected.
      excluded: preview.excluded.length,
      excludedByReason: Object.fromEntries(
        preview.exclusionBreakdown.map((b) => [b.reason, b.count]),
      ),
      lateRefusals: lateRefusals.length,
      chars: body.length,
    },
  });

  // batchId is what ties the ledger row, every per-member send and any
  // later reconciliation together — returning it is the whole point.
  return { batchId, sent, refused: lateRefusals.length, lateRefusals, ledgerRowId: row.id };
}

/** Clinic-wide reachability, for the segment picker's context line. */
export function reachabilitySnapshot(channel: ContactChannel, scope: ConsentScope) {
  const reachable = clients.filter((c) => hasConsent(c.id, scope, channel)).length;
  return {
    total: clients.length,
    reachable,
    share: clients.length === 0 ? 0 : reachable / clients.length,
  };
}
