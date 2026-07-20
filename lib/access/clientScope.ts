import type { Client, LocationId } from "@/lib/types";
import { clients } from "@/lib/mock/clients";
import { PERSONAS, VIEWER } from "@/lib/viewer";
import { scopeFor } from "@/lib/frontdesk/scope";
import type { PortalId } from "@/lib/portals";

/**
 * Which CLIENTS a staff member may see.
 *
 * WHY THIS EXISTS
 * ---------------
 * The location boundary was closed for the front desk's day board, but the
 * chart and roster surfaces reach clients directly, and there the boundary was
 * open: `app/clients/page.tsx` starts from the full `clients` array filtered
 * only by a topbar location filter that DEFAULTS TO "all", and the coach roster
 * has a "wide" view that lists every client in the clinic. So a coach or a
 * clinician at any location could open every patient at every location.
 *
 * The rule Alpha Health actually runs on: staff see the patients at the
 * location(s) they are assigned to. That is minimum-necessary access, and it is
 * the same principle as the desk scope — a patient's home clinic
 * (`Client.locationId`) against a staff member's assignment (`Staff.locationIds`).
 *
 * OWNERSHIP IS THE EXCEPTION, DELIBERATELY. Comparing sites and holding the
 * whole book is the owner's job, so the owner sees every client. That decision
 * is made here, once, by identity — not by an unfiltered default that happens
 * to show everything.
 *
 * "ALL LOCATIONS" NOW MEANS "ALL I MAY SEE". The topbar location filter still
 * offers "all", but its pool is this scoped set, so a Raleigh coach choosing
 * "all" sees Raleigh — not the clinic. The filter narrows within the boundary;
 * it can never cross it.
 *
 * HOW FAR THIS GOES, HONESTLY
 * ---------------------------
 * Client-side scope over seeded data. It shapes what the interface offers, not
 * what the process can reach — every page is a client component reading
 * lib/mock/**, so a determined user with devtools still holds the seeded array.
 * Real enforcement is the location predicate living in the server query so an
 * out-of-scope row never reaches the browser. `visibleClientsFor` takes a staff
 * id precisely so that swap is mechanical: the server passes the authenticated
 * principal's staffId (lib/auth/principal.ts) and the same function answers.
 */

/**
 * The staff id sitting behind a portal.
 *
 * Resolved from the persona list, which names a real staff record per seat.
 * When staff identity moves fully behind Entra this becomes the authenticated
 * principal's staffId and nothing downstream changes. Returns null for the
 * patient portal, which is not staff and has no client-roster reach at all.
 */
export function staffIdForPortal(portalId: PortalId): string | null {
  if (portalId === "patient") return null;
  if (portalId === "exec") return VIEWER.id; // owner console
  return PERSONAS.find((p) => p.id === portalId)?.asId ?? null;
}

/**
 * The clients a staff member may see, pre-filtered by location.
 *
 * A staff member with no location assignment sees nothing. Falling back to the
 * full book here would reproduce the exact leak this module closes, for the
 * least-identified user — the same failure the desk scope avoids.
 */
export function visibleClientsFor(staffId: string | null): Client[] {
  const scope = scopeFor(staffId);
  if (scope.unrestricted) return clients;
  if (scope.allowed.length === 0) return [];
  const allowed = new Set<LocationId>(scope.allowed);
  return clients.filter((c) => allowed.has(c.locationId));
}

/** Convenience for a portal context that has the id but not the staff id. */
export function visibleClientsForPortal(portalId: PortalId): Client[] {
  return visibleClientsFor(staffIdForPortal(portalId));
}

/**
 * May this staff member open THIS client's chart.
 *
 * The gate for /clients/[id]. A direct URL to an out-of-location patient must
 * refuse rather than render — a boundary that only filters lists but renders
 * any chart by id is not a boundary, it is a speed bump.
 */
export function canViewClient(staffId: string | null, clientId: string): boolean {
  const scope = scopeFor(staffId);
  if (scope.unrestricted) return true;
  const c = clients.find((x) => x.id === clientId);
  if (!c) return false;
  return scope.allowed.includes(c.locationId);
}

/** The set of visible client ids, for callers that filter their own data. */
export function visibleClientIdSet(staffId: string | null): Set<string> {
  return new Set(visibleClientsFor(staffId).map((c) => c.id));
}
