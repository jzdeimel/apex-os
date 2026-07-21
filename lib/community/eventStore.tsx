"use client";

import { useCallback, useEffect, useState } from "react";
import type { EventKind, Meetup } from "@/lib/community/types";
import { meetups as seededMeetups } from "@/lib/mock/community";

/**
 * Community events — created events + RSVPs, member-controlled.
 *
 * The seeded meetups are the clinic's official events. This adds the two things
 * the community aspect was missing: members and staff CREATING their own events
 * (a Saturday hike, a meal-prep night, an ask-me-anything with a coach), and
 * RSVPs that STICK. Both live in localStorage, hydration-safe on the same terms
 * as the member log — start empty, read in an effect, never during render, so
 * the server and the first client paint agree.
 *
 * HONESTY, AS EVERYWHERE
 * ----------------------
 * Client-side over localStorage at this stage. A created event is real to the
 * member's own device and would move to a `community_event` table the same way
 * the write paths did; the RSVP count shown is the seeded base plus this
 * member's own tap, not a fabricated crowd. Nothing invents attendees.
 */

const KEY = "apex_events_v1";

interface Persisted {
  created: Meetup[];
  rsvps: string[]; // event ids this member is going to
}

function read(): Persisted {
  if (typeof window === "undefined") return { created: [], rsvps: [] };
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Persisted) : { created: [], rsvps: [] };
    return {
      created: Array.isArray(parsed.created) ? parsed.created : [],
      rsvps: Array.isArray(parsed.rsvps) ? parsed.rsvps : [],
    };
  } catch {
    return { created: [], rsvps: [] };
  }
}

function write(next: Persisted) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("apex-events"));
  } catch {
    /* private mode / quota */
  }
}

export interface NewEventInput {
  title: string;
  kind: EventKind;
  locationId: Meetup["locationId"];
  startsAt: string; // ISO
  durationMin: number;
  capacity: number;
  blurb: string;
  description?: string;
  virtual?: boolean;
  hostStaffId: string;
  createdBy: string;
}

export interface EventsApi {
  /** Seeded + created, soonest first. */
  events: Meetup[];
  hydrated: boolean;
  isGoing: (eventId: string) => boolean;
  /** Displayed attendee count: the event's base RSVPs plus this member if going. */
  goingCount: (event: Meetup) => number;
  isFull: (event: Meetup) => boolean;
  toggleRsvp: (eventId: string) => void;
  createEvent: (input: NewEventInput) => Meetup;
}

/**
 * Reactive events for the current member. `nowIso` is the pinned demo clock so
 * "upcoming" is deterministic and past events fall off honestly.
 */
export function useEvents(nowIso: string): EventsApi {
  const [state, setState] = useState<Persisted>({ created: [], rsvps: [] });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const sync = () => {
      setState(read());
      setHydrated(true);
    };
    sync();
    window.addEventListener("apex-events", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("apex-events", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const nowMs = new Date(nowIso).getTime();

  const all = [...seededMeetups, ...state.created]
    .filter((e) => new Date(e.startsAt).getTime() > nowMs - 2 * 3_600_000) // keep just-started
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const isGoing = useCallback((eventId: string) => state.rsvps.includes(eventId), [state.rsvps]);

  const goingCount = useCallback(
    (event: Meetup) => event.rsvps + (state.rsvps.includes(event.id) ? 1 : 0),
    [state.rsvps],
  );

  const isFull = useCallback(
    (event: Meetup) => goingCount(event) >= event.capacity && !state.rsvps.includes(event.id),
    [goingCount, state.rsvps],
  );

  const toggleRsvp = useCallback((eventId: string) => {
    const cur = read();
    const going = cur.rsvps.includes(eventId);
    const next = {
      ...cur,
      rsvps: going ? cur.rsvps.filter((id) => id !== eventId) : [...cur.rsvps, eventId],
    };
    write(next);
  }, []);

  const createEvent = useCallback((input: NewEventInput): Meetup => {
    const cur = read();
    const id = `evt-${input.startsAt.slice(0, 10)}-${cur.created.length + 1}-${Math.abs(hashStr(input.title)) % 1000}`;
    const event: Meetup = {
      id,
      locationId: input.locationId,
      title: input.title,
      blurb: input.blurb,
      description: input.description,
      startsAt: input.startsAt,
      durationMin: input.durationMin,
      hostStaffId: input.hostStaffId,
      capacity: input.capacity,
      rsvps: 0,
      kind: input.kind,
      virtual: input.virtual,
      createdBy: input.createdBy,
      createdAt: nowIso,
    };
    // The creator is going by default.
    write({ created: [...cur.created, event], rsvps: [...new Set([...cur.rsvps, id])] });
    return event;
  }, [nowIso]);

  return { events: all, hydrated, isGoing, goingCount, isFull, toggleRsvp, createEvent };
}

/** Deterministic small hash for id suffixes (no Math.random in this codebase). */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
