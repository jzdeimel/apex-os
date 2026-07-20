"use client";

import * as React from "react";
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

/** The five clinics, in the order the desk switcher shows them. */
export const DESK_LOCATIONS: LocationId[] = [
  "raleigh",
  "raleigh-boutique",
  "southern-pines",
  "myrtle-beach",
  "telehealth",
];
