import type { PortalId } from "@/lib/portals";

/**
 * THE FEATURE REGISTRY — what can be turned off, and what cannot.
 *
 * WHY THIS EXISTS
 * ---------------
 * Two commitments made on the 2026-07-21 project sync land on this file:
 *
 *   1. "From the owner console you'll be able to turn features on and off at
 *      will for coaches and clients. You don't have to do anything in Azure."
 *   2. Ship Apex under a V1 skin so nobody has to relearn what they learned in
 *      the last two weeks — "I'd rather subtract than add."
 *
 * Both are the same mechanism. A release that turns Apex into the clinic's V1
 * is a preset of this registry, not a branch and not a deploy.
 *
 * THE VOCABULARY IS CLOSED, LIKE THE CATALOG
 * ------------------------------------------
 * `lib/catalog/types.ts` explains at length why the product catalog is data and
 * closed: an open vocabulary meant an unknown SKU could be typed into an order
 * and silently dropped. The same reasoning applies here with a worse failure.
 * If a flag key were free text, then a typo in a flag name — `"comunity"` —
 * evaluates to "no row found", and a `false` default would silently hide a
 * working surface while a `true` default would silently expose one that was
 * meant to be dark. Neither failure announces itself.
 *
 * So a flag key that is not in this file is not a flag. `flagKeys` is derived
 * from the array, `FeatureKey` is a union of literals, and an unknown key is a
 * TypeScript error at the call site rather than a surprise in production.
 *
 * WHAT IS DELIBERATELY NOT FLAGGABLE
 * ----------------------------------
 * There is no flag for the sign queue, the ledger, escalations, the patient
 * chart, ordering, or intake. A clinic that can turn off its audit trail does
 * not have an audit trail, and a "feature flag" that can disable the controlled
 * substance workflow is a compliance hole with an admin UI attached. If a
 * surface is load-bearing for safety or for the record, it ships unconditionally
 * and this registry does not mention it.
 *
 * The test for whether something belongs here: *if this were off for six
 * months, would the clinic be unsafe or the record incomplete?* If yes, it is
 * not a feature — it is the product.
 */

/**
 * Release presets.
 *
 * `clinic-v1` is the original parity posture: Apex underneath, the surface area
 * the coaches already know, and everything Apex added dark. `clinic-v2` is the
 * intended launch posture: the highest-value Apex additions are available while
 * the three surfaces with unresolved workflow or disclosure risk stay dark.
 * `full` is the whole product, which is what development and internal review run.
 *
 * A preset supplies DEFAULTS ONLY. A stored flag row always wins — the preset
 * is where a key starts, not where it is pinned.
 */
export type PresetId = "clinic-v1" | "clinic-v2" | "full";

export const PRESETS: Record<PresetId, { label: string; description: string }> = {
  "clinic-v1": {
    label: "Clinic (V1 parity)",
    description:
      "The Aug 7 posture. Everything the coaches already learned, nothing they didn't ask for.",
  },
  "clinic-v2": {
    label: "Clinic (V2 launch)",
    description:
      "Most Apex features on. Direct provider messaging, emergency cards and self-booking stay off until their operating controls are ready.",
  },
  full: {
    label: "Full product",
    description: "Every surface Apex has built. Internal and demo use.",
  },
};

/** The preset a fresh environment starts from when nothing is stored. */
export const DEFAULT_PRESET: PresetId = "clinic-v1";

export interface FeatureDef {
  key: FeatureKey;
  /** What an owner reading the toggle list would call it. */
  label: string;
  /** One line. Why it exists and what turning it off costs. */
  description: string;
  /** Which portals visibly change when this moves. Drives grouping in the UI. */
  portals: PortalId[];
  /**
   * Route prefixes this feature owns. A request under one of these prefixes is
   * refused server-side when the feature is off — see lib/features/gate.ts.
   *
   * Empty means the feature has no routes of its own and only changes what
   * existing surfaces render (gamification is the clearest case: it is a layer
   * over the member's own pages, not a page).
   */
  routes: string[];
  defaults: Record<PresetId, boolean>;
  /**
   * Set when turning this ON has a consequence someone should read first.
   * Rendered next to the toggle, not buried in a tooltip.
   */
  caution?: string;
}

/**
 * The registry.
 *
 * Ordering is the order the owner console renders, grouped by portal. Read the
 * `clinic-v1` column as the answer to "what ships on Aug 7".
 */
const DEFS = [
  // ── Member portal: the pilot gate ──────────────────────────────────────
  {
    key: "member-portal",
    label: "Member portal",
    description:
      "Whether patients can sign in at all. Scope this to individual members to run a pilot.",
    portals: ["patient"],
    routes: [],
    defaults: { "clinic-v1": true, "clinic-v2": true, full: true },
    caution:
      "Global ON exposes the portal to every member. The Aug 7 plan is a ~10-person pilot: leave this global OFF and enable it per client.",
  },
  {
    key: "member-provider-thread",
    label: "Members can message a provider directly",
    description:
      "A second message thread straight to the assigned provider, bypassing the coach.",
    portals: ["patient", "clinic"],
    routes: [],
    defaults: { "clinic-v1": false, "clinic-v2": false, full: false },
    caution:
      "Decided against on 2026-07-21: the coach is the front door and escalates. Some providers are available four hours a month; a direct thread reaches nobody and the member watches their clinical question sit unanswered.",
  },
  {
    key: "member-education",
    label: "Learn & peptide library",
    description: "Member-facing education articles and the peptide reference library.",
    portals: ["patient"],
    routes: ["/portal/learn", "/portal/library"],
    defaults: { "clinic-v1": false, "clinic-v2": true, full: true },
  },
  {
    key: "member-explore",
    label: "What's available",
    description: "Merchandising surface showing services the member is not yet on.",
    portals: ["patient"],
    routes: ["/portal/explore"],
    defaults: { "clinic-v1": false, "clinic-v2": true, full: true },
  },
  {
    key: "member-nutrition",
    label: "Food & training plans",
    description: "Member meal guidance and training programming.",
    portals: ["patient"],
    routes: ["/portal/food", "/portal/train"],
    defaults: { "clinic-v1": false, "clinic-v2": true, full: true },
  },
  {
    key: "member-referrals",
    label: "Refer a friend",
    description: "Member referral flow and reward tracking.",
    portals: ["patient"],
    routes: ["/portal/refer"],
    defaults: { "clinic-v1": false, "clinic-v2": true, full: true },
  },
  {
    key: "gamification",
    label: "Streaks, levels & quests",
    description:
      "The engagement layer over the member's own pages. Not a page of its own.",
    portals: ["patient"],
    routes: [],
    defaults: { "clinic-v1": false, "clinic-v2": true, full: true },
    caution:
      "Members can already opt out individually (member_prefs.gamification_enabled). This is the clinic-wide switch.",
  },

  // ── Community ──────────────────────────────────────────────────────────
  {
    key: "community",
    label: "Community",
    description:
      "Member community: events, squads, buddies, kudos, photos. Staff-moderated.",
    portals: ["patient", "coach", "clinic", "desk", "exec"],
    routes: [
      "/community",
      "/portal/community",
      "/coach/community",
      "/clinic/community",
      "/desk/community",
      "/exec/community",
    ],
    defaults: { "clinic-v1": false, "clinic-v2": true, full: true },
    caution:
      "Member-to-member visibility. Every post is a potential disclosure between patients — moderation load is real and falls on staff.",
  },

  // ── Coach & clinic extras ──────────────────────────────────────────────
  {
    key: "coach-winback",
    label: "Lapsed member win-back",
    description: "Ranked list of lapsed members with outreach prompts.",
    portals: ["coach"],
    routes: ["/coach/winback"],
    defaults: { "clinic-v1": false, "clinic-v2": true, full: true },
  },
  {
    key: "population-insights",
    label: "What we're seeing",
    description: "Cross-member pattern detection and cohort trajectories.",
    portals: ["coach", "clinic"],
    routes: ["/insights"],
    defaults: { "clinic-v1": false, "clinic-v2": true, full: true },
  },
  {
    key: "ai-recommendations",
    label: "AI recommendations",
    description:
      "Generated protocol suggestions queued for provider sign-off.",
    portals: ["coach", "clinic"],
    routes: ["/recommendations"],
    defaults: { "clinic-v1": false, "clinic-v2": true, full: true },
    caution:
      "A suggestion still requires a licensed signature before it reaches a member. Turning this off removes the queue, not the requirement.",
  },
  {
    key: "ai-assistant",
    label: "Ask Apex",
    description: "Conversational assistant over the record.",
    portals: ["coach", "clinic", "desk", "exec"],
    routes: ["/agent"],
    defaults: { "clinic-v1": false, "clinic-v2": true, full: true },
  },
  {
    key: "background-agents",
    label: "Background agents",
    description: "Long-running automation workers and their run history.",
    portals: ["coach", "exec"],
    routes: ["/swarm"],
    defaults: { "clinic-v1": false, "clinic-v2": true, full: true },
  },
  {
    key: "automations",
    label: "Automations",
    description: "Rule-driven member outreach and lifecycle triggers.",
    portals: ["coach", "exec"],
    routes: ["/automations"],
    defaults: { "clinic-v1": false, "clinic-v2": true, full: true },
  },

  // ── Operations ─────────────────────────────────────────────────────────
  {
    key: "emergency-card",
    label: "Emergency card",
    description:
      "Scannable card exposing medications, allergies and care team to a first responder.",
    portals: ["patient", "desk"],
    routes: ["/card"],
    defaults: { "clinic-v1": false, "clinic-v2": false, full: true },
    caution:
      "A live emergency card is PHI reachable by whoever holds the link. Grants expire and are revocable; the feature switch is the blunt instrument above that.",
  },
  {
    key: "self-booking",
    label: "Member self-booking",
    description: "Members book their own visits against real availability.",
    portals: ["patient"],
    routes: ["/portal/book-visit", "/book"],
    defaults: { "clinic-v1": false, "clinic-v2": false, full: true },
    caution:
      "A New Client Visit needs a coach, a lab draw and a provider on the same day. Do not enable member self-booking until the NCV resolver is live, or members will book visits the clinic cannot staff.",
  },
] as const satisfies readonly RawFeatureDef[];

/** Shape check for the `as const satisfies` above — not exported. */
interface RawFeatureDef {
  key: string;
  label: string;
  description: string;
  portals: readonly PortalId[];
  routes: readonly string[];
  defaults: Record<PresetId, boolean>;
  caution?: string;
}

export type FeatureKey = (typeof DEFS)[number]["key"];

export const FEATURES: readonly FeatureDef[] = DEFS as unknown as readonly FeatureDef[];

export const FEATURE_KEYS: readonly FeatureKey[] = DEFS.map((d) => d.key);

const BY_KEY = new Map<string, FeatureDef>(FEATURES.map((f) => [f.key, f]));

export function featureDef(key: FeatureKey): FeatureDef {
  const def = BY_KEY.get(key);
  // Unreachable through the type system; thrown rather than defaulted because a
  // missing definition must not silently resolve to "on" or to "off".
  if (!def) throw new Error(`Unknown feature key: ${key}`);
  return def;
}

/** True when `key` names a real feature. For validating request bodies. */
export function isFeatureKey(key: string): key is FeatureKey {
  return BY_KEY.has(key);
}

/**
 * The feature that owns a path, if any.
 *
 * Longest-prefix wins, so a future `/portal/learn/advanced` resolves to the
 * same feature as `/portal/learn` and a more specific feature can carve a
 * sub-route out of a broader one later without this needing to change.
 *
 * Matching is on segment boundaries: `/community` must not claim
 * `/communityhealth`. That is the kind of bug that only shows up once someone
 * adds a route whose name happens to share a prefix.
 */
export function featureForPath(pathname: string): FeatureDef | null {
  let best: FeatureDef | null = null;
  let bestLen = -1;
  for (const f of FEATURES) {
    for (const route of f.routes) {
      if (pathname === route || pathname.startsWith(route + "/")) {
        if (route.length > bestLen) {
          best = f;
          bestLen = route.length;
        }
      }
    }
  }
  return best;
}

/** Defaults for a preset, as a plain map. The base every resolution starts from. */
export function presetDefaults(preset: PresetId): Record<FeatureKey, boolean> {
  const out = {} as Record<FeatureKey, boolean>;
  for (const f of FEATURES) out[f.key] = f.defaults[preset];
  return out;
}
