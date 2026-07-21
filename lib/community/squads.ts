"use client";

import { useCallback, useEffect, useState } from "react";
import { communityHandles, handleFor } from "@/lib/mock/community";
import { seededRandom, absolute } from "@/lib/utils";

/**
 * Squads — member-formed small groups.
 *
 * Between the 1:1 of a battle buddy and the anonymity of the whole clinic sits
 * the unit that actually holds people: a small group around a shared goal. A guy
 * on his first testosterone cycle has more in common with five other first-cycle
 * guys than with the whole community, and he'll say things in that group he won't
 * say anywhere else. Squads are those rooms.
 *
 * Handle-based, opt-in. A squad has a focus, a rolling challenge, and members who
 * appear as handles. Joining persists locally; the seeded membership and thread
 * give each squad a pulse so it isn't an empty room.
 */

const KEY = "apex_squads_v1";
const NOW = "2026-06-12T09:00:00";
const NOW_MS = absolute(NOW).getTime();
const DAY = 86_400_000;

export type SquadIcon = "cycle" | "cut" | "over40" | "strength" | "peptide";

export interface SquadPost {
  handle: string;
  body: string;
  atDaysAgo: number;
}

export interface Squad {
  id: string;
  name: string;
  tagline: string;
  icon: SquadIcon;
  memberClientIds: string[];
  challenge: { title: string; detail: string; pct: number };
  thread: SquadPost[];
}

const SQUAD_DEFS: Omit<Squad, "memberClientIds">[] = [
  {
    id: "sq-first-cycle",
    name: "First Cycle",
    tagline: "New to testosterone therapy. The honest questions, answered by people a few months ahead.",
    icon: "cycle",
    challenge: { title: "Log every dose for 30 days", detail: "The habit that makes the first three months work.", pct: 68 },
    thread: [
      { handle: "IronOak42", body: "Week 3 and the morning fog is genuinely lifting. Anyone else?", atDaysAgo: 1 },
      { handle: "NorthPine19", body: "Rotate your sites — took me a month to figure out why one delt was sore constantly.", atDaysAgo: 2 },
    ],
  },
  {
    id: "sq-fat-loss",
    name: "The Cut",
    tagline: "Fat loss without losing the muscle. Meal prep, macros, and the grind.",
    icon: "cut",
    challenge: { title: "10,000 steps a day, as a group", detail: "Everyone's steps into one pool.", pct: 82 },
    thread: [
      { handle: "RiverStone7", body: "Down 8 lbs, and more importantly the scale isn't ruining my mornings anymore.", atDaysAgo: 1 },
      { handle: "BlueRidge88", body: "Overnight oats recipe in the meal thread changed my life, no notes.", atDaysAgo: 4 },
    ],
  },
  {
    id: "sq-over-40",
    name: "Over 40",
    tagline: "Different recovery, different priorities. Training and health for the long game.",
    icon: "over40",
    challenge: { title: "Two mobility sessions a week", detail: "The unglamorous work that keeps you training.", pct: 55 },
    thread: [{ handle: "GraniteFox", body: "Sleep score up 20% since we started prioritizing it. Everything downstream got easier.", atDaysAgo: 3 }],
  },
  {
    id: "sq-strength",
    name: "Strength",
    tagline: "PRs, programming, and picking heavy things up. All levels.",
    icon: "strength",
    challenge: { title: "Everyone adds 5% to one lift", detail: "Squad total goes up together.", pct: 74 },
    thread: [{ handle: "SteelCreek", body: "Finally pulled 405. Two years ago I couldn't do bodyweight. This community is a big part of it.", atDaysAgo: 2 }],
  },
  {
    id: "sq-peptides",
    name: "Peptide Curious",
    tagline: "Making sense of BPC, ipamorelin, and the rest — with the clinic keeping it honest.",
    icon: "peptide",
    challenge: { title: "Learn the reconstitution math", detail: "Nobody 10x's a dose in this squad.", pct: 61 },
    thread: [{ handle: "CedarWolf", body: "The mixing calculator in the app finally made units click for me.", atDaysAgo: 5 }],
  },
];

/** Deterministic membership drawn from the opted-in pool. */
function membersFor(squadId: string, count: number): string[] {
  const rand = seededRandom(`squad:${squadId}`);
  const pool = communityHandles.filter((h) => h.optedIn).map((h) => h.clientId);
  const picked: string[] = [];
  const used = new Set<number>();
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    let idx = Math.floor(rand() * pool.length);
    let guard = 0;
    while (used.has(idx) && guard++ < pool.length) idx = (idx + 1) % pool.length;
    used.add(idx);
    picked.push(pool[idx]);
  }
  return picked;
}

export const squads: Squad[] = SQUAD_DEFS.map((d, i) => ({
  ...d,
  memberClientIds: membersFor(d.id, 6 + (i % 3) * 2),
}));

/* -------------------------------------------------------------------------- */
/* Store                                                                       */
/* -------------------------------------------------------------------------- */

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function write(ids: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
    window.dispatchEvent(new Event("apex-squads"));
  } catch {
    /* private mode */
  }
}

export function postTime(daysAgo: number): string {
  return absolute(NOW_MS - daysAgo * DAY).toISOString();
}
export { handleFor };

export function useSquads() {
  const [joined, setJoined] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const sync = () => {
      setJoined(read());
      setHydrated(true);
    };
    sync();
    window.addEventListener("apex-squads", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("apex-squads", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const isJoined = useCallback((id: string) => joined.includes(id), [joined]);
  const toggle = useCallback((id: string) => {
    const cur = read();
    write(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }, []);

  return { squads, joined, isJoined, toggle, hydrated };
}
