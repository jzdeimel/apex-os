import type { Subscription } from "@/lib/subscriptions/types";
import { addDays, dayOf } from "@/lib/subscriptions/engine";
import { catalogItem } from "@/lib/catalog/catalog";
import { clients } from "@/lib/mock/clients";
import { seededRandom } from "@/lib/utils";

/**
 * The subscription book — deterministic, pinned to NOW = 2026-06-12T09:00:00.
 *
 * The distribution is deliberately unflattering, for the same reason the order
 * book is: a refill board that only ever shows "upcoming" is the board that let
 * the audited system quietly stop refilling people. So this book contains
 * refills that are due today, refills that are OVERDUE (nobody actioned them),
 * a payment hold, a pause and a lapse.
 */

const NOW = "2026-06-12T09:00:00";
const TODAY = dayOf(NOW);

/**
 * What actually recurs. Services, labs and one-off packages do not: a member
 * does not auto-subscribe to a consult. Every SKU here is a shippable protocol
 * item, and each is present in the catalog — a subscription pointing at a SKU
 * the catalog does not know is a refill that cannot be placed.
 */
const RECURRING_SKUS = [
  "GLP-SEMA-2.5",
  "GLP-TIRZ-5",
  "GLP-RETA-10",
  "GLP-SEMA-1.0",
  "HRT-TCYP-200",
  "HRT-HCG-5000",
  "HRT-ANAS-1MG",
  "HRT-ESTR-0.1",
  "PEP-BPC-5MG",
  "PEP-SERM-15",
  "PEP-IPACJC-10",
  "PEP-PT141-10",
  "SUP-INJ-29G",
];

/** Real protocol intervals, not round numbers pulled from the air. */
const CADENCES = [28, 30, 28, 56, 84, 30];

/** Members with a live protocol are the ones who have a refill schedule. */
const ELIGIBLE = clients.filter(
  (c) => c.status === "Active Protocol" || c.status === "Follow-Up Due",
);

/**
 * Offsets from today for `nextRefillOn`, cycled deterministically.
 *
 * Negative = overdue and nobody has actioned it. Zero = due today. The mix is
 * chosen so `dueRefills()` and `upcomingRefills()` are both non-empty on every
 * machine, forever.
 */
const DAY_OFFSETS = [0, 0, -1, 3, 7, -4, 12, 21, 0, 5, -9, 16, 2, 30, 9, -2, 45, 11];

function build(): Subscription[] {
  const out: Subscription[] = [];

  // Every third eligible member is on a recurring protocol — roughly the real
  // conversion from "on a plan" to "on auto-ship".
  const enrolled = ELIGIBLE.filter((_, i) => i % 3 === 0).slice(0, 54);

  enrolled.forEach((c, i) => {
    const rand = seededRandom(`sub:${c.id}`);
    const sku = RECURRING_SKUS[Math.floor(rand() * RECURRING_SKUS.length)];
    const item = catalogItem(sku);
    if (!item) return; // unreachable by construction; fail closed rather than guess

    const cadenceDays = CADENCES[i % CADENCES.length];
    const offset = DAY_OFFSETS[i % DAY_OFFSETS.length];
    const nextRefillOn = addDays(TODAY, offset);

    // Last placement sits one full cadence before the next due date, which is
    // what a healthy schedule looks like. Enrollment is one cycle before that.
    const lastPlacedOn = addDays(nextRefillOn, -cadenceDays);
    const startedOn = addDays(lastPlacedOn, -cadenceDays * (1 + (i % 4)));

    // Status mix: mostly Active, with a deterministic Paused and Lapsed tail.
    const status: Subscription["status"] =
      i % 17 === 5 ? "Paused" : i % 23 === 7 ? "Lapsed" : i % 29 === 11 ? "Ended" : "Active";

    const sub: Subscription = {
      id: `sub-${String(i + 1).padStart(3, "0")}`,
      clientId: c.id,
      sku: item.sku,
      cadenceDays,
      nextRefillOn,
      status,
      lastPlacedOn,
      priceCents: item.unitPriceCents,
      locationId: c.locationId,
      shipping: item.fulfillment === "in-clinic" ? "pickup" : "ship",
      startedOn,
      refillsPlaced: 1 + (i % 9),
    };

    out.push(sub);
  });

  return out;
}

const built = build();

/**
 * Hand-placed subscriptions so the demo always has the three specific stories
 * worth pointing at, regardless of how the generated mix lands.
 */
const HERO_SUBS: Subscription[] = [
  {
    /**
     * Due today, healthy. The happy path: one click and it ships.
     */
    id: "sub-900",
    clientId: "c-001",
    sku: "GLP-RETA-10",
    cadenceDays: 28,
    nextRefillOn: TODAY,
    status: "Active",
    lastPlacedOn: addDays(TODAY, -28),
    priceCents: 59_900,
    locationId: "raleigh",
    shipping: "ship",
    startedOn: addDays(TODAY, -168),
    refillsPlaced: 6,
  },
  {
    /**
     * THE PAYMENT HOLD.
     *
     * Held eleven days. In the audited system this member's schedule would have
     * rolled to today + 28 the moment the hold cleared, permanently pushing them
     * eleven days later on a 28-day protocol — and it would have happened again
     * on the next hold. Here `rollFrom` rolls from the SCHEDULED date, so
     * releasing this hold puts the member back on their original phase.
     */
    id: "sub-901",
    clientId: "c-002",
    sku: "HRT-TCYP-200",
    cadenceDays: 28,
    nextRefillOn: addDays(TODAY, -11),
    status: "Active",
    lastPlacedOn: addDays(TODAY, -39),
    priceCents: 12_900,
    locationId: "raleigh",
    shipping: "ship",
    heldReason: "Card on file declined — balance outstanding since 1 Jun.",
    holdAmountCents: 12_900,
    startedOn: addDays(TODAY, -347),
    refillsPlaced: 12,
  },
  {
    /**
     * Overdue and NOT held — the silent failure. Nothing is blocking this; it
     * simply sat. It exists so the board's "overdue" section is never empty and
     * the demo can show what the old system had no surface for.
     */
    id: "sub-902",
    clientId: "c-003",
    sku: "GLP-SEMA-2.5",
    cadenceDays: 30,
    nextRefillOn: addDays(TODAY, -6),
    status: "Active",
    lastPlacedOn: addDays(TODAY, -36),
    priceCents: 34_900,
    locationId: "raleigh",
    shipping: "ship",
    startedOn: addDays(TODAY, -186),
    refillsPlaced: 5,
  },
];

/**
 * The book. MUTABLE by design and only through the helpers below — a
 * subscription board that cannot record an action is a read-only report.
 */
export const subscriptions: Subscription[] = [...HERO_SUBS, ...built];

export function subscriptionById(id: string): Subscription | undefined {
  return subscriptions.find((s) => s.id === id);
}

/**
 * Stands in for the conditional row read in `claimRefill`. In production this is
 * `SELECT next_refill_on FROM subscriptions WHERE id = $1` executed inside the
 * same transaction as the conditional UPDATE.
 */
export function readSubscription(id: string): Subscription | undefined {
  return subscriptionById(id);
}

/** Replace a subscription in place, preserving array order. Returns the new row. */
export function commitSubscription(next: Subscription): Subscription {
  const i = subscriptions.findIndex((s) => s.id === next.id);
  if (i >= 0) subscriptions[i] = next;
  return next;
}

export function subscriptionsForClient(clientId: string): Subscription[] {
  return subscriptions.filter((s) => s.clientId === clientId);
}
