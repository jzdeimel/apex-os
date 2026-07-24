import type { Client, ClientStatus, LocationId, RiskLevel } from "@/lib/types";
import { clientName } from "@/lib/mock/clients";
import { daysSinceTouch } from "@/lib/mock/contactLog";
import { escalationsForClient } from "@/lib/escalations/fixtureSelectors";
import { isResolved } from "@/lib/escalations/queue";
import { effectiveClient } from "@/lib/roster/health";

/**
 * SAVED VIEWS — the same three filters, rebuilt every morning.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 * Watch a coach open the roster. They set status, set location to their site,
 * sort by last contact, scroll. Tomorrow they do it again. The audited system
 * has no saved filters at all, so a coach's actual working queues live in
 * their fingers, and any coach who is off sick takes their queues with them.
 *
 * Two consequences of that, both worse than the keystrokes:
 *   - the queues are never shared, so two coaches covering the same site work
 *     different definitions of "at risk" and neither knows it; and
 *   - anything fiddly to rebuild simply never gets looked at, which is how
 *     "waiting on a provider" becomes a category nobody checks.
 *
 * A view is therefore a named, shareable object with an owner — not a UI state
 * blob. The built-ins below are the five queues that keep a book healthy, and
 * they are the same five for everyone, which is the point.
 *
 * ── Pure by design ────────────────────────────────────────────────────────
 * `applyView` is a pure function of (view, clients). No fetching, no ledger,
 * no store. It has to be: it runs inside render, it runs for view counts on
 * every switcher pill, and a filter that can have a side effect is a filter
 * nobody can safely call twice.
 */

/** Pinned clock. Nothing in Apex reads the wall clock. */
export const NOW = "2026-06-12T09:00:00";

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface ViewFilters {
  /** Empty or absent means "any status" — never "no statuses". */
  status?: ClientStatus[];
  /** Highest risk flag on the record must be one of these. */
  risk?: RiskLevel[];
  /** MINIMUM days since the last touch. 21 means "silent for 3 weeks or more". */
  lastTouchDays?: number;
  hasOpenEscalation?: boolean;
  hasCareGap?: boolean;
  location?: LocationId | "all";
}

export type ViewSort =
  | "last-touch"
  | "name"
  | "risk"
  | "status"
  | "next-visit";

export interface SavedView {
  id: string;
  name: string;
  /** Staff id. Built-ins are owned by the clinic, not a person. */
  ownerId: string;
  /** One line explaining what the queue is FOR — a name alone drifts in meaning. */
  description: string;
  filters: ViewFilters;
  sort: ViewSort;
  isDefault: boolean;
  /** Built-ins ship with the product and cannot be deleted. */
  builtIn: boolean;
}

/** Views that belong to the clinic rather than to a coach. */
export const CLINIC_OWNER = "clinic";

// ---------------------------------------------------------------------------
// Derived predicates
// ---------------------------------------------------------------------------

const RISK_RANK: Record<RiskLevel, number> = { none: 0, low: 1, moderate: 2, high: 3 };

/** Worst flag on the record. No flags is genuinely "none", not "unknown". */
export function riskOf(client: Client): RiskLevel {
  return client.riskFlags.reduce<RiskLevel>(
    (worst, f) => (RISK_RANK[f.level] > RISK_RANK[worst] ? f.level : worst),
    "none",
  );
}

export function hasOpenEscalation(client: Client): boolean {
  return escalationsForClient(client.id).some((e) => !isResolved(e));
}

/**
 * The ball is on the medical side, not the coach's.
 *
 * Exported so a row can say *why* it is in the "Waiting on a provider" queue
 * rather than the coach inferring it from a status badge.
 */
export function isAwaitingProvider(client: Client): boolean {
  return client.status === "Results Ready" || client.status === "Plan Review";
}

/** Statuses where a lab result should already exist on the record. */
const LABS_EXPECTED_AT: ReadonlySet<ClientStatus> = new Set([
  "Results Ready",
  "Plan Review",
  "Active Protocol",
  "Follow-Up Due",
]);

/**
 * Does this record have a gap that blocks care?
 *
 * Reads `effectiveClient` (lib/roster/health.ts) rather than the raw record so
 * this agrees exactly with the roster-health page about what is missing — the
 * two surfaces disagreeing about whether a member has a coach is worse than
 * neither surface existing.
 *
 * It re-derives the boolean instead of calling `runRosterHealth`, which scans
 * the whole book and allocates a Finding object per problem. That is the right
 * shape for a report and the wrong shape for a predicate called once per row
 * per render.
 */
export function hasCareGap(client: Client, nowIso: string = NOW): boolean {
  const ec = effectiveClient(client, nowIso);
  if (!ec.coachId || !ec.providerId) return true;
  if (!ec.email || !ec.phone) return true;
  if (!ec.locationId) return true;
  if (LABS_EXPECTED_AT.has(client.status) && !client.latestLabDate) return true;
  if (ec.nextAppointment && ec.nextAppointment < nowIso) return true;
  return false;
}

/**
 * Days of silence. `Infinity` for a member never contacted, so "never" sorts
 * above "180 days ago" instead of reading as a fresh touch.
 */
export function silenceDays(client: Client): number {
  return daysSinceTouch(client.id);
}

// ---------------------------------------------------------------------------
// Built-in views
// ---------------------------------------------------------------------------

/**
 * The five queues. Each one answers a question a coach asks out loud.
 *
 * Note what is NOT here: no "top performers", no leaderboard, no
 * body-composition cut. A view is a worklist, and ranking members against each
 * other on health is not something this product does.
 */
export const BUILT_IN_VIEWS: SavedView[] = [
  {
    id: "view-needs-touch",
    name: "Needs a touch",
    ownerId: CLINIC_OWNER,
    description:
      "In active care and silent for 14 days or more. The cheapest churn to prevent, because nothing is broken yet.",
    filters: {
      status: ["Active Protocol", "Follow-Up Due", "Plan Review"],
      lastTouchDays: 14,
      location: "all",
    },
    sort: "last-touch",
    isDefault: true,
    builtIn: true,
  },
  {
    id: "view-new-labs",
    name: "New labs to discuss",
    ownerId: CLINIC_OWNER,
    description:
      "Results are back and the conversation hasn't happened. A resulted panel nobody explains is a panel the member paid for twice.",
    filters: { status: ["Results Ready"], location: "all" },
    sort: "last-touch",
    isDefault: false,
    builtIn: true,
  },
  {
    id: "view-at-risk",
    name: "At risk",
    ownerId: CLINIC_OWNER,
    description:
      "A moderate or high risk flag on the record, or an escalation still open. Clinical attention, not a churn score.",
    filters: { risk: ["moderate", "high"], location: "all" },
    sort: "risk",
    isDefault: false,
    builtIn: true,
  },
  {
    id: "view-waiting-provider",
    name: "Waiting on a provider",
    ownerId: CLINIC_OWNER,
    description:
      "The coach has done their part and the queue is on the medical side. Kept separate so coach follow-up never gets counted against work that isn't theirs.",
    filters: { status: ["Results Ready", "Plan Review"], location: "all" },
    sort: "last-touch",
    isDefault: false,
    builtIn: true,
  },
  {
    id: "view-everyone",
    name: "Everyone",
    ownerId: CLINIC_OWNER,
    description: "The whole book, most recently silent first. The fallback that is always right.",
    filters: { location: "all" },
    sort: "name",
    isDefault: false,
    builtIn: true,
  },
];

export const DEFAULT_VIEW: SavedView =
  BUILT_IN_VIEWS.find((v) => v.isDefault) ?? BUILT_IN_VIEWS[0];

export function getView(id: string, extra: SavedView[] = []): SavedView | undefined {
  return [...BUILT_IN_VIEWS, ...extra].find((v) => v.id === id);
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

const STATUS_RANK: Record<ClientStatus, number> = {
  "Results Ready": 0,
  "Follow-Up Due": 1,
  "Plan Review": 2,
  "Active Protocol": 3,
  "Labs Ordered": 4,
  "Consult Booked": 5,
  Lead: 6,
  Inactive: 7,
};

/**
 * Sort comparators.
 *
 * Every one of them falls through to client id. Without a total order the
 * result reshuffles between renders for equal keys, and a list that moves under
 * the cursor is a list that gets misclicked — which, on a roster, means opening
 * the wrong person's chart.
 */
const COMPARATORS: Record<ViewSort, (a: Client, b: Client) => number> = {
  "last-touch": (a, b) => silenceDays(b) - silenceDays(a) || a.id.localeCompare(b.id),
  name: (a, b) => clientName(a).localeCompare(clientName(b)) || a.id.localeCompare(b.id),
  risk: (a, b) => RISK_RANK[riskOf(b)] - RISK_RANK[riskOf(a)] || silenceDays(b) - silenceDays(a) || a.id.localeCompare(b.id),
  status: (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.id.localeCompare(b.id),
  // Unbooked sorts last: "no next visit" is not "a visit infinitely far away",
  // but it is also not something to put at the top of a scheduling queue.
  "next-visit": (a, b) =>
    (a.nextAppointment ?? "9999").localeCompare(b.nextAppointment ?? "9999") ||
    a.id.localeCompare(b.id),
};

/** Does one client pass this view's filters? Exported so a row can explain itself. */
export function matchesFilters(
  client: Client,
  filters: ViewFilters,
  nowIso: string = NOW,
): boolean {
  // An empty array means the coach cleared the facet, which reads as "any" —
  // treating it as "none" would render an empty roster and look like a bug.
  if (filters.status?.length && !filters.status.includes(client.status)) return false;
  if (filters.risk?.length && !filters.risk.includes(riskOf(client))) return false;
  if (filters.lastTouchDays !== undefined && silenceDays(client) < filters.lastTouchDays) return false;
  if (filters.hasOpenEscalation === true && !hasOpenEscalation(client)) return false;
  if (filters.hasOpenEscalation === false && hasOpenEscalation(client)) return false;
  if (filters.hasCareGap === true && !hasCareGap(client, nowIso)) return false;
  if (filters.hasCareGap === false && hasCareGap(client, nowIso)) return false;
  if (filters.location && filters.location !== "all" && client.locationId !== filters.location) return false;
  return true;
}

/** The filtered, sorted set. Pure — never mutates the input array. */
export function applyView(
  view: SavedView,
  clients: Client[],
  nowIso: string = NOW,
): Client[] {
  return clients
    .filter((c) => matchesFilters(c, view.filters, nowIso))
    .sort(COMPARATORS[view.sort] ?? COMPARATORS.name);
}

/** Row count for a switcher pill. Same predicate as the list — never an estimate. */
export function viewCount(view: SavedView, clients: Client[], nowIso: string = NOW): number {
  let n = 0;
  for (const c of clients) if (matchesFilters(c, view.filters, nowIso)) n += 1;
  return n;
}

// ---------------------------------------------------------------------------
// Creating a view from what is on screen
// ---------------------------------------------------------------------------

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/**
 * Turn the filter set a coach is currently looking at into a saved view.
 *
 * The id is derived from owner + name rather than a counter or a timestamp:
 * deterministic (no `Date.now()`), and saving the same name twice targets the
 * same view instead of quietly accumulating four "At risk (2)" duplicates,
 * which is how every saved-search feature ends up unusable.
 */
export function createView(input: {
  name: string;
  ownerId: string;
  description?: string;
  filters: ViewFilters;
  sort?: ViewSort;
  isDefault?: boolean;
}): SavedView {
  return {
    id: `view-${input.ownerId}-${slug(input.name) || "untitled"}`,
    name: input.name.trim() || "Untitled view",
    ownerId: input.ownerId,
    description: input.description?.trim() || "Saved from the roster filters.",
    filters: input.filters,
    sort: input.sort ?? "last-touch",
    isDefault: input.isDefault ?? false,
    builtIn: false,
  };
}

/**
 * Insert or replace by id. Returns a new array — the caller owns the state, and
 * a helper that mutated the coach's saved-view list in place would make undo
 * impossible at the layer that actually needs it.
 */
export function upsertView(views: SavedView[], view: SavedView): SavedView[] {
  const i = views.findIndex((v) => v.id === view.id);
  if (i === -1) return [...views, view];
  const next = [...views];
  next[i] = view;
  return next;
}

/** Human summary of a filter set — for the switcher tooltip and the save dialog. */
export function describeFilters(filters: ViewFilters): string {
  const parts: string[] = [];
  if (filters.status?.length) parts.push(filters.status.join(", "));
  if (filters.risk?.length) parts.push(`risk: ${filters.risk.join("/")}`);
  if (filters.lastTouchDays !== undefined) parts.push(`silent ${filters.lastTouchDays}d+`);
  if (filters.hasOpenEscalation) parts.push("open escalation");
  if (filters.hasCareGap) parts.push("care gap");
  if (filters.location && filters.location !== "all") parts.push(filters.location);
  return parts.length ? parts.join(" · ") : "No filters — the whole book";
}
