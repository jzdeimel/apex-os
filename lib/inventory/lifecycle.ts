import { sha256 } from "@/lib/trace/hash";

export const INVENTORY_KINDS = ["receive", "dispense", "waste", "transfer-in", "transfer-out", "count-adjust"] as const;
export type InventoryMovementKind = (typeof INVENTORY_KINDS)[number];

export const LOT_STATUSES = ["active", "quarantined", "recalled", "depleted"] as const;
export type InventoryLotStatus = (typeof LOT_STATUSES)[number];

export function inventoryRequestId(scope: string, requestId: string) {
  return `inv-${sha256(`inventory|${scope}|${requestId}`).slice(0, 24)}`;
}

export function inventoryLotRequestId(locationId: string, sku: string, lotNumber: string) {
  return `lot-${sha256(`lot|${locationId}|${sku}|${lotNumber}`).slice(0, 24)}`;
}

export function inventoryTransferRequestId(sourceLotId: string, targetLocationId: string, requestId: string) {
  return `xfr-${sha256(`transfer|${sourceLotId}|${targetLocationId}|${requestId}`).slice(0, 24)}`;
}

export function inventoryDispenseRequestId(clientId: string, lotId: string, requestId: string) {
  return `dsp-${sha256(`dispense|${clientId}|${lotId}|${requestId}`).slice(0, 24)}`;
}

export function inventoryRecallRequestId(sku: string, lotNumber: string, requestId: string) {
  return `rec-${sha256(`recall|${sku}|${lotNumber}|${requestId}`).slice(0, 24)}`;
}

export function movementSignIsValid(kind: InventoryMovementKind, delta: number) {
  if (!Number.isSafeInteger(delta)) return false;
  if (kind === "receive" || kind === "transfer-in") return delta > 0;
  if (kind === "count-adjust") return true;
  return delta < 0;
}

export function lotCanLeaveStock(status: InventoryLotStatus, expiryOn: string | null, at: string) {
  if (status !== "active") return { ok: false as const, reason: `Lot is ${status}.` };
  if (expiryOn && expiryOn < at.slice(0, 10)) return { ok: false as const, reason: `Lot expired on ${expiryOn}.` };
  return { ok: true as const };
}
