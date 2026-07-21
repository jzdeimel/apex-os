import type { Vendor, PurchaseOrder } from "@/lib/types";

export const vendors: Vendor[] = [
  {
    id: "v-01",
    name: "Tarheel Peptide Co.",
    type: "Third-Party Peptide Vendor",
    contact: "orders@tarheelcompounding.demo",
    leadTimeDays: 5,
    rating: 4.7,
    catalog: ["BPC-157", "GHK-Cu", "PT-141", "VIP nasal spray", "NAD+"],
  },
  {
    id: "v-02",
    name: "Carolina Peptide Labs",
    type: "Third-Party Peptide Vendor",
    contact: "fulfillment@carolinapeptide.demo",
    leadTimeDays: 7,
    rating: 4.5,
    catalog: ["BPC-157", "Ibutamoren / MK-677", "NAD+", "GHK-Cu"],
  },
  {
    id: "v-03",
    name: "Atlantic GLP Pharmacy",
    type: "Compounding Pharmacy",
    contact: "rx@atlanticglp.demo",
    leadTimeDays: 6,
    rating: 4.8,
    catalog: ["Semaglutide", "Tirzepatide", "Tesofensine"],
  },
  {
    id: "v-04",
    name: "Meridian Hormone Pharmacy",
    type: "Compounding Pharmacy",
    contact: "service@meridianhrt.demo",
    leadTimeDays: 8,
    rating: 4.4,
    catalog: ["Testosterone cypionate placeholder", "Injection supplies"],
  },
  {
    id: "v-05",
    name: "Quest-Aligned Lab Supply",
    type: "Lab Supplier",
    contact: "support@questaligned.demo",
    leadTimeDays: 3,
    rating: 4.6,
    catalog: ["Lab kits", "Phlebotomy supplies"],
  },
  {
    id: "v-06",
    name: "Coastal Medical Supply",
    type: "Medical Supply",
    contact: "sales@coastalmed.demo",
    leadTimeDays: 2,
    rating: 4.3,
    catalog: ["Injection supplies", "IV supplies"],
  },
  {
    id: "v-07",
    name: "Helix Diagnostics",
    type: "Diagnostics",
    contact: "partners@helixdx.demo",
    leadTimeDays: 4,
    rating: 4.9,
    catalog: ["Lab kits", "Body scan calibration"],
  },
];

export const vendorMap = Object.fromEntries(vendors.map((v) => [v.id, v]));

export const purchaseOrders: PurchaseOrder[] = [
  {
    id: "po-1042",
    vendorId: "v-03",
    locationId: "myrtle-beach",
    createdOn: "2026-06-09",
    status: "Submitted",
    lines: [
      { name: "Semaglutide", quantity: 20, unitCost: 145 },
      { name: "Tirzepatide", quantity: 15, unitCost: 210 },
    ],
  },
  {
    id: "po-1041",
    vendorId: "v-01",
    locationId: "raleigh",
    createdOn: "2026-06-07",
    status: "Approved",
    lines: [
      { name: "BPC-157", quantity: 25, unitCost: 62 },
      { name: "NAD+", quantity: 12, unitCost: 88 },
    ],
  },
  {
    id: "po-1040",
    vendorId: "v-05",
    locationId: "southern-pines",
    createdOn: "2026-06-03",
    status: "Received",
    lines: [{ name: "Lab kits", quantity: 40, unitCost: 34 }],
  },
  {
    id: "po-1039",
    vendorId: "v-06",
    locationId: "raleigh",
    createdOn: "2026-06-11",
    status: "Draft",
    lines: [
      { name: "Injection supplies", quantity: 200, unitCost: 0.9 },
      { name: "IV supplies", quantity: 60, unitCost: 7.5 },
    ],
  },
];

/**
 * Commit a drafted purchase order into the shared corpus.
 *
 * The New-PO modal used to toast "Purchase order submitted" with a vendor and a
 * dollar total and write nothing at all, so the list rendered right beside the
 * button never changed and no stock was ever ordered. Same shape as
 * commitOrder in lib/mock/orders.ts: mutate the module corpus so every reader
 * agrees within the session.
 *
 * Status is "Draft" deliberately — nothing here transmits to a vendor.
 */
export function commitPurchaseOrder(input: {
  vendorId: string;
  vendorName: string;
  locationId?: string;
  lines: { name: string; qty: number; unitCost: number }[];
}): PurchaseOrder {
  const seq = purchaseOrders.length + 1043;
  const po: PurchaseOrder = {
    id: `po-${seq}`,
    vendorId: input.vendorId,
    locationId: (input.locationId ?? "raleigh") as PurchaseOrder["locationId"],
    createdOn: new Date().toISOString().slice(0, 10),
    status: "Draft",
    lines: input.lines.map((l) => ({ name: l.name, quantity: l.qty, unitCost: l.unitCost })),
  } as PurchaseOrder;
  purchaseOrders.unshift(po);
  return po;
}
