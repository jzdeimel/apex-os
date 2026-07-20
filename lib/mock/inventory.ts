import { absolute } from "@/lib/utils";
import type { InventoryItem, InventoryStatus } from "@/lib/types";

function statusOf(qty: number, reorder: number, exp: string): InventoryStatus {
  if (qty === 0) return "out of stock";
  const days = Math.round(
    (absolute(exp).getTime() - absolute("2026-06-12").getTime()) /
      (1000 * 60 * 60 * 24),
  );
  if (days <= 60 && days >= 0) return "expiring soon";
  if (qty <= reorder) return "low";
  return "in stock";
}

type Seed = Omit<InventoryItem, "status">;

const seed: Seed[] = [
  { id: "inv-001", sku: "PEP-BPC-5MG", name: "BPC-157", category: "Peptide", locationId: "raleigh", quantity: 6, unit: "vials", lotNumber: "BPC-2604A", expirationDate: "2026-07-22", vendorId: "v-01", reorderPoint: 8, unitCost: 62 },
  { id: "inv-002", sku: "PEP-BPC-5MG", name: "BPC-157", category: "Peptide", locationId: "southern-pines", quantity: 14, unit: "vials", lotNumber: "BPC-2603B", expirationDate: "2026-11-02", vendorId: "v-02", reorderPoint: 8, unitCost: 62 },
  { id: "inv-003", sku: "PEP-GHKCU-50", name: "GHK-Cu", category: "Peptide", locationId: "raleigh", quantity: 9, unit: "vials", lotNumber: "GHK-2602C", expirationDate: "2026-12-15", vendorId: "v-01", reorderPoint: 6, unitCost: 74 },
  { id: "inv-004", sku: "PEP-GHKCU-50", name: "GHK-Cu", category: "Peptide", locationId: "myrtle-beach", quantity: 3, unit: "vials", lotNumber: "GHK-2601D", expirationDate: "2026-10-10", vendorId: "v-02", reorderPoint: 6, unitCost: 74 },
  { id: "inv-005", sku: "IV-NAD-500", name: "NAD+", category: "Peptide", locationId: "raleigh", quantity: 11, unit: "vials", lotNumber: "NAD-2605E", expirationDate: "2027-01-20", vendorId: "v-01", reorderPoint: 6, unitCost: 88 },
  { id: "inv-006", sku: "IV-NAD-500", name: "NAD+", category: "Peptide", locationId: "myrtle-beach", quantity: 4, unit: "vials", lotNumber: "NAD-2603F", expirationDate: "2026-07-30", vendorId: "v-02", reorderPoint: 6, unitCost: 88 },
  { id: "inv-007", sku: "PEP-PT141-10", name: "PT-141", category: "Peptide", locationId: "raleigh", quantity: 7, unit: "vials", lotNumber: "PT-2604G", expirationDate: "2026-09-18", vendorId: "v-01", reorderPoint: 5, unitCost: 56 },
  { id: "inv-008", sku: "PEP-PT141-10", name: "PT-141", category: "Peptide", locationId: "southern-pines", quantity: 2, unit: "vials", lotNumber: "PT-2602H", expirationDate: "2026-08-05", vendorId: "v-01", reorderPoint: 5, unitCost: 56 },
  { id: "inv-009", sku: "PEP-VIP-NS", name: "VIP nasal spray", category: "Peptide", locationId: "raleigh", quantity: 5, unit: "bottles", lotNumber: "VIP-2603I", expirationDate: "2026-10-28", vendorId: "v-01", reorderPoint: 4, unitCost: 95 },
  { id: "inv-010", sku: "PEP-VIP-NS", name: "VIP nasal spray", category: "Peptide", locationId: "myrtle-beach", quantity: 0, unit: "bottles", lotNumber: "VIP-2601J", expirationDate: "2026-09-12", vendorId: "v-01", reorderPoint: 4, unitCost: 95 },
  { id: "inv-011", sku: "PEP-MK677-25", name: "Ibutamoren / MK-677", category: "Peptide", locationId: "southern-pines", quantity: 10, unit: "bottles", lotNumber: "MK-2604K", expirationDate: "2027-02-14", vendorId: "v-02", reorderPoint: 5, unitCost: 70 },
  { id: "inv-012", sku: "GLP-SEMA-2.5", name: "Semaglutide", category: "Medication", locationId: "myrtle-beach", quantity: 5, unit: "vials", lotNumber: "SEM-2605L", expirationDate: "2026-08-01", vendorId: "v-03", reorderPoint: 10, unitCost: 145 },
  { id: "inv-013", sku: "GLP-SEMA-2.5", name: "Semaglutide", category: "Medication", locationId: "raleigh", quantity: 18, unit: "vials", lotNumber: "SEM-2604M", expirationDate: "2026-12-09", vendorId: "v-03", reorderPoint: 10, unitCost: 145 },
  { id: "inv-014", sku: "GLP-TIRZ-5", name: "Tirzepatide", category: "Medication", locationId: "myrtle-beach", quantity: 4, unit: "vials", lotNumber: "TIR-2605N", expirationDate: "2026-11-22", vendorId: "v-03", reorderPoint: 8, unitCost: 210 },
  { id: "inv-015", sku: "GLP-TIRZ-5", name: "Tirzepatide", category: "Medication", locationId: "raleigh", quantity: 12, unit: "vials", lotNumber: "TIR-2604O", expirationDate: "2027-01-15", vendorId: "v-03", reorderPoint: 8, unitCost: 210 },
  { id: "inv-016", sku: "WL-TESO-500", name: "Tesofensine", category: "Medication", locationId: "southern-pines", quantity: 6, unit: "bottles", lotNumber: "TES-2603P", expirationDate: "2026-10-30", vendorId: "v-03", reorderPoint: 5, unitCost: 130 },
  { id: "inv-017", sku: "HRT-TCYP-200", name: "Testosterone cypionate placeholder", category: "Hormone", locationId: "raleigh", quantity: 15, unit: "vials", lotNumber: "TCY-2604Q", expirationDate: "2027-03-01", vendorId: "v-04", reorderPoint: 6, unitCost: 48 },
  { id: "inv-018", sku: "HRT-TCYP-200", name: "Testosterone cypionate placeholder", category: "Hormone", locationId: "myrtle-beach", quantity: 7, unit: "vials", lotNumber: "TCY-2603R", expirationDate: "2026-12-20", vendorId: "v-04", reorderPoint: 6, unitCost: 48 },
  { id: "inv-019", sku: "LAB-BASE", name: "Alpha Base Panel lab kit", category: "Lab Kit", locationId: "raleigh", quantity: 22, unit: "kits", lotNumber: "LBK-2605S", expirationDate: "2027-05-01", vendorId: "v-05", reorderPoint: 15, unitCost: 34 },
  { id: "inv-020", sku: "LAB-BASE", name: "Alpha Base Panel lab kit", category: "Lab Kit", locationId: "southern-pines", quantity: 9, unit: "kits", lotNumber: "LBK-2604T", expirationDate: "2027-04-12", vendorId: "v-05", reorderPoint: 15, unitCost: 34 },
  { id: "inv-021", sku: "LAB-BASE", name: "Alpha Base Panel lab kit", category: "Lab Kit", locationId: "myrtle-beach", quantity: 13, unit: "kits", lotNumber: "LBK-2603U", expirationDate: "2027-03-28", vendorId: "v-07", reorderPoint: 15, unitCost: 34 },
  { id: "inv-022", sku: "SUP-INJ-29G", name: "Injection supplies (29G kit)", category: "Injection Supply", locationId: "raleigh", quantity: 140, unit: "units", lotNumber: "INJ-2605V", expirationDate: "2028-01-01", vendorId: "v-06", reorderPoint: 100, unitCost: 0.9 },
  { id: "inv-023", sku: "SUP-INJ-29G", name: "Injection supplies (29G kit)", category: "Injection Supply", locationId: "southern-pines", quantity: 60, unit: "units", lotNumber: "INJ-2604W", expirationDate: "2028-01-01", vendorId: "v-06", reorderPoint: 100, unitCost: 0.9 },
  { id: "inv-024", sku: "SUP-IV-SET", name: "IV supplies (infusion set)", category: "IV Supply", locationId: "raleigh", quantity: 34, unit: "sets", lotNumber: "IVS-2605X", expirationDate: "2027-09-15", vendorId: "v-06", reorderPoint: 25, unitCost: 7.5 },
  { id: "inv-025", sku: "SUP-IV-SET", name: "IV supplies (infusion set)", category: "IV Supply", locationId: "myrtle-beach", quantity: 8, unit: "sets", lotNumber: "IVS-2603Y", expirationDate: "2026-07-18", vendorId: "v-06", reorderPoint: 25, unitCost: 7.5 },
];

export const inventory: InventoryItem[] = seed.map((s) => ({
  ...s,
  status: statusOf(s.quantity, s.reorderPoint, s.expirationDate),
}));

export function inventoryAvailable(productName: string, locationId?: string): boolean {
  return inventory.some(
    (i) =>
      i.name.toLowerCase().includes(productName.toLowerCase()) &&
      (!locationId || i.locationId === locationId) &&
      i.quantity > 0,
  );
}

export const lowStock = inventory.filter((i) => i.status === "low" || i.status === "out of stock");
export const expiringSoon = inventory.filter((i) => i.status === "expiring soon");
