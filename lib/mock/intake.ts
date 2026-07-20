// =============================================================================
// Apex — intake mock data
// =============================================================================
//
// Consent text and a deterministic set of live intake invitations.
//
// The consent copy below is demo copy. It is written the way real consent copy
// should be written — short, second person, no defined terms in capital letters —
// but it has not been through counsel and says so on the page.

import type {
  ConsentDefinition,
  ConsentKind,
  ConsentRecord,
  IntakeInvite,
  IntakeStatus,
  CareTrackKey,
} from "@/lib/intake/types";
import type { Goal, Symptom, LocationId } from "@/lib/types";
import { makeIntakeToken } from "@/lib/intake/tokens";
import { sha256 } from "@/lib/trace/hash";
import { clients } from "@/lib/mock/clients";
import { seededRandom, absolute } from "@/lib/utils";

/** Pinned demo clock. Nothing in this file may read the wall clock. */
export const NOW = "2026-06-12T09:00:00";

// ---------------------------------------------------------------------------
// Consents — four items, four checkboxes, four records
// ---------------------------------------------------------------------------

export const CONSENT_DEFINITIONS: ConsentDefinition[] = [
  {
    kind: "treatment",
    title: "Consent to evaluation and treatment",
    regime: "Clinical — state medical practice acts",
    required: true,
    version: "2026.1",
    body:
      "You're agreeing to let an Alpha Health clinician evaluate you, order labs, " +
      "and — if it's appropriate for you — recommend treatment. Nothing is prescribed " +
      "without a licensed provider reviewing your results and talking it through with " +
      "you first. You can stop at any point, and you can decline any individual " +
      "recommendation without leaving the program.",
  },
  {
    kind: "telehealth",
    title: "Consent to telehealth visits",
    regime: "Clinical — state telehealth and licensure rules",
    required: true,
    version: "2026.1",
    body:
      "Some of your visits may happen by video or phone. Telehealth has real limits — " +
      "your clinician can't examine you physically, and technology can fail mid-visit. " +
      "Your clinician must be licensed in the state you're physically located in when " +
      "the visit happens, so we'll ask where you are each time. If a visit needs to be " +
      "in person, we'll tell you and we won't charge you for the attempt.",
  },
  {
    kind: "hipaaNotice",
    title: "Notice of Privacy Practices",
    regime: "HIPAA — acknowledgement of receipt, not consent",
    required: true,
    version: "2026.1",
    body:
      "You're confirming you've been given our Notice of Privacy Practices. This is an " +
      "acknowledgement, not permission — it doesn't grant us anything. It records that " +
      "you were told how your health information is used, who can see it, and how to " +
      "get a copy of everything we hold about you.",
  },
  {
    // The whole point of this file. Its own item, its own checkbox, its own record.
    kind: "marketing",
    title: "Marketing texts and emails",
    regime: "TCPA / CAN-SPAM — commercial contact, entirely separate from care",
    required: false,
    version: "2026.1",
    body:
      "Optional, and genuinely optional. This lets us send you promotions, event " +
      "invitations and automated marketing texts. Saying no here changes nothing about " +
      "your care — you'll still get appointment reminders, lab notifications and " +
      "messages from your coach, because those aren't marketing. You can turn this off " +
      "later without calling anyone.",
  },
];

export const consentByKind: Record<ConsentKind, ConsentDefinition> =
  Object.fromEntries(CONSENT_DEFINITIONS.map((c) => [c.kind, c])) as Record<
    ConsentKind,
    ConsentDefinition
  >;

/** Hash of the exact text shown. Pins the wording to the signature forever. */
export function consentTextHash(kind: ConsentKind): string {
  const def = consentByKind[kind];
  return sha256(`${def.kind}|${def.version}|${def.body}`);
}

/**
 * Build the record that WOULD be persisted for one consent decision.
 *
 * IP and user agent are fixed strings here. In production they come from the
 * request, and they matter: a TCPA defence is "here is the exact text, the exact
 * timestamp, and the exact device that ticked the box."
 */
export function makeConsentRecord(
  kind: ConsentKind,
  granted: boolean,
  at: string = NOW,
): ConsentRecord {
  const def = consentByKind[kind];
  return {
    kind,
    granted,
    decidedAt: at,
    textVersion: def.version,
    textSha256: consentTextHash(kind),
    ipAddress: "203.0.113.24", // TEST-NET-3, never routable — demo placeholder
    userAgentSummary: "Demo session — captured from the request in production",
  };
}

// ---------------------------------------------------------------------------
// Question banks — the wizard's options, sourced from the real unions
// ---------------------------------------------------------------------------
//
// Each option gets member-facing phrasing. "Cognition" is what the chart calls
// it; "I can't think clearly" is what the person filling in the form calls it.
// The stored value is always the union member, so intake answers drop straight
// into `Client.goals` and `Client.symptoms` with no translation layer.

export const GOAL_OPTIONS: { value: Goal; plain: string }[] = [
  { value: "Fat loss", plain: "Lose fat and keep it off" },
  { value: "Muscle gain", plain: "Build strength and muscle" },
  { value: "Energy", plain: "Have energy through the whole day" },
  { value: "Libido", plain: "Improve libido and sexual health" },
  { value: "Sleep", plain: "Sleep better and wake up rested" },
  { value: "Recovery", plain: "Recover faster from training" },
  { value: "Cognition", plain: "Think more clearly, less brain fog" },
  { value: "Joint pain", plain: "Move without joint pain" },
  { value: "Skin/hair", plain: "Skin and hair health" },
];

export const SYMPTOM_OPTIONS: { value: Symptom; plain: string }[] = [
  { value: "Low energy", plain: "Tired most of the day" },
  { value: "Poor sleep", plain: "Trouble falling or staying asleep" },
  { value: "Brain fog", plain: "Foggy, hard to concentrate" },
  { value: "Low libido", plain: "Lower sex drive than usual" },
  { value: "Weight gain", plain: "Gaining weight without changing much" },
  { value: "Reduced strength", plain: "Losing strength in the gym" },
  { value: "Slow recovery", plain: "Sore for days after a workout" },
  { value: "Joint pain", plain: "Aching joints" },
  { value: "Mood changes", plain: "Mood swings, irritability, low mood" },
  { value: "Hair thinning", plain: "Hair thinning or shedding" },
  { value: "Cold intolerance", plain: "Always cold when others aren't" },
  { value: "Elevated stress", plain: "Stressed and wound up" },
];

// ---------------------------------------------------------------------------
// Live invitations
// ---------------------------------------------------------------------------
//
// Seeded from members already sitting at the front of the funnel, so the demo's
// intake queue and its client roster describe the same people.

const FUNNEL_STATUSES = new Set(["Lead", "Consult Booked"]);

const STATUS_CYCLE: IntakeStatus[] = [
  "Sent",
  "Opened",
  "In progress",
  "Submitted",
  "Sent",
  "Expired",
];

function trackFor(sex: "male" | "female"): CareTrackKey {
  return sex === "female" ? "female" : "male";
}

const seeds = clients.filter((c) => FUNNEL_STATUSES.has(c.status)).slice(0, 14);

export const intakeInvites: IntakeInvite[] = seeds.map((c, i) => {
  const rand = seededRandom(`apex-intake-invite::${c.id}`);
  // Walk backwards from NOW in irregular steps so the queue does not read as a
  // metronome. Expired rows are minted far enough back that TTL has genuinely
  // elapsed rather than being asserted by the status field.
  const status = STATUS_CYCLE[i % STATUS_CYCLE.length];
  const hoursBack = status === "Expired" ? 96 + rand() * 200 : 1 + rand() * 60;
  const createdAt = absolute(absolute(NOW).getTime() - hoursBack * 3_600_000,
  ).toISOString();

  const t = makeIntakeToken(c.id, createdAt);

  return {
    id: `inv-${String(i + 1).padStart(3, "0")}`,
    bookingId: `bk-${String(i + 1).padStart(3, "0")}`,
    token: t.token,
    tokenSha256: t.tokenSha256,
    shortCode: t.shortCode,
    status,
    createdAt: t.createdAt,
    expiresAt: t.expiresAt,
    ...(status === "Submitted"
      ? {
          usedAt: absolute(absolute(createdAt).getTime() + 40 * 60_000,
          ).toISOString(),
        }
      : {}),
    prefill: {
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      locationId: c.locationId as LocationId,
      track: trackFor(c.sex),
    },
  };
});

export function inviteByToken(token: string): IntakeInvite | undefined {
  return intakeInvites.find((i) => i.token === token);
}

/**
 * Short-code lookup.
 *
 * In production this call is rate limited, and it additionally requires the
 * email or phone on the booking — the code alone is never enough. Neither guard
 * exists here because nothing here is reachable by an attacker; both are
 * mandatory in the real implementation. See lib/intake/tokens.ts.
 */
export function inviteByShortCode(code: string): IntakeInvite | undefined {
  const norm = code.trim().toUpperCase();
  return intakeInvites.find((i) => i.shortCode === norm);
}

/** The link the demo hands out — always a live, unexpired, unused invite. */
export const DEMO_INVITE: IntakeInvite =
  intakeInvites.find((i) => i.status === "Sent" && !i.usedAt) ?? intakeInvites[0];
