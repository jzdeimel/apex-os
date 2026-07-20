// =============================================================================
// Apex — intake link tokens
// =============================================================================
//
// An intake link is a bearer credential. There is no password behind it, no
// second factor, and the person holding it has not authenticated in any sense —
// so the token in the URL is, on its own, the entire access-control decision for
// a form that will hold a stranger's date of birth, medications and symptoms.
//
// WHAT THE AUDITED SYSTEM GOT WRONG, stated plainly so it does not get rebuilt:
//
//   The system Apex replaces let a member resume intake with a SHORT CODE — an
//   8-character code over a 32-character alphabet. That is 32^8 ≈ 1.1 × 10^12,
//   roughly 40 bits. Forty bits sounds like a lot and is not: the lookup
//   endpoint had NO RATE LIMITING, NO LOCKOUT and NO EXPIRY, so an attacker
//   could enumerate codes at whatever rate the server would answer, forever,
//   against a code space that never shrank because codes stayed valid after use.
//   At a modest 1,000 requests/second a single machine covers 1% of that space
//   in about four months — and the attacker does not need a *specific* patient,
//   only *any* patient, which is the birthday-problem version of the same math
//   and is dramatically cheaper once thousands of codes are live at once.
//
// WHAT A REAL IMPLEMENTATION NEEDS (none of it is wired here — this is a demo):
//
//   1. The long token, not the short code, is the credential. 256 bits from a
//      CSPRNG (`crypto.randomBytes(32)`), never a PRNG. The short code exists
//      only as a human fallback when the SMS link is mangled, and redeeming it
//      must additionally require the email or phone on the booking — so the code
//      alone is never sufficient.
//   2. Rate limiting on lookup: per-IP and per-code, with exponential backoff
//      and a hard lockout. Bounded guesses turn 40 bits from "months" into
//      "never."
//   3. Expiry. `expiresAt` is enforced server-side, short (72h here), and a
//      request for an expired token returns the same generic response as a
//      request for a nonexistent one — otherwise the error message itself is an
//      oracle that confirms which codes exist.
//   4. Single use. `usedAt` is set on submission and the link is dead after.
//   5. Store only the hash. The database holds `tokenSha256`; a dump does not
//      hand the attacker working links.
//
// DETERMINISM NOTE: this file uses `seededRandom`, which is emphatically NOT a
// CSPRNG. That is correct for a demo (the same seed must produce the same link
// on every render and every build) and catastrophic in production. The real
// implementation swaps the generator and nothing else.

import { seededRandom, absolute } from "@/lib/utils";
import { sha256 } from "@/lib/trace/hash";

/**
 * Crockford-style base32: no I, L, O or U. Ambiguous glyphs get read aloud over
 * the phone by a receptionist, and "U" is excluded so the alphabet cannot spell
 * anything unfortunate.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 52 chars over a 32-symbol alphabet = 260 bits. Real bits come from a CSPRNG. */
const TOKEN_LENGTH = 52;

/** 8 chars over 32 symbols = 40 bits. See the header — this is the WEAK one. */
const SHORT_CODE_LENGTH = 8;

/** Entropy of the short code, in bits. Rendered in the UI so the tradeoff is visible. */
export const SHORT_CODE_BITS = Math.round(
  Math.log2(Math.pow(ALPHABET.length, SHORT_CODE_LENGTH)),
);

/** Entropy of the long token, in bits. */
export const TOKEN_BITS = Math.round(
  Math.log2(ALPHABET.length) * TOKEN_LENGTH,
);

/** How long an intake link stays usable. Short on purpose. */
export const INTAKE_TTL_HOURS = 72;

export interface IntakeToken {
  /** The bearer credential. Goes in the URL, never in a log line. */
  token: string;
  /** What the server actually stores. */
  tokenSha256: string;
  /** Human-readable fallback, grouped for legibility: `K7M4-QP2R`. */
  shortCode: string;
  createdAt: string;
  expiresAt: string;
  /** Set on submission. Present here so callers model single-use from day one. */
  usedAt?: string;
}

function draw(rand: () => number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  }
  return out;
}

function addHours(iso: string, hours: number): string {
  return absolute(absolute(iso).getTime() + hours * 3_600_000).toISOString();
}

/**
 * Mint an intake token deterministically from a seed.
 *
 * The long token and the short code are drawn from the SAME stream, which is
 * fine here and would be fine in production too — what matters is that knowing
 * the short code tells you nothing about the token, and with a CSPRNG it does
 * not. With `seededRandom` it absolutely does, which is one more reason this
 * generator never ships.
 */
export function makeIntakeToken(
  seed: string,
  createdAt = "2026-06-12T09:00:00",
): IntakeToken {
  const rand = seededRandom(`apex-intake-token::${seed}`);
  const token = draw(rand, TOKEN_LENGTH);
  const raw = draw(rand, SHORT_CODE_LENGTH);
  return {
    token,
    tokenSha256: sha256(token),
    shortCode: `${raw.slice(0, 4)}-${raw.slice(4)}`,
    createdAt,
    expiresAt: addHours(createdAt, INTAKE_TTL_HOURS),
  };
}

/** The link a member would receive. Relative, so it works on any host. */
export function intakeLinkPath(token: string): string {
  return `/intake/${token}`;
}

export type TokenVerdict = "ok" | "expired" | "used" | "unknown";

/**
 * Validate a token against the clock.
 *
 * The caller must render ONE message for every non-"ok" verdict. The distinction
 * is for the audit log, not for the visitor — telling an anonymous request the
 * difference between "expired" and "unknown" confirms that the code exists,
 * which is precisely the oracle an enumeration attack needs.
 */
export function checkToken(
  candidate: { expiresAt: string; usedAt?: string } | undefined,
  nowIso: string,
): TokenVerdict {
  if (!candidate) return "unknown";
  if (candidate.usedAt) return "used";
  if (absolute(candidate.expiresAt).getTime() <= absolute(nowIso).getTime()) {
    return "expired";
  }
  return "ok";
}

/** The single generic response every failed lookup gets. */
export const GENERIC_TOKEN_FAILURE =
  "This link is no longer valid. Intake links expire after 72 hours and can only be used once — call us and we'll send a fresh one.";

/**
 * How long an unthrottled attacker needs to sweep 1% of the short-code space,
 * at a given request rate. Used to make the argument above concrete in the UI
 * rather than abstract.
 */
export function bruteForceDays(requestsPerSecond: number, fraction = 0.01): number {
  const space = Math.pow(ALPHABET.length, SHORT_CODE_LENGTH);
  return (space * fraction) / requestsPerSecond / 86_400;
}
