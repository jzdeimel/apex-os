// =============================================================================
// Apex — AI Peptide Sourcing & demand forecasting (deterministic, mock-only)
// Most peptides are sourced from THIRD-PARTY vendors. This engine forecasts
// reorders, compares vendors, and drafts purchase orders. No clinical content.
// =============================================================================

import type { InventoryItem, Vendor } from "@/lib/types";
import { inventory } from "@/lib/mock/inventory";
import { vendors } from "@/lib/mock/vendors";
import { seededRandom, clamp, absolute } from "@/lib/utils";

const NOW = absolute("2026-06-12T09:00:00");

function daysUntil(iso: string) {
  return Math.round((absolute(iso).getTime() - NOW.getTime()) / (1000 * 60 * 60 * 24));
}

// Deterministic weekly burn rate per SKU (units/week), seeded by id.
function weeklyBurn(item: InventoryItem): number {
  const rand = seededRandom(item.id + "burn");
  const base =
    item.category === "Medication" ? 6 : item.category === "Peptide" ? 4 : item.category === "Hormone" ? 5 : 8;
  return Math.round((base * (0.6 + rand() * 1.1)) * 10) / 10;
}

export interface SourcingForecast {
  item: InventoryItem;
  weeklyBurn: number;
  daysToStockout: number;
  expDays: number;
  riskScore: number; // 0..100, higher = act sooner
  recommendedOrderQty: number;
  bestVendor: Vendor | null;
  reason: string;
}

export function forecastItem(item: InventoryItem): SourcingForecast {
  const burn = weeklyBurn(item);
  const dailyBurn = burn / 7;
  const daysToStockout = dailyBurn > 0 ? Math.round(item.quantity / dailyBurn) : 999;
  const expDays = daysUntil(item.expirationDate);

  // Best third-party vendor: carries the product, weight rating then lead time.
  const candidates = vendors
    .filter((v) => v.catalog.some((p) => item.name.toLowerCase().includes(p.split(" /")[0].toLowerCase())))
    .sort((a, b) => b.rating - a.rating || a.leadTimeDays - b.leadTimeDays);
  const bestVendor = candidates[0] ?? null;
  const lead = bestVendor?.leadTimeDays ?? 7;

  // Risk: closer stockout / expiry / below reorder → higher.
  let risk = 0;
  if (item.quantity === 0) risk += 60;
  else if (item.quantity <= item.reorderPoint) risk += 35;
  if (daysToStockout <= lead + 7) risk += 30;
  else if (daysToStockout <= 30) risk += 12;
  if (expDays >= 0 && expDays <= 60) risk += 18;
  risk = clamp(risk, 0, 100);

  // Order enough to cover ~6 weeks of burn above reorder point.
  const target = Math.ceil(item.reorderPoint + burn * 6);
  const recommendedOrderQty = Math.max(0, target - item.quantity);

  const reasonParts: string[] = [];
  if (item.quantity === 0) reasonParts.push("Out of stock");
  else if (item.quantity <= item.reorderPoint) reasonParts.push(`At/below reorder point (${item.reorderPoint})`);
  if (daysToStockout < 999) reasonParts.push(`~${daysToStockout}d to stockout at ${burn}/wk`);
  if (expDays >= 0 && expDays <= 60) reasonParts.push(`expires in ${expDays}d`);
  reasonParts.push(`vendor lead time ${lead}d`);

  return {
    item,
    weeklyBurn: burn,
    daysToStockout,
    expDays,
    riskScore: risk,
    recommendedOrderQty,
    bestVendor,
    reason: reasonParts.join(" · "),
  };
}

export function sourcingForecasts(scope?: InventoryItem[]): SourcingForecast[] {
  return (scope ?? inventory)
    .map(forecastItem)
    .sort((a, b) => b.riskScore - a.riskScore);
}

// Vendor comparison for a given product name.
export interface VendorScore {
  vendor: Vendor;
  score: number;
  estUnitCost: number;
}

export function compareVendors(productName: string): VendorScore[] {
  const key = productName.split(" /")[0].toLowerCase();
  const base = inventory.find((i) => i.name.toLowerCase().includes(key))?.unitCost ?? 80;
  return vendors
    .filter((v) => v.catalog.some((p) => p.toLowerCase().includes(key) || key.includes(p.toLowerCase())))
    .map((v) => {
      const rand = seededRandom(v.id + key);
      // cheaper + faster + higher-rated => better score
      const estUnitCost = Math.round(base * (0.9 + rand() * 0.25));
      const score = Math.round(
        clamp(v.rating * 14 + (10 - v.leadTimeDays) * 2.5 + (base - estUnitCost) * 0.4, 0, 100),
      );
      return { vendor: v, score, estUnitCost };
    })
    .sort((a, b) => b.score - a.score);
}

// Draft a purchase order grouped by best vendor for the highest-risk items.
export interface DraftPOLine {
  name: string;
  quantity: number;
  unitCost: number;
  locationId: string;
}
export interface DraftPO {
  vendorId: string;
  vendorName: string;
  lines: DraftPOLine[];
  total: number;
  leadTimeDays: number;
}

export function draftReorderPOs(scope?: InventoryItem[]): DraftPO[] {
  const forecasts = sourcingForecasts(scope).filter(
    (f) => f.recommendedOrderQty > 0 && f.riskScore >= 25 && f.bestVendor,
  );
  const byVendor = new Map<string, DraftPO>();
  for (const f of forecasts) {
    const v = f.bestVendor!;
    if (!byVendor.has(v.id)) {
      byVendor.set(v.id, { vendorId: v.id, vendorName: v.name, lines: [], total: 0, leadTimeDays: v.leadTimeDays });
    }
    const po = byVendor.get(v.id)!;
    po.lines.push({
      name: f.item.name,
      quantity: f.recommendedOrderQty,
      unitCost: f.item.unitCost,
      locationId: f.item.locationId,
    });
    po.total += f.recommendedOrderQty * f.item.unitCost;
  }
  return Array.from(byVendor.values()).sort((a, b) => b.total - a.total);
}
