// =============================================================================
// Apex — public intake funnel
// =============================================================================
//
// Everything a prospective member touches BEFORE they have an account.
//
// This is the only part of Apex that is reachable without authentication, which
// makes it the only part where the threat model is "anyone on the internet."
// Two consequences shape the types below:
//
//  1. The link IS the credential. There is no password on an intake form, so the
//     token in the URL is the entire authorisation story. See lib/intake/tokens.ts
//     for what that has to be worth in bits, and what the audited system got wrong.
//  2. Consent is not a boolean. The regimes are genuinely different — treatment
//     consent is clinical, telehealth consent is state-licensure, and marketing
//     contact is TCPA. Modelling them as one `agreedToTerms: boolean` is how
//     clinics end up unable to prove which one a member actually gave.
//
// Demo-shaped, not live: nothing here submits anywhere. See IntakeWizard.

import type { Goal, Symptom, LocationId } from "@/lib/types";

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

/**
 * The three consents Alpha Health needs, kept deliberately separate.
 *
 * `marketing` is its own item with its own checkbox and its own record. Bundling
 * marketing consent into a treatment consent is the single most common intake
 * defect in this industry: TCPA requires *prior express written consent* for
 * automated marketing calls and texts, and a court reads a bundled checkbox as
 * consent to nothing. Separating them also means a member can revoke marketing
 * without revoking care — which is the behaviour a person actually wants.
 *
 * `hipaaNotice` is an acknowledgement, not a consent (you cannot decline to be
 * told your privacy rights), so it is required and the UI says so plainly.
 */
export type ConsentKind =
  | "treatment"
  | "telehealth"
  | "hipaaNotice"
  | "marketing";

export interface ConsentDefinition {
  kind: ConsentKind;
  title: string;
  /** Plain-language body. Written at a reading level a person under stress can parse. */
  body: string;
  /** The legal regime this consent lives under — surfaced in the UI, not decorative. */
  regime: string;
  /** Required consents block submission. `marketing` never is. */
  required: boolean;
  /** Version string of the consent text. A signature is meaningless without it. */
  version: string;
}

/**
 * A single, individually-recorded consent decision.
 *
 * `textVersion` and `textSha256` are on the record rather than looked up later,
 * because "what exactly did they agree to" must survive the marketing team
 * rewriting the consent copy two years from now.
 */
export interface ConsentRecord {
  kind: ConsentKind;
  granted: boolean;
  /** ISO datetime. Absent when never answered. */
  decidedAt?: string;
  textVersion: string;
  textSha256: string;
  /** Captured in production; a fixed demo string here. */
  ipAddress: string;
  userAgentSummary: string;
}

// ---------------------------------------------------------------------------
// Booking — step 0, before an intake link even exists
// ---------------------------------------------------------------------------

/** Men's vs women's track. Mirrors the keys of CARE_TRACKS in lib/brand.ts. */
export type CareTrackKey = "male" | "female";

export interface BookingRequest {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  locationId: LocationId;
  track: CareTrackKey;
  /** Free-text "what's going on" — the single most useful field on the form. */
  reason?: string;
  submittedAt: string;
  /** The intake link minted for this booking. */
  intakeToken: string;
  intakeShortCode: string;
}

// ---------------------------------------------------------------------------
// Intake
// ---------------------------------------------------------------------------

export type IntakeStepId =
  | "you"
  | "goals"
  | "symptoms"
  | "history"
  | "consents"
  | "review";

export interface IntakeMedication {
  name: string;
  dose: string;
}

export interface IntakeHistory {
  /** Free text — deliberately not a coded problem list. A prospect is not a chart. */
  conditions: string;
  medications: IntakeMedication[];
  allergies: string;
  /**
   * Questions with real clinical consequence for TRT/HRT candidacy. Asked here
   * so the provider is not discovering them live on the consult call.
   */
  usesTobacco: boolean;
  priorHormoneTherapy: boolean;
  familyCardiacHistory: boolean;
  /** Female track only; hidden on the male track rather than asked and ignored. */
  pregnantOrTrying?: boolean;
}

export interface IntakeAnswers {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  sex: "male" | "female";
  locationId: LocationId;
  goals: Goal[];
  symptoms: Symptom[];
  history: IntakeHistory;
  consents: ConsentRecord[];
}

export type IntakeStatus = "Sent" | "Opened" | "In progress" | "Submitted" | "Expired";

/**
 * The server-side record of an intake invitation.
 *
 * Note what is NOT stored: the raw token. In production this holds only
 * `tokenSha256`, so a database dump does not hand the attacker working links —
 * the same reason you never store a session token in plaintext. The demo carries
 * `token` too, purely so the UI can render a copyable link.
 */
export interface IntakeInvite {
  id: string;
  bookingId: string;
  /** DEMO ONLY. A real deployment stores tokenSha256 and nothing else. */
  token: string;
  tokenSha256: string;
  shortCode: string;
  status: IntakeStatus;
  createdAt: string;
  expiresAt: string;
  /** Set the moment the intake is submitted. A used link is a dead link. */
  usedAt?: string;
  prefill: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    locationId: LocationId;
    track: CareTrackKey;
  };
}
