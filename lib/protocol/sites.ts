import { addDays, dayOf, daysBetween } from "@/lib/subscriptions/engine";
import { buildPlanOfCare } from "@/lib/planOfCare/engine";
import { routeFor } from "@/lib/daily/today";
import { getClient } from "@/lib/mock/clients";
import { seededRandom } from "@/lib/utils";

/**
 * INJECTION SITE ROTATION.
 *
 * A member on TRT or a peptide protocol injects several times a week, for
 * years. WHERE those injections land is the part nobody tracks and the part
 * that quietly goes wrong:
 *
 *  - **Lipohypertrophy.** Repeatedly injecting the same patch of subcutaneous
 *    tissue thickens it. The lump is painless, so members keep using it — and
 *    thickened tissue absorbs erratically, which turns a stable protocol into
 *    an unpredictable one for reasons that never show up on a lab panel.
 *  - **Scar tissue and site reactions.** Muscle sites that never rest get sore,
 *    then get avoided, then the member is down to two sites and back to square
 *    one.
 *  - **Absorption.** Rotation is not hygiene theatre; it is the difference
 *    between a consistent level and a saw-tooth.
 *
 * So Apex tracks the one variable a member controls and the clinic never sees.
 *
 * ── THE HARD BOUNDARY ─────────────────────────────────────────────────────
 * This module tracks WHERE, and only where. There is no dose field, no volume,
 * no needle gauge and no frequency instruction anywhere in this file or the UI
 * built on it, and there is deliberately no place to put one — the same
 * structural absence the plan-of-care model uses. Amount and schedule belong to
 * the provider-signed prescription. A rotation map that starts whispering
 * clinical instructions is a rotation map we would have to take down.
 */

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------

export type InjectionSite =
  | "left-delt"
  | "right-delt"
  | "left-ventroglute"
  | "right-ventroglute"
  | "left-dorsogluteal"
  | "right-dorsogluteal"
  | "left-quad"
  | "right-quad"
  | "abdomen-left"
  | "abdomen-right"
  | "love-handle-left"
  | "love-handle-right";

/** Which silhouette a site is drawn on. */
export type BodyView = "front" | "back";

/**
 * Tissue at the site.
 *
 * This is anatomy, not a route instruction — it describes what is under the
 * skin at that spot, which is why "abdomen" and "flank" read differently from
 * "delt". It is NOT a recommendation about how anything should be given; the
 * signed prescription says that.
 */
export type SiteTissue = "Muscle" | "Fatty tissue";

export interface SiteMeta {
  id: InjectionSite;
  /** Member-facing name. Left/right are from the MEMBER's perspective. */
  label: string;
  /** Compact form for chips and the legend. */
  short: string;
  /** The clinical name, shown small — members hear it in the room. */
  anatomical: string;
  side: "left" | "right";
  view: BodyView;
  tissue: SiteTissue;
  /**
   * Position in the silhouette's own coordinate space — viewBox "0 0 100 200",
   * so `x` is 0–100 and `y` is 0–200. The component converts to percentages.
   *
   * Sides follow the anatomical convention: the front figure is drawn as if you
   * are facing the member, so their left is on the viewer's right; the back
   * figure is drawn from behind, so their left stays on the viewer's left. The
   * convention is why every spot also carries a written label — a member should
   * never have to work out a mirror image to find a site.
   */
  x: number;
  y: number;
}

/**
 * Stable order — the legend, the load table and the keyboard tab order all
 * follow it, so the map never reshuffles between renders.
 */
export const SITE_META: SiteMeta[] = [
  { id: "right-delt", label: "Right shoulder", short: "R delt", anatomical: "Deltoid", side: "right", view: "front", tissue: "Muscle", x: 27, y: 54 },
  { id: "left-delt", label: "Left shoulder", short: "L delt", anatomical: "Deltoid", side: "left", view: "front", tissue: "Muscle", x: 73, y: 54 },
  { id: "abdomen-right", label: "Right belly", short: "R abdo", anatomical: "Abdomen", side: "right", view: "front", tissue: "Fatty tissue", x: 44, y: 86 },
  { id: "abdomen-left", label: "Left belly", short: "L abdo", anatomical: "Abdomen", side: "left", view: "front", tissue: "Fatty tissue", x: 56, y: 86 },
  { id: "love-handle-right", label: "Right love handle", short: "R flank", anatomical: "Flank", side: "right", view: "front", tissue: "Fatty tissue", x: 37, y: 97 },
  { id: "love-handle-left", label: "Left love handle", short: "L flank", anatomical: "Flank", side: "left", view: "front", tissue: "Fatty tissue", x: 63, y: 97 },
  { id: "right-quad", label: "Right thigh", short: "R quad", anatomical: "Vastus lateralis", side: "right", view: "front", tissue: "Muscle", x: 43, y: 142 },
  { id: "left-quad", label: "Left thigh", short: "L quad", anatomical: "Vastus lateralis", side: "left", view: "front", tissue: "Muscle", x: 57, y: 142 },
  { id: "left-ventroglute", label: "Left hip", short: "L vento", anatomical: "Ventrogluteal", side: "left", view: "back", tissue: "Muscle", x: 27, y: 100 },
  { id: "right-ventroglute", label: "Right hip", short: "R vento", anatomical: "Ventrogluteal", side: "right", view: "back", tissue: "Muscle", x: 73, y: 100 },
  { id: "left-dorsogluteal", label: "Left glute", short: "L glute", anatomical: "Dorsogluteal, upper outer", side: "left", view: "back", tissue: "Muscle", x: 41, y: 111 },
  { id: "right-dorsogluteal", label: "Right glute", short: "R glute", anatomical: "Dorsogluteal, upper outer", side: "right", view: "back", tissue: "Muscle", x: 59, y: 111 },
];

export const INJECTION_SITES: InjectionSite[] = SITE_META.map((s) => s.id);

const META_BY_ID: Record<InjectionSite, SiteMeta> = Object.fromEntries(
  SITE_META.map((s) => [s.id, s]),
) as Record<InjectionSite, SiteMeta>;

export function siteMeta(site: InjectionSite): SiteMeta {
  return META_BY_ID[site];
}

export function siteLabel(site: InjectionSite): string {
  return META_BY_ID[site].label;
}

export function sitesForView(view: BodyView): SiteMeta[] {
  return SITE_META.filter((s) => s.view === view);
}

// ---------------------------------------------------------------------------
// The rest interval
// ---------------------------------------------------------------------------

/**
 * How long a site should be left alone before it is used again.
 *
 * Seven days is the interval Alpha Health's coaches teach in the room, and it
 * is the number this module measures against — a full week gives the tissue
 * time to settle, which is what keeps lipohypertrophy from building at a
 * favourite spot. It is a ROTATION HABIT, not a prescription: nothing here
 * tells a member when to inject, only which spot has had the longest rest.
 *
 * With twelve sites and a week of rest each, a member can inject daily and
 * still never reuse a site inside its rest window. That is the whole design.
 */
export const SITE_REST_DAYS = 7;

/** The window `siteLoad` and `overusedSites` look back over by default. */
export const SITE_LOAD_WINDOW_DAYS = 28;

/**
 * The most times a single site can be used inside a window before the rest
 * interval has necessarily been broken. Derived, not hand-picked, so changing
 * `SITE_REST_DAYS` moves the overuse threshold with it.
 */
export function maxUsesIn(days: number): number {
  return Math.max(1, Math.floor(days / SITE_REST_DAYS));
}

// ---------------------------------------------------------------------------
// The log
// ---------------------------------------------------------------------------

export interface SiteLog {
  id: string;
  clientId: string;
  site: InjectionSite;
  /** ISO datetime the member logged it. */
  at: string;
  /**
   * What went in, BY NAME ONLY — taken from the plan's modality, which carries
   * no strength. Optional because a member who taps a site without picking an
   * item has still given us the datum that matters: the site.
   */
  itemName?: string;
}

const NOW = "2026-06-12T09:00:00";

/** How far back the seeded history runs. Two full rotation cycles, plus slack. */
const HISTORY_DAYS = 70;

/**
 * The two sites almost everyone over-uses.
 *
 * Not a stereotype — it is what the rotation problem looks like. Members reach
 * for the spot they can see and reach comfortably, which is exactly how one
 * patch of tissue accumulates months of injections while ten other sites sit
 * unused. The seeded history reproduces that bias on purpose, because a demo
 * where every site is perfectly balanced demonstrates nothing.
 */
const FAVOURITES: InjectionSite[] = ["right-delt", "left-delt"];

/**
 * Items on the plan that are actually injected. Coaching is not a site.
 *
 * Names only — these come from `PlanItem.modality`, which carries no strength
 * and no amount. That is the reason the log picker can offer them at all.
 */
export function injectableNames(clientId: string): string[] {
  const client = getClient(clientId);
  if (!client) return [];
  return buildPlanOfCare(client)
    .protocol.map((item) => ({ name: item.modality ?? item.title, category: item.category }))
    .filter((x) => routeFor(x.name, x.category).includes("injection"))
    // Some rule candidates are named as conversations to have rather than
    // products — "hormone optimization discussion". A discussion is not a thing
    // that goes into a site, and offering it in the picker would be nonsense.
    .filter((x) => !/discussion|consult|review/i.test(x.name))
    .map((x) => x.name);
}

/**
 * Seeded history for one member.
 *
 * Deterministic in the same way every other mock in Apex is: the seed is the
 * member id, so the map renders identically on every machine, forever.
 */
function seedLogs(clientId: string): SiteLog[] {
  const names = injectableNames(clientId);
  if (names.length === 0) return [];

  const rand = seededRandom(`sites:${clientId}`);
  const today = dayOf(NOW);
  const lastUsedOn = new Map<InjectionSite, string>();
  const out: SiteLog[] = [];

  // Walk forward from the oldest day so `lastUsedOn` is always the truth at the
  // moment of each pick — the same order the member lived it.
  let cursor = addDays(today, -HISTORY_DAYS);
  let n = 0;

  while (daysBetween(cursor, today) > 0) {
    const favouring = rand() < 0.4;
    const site = favouring
      ? FAVOURITES[Math.floor(rand() * FAVOURITES.length)]
      : leastRecentlyUsed(INJECTION_SITES, lastUsedOn, cursor);

    n += 1;
    out.push({
      id: `sl-${clientId}-${String(n).padStart(3, "0")}`,
      clientId,
      site,
      // 08:00 local — a wall-clock string in the same naive shape as NOW, so
      // nothing here depends on the machine's timezone.
      at: `${cursor}T08:00:00`,
      itemName: names[n % names.length],
    });
    lastUsedOn.set(site, cursor);

    // Every day or two — the real frequency of someone running a hormone and a
    // GLP-1 alongside a peptide. Irregular on purpose; a perfect cadence reads
    // as fake, and a sparse one would never surface the overuse this page
    // exists to catch.
    cursor = addDays(cursor, rand() < 0.5 ? 1 : 2);
  }

  return out;
}

function leastRecentlyUsed(
  sites: InjectionSite[],
  lastUsedOn: Map<InjectionSite, string>,
  onDay: string,
): InjectionSite {
  let best = sites[0];
  let bestAge = -1;
  for (const s of sites) {
    const last = lastUsedOn.get(s);
    // Never used inside the window beats everything — treat it as infinitely old.
    const age = last ? daysBetween(last, onDay) : Number.MAX_SAFE_INTEGER;
    if (age > bestAge) {
      best = s;
      bestAge = age;
    }
  }
  return best;
}

/**
 * Per-member log store.
 *
 * Lazily built and memoised: seeding every client up front would run the plan
 * engine several hundred times at module load to answer a question about one
 * member. Mutable, and only through `logSite` — the same contract the ledger
 * and the subscription book use.
 */
const LOGS = new Map<string, SiteLog[]>();

function store(clientId: string): SiteLog[] {
  let list = LOGS.get(clientId);
  if (!list) {
    list = seedLogs(clientId);
    LOGS.set(clientId, list);
  }
  return list;
}

/** Newest first — the order the member reads it. */
export function siteHistory(clientId: string): SiteLog[] {
  return [...store(clientId)].sort((a, b) => (a.at < b.at ? 1 : -1));
}

export function lastUseOf(clientId: string, site: InjectionSite): SiteLog | undefined {
  return siteHistory(clientId).find((l) => l.site === site);
}

/**
 * Append a use. Returns the committed entry so the caller can reference its id
 * on the ledger row it must also write — a logged injection that leaves no
 * trace is the kind of record that turns out not to exist when it matters.
 */
export function logSite(
  clientId: string,
  site: InjectionSite,
  at: string = NOW,
  itemName?: string,
): SiteLog {
  const list = store(clientId);
  const entry: SiteLog = {
    id: `sl-${clientId}-${String(list.length + 1).padStart(3, "0")}`,
    clientId,
    site,
    at,
    itemName,
  };
  list.push(entry);
  return entry;
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/** How a site is doing, in one word. Drives the colour on the body map. */
export type SiteState =
  | "overused" // used more times in the window than the rest interval allows
  | "resting" // used inside the rest interval — leave it alone
  | "ready" // rested long enough
  | "unused"; // no record in the window at all

export interface SiteLoad {
  site: InjectionSite;
  meta: SiteMeta;
  /** Uses inside the window. */
  count: number;
  /** ISO datetime of the most recent use, if any — INSIDE the window. */
  lastAt?: string;
  /** Whole days since the last use anywhere in the record. Null if never. */
  daysSince: number | null;
  state: SiteState;
  /** One line a member could read aloud. */
  note: string;
}

/**
 * Usage per site over a window, for all twelve sites.
 *
 * Every site is returned, including the ones with zero uses — the empty sites
 * are the point of the exercise, and a table that only lists what was used
 * makes the unused sites invisible.
 */
export function siteLoad(
  clientId: string,
  days: number = SITE_LOAD_WINDOW_DAYS,
  nowIso: string = NOW,
): SiteLoad[] {
  const today = dayOf(nowIso);
  const cutoff = addDays(today, -days);
  const history = siteHistory(clientId);
  const cap = maxUsesIn(days);

  return SITE_META.map((meta) => {
    const all = history.filter((l) => l.site === meta.id);
    const within = all.filter((l) => daysBetween(cutoff, dayOf(l.at)) >= 0);
    const lastAll = all[0];
    const daysSince = lastAll ? daysBetween(dayOf(lastAll.at), today) : null;

    const state: SiteState =
      within.length > cap
        ? "overused"
        : daysSince === null
          ? "unused"
          : daysSince < SITE_REST_DAYS
            ? "resting"
            : "ready";

    return {
      site: meta.id,
      meta,
      count: within.length,
      lastAt: within[0]?.at,
      daysSince,
      state,
      note: noteFor(state, within.length, daysSince, days, cap),
    };
  });
}

function noteFor(
  state: SiteState,
  count: number,
  daysSince: number | null,
  days: number,
  cap: number,
): string {
  if (state === "overused") {
    return `Used ${count} times in ${days} days — that is more than ${cap} and this spot has not had a full week off between turns.`;
  }
  if (state === "unused") {
    return `Not used at all in the last ${days} days. It is available.`;
  }
  if (state === "resting") {
    const left = SITE_REST_DAYS - (daysSince ?? 0);
    return `Used ${daysSince === 0 ? "today" : daysSince === 1 ? "yesterday" : `${daysSince} days ago`} — give it ${left} more day${left === 1 ? "" : "s"}.`;
  }
  return `Last used ${daysSince} days ago. Rested long enough.`;
}

/**
 * Sites that have been used more often than the rest interval allows.
 *
 * These are the ones a coach wants to hear about, and the ones a member should
 * stop reaching for. Worst first.
 */
export function overusedSites(
  clientId: string,
  days: number = SITE_LOAD_WINDOW_DAYS,
  nowIso: string = NOW,
): SiteLoad[] {
  return siteLoad(clientId, days, nowIso)
    .filter((l) => l.state === "overused")
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// The recommendation
// ---------------------------------------------------------------------------

export interface SiteRecommendation {
  site: InjectionSite;
  meta: SiteMeta;
  /** Why this one, in the member's language. Always populated. */
  reason: string;
  /** Days since it was last used. Null when it has never been used. */
  daysSince: number | null;
  /** Runner-up, so a member with a reason to skip the first has a second. */
  alternate?: InjectionSite;
}

/**
 * The least-recently-used eligible site.
 *
 * "Eligible" means rested at least `SITE_REST_DAYS`, and never-used beats
 * everything. If every site is inside its rest window — which can only happen
 * if someone has been injecting far more often than twelve sites and a week of
 * rest can absorb — we still return the oldest one rather than nothing, and the
 * reason says plainly that nothing is fully rested. A blank recommendation
 * teaches a member to stop opening the page.
 */
export function recommendNextSite(
  clientId: string,
  nowIso: string = NOW,
): SiteRecommendation | null {
  const load = siteLoad(clientId, SITE_LOAD_WINDOW_DAYS, nowIso);
  if (load.length === 0) return null;

  // Oldest first; never-used sorts ahead of everything.
  const ranked = [...load].sort((a, b) => {
    const av = a.daysSince ?? Number.MAX_SAFE_INTEGER;
    const bv = b.daysSince ?? Number.MAX_SAFE_INTEGER;
    if (av !== bv) return bv - av;
    // Tie-break on how heavily loaded the site is, then on the stable site
    // order, so the same input always yields the same answer.
    if (a.count !== b.count) return a.count - b.count;
    return INJECTION_SITES.indexOf(a.site) - INJECTION_SITES.indexOf(b.site);
  });

  const pick = ranked[0];
  const anyRested = ranked.some((l) => l.daysSince === null || l.daysSince >= SITE_REST_DAYS);

  const reason =
    pick.daysSince === null
      ? `You have not used your ${pick.meta.label.toLowerCase()} at all in the last ${SITE_LOAD_WINDOW_DAYS} days — it is the freshest spot you have.`
      : anyRested
        ? `Your ${pick.meta.label.toLowerCase()} has had ${pick.daysSince} days off, longer than anywhere else. That is the one to use.`
        : `Nothing has had a full ${SITE_REST_DAYS} days off yet. Your ${pick.meta.label.toLowerCase()} has rested the longest at ${pick.daysSince} days — use it, and mention the rotation to your coach.`;

  return {
    site: pick.site,
    meta: pick.meta,
    reason,
    daysSince: pick.daysSince,
    alternate: ranked[1]?.site,
  };
}

/**
 * One-sentence read on how the rotation is going overall. Shown at the top of
 * the page so a member gets the answer before they read a single chart.
 */
export function rotationHeadline(
  clientId: string,
  nowIso: string = NOW,
): { tone: "good" | "watch"; text: string } {
  const over = overusedSites(clientId, SITE_LOAD_WINDOW_DAYS, nowIso);
  if (over.length === 0) {
    return {
      tone: "good",
      text: `Your rotation looks good — no site has been used more than ${maxUsesIn(SITE_LOAD_WINDOW_DAYS)} times in the last ${SITE_LOAD_WINDOW_DAYS} days.`,
    };
  }
  const names = over.map((o) => o.meta.label.toLowerCase());
  const list =
    names.length === 1
      ? `your ${names[0]}`
      : `your ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return {
    tone: "watch",
    text: `You have been leaning on ${list}. Spreading the next few out gives that tissue a chance to settle.`,
  };
}
