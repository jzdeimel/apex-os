"use client";

import * as React from "react";
import { scopeFor, ALL_LOCATIONS } from "@/lib/frontdesk/scope";
import type { LocationId } from "@/lib/types";
import { deskDay, dayCountsByLocation, type DeskDay, type DeskScope } from "@/lib/frontdesk/day";
import { encounterVersion, subscribeEncounters } from "@/lib/frontdesk/encounters";
import { useDeskNow } from "@/lib/frontdesk/clock";

/**
 * React bindings for the desk.
 *
 * Two external stores feed this persona — the encounter journal and the desk
 * clock — and neither belongs in React state: the journal is written from event
 * handlers on several surfaces and the clock ticks on an interval. Both are
 * subscribed to rather than copied, so /desk and /desk/book cannot drift apart.
 *
 * The scope (which site the board is showing) lives at module scope for the
 * same reason: a front-desk person who taps through to book a caller and comes
 * back must land on their own clinic, not on whatever the default was.
 */

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

/**
 * Raleigh is the flagship and the default, NOT "all sites".
 *
 * A front desk belongs to one building. The all-sites view is real and useful
 * — multi-site ops covers every counter — but opening on it would show a person
 * standing at the Raleigh counter four other clinics' patients, which is
 * exactly the class of mistake `components/coach/TodayQueue.tsx` describes when
 * a coach ends up calling somebody else's member.
 */
const DEFAULT_SCOPE: DeskScope = "raleigh";

let scope: DeskScope = DEFAULT_SCOPE;
const scopeListeners = new Set<() => void>();

function getScope(): DeskScope {
  return scope;
}

/** SSR renders the default so the first client paint matches byte for byte. */
function getScopeServer(): DeskScope {
  return DEFAULT_SCOPE;
}

export function setDeskScope(next: DeskScope) {
  scope = next;
  for (const fn of scopeListeners) fn();
}

function subscribeScope(fn: () => void): () => void {
  scopeListeners.add(fn);
  return () => scopeListeners.delete(fn);
}

export function useDeskScope(): [DeskScope, (next: DeskScope) => void] {
  const current = React.useSyncExternalStore(subscribeScope, getScope, getScopeServer);
  return [current, setDeskScope];
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

/** Version counter for the encounter journal. Re-renders every desk surface. */
export function useEncounterVersion(): number {
  return React.useSyncExternalStore(
    subscribeEncounters,
    encounterVersion,
    // The journal is always empty on the server — nothing has been recorded
    // yet — so zero is not a placeholder, it is the correct answer.
    () => 0,
  );
}

export function useDeskDay(): { day: DeskDay; now: string; scope: DeskScope } {
  const [scopeValue] = useDeskScope();
  const now = useDeskNow();
  const version = useEncounterVersion();

  const day = React.useMemo(
    () => deskDay(scopeValue, now),
    // `version` is the dependency that matters and it is deliberately unused in
    // the body — it exists so an append to the journal rebuilds the board.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeValue, now, version],
  );

  return { day, now, scope: scopeValue };
}

export function useDayCounts(): Record<string, { total: number; here: number }> {
  const version = useEncounterVersion();
  const now = useDeskNow();
  return React.useMemo(
    () => dayCountsByLocation(now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [now, version],
  );
}

/**
 * The locations THIS DESK may see, in switcher order.
 *
 * This was a flat list of all five sites, so reception at Myrtle Beach could
 * page through the Raleigh day board. Alpha Health runs four clinics with their
 * own front desks and that is a minimum-necessary access boundary, not a
 * preference. It now derives from the signed-in staff member's own
 * `locationIds` — see lib/frontdesk/scope.ts, which also records why ownership
 * is the deliberate exception and how far a client-side scope actually goes.
 */
export function deskLocations(staffId: string | null): LocationId[] {
  return scopeFor(staffId).allowed;
}

/**
 * Kept as the ALL-sites list for surfaces that are legitimately cross-location
 * (the owner console). Named so nobody reaches for it by accident at a desk.
 */
export const ALL_CLINIC_LOCATIONS: LocationId[] = ALL_LOCATIONS;
