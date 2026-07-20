import type { LocationId } from "@/lib/types";
import type { CatalogItem, CatalogKind, ServiceLine } from "@/lib/catalog/types";

/**
 * The Alpha Health catalog.
 *
 * Administered in Apex (see app/settings for the admin surface owned elsewhere);
 * this module is the read model every ordering surface uses. It is a plain
 * exported array rather than a fetch because Apex is demo-shaped — but the
 * ACCESS SHAPE is the production shape: nothing outside this file indexes the
 * array directly, everything goes through the selectors below. Swapping the
 * constant for a Postgres query later touches this file and nothing else.
 *
 * Prices are integer cents and reflect list price. Membership credit and
 * discounts are applied at pricing time in lib/orders/place.ts — never baked
 * into the catalog, because a discounted list price is a discount nobody can
 * audit afterwards.
 */

const CLINICS: LocationId[] = [
  "raleigh",
  "raleigh-boutique",
  "southern-pines",
  "myrtle-beach",
];

/** Everywhere, telehealth included — shippable and not state-restricted. */
const EVERYWHERE: LocationId[] = [...CLINICS, "telehealth"];

/**
 * Seeded catalog.
 *
 * SKUs that also appear in lib/mock/orders.ts and lib/mock/inventory.ts are
 * intentionally byte-identical, so an order placed through this catalog joins
 * cleanly to existing lots and existing order history. A second vocabulary is
 * how the audited system ended up unable to answer "is this the same product?"
 */
export const catalog: CatalogItem[] = [
  // --- Peptide Therapy -----------------------------------------------------
  {
    id: "cat-001",
    sku: "PEP-BPC-5MG",
    name: "BPC-157 / TB-500 blend 5mg",
    kind: "compound",
    serviceLine: "Peptide Therapy",
    unitPriceCents: 18_500,
    fulfillment: "medsource",
    requiresProviderApproval: true,
    availableAt: EVERYWHERE,
    packSize: "5mg vial",
    active: true,
    version: 3,
  },
  {
    id: "cat-002",
    sku: "PEP-SERM-15",
    name: "Sermorelin 15mg",
    kind: "compound",
    serviceLine: "Peptide Therapy",
    unitPriceCents: 21_500,
    fulfillment: "medsource",
    requiresProviderApproval: true,
    availableAt: EVERYWHERE,
    packSize: "15mg vial",
    active: true,
    version: 2,
  },
  {
    id: "cat-003",
    sku: "PEP-IPACJC-10",
    name: "Ipamorelin / CJC-1295 10mg",
    kind: "compound",
    serviceLine: "Peptide Therapy",
    unitPriceCents: 24_500,
    fulfillment: "medsource",
    requiresProviderApproval: true,
    availableAt: EVERYWHERE,
    packSize: "10mg vial",
    active: true,
    version: 2,
  },
  {
    id: "cat-004",
    sku: "PEP-GHKCU-50",
    name: "GHK-Cu 50mg",
    kind: "compound",
    serviceLine: "Peptide Therapy",
    unitPriceCents: 16_500,
    fulfillment: "medsource",
    requiresProviderApproval: true,
    availableAt: EVERYWHERE,
    packSize: "50mg vial",
    active: true,
    version: 1,
  },
  {
    id: "cat-005",
    sku: "PEP-PT141-10",
    name: "PT-141 10mg",
    kind: "compound",
    serviceLine: "Sexual Health",
    unitPriceCents: 13_500,
    fulfillment: "medsource",
    requiresProviderApproval: true,
    availableAt: EVERYWHERE,
    packSize: "10mg vial",
    active: true,
    version: 2,
  },
  {
    id: "cat-006",
    sku: "PEP-MK677-25",
    name: "Ibutamoren / MK-677 25mg",
    kind: "compound",
    serviceLine: "Recovery & Performance",
    unitPriceCents: 11_900,
    fulfillment: "medsource",
    requiresProviderApproval: true,
    availableAt: EVERYWHERE,
    packSize: "30ct",
    active: true,
    version: 1,
  },

  // --- Metabolic & Weight Loss --------------------------------------------
  {
    id: "cat-010",
    sku: "GLP-SEMA-2.5",
    name: "Semaglutide 2.5mg",
    kind: "compound",
    serviceLine: "Metabolic & Weight Loss",
    unitPriceCents: 34_900,
    fulfillment: "medsource",
    requiresProviderApproval: true,
    availableAt: EVERYWHERE,
    packSize: "2.5mg vial",
    active: true,
    version: 5,
  },
  {
    id: "cat-011",
    sku: "GLP-TIRZ-5",
    name: "Tirzepatide 5mg",
    kind: "compound",
    serviceLine: "Metabolic & Weight Loss",
    unitPriceCents: 44_900,
    fulfillment: "medsource",
    requiresProviderApproval: true,
    availableAt: EVERYWHERE,
    packSize: "5mg vial",
    active: true,
    version: 4,
  },
  {
    id: "cat-012",
    sku: "GLP-RETA-10",
    name: "Retatrutide 10mg",
    kind: "compound",
    serviceLine: "Metabolic & Weight Loss",
    unitPriceCents: 59_900,
    fulfillment: "medsource",
    requiresProviderApproval: true,
    availableAt: EVERYWHERE,
    packSize: "10mg vial",
    active: true,
    version: 2,
  },
  {
    id: "cat-013",
    sku: "GLP-SEMA-1.0",
    name: "Semaglutide 1.0mg (titration)",
    kind: "compound",
    serviceLine: "Metabolic & Weight Loss",
    unitPriceCents: 24_900,
    fulfillment: "medsource",
    requiresProviderApproval: true,
    availableAt: EVERYWHERE,
    packSize: "1.0mg vial",
    active: true,
    version: 3,
  },

  // --- Hormone Therapy -----------------------------------------------------
  {
    id: "cat-020",
    sku: "HRT-TCYP-200",
    name: "Testosterone cypionate 200mg/mL",
    kind: "medication",
    serviceLine: "Hormone Therapy",
    unitPriceCents: 12_900,
    fulfillment: "medsource",
    requiresProviderApproval: true,
    availableAt: EVERYWHERE,
    packSize: "10mL vial",
    active: true,
    version: 6,
  },
  {
    id: "cat-021",
    sku: "HRT-HCG-5000",
    name: "hCG 5,000 IU",
    kind: "compound",
    serviceLine: "Hormone Therapy",
    unitPriceCents: 15_900,
    fulfillment: "medsource",
    requiresProviderApproval: true,
    availableAt: EVERYWHERE,
    packSize: "5,000 IU vial",
    active: true,
    version: 2,
  },
  {
    id: "cat-022",
    sku: "HRT-ANAS-1MG",
    name: "Anastrozole 1mg",
    kind: "medication",
    serviceLine: "Hormone Therapy",
    unitPriceCents: 4_900,
    fulfillment: "medsource",
    requiresProviderApproval: true,
    availableAt: EVERYWHERE,
    packSize: "30ct",
    active: true,
    version: 2,
  },
  {
    id: "cat-023",
    sku: "HRT-ESTR-0.1",
    name: "Estradiol 0.1mg/mL",
    kind: "compound",
    serviceLine: "Hormone Therapy",
    unitPriceCents: 9_900,
    fulfillment: "medsource",
    requiresProviderApproval: true,
    availableAt: EVERYWHERE,
    packSize: "5mL vial",
    active: true,
    version: 2,
  },
  {
    id: "cat-024",
    sku: "HRT-PROG-100",
    name: "Progesterone 100mg",
    kind: "medication",
    serviceLine: "Hormone Therapy",
    unitPriceCents: 6_900,
    fulfillment: "medsource",
    requiresProviderApproval: true,
    availableAt: EVERYWHERE,
    packSize: "60ct",
    active: true,
    version: 1,
  },

  // --- Recovery & Performance (IV / in-clinic infusions) -------------------
  {
    id: "cat-030",
    sku: "IV-NAD-500",
    name: "NAD+ 500mg infusion",
    kind: "service",
    serviceLine: "Recovery & Performance",
    unitPriceCents: 22_500,
    fulfillment: "in-clinic",
    requiresProviderApproval: true,
    // Cold-chain infusion performed on site. Excluded from telehealth BY DATA,
    // not by a coach remembering it can't be shipped.
    availableAt: CLINICS,
    packSize: "per infusion",
    active: true,
    version: 3,
  },
  {
    id: "cat-031",
    sku: "IV-GLUT-2000",
    name: "Glutathione 2,000mg push",
    kind: "service",
    serviceLine: "Recovery & Performance",
    unitPriceCents: 9_900,
    fulfillment: "in-clinic",
    requiresProviderApproval: false,
    availableAt: CLINICS,
    packSize: "per push",
    active: true,
    version: 2,
  },
  {
    id: "cat-032",
    sku: "IV-HYDR-BASE",
    name: "Alpha Hydration IV",
    kind: "service",
    serviceLine: "Recovery & Performance",
    unitPriceCents: 17_500,
    fulfillment: "in-clinic",
    requiresProviderApproval: false,
    availableAt: CLINICS,
    packSize: "1L bag",
    active: true,
    version: 1,
  },

  // --- Clinical Services ---------------------------------------------------
  {
    id: "cat-040",
    sku: "SVC-CONSULT-NEW",
    name: "Initial provider consult",
    kind: "service",
    serviceLine: "Clinical Services",
    unitPriceCents: 19_900,
    fulfillment: "none",
    requiresProviderApproval: false,
    availableAt: EVERYWHERE,
    packSize: "45 min",
    active: true,
    version: 2,
  },
  {
    id: "cat-041",
    sku: "SVC-CONSULT-FU",
    name: "Follow-up consult",
    kind: "service",
    serviceLine: "Clinical Services",
    unitPriceCents: 9_900,
    fulfillment: "none",
    requiresProviderApproval: false,
    availableAt: EVERYWHERE,
    packSize: "20 min",
    active: true,
    version: 2,
  },
  {
    id: "cat-042",
    sku: "SVC-INBODY",
    name: "InBody body composition scan",
    kind: "service",
    serviceLine: "Clinical Services",
    unitPriceCents: 4_500,
    fulfillment: "in-clinic",
    requiresProviderApproval: false,
    availableAt: CLINICS,
    packSize: "per scan",
    active: true,
    version: 1,
  },

  // --- Diagnostics ---------------------------------------------------------
  {
    id: "cat-050",
    sku: "LAB-BASE",
    name: "Alpha Base Panel",
    kind: "lab-panel",
    serviceLine: "Diagnostics",
    unitPriceCents: 29_900,
    fulfillment: "none",
    requiresProviderApproval: false,
    availableAt: EVERYWHERE,
    packSize: "48 biomarkers",
    active: true,
    version: 4,
  },
  {
    id: "cat-051",
    sku: "LAB-FOLLOWUP",
    name: "Follow-up Panel (90 day)",
    kind: "lab-panel",
    serviceLine: "Diagnostics",
    unitPriceCents: 17_900,
    fulfillment: "none",
    requiresProviderApproval: false,
    availableAt: EVERYWHERE,
    packSize: "22 biomarkers",
    active: true,
    version: 3,
  },
  {
    id: "cat-052",
    sku: "LAB-THYROID",
    name: "Thyroid add-on panel",
    kind: "lab-panel",
    serviceLine: "Diagnostics",
    unitPriceCents: 8_900,
    fulfillment: "none",
    requiresProviderApproval: false,
    availableAt: EVERYWHERE,
    packSize: "6 biomarkers",
    active: true,
    version: 2,
  },

  // --- Supplies ------------------------------------------------------------
  {
    id: "cat-060",
    sku: "SUP-INJ-29G",
    name: "Injection supply kit (29G, 30ct)",
    kind: "supply",
    serviceLine: "Supplies",
    unitPriceCents: 2_900,
    fulfillment: "medsource",
    requiresProviderApproval: false,
    availableAt: EVERYWHERE,
    packSize: "30ct",
    active: true,
    version: 1,
  },
  {
    id: "cat-061",
    sku: "SUP-BACWATER-30",
    name: "Bacteriostatic water 30mL",
    kind: "supply",
    serviceLine: "Supplies",
    unitPriceCents: 1_800,
    fulfillment: "medsource",
    requiresProviderApproval: false,
    availableAt: EVERYWHERE,
    packSize: "30mL vial",
    active: true,
    version: 1,
  },
  {
    id: "cat-062",
    sku: "SUP-ALC-100",
    name: "Alcohol prep pads (100ct)",
    kind: "supply",
    serviceLine: "Supplies",
    unitPriceCents: 600,
    fulfillment: "medsource",
    requiresProviderApproval: false,
    availableAt: EVERYWHERE,
    packSize: "100ct",
    active: true,
    version: 1,
  },
  {
    id: "cat-063",
    sku: "SUP-SHARPS-1QT",
    name: "Sharps container 1qt",
    kind: "supply",
    serviceLine: "Supplies",
    unitPriceCents: 1_200,
    fulfillment: "in-clinic",
    requiresProviderApproval: false,
    availableAt: CLINICS,
    packSize: "1 quart",
    active: true,
    version: 1,
  },

  // --- Packages ------------------------------------------------------------
  {
    id: "cat-070",
    sku: "PKG-TRT-START",
    name: "TRT Starter Package (90 day)",
    kind: "package",
    serviceLine: "Hormone Therapy",
    unitPriceCents: 74_900,
    fulfillment: "medsource",
    requiresProviderApproval: true,
    availableAt: EVERYWHERE,
    packSize: "90 day supply + supplies",
    active: true,
    version: 2,
  },
  {
    id: "cat-071",
    sku: "PKG-METAB-90",
    name: "Metabolic Reset Package (90 day)",
    kind: "package",
    serviceLine: "Metabolic & Weight Loss",
    unitPriceCents: 129_900,
    fulfillment: "medsource",
    requiresProviderApproval: true,
    availableAt: EVERYWHERE,
    packSize: "90 day titration + coaching",
    active: true,
    version: 3,
  },

  // --- Retired -------------------------------------------------------------
  {
    /**
     * Kept on purpose. Orders placed before 2026-02-01 reference this SKU, and
     * deleting the row would orphan that history — a real order would render as
     * "unknown product". Soft retirement is the only exit from the shelf.
     */
    id: "cat-090",
    sku: "PEP-MELAN-10",
    name: "Melanotan II 10mg",
    kind: "compound",
    serviceLine: "Peptide Therapy",
    unitPriceCents: 12_500,
    fulfillment: "medsource",
    requiresProviderApproval: true,
    availableAt: EVERYWHERE,
    packSize: "10mg vial",
    active: false,
    retiredOn: "2026-02-01",
    version: 4,
  },

  // --- Stocked at a clinic but previously missing from the catalog ---------
  // These three were carried in lib/mock/inventory.ts with no catalog row, so
  // a lot on the shelf had no sellable item to bind to and the SKU vocabularies
  // had quietly diverged. Adding them closes the loop: every stocked SKU now
  // resolves, which is what makes a recall question answerable.
  {
    id: "cat-091",
    sku: "PEP-VIP-NS",
    name: "VIP nasal spray",
    kind: "compound",
    serviceLine: "Peptide Therapy",
    unitPriceCents: 21_000,
    fulfillment: "medsource",
    requiresProviderApproval: true,
    availableAt: EVERYWHERE,
    packSize: "bottle",
    active: true,
    version: 1,
  },
  {
    id: "cat-092",
    sku: "WL-TESO-500",
    name: "Tesofensine 500mcg",
    kind: "compound",
    serviceLine: "Metabolic & Weight Loss",
    unitPriceCents: 28_500,
    fulfillment: "medsource",
    requiresProviderApproval: true,
    availableAt: EVERYWHERE,
    packSize: "bottle",
    active: true,
    version: 1,
  },
  {
    // A consumable: dispensed as part of an infusion, never shipped and never
    // needing a signature, so `in-clinic` and no provider approval.
    id: "cat-093",
    sku: "SUP-IV-SET",
    name: "IV infusion set",
    kind: "supply",
    serviceLine: "Supplies",
    unitPriceCents: 1_500,
    fulfillment: "in-clinic",
    requiresProviderApproval: false,
    availableAt: CLINICS,
    packSize: "set",
    active: true,
    version: 1,
  },
];

const bySku: Record<string, CatalogItem> = Object.fromEntries(
  catalog.map((c) => [c.sku, c]),
);

const byId: Record<string, CatalogItem> = Object.fromEntries(
  catalog.map((c) => [c.id, c]),
);

/**
 * Look up by SKU. Returns undefined for unknown SKUs — and callers are expected
 * to treat undefined as an ERROR, not as "skip this line". That distinction is
 * the entire lesson of this module.
 */
export function catalogItem(sku: string): CatalogItem | undefined {
  return bySku[sku];
}

export function catalogItemById(id: string): CatalogItem | undefined {
  return byId[id];
}

/**
 * Everything sellable at a location.
 *
 * Includes the `active` filter, so a retired item can still be RESOLVED by
 * `catalogItem` (history renders) but can never be ADDED to a new order.
 */
export function catalogFor(locationId: LocationId): CatalogItem[] {
  return catalog.filter((c) => c.active && c.availableAt.includes(locationId));
}

/**
 * Substring search over name, SKU and service line. Case-insensitive, and an
 * empty query returns everything rather than nothing — a search box that hides
 * the catalog until you type is a catalog nobody browses.
 */
export function searchCatalog(q: string, within: CatalogItem[] = catalog): CatalogItem[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return within;
  return within.filter(
    (c) =>
      c.name.toLowerCase().includes(needle) ||
      c.sku.toLowerCase().includes(needle) ||
      c.serviceLine.toLowerCase().includes(needle),
  );
}

/** Grouped for the category chips on the order form. Stable order. */
export const SERVICE_LINES: ServiceLine[] = [
  "Peptide Therapy",
  "Hormone Therapy",
  "Metabolic & Weight Loss",
  "Sexual Health",
  "Recovery & Performance",
  "Diagnostics",
  "Clinical Services",
  "Supplies",
];

export function byServiceLine(
  within: CatalogItem[] = catalog.filter((c) => c.active),
): Array<{ line: ServiceLine; items: CatalogItem[] }> {
  return SERVICE_LINES.map((line) => ({
    line,
    items: within.filter((c) => c.serviceLine === line),
  })).filter((g) => g.items.length > 0);
}

/** Label for a kind, for badges. */
export const KIND_LABEL: Record<CatalogKind, string> = {
  compound: "Compounded",
  medication: "Rx",
  service: "Service",
  "lab-panel": "Lab",
  package: "Package",
  supply: "Supply",
};
