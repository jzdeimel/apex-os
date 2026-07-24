import type { Goal, Symptom } from "@/lib/types";
import type { ConsentDefinition, ConsentKind } from "@/lib/intake/types";
import { sha256 } from "@/lib/trace/hash";

/**
 * Versioned content rendered by the authoritative intake workflow.
 *
 * These definitions are intentionally outside lib/mock: the public intake API
 * stores each version and text digest with the patient's decision. Editing
 * wording requires a new version so an old signature always resolves to the
 * exact text that was shown.
 */
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
  Object.fromEntries(CONSENT_DEFINITIONS.map((consent) => [consent.kind, consent])) as Record<
    ConsentKind,
    ConsentDefinition
  >;

/** Pins the exact rendered text to the durable consent row. */
export function consentTextHash(kind: ConsentKind): string {
  const definition = consentByKind[kind];
  return sha256(
    `${definition.kind}|${definition.version}|${definition.body}`,
  );
}

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
