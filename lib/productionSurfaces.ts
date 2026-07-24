/**
 * Routes that still depend on seeded, browser-only, scripted, or illustrative
 * state and therefore must never be presented as operational in a shared Apex
 * environment.
 *
 * This is intentionally a closed list. Removing a route from it is a release
 * decision: the route must have an authoritative read model, durable writes,
 * server-side authorization, and an acceptance test first.
 *
 * Exact paths are used where a sibling route is authoritative. Prefixes are
 * reserved for feature families where every descendant shares the same
 * non-authoritative dependency.
 */
const FIXTURE_ONLY_EXACT_PATHS = new Set([
  "/admin/daily-report",
  "/admin/effectiveness",
  "/analytics",
  "/automations",
  "/demo",
  "/desk/community",
  "/exec/capacity",
  "/insights",
  "/clinic/community",
  "/clinic/coverage",
  "/coach/handoff",
  "/coach/order",
  "/recommendations",
  "/settings",
  "/swarm",
]);

const FIXTURE_ONLY_PREFIXES = [
  "/agent",
  "/card",
  "/admin/broadcast",
  "/admin/capacity",
  "/admin/incidents",
  "/admin/quality",
  "/admin/roster",
  "/clinic/controlled",
  "/clinic/lab-draws",
  "/clinic/ledger",
  "/clinic/population",
  "/coach/consults",
  "/coach/gaps",
  "/coach/orders",
  "/coach/roster",
  "/desk/walk-in",
  "/coach/documents",
  "/coach/subscriptions",
  "/coach/training",
  "/coach/winback",
  "/portal",
] as const;

/** The parent is authoritative, but legacy descendants still carry demo data. */
const FIXTURE_ONLY_DESCENDANTS = ["/intake"] as const;

/**
 * Retired API contracts that still execute fixture or browser-era workflows.
 *
 * API routes are not protected by the page redirect list. Keeping this
 * separate makes the boundary explicit and lets middleware return JSON instead
 * of redirecting a fetch to an HTML page.
 */
const FIXTURE_ONLY_API_EXACT_PATHS = new Set([
  "/api/audit",
  "/api/consults/sign",
  "/api/member/log",
  "/api/tasks/complete",
]);

function normalizedPath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  const withoutQuery = pathname.split(/[?#]/, 1)[0] || "/";
  return withoutQuery.length > 1
    ? withoutQuery.replace(/\/+$/, "")
    : withoutQuery;
}

export function isFixtureOnlyPath(pathname: string): boolean {
  const path = normalizedPath(pathname);
  if (FIXTURE_ONLY_EXACT_PATHS.has(path)) return true;
  if (FIXTURE_ONLY_DESCENDANTS.some((prefix) => path.startsWith(`${prefix}/`))) {
    return true;
  }
  return FIXTURE_ONLY_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function isFixtureOnlyApiPath(pathname: string): boolean {
  return FIXTURE_ONLY_API_EXACT_PATHS.has(normalizedPath(pathname));
}

export const fixtureOnlyPaths = {
  exact: [...FIXTURE_ONLY_EXACT_PATHS],
  prefixes: [...FIXTURE_ONLY_PREFIXES],
  descendants: [...FIXTURE_ONLY_DESCENDANTS],
  apiExact: [...FIXTURE_ONLY_API_EXACT_PATHS],
} as const;
