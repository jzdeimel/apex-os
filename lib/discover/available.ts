import type {
  Client,
  Membership,
  MembershipTier,
  RecommendationCategory,
} from "@/lib/types";
import type { CatalogItem, ServiceLine } from "@/lib/catalog/types";
import { getClient } from "@/lib/mock/clients";
import { catalogFor, byServiceLine, KIND_LABEL } from "@/lib/catalog/catalog";
import { membershipForClient, TIER_BENEFITS, TIER_PRICE, tierRank } from "@/lib/mock/memberships";
import { CARE_TRACKS } from "@/lib/brand";
import { buildPlanOfCare } from "@/lib/planOfCare/engine";
import { locationName } from "@/lib/mock/locations";

/**
 * "Everything available to you" — the read model behind /portal/explore.
 *
 * THE PROBLEM THIS SOLVES.
 * A member joins for one thing — testosterone, or a GLP-1 — and eighteen months
 * later still does not know the clinic draws a thyroid panel, runs body-comp
 * scans, or that the body-comp scan they have been paying for at the front desk
 * has been included in their tier since March. The information exists in three
 * places that never meet: the catalog, their plan, and their membership tier.
 * This module is the join.
 *
 * TWO RULES THIS FILE ENFORCES STRUCTURALLY, NOT BY REVIEW.
 *
 *  1. NOTHING IS INVENTED. Every string a member reads about an offering is
 *     derived from data that already exists — `CatalogItem.kind`, `packSize`,
 *     `fulfillment`, `requiresProviderApproval`, and the verbatim benefit lines
 *     in `TIER_BENEFITS`. There is no per-SKU marketing copy here and there must
 *     never be one, because the moment a human writes "great for recovery" next
 *     to a compounded peptide, Apex has made a clinical claim no clinician
 *     signed. `whatItIs()` below describes the FORM of a thing (a vial, a
 *     45-minute visit, a 48-marker panel) and stops.
 *
 *  2. AVAILABILITY IS LOCATION-TRUE. Everything comes through
 *     `catalogFor(client.locationId)`, so a telehealth member is never shown an
 *     in-clinic infusion they cannot physically receive. Surfacing something a
 *     member then gets told "no" about is worse than never surfacing it.
 *
 * ON TRACKS. `CARE_TRACKS` splits men's and women's health because the clinical
 * content genuinely differs. We LEAD with the member's track and we never HIDE
 * the other one — the clinic's own FAQ answers "Is Alpha Health only for men?"
 * with a no, and an app that renders only one track quietly answers yes.
 */

const NOW = "2026-06-12T09:00:00";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Why this offering is showing up for this member. Ordered by precedence — the
 * first one that applies wins, which is why "on your plan" outranks
 * "ask your provider" for an item the provider has already been asked about.
 */
export type OfferingStatus =
  | "on your plan"
  | "included in your membership"
  | "available to you"
  | "ask your provider";

export interface Offering {
  sku: string;
  name: string;
  /** "Compounded" | "Rx" | "Service" | "Lab" | "Package" | "Supply". */
  kindLabel: string;
  serviceLine: ServiceLine;
  /** What the thing IS. Never what it will do for them. See whatItIs(). */
  whatItIs: string;
  status: OfferingStatus;
  /**
   * List price in integer cents, or null when quoting a price would mislead —
   * an item already covered by the tier, or one whose real cost depends on a
   * provider's decision about whether it applies at all.
   */
  priceCents: number | null;
  /** One line of context under the price. Optional; absent means no caveat. */
  priceNote?: string;
  /** Set on "included in your membership" — the verbatim TIER_BENEFITS line. */
  includedBecause?: string;
  /** Set on "on your plan" — the plan item or program that put it there. */
  planBecause?: string;
  requiresProviderApproval: boolean;
  /** True when there is nothing to fulfill remotely — clinic visit required. */
  inClinicOnly: boolean;
}

export interface OfferingGroup {
  /** Stable key for React and for tab state. */
  key: string;
  /** The service line, which is also the heading. */
  line: ServiceLine;
  /** Which care track(s) the clinic files this under, for the topic line. */
  trackLabels: string[];
  /** True when this group belongs to the member's own track. */
  isYourTrack: boolean;
  /**
   * Set when the member's plan or an active program covers this AREA of care,
   * without naming any product in it. See the note in `availableFor` — this is
   * the weaker, true claim, and it exists so that the stronger one never has to
   * be stretched to cover a whole service line.
   */
  planContext?: string;
  offerings: Offering[];
}

export interface AvailableToYou {
  client: Client;
  locationLabel: string;
  /** The member's own track, from client.sex. */
  trackLabel: string;
  /** The clinic's published service list for that track. Topic framing only. */
  trackServices: readonly string[];
  /** The other track — surfaced, never hidden. */
  otherTrackLabel: string;
  otherTrackServices: readonly string[];
  membership?: Membership;
  /** Benefits of the member's tier plus every tier beneath it, de-duplicated. */
  benefits: string[];
  /** Protocol credit carried by the tier, integer cents. 0 for most tiers. */
  protocolCreditCents: number;
  /** Every group, member's-track groups first, then shared, then other track. */
  groups: OfferingGroup[];
  /** Flat convenience slices for the page's three-part narrative. */
  onYourPlan: Offering[];
  includedUnused: Offering[];
}

// ---------------------------------------------------------------------------
// Track ↔ service line
// ---------------------------------------------------------------------------

/**
 * Which catalog service lines the clinic files under each care track.
 *
 * Derived from CARE_TRACKS, which is derived from the clinic's own site. Note
 * that most lines appear in BOTH tracks — peptides, metabolic care and recovery
 * are not sex-specific, and pretending otherwise would be the app inventing a
 * clinical distinction the clinic does not make. The only asymmetry is Sexual
 * Health, which appears on the men's list and not the women's; it is still
 * rendered for every member, just lower down, for exactly the FAQ reason in the
 * header note.
 */
const TRACK_LINES: Record<Client["sex"], ServiceLine[]> = {
  male: [
    "Hormone Therapy",
    "Metabolic & Weight Loss",
    "Peptide Therapy",
    "Sexual Health",
    "Recovery & Performance",
  ],
  female: [
    "Hormone Therapy",
    "Metabolic & Weight Loss",
    "Peptide Therapy",
    "Recovery & Performance",
  ],
};

/** Lines that belong to neither track — everyone gets these. */
const SHARED_LINES: ServiceLine[] = ["Diagnostics", "Clinical Services", "Supplies"];

/**
 * A member's active programs carry a `RecommendationCategory`, not a service
 * line. This is the translation, and it is the only place it lives.
 */
const CATEGORY_LINE: Record<RecommendationCategory, ServiceLine> = {
  "Recovery / tissue support": "Recovery & Performance",
  "Metabolic / weight management": "Metabolic & Weight Loss",
  "Hormone optimization discussion": "Hormone Therapy",
  "Sleep / recovery support": "Recovery & Performance",
  "Libido / sexual wellness": "Sexual Health",
  "Skin / hair / aesthetics support": "Peptide Therapy",
  "Energy / mitochondrial support": "Recovery & Performance",
  "Inflammation / gut support": "Peptide Therapy",
  "Thyroid optimization discussion": "Diagnostics",
};

// ---------------------------------------------------------------------------
// Membership benefit → catalog
// ---------------------------------------------------------------------------

/**
 * Which SKU a tier benefit actually redeems against.
 *
 * Keyed by the VERBATIM benefit string from TIER_BENEFITS so the note a member
 * reads is the same sentence their tier promises — if someone edits the benefit
 * copy, this map stops matching and the item quietly falls back to its list
 * price rather than claiming an inclusion that no longer exists. Failing to
 * "included" is safe; falsely claiming it is not.
 *
 * The roll-up lines ("Everything in Monthly") map to nothing and are handled by
 * tier inheritance in `benefitsFor` instead.
 */
const BENEFIT_SKUS: Record<string, string[]> = {
  "Monthly provider check-in": ["SVC-CONSULT-FU"],
  "Quarterly lab panel": ["LAB-FOLLOWUP"],
  "Body composition scan each visit": ["SVC-INBODY"],
};

/**
 * Every benefit the member's tier grants, including inherited ones.
 *
 * TIER_BENEFITS says "Everything in Monthly" rather than repeating the list, so
 * a member on Elite who only reads their own tier's four bullets never learns
 * they have coach messaging. Walking down the tier ranks is what makes the
 * inherited benefits real rather than a phrase.
 */
export function benefitsFor(tier: MembershipTier): string[] {
  const rank = tierRank(tier);
  const tiers: MembershipTier[] = ["Single Visit", "Alpha Monthly", "Alpha Elite", "Alpha Concierge"];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tiers) {
    if (tierRank(t) > rank) break;
    // Single Visit's bullets describe the ABSENCE of a plan ("Pay per visit"),
    // so they are not inherited upward — they would read as a downgrade.
    if (t === "Single Visit" && tier !== "Single Visit") continue;
    for (const b of TIER_BENEFITS[t]) {
      if (/^Everything in /i.test(b)) continue;
      if (seen.has(b)) continue;
      seen.add(b);
      out.push(b);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Plain-language description
// ---------------------------------------------------------------------------

/**
 * What this item IS, in a member's words.
 *
 * Built from structural fields only — kind, pack size, fulfillment. Read the
 * output carefully: there is no verb here that describes an effect on a body.
 * That is deliberate and it is the single most important property of this file.
 * A description of a vial is a fact; a description of what the vial does is a
 * clinical claim, and clinical claims come from clinicians.
 */
function whatItIs(item: CatalogItem): string {
  const pack = item.packSize;
  switch (item.kind) {
    case "compound":
      return `A compounded preparation${pack ? `, ${pack}` : ""}, prepared by our pharmacy partner and shipped to you. Prescription only.`;
    case "medication":
      return `A prescription medication${pack ? `, ${pack}` : ""}, dispensed through our pharmacy partner.`;
    case "lab-panel":
      return `A blood panel${pack ? ` covering ${pack}` : ""}. Drawn at a clinic or a partner draw site, then reviewed with you.`;
    case "package":
      return `A bundle${pack ? ` — ${pack}` : ""} — purchased as one item rather than piece by piece.`;
    case "supply":
      return `${pack ?? "Supplies"}. Ordinary supplies, no prescription needed.`;
    case "service":
      return item.fulfillment === "in-clinic"
        ? `Performed at the clinic${pack ? `, ${pack}` : ""}.`
        : `An appointment with your care team${pack ? `, ${pack}` : ""}. Available in person or by telehealth.`;
    default:
      return item.name;
  }
}

// ---------------------------------------------------------------------------
// The main selector
// ---------------------------------------------------------------------------

/**
 * Everything this member could access, grouped, with an honest status on each.
 *
 * Pure and deterministic: same client id, same output, forever. No clock, no
 * randomness — the plan engine is hash-stamped for the same reason.
 */
export function availableFor(clientId: string): AvailableToYou | undefined {
  const client = getClient(clientId);
  if (!client) return undefined;

  const membership = membershipForClient(clientId);

  /**
   * Coverage requires an ACTIVE membership.
   *
   * Memberships can be Paused or Lapsed, and reading coverage off the tier
   * alone told a lapsed member that items were "covered by your current
   * membership — no additional charge". That is a false billing promise to
   * someone whose coverage has ended, which is worse than showing them nothing.
   */
  const covered = membership?.status === "Active";
  const benefits = covered && membership ? benefitsFor(membership.tier) : [];
  const protocolCreditCents = covered ? (membership?.protocolCreditCents ?? 0) : 0;

  // Which SKUs the tier actually covers, and under which benefit sentence.
  const includedSku = new Map<string, string>();
  for (const b of benefits) {
    for (const sku of BENEFIT_SKUS[b] ?? []) includedSku.set(sku, b);
  }

  // ---------------------------------------------------------------------
  // What the plan and their active programs already put them on.
  //
  // TWO DIFFERENT STRENGTHS OF CLAIM, and conflating them would be the worst
  // bug on this screen:
  //
  //   ITEM-LEVEL ("on your plan") is only asserted when a plan modality or
  //   program NAME actually matches the product name. A member's plan names a
  //   modality, never a SKU — no dose or product identity lives in the plan, by
  //   design (planOfCare/types.ts). So matching by SERVICE LINE would stamp
  //   "on your plan" onto every GLP-1 in the catalog because the member is on
  //   one of them, telling a member on semaglutide that retatrutide is part of
  //   their care. That is a fabricated clinical fact.
  //
  //   GROUP-LEVEL (`planContext`) is the weaker, true statement: this is the
  //   area of care your program covers. It carries the useful signal without
  //   attaching it to a product nobody prescribed.
  // ---------------------------------------------------------------------
  const plan = buildPlanOfCare(client);
  const planContextByLine = new Map<ServiceLine, string>();
  /** normalized product/modality name → why it is on their plan. */
  const planNames: Array<{ needle: string; because: string }> = [];

  for (const p of client.programs) {
    if (p.status !== "Active") continue;
    const line = CATEGORY_LINE[p.category];
    if (line && !planContextByLine.has(line)) {
      planContextByLine.set(line, `This is the area your ${p.name} program covers.`);
    }
    planNames.push({ needle: normalize(p.name), because: `Part of your ${p.name} program.` });
  }

  for (const item of plan.protocol) {
    if (item.category) {
      const line = CATEGORY_LINE[item.category];
      if (line && !planContextByLine.has(line)) {
        planContextByLine.set(
          line,
          "Your plan of care proposes something in this area, pending your provider.",
        );
      }
    }
    if (item.modality) {
      planNames.push({
        needle: normalize(item.modality),
        because:
          "Proposed on your plan of care. Your provider confirms whether it's right for you and sets the amount.",
      });
    }
  }

  /**
   * Bidirectional substring match on normalized names, with a length floor so
   * a short token can never sweep up half the catalog. Deliberately strict: a
   * missed match downgrades an item to its honest default status, which is
   * safe, whereas a loose match invents a prescription.
   */
  const planReasonFor = (item: CatalogItem): string | undefined => {
    const name = normalize(item.name);
    for (const { needle, because } of planNames) {
      if (needle.length < 5) continue;
      if (name.includes(needle) || needle.includes(name)) return because;
    }
    return undefined;
  };

  const available = catalogFor(client.locationId);
  const yourLines = TRACK_LINES[client.sex];
  const otherSex: Client["sex"] = client.sex === "male" ? "female" : "male";

  const toOffering = (item: CatalogItem): Offering => {
    const planBecause = planReasonFor(item);
    const includedBecause = includedSku.get(item.sku);

    const status: OfferingStatus = planBecause
      ? "on your plan"
      : includedBecause
        ? "included in your membership"
        : item.requiresProviderApproval
          ? "ask your provider"
          : "available to you";

    // Price is suppressed in exactly two cases, both for honesty rather than
    // coyness: an included item has no price to the member, and an item gated
    // on a provider decision has no price until that decision is yes.
    const showPrice = status === "available to you" || status === "on your plan";

    return {
      sku: item.sku,
      name: item.name,
      kindLabel: KIND_LABEL[item.kind],
      serviceLine: item.serviceLine,
      whatItIs: whatItIs(item),
      status,
      priceCents: showPrice ? item.unitPriceCents : null,
      priceNote:
        status === "included in your membership"
          ? "No charge on your current membership."
          : status === "ask your provider"
            ? // The protocol credit is deliberately NOT repeated on each card.
              // It is one balance, stated once in the membership section; a
              // saving printed twelve times reads as a sales floor rather than
              // a chart.
              `List price ${dollars(item.unitPriceCents)}, if your provider decides it applies.`
            : undefined,
      includedBecause,
      planBecause,
      requiresProviderApproval: item.requiresProviderApproval,
      inClinicOnly: item.fulfillment === "in-clinic",
    };
  };

  const grouped = byServiceLine(available);
  const groupFor = (line: ServiceLine): OfferingGroup | undefined => {
    const g = grouped.find((x) => x.line === line);
    if (!g) return undefined;
    const trackLabels: string[] = [];
    if (TRACK_LINES.male.includes(line)) trackLabels.push(CARE_TRACKS.male.label);
    if (TRACK_LINES.female.includes(line)) trackLabels.push(CARE_TRACKS.female.label);
    return {
      key: line,
      line,
      trackLabels,
      isYourTrack: yourLines.includes(line),
      planContext: planContextByLine.get(line),
      offerings: g.items.map(toOffering),
    };
  };

  // Order: the member's track, then what everyone gets, then anything filed
  // only under the other track. Lead with theirs; hide nothing.
  const otherOnly = TRACK_LINES[otherSex].filter((l) => !yourLines.includes(l));
  const ordered = [...yourLines, ...SHARED_LINES, ...otherOnly];
  const groups = ordered
    .map(groupFor)
    .filter((g): g is OfferingGroup => Boolean(g) && g!.offerings.length > 0);

  const all = groups.flatMap((g) => g.offerings);
  const onYourPlan = all.filter((o) => o.status === "on your plan");
  const includedUnused = all.filter((o) => o.status === "included in your membership");

  return {
    client,
    locationLabel: locationName(client.locationId),
    trackLabel: CARE_TRACKS[client.sex].label,
    trackServices: CARE_TRACKS[client.sex].services,
    otherTrackLabel: CARE_TRACKS[otherSex].label,
    otherTrackServices: CARE_TRACKS[otherSex].services,
    membership,
    benefits,
    protocolCreditCents,
    groups,
    onYourPlan,
    includedUnused,
  };
}

// ---------------------------------------------------------------------------
// Upgrade — stated, not sold
// ---------------------------------------------------------------------------

export interface MembershipUpgrade {
  from: MembershipTier;
  to: MembershipTier;
  /** Whole dollars per month, the difference only. */
  monthlyDifference: number;
  /** Benefit lines the next tier adds that the current tier does not have. */
  adds: string[];
  /** Extra protocol credit the next tier carries, integer cents. */
  addedCreditCents: number;
}

/**
 * What the next tier up adds. Facts only.
 *
 * Returns the DIFFERENCE — the benefit lines they do not already have and the
 * price delta — and nothing else. No "most members choose", no "save", no
 * urgency, no recommendation. This is a medical practice; a member deciding to
 * spend more on their care should do it from a comparison, not from a nudge.
 * Returns undefined at the top tier rather than inventing something to sell.
 */
export function membershipUpgrade(clientId: string): MembershipUpgrade | undefined {
  const membership = membershipForClient(clientId);
  if (!membership) return undefined;

  const tiers: MembershipTier[] = ["Single Visit", "Alpha Monthly", "Alpha Elite", "Alpha Concierge"];
  const next = tiers[tierRank(membership.tier) + 1];
  if (!next) return undefined;

  const have = new Set(benefitsFor(membership.tier));
  const adds = benefitsFor(next).filter((b) => !have.has(b));

  // Credit is a property of the tier, so it is read from the same table the
  // membership itself is built from rather than hardcoded a second time here.
  const nextCredit = next === "Alpha Concierge" ? 25_000 : next === "Alpha Elite" ? 7_500 : 0;

  return {
    from: membership.tier,
    to: next,
    monthlyDifference: TIER_PRICE[next] - TIER_PRICE[membership.tier],
    adds,
    addedCreditCents: Math.max(0, nextCredit - membership.protocolCreditCents),
  };
}

/**
 * Lowercase, strip punctuation, collapse whitespace. Used only for name
 * matching between the plan's modality vocabulary and the catalog's product
 * vocabulary — never for display.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Integer cents → "$185". Whole dollars: catalog prices have no cent parts. */
export function dollars(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Exposed for the page's "as of" line so the pinned clock lives in one place. */
export const AVAILABLE_AS_OF = NOW;
