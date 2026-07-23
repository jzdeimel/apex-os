export const CALL_REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;

export type CallLifecycleEvent = "started" | "connected" | "ended" | "failed";

const CALL_EVENTS = new Set<CallLifecycleEvent>([
  "started",
  "connected",
  "ended",
  "failed",
]);

/**
 * Alpha currently operates in the North American numbering plan. Accept the
 * familiar ten-digit staff-facing format, but hand ACS only E.164.
 *
 * A number that cannot be normalized is refused. Guessing a country code is a
 * much worse failure mode than asking staff to correct the patient's chart.
 */
export function normalizeUsPhoneNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  const normalized =
    trimmed.startsWith("+") ? `+${digits}` :
    digits.length === 10 ? `+1${digits}` :
    digits.length === 11 && digits.startsWith("1") ? `+${digits}` :
    null;

  return normalized && /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

export function isCallLifecycleEvent(value: unknown): value is CallLifecycleEvent {
  return typeof value === "string" && CALL_EVENTS.has(value as CallLifecycleEvent);
}

export function callOutcome(event: CallLifecycleEvent): string {
  switch (event) {
    case "started":
      return "Dialing";
    case "connected":
      return "Connected";
    case "ended":
      return "Completed";
    case "failed":
      return "Failed";
  }
}

export function callNotes(input: {
  event: CallLifecycleEvent;
  callId?: string;
  durationSeconds?: number;
  reason?: string;
}): string {
  const parts = [`ACS outbound call ${callOutcome(input.event).toLowerCase()}.`];
  if (input.durationSeconds !== undefined) {
    parts.push(`Duration: ${Math.max(0, Math.round(input.durationSeconds))} seconds.`);
  }
  if (input.callId) parts.push(`ACS call reference: ${input.callId}.`);
  if (input.reason) parts.push(`Result: ${input.reason}.`);
  return parts.join(" ");
}
