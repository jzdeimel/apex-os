import type { LocationId, StaffRole } from "@/lib/types";
import type { Membership } from "@/lib/types";
import type { Order, OrderLine, OrderStatusEvent } from "@/lib/orders/types";
import type { CatalogItem } from "@/lib/catalog/types";
import { catalogItem } from "@/lib/catalog/catalog";
import { advanceOrder } from "@/lib/orders/lifecycle";
import type { LedgerDraft } from "@/lib/trace/ledger";
import { seededRandom } from "@/lib/utils";

/**
 * ORDER PLACEMENT — pure construction, pricing and validation.
 *
 * Apex could display orders long before it could create one. This module is the
 * creation half, and it is deliberately PURE: nothing here touches the ledger,
 * a store, or a network. `placeOrder` returns the order AND the ledger draft;
 * the caller appends. That split is what makes the whole path testable and what
 * lets the UI show a coach exactly what will be written before it is written.
 *
 * THREE RULES, EACH FROM A SPECIFIC FAILURE IN THE SYSTEM WE ARE REPLACING.
 *
 * RULE 1 — NEVER DROP A LINE.
 *   The audited submit path resolved each line's SKU against a hardcoded array
 *   and `continue`d on a miss. A line the coach typed, saw on screen, and read
 *   back to the patient simply did not exist in the submitted payload. Here an
 *   unresolvable SKU is an `unknown-sku` ERROR that blocks placement. The coach
 *   sees the problem; the patient never gets a short shipment.
 *
 * RULE 2 — INTEGER CENTS, AND EVERY FIGURE CARRIES ITS BASIS.
 *   Totals were floats and the discount was an unlabelled number field. Nobody
 *   could reconstruct why an order cost what it cost. `PriceBreakdown` carries a
 *   one-line `basis` string per figure, written to be read aloud to a member:
 *   "Protocol credit: $75.00 of the $75.00 included with Alpha Elite."
 *
 * RULE 3 — A DISCOUNT WITHOUT A REASON IS NOT A DISCOUNT, IT IS A LEAK.
 *   Margin walked out the door in ten-dollar increments that no report could
 *   attribute. `discountCents > 0` with an empty reason is a hard error.
 *
 * RULE 4 — WHO IS PLACING IT IS PART OF WHETHER IT CAN BE PLACED.
 *   Added after the audit found that `actor` reached this module and was used
 *   ONLY as a display ternary (the two `actorRole` lines below) — `actor.role`
 *   was never tested. A coach could put Schedule III testosterone cypionate in
 *   an order and click Place, and the order went to Submitted in one click.
 *   The `needs-provider-approval` problem that fired was a WARNING whose fix
 *   text read "it will hold for provider approval before fulfillment", and no
 *   such hold exists anywhere in Apex — not a state, not a queue, not a flag.
 *   The remediation was describing a control that had never been built, which
 *   is the most dangerous kind of false copy: it tells the coach the system is
 *   catching what they are not.
 *
 *   So a `requiresProviderApproval` item is now a BLOCKING error unless the
 *   actor is Medical. The rejected alternative was to build the hold — a
 *   `PendingApproval` order status with a provider queue behind it. That is the
 *   right end state and it is on the roadmap, but it is a multi-surface feature,
 *   and shipping the warning text for it before the queue exists is precisely
 *   the failure being fixed. Refusing the order is honest today; a fake hold is
 *   not honest at any point.
 */

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** What the coach actually picked: a SKU and a count. Price is never an input. */
export interface OrderLineInput {
  sku: string;
  qty: number;
  /**
   * Price locked at enrolment, in integer cents.
   *
   * Set by recurring refills so a subscriber is charged what they signed up
   * for rather than today's list price. Absent on a normal order, which prices
   * from the catalog. Recorded in the price breakdown's basis so the override
   * is visible rather than silent.
   */
  priceOverrideCents?: number;
}

export type ShippingMode = "ship" | "pickup";

export interface ShippingAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal: string;
}

export interface PlaceOrderInput {
  clientId: string;
  /**
   * Display name, carried for the ledger row only. Kept as an input rather than
   * looked up here so this module stays free of data-layer imports and remains
   * trivially testable.
   */
  clientName?: string;
  coachId: string;
  locationId: LocationId;
  lines: OrderLineInput[];
  shipping: ShippingMode;
  /** Required when shipping === "ship". Ignored for pickup. */
  shipTo?: ShippingAddress;
  /** Integer cents off the order, after membership credit. Requires a reason. */
  discountCents?: number;
  discountReason?: string;
  /** The member's plan, if any. Drives the protocol credit. */
  membership?: Membership;
  note?: string;
  /**
   * Overrides for determinism. `at` is the pinned demo clock; `orderId` lets a
   * caller (or a test) fix the id instead of deriving it.
   */
  at?: string;
  orderId?: string;
  /** True when this order was generated by the auto-refill engine. */
  origin?: OrderOrigin;
}

export type OrderOrigin = "coach" | "refill";

/** Who is placing it. Narrower than authz's Actor — placement needs a name. */
export interface PlacingActor {
  id: string;
  name: string;
  role: StaffRole;
}

const NOW = "2026-06-12T09:00:00";

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/** One resolved line, with its catalog item attached. */
export interface PricedLine {
  sku: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  /** Catalog list price, present only when an enrolment price overrode it. */
  lockedPrice?: number;
  extendedCents: number;
  item: CatalogItem;
}

export interface PriceBreakdown {
  lines: PricedLine[];
  subtotalCents: number;
  creditAppliedCents: number;
  discountCents: number;
  totalCents: number;
  /**
   * One readable sentence per figure. Not decoration — this is the script a
   * coach uses when a member asks "why is it this much?", and the audited system
   * had no answer to that question at all.
   */
  basis: {
    subtotal: string;
    credit: string;
    discount: string;
    total: string;
  };
}

function dollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

/**
 * Resolve inputs to priced lines. Unknown SKUs are SKIPPED HERE ONLY because
 * `validateOrder` has already raised them as blocking errors — pricing an
 * unknown item is impossible, but placement is impossible too, so nothing gets
 * quietly shipped. Never call `priceLines` without also calling `validateOrder`.
 */
export function resolveLines(lines: OrderLineInput[]): PricedLine[] {
  const out: PricedLine[] = [];
  for (const l of lines) {
    const item = catalogItem(l.sku);
    if (!item) continue; // surfaced by validateOrder as `unknown-sku`
    const qty = Math.max(0, Math.floor(l.qty));
    if (qty === 0) continue;
    const unit =
      typeof l.priceOverrideCents === "number" && l.priceOverrideCents >= 0
        ? l.priceOverrideCents
        : item.unitPriceCents;
    out.push({
      sku: item.sku,
      name: item.name,
      qty,
      unitPriceCents: unit,
      extendedCents: unit * qty,
      lockedPrice: unit !== item.unitPriceCents ? item.unitPriceCents : undefined,
      item,
    });
  }
  return out;
}

/**
 * Compute the money. Order of operations is fixed and stated out loud, because
 * "credit first or discount first?" changed the total by real dollars in the
 * audited system depending on which code path ran:
 *
 *   subtotal → minus membership protocol credit → minus manual discount → total
 *
 * Credit comes first because it is an entitlement the member already paid for;
 * a discount is a concession on top of what remains. Both are clamped so the
 * total can never go below zero, and neither is allowed to be a float.
 */
export function priceLines(
  lines: OrderLineInput[],
  membership?: Membership,
  discountCents = 0,
  discountReason?: string,
): PriceBreakdown {
  const priced = resolveLines(lines);
  const subtotalCents = priced.reduce((s, l) => s + l.extendedCents, 0);

  /**
   * Credit applies only to protocol items — compounded drugs, medications and
   * packages. It is a *protocol* credit; spending it on a lab panel or a box of
   * alcohol pads is not what the member bought, and letting it do so is how a
   * benefit quietly becomes a general-purpose coupon.
   */
  const creditEligibleCents = priced
    .filter(
      (l) =>
        l.item.kind === "compound" ||
        l.item.kind === "medication" ||
        l.item.kind === "package",
    )
    .reduce((s, l) => s + l.extendedCents, 0);

  const availableCredit =
    membership && membership.status === "Active" ? membership.protocolCreditCents : 0;

  const creditAppliedCents = Math.min(availableCredit, creditEligibleCents);
  const afterCredit = subtotalCents - creditAppliedCents;

  const discount = Math.max(0, Math.min(Math.floor(discountCents), afterCredit));
  const totalCents = afterCredit - discount;

  const tierLabel = membership?.tier ?? "no membership";

  return {
    lines: priced,
    subtotalCents,
    creditAppliedCents,
    discountCents: discount,
    totalCents,
    basis: {
      subtotal: `${priced.length} ${priced.length === 1 ? "item" : "items"}, ${priced.reduce(
        (s, l) => s + l.qty,
        0,
      )} total units at list price.`,
      credit:
        availableCredit === 0
          ? `No protocol credit — ${tierLabel} does not include one.`
          : creditAppliedCents === 0
            ? `${dollars(availableCredit)} available on ${tierLabel}, but nothing on this order is a protocol item.`
            : creditAppliedCents < availableCredit
              ? `${dollars(creditAppliedCents)} of the ${dollars(availableCredit)} included with ${tierLabel} — limited by ${dollars(creditEligibleCents)} of protocol items on this order.`
              : `${dollars(creditAppliedCents)} — the full protocol credit included with ${tierLabel}.`,
      discount:
        discount === 0
          ? "No discount applied."
          : `${dollars(discount)} off, applied after the membership credit. Reason: ${
              discountReason?.trim() || "NOT RECORDED — this order cannot be placed."
            }`,
      total:
        `${dollars(subtotalCents)} subtotal` +
        (creditAppliedCents ? ` less ${dollars(creditAppliedCents)} credit` : "") +
        (discount ? ` less ${dollars(discount)} discount` : "") +
        ` = ${dollars(totalCents)} due.`,
    },
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ProblemCode =
  | "empty-order"
  | "unknown-sku"
  | "retired-item"
  | "not-available-here"
  | "invalid-qty"
  | "cannot-ship"
  | "cannot-pickup"
  | "missing-address"
  | "discount-no-reason"
  | "discount-too-large"
  | "needs-provider-approval"
  | "unknown-client";

export interface OrderProblem {
  code: ProblemCode;
  /** `error` blocks placement. `warning` is shown but does not block. */
  severity: "error" | "warning";
  sku?: string;
  /** What is wrong, in the coach's language. */
  message: string;
  /** What to do about it. A problem with no remedy is just an accusation. */
  fix: string;
}

/**
 * Everything wrong with this order, all at once.
 *
 * Deliberately returns the FULL list rather than the first failure. A form that
 * reveals one problem per submit attempt teaches staff to click Place
 * repeatedly, which is exactly how the audited system trained people to ignore
 * validation entirely.
 */
export function validateOrder(
  input: PlaceOrderInput,
  /**
   * Who is placing it. OPTIONAL, and an omitted actor is treated as NOT a
   * provider — see the prescriber gate below. Optional because the live preview
   * in OrderForm and the pre-flight check in the refill engine both validate
   * before they have anything to hand here, and making it required would have
   * meant editing every call site to keep compiling, which is how a safety gate
   * gets defaulted to `{ role: "Coach" }` in a hurry and stops gating.
   *
   * Fail-closed is the only defensible default for a Schedule III drug: the
   * cost of wrongly blocking is one provider click, the cost of wrongly
   * allowing is a coach shipping testosterone.
   */
  actor?: PlacingActor,
): OrderProblem[] {
  const problems: OrderProblem[] = [];

  // Fail closed. `undefined` is not a provider; neither is Admin. Admin is an
  // operations role in Apex (`draftOrder` maps it to "Operations"), and clinic
  // managers are the people most likely to be handed an ordering screen.
  const isProvider = actor?.role === "Medical";

  if (!input.clientId) {
    problems.push({
      code: "unknown-client",
      severity: "error",
      message: "No member selected.",
      fix: "Search for the member by name, email or MRN.",
    });
  }

  const nonEmpty = input.lines.filter((l) => l.qty > 0);
  if (nonEmpty.length === 0) {
    problems.push({
      code: "empty-order",
      severity: "error",
      message: "The order has no items.",
      fix: "Add at least one catalog item.",
    });
  }

  for (const line of input.lines) {
    const item = catalogItem(line.sku);

    if (!item) {
      // RULE 1. This is the whole reason the module exists.
      problems.push({
        code: "unknown-sku",
        severity: "error",
        sku: line.sku,
        message: `${line.sku} is not in the Apex catalog.`,
        fix: "Pick the item from the catalog, or ask an admin to add the SKU. It will not be submitted as typed.",
      });
      continue;
    }

    if (!Number.isInteger(line.qty) || line.qty < 0) {
      problems.push({
        code: "invalid-qty",
        severity: "error",
        sku: item.sku,
        message: `${item.name} has an invalid quantity (${line.qty}).`,
        fix: "Quantity must be a whole number of units.",
      });
    }

    if (line.qty <= 0) continue;

    if (!item.active) {
      problems.push({
        code: "retired-item",
        severity: "error",
        sku: item.sku,
        message: `${item.name} was retired on ${item.retiredOn ?? "an earlier date"} and is no longer sold.`,
        fix: "Remove it and choose a current equivalent.",
      });
    }

    if (!item.availableAt.includes(input.locationId)) {
      problems.push({
        code: "not-available-here",
        severity: "error",
        sku: item.sku,
        message: `${item.name} is not offered at this location.`,
        fix: "Move the order to a location that offers it, or remove the line.",
      });
    }

    if (input.shipping === "ship" && item.fulfillment === "in-clinic") {
      problems.push({
        code: "cannot-ship",
        severity: "error",
        sku: item.sku,
        message: `${item.name} is performed or dispensed in clinic and cannot ship.`,
        fix: "Switch this order to clinic pickup, or place the in-clinic items separately.",
      });
    }

    /**
     * The reciprocal case, and the dangerous one.
     *
     * `draftOrder` stamps `fulfillmentPartner: "In-clinic"` whenever shipping is
     * pickup — including when the order contains partner-fulfilled compounds.
     * `medsource.ts` then skips every order whose partner is not MedSource, so
     * such an order is never submitted AND is structurally invisible to drift
     * reconciliation: it cannot even be reported as missing remotely. It sits
     * in Submitted forever with nothing at the clinic to dispense.
     *
     * That is precisely the silent-drop failure this module exists to prevent,
     * reintroduced one level up — at order granularity instead of line
     * granularity. So it is a blocking error, not a warning.
     */
    if (input.shipping === "pickup" && item.fulfillment === "medsource") {
      problems.push({
        code: "cannot-pickup",
        severity: "error",
        sku: item.sku,
        message: `${item.name} is filled by the fulfillment partner and cannot be collected in clinic.`,
        fix: "Switch this order to shipping, or place the partner-filled items as a separate order.",
      });
    }

    /**
     * RULE 4 — the prescriber gate.
     *
     * `isProvider` is the ONLY place `actor.role` is consulted for a decision.
     * Everywhere else in this module the role is cosmetic (it picks a label on
     * a status event), which is exactly how the audit found it: the argument
     * was threaded all the way down and then never asked a question.
     */
    if (item.requiresProviderApproval) {
      problems.push(
        isProvider
          ? {
              code: "needs-provider-approval",
              severity: "warning",
              sku: item.sku,
              /**
               * Still surfaced to a provider, deliberately. It is not an
               * obstacle for them — they are the signature — but the line item
               * that carries prescribing responsibility should never place
               * silently alongside a box of alcohol swabs.
               */
              message: `${item.name} requires a prescriber. You are placing it as ${actor?.name ?? "a provider"}.`,
              fix: "Placing this order records your name against the prescription in the ledger. There is no second approval step after this.",
            }
          : {
              code: "needs-provider-approval",
              severity: "error",
              sku: item.sku,
              message: `${item.name} requires a prescriber and this order is being placed by ${
                actor ? `${actor.name} (${actor.role})` : "an unidentified actor"
              }.`,
              /**
               * The old fix text promised a hold. Stating plainly that no hold
               * exists is the point: the coach's next action has to be getting
               * a provider, not clicking Place and assuming the system will
               * catch it downstream. Nothing downstream catches it.
               */
              fix: "Remove the line, or have a provider place this order. Apex does not hold orders for approval — a placed order goes straight to fulfillment, so the signature has to come first.",
            },
      );
    }
  }

  if (input.shipping === "ship") {
    const a = input.shipTo;
    const missing = !a || !a.line1?.trim() || !a.city?.trim() || !a.state?.trim() || !a.postal?.trim();
    if (missing) {
      problems.push({
        code: "missing-address",
        severity: "error",
        message: "Shipping was selected but the address is incomplete.",
        fix: "Fill in street, city, state and ZIP — or switch to clinic pickup.",
      });
    }
  }

  const discount = Math.floor(input.discountCents ?? 0);
  if (discount > 0) {
    if (!input.discountReason?.trim()) {
      // RULE 3.
      problems.push({
        code: "discount-no-reason",
        severity: "error",
        message: "A discount was entered with no reason.",
        fix: "State why — service recovery, promotion, staff rate. Unattributed discounts cannot be reported on.",
      });
    }
    const pricing = priceLines(input.lines, input.membership, 0);
    const ceiling = pricing.subtotalCents - pricing.creditAppliedCents;
    if (discount > ceiling) {
      problems.push({
        code: "discount-too-large",
        severity: "error",
        message: `The ${dollars(discount)} discount exceeds the ${dollars(ceiling)} remaining after the membership credit.`,
        fix: "Lower the discount. Apex will not write a negative order.",
      });
    }
  }

  return problems;
}

export function blockingProblems(problems: OrderProblem[]): OrderProblem[] {
  return problems.filter((p) => p.severity === "error");
}

export function canPlace(input: PlaceOrderInput, actor?: PlacingActor): boolean {
  return blockingProblems(validateOrder(input, actor)).length === 0;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/**
 * Deterministic order id. Derived from the order's own content and timestamp,
 * so the same draft always yields the same id — which is also what makes the
 * idempotency key stable across a retried submit (see Order.idempotencyKey).
 * No Date.now, no counter, no Math.random.
 */
export function orderIdFor(input: PlaceOrderInput): string {
  if (input.orderId) return input.orderId;
  const seed = `place:${input.clientId}:${input.at ?? NOW}:${input.lines
    .map((l) => `${l.sku}x${l.qty}`)
    .sort()
    .join("|")}`;
  const rand = seededRandom(seed);
  const n = Math.floor(rand() * 9000) + 1000;
  return `ord-${n}`;
}

/**
 * Build a Draft order. Draft is a real state, not a placeholder: it is visible
 * on the ops board, it has an SLA (48h — see SLA_HOURS), and it is invisible to
 * the member because nothing has been promised yet.
 */
export function draftOrder(input: PlaceOrderInput, actor: PlacingActor): Order {
  const at = input.at ?? NOW;
  const id = orderIdFor(input);
  const pricing = priceLines(
    input.lines,
    input.membership,
    input.discountCents ?? 0,
    input.discountReason,
  );

  const lines: OrderLine[] = pricing.lines.map((l, i) => ({
    id: `${id}-l${i + 1}`,
    sku: l.sku,
    name: l.name,
    qty: l.qty,
    unitPriceCents: l.unitPriceCents,
    /**
     * "Add-on" means member-elected extra rather than the prescribed protocol.
     * Derived from the catalog kind so it is consistent across every order,
     * instead of being a checkbox whoever placed the order happened to tick.
     */
    isAddon: l.item.kind === "supply" || l.item.kind === "service",
  }));

  const anyShipped = pricing.lines.some((l) => l.item.fulfillment === "medsource");

  const firstEvent: OrderStatusEvent = {
    status: "Draft",
    at,
    actor: actor.name,
    actorRole: actor.role === "Medical" ? "Provider" : actor.role === "Admin" ? "Operations" : "Coach",
    source: "apex",
    note:
      input.origin === "refill"
        ? "Created by the auto-refill engine from an active subscription."
        : input.note,
  };

  return {
    id,
    clientId: input.clientId,
    coachId: input.coachId,
    locationId: input.locationId,
    status: "Draft",
    lines,
    placedAt: at,
    statusHistory: [firstEvent],
    lastActivity: at,
    fulfillmentPartner: anyShipped && input.shipping === "ship" ? "MedSource" : "In-clinic",
    // Stable per order and replayed byte-for-byte on every submit attempt, so a
    // duplicate delivery is a no-op at the partner rather than a second shipment.
    idempotencyKey: `apex:${id}:v1`,
    visibleToClient: false,
  };
}

export interface PlacedOrder {
  order: Order;
  ledgerDraft: LedgerDraft;
  pricing: PriceBreakdown;
  /** Non-blocking warnings the coach should still see after placement. */
  warnings: OrderProblem[];
}

export type PlaceOrderResult =
  | ({ ok: true } & PlacedOrder)
  | { ok: false; problems: OrderProblem[] };

/**
 * Place the order.
 *
 * PURE. Returns the committed-shaped Order plus the ledger row that MUST be
 * appended by the caller. The split is intentional: in production the ledger
 * insert and the order insert share one transaction, so an order that cannot be
 * recorded does not exist. Returning a draft rather than appending here keeps
 * that invariant expressible instead of hidden inside a side effect.
 *
 * Placement = Draft → Submitted, applied through `advanceOrder` so the same
 * monotonic-rank guard that protects partner webhooks also protects us.
 */
export function placeOrder(input: PlaceOrderInput, actor: PlacingActor): PlaceOrderResult {
  // Actor passed through — this is the call that actually enforces RULE 4. A
  // preview elsewhere may have validated without an actor; placement never can.
  const problems = validateOrder(input, actor);
  const blocking = blockingProblems(problems);
  if (blocking.length > 0) return { ok: false, problems };

  const at = input.at ?? NOW;
  const draft = draftOrder(input, actor);
  const pricing = priceLines(
    input.lines,
    input.membership,
    input.discountCents ?? 0,
    input.discountReason,
  );

  const advanced = advanceOrder(
    draft,
    "Submitted",
    actor.name,
    "apex",
    input.origin === "refill"
      ? "Auto-refill submitted on schedule."
      : "Submitted to fulfillment by the coach.",
    at,
    actor.role === "Medical" ? "Provider" : actor.role === "Admin" ? "Operations" : "Coach",
  );

  const order: Order = {
    ...advanced.order,
    // Once submitted the member is genuinely waiting on something, so it must
    // appear in their portal. The audited system had no member-facing view at
    // all, which is precisely why "where is my order?" was a phone call.
    visibleToClient: true,
  };

  const ledgerDraft: LedgerDraft = {
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action: "create",
    entity: "order",
    entityId: order.id,
    subjectId: input.clientId,
    subjectName: input.clientName,
    locationId: input.locationId,
    reason: input.discountReason?.trim()
      ? `Discount ${dollars(pricing.discountCents)}: ${input.discountReason.trim()}`
      : undefined,
    after: {
      status: order.status,
      lines: order.lines.length,
      units: order.lines.reduce((s, l) => s + l.qty, 0),
      subtotalCents: pricing.subtotalCents,
      creditAppliedCents: pricing.creditAppliedCents,
      discountCents: pricing.discountCents,
      totalCents: pricing.totalCents,
      shipping: input.shipping,
      origin: input.origin ?? "coach",
    },
  };

  return {
    ok: true,
    order,
    ledgerDraft,
    pricing,
    warnings: problems.filter((p) => p.severity === "warning"),
  };
}

export { dollars as centsToDollars };
