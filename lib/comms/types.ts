/**
 * Apex comms domain — every touch a clinic has with a member, and the consent
 * that made it legal.
 *
 * ---------------------------------------------------------------------------
 * WHY CONSENT IS SCOPED, AND WHY THE SCOPES ARE NOT INTERCHANGEABLE
 * ---------------------------------------------------------------------------
 * The system we are replacing stores one boolean per member — roughly
 * "can we text them?" — and every outbound message consults it. That single
 * flag silently merges three different legal regimes:
 *
 *  1. `clinical`    — PHI may be discussed. Governed by HIPAA. Consent here is
 *                     about the member accepting an unencrypted channel for
 *                     protected health information (lab results, dosing,
 *                     symptoms). It is documented, versioned, and tied to a
 *                     source document the member actually signed.
 *  2. `operational` — appointment reminders, order/shipment status, billing
 *                     logistics. Treatment/payment/operations. Contains no
 *                     clinical detail, and a member who revokes marketing
 *                     consent still expects to hear that their peptides
 *                     shipped.
 *  3. `marketing`   — promotional. Governed by the TCPA (and CAN-SPAM on
 *                     email), which requires *prior express written consent*
 *                     for automated promotional SMS and carries statutory
 *                     damages per message. This is the expensive one.
 *
 * Collapsing these into one flag produces the two failure modes we have
 * actually observed in the live system:
 *   - a member who opted out of marketing stops receiving shipment notices,
 *     so a coach has to phone them, so the coach stops trusting the system; and
 *   - a member who consented only to appointment reminders receives a
 *     promotional blast, which is a per-message TCPA exposure.
 *
 * ---------------------------------------------------------------------------
 * WHY A REVOKED GRANT MUST *STRUCTURALLY* BLOCK THE SEND
 * ---------------------------------------------------------------------------
 * Consent that is "checked by convention" is consent that is eventually not
 * checked. In the audited system the opt-out check lives in the UI layer of the
 * campaign screen; the two other code paths that can send SMS (the reminder job
 * and the coach quick-text) never call it, because nothing forces them to.
 *
 * In Apex there is exactly one way to emit a message — `sendMessage` in
 * `lib/comms/send.ts` — and it takes the `ConsentScope` as a *required*
 * argument. There is no overload without it, no `skipConsentCheck`, and the
 * provider adapters are not exported for direct use. A revoked or expired
 * grant makes `sendMessage` throw a typed `ConsentError` before a provider is
 * ever constructed. Compliance is therefore a property of the type signature,
 * not of a reviewer remembering to ask.
 */

/** Delivery surfaces. "In person" and "Phone" are logged, never machine-sent. */
export type ContactChannel =
  | "SMS"
  | "Email"
  | "Phone"
  | "In person"
  | "Portal message";

/**
 * Who initiated. The audited system renders every row as an outbound coach
 * bubble regardless of direction, which makes a member's unanswered reply look
 * identical to a coach's follow-up. Direction is first-class here.
 */
export type ContactDirection = "outbound" | "inbound";

export type ContactOutcome =
  | "Connected"
  | "Left voicemail"
  | "No answer"
  | "Replied"
  | "Delivered"
  | "Bounced"
  | "Opted out";

export interface ContactEntry {
  id: string;
  clientId: string;
  /** Staff member who made the touch, or who owns the thread for inbound. */
  staffId: string;
  channel: ContactChannel;
  direction: ContactDirection;
  outcome: ContactOutcome;
  /** ISO timestamp. */
  at: string;
  /** The actual message text — not a summary. A log you can't read is a count. */
  body: string;
  /** Email only. */
  subject?: string;
  /** Groups a message and its replies into one conversation. */
  threadId?: string;
  /**
   * Ledger row this touch produced. Every contact is an event in the
   * hash-chained ledger; this is the join key back to it, so a member can be
   * shown "we texted you on the 4th" with a verifiable record behind it.
   */
  ledgerEventId: string;
  /** The scope the sender asserted — recorded, so an audit can re-derive legality. */
  consentScopeUsed: ConsentScope;
  /** Azure Communication Services message id, when a provider handled it. */
  deliveryId?: string;
}

/** See the module docblock — these are three legal regimes, not three labels. */
export type ConsentScope = "clinical" | "operational" | "marketing";

/** How the member expressed consent. Determines evidentiary weight. */
export type ConsentSource =
  | "Intake form"
  | "Portal preferences"
  | "Verbal — documented"
  | "Written addendum"
  | "SMS keyword (STOP/START)";

export interface ConsentGrant {
  id: string;
  clientId: string;
  scope: ConsentScope;
  /** Consent is per-channel: agreeing to clinical email is not agreeing to clinical SMS. */
  channel: ContactChannel;
  grantedAt: string;
  grantedVia: ConsentSource;
  /** Some scopes expire by policy; absent means no expiry. */
  expiresAt?: string;
  /** Set once, never unset. Revocation is additive, not a delete. */
  revokedAt?: string;
  /** Which version of the consent language the member actually saw. */
  version: string;
  /** Human-citable document reference for the record. */
  sourceDocument: string;
}

/** Per-scope rollup used by the consent panel in the client chart. */
export interface ConsentScopeStatus {
  scope: ConsentScope;
  /** True only if at least one channel is live right now. */
  active: boolean;
  channels: ContactChannel[];
  /** Channels with a grant that exists but is revoked or expired. */
  blockedChannels: ContactChannel[];
  grantedAt?: string;
  revokedAt?: string;
  expiresAt?: string;
  /** Rendered verbatim in the UI so the reason is never inferred. */
  reason: string;
}

export interface ConsentSummary {
  clientId: string;
  scopes: ConsentScopeStatus[];
  /** Convenience for list views: any marketing channel currently permitted. */
  marketingReachable: boolean;
}
