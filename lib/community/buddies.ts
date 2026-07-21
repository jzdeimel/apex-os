"use client";

import { useCallback, useEffect, useState } from "react";
import { communityHandles, handleFor, isInCommunity } from "@/lib/mock/community";
import { getClient } from "@/lib/mock/clients";
import { levelFor } from "@/lib/play/levels";
import { seededRandom, absolute } from "@/lib/utils";

/**
 * Battle buddies — 1:1 accountability partners.
 *
 * The strongest retention mechanic in a health program is not a feature, it is
 * one other person who notices when you go quiet. This pairs each member with
 * one other member on a similar path, shows each of them the other's momentum,
 * and gives them one button — a nudge — for the moment someone's streak breaks.
 *
 * WHY IT IS SAFE
 * --------------
 * Everything here is handle-based (never a real name), and it only ever surfaces
 * a partner who is opted into community. A member sees their buddy's HANDLE,
 * their level, and a coarse "days since active" — never a dose, a lab, or a
 * diagnosis. The buddy's streak/activity is a deterministic community signal, not
 * a read of their private log. Nudges are encouragement, logged locally, capped
 * so this can never become harassment.
 *
 * The pairing is deterministic per member (same seed, same buddy), so it is
 * stable across sessions without a server; accepting the pairing and the nudges
 * sent persist in localStorage.
 */

const KEY = "apex_buddy_v1";
const NOW = "2026-06-12T09:00:00";

export interface Buddy {
  clientId: string;
  handle: string;
  level: number;
  title: string;
  /** Current logging streak, in days — a community signal, coarse by design. */
  streak: number;
  /** Days since they were last active in the app. */
  lastActiveDays: number;
  /** The goal they share with the viewer, in the viewer's own words. */
  sharedFocus: string;
  /** True when their streak just broke — the moment a nudge matters. */
  needsNudge: boolean;
}

const FOCI = ["Consistency", "Fat loss", "Strength", "Energy & sleep", "Staying on protocol"];

/**
 * The deterministic partner for a member: another opted-in member, preferring a
 * different person at the same location, chosen stably by seed.
 */
export function buddyFor(clientId: string): Buddy | null {
  if (!isInCommunity(clientId)) return null;
  const me = getClient(clientId);
  if (!me) return null;

  const pool = communityHandles.filter((h) => h.optedIn && h.clientId !== clientId);
  if (pool.length === 0) return null;

  const rand = seededRandom(`buddy:${clientId}`);
  // Prefer same location for the "you might actually meet" effect; fall back to
  // the whole pool.
  const sameLoc = pool.filter((h) => h.locationId === me.locationId);
  const chooseFrom = sameLoc.length ? sameLoc : pool;
  const partner = chooseFrom[Math.floor(rand() * chooseFrom.length)];

  const lvl = levelFor(partner.clientId);
  const pr = seededRandom(`buddystate:${partner.clientId}`);
  const streak = 1 + Math.floor(pr() * 40);
  const lastActiveDays = Math.floor(pr() * 5);

  return {
    clientId: partner.clientId,
    handle: partner.handle,
    level: lvl?.level ?? 1,
    title: lvl?.name ?? "Getting started",
    streak,
    lastActiveDays,
    sharedFocus: FOCI[Math.floor(rand() * FOCI.length)],
    needsNudge: lastActiveDays >= 3,
  };
}

/* -------------------------------------------------------------------------- */
/* Store                                                                       */
/* -------------------------------------------------------------------------- */

interface BuddyState {
  accepted: boolean;
  nudges: string[]; // ISO dates a nudge was sent
}

function read(): BuddyState {
  if (typeof window === "undefined") return { accepted: false, nudges: [] };
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as BuddyState) : { accepted: false, nudges: [] };
    return { accepted: !!parsed.accepted, nudges: Array.isArray(parsed.nudges) ? parsed.nudges : [] };
  } catch {
    return { accepted: false, nudges: [] };
  }
}

function write(next: BuddyState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("apex-buddy"));
  } catch {
    /* private mode */
  }
}

/** One nudge per buddy per day — encouragement, never a pile-on. */
export function nudgedToday(state: BuddyState): boolean {
  const today = NOW.slice(0, 10);
  return state.nudges.some((n) => n.slice(0, 10) === today);
}

export function useBuddy(clientId: string) {
  const [state, setState] = useState<BuddyState>({ accepted: false, nudges: [] });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const sync = () => {
      setState(read());
      setHydrated(true);
    };
    sync();
    window.addEventListener("apex-buddy", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("apex-buddy", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const buddy = buddyFor(clientId);

  const accept = useCallback(() => write({ ...read(), accepted: true }), []);
  const nudge = useCallback(() => {
    const cur = read();
    if (nudgedToday(cur)) return;
    write({ ...cur, nudges: [...cur.nudges, absolute(NOW).toISOString()] });
  }, []);

  return { buddy, accepted: state.accepted, nudgedToday: nudgedToday(state), hydrated, accept, nudge };
}
