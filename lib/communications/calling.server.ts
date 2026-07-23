import { createHash } from "crypto";

/** Stable, opaque idempotency key for a single staff-to-patient call attempt. */
export function callContactId(requestId: string, actorId: string, clientId: string): string {
  const digest = createHash("sha256")
    .update(`apex-acs-call\0${actorId}\0${clientId}\0${requestId}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `call-${digest}`;
}
