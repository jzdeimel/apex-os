import type {
  PaymentPort,
  ProcessorName,
  VaultedCard,
  ChargeResult,
  RefundResult,
  MerchantAccountId,
} from "@/lib/payments/port";

/**
 * THE CLOVER ADAPTER.
 *
 * Decision landed 2026-07-21: Clover, four merchant accounts, one per clinic.
 * This is the only file in Apex that knows Clover exists — the domain talks to
 * `PaymentPort` and nothing in ordering, subscriptions or invoicing moves if
 * the processor changes again.
 *
 * ── STATUS: NOT WIRED. THIS ADAPTER REFUSES. ───────────────────────────────
 * The API keys and the four merchant ids had not arrived when this was written
 * ("I'll be getting API docs and keys and all that stuff for us here very
 * shortly"). Every method therefore throws, naming exactly what is missing.
 *
 * That is the deliberate choice this codebase keeps making. A payment adapter
 * that returned a plausible `succeeded` while unconfigured is the most
 * expensive possible version of the audit's central finding — invoices marked
 * paid, dunning never triggered, and a revenue report that reconciles to
 * nothing. `UnconfiguredPaymentPort` makes the same argument at greater length.
 *
 * What IS built and does not need the keys: the shape. Merchant account per
 * clinic on every call, integer cents, an idempotency key on every mutation,
 * and no method anywhere that can accept a card number. Those are the parts
 * that are expensive to retrofit; the HTTP is not.
 *
 * ── PCI SCOPE ──────────────────────────────────────────────────────────────
 * Clover's hosted iframe (Clover Elements) captures the card on the client and
 * returns a single-use token. Apex receives only that token, exchanges it for a
 * durable one, and stores brand + last four for recognition. There is no method
 * on this class that takes a PAN, and there must never be — the cheapest way to
 * stay out of PCI DSS scope is to have nowhere to put one.
 *
 * ── IDEMPOTENCY ────────────────────────────────────────────────────────────
 * Clover's API supports an idempotency key on charge creation. The adapter MUST
 * forward `idempotencyKey` to it rather than relying on a local dedupe: two
 * replicas retrying the same timed-out request is precisely the case a local
 * table cannot see. Charging a patient twice is the worst failure a cash-pay
 * clinic can inflict and it is entirely preventable.
 *
 * ── WHAT MUST BE VERIFIED BEFORE THIS GOES LIVE ────────────────────────────
 *  1. Card-on-file migration from MindBody. Vault tokens do NOT transfer
 *     between processors by copying a column — see docs/AUG7_CUTOVER.md §2.1.
 *     Without it, recurring billing fails the morning after cutover.
 *  2. Sandbox credentials exercised end to end, including a decline and a
 *     partial refund, before the first real charge.
 *  3. Each of the four merchant ids confirmed against the right clinic. A
 *     transposed pair reconciles to the wrong location forever and every
 *     individual charge still succeeds.
 */
export class CloverPaymentPort implements PaymentPort {
  readonly name: ProcessorName = "clover";
  private readonly config: {
    baseUrl: string;
    tokensByMerchant: Record<MerchantAccountId, string>;
  };

  constructor(config: {
      /** Clover REST base. Sandbox and production differ. */
      baseUrl: string;
      /** Per-merchant API token, keyed by merchant account id. */
      tokensByMerchant: Record<MerchantAccountId, string>;
  }) {
    this.config = config;
  }

  private tokenFor(merchantAccountId: MerchantAccountId): string {
    const token = this.config.tokensByMerchant[merchantAccountId];
    if (!token) {
      throw new Error(
        `No Clover API token for merchant account ${merchantAccountId}. Each clinic has its ` +
          `own account and its own credential; there is no shared fallback, because a ` +
          `fallback would bill the wrong clinic and still return success.`,
      );
    }
    return token;
  }

  private requireIdempotency(key: string): void {
    if (!key || !key.trim()) {
      throw new Error("Clover mutation refused: idempotencyKey is required to prevent duplicate money movement.");
    }
  }

  private notWired(method: string): never {
    throw new Error(
      `Clover adapter is not wired: ${method}() was called before the API credentials ` +
        `landed. Apex refuses to simulate a payment — see lib/payments/clover.ts. ` +
        `Provide credentials via Key Vault and implement the HTTP calls before enabling ` +
        `APEX_PAYMENT_PROCESSOR=clover.`,
    );
  }

  async vaultCard(input: {
    clientId: string;
    singleUseToken: string;
    idempotencyKey: string;
    merchantAccountId: MerchantAccountId;
  }): Promise<VaultedCard> {
    this.requireIdempotency(input.idempotencyKey);
    // Resolved first so a misconfigured merchant fails with the accurate error
    // rather than the generic not-wired one.
    this.tokenFor(input.merchantAccountId);
    return this.notWired("vaultCard");
  }

  async removeCard(_input: { processorToken: string }): Promise<void> {
    return this.notWired("removeCard");
  }

  async charge(input: {
    clientId: string;
    processorToken: string;
    amountCents: number;
    currency: "USD";
    idempotencyKey: string;
    merchantAccountId: MerchantAccountId;
    descriptor?: string;
    invoiceId?: string;
  }): Promise<ChargeResult> {
    this.requireIdempotency(input.idempotencyKey);
    this.tokenFor(input.merchantAccountId);
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      // Checked here rather than trusted from the domain: a float that reached
      // a processor would be rounded by someone else's rules.
      throw new Error(`amountCents must be a positive integer; got ${input.amountCents}.`);
    }
    return this.notWired("charge");
  }

  async refund(input: {
    processorRef: string;
    amountCents: number;
    idempotencyKey: string;
    merchantAccountId: MerchantAccountId;
    reason?: string;
  }): Promise<RefundResult> {
    this.requireIdempotency(input.idempotencyKey);
    this.tokenFor(input.merchantAccountId);
    return this.notWired("refund");
  }
}
