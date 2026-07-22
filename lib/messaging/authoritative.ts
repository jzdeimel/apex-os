import { createHash } from "node:crypto";

const URGENT_LANGUAGE = [
  /\bchest (?:pain|pressure|tightness)\b/i,
  /\b(?:can(?:not|'t)|unable to) breathe\b/i,
  /\bshortness of breath\b/i,
  /\bpassed out\b/i,
  /\bfaint(?:ed|ing)?\b/i,
  /\bsevere allergic\b/i,
  /\banaphyl/i,
  /\bsuicid/i,
  /\bkill myself\b/i,
  /\boverdose\b/i,
];

/**
 * Stable, opaque idempotency key for a message write.
 *
 * The browser owns `requestId`; the authenticated subject and direction are
 * added server-side. Replaying the same POST therefore returns the original
 * row instead of sending the same message twice, while a request id copied
 * from another account cannot collide with it.
 */
export function authoritativeMessageId(
  direction: "patient-to-coach" | "coach-to-patient",
  clientId: string,
  requestId: string,
  actorId = "patient",
) {
  const digest = createHash("sha256")
    .update(`apex-message-v1\0${direction}\0${clientId}\0${actorId}\0${requestId}`)
    .digest("hex");
  return `msg-${digest.slice(0, 40)}`;
}

export function containsUrgentLanguage(body: string) {
  return URGENT_LANGUAGE.some((pattern) => pattern.test(body));
}

export const URGENT_MESSAGE_NOTICE =
  "Messages are not monitored for emergencies. Call 911 or seek immediate care for urgent or life-threatening symptoms.";

