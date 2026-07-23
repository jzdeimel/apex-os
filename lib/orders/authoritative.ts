import { sha256 } from "@/lib/trace/hash";
import type { OrderStatus } from "@/lib/orders/types";

export const ORDER_STATUSES: OrderStatus[] = [
  "Draft", "Submitted", "Accepted", "Insufficient stock", "Picking", "QC hold",
  "Packed", "Label created", "In transit", "Out for delivery", "Delivered", "Cancelled", "Failed",
];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && ORDER_STATUSES.includes(value as OrderStatus);
}

export function orderRequestId(clientId: string, requestId: string) {
  return `ord-${sha256(`order|${clientId}|${requestId}`).slice(0, 24)}`;
}

export function orderEventRequestId(orderId: string, requestId: string) {
  return `ore-${sha256(`order-event|${orderId}|${requestId}`).slice(0, 24)}`;
}

export function orderOutboxRequestId(orderId: string, kind: string) {
  return `out-${sha256(`order-outbox|${orderId}|${kind}`).slice(0, 24)}`;
}

export function partnerMemberRef(clientId: string) {
  return `mem-${sha256(`medsource-member|${clientId}`).slice(0, 24)}`;
}
