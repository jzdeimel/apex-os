import type { Client } from "@/lib/types";
import { PROTECTED_REASONS } from "@/lib/daily/today";
import { ordersForClient } from "@/lib/mock/orders";
import { locationMap } from "@/lib/mock/locations";
import { appendLedger } from "@/lib/trace/ledger";

/**
 * TRAVEL MODE.
 *
 * A member goes away for eleven days. Without this feature the product spends
 * those eleven days getting it wrong in three directions at once: it pings them
 * at 7am local-minus-six about a protocol item, it ships a temperature-sensitive
 * refill to a doorstep nobody is standing behind, and it breaks a 47-day streak
 * they had been quietly proud of. Then it welcomes them home with a red number.
 *
 * The design principle, and it is the whole file: **a member should be able to
 * step away without the product punishing them.** Adherence software that
 * penalises a holiday teaches people to stop telling it the truth, and a member
 * who has stopped telling the truth is a member whose data is now worthless to
 * their provider. The streak is the cheapest possible thing to protect and the
 * most expensive possible thing to have taken.
 *
 * ── The line this feature does not cross ─────────────────────────────────────
 * Travel mode pauses NOTIFICATIONS and SHIPMENTS. It does not pause a protocol,
 * because a protocol is a clinical instruction from a licensed provider and a
 * date range typed into a phone does not amend one. Nothing in this file tells
 * a member to skip, hold, delay, split or resume anything they were prescribed
 * — that is a conversation with their care team, and the returned impact says
 * so in as many words. The distinction is not pedantry: a travel toggle that
 * reads as "pause my treatment" is a product giving medical direction.
 *
 * ── Honouring lib/daily/today.ts ─────────────────────────────────────────────
 * `PROTECTED_REASONS` already contains "Travel — coach approved", and
 * `Streak.protectedDays` already counts held days separately from closed ones.
 * This module does not invent a parallel mechanism; it produces exactly that
 * reason string, so a travel day lands in the existing protected bucket and the
 * streak calendar renders it as held rather than missed.
 */

const NOW = "2026-06-12T09:00:00";
const TODAY = NOW.slice(0, 10);

/** The reason a travel day is held. Typed against the daily engine's own union. */
export const TRAVEL_PROTECTED_REASON: (typeof PROTECTED_REASONS)[number] = "Travel — coach approved";

export interface TravelWindow {
  id: string;
  clientId: string;
  /** yyyy-mm-dd, inclusive. */
  from: string;
  to: string;
  /** "Austin, TX" — free text, member's own words. */
  destinationLabel: string;
  /**
   * Two-letter state. Feeds the telehealth licensure filter in
   * lib/booking/availability.ts — which is the honest reason we ask, and the
   * reason the UI explains the question rather than just presenting a field.
   */
  state: string;
  createdAt: string;
  status: "Scheduled" | "Active" | "Ended";
}

export interface TravelEffect {
  label: string;
  detail: string;
}

export interface TravelImpact {
  window: TravelWindow;
  days: number;
  /** What goes quiet. */
  pauses: TravelEffect[];
  /** What deliberately does not. */
  continues: TravelEffect[];
  /** Orders that will be held rather than shipped into an empty house. */
  heldShipments: { id: string; label: string; detail: string }[];
  /** Normal service resumes on this date. */
  resumesOn: string;
  /** Always true. The reason the feature exists. */
  streakProtected: true;
  protectedReason: string;
  /** One sentence about telehealth while away. */
  telehealthNote: string;
  /** The clinical boundary, rendered verbatim. Not paraphrased by any surface. */
  clinicalBoundary: string;
}

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------

const windows: TravelWindow[] = [];

export function travelFor(clientId: string): TravelWindow | null {
  return (
    windows
      .filter((w) => w.clientId === clientId && w.status !== "Ended")
      .sort((a, b) => a.from.localeCompare(b.from))[0] ?? null
  );
}

export function isTravellingOn(clientId: string, date: string): boolean {
  const w = travelFor(clientId);
  return !!w && date >= w.from && date <= w.to;
}

// ---------------------------------------------------------------------------
// Impact
// ---------------------------------------------------------------------------

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayCount(from: string, to: string): number {
  return Math.max(
    1,
    Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000) + 1,
  );
}

/**
 * Preview the effect of a window WITHOUT committing to it.
 *
 * Pure. The screen shows this before the member turns anything on, because a
 * toggle whose consequences are only discoverable by pulling it is not a choice
 * the member has actually made.
 */
export function planTravel(client: Client, from: string, to: string, destinationLabel: string, state: string): TravelImpact {
  const window: TravelWindow = {
    id: `trv-${client.id}-${from}`,
    clientId: client.id,
    from,
    to,
    destinationLabel: destinationLabel.trim() || "Away",
    state: state.trim().toUpperCase(),
    createdAt: NOW,
    status: from <= TODAY ? "Active" : "Scheduled",
  };

  const homeState = locationMap[client.locationId]?.state ?? "NC";
  const sameState = window.state === homeState;

  // Anything already out for delivery is past the point of holding — claiming
  // otherwise would be a promise the warehouse cannot keep.
  const HOLDABLE = new Set(["Draft", "Submitted", "Accepted", "Picking", "QC hold", "Packed", "Label created"]);
  const heldShipments = ordersForClient(client.id)
    .filter((o) => o.visibleToClient !== false && HOLDABLE.has(o.status))
    .slice(0, 3)
    .map((o) => ({
      id: o.id,
      label: o.lines[0]
        ? `${o.lines[0].name}${o.lines.length > 1 ? ` +${o.lines.length - 1} more` : ""}`
        : o.id,
      detail: `Held until ${addDays(to, 1)}. Nothing temperature-sensitive sits on a doorstep while you're away.`,
    }));

  return {
    window,
    days: dayCount(from, to),
    pauses: [
      {
        label: "Daily protocol reminders",
        detail: "No 7am notification in a timezone you're not in. Your protocol page still shows everything.",
      },
      {
        label: "Ring nudges and streak warnings",
        detail: "No \"you're about to lose your streak\" while you're on a plane. The streak is held, so there's nothing to warn about.",
      },
      { label: "Refill and reorder prompts", detail: "We'll pick these back up the day you're home." },
      { label: "Coach check-in nudges", detail: "Your coach still sees your account — they just stop poking you." },
      { label: "Scheduled shipments", detail: "Held, not cancelled. Same order, later date." },
    ],
    continues: [
      {
        label: "Your streak",
        detail: `Every day away is recorded as "${TRAVEL_PROTECTED_REASON}" and counted as held. Your ${"streak"} does not reset and does not go backwards.`,
      },
      {
        label: "Messages from your care team",
        detail: "If your provider needs to reach you about a result, they still can. Travel mode never mutes clinical contact.",
      },
      { label: "Lab results", detail: "Results still land in your portal the moment they're released." },
      {
        label: "Booked appointments",
        detail: "Nothing on your calendar is cancelled or moved. If a visit falls inside your trip, that's yours to decide.",
      },
      { label: "Your plan of care", detail: "Unchanged. Travel mode is a notification setting, not a clinical one." },
    ],
    heldShipments,
    resumesOn: addDays(to, 1),
    streakProtected: true,
    protectedReason: TRAVEL_PROTECTED_REASON,
    telehealthNote: sameState
      ? `You'll still be in ${window.state}, so your usual telehealth providers can see you as normal.`
      : `While you're in ${window.state}, telehealth visits have to be with a clinician licensed in ${window.state}. We'll only show you providers who are — that's a licensing rule, not a preference.`,
    clinicalBoundary:
      "Travel mode pauses reminders and shipments. It does not change what your provider prescribed. If you can't travel with part of your protocol, message your care team before you go — that's a clinical decision and it's theirs to make with you.",
  };
}

// ---------------------------------------------------------------------------
// Commit / release
// ---------------------------------------------------------------------------

export function startTravel(client: Client, impact: TravelImpact): TravelWindow {
  const existing = windows.findIndex((w) => w.id === impact.window.id);
  if (existing >= 0) windows[existing] = impact.window;
  else windows.push(impact.window);

  appendLedger({
    actorId: client.id,
    actorName: `${client.firstName} ${client.lastName}`,
    actorRole: "Client",
    action: "update",
    entity: "session",
    entityId: impact.window.id,
    subjectId: client.id,
    subjectName: `${client.firstName} ${client.lastName}`,
    locationId: client.locationId,
    reason: "Member enabled travel mode",
    after: {
      from: impact.window.from,
      to: impact.window.to,
      state: impact.window.state,
      remindersPaused: true,
      shipmentsHeld: impact.heldShipments.length,
      streakProtectedAs: TRAVEL_PROTECTED_REASON,
    },
  });

  return impact.window;
}

export function endTravel(client: Client): void {
  const w = travelFor(client.id);
  if (!w) return;
  w.status = "Ended";
  appendLedger({
    actorId: client.id,
    actorName: `${client.firstName} ${client.lastName}`,
    actorRole: "Client",
    action: "update",
    entity: "session",
    entityId: w.id,
    subjectId: client.id,
    subjectName: `${client.firstName} ${client.lastName}`,
    locationId: client.locationId,
    reason: "Member ended travel mode",
    before: { status: "Active" },
    after: { status: "Ended", remindersResumed: true },
  });
}
