"use client";

import { useCallback, useEffect, useState } from "react";
import { seededRandom } from "@/lib/utils";

/**
 * Kudos — the encouragement economy.
 *
 * A one-tap way to tell another member "I see that, well done" — on a milestone,
 * a win, a squad post. It is the smallest possible unit of community warmth, and
 * the cheapest thing a product can do to make a place feel populated by people
 * rather than by content. Seeded base counts give every item a plausible crowd;
 * this member's own kudos are added on top and persist locally.
 */

const KEY = "apex_kudos_v1";

function readGiven(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeGiven(ids: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
    window.dispatchEvent(new Event("apex-kudos"));
  } catch {
    /* private mode */
  }
}

/** A stable, plausible base count for any item, so nothing starts at zero. */
export function baseKudos(itemId: string): number {
  const rand = seededRandom(`kudos:${itemId}`);
  return 2 + Math.floor(rand() * 22);
}

export function useKudos() {
  const [given, setGiven] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const sync = () => {
      setGiven(readGiven());
      setHydrated(true);
    };
    sync();
    window.addEventListener("apex-kudos", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("apex-kudos", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const hasGiven = useCallback((itemId: string) => given.includes(itemId), [given]);
  const countFor = useCallback(
    (itemId: string) => baseKudos(itemId) + (given.includes(itemId) ? 1 : 0),
    [given],
  );
  const give = useCallback((itemId: string) => {
    const cur = readGiven();
    if (cur.includes(itemId)) return;
    writeGiven([...cur, itemId]);
  }, []);

  return { hydrated, hasGiven, countFor, give };
}
