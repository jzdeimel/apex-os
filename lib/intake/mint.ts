import { randomBytes } from "node:crypto";
import { INTAKE_TTL_HOURS } from "@/lib/intake/tokens";

/**
 * Server-only intake token minting.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM lib/intake/tokens.ts
 * --------------------------------------------------------
 * `tokens.ts` mints from `seededRandom` so the demo corpus is reproducible, and
 * says in its own header that shipping that generator would be catastrophic: a
 * seeded PRNG is predictable, so anyone who works out the seed can enumerate
 * every intake link in existence — each of which opens a form collecting
 * medical history. That module's instruction was to "swap the generator and
 * nothing else". This is that swap.
 *
 * Everything else is deliberately shared with tokens.ts — the same Crockford
 * alphabet, the same length, the same TTL, the same checkToken/GENERIC failure
 * — so the demo and the real path cannot drift apart in ways nobody notices.
 *
 * THE RAW TOKEN IS RETURNED ONCE AND NEVER STORED. Only its SHA-256 goes to the
 * database (schema.intakeInvite.tokenSha256). A token at rest in a table, or in
 * a request log, is a plaintext credential; a hash is not.
 */

/**
 * Crockford base32 minus look-alikes, matching lib/intake/tokens.ts. Kept in
 * sync deliberately: a prospect may have to read this over the phone.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TOKEN_LENGTH = 52;

/**
 * Rejection sampling, not modulo.
 *
 * 256 is not a multiple of 32... it is, actually — but the guard matters the
 * moment anybody edits ALPHABET to a length that does not divide 256, at which
 * point plain `byte % len` silently biases the low characters and quietly costs
 * entropy. Discarding out-of-range bytes keeps the distribution uniform for any
 * alphabet length, so this stays correct under edit.
 */
function randomChars(count: number): string {
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  let out = "";
  while (out.length < count) {
    for (const byte of randomBytes(count * 2)) {
      if (byte >= max) continue;
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === count) break;
    }
  }
  return out;
}

export interface MintedInvite {
  /** Return to the caller ONCE. Never persist, never log. */
  token: string;
  expiresAt: string;
}

export function mintIntakeToken(nowIso: string): MintedInvite {
  const expires = new Date(nowIso);
  expires.setHours(expires.getHours() + INTAKE_TTL_HOURS);
  return { token: randomChars(TOKEN_LENGTH), expiresAt: expires.toISOString() };
}

/**
 * Put the bearer credential in the browser fragment, never the request path or
 * query string. Fragments are not sent to Container Apps, reverse proxies, or
 * server access logs; /intake removes it from the address bar immediately and
 * presents it to the public API in a request header/body only.
 */
export function intakeEntryPath(token: string): string {
  return `/intake#token=${encodeURIComponent(token)}`;
}
