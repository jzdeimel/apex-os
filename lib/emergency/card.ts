import { IS_DEMO } from "@/lib/config";
import type { Client, RiskFlag, StaffMember, Location } from "@/lib/types";
import { clients, getClient } from "@/lib/mock/clients";
import { staffMap } from "@/lib/mock/staff";
import { locationMap } from "@/lib/mock/locations";
import { subscriptionsForClient } from "@/lib/mock/subscriptions";
import { catalogItem } from "@/lib/catalog/catalog";
import { addDays, dayOf, daysBetween } from "@/lib/subscriptions/engine";
import { seededRandom } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

/**
 * THE EMERGENCY CARD.
 *
 * One screen, held up to a triage nurse at 2am. The member is on a compounded
 * peptide and a Schedule III hormone; the ER has no idea, the member is not in
 * a state to explain it, and the clinic is closed. This card exists for that
 * ninety seconds.
 *
 * ── THREE RULES, ALL OF THEM SAFETY RULES ─────────────────────────────────
 *
 * 1. **NAME AND ROUTE ONLY. NEVER AN AMOUNT.**
 *    A dose printed here is a dose frozen at the moment the card was made. The
 *    provider titrates, the card does not, and a clinician acting on a stale
 *    number is worse off than one acting on none. `PrescribedLine` has no dose
 *    field to populate — the same structural absence the plan-of-care model
 *    uses. You cannot forget to omit what does not exist.
 *
 * 2. **NEVER ASSERT ABSENCE AS CLEARANCE.**
 *    Apex holds no allergy record for its members. The card says exactly that,
 *    in those words, rather than printing a reassuring "No known allergies" —
 *    which is a clinical claim we have no basis for and which a tired reader
 *    will act on. "We have nothing on file, ask the patient" is honest and
 *    useful. "None" is neither.
 *
 * 3. **STALENESS IS LOUD.**
 *    A card made four months ago is a different object from one made this
 *    morning and it must not look the same. `staleness` drives a banner, not a
 *    footnote.
 *
 * The page is public and unauthenticated — the token in the URL is the whole
 * access decision, which is why the card carries the minimum a triage nurse
 * needs and not a chart.
 */

const NOW = "2026-06-12T09:00:00";

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/**
 * Deterministic per-member token.
 *
 * Long enough not to be guessable by hand, derived from a seeded generator so
 * the demo URL is stable forever. In production this is a random 128-bit value
 * stored against the member with an owner-revocable lifetime — the derivation
 * below is a demo convenience and nothing about the page depends on the token
 * being derivable.
 */
const TOKEN_CHARS = "abcdefghijkmnpqrstuvwxyz23456789";
const TOKEN_LENGTH = 22;

/**
 * DEMO ONLY. Throws in production.
 *
 * This derives the card token from `seededRandom("emergency-card:" + clientId)`
 * over SEQUENTIAL client ids (c-001, c-002 …), so anyone who noticed the scheme
 * could generate every member's card and read their name, MRN, medications,
 * allergies, risk flags and care team. That is bulk PHI disclosure from a
 * predictable string, and the page it opens is designed to be public.
 *
 * The real path is repo.issueEmergencyCard: crypto-random, stored as a SHA-256
 * only, with an expiry and revocation. This survives solely so the seeded demo
 * corpus has stable URLs, and it refuses to run when demo mode is off — a
 * derivable emergency card must not be reachable in a build serving real people.
 */
export function emergencyTokenFor(clientId: string): string {
  if (!IS_DEMO) {
    throw new Error(
      "emergencyTokenFor is demo-only — issue a card via repo.issueEmergencyCard instead.",
    );
  }
  const rand = seededRandom(`emergency-card:${clientId}`);
  let out = "";
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    out += TOKEN_CHARS[Math.floor(rand() * TOKEN_CHARS.length)];
  }
  return out;
}

/**
 * Reverse lookup, built once on first use.
 *
 * Deliberately a full-table scan built lazily rather than a token parsed back
 * into an id: a token that DECODES to a member id is a token an attacker can
 * forge from a member id. Lookup-only is the shape that survives the token
 * generator being replaced with real randomness.
 */
let TOKEN_INDEX: Record<string, string> | null = null;

export function clientIdForToken(token: string): string | undefined {
  // DEMO ONLY, and it fails CLOSED. The index is built by deriving every
  // member's token from their sequential client id, so in a build serving real
  // people this lookup would itself be the enumeration vector it is meant to
  // resist. Production resolves a card through repo.readEmergencyCard, which
  // matches a stored SHA-256 and honours expiry and revocation.
  if (!IS_DEMO) return undefined;
  if (!TOKEN_INDEX) {
    TOKEN_INDEX = Object.fromEntries(clients.map((c) => [emergencyTokenFor(c.id), c.id]));
  }
  return TOKEN_INDEX[token];
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

/** What the member is on. Name and route. There is no third field. */
export interface PrescribedLine {
  name: string;
  /**
   * "Injection" or "Oral", derived from the product's dispensed form.
   *
   * Undefined when the form does not tell us — and the page renders that as
   * "route not recorded" rather than guessing. Deliberately NOT "SC" vs "IM":
   * which layer a given injection goes into is a prescription detail, and
   * narrowing it here would be inventing one.
   */
  route?: string;
}

export type Staleness = "current" | "aging" | "stale";

export interface EmergencyCareTeam {
  provider?: StaffMember;
  coach?: StaffMember;
  location?: Location;
  /** The number to call. Falls back to the telehealth line, which is staffed. */
  phone: string;
}

export interface EmergencyCard {
  clientId: string;
  token: string;
  name: string;
  /**
   * Apex stores age, not a date of birth — so the card prints age and the
   * Apex-issued MRN and does not invent a DOB for a form field. A fabricated
   * date of birth on a document handed to a hospital is a genuinely dangerous
   * thing to produce.
   */
  age: number;
  sex: Client["sex"];
  mrn: string;
  prescribed: PrescribedLine[];
  /**
   * Always empty, and that is the honest state: Apex holds no allergy field.
   * The type is here so that when intake starts capturing allergies the card
   * picks them up without a redesign.
   */
  allergies: string[];
  /** True only once an allergy history has actually been recorded. */
  allergiesRecorded: boolean;
  riskFlags: RiskFlag[];
  careTeam: EmergencyCareTeam;
  /** Date the member last confirmed this card. What staleness is measured on. */
  generatedOn: string;
  /** Most recent date any of the underlying record changed. */
  sourcedOn: string;
  daysOld: number;
  staleness: Staleness;
  /** The staleness sentence, ready to render. */
  stalenessNote: string;
}

/** Older than this and the card gets a warning banner. */
const AGING_AFTER_DAYS = 30;
/** Older than this and the banner is a red one. */
const STALE_AFTER_DAYS = 90;

/**
 * When the member last confirmed the card.
 *
 * Separate from the underlying record on purpose: the clinic's data can be
 * current while the card in the member's wallet is months out of date, and it
 * is the CARD's age that decides how much a stranger should trust it.
 *
 * `c-001` is pinned old on purpose, exactly as `HERO_SUBS` pins a payment hold
 * — the demo member is the one anybody actually opens, and a staleness warning
 * that never fires is a staleness warning nobody knows exists.
 */
function confirmedOn(clientId: string, nowIso: string): string {
  if (clientId === "c-001") return addDays(dayOf(nowIso), -132);
  const rand = seededRandom(`emergency-confirmed:${clientId}`);
  return addDays(dayOf(nowIso), -(4 + Math.floor(rand() * 150)));
}

function stalenessFor(daysOld: number): Staleness {
  if (daysOld > STALE_AFTER_DAYS) return "stale";
  if (daysOld > AGING_AFTER_DAYS) return "aging";
  return "current";
}

function stalenessNoteFor(daysOld: number, staleness: Staleness): string {
  const months = Math.round(daysOld / 30);
  if (staleness === "stale") {
    return `This card is ${daysOld} days old — about ${months} months. The treatment on it may have changed more than once since. Call the clinic before you rely on any of it.`;
  }
  if (staleness === "aging") {
    return `This card is ${daysOld} days old. Treat it as a starting point and confirm it with the clinic.`;
  }
  return `Confirmed ${daysOld === 0 ? "today" : daysOld === 1 ? "yesterday" : `${daysOld} days ago`}.`;
}

/**
 * Strip strength from a product name.
 *
 * The catalog's names carry a concentration ("Testosterone cypionate
 * 200mg/mL") because that is what is printed on the vial. On this card it would
 * read as a dose to a tired clinician at 2am, and the whole safety argument of
 * the card is that it carries no amount. So the strength comes off and the
 * generic name stays.
 *
 * The pattern requires a UNIT after the number, so product names that legitimately
 * contain digits — BPC-157, CJC-1295, PT-141 — survive intact.
 */
const STRENGTH_RE = /\s*\b[\d.,]+\s*(?:mg|mcg|g|iu|ml)\b(?:\s*\/\s*(?:[\d.,]+\s*)?(?:ml|mg|mcg))?/gi;
const PARENTHETICAL_RE = /\s*\([^)]*\)/g;

export function nameWithoutStrength(name: string): string {
  return name
    .replace(STRENGTH_RE, "")
    .replace(PARENTHETICAL_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Route from the dispensed form, not from the name.
 *
 * A name-matching heuristic gets Anastrozole wrong — it reads like everything
 * else on a peptide clinic's shelf and it is a tablet. Pack format is a fact
 * the catalog actually holds: a vial is injected, a count of units is
 * swallowed. Anything else returns undefined and the card says so.
 */
function routeFromPack(packSize?: string): string | undefined {
  if (!packSize) return undefined;
  if (/vial|\bml\b|syringe|pen/i.test(packSize)) return "Injection";
  if (/\d+\s*ct\b/i.test(packSize)) return "Oral";
  return undefined;
}

/**
 * What the member is actually receiving.
 *
 * Sourced from ACTIVE SUBSCRIPTIONS, not from the plan of care — and that
 * distinction is the whole point. A plan can sit in "Awaiting provider" for
 * days, holding items nobody has signed for; printing those on a card handed to
 * a hospital would present a proposal as a prescription. A live subscription is
 * a product Alpha Health is dispensing to this person on a schedule, which is
 * the question a triage nurse is actually asking.
 *
 * Supplies, lab panels and in-clinic services are excluded: needles and a body
 * scan are not something an ER needs, and padding the list makes the two lines
 * that matter harder to find.
 */
function prescribedFor(client: Client): PrescribedLine[] {
  const seen = new Set<string>();
  const out: PrescribedLine[] = [];

  for (const sub of subscriptionsForClient(client.id)) {
    if (sub.status !== "Active") continue;
    const item = catalogItem(sub.sku);
    if (!item) continue;
    if (item.kind !== "compound" && item.kind !== "medication") continue;

    const name = nameWithoutStrength(item.name);
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, route: routeFromPack(item.packSize) });
  }

  return out;
}

/**
 * The most recent date anything behind the card actually moved. Used to say
 * "your clinic record is newer than this card" when that is true, which is the
 * specific nudge that gets a member to refresh it.
 */
function sourcedOnFor(client: Client, nowIso: string): string {
  const candidates = [client.joinedOn, client.latestLabDate].filter(Boolean) as string[];
  const today = dayOf(nowIso);
  return candidates.reduce((latest, d) => (d > latest ? d : latest), candidates[0] ?? today);
}

export function buildEmergencyCard(clientId: string, nowIso: string = NOW): EmergencyCard | null {
  const client = getClient(clientId);
  if (!client) return null;

  const generatedOn = confirmedOn(clientId, nowIso);
  const daysOld = daysBetween(generatedOn, dayOf(nowIso));
  const staleness = stalenessFor(daysOld);
  const location = locationMap[client.locationId];

  return {
    clientId,
    token: IS_DEMO ? emergencyTokenFor(clientId) : "",
    name: `${client.firstName} ${client.lastName}`,
    age: client.age,
    sex: client.sex,
    mrn: client.mrn,
    prescribed: prescribedFor(client),
    allergies: [],
    allergiesRecorded: false,
    riskFlags: client.riskFlags,
    careTeam: {
      provider: staffMap[client.providerId],
      coach: staffMap[client.coachId],
      location,
      phone: location?.phone ?? BRAND.telehealthPhone,
    },
    generatedOn,
    sourcedOn: sourcedOnFor(client, nowIso),
    daysOld,
    staleness,
    stalenessNote: stalenessNoteFor(daysOld, staleness),
  };
}

/**
 * Resolve a card from a token — the SEEDED path.
 *
 * Returns null outside demo mode, so an unresolvable token renders the same
 * "not a valid card" page rather than exposing anybody. The durable path
 * (repo.readEmergencyCard) additionally records the disclosure, which this
 * cannot do because it is synchronous and has no database.
 */
export function cardForToken(token: string, nowIso: string = NOW): EmergencyCard | null {
  const clientId = clientIdForToken(token);
  return clientId ? buildEmergencyCard(clientId, nowIso) : null;
}

/**
 * The disclaimer, in one place.
 *
 * Verbatim on the card and deliberately blunt. A hedge nobody reads is worse
 * than no hedge, because it creates the appearance of a warning while doing
 * none of the work.
 */
export const CARD_DISCLAIMER =
  "This is a summary the member carries, not a medical record. It does not list amounts, and it may be out of date. Call the clinic to confirm anything on it before you act on it.";
