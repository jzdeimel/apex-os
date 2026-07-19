import type {
  Order,
  OrderLine,
  OrderStatus,
  OrderStatusEvent,
  OrderActorRole,
  OrderEventSource,
  Carrier,
} from "@/lib/orders/types";
import { HAPPY_PATH, isStuck, stuckReason } from "@/lib/orders/lifecycle";
import { clients } from "@/lib/mock/clients";
import { staffMap } from "@/lib/mock/staff";
import { seededRandom } from "@/lib/utils";

/**
 * Deterministic order book.
 *
 * Pinned clock: NOW = 2026-06-12T09:00:00. Every timestamp below is derived by
 * subtracting hours from that instant, so the demo renders identically on every
 * machine, forever. No Math.random, no Date.now.
 *
 * The distribution is deliberately unflattering: it includes genuinely stuck
 * orders and a live "Insufficient stock" exception, because a fulfillment board
 * that only ever shows the happy path is exactly the board that let the audited
 * system strand orders for weeks without anyone noticing.
 */

const NOW = "2026-06-12T09:00:00";
const NOW_MS = new Date(NOW).getTime();
const HOUR = 1000 * 60 * 60;

/**
 * Format a Date back into the same naive local-wall-clock shape as NOW.
 * We deliberately do NOT use toISOString(): NOW is parsed as local time, so
 * emitting UTC here would reintroduce a timezone offset and make stuck-order
 * detection depend on the machine's TZ. Same parse regime in, same regime out.
 */
function iso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

/** Timestamp `hours` before NOW. */
function ago(hours: number): string {
  return iso(new Date(NOW_MS - Math.round(hours) * HOUR));
}

/** Timestamp `hours` after NOW. */
function ahead(hours: number): string {
  return iso(new Date(NOW_MS + Math.round(hours) * HOUR));
}

function pick<T>(arr: T[], r: number): T {
  return arr[Math.floor(r * arr.length) % arr.length];
}

/* ------------------------------------------------------------------ *
 * Catalog — SKUs align with lib/mock/inventory.ts where they overlap,
 * so a line item can bind to a real lot.
 * ------------------------------------------------------------------ */

interface CatalogItem {
  sku: string;
  name: string;
  unitPriceCents: number;
  isAddon: boolean;
  lotPrefix: string;
}

const CATALOG: CatalogItem[] = [
  { sku: "PEP-BPC-5MG", name: "BPC-157 / TB-500 blend 5mg", unitPriceCents: 18500, isAddon: false, lotPrefix: "BPC" },
  { sku: "GLP-SEMA-2.5", name: "Semaglutide 2.5mg", unitPriceCents: 34900, isAddon: false, lotPrefix: "SEM" },
  { sku: "GLP-RETA-10", name: "Retatrutide 10mg", unitPriceCents: 59900, isAddon: false, lotPrefix: "RET" },
  { sku: "GLP-TIRZ-5", name: "Tirzepatide 5mg", unitPriceCents: 44900, isAddon: false, lotPrefix: "TIR" },
  { sku: "HRT-TCYP-200", name: "Testosterone cypionate 200mg/mL", unitPriceCents: 12900, isAddon: false, lotPrefix: "TCY" },
  { sku: "HRT-HCG-5000", name: "hCG 5,000 IU", unitPriceCents: 15900, isAddon: false, lotPrefix: "HCG" },
  { sku: "HRT-ANAS-1MG", name: "Anastrozole 1mg (30ct)", unitPriceCents: 4900, isAddon: true, lotPrefix: "ANA" },
  { sku: "IV-NAD-500", name: "NAD+ 500mg", unitPriceCents: 22500, isAddon: true, lotPrefix: "NAD" },
  { sku: "IV-GLUT-2000", name: "Glutathione 2,000mg", unitPriceCents: 9900, isAddon: true, lotPrefix: "GLU" },
  { sku: "PEP-SERM-15", name: "Sermorelin 15mg", unitPriceCents: 21500, isAddon: false, lotPrefix: "SER" },
  { sku: "PEP-PT141-10", name: "PT-141 10mg", unitPriceCents: 13500, isAddon: true, lotPrefix: "PT" },
  { sku: "PEP-GHKCU-50", name: "GHK-Cu 50mg", unitPriceCents: 16500, isAddon: true, lotPrefix: "GHK" },
  { sku: "SUP-INJ-29G", name: "Injection supply kit (29G, 30ct)", unitPriceCents: 2900, isAddon: true, lotPrefix: "INJ" },
  { sku: "PEP-MK677-25", name: "Ibutamoren / MK-677 25mg", unitPriceCents: 11900, isAddon: true, lotPrefix: "MK" },
];

/* ------------------------------------------------------------------ *
 * Status mix
 * ------------------------------------------------------------------ */

/**
 * Weighted status distribution. Weights approximate a real book: most orders
 * are done or moving, a meaningful minority are in exception states.
 */
const STATUS_MIX: Array<{ status: OrderStatus; weight: number }> = [
  { status: "Delivered", weight: 34 },
  { status: "In transit", weight: 13 },
  { status: "Out for delivery", weight: 5 },
  { status: "Label created", weight: 6 },
  { status: "Packed", weight: 6 },
  { status: "Picking", weight: 8 },
  { status: "Accepted", weight: 8 },
  { status: "Submitted", weight: 5 },
  { status: "Draft", weight: 5 },
  { status: "QC hold", weight: 4 },
  { status: "Insufficient stock", weight: 3 },
  { status: "Cancelled", weight: 2 },
  { status: "Failed", weight: 1 },
];

const MIX_TOTAL = STATUS_MIX.reduce((s, m) => s + m.weight, 0);

function pickStatus(r: number): OrderStatus {
  let acc = r * MIX_TOTAL;
  for (const m of STATUS_MIX) {
    acc -= m.weight;
    if (acc <= 0) return m.status;
  }
  return "Delivered";
}

const CARRIERS: Carrier[] = ["UPS", "FedEx", "USPS"];

/**
 * The event trail for a status: the happy-path prefix, plus the exception step
 * where one applies. Exceptions are inserted at the point they really occur —
 * a QC hold happens after picking, a stock shortfall right after acceptance.
 */
function pathFor(status: OrderStatus): OrderStatus[] {
  const idx = HAPPY_PATH.indexOf(status);
  if (idx >= 0) return HAPPY_PATH.slice(0, idx + 1);
  switch (status) {
    case "Insufficient stock":
      return ["Draft", "Submitted", "Accepted", "Insufficient stock"];
    case "QC hold":
      return ["Draft", "Submitted", "Accepted", "Picking", "QC hold"];
    case "Cancelled":
      return ["Draft", "Submitted", "Accepted", "Cancelled"];
    case "Failed":
      return ["Draft", "Submitted", "Accepted", "Picking", "Packed", "Failed"];
    default:
      return ["Draft"];
  }
}

function sourceFor(status: OrderStatus): OrderEventSource {
  switch (status) {
    case "Draft":
    case "Submitted":
    case "Cancelled":
      return "apex";
    case "In transit":
    case "Out for delivery":
    case "Delivered":
      return "carrier";
    default:
      return "medsource";
  }
}

function actorFor(status: OrderStatus, coachName: string): {
  actor: string;
  actorRole: OrderActorRole;
} {
  const src = sourceFor(status);
  if (src === "carrier") return { actor: "Carrier scan", actorRole: "Carrier" };
  if (src === "medsource")
    return { actor: "MedSource fulfillment", actorRole: "Partner" };
  if (status === "Draft") return { actor: coachName, actorRole: "Coach" };
  return { actor: coachName, actorRole: "Coach" };
}

function trackingNumber(seed: () => number, carrier: Carrier): string {
  const digits = Array.from({ length: 12 }, () =>
    Math.floor(seed() * 10).toString(),
  ).join("");
  if (carrier === "UPS") return `1Z${digits.slice(0, 6)}A${digits.slice(6)}`;
  if (carrier === "FedEx") return `7${digits}`;
  return `9400${digits}`;
}

/* ------------------------------------------------------------------ *
 * Generation
 * ------------------------------------------------------------------ */

/** Statuses eligible for a client to have an order at all. */
const ORDERABLE_CLIENT_STATUSES = new Set([
  "Active Protocol",
  "Follow-Up Due",
  "Plan Review",
  "Inactive",
]);

/**
 * How long an order has been sitting in its current state, in hours. Most are
 * healthy (comfortably inside SLA); a deterministic slice is deliberately blown
 * past it so `stuckOrders()` is never empty in the demo.
 */
function ageForStatus(status: OrderStatus, r: number, stuck: boolean): number {
  if (stuck) {
    switch (status) {
      case "Packed":
        return 96 + Math.floor(r * 60); // the classic stranded order
      case "Submitted":
        return 20 + Math.floor(r * 30);
      case "Insufficient stock":
        return 40 + Math.floor(r * 50);
      case "QC hold":
        return 30 + Math.floor(r * 40);
      case "Label created":
        return 72 + Math.floor(r * 48);
      case "Accepted":
        return 48 + Math.floor(r * 40);
      case "Picking":
        return 50 + Math.floor(r * 40);
      case "In transit":
        return 150 + Math.floor(r * 80);
      case "Out for delivery":
        return 30 + Math.floor(r * 24);
      default:
        return 80 + Math.floor(r * 40);
    }
  }
  switch (status) {
    case "Draft":
      return 2 + Math.floor(r * 20);
    case "Submitted":
      return Math.floor(r * 3);
    case "Accepted":
      return 1 + Math.floor(r * 14);
    case "Insufficient stock":
      return 1 + Math.floor(r * 8);
    case "Picking":
      return 2 + Math.floor(r * 16);
    case "QC hold":
      return 1 + Math.floor(r * 8);
    case "Packed":
      return 2 + Math.floor(r * 16);
    case "Label created":
      return 3 + Math.floor(r * 24);
    case "In transit":
      return 8 + Math.floor(r * 70);
    case "Out for delivery":
      return 1 + Math.floor(r * 10);
    default:
      return 24 + Math.floor(r * 400);
  }
}

const DELAY_REASONS = [
  "Carrier weather hold in the Charlotte hub.",
  "Cold-chain reroute — package held for a compliant transfer.",
  "Address correction requested by the carrier.",
];

const SHORTFALL_NOTES = [
  "Retatrutide 10mg short by 1 unit — substitution or partial ship needed.",
  "Semaglutide lot quarantined at the partner; no sellable stock on hand.",
  "Compounding backlog — item unavailable for at least 72h.",
];

function buildOrder(clientId: string, n: number): Order | null {
  const client = clients.find((c) => c.id === clientId);
  if (!client) return null;

  const rand = seededRandom(`order:${clientId}:${n}`);
  const status = pickStatus(rand());

  // 1 in 7 non-terminal orders is deliberately stuck, so the ops board has
  // something real to catch.
  const stuck =
    status !== "Delivered" &&
    status !== "Cancelled" &&
    status !== "Failed" &&
    n % 7 === 3;

  const ageHours = ageForStatus(status, rand(), stuck);
  const path = pathFor(status);
  // The whole order spans a bit more than its time-in-current-state.
  const spanHours = ageHours + 4 + Math.floor(rand() * 30);
  const placedAt = ago(spanHours);
  const lastActivity = ago(ageHours);

  const coachName = staffMap[client.coachId]?.name ?? "Apex";

  // Lines: 1–3 items, at least one non-addon.
  const lineCount = 1 + Math.floor(rand() * 3);
  const base = CATALOG.filter((c) => !c.isAddon);
  const chosen: CatalogItem[] = [pick(base, rand())];
  for (let i = 1; i < lineCount; i++) {
    const candidate = pick(CATALOG, rand());
    if (!chosen.some((c) => c.sku === candidate.sku)) chosen.push(candidate);
  }

  // Lots are only bound once the order physically reached the pick floor —
  // before that, nothing has been touched, so there is nothing to trace.
  const lotsBound = path.includes("Picking");
  const lines: OrderLine[] = chosen.map((c, i) => ({
    id: `${`ord-${String(n).padStart(4, "0")}`}-l${i + 1}`,
    sku: c.sku,
    name: c.name,
    qty: c.isAddon ? 1 : 1 + Math.floor(rand() * 2),
    unitPriceCents: c.unitPriceCents,
    isAddon: c.isAddon,
    lotRef: lotsBound
      ? `${c.lotPrefix}-260${3 + Math.floor(rand() * 3)}${String.fromCharCode(65 + (n % 26))}`
      : undefined,
  }));

  const id = `ord-${String(n).padStart(4, "0")}`;

  // Distribute event timestamps evenly across the order's life, ending at
  // lastActivity for the current status.
  const statusHistory: OrderStatusEvent[] = path.map((s, i) => {
    const t =
      i === path.length - 1
        ? lastActivity
        : ago(spanHours - ((spanHours - ageHours) * i) / Math.max(1, path.length - 1));
    const { actor, actorRole } = actorFor(s, coachName);
    let note: string | undefined;
    if (s === "Insufficient stock") note = pick(SHORTFALL_NOTES, rand());
    if (s === "Cancelled") note = "Cancelled at member request before pick.";
    if (s === "Failed") note = "Carrier returned the package to sender; cold chain broken.";
    if (s === "QC hold") note = "Pharmacist review pending on a compounded item.";
    return { status: s, at: t, actor, actorRole, source: sourceFor(s), note };
  });

  const shipped =
    status === "In transit" ||
    status === "Out for delivery" ||
    status === "Delivered" ||
    status === "Label created";

  const carrier: Carrier | undefined = shipped ? pick(CARRIERS, rand()) : undefined;
  const tracking = shipped && carrier ? trackingNumber(rand, carrier) : undefined;

  const delayed = stuck && (status === "In transit" || status === "Out for delivery");

  return {
    id,
    clientId,
    coachId: client.coachId,
    locationId: client.locationId,
    status,
    lines,
    placedAt,
    statusHistory,
    tracking,
    carrier,
    estDelivery:
      status === "Delivered"
        ? lastActivity
        : shipped
          ? ahead(12 + Math.floor(rand() * 60))
          : undefined,
    lastActivity,
    delayed: delayed || undefined,
    delayReason: delayed ? pick(DELAY_REASONS, rand()) : undefined,
    // The partner reference only exists once they have acknowledged the order.
    medsourceRef:
      status === "Draft" ? undefined : `MS-${2026}-${String(40000 + n * 7).slice(0, 5)}`,
    fulfillmentPartner: "MedSource",
    // Stable per order and replayed byte-for-byte on every submit attempt.
    idempotencyKey: `apex:${id}:v1`,
    // Drafts are invisible to the member — nothing has been promised yet.
    visibleToClient: status !== "Draft",
  };
}

/* ------------------------------------------------------------------ *
 * The book
 * ------------------------------------------------------------------ */

const built: Order[] = [];
{
  let n = 0;
  for (const c of clients) {
    if (!ORDERABLE_CLIENT_STATUSES.has(c.status)) continue;
    const r = seededRandom(`orderCount:${c.id}`)();
    // Most ordering clients have 1 order in flight or recent history; a third
    // have 2–3, matching a real refill cadence.
    const count = r < 0.55 ? 1 : r < 0.85 ? 2 : 3;
    for (let k = 0; k < count; k++) {
      n += 1;
      const o = buildOrder(c.id, n);
      if (o) built.push(o);
    }
  }
}

/**
 * Two hand-placed orders so the demo always has a specific, narratable failure
 * to point at, regardless of how the generated mix lands.
 *
 * ord-9001 is the stranded-order story verbatim from the audit: packed five
 * days ago, the tracking PATCH failed, nobody noticed, and the member has been
 * looking at "we're preparing your order" the whole time.
 */
const HERO_ORDERS: Order[] = [
  {
    id: "ord-9001",
    clientId: "c-001",
    coachId: clients[0]?.coachId ?? "st-005",
    locationId: "raleigh",
    status: "Packed",
    lines: [
      { id: "ord-9001-l1", sku: "GLP-RETA-10", name: "Retatrutide 10mg", qty: 1, unitPriceCents: 59900, isAddon: false, lotRef: "RET-2605A" },
      { id: "ord-9001-l2", sku: "SUP-INJ-29G", name: "Injection supply kit (29G, 30ct)", qty: 1, unitPriceCents: 2900, isAddon: true, lotRef: "INJ-2605V" },
    ],
    placedAt: ago(168),
    statusHistory: [
      { status: "Draft", at: ago(168), actor: "Nina Barrett", actorRole: "Coach", source: "apex" },
      { status: "Submitted", at: ago(166), actor: "Nina Barrett", actorRole: "Coach", source: "apex" },
      { status: "Accepted", at: ago(160), actor: "MedSource fulfillment", actorRole: "Partner", source: "medsource" },
      { status: "Picking", at: ago(150), actor: "MedSource fulfillment", actorRole: "Partner", source: "medsource" },
      {
        status: "Packed",
        at: ago(120),
        actor: "MedSource fulfillment",
        actorRole: "Partner",
        source: "medsource",
        note: "Packed and staged. No label event followed — the tracking PATCH never landed.",
      },
    ],
    lastActivity: ago(120),
    medsourceRef: "MS-2026-40771",
    fulfillmentPartner: "MedSource",
    idempotencyKey: "apex:ord-9001:v1",
    visibleToClient: true,
  },
  {
    id: "ord-9002",
    clientId: "c-002",
    coachId: clients[1]?.coachId ?? "st-006",
    locationId: "raleigh",
    status: "Insufficient stock",
    lines: [
      { id: "ord-9002-l1", sku: "GLP-SEMA-2.5", name: "Semaglutide 2.5mg", qty: 2, unitPriceCents: 34900, isAddon: false },
      { id: "ord-9002-l2", sku: "IV-GLUT-2000", name: "Glutathione 2,000mg", qty: 1, unitPriceCents: 9900, isAddon: true },
    ],
    placedAt: ago(56),
    statusHistory: [
      { status: "Draft", at: ago(56), actor: "Ruben Ortega", actorRole: "Coach", source: "apex" },
      { status: "Submitted", at: ago(54), actor: "Ruben Ortega", actorRole: "Coach", source: "apex" },
      { status: "Accepted", at: ago(50), actor: "MedSource fulfillment", actorRole: "Partner", source: "medsource" },
      {
        status: "Insufficient stock",
        at: ago(44),
        actor: "MedSource fulfillment",
        actorRole: "Partner",
        source: "medsource",
        note: "Semaglutide 2.5mg short by 1 of 2 units. Partial ship available immediately; full ship in ~5 days.",
      },
    ],
    lastActivity: ago(44),
    medsourceRef: "MS-2026-40788",
    fulfillmentPartner: "MedSource",
    idempotencyKey: "apex:ord-9002:v1",
    visibleToClient: true,
  },
];

export const orders: Order[] = [...HERO_ORDERS, ...built];

/**
 * Commit a newly placed order into the book.
 *
 * Without this, `placeOrder` constructed an Order, appended a ledger row
 * recording its creation, and then dropped it — so the chain permanently
 * recorded an order that no board, no portal and no `orderById` lookup could
 * resolve. A ledger entry for an unreachable record is worse than no entry: it
 * asserts something happened that the product cannot show you.
 *
 * Mirrors `commitSubscription` in lib/mock/subscriptions.ts. Replaces in place
 * when the id already exists, so a retried placement is idempotent rather than
 * producing a duplicate row.
 */
export function commitOrder(order: Order): Order {
  const i = orders.findIndex((o) => o.id === order.id);
  if (i >= 0) orders[i] = order;
  else orders.push(order);
  orderMap[order.id] = order;
  return order;
}

export const orderMap: Record<string, Order> = Object.fromEntries(
  orders.map((o) => [o.id, o]),
);

/* ------------------------------------------------------------------ *
 * Selectors
 * ------------------------------------------------------------------ */

export function orderById(id: string): Order | undefined {
  return orderMap[id];
}

/** Newest first — the order a member most likely came to check. */
export function ordersForClient(clientId: string): Order[] {
  return orders
    .filter((o) => o.clientId === clientId)
    .sort((a, b) => (a.placedAt < b.placedAt ? 1 : -1));
}

/** Everything a coach still owes an answer on. Excludes terminal states. */
export function openOrdersFor(coachId: string): Order[] {
  return orders
    .filter(
      (o) =>
        o.coachId === coachId &&
        o.status !== "Delivered" &&
        o.status !== "Cancelled" &&
        o.status !== "Failed",
    )
    .sort((a, b) => (a.lastActivity ?? a.placedAt) < (b.lastActivity ?? b.placedAt) ? -1 : 1);
}

/** Past SLA in a non-terminal state. Oldest offence first. */
export function stuckOrders(nowIso: string = NOW): Order[] {
  return orders
    .filter((o) => isStuck(o, nowIso))
    .sort((a, b) =>
      (a.lastActivity ?? a.placedAt) < (b.lastActivity ?? b.placedAt) ? -1 : 1,
    );
}

export function ordersByStatus(status: OrderStatus): Order[] {
  return orders.filter((o) => o.status === status);
}

export function ordersForLocation(locationId: string): Order[] {
  return orders.filter((o) => o.locationId === locationId);
}

/** Pre-computed reasons so boards don't recompute per render. */
export function stuckSummary(nowIso: string = NOW): Array<{ order: Order; reason: string }> {
  return stuckOrders(nowIso).map((o) => ({
    order: o,
    reason: stuckReason(o, nowIso) ?? "No movement.",
  }));
}
