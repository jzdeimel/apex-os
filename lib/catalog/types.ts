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
export type Fulfillment = "medsource" | "in-clinic" | "none";

export interface CatalogItem {
  id: string;
  /**
   * The join key to inventory and to OrderLine.sku. Deliberately the SAME
   * vocabulary as lib/mock/inventory.ts so a dispensed line binds to a real lot
   * and a recall question ("who received lot BPC-2604A?") is answerable.
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
}

/** A validation problem raised against catalog data itself. */
export interface CatalogProblem {
  sku: string;
  message: string;
}
