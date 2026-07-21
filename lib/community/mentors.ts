"use client";

import { useCallback, useEffect, useState } from "react";
import { communityHandles, handleFor, isInCommunity } from "@/lib/mock/community";
import { prescriptionsForClient } from "@/lib/dosing/prescriptions";
import { levelFor } from "@/lib/play/levels";
import { seededRandom, absolute } from "@/lib/utils";

/**
 * Mentors / guides.
 *
 * The most reassuring voice for a man white-knuckling his first testosterone
 * cycle is not the clinic — it is another member who was exactly that anxious six
 * months ago and is fine now. Guides are experienced members who opt in to be
 * that voice. A newcomer requests one; the match is by what they need.
 *
 * A guide is never a substitute for the clinician — the guard elsewhere still
 * routes anything clinical to the provider — they are a companion for the parts
 * that are lonely rather than medical.
 */

const KEY = "apex_mentor_v1";
const NOW = "2026-06-12T09:00:00";
const NOW_MS = absolute(NOW).getTime();

export type Specialty = "first-cycle" | "weight-loss" | "training" | "over-40" | "peptides";

export const SPECIALTY_LABEL: Record<Specialty, string> = {
  "first-cycle": "First-cycle nerves",
  "weight-loss": "Weight loss that sticks",
  training: "Training & the gym",
  "over-40": "Doing this after 40",
  peptides: "Peptides, demystified",
};

export interface Guide {
  clientId: string;
  handle: string;
  level: number;
  title: string;
  monthsIn: number;
  specialty: Specialty;
  note: string;
}

const SPECS: Specialty[] = ["first-cycle", "weight-loss", "training", "over-40", "peptides"];
const NOTES = [
  "Was where you are. Ask me anything, no question is stupid.",
  "Happy to walk you through the first few weeks.",
  "I overthought all of this. Let me save you the spiral.",
  "Here for the boring consistency stuff that actually works.",
  "Been at this a while — glad to share what I'd do differently.",
];

/** Months a member has been on protocol, from their earliest signed script. */
function monthsOnProtocol(clientId: string): number {
  const rxs = prescriptionsForClient(clientId);
  if (rxs.length === 0) return 0;
  const start = Math.min(...rxs.map((r) => absolute(r.signedAt).getTime()));
  return Math.floor((NOW_MS - start) / (30 * 86_400_000));
}

/** The available guides: experienced, opted-in members. Deterministic. */
export function guides(): Guide[] {
  const out: Guide[] = [];
  for (const h of communityHandles) {
    if (!h.optedIn) continue;
    const lvl = levelFor(h.clientId);
    const months = monthsOnProtocol(h.clientId);
    // A guide has some real time in and some level — enough to have perspective.
    if ((lvl?.level ?? 0) < 3 && months < 3) continue;
    const rand = seededRandom(`guide:${h.clientId}`);
    if (rand() > 0.5) continue; // not everyone volunteers
    out.push({
      clientId: h.clientId,
      handle: h.handle,
      level: lvl?.level ?? 3,
      title: lvl?.name ?? "Established",
      monthsIn: Math.max(months, 2 + Math.floor(rand() * 10)),
      specialty: SPECS[Math.floor(rand() * SPECS.length)],
      note: NOTES[Math.floor(rand() * NOTES.length)],
    });
  }
  return out.sort((a, b) => b.monthsIn - a.monthsIn).slice(0, 8);
}

/** Is this member experienced enough to be offered the "become a guide" path? */
export function canBeGuide(clientId: string): boolean {
  const lvl = levelFor(clientId);
  return (lvl?.level ?? 0) >= 4 || monthsOnProtocol(clientId) >= 6;
}

/* -------------------------------------------------------------------------- */
/* Store                                                                       */
/* -------------------------------------------------------------------------- */

interface MentorState {
  requestedGuideId: string | null;
  volunteering: boolean;
}

function read(): MentorState {
  if (typeof window === "undefined") return { requestedGuideId: null, volunteering: false };
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as MentorState) : { requestedGuideId: null, volunteering: false };
    return { requestedGuideId: parsed.requestedGuideId ?? null, volunteering: !!parsed.volunteering };
  } catch {
    return { requestedGuideId: null, volunteering: false };
  }
}
function write(next: MentorState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("apex-mentor"));
  } catch {
    /* private mode */
  }
}

export function useMentors(clientId: string) {
  const [state, setState] = useState<MentorState>({ requestedGuideId: null, volunteering: false });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const sync = () => {
      setState(read());
      setHydrated(true);
    };
    sync();
    window.addEventListener("apex-mentor", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("apex-mentor", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const available = isInCommunity(clientId) ? guides().filter((g) => g.clientId !== clientId) : [];

  const requestGuide = useCallback((guideId: string) => write({ ...read(), requestedGuideId: guideId }), []);
  const cancelRequest = useCallback(() => write({ ...read(), requestedGuideId: null }), []);
  const toggleVolunteer = useCallback(() => {
    const cur = read();
    write({ ...cur, volunteering: !cur.volunteering });
  }, []);

  return {
    guides: available,
    requestedGuideId: state.requestedGuideId,
    volunteering: state.volunteering,
    canBeGuide: canBeGuide(clientId),
    hydrated,
    requestGuide,
    cancelRequest,
    toggleVolunteer,
  };
}
