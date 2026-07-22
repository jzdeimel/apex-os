import type { CatalogItem } from "@/lib/catalog/types";

/**
 * WHERE A REQUEST GOES — the three-way routing decision.
 *
 * Paul Kennard laid the rules out on the 2026-07-21 sync and they are three
 * paths, not two. Apex modelled two.
 *
 *   1. COACH-ORDERABLE. MedSource carries it and no prescriber is required.
 *      "GHK doesn't require a doctor's intervention in order to prescribe, so
 *      that quite literally is the coach going 'here, I can just pull up the
 *      order screen and order it'."
 *
 *   2. PROVIDER-SIGNATURE-REQUIRED. Needs a prescriber, and MedSource fills it.
 *
 *   3. EXTERNAL-RX. MedSource does NOT carry it. "Somebody requests PT-141 —
 *      that is not on the list of peptides or products that MedSource offers.
 *      Therefore it must go to a doctor, it must have a prescription, and it
 *      must get sent to an actual pharmacy to get fulfilled."
 *
 * The third had nowhere to go. An item like that was either mislabelled
 * `medsource` — and would be submitted to a partner who does not stock it — or
 * `none`, and would be fulfilled by nobody at all. Both fail identically from
 * the patient's side: the order never arrives and no screen knows why.
 *
 * ── WHY THIS IS A MODULE AND NOT A CONDITION IN THE ORDER FORM ─────────────
 * Because the order form is where rules go to be bypassed. `lib/orders/place.ts`
 * already carries the scar tissue: `requiresProviderApproval` was rendered as
 * fine print rather than enforced, and the audit found the prescriber gate had
 * been threaded all the way down and then never asked a question. A routing
 * decision that lives in a pure function over data can be tested, replayed and
 * pointed at; one that lives in JSX gets forgotten by the next surface that
 * places an order.
 *
 * PURE. No fetch, no clock, no actor lookup — same shape as
 * lib/orders/medsource.ts, and for the same reason.
 */

export type OrderRoute =
  /** The coach can place it themselves, today. */
  | "coach-orderable"
  /** A licensed provider must place or sign it; MedSource fills it. */
  | "provider-signature-required"
  /** Needs a prescription AND an outside pharmacy. Apex cannot fulfil it. */
  | "external-rx"
  /** Cannot be ordered at all right now. `reason` says why. */
  | "blocked";

export interface RoutingDecision {
  route: OrderRoute;
  /** One line, in the coach's language. Shown, not logged. */
  reason: string;
  /** What the person in front of the screen should do next. */
  nextStep: string;
}

export interface RoutingContext {
  /**
   * The state the PATIENT is in — not the clinic's state.
   *
   * Same principle as telehealth licensure in lib/booking/availability.ts: the
   * transaction happens where the patient is. Undefined means unknown, and
   * unknown is not the same as unrestricted — see below.
   */
  patientState?: string;
  /** On-hand units. Only consulted for sell-through items. */
  quantityOnHand?: number;
}

/**
 * Route one catalog item.
 *
 * ORDERING OF THE CHECKS MATTERS. Blocks come first, because an item that
 * cannot be ordered at all should not be described as "coach-orderable, but".
 * A coach who reads the route before the caveat is behaving reasonably; the
 * function should not require them to read to the end.
 */
export function routeRequest(item: CatalogItem, ctx: RoutingContext = {}): RoutingDecision {
  // ── Blocks ───────────────────────────────────────────────────────────────

  if (!item.active) {
    return {
      route: "blocked",
      reason: `${item.name} is retired and cannot be ordered.`,
      nextStep: "Pick a current item, or ask the owner whether this should come back.",
    };
  }

  if (item.lifecycle === "sell-through") {
    const onHand = ctx.quantityOnHand;
    if (onHand !== undefined && onHand <= 0) {
      return {
        route: "blocked",
        reason: `${item.name} is being discontinued and the last batch is gone.`,
        nextStep:
          "Nothing to reorder — this item is not being restocked. Talk to the provider about an alternative.",
      };
    }
    // Still fillable from stock on hand. Falls through to the normal routing
    // below so the prescriber rules still apply — being on the way out does not
    // make a controlled substance orderable by a coach.
  }

  if (item.allowedStates && item.allowedStates.length === 0) {
    // An empty allow-list is a data error, not a rule. Reported as a block so
    // it surfaces the first time someone tries, rather than silently permitting.
    return {
      route: "blocked",
      reason: `${item.name} has no permitted states configured.`,
      nextStep: "This is a catalog data problem. It needs fixing in the catalog, not worked around.",
    };
  }

  const state = ctx.patientState;
  if (state) {
    if (item.restrictedStates?.includes(state)) {
      return {
        route: "blocked",
        reason: `${item.name} cannot be sent to ${state}.`,
        nextStep: "Ask the provider what is appropriate for a patient in this state.",
      };
    }
    if (item.allowedStates && !item.allowedStates.includes(state)) {
      return {
        route: "blocked",
        reason: `${item.name} is only available in ${item.allowedStates.join(", ")}.`,
        nextStep: "Ask the provider what is appropriate for a patient in this state.",
      };
    }
  } else if (item.allowedStates || item.restrictedStates) {
    /**
     * State rules exist and we do not know where the patient is. FAIL CLOSED.
     *
     * The tempting alternative is to let it through and check later. There is
     * no later — `place.ts` submits straight to fulfilment, which is stated
     * plainly in its own docblock ("Apex does not hold orders for approval").
     */
    return {
      route: "blocked",
      reason: `${item.name} has state restrictions and we do not have the patient's state on file.`,
      nextStep: "Add the patient's address to their chart, then place the order.",
    };
  }

  // ── Routing ──────────────────────────────────────────────────────────────

  if (item.fulfillment === "external-pharmacy") {
    return {
      route: "external-rx",
      reason: `${item.name} is not carried by MedSource, so it needs a prescription sent to an outside pharmacy.`,
      nextStep:
        "Push this to medical. The provider writes the prescription and sends it to the pharmacy — Apex does not fulfil it and will not track the shipment.",
    };
  }

  if (item.requiresProviderApproval) {
    return {
      route: "provider-signature-required",
      reason: `${item.name} requires a prescriber.`,
      nextStep:
        "A provider has to place this — there is no approval step afterwards. Push it to medical, or have the provider order it directly.",
    };
  }

  return {
    route: "coach-orderable",
    reason: `${item.name} does not require a prescriber and is filled by MedSource.`,
    nextStep: "You can place this yourself.",
  };
}

/** True when the coach can complete this without anyone else. */
export function coachCanPlace(item: CatalogItem, ctx: RoutingContext = {}): boolean {
  return routeRequest(item, ctx).route === "coach-orderable";
}

/**
 * Route a whole basket, keeping the lines that need different things apart.
 *
 * A mixed order is the common case and the interesting one — a coach adds
 * syringes, BPC-157 and PT-141 in one go. Those three take three different
 * paths and the screen has to say so before the coach clicks Place, not after.
 */
export function routeBasket(
  items: ReadonlyArray<{ item: CatalogItem; ctx?: RoutingContext }>,
): {
  coachOrderable: CatalogItem[];
  needsProvider: CatalogItem[];
  externalRx: CatalogItem[];
  blocked: Array<{ item: CatalogItem; reason: string }>;
} {
  const out = {
    coachOrderable: [] as CatalogItem[],
    needsProvider: [] as CatalogItem[],
    externalRx: [] as CatalogItem[],
    blocked: [] as Array<{ item: CatalogItem; reason: string }>,
  };

  for (const { item, ctx } of items) {
    const decision = routeRequest(item, ctx ?? {});
    switch (decision.route) {
      case "coach-orderable":
        out.coachOrderable.push(item);
        break;
      case "provider-signature-required":
        out.needsProvider.push(item);
        break;
      case "external-rx":
        out.externalRx.push(item);
        break;
      case "blocked":
        out.blocked.push({ item, reason: decision.reason });
        break;
    }
  }

  return out;
}
