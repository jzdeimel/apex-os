import { sha256 } from "@/lib/trace/hash";

export const MEMBERSHIP_STATUSES = ["active", "paused", "past_due", "cancelled"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

const TRANSITIONS: Record<MembershipStatus, readonly MembershipStatus[]> = {
  active: ["paused", "past_due", "cancelled"],
  paused: ["active", "past_due", "cancelled"],
  past_due: ["active", "paused", "cancelled"],
  cancelled: [],
};

export function isMembershipStatus(value: string): value is MembershipStatus {
  return (MEMBERSHIP_STATUSES as readonly string[]).includes(value);
}

export function membershipTransitionAllowed(from: MembershipStatus, to: MembershipStatus) {
  return TRANSITIONS[from].includes(to);
}

export function membershipRequestId(clientId: string, requestId: string) {
  return `mem-${sha256(`membership|${clientId}|${requestId}`).slice(0, 24)}`;
}

export function membershipEventRequestId(membershipId: string, requestId: string) {
  return `mev-${sha256(`membership-event|${membershipId}|${requestId}`).slice(0, 24)}`;
}

export function invoiceRequestId(clientId: string, requestId: string) {
  return `inv-${sha256(`invoice|${clientId}|${requestId}`).slice(0, 24)}`;
}

export function invoiceNumber(clientId: string, requestId: string) {
  // Do not include the server clock. A request retried after midnight must
  // resolve to the exact same invoice number as the original attempt.
  return `APX-${sha256(`invoice-number|${clientId}|${requestId}`).slice(0, 12).toUpperCase()}`;
}

export interface InvoiceLineInput {
  sku?: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  hsaEligibility?: "eligible" | "ineligible" | "unknown";
}

export function invoiceTotals(input: {
  lines: InvoiceLineInput[];
  discountCents?: number;
  discountReason?: string;
  taxCents?: number;
}) {
  if (!input.lines.length || input.lines.length > 100) {
    return { ok: false as const, reason: "An invoice needs between 1 and 100 lines." };
  }
  let subtotalCents = 0;
  let hsaEligibleCents = 0;
  for (const [index, line] of input.lines.entries()) {
    if (!line.description.trim() || line.description.length > 500) {
      return { ok: false as const, reason: `Invoice line ${index + 1} needs a description of 500 characters or fewer.` };
    }
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 10_000) {
      return { ok: false as const, reason: `Invoice line ${index + 1} has an invalid quantity.` };
    }
    if (!Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents < 0 || line.unitPriceCents > 100_000_000) {
      return { ok: false as const, reason: `Invoice line ${index + 1} has an invalid unit price.` };
    }
    const lineTotal = line.quantity * line.unitPriceCents;
    if (!Number.isSafeInteger(lineTotal)) return { ok: false as const, reason: "Invoice total is too large." };
    subtotalCents += lineTotal;
    if (line.hsaEligibility === "eligible") hsaEligibleCents += lineTotal;
  }
  const discountCents = input.discountCents ?? 0;
  const taxCents = input.taxCents ?? 0;
  if (!Number.isSafeInteger(discountCents) || discountCents < 0 || discountCents > subtotalCents) {
    return { ok: false as const, reason: "Discount must be whole cents between zero and the subtotal." };
  }
  if (discountCents > 0 && !input.discountReason?.trim()) {
    return { ok: false as const, reason: "A discount reason is required." };
  }
  if (!Number.isSafeInteger(taxCents) || taxCents < 0 || taxCents > 100_000_000) {
    return { ok: false as const, reason: "Tax must be a non-negative whole-cent amount." };
  }
  const totalCents = subtotalCents - discountCents + taxCents;
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
    return { ok: false as const, reason: "Invoice total is invalid." };
  }
  return { ok: true as const, subtotalCents, discountCents, taxCents, totalCents, hsaEligibleCents };
}
