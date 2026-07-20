import type { Client, LocationId } from "@/lib/types";
import type { Slot, VisitTypeId } from "@/lib/booking/availability";
import { slotsFor, visitTypeMap } from "@/lib/booking/availability";
import { locationName } from "@/lib/mock/locations";
import { staffName } from "@/lib/mock/staff";
import { appendLedger } from "@/lib/trace/ledger";
import { seededRandom, absolute } from "@/lib/utils";

/**
 * The waitlist — what happens when the answer is "nothing that week".
 *
 * A booking screen that can only say "no availability" hands the problem back
 * to the member, and the member's next move is the phone, which is the cost the
 * whole feature was supposed to remove. So a full window is not a dead end: it
 * is an offer to hold their place.
 *
 * Three rules, and they are the whole design:
 *
 *  1. **FIFO, and visible.** Position is by request time, full stop. A queue
 *     that quietly reorders itself by membership tier or lifetime value is a
 *     queue the clinic cannot show a member, and anything you cannot show a
 *     member is a thing you should not be doing. Position is displayed for
 *     exactly this reason.
 *  2. **Clinical urgency is escalated by a human, never auto-jumped.** If
 *     someone needs to be seen sooner than the queue allows, a coach or
 *     provider moves them and that move is a ledger row with a name on it. An
 *     algorithm that silently triages a waitlist is making a clinical decision
 *     without a licence.
 *  3. **An offer is a HOLD, not a booking.** When a slot frees, the person at
 *     the front gets first refusal for a fixed window and the slot is held for
 *     nobody else during it. Auto-booking a member into a time they have not
 *     seen is how you generate a no-show and an angry phone call.
 */

const NOW = "2026-06-12T09:00:00";

/** How long the front of the queue gets to claim a released slot before it moves on. */
export const OFFER_HOLD_MINUTES = 120;

/** A waitlist request expires with its window — a stale queue is worse than none. */
export type WaitlistStatus = "Waiting" | "Offered" | "Claimed" | "Expired" | "Cancelled";

export interface WaitlistRequest {
  clientId: string;
  visitType: VisitTypeId;
  locationId: LocationId;
  /** Optional — "anyone qualified" is the faster answer and the default. */
  staffId?: string;
  /** yyyy-mm-dd, inclusive. The window the member actually wants. */
  windowStart: string;
  windowEnd: string;
  /** How they want to be told. Nothing clinical ever goes in the notification. */
  notifyBy: "Push" | "SMS" | "Email";
}

export interface WaitlistEntry extends WaitlistRequest {
  id: string;
  status: WaitlistStatus;
  createdAt: string;
  /** 1-based. 1 means next in line. */
  position: number;
  /** How many people are ahead in the same window. */
  ahead: number;
  /** Deterministic demo estimate, phrased as a likelihood and never a promise. */
  outlook: string;
  /** Present once a slot has been offered. */
  offer?: WaitlistOffer;
}

export interface WaitlistOffer {
  slot: Slot;
  offeredAt: string;
  /** After this, the hold releases and the next person in line is offered it. */
  holdsUntil: string;
  /** Member-facing, no PHI: a cancellation is someone else's business. */
  message: string;
}

/**
 * Session store. Same reasoning as the booked-appointments array in
 * availability.ts — mutating a shared fixture to demo a feature is how demos
 * break other people's screens.
 */
const entries: WaitlistEntry[] = [];

export function waitlistFor(clientId: string): WaitlistEntry[] {
  return entries
    .filter((e) => e.clientId === clientId && e.status !== "Cancelled")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Everyone waiting on the same shape of visit, oldest request first. */
function queueFor(req: WaitlistRequest): WaitlistEntry[] {
  return entries
    .filter(
      (e) =>
        e.status === "Waiting" &&
        e.visitType === req.visitType &&
        e.locationId === req.locationId &&
        e.windowStart <= req.windowEnd &&
        e.windowEnd >= req.windowStart,
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * How many people are already waiting on this window before the member joins.
 *
 * Deterministic stand-in for the rest of the clinic's queue, which in a demo
 * database does not exist. Seeded by the window itself so the number is stable
 * across renders — a position that changes when you tab away is a position
 * nobody believes.
 */
function existingDemand(req: WaitlistRequest): number {
  const rand = seededRandom(`waitlist:${req.visitType}:${req.locationId}:${req.windowStart}`);
  return Math.floor(rand() * 4);
}

function outlookFor(ahead: number, windowDays: number, req: WaitlistRequest): string {
  // Phrased as an expectation, never a commitment. The clinic cannot promise a
  // cancellation will happen, and a product that implies one has made a promise
  // on the clinic's behalf.
  if (ahead === 0 && windowDays >= 5) {
    return "You're first in line. Openings in a window this wide come up most weeks.";
  }
  if (ahead === 0) {
    return "You're first in line, though a window this narrow depends on a single cancellation.";
  }
  if (ahead <= 2) {
    return `${ahead} ${ahead === 1 ? "person is" : "people are"} ahead of you for ${locationName(req.locationId)}. Most weeks that clears.`;
  }
  return "This window is in demand. Widening it by a few days is the fastest thing you can do.";
}

function daysBetween(a: string, b: string): number {
  return Math.round((absolute(`${b}T12:00:00`).getTime() - absolute(`${a}T12:00:00`).getTime()) / 86_400_000) + 1;
}

/**
 * Join the waitlist.
 *
 * Records a ledger row: a waitlist entry is a standing statement that an
 * identified member wants care in a date range, which is member data, and the
 * member is entitled to see that it was created and by whom.
 */
export function joinWaitlist(req: WaitlistRequest, client: Client): WaitlistEntry {
  const ahead = queueFor(req).length + existingDemand(req);
  const entry: WaitlistEntry = {
    ...req,
    id: `wl-${req.clientId}-${req.visitType.replace(/\s+/g, "").toLowerCase()}-${req.windowStart}`,
    status: "Waiting",
    createdAt: NOW,
    position: ahead + 1,
    ahead,
    outlook: outlookFor(ahead, daysBetween(req.windowStart, req.windowEnd), req),
  };

  const existing = entries.findIndex((e) => e.id === entry.id);
  if (existing >= 0) entries[existing] = entry;
  else entries.push(entry);

  appendLedger({
    actorId: client.id,
    actorName: `${client.firstName} ${client.lastName}`,
    actorRole: "Client",
    action: "create",
    entity: "session",
    entityId: entry.id,
    subjectId: client.id,
    subjectName: `${client.firstName} ${client.lastName}`,
    locationId: req.locationId,
    reason: "Member joined the waitlist for an earlier visit",
    after: {
      visitType: req.visitType,
      window: `${req.windowStart} → ${req.windowEnd}`,
      with: req.staffId ? staffName(req.staffId) : "Anyone qualified",
      position: entry.position,
    },
  });

  return entry;
}

export function leaveWaitlist(entryId: string, client: Client): void {
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return;
  entry.status = "Cancelled";
  appendLedger({
    actorId: client.id,
    actorName: `${client.firstName} ${client.lastName}`,
    actorRole: "Client",
    action: "update",
    entity: "session",
    entityId: entry.id,
    subjectId: client.id,
    subjectName: `${client.firstName} ${client.lastName}`,
    locationId: entry.locationId,
    reason: "Member left the waitlist",
    before: { status: "Waiting" },
    after: { status: "Cancelled" },
  });
}

/**
 * What the member is told will happen. Rendered verbatim on the join screen so
 * the mechanics are agreed BEFORE the notification arrives at an awkward moment.
 */
export function waitlistTerms(entry: WaitlistEntry): string[] {
  return [
    `We hold your place in order. You're number ${entry.position}.`,
    `When something opens in your window, the person at the front is offered it first — that's the only rule the queue follows.`,
    `You get ${OFFER_HOLD_MINUTES / 60} hours to take it. Nobody else can book that time while it's yours.`,
    `Say no and you keep your place; the slot goes to the next person.`,
    `Your existing appointment stays exactly where it is until you accept a new one. Nothing is moved on your behalf.`,
    `You can leave the waitlist at any time, and we'll stop notifying you the moment you do.`,
  ];
}

/**
 * Model a slot freeing up — the demo of rule 3.
 *
 * Picks the earliest real slot inside the member's window (so the offer is
 * genuinely bookable, not a fiction) and puts it on hold for them. In
 * production this is triggered by a cancellation event, not polled.
 */
export function simulateRelease(entry: WaitlistEntry): WaitlistOffer | null {
  const candidates = slotsFor({
    visitType: entry.visitType,
    locationId: entry.locationId,
    staffId: entry.staffId,
    fromIso: entry.windowStart,
    days: Math.max(1, daysBetween(entry.windowStart, entry.windowEnd)),
  }).filter((s) => s.date <= entry.windowEnd);

  const slot = candidates[0];
  if (!slot) return null;

  const holdsUntil = absolute(absolute(NOW).getTime() + OFFER_HOLD_MINUTES * 60_000)
    .toISOString()
    .slice(0, 19);

  const offer: WaitlistOffer = {
    slot,
    offeredAt: NOW,
    holdsUntil,
    // Deliberately says nothing about who cancelled or why. A notification that
    // leaks "Andre B. cancelled his hormone follow-up" is a disclosure sent by
    // a scheduling feature.
    message: `A ${visitTypeMap[entry.visitType]?.label.toLowerCase() ?? "visit"} opened up at ${locationName(
      entry.locationId,
    )} with ${slot.staffName}. It's held for you until ${holdsUntil.slice(11, 16)}.`,
    };

  entry.status = "Offered";
  entry.offer = offer;
  return offer;
}
