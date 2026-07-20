"use client";

import { useEffect, useState } from "react";
import { appendLedger } from "@/lib/trace/ledger";
import { staffMap } from "@/lib/mock/staff";
import { getClient, clientName } from "@/lib/mock/clients";
import { absolute } from "@/lib/utils";
import type { StaffMember } from "@/lib/types";

/**
 * COACH REACTIONS ON MEMBER LOGS — the reaction ledger.
 *
 * WHY THIS EXISTS
 * ---------------
 * AUDIT FINDING (docs/audit/ENGAGEMENT.md, "Top 5 client mechanics" #4 —
 * "Coach reaction on a specific logged item"): rated the *cheapest large
 * retention win* in the whole product. Its words: "A named human responding to
 * your Tuesday entry beats any confetti, and it converts the journal from a
 * diary into a relationship."
 *
 * Before this, there was no mechanism at all. The member journal's Save toast
 * even claimed "Your coach can see this" while the handler did nothing but
 * `setSaved(true)` (docs/audit/ENGAGEMENT.md, friction #7). That lie was
 * removed; the capability it promised is built here.
 *
 * The loop this closes: the member logs → a real named coach reacts → the
 * member comes back to their journal to see whether they reacted. That return
 * visit is the retention the audit is pointing at.
 *
 * HYDRATION SAFETY — read this before changing how components read the store.
 * Same rule as lib/member/logStore.tsx: state starts EMPTY and localStorage is
 * read in an effect (`useReactionsForClient`), never during render. The server
 * has no storage, so seeding state from it at render time makes the first paint
 * disagree with the server's and React throws the #418/#425 mismatch class that
 * cost this codebase a fortnight. One frame of "no reactions yet" is the price;
 * a broken tree is the alternative.
 *
 * HONESTY. The member surface renders ONLY reactions that a coach actually
 * wrote — there is no seeding here and there must never be. An empty result is
 * the correct, honest answer ("your coach hasn't left a note yet"). The demo
 * shows the loop working because a coach leaves a real reaction in the same
 * session, not because one was faked.
 *
 * PERSISTENCE. localStorage is right for a demo and wrong for production — it is
 * per-device and disappears with site data. In production this is the
 * `LogReaction` row the audit specifies, written through lib/db/repo.ts and
 * chained into the same append-only ledger. The shape below is deliberately
 * ledger-friendly so that swap is a transport change, not a redesign: every
 * write already appends to the real ledger via `appendLedger`.
 */

export type ReactionTargetType = "checkin" | "weight" | "dose" | "day";
export type ReactionKind = "ack" | "note";

export interface Reaction {
  id: string;
  /** What the coach is reacting to. `day` is a reaction to the day as a whole. */
  targetType: ReactionTargetType;
  /** YYYY-MM-DD of the logged thing, in the clinic zone. */
  targetDate: string;
  /** The member whose log this concerns. */
  clientId: string;
  /** The coach who reacted. An id, never a display-name string — see ME_COACH. */
  staffId: string;
  kind: ReactionKind;
  /** Present on notes; absent on a bare acknowledgement. */
  body?: string;
  /** ISO instant. Pinned to the demo clock — nothing here reads the wall clock. */
  createdAt: string;
}

/**
 * v1 — client-scoped, exactly like `apex_member_log_v2` in logStore. Two coaches
 * (or a coach and a member) on one demo machine must not share a reaction thread.
 */
const KEY = "apex_coach_reactions_v1";

/** Pinned demo clock. Never `Date.now()` / `new Date()` — hydration + determinism. */
const NOW_ISO = "2026-06-12T09:00:00";

/**
 * One shared empty array for the pre-hydration frames. A fresh `[]` per render is
 * a new identity that walks through every downstream `useMemo` and re-renders on
 * every paint until the read effect lands — the same trap logStore documents.
 */
const EMPTY: Reaction[] = [];

function storageKeyFor(clientId: string): string {
  return `${KEY}:${clientId}`;
}

// ---------------------------------------------------------------------------
// Same-tab subscription. The coach reacts on one surface and the member reads
// on another; both live in the same browser. A module-scoped notifier lets the
// member's journal re-read the instant a coach writes, without threading a
// context above both trees (the same reasoning as `selectedMemberId` in
// components/portal/PortalHeader.tsx). Cross-TAB updates ride the native
// `storage` event, wired up in the hook below.
// ---------------------------------------------------------------------------
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function readRaw(clientId: string): Reaction[] {
  try {
    const raw = window.localStorage.getItem(storageKeyFor(clientId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Reaction[];
    // Stored in append (chronological) order; kept that way so a reader can
    // reverse for newest-first without a timestamp sort that ties on the pinned
    // clock.
    return Array.isArray(parsed) ? parsed.filter((r) => r && typeof r.id === "string") : [];
  } catch {
    // A corrupt or unavailable store must not take the page down with it.
    return [];
  }
}

/** Every reaction a coach has left for one member, oldest first. */
export function reactionsForClient(clientId: string): Reaction[] {
  return readRaw(clientId);
}

/** Reactions attached to one specific day of the member's log. */
export function reactionsForDay(clientId: string, date: string): Reaction[] {
  return readRaw(clientId).filter((r) => r.targetDate === date);
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export interface AddReactionInput {
  targetType: ReactionTargetType;
  targetDate: string;
  clientId: string;
  staffId: string;
  kind: ReactionKind;
  body?: string;
}

/**
 * Leave a reaction, and record it on the real ledger.
 *
 * IDEMPOTENT ON ACKS. A bare acknowledgement is a "seen", not a like — a coach
 * tapping "seen" twice on the same check-in must not stack two rows, because the
 * member journal is a calm men's-health surface, not a like-counter (the audit's
 * explicit tone constraint). A note, by contrast, is real content and always
 * appends: a coach can write more than one.
 *
 * The ledger append is not optional. In production the reaction row and its
 * audit row are one transaction; here `appendLedger` is an array push, but the
 * contract is identical — a reaction that cannot be recorded is not a reaction.
 * Entity is `note` because a coach reaction IS a note in the closed
 * `LedgerEntity` union — no new entity is invented (the union is fixed in
 * lib/trace/ledger.ts).
 */
export function addReaction(input: AddReactionInput): Reaction {
  const existing = readRaw(input.clientId);
  const body = input.body?.trim();

  if (input.kind === "ack") {
    const already = existing.find(
      (r) =>
        r.kind === "ack" &&
        r.staffId === input.staffId &&
        r.targetType === input.targetType &&
        r.targetDate === input.targetDate,
    );
    if (already) return already;
  }

  // Sequence from the stored length. It only ever grows within a session (no
  // deletes), and after a reload it is recomputed from what is stored, so the id
  // is unique without a random suffix that would break hydration determinism.
  const seq = existing.length + 1;
  const reaction: Reaction = {
    id: `rc-${input.clientId}-${seq}`,
    targetType: input.targetType,
    targetDate: input.targetDate,
    clientId: input.clientId,
    staffId: input.staffId,
    kind: input.kind,
    ...(input.kind === "note" && body ? { body } : {}),
    createdAt: NOW_ISO,
  };

  try {
    window.localStorage.setItem(
      storageKeyFor(input.clientId),
      JSON.stringify([...existing, reaction]),
    );
  } catch {
    /* private mode, quota — the append still notifies for this session */
  }

  const actor = staffMap[input.staffId] as StaffMember | undefined;
  const client = getClient(input.clientId);
  const noun = targetNoun(input.targetType);
  appendLedger({
    actorId: input.staffId,
    actorName: actor?.name ?? "Coach",
    actorRole: actor?.role ?? "Coach",
    // A reaction is a new artifact, so `create` — the same shape the ledger
    // already generates for authored notes (lib/trace/ledger.ts SHAPES).
    action: "create",
    entity: "note",
    entityId: reaction.id,
    subjectId: input.clientId,
    ...(client ? { subjectName: clientName(client), locationId: client.locationId } : {}),
    reason:
      input.kind === "ack"
        ? `${actor?.name ?? "Coach"} acknowledged ${client?.firstName ?? "the member"}'s ${noun} from ${input.targetDate} — "seen"`
        : `${actor?.name ?? "Coach"} left ${client?.firstName ?? "the member"} a note on their ${noun} (${input.targetDate})`,
  });

  notify();
  return reaction;
}

// ---------------------------------------------------------------------------
// Display helpers — one place so the coach and member surfaces agree
// ---------------------------------------------------------------------------

/**
 * A date-only `YYYY-MM-DD` rendered as its true clinic-calendar day.
 *
 * NOT `formatDateShort` — that renders in the clinic TIMEZONE, which shifts a
 * ZONELESS date-only string back a day (midnight-UTC reads as the prior Eastern
 * evening, so "2026-06-12" would display "Jun 11"). A reaction keys on the exact
 * day the member logged, and it must not claim the coach saw the wrong one. This
 * reads the date in UTC, matching the date-only convention the rest of the
 * journal already uses (`addDays`/`dayOfWeek` in lib/symptoms/journal.ts use the
 * UTC getters).
 */
export function formatTargetDate(date: string): string {
  return absolute(date).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

/** How a target reads in a sentence: "saw your check-in". */
export function targetNoun(type: ReactionTargetType): string {
  switch (type) {
    case "checkin":
      return "check-in";
    case "weight":
      return "weight";
    case "dose":
      return "doses";
    case "day":
      return "day";
  }
}

/**
 * The warm, human name the member sees — "Coach Tyler", not "st-005".
 *
 * Derived from the id at read time so a coach who changes their name renames
 * nowhere: the id is the join, the name is a lookup. (The system Apex replaces
 * joins on the name string in ~110 places, which is why a marriage renames 40
 * charts — see ME_COACH.)
 */
export function reactorLabel(staffId: string): string {
  const actor = staffMap[staffId] as StaffMember | undefined;
  if (!actor) return "Your coach";
  const first = actor.name.split(" ")[0];
  return actor.role === "Coach" ? `Coach ${first}` : actor.name;
}

// ---------------------------------------------------------------------------
// Hydration-safe reactive read
// ---------------------------------------------------------------------------

/**
 * Read one member's reactions, live.
 *
 * Follows logStore's owner-guard pattern exactly: state carries WHOSE reactions
 * it holds, and until the owner matches `clientId` the read is EMPTY — the
 * honest answer to "what has this coach left" on the first paint and on the
 * commit right after the subject switches. Subscribes to same-tab writes and to
 * the native `storage` event so the member's journal updates the moment a coach
 * reacts, in either tab.
 */
export function useReactionsForClient(clientId: string): {
  reactions: Reaction[];
  hydrated: boolean;
} {
  const [state, setState] = useState<{ owner: string | null; reactions: Reaction[] }>({
    owner: null,
    reactions: [],
  });

  useEffect(() => {
    const read = () => setState({ owner: clientId, reactions: readRaw(clientId) });
    read();
    listeners.add(read);
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === storageKeyFor(clientId)) read();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(read);
      window.removeEventListener("storage", onStorage);
    };
  }, [clientId]);

  const hydrated = state.owner === clientId;
  return { reactions: hydrated ? state.reactions : EMPTY, hydrated };
}
