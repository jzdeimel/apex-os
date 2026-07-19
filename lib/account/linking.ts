import type { Client } from "@/lib/types";
import { appendLedger } from "@/lib/trace/ledger";

/**
 * PARTNER LINKING.
 *
 * Couples do this together. A husband and wife start TRT and HRT in the same
 * month, drive to the same clinic, pay on the same card, and then discover the
 * product treats them as two strangers who happen to share a surname. Every
 * question — "when's your appointment", "did yours ship", "what did they say" —
 * gets answered by one of them reading their phone aloud to the other. Linking
 * is the feature that stops that, and it is genuinely wanted.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * READ THIS BEFORE CHANGING ANYTHING IN THIS FILE
 *
 * A linked account is a STANDING PHI DISCLOSURE BETWEEN TWO PEOPLE WHOSE
 * RELATIONSHIP MAY CHANGE.
 *
 * That sentence is the entire threat model. Everything else here follows from
 * it, and it is worth being blunt about what "may change" means in practice,
 * because the pleasant case is the one that gets designed for and the ugly case
 * is the one that ends up in a deposition:
 *
 *   · They separate. One of them keeps reading the other's lab results, visit
 *     notes and appointment times for months, because a consent granted in
 *     year one has no expiry and nobody thought to revisit it.
 *   · The relationship was coercive to begin with. A partner who controls the
 *     phone, the email and the money "helps set up" the account and grants
 *     themselves every scope. The product has now become an instrument of that
 *     control, with an audit trail showing the victim consented.
 *   · One of them is on a treatment they have not discussed — a sexual health
 *     protocol, a mental health referral, a fertility conversation. Clinical
 *     scope sharing outs them to their own partner, permanently, in a UI they
 *     did not read closely on the day they were excited to sign up.
 *
 * None of these are exotic. All three are ordinary, and all three are made
 * dramatically worse by a default-open design. So:
 *
 *   1. DEFAULT-CLOSED. Every scope starts OFF, including the sociable ones.
 *      There is no "recommended" bundle, no pre-ticked box, no onboarding step
 *      that grants six scopes with one tap. `LINK_SCOPES` carries
 *      `defaultGranted: false` as a literal type so it cannot drift.
 *   2. CLINICAL IS NEVER IMPLIED. Billing, appointments and milestones are
 *      logistics. Labs, protocol and visit notes are medicine. Granting the
 *      first three grants exactly the first three — each clinical scope needs
 *      its own separate, explicit, individually-confirmed grant.
 *   3. GRANTS ARE ONE-DIRECTIONAL AND PERSONAL. "I let you see mine" is not
 *      "you let me see yours". Reciprocity is a UI convenience, never an
 *      inference — see `GrantKey`. Symmetric-by-default sharing means the
 *      person who set up the link decided what the other person disclosed.
 *   4. EITHER PARTY REVOKES INSTANTLY AND UNILATERALLY. No confirmation from
 *      the other side, no notice period, no "are you sure, this will affect
 *      your partner". A revocation flow that requires a conversation is
 *      unusable by the exact person who most needs it, and asking them to
 *      justify it is asking them to explain themselves to their abuser.
 *   5. EVERY SCOPE CHANGE APPENDS A LEDGER ROW. Grants, revocations, the
 *      invite, the acceptance, the decline. A standing disclosure that cannot
 *      be reconstructed — who could see what, from when to when — is not
 *      auditable, and "who has seen my chart" on /portal/access must be able to
 *      answer for a partner exactly as it answers for staff.
 *   6. INVITES EXPIRE. An unaccepted invite is a door left open; after
 *      `INVITE_TTL_DAYS` it closes and has to be reissued deliberately.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const NOW = "2026-06-12T09:00:00";

/** An invite nobody acted on is withdrawn rather than left standing forever. */
export const INVITE_TTL_DAYS = 14;

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

export type LinkScopeId =
  | "billing"
  | "appointments"
  | "milestones"
  | "clinical-labs"
  | "clinical-protocol"
  | "clinical-notes";

export interface LinkScope {
  id: LinkScopeId;
  label: string;
  /** Exactly what the other person would be able to see. No euphemism. */
  what: string;
  /** True for anything that discloses medical information. */
  clinical: boolean;
  /**
   * Literal `false`. Not a value with a default — a value that has no other
   * possible state. A future "recommended defaults" change would have to alter
   * the type to compile, which is a diff a reviewer sees.
   */
  defaultGranted: false;
  /** The consequence, stated to the person granting it. */
  consequence: string;
}

export const LINK_SCOPES: LinkScope[] = [
  {
    id: "billing",
    label: "Billing",
    what: "Invoices, membership charges and the card on file for your account.",
    clinical: false,
    defaultGranted: false,
    consequence: "They'll see what you're charged and what you pay for. They won't see why it was prescribed.",
  },
  {
    id: "appointments",
    label: "Appointments",
    what: "The date, time and location of your visits.",
    clinical: false,
    defaultGranted: false,
    consequence: "They'll see when and where you're being seen — not what the visit is about.",
  },
  {
    id: "milestones",
    label: "Milestones",
    what: "The wins you choose to celebrate — streaks, anniversaries, scan progress.",
    clinical: false,
    defaultGranted: false,
    consequence: "The nice part. They'll see your streak and your progress markers, and nothing underneath them.",
  },
  {
    id: "clinical-labs",
    label: "Lab results",
    what: "Your biomarkers, values, ranges and trends over time.",
    clinical: true,
    defaultGranted: false,
    consequence:
      "This is medical information about your body. Once shared, they can read every panel — past and future — until you turn it off.",
  },
  {
    id: "clinical-protocol",
    label: "Protocol",
    what: "What you've been prescribed, and what you're taking.",
    clinical: true,
    defaultGranted: false,
    consequence:
      "They'll see your treatment. Think about whether there is anything on it you haven't discussed yet — this is not the way to have that conversation.",
  },
  {
    id: "clinical-notes",
    label: "Visit notes",
    what: "The summaries your coach and provider write after a consult.",
    clinical: true,
    defaultGranted: false,
    consequence:
      "The most sensitive scope. Visit notes record what you said, including things you may have said precisely because the room was private.",
  },
];

export const scopeMap: Record<LinkScopeId, LinkScope> = Object.fromEntries(
  LINK_SCOPES.map((s) => [s.id, s]),
) as Record<LinkScopeId, LinkScope>;

export const CLINICAL_SCOPES = LINK_SCOPES.filter((s) => s.clinical).map((s) => s.id);

// ---------------------------------------------------------------------------
// The link
// ---------------------------------------------------------------------------

export type LinkStatus = "Invited" | "Active" | "Declined" | "Revoked" | "Expired";

/**
 * `${ownerId}:${scopeId}` — the owner is the person whose data is disclosed,
 * never the person doing the looking.
 *
 * Keying by owner is what makes rule 3 structural rather than a convention. You
 * physically cannot represent "this link shares labs" without naming whose
 * labs, so no code path can grant a scope symmetrically by accident.
 */
export type GrantKey = string;

export interface ScopeGrant {
  scopeId: LinkScopeId;
  /** Whose data this discloses. */
  ownerId: string;
  granted: boolean;
  grantedAt?: string;
  revokedAt?: string;
  /** Ledger row for the most recent change. Makes the trail resolvable, not implied. */
  ledgerId?: string;
}

export interface PartnerLink {
  id: string;
  /** The member who sent the invite. */
  inviterId: string;
  inviterName: string;
  /** Who it was sent to. Resolved to an id only once they accept. */
  inviteeEmail: string;
  inviteeId?: string;
  inviteeName?: string;
  status: LinkStatus;
  invitedAt: string;
  expiresAt: string;
  acceptedAt?: string;
  closedAt?: string;
  /** Who ended it. Recorded because "either party may revoke" is only real if it is logged. */
  closedBy?: string;
  grants: Record<GrantKey, ScopeGrant>;
}

const links: PartnerLink[] = [];

export function grantKey(ownerId: string, scopeId: LinkScopeId): GrantKey {
  return `${ownerId}:${scopeId}`;
}

export function linksFor(clientId: string): PartnerLink[] {
  return links.filter((l) => l.inviterId === clientId || l.inviteeId === clientId);
}

export function activeLinkFor(clientId: string): PartnerLink | null {
  return linksFor(clientId).find((l) => l.status === "Active") ?? null;
}

export function pendingInviteFor(clientId: string): PartnerLink | null {
  return linksFor(clientId).find((l) => l.status === "Invited") ?? null;
}

export function linkById(id: string): PartnerLink | undefined {
  return links.find((l) => l.id === id);
}

/** The other person, from one side's point of view. */
export function counterpartOf(link: PartnerLink, viewerId: string): { id?: string; name: string } {
  return viewerId === link.inviterId
    ? { id: link.inviteeId, name: link.inviteeName ?? link.inviteeEmail }
    : { id: link.inviterId, name: link.inviterName };
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

/**
 * Linking events record against `consent`, and that is not a shrug at the
 * available enum members — it is precisely what a scope grant is. A member
 * authorising a named third party to read their record is a HIPAA
 * authorisation, and it belongs in the same bucket as every other consent the
 * member has signed.
 */
function recordConsent(args: {
  actor: { id: string; name: string };
  subject: { id: string; name: string };
  action: "create" | "update" | "approve" | "decline";
  entityId: string;
  reason: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}): string {
  const row = appendLedger({
    actorId: args.actor.id,
    actorName: args.actor.name,
    actorRole: "Client",
    action: args.action,
    entity: "consent",
    entityId: args.entityId,
    subjectId: args.subject.id,
    subjectName: args.subject.name,
    reason: args.reason,
    before: args.before,
    after: args.after,
  });
  return row.id;
}

function fullName(c: Client): string {
  return `${c.firstName} ${c.lastName}`;
}

function addDays(iso: string, n: number): string {
  return new Date(new Date(iso).getTime() + n * 86_400_000).toISOString().slice(0, 19);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Send an invite.
 *
 * Creates NO grants. An invite is a request to be connected, not a request for
 * access — the two are separated deliberately so that accepting a link is never
 * the same gesture as disclosing a record.
 */
export function invitePartner(inviter: Client, inviteeEmail: string): PartnerLink {
  const link: PartnerLink = {
    id: `lnk-${inviter.id}-${inviteeEmail.replace(/[^a-z0-9]/gi, "").slice(0, 12)}`,
    inviterId: inviter.id,
    inviterName: fullName(inviter),
    inviteeEmail: inviteeEmail.trim(),
    status: "Invited",
    invitedAt: NOW,
    expiresAt: addDays(NOW, INVITE_TTL_DAYS),
    grants: {},
  };

  const idx = links.findIndex((l) => l.id === link.id);
  if (idx >= 0) links[idx] = link;
  else links.push(link);

  recordConsent({
    actor: { id: inviter.id, name: fullName(inviter) },
    subject: { id: inviter.id, name: fullName(inviter) },
    action: "create",
    entityId: link.id,
    reason: "Member invited a partner to link accounts",
    // The invitee's address is recorded because the invite was sent to it and
    // an audit of "who was invited" is meaningless without it. Nothing about
    // the inviter's record is disclosed by the invite itself.
    after: { invitee: link.inviteeEmail, status: "Invited", scopesGranted: 0, expiresAt: link.expiresAt },
  });

  return link;
}

/**
 * Accept. Both sides now agree the link exists.
 *
 * Still creates no grants: an accepted link with every scope off is the correct
 * resting state, and it is what the UI shows immediately after acceptance so
 * nobody believes something was shared by accepting.
 */
export function acceptLink(linkId: string, invitee: Client, at: string = NOW): PartnerLink | null {
  const link = linkById(linkId);
  if (!link || link.status !== "Invited") return null;
  if (at > link.expiresAt) {
    link.status = "Expired";
    return link;
  }

  link.status = "Active";
  link.inviteeId = invitee.id;
  link.inviteeName = fullName(invitee);
  link.acceptedAt = at;

  recordConsent({
    actor: { id: invitee.id, name: fullName(invitee) },
    subject: { id: invitee.id, name: fullName(invitee) },
    action: "approve",
    entityId: link.id,
    reason: "Member accepted a partner link invitation",
    before: { status: "Invited" },
    after: { status: "Active", with: link.inviterName, scopesGranted: 0 },
  });

  return link;
}

export function declineLink(linkId: string, invitee: Client): PartnerLink | null {
  const link = linkById(linkId);
  if (!link || link.status !== "Invited") return null;
  link.status = "Declined";
  link.closedAt = NOW;
  link.closedBy = invitee.id;

  recordConsent({
    actor: { id: invitee.id, name: fullName(invitee) },
    subject: { id: invitee.id, name: fullName(invitee) },
    action: "decline",
    entityId: link.id,
    reason: "Member declined a partner link invitation",
    before: { status: "Invited" },
    after: { status: "Declined" },
  });

  return link;
}

// ---------------------------------------------------------------------------
// Scopes — the part that actually discloses anything
// ---------------------------------------------------------------------------

/**
 * Grant one scope over YOUR OWN record to your partner.
 *
 * `owner` is the granting member, and the function refuses to grant on anyone
 * else's behalf. That check is not defensive programming for a demo — it is the
 * one invariant that stops a UI bug from letting the person who set up the link
 * decide what their partner disclosed.
 */
export function grantScope(linkId: string, owner: Client, scopeId: LinkScopeId): PartnerLink | null {
  const link = linkById(linkId);
  if (!link || link.status !== "Active") return null;
  if (owner.id !== link.inviterId && owner.id !== link.inviteeId) return null;

  const key = grantKey(owner.id, scopeId);
  const scope = scopeMap[scopeId];
  const other = counterpartOf(link, owner.id);

  const ledgerId = recordConsent({
    actor: { id: owner.id, name: fullName(owner) },
    subject: { id: owner.id, name: fullName(owner) },
    action: "update",
    entityId: `${link.id}:${scopeId}`,
    reason: scope.clinical
      ? `Member granted CLINICAL scope "${scope.label}" over their own record to ${other.name}`
      : `Member granted scope "${scope.label}" over their own record to ${other.name}`,
    before: { granted: link.grants[key]?.granted ?? false },
    after: { granted: true, scope: scopeId, clinical: scope.clinical, disclosedTo: other.name },
  });

  link.grants[key] = {
    scopeId,
    ownerId: owner.id,
    granted: true,
    grantedAt: NOW,
    ledgerId,
  };

  return link;
}

/**
 * Turn one scope back off.
 *
 * Takes effect on the return of this call — there is no pending state, no
 * grace period and no notification to the other party required first.
 */
export function revokeScope(linkId: string, owner: Client, scopeId: LinkScopeId): PartnerLink | null {
  const link = linkById(linkId);
  if (!link) return null;
  const key = grantKey(owner.id, scopeId);
  const existing = link.grants[key];
  if (!existing?.granted) return link;

  const other = counterpartOf(link, owner.id);
  const ledgerId = recordConsent({
    actor: { id: owner.id, name: fullName(owner) },
    subject: { id: owner.id, name: fullName(owner) },
    action: "update",
    entityId: `${link.id}:${scopeId}`,
    reason: `Member revoked scope "${scopeMap[scopeId].label}" from ${other.name}`,
    before: { granted: true },
    after: { granted: false, revokedAt: NOW },
  });

  link.grants[key] = { ...existing, granted: false, revokedAt: NOW, ledgerId };
  return link;
}

/**
 * End the link entirely.
 *
 * Unilateral by design. Either party, no reason required, no confirmation from
 * the other side, every grant in both directions off in the same operation.
 * The `reason` parameter exists and is deliberately optional — requiring
 * someone to type why they are cutting off their partner is a barrier placed
 * exactly where it does the most harm.
 */
export function revokeLink(linkId: string, by: Client, reason?: string): PartnerLink | null {
  const link = linkById(linkId);
  if (!link) return null;

  const stillOn = Object.values(link.grants).filter((g) => g.granted);
  for (const g of stillOn) {
    link.grants[grantKey(g.ownerId, g.scopeId)] = { ...g, granted: false, revokedAt: NOW };
  }

  link.status = "Revoked";
  link.closedAt = NOW;
  link.closedBy = by.id;

  recordConsent({
    actor: { id: by.id, name: fullName(by) },
    subject: { id: by.id, name: fullName(by) },
    action: "update",
    entityId: link.id,
    reason: reason?.trim() || "Member ended the partner link",
    before: { status: "Active", activeGrants: stillOn.length },
    after: { status: "Revoked", activeGrants: 0, endedBy: fullName(by) },
  });

  return link;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Scopes `viewerId` can currently see of `ownerId`. Empty is the normal answer. */
export function visibleScopes(link: PartnerLink, ownerId: string, viewerId: string): LinkScope[] {
  if (link.status !== "Active") return [];
  const parties = [link.inviterId, link.inviteeId];
  if (!parties.includes(ownerId) || !parties.includes(viewerId) || ownerId === viewerId) return [];
  return LINK_SCOPES.filter((s) => link.grants[grantKey(ownerId, s.id)]?.granted);
}

/** What I have chosen to share. The sentence a member should be able to check in five seconds. */
export function sharedByMe(link: PartnerLink, myId: string): LinkScope[] {
  return LINK_SCOPES.filter((s) => link.grants[grantKey(myId, s.id)]?.granted);
}

export function isGranted(link: PartnerLink, ownerId: string, scopeId: LinkScopeId): boolean {
  return !!link.grants[grantKey(ownerId, scopeId)]?.granted;
}

/**
 * The plain-English state of the link, for the top of the card.
 *
 * Written to be readable by someone who is anxious about the answer, which is
 * the state of mind that matters most here.
 */
export function linkSummary(link: PartnerLink, myId: string): string {
  const other = counterpartOf(link, myId);
  if (link.status === "Invited") return `Invitation sent to ${link.inviteeEmail}. Nothing is shared until they accept — and nothing is shared even then.`;
  if (link.status === "Declined") return `${other.name} declined. Nothing was shared.`;
  if (link.status === "Expired") return "That invitation expired. Send a new one if you still want to link.";
  if (link.status === "Revoked") return `This link has ended. ${other.name} can no longer see anything of yours.`;

  const mine = sharedByMe(link, myId);
  const theirs = other.id ? visibleScopes(link, other.id, myId) : [];
  const minePart = mine.length
    ? `You're sharing ${mine.length} thing${mine.length === 1 ? "" : "s"} with ${other.name}.`
    : `You're sharing nothing with ${other.name} yet.`;
  const theirPart = theirs.length
    ? ` They're sharing ${theirs.length} with you.`
    : ` They're sharing nothing with you.`;
  return minePart + theirPart;
}
