import type { LocationId } from "@/lib/types";

/**
 * THE CATALOG — what Apex is allowed to sell, and where.
 *
 * WHY THIS FILE EXISTS AT ALL.
 * The system Apex replaces had no catalog. It had a frozen twelve-element array
 * compiled into the order screen, and an order line whose product name was a
 * free-text string. Two consequences, both of which we watched cost real money:
 *
 *  1. A product the clinic genuinely sold but the array did not list could be
 *     typed into an order and then SILENTLY DROPPED at submit — the fulfillment
 *     mapper looked the SKU up, got undefined, and `continue`d. The patient's
 *     order shipped short and nobody found out until the patient called.
 *  2. Price lived in the same array. Changing a price meant a deploy, so prices
 *     went stale, and staff "fixed" it with an untracked manual discount.
 *
 * So: the catalog is DATA, administered inside Apex, versioned, and closed.
 * `lib/orders/place.ts` treats an unknown SKU as a hard validation ERROR the
 * coach must resolve. Nothing is ever dropped quietly again.
 *
 * MONEY IS INTEGER CENTS, EVERYWHERE.
 * `unitPriceCents` is an integer number of cents and never a float. A dollar
 * float cannot represent $349.90 exactly; sum a hundred of those against a
 * membership credit and the total drifts by a cent, which is the kind of defect
 * that surfaces as an unreconcilable ledger six months later.
 *
 * RETIREMENT IS SOFT, NEVER DELETION.
 * Old orders reference items that are no longer sold. Deleting the row would
 * orphan history, so `active: false` + `retiredOn` is the only way an item
 * leaves the shelf. `version` increments on any substantive change, so an order
 * can record which revision of an item it was priced against.
 */

export type CatalogKind =
  | "compound"
  | "medication"
  | "service"
  | "lab-panel"
  | "package"
  | "supply";

/**
 * The clinical service line an item belongs to. Mirrors how Alpha Health talks
 * about its own business, so revenue rolls up the way the operators think.
 */
export type ServiceLine =
  | "Peptide Therapy"
  | "Hormone Therapy"
  | "Metabolic & Weight Loss"
  | "Sexual Health"
  | "Recovery & Performance"
  | "Diagnostics"
  | "Clinical Services"
  | "Supplies";

/**
 * Who physically fulfills the item.
 *  - "medsource" — ships from the pharmacy partner; the order crosses the seam
 *    modelled in lib/orders/types.ts.
 *  - "in-clinic"  — dispensed or performed at a location; never leaves.
 *  - "none"       — nothing to fulfill (a consult fee, a package purchase).
 *
 * This drives the ship/pickup decision on the order form, which is why it lives
 * on the item rather than being guessed from the item's name at submit time.
 */
export type Fulfillment =
  | "medsource"
  | "in-clinic"
  /**
   * Filled by an OUTSIDE pharmacy against a real prescription.
   *
   * The missing third path. Paul Kennard, 2026-07-21, on PT-141: "that is not
   * on the list of peptides or products that MedSource offers. Therefore it
   * must go to a doctor, it must have a prescription, and it must get sent to
   * an actual pharmacy to get fulfilled."
   *
   * Without this value such an item had nowhere to go: it was either mislabelled
   * `medsource` (and would be submitted to a partner who does not stock it) or
   * `none` (and would be quietly fulfilled by nobody). Both fail the same way —
   * the patient's order does not arrive and nothing in the system knows.
   */
  | "external-pharmacy"
  | "none";

export interface CatalogItem {
  id: string;
  /**
   * The join key to inventory and to OrderLine.sku. Deliberately the SAME
   * vocabulary as lib/mock/inventory.ts.
   *
   * WHAT THIS DOES AND DOES NOT BUY YOU — read before citing it as a capability.
   * This comment previously claimed the shared vocabulary made a recall question
   * ("who received lot BPC-2604A?") answerable. It does not, and the audit was
   * right to call that out. SKU agreement is one of four things the recall join
   * needs, and it is the only one that exists:
   *
   *   1. SKU vocabulary agreement                         — DONE, this field.
   *   2. Order lots drawn from real inventory lots        — NOT DONE.
   *      `lib/mock/orders.ts:308` fabricates `OrderLine.lotRef` from a third,
   *      private catalog's `lotPrefix`. Order lots (BPC-2604K) match inventory
   *      lots (BPC-2604A) only by coincidence.
   *   3. A lot → patient query                            — NOT DONE.
   *      No `byLot` / `recall` selector exists anywhere in the repo.
   *   4. A dispense record for in-clinic administration   — NOT DONE.
   *      In-clinic fulfilment writes nothing, and `inventory.quantity` never
   *      decrements, so a vial drawn at a location leaves no lot trail at all.
   *
   * Until 2–4 land, this is a SKU that resolves, not a recall that closes. For
   * Schedule III testosterone and compounded GLP-1s, an unanswerable recall is
   * a regulatory event, so do not treat the sentence above as shipped.
   */
  sku: string;
  name: string;
  kind: CatalogKind;
  serviceLine: ServiceLine;
  /** Integer cents. Never a float. See the header note. */
  unitPriceCents: number;
  fulfillment: Fulfillment;
  /**
   * Whether a licensed provider must sign before this can leave the building.
   * Compounded and prescription items are true; a syringe pack is not. The
   * order form surfaces this as a blocking validation problem, not as fine
   * print — the audited system printed it as fine print.
   */
  requiresProviderApproval: boolean;
  /**
   * Locations that may sell it. Telehealth is a location here, and that is the
   * point: a state-restricted or cold-chain item can be excluded from remote
   * ordering by data rather than by a coach remembering.
   */
  availableAt: LocationId[];
  /** Human unit description where a unit isn't obvious ("30ct", "5mg vial"). */
  packSize?: string;
  active: boolean;
  /** ISO date. Set together with active:false. */
  retiredOn?: string;
  /** Increments on any substantive change. Orders record what they priced against. */
  version: number;

  /**
   * Where this may be shipped, when the answer is narrower than `availableAt`.
   *
   * `availableAt` is about which CLINIC may sell it. This is about which STATE
   * the patient may receive it in, which is a different question with a legal
   * answer — Matt Chilson raised it on 2026-07-21 ("there are states, Ohio for
   * example, where [providers] will approve medications... we need to figure
   * out the parameters around that so we can route this correctly").
   *
   * Undefined means unrestricted. An empty array means nowhere, and is a data
   * error rather than a silent block — `catalogProblems` reports it.
   */
  allowedStates?: string[];
  /** Explicitly barred states. Applied after `allowedStates`. */
  restrictedStates?: string[];

  /**
   * Where the item is in its life, when `active` cannot express it.
   *
   * `active` + `retiredOn` is binary, and the HCG decision is not: Paul Kennard
   * and Matt Chilson agreed MedSource stops distributing hCG "once we run
   * through this batch" because it is a controlled substance. That is a third
   * state — fillable from stock on hand, closed to reorder, retiring itself at
   * zero. Modelling it as `active: true` loses the decision entirely and lets
   * someone reorder; modelling it as `active: false` strands inventory that
   * patients are still owed.
   */
  lifecycle?: "available" | "sell-through";

  /**
   * A controlled substance under federal or state schedule.
   *
   * Drives the PDMP and controlled-substance paths (lib/clinical/controlled.ts,
   * `pdmp_check`). Explicit rather than inferred from the name, because
   * inferring a legal classification from a product string is exactly the kind
   * of guess that is wrong once and expensive.
   */
  controlled?: boolean;
}

/** A validation problem raised against catalog data itself. */
export interface CatalogProblem {
  sku: string;
  message: string;
}
