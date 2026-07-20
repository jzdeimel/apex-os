/**
 * The payment port.
 *
 * WHY A PORT AND NOT A PROCESSOR
 * ------------------------------
 * The processor is being selected this week. Writing against a specific SDK now
 * would mean a refactor the moment that decision lands, and — worse — it would
 * scatter processor concepts through the domain, so the *second* change (and
 * there is always a second) becomes expensive too.
 *
 * So the domain talks to this interface, and exactly one file per processor
 * implements it. Swapping processors is adding an adapter and changing a
 * config value. Nothing in the ordering, subscription or invoicing code moves.
 *
 * PCI SCOPE — the constraint that shapes everything here
 * ------------------------------------------------------
 * Apex must never see a card number. Not "should not" — must not, because the
 * cheapest way to stay out of PCI DSS scope is to have nowhere to put one.
 *
 * Consequently:
 *   · There is NO method that accepts a PAN, a CVV or a track. Card capture
 *     happens in a processor-hosted iframe or SDK on the client, which returns
 *     a single-use token. This port only ever receives that token.
 *   · `vaultCard` exchanges a single-use token for a durable vault token. The
 *     durable token is the only card-ish thing Apex stores (lib/db/schema.ts,
 *     `paymentMethod`), alongside brand and last four for recognition.
 *   · Amounts are integer cents everywhere. A float in money code is a bug
 *     waiting for a rounding boundary, and the existing costs/receipts modules
 *     already obey this.
 *
 * IDEMPOTENCY
 * -----------
 * Every mutating call takes an `idempotencyKey`. Charging a patient twice
 * because a request timed out and got retried is the single worst failure a
 * cash-pay clinic can inflict, and it is entirely preventable. Adapters MUST
 * forward the key to the processor's own idempotency mechanism; where a
 * processor lacks one, the adapter is responsible for a local dedupe table and
 * must say so in its docblock.
 *
 * WHAT THIS PORT DELIBERATELY DOES NOT DO
 * ---------------------------------------
 * It does not decide WHETHER to charge. Dunning policy, proration, membership
 * rules and refund authority live in the domain, where they can be reasoned
 * about and audited. This is a transport.
 */

/** Integer cents. Never a float. */
export type Cents = number;

export type ProcessorName = "unconfigured" | "braintree" | "adyen" | "authorize-net" | "demo";

/* -------------------------------------------------------------------------- */
/* Results                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Deliberately three-valued, not a boolean.
 *
 * `pending` is a real outcome — some processors settle asynchronously, and an
 * adapter that collapses pending into success will mark an invoice paid before
 * the money exists. That is a reconciliation problem nobody finds for a month.
 */
export type ChargeOutcome = "succeeded" | "failed" | "pending";

export interface ChargeResult {
  outcome: ChargeOutcome;
  /** The processor's own reference, for reconciliation and support calls. */
  processorRef?: string;
  /**
   * Machine-readable failure reason. Dunning branches on THIS, never on the
   * human message: retrying a `card_expired` immediately is pointless, whereas
   * `insufficient_funds` is worth a scheduled retry.
   */
  failureCode?:
    | "card_declined"
    | "insufficient_funds"
    | "card_expired"
    | "incorrect_cvc"
    | "processing_error"
    | "authentication_required"
    | "unknown";
  /** Safe to show a member. Must not contain a card number or a processor stack trace. */
  failureMessage?: string;
  amountCents: Cents;
}

export interface VaultedCard {
  /** Durable token. The ONLY card-derived value Apex persists. */
  processorToken: string;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
}

export interface RefundResult {
  outcome: "succeeded" | "failed" | "pending";
  processorRef?: string;
  amountCents: Cents;
  failureMessage?: string;
}

/* -------------------------------------------------------------------------- */
/* The port                                                                    */
/* -------------------------------------------------------------------------- */

export interface PaymentPort {
  readonly name: ProcessorName;

  /**
   * Exchange a single-use client token for a durable vault token.
   *
   * `singleUseToken` comes from the processor's hosted field on the client.
   * Apex never touches the card itself — see the PCI note above.
   */
  vaultCard(input: {
    clientId: string;
    singleUseToken: string;
    idempotencyKey: string;
  }): Promise<VaultedCard>;

  /** Remove a stored method. Should be idempotent — removing twice is not an error. */
  removeCard(input: { processorToken: string }): Promise<void>;

  /**
   * Charge a vaulted method.
   *
   * `descriptor` is what appears on the member's statement. For a men's health
   * clinic this matters more than it looks: a statement line naming a hormone
   * programme is a disclosure to anyone who reads the bill. Keep it neutral.
   */
  charge(input: {
    clientId: string;
    processorToken: string;
    amountCents: Cents;
    currency: "USD";
    idempotencyKey: string;
    descriptor?: string;
    invoiceId?: string;
  }): Promise<ChargeResult>;

  /** Full or partial refund against an earlier charge. */
  refund(input: {
    processorRef: string;
    amountCents: Cents;
    idempotencyKey: string;
    reason?: string;
  }): Promise<RefundResult>;
}

/* -------------------------------------------------------------------------- */
/* Default adapter                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The unconfigured adapter — the one that ships today.
 *
 * It REFUSES rather than pretending. Every method throws, loudly, naming the
 * missing configuration.
 *
 * This is deliberate and it is the lesson of the audit. The prototype was full
 * of controls that asserted an outcome and performed none — a reorder button
 * that created no order, a "Written to the ledger" toast with no write. A
 * payment adapter that silently returned `succeeded` would be the most
 * expensive possible version of that mistake: invoices marked paid, dunning
 * never triggered, and a revenue report that reconciles to nothing.
 *
 * A hard failure at the call site is recoverable. A quiet fake is not.
 */
export class UnconfiguredPaymentPort implements PaymentPort {
  readonly name: ProcessorName = "unconfigured";

  private fail(method: string): never {
    throw new Error(
      `Payments are not configured: ${method}() was called with no processor adapter. ` +
        `Set APEX_PAYMENT_PROCESSOR and provide credentials via Key Vault, then register ` +
        `the adapter in lib/payments/registry.ts. Apex refuses to simulate a payment.`,
    );
  }

  async vaultCard(): Promise<VaultedCard> {
    this.fail("vaultCard");
  }
  async removeCard(): Promise<void> {
    this.fail("removeCard");
  }
  async charge(): Promise<ChargeResult> {
    this.fail("charge");
  }
  async refund(): Promise<RefundResult> {
    this.fail("refund");
  }
}

/* -------------------------------------------------------------------------- */
/* Dunning policy — domain, not transport                                      */
/* -------------------------------------------------------------------------- */

/**
 * When to retry a failed payment, and when to stop.
 *
 * The audit found dunning represented by a single seeded string,
 * `"Card on file declined"` (lib/mock/subscriptions.ts:150) — no retry ladder,
 * no card-update request, no auto-pause, no write-off path. In a 5,000-patient
 * membership book that is where money leaks continuously and invisibly.
 *
 * The schedule branches on `failureCode` because the codes mean genuinely
 * different things. Retrying an expired card on a fixed cadence annoys a member
 * four times and recovers nothing; the only useful action there is asking them
 * to update it.
 *
 * Deliberately NOT included: any escalation that withholds clinical care for
 * non-payment. Pausing a *shipment* is a business decision; pausing someone's
 * access to their own chart, their labs or their care team is not, and this
 * policy must never be the mechanism for it.
 */
export interface DunningStep {
  /** Hours after the previous attempt. */
  afterHours: number;
  action: "retry" | "request-card-update" | "notify-staff" | "pause-fulfilment" | "write-off";
  note: string;
}

export const DUNNING_LADDER: Record<
  NonNullable<ChargeResult["failureCode"]> | "default",
  DunningStep[]
> = {
  insufficient_funds: [
    { afterHours: 72, action: "retry", note: "Balances commonly recover within a pay cycle." },
    { afterHours: 168, action: "retry", note: "Second attempt one week on." },
    { afterHours: 192, action: "request-card-update", note: "Two failures is a card problem, not timing." },
    { afterHours: 336, action: "pause-fulfilment", note: "Pause shipments only. Care access is unaffected." },
  ],
  card_expired: [
    // No retry at all — the card cannot succeed and a retry is pure annoyance.
    { afterHours: 0, action: "request-card-update", note: "An expired card will never clear on retry." },
    { afterHours: 168, action: "notify-staff", note: "A week of silence needs a human call." },
    { afterHours: 336, action: "pause-fulfilment", note: "Pause shipments only." },
  ],
  card_declined: [
    { afterHours: 48, action: "retry", note: "Issuer declines are often transient." },
    { afterHours: 120, action: "request-card-update", note: "" },
    { afterHours: 336, action: "pause-fulfilment", note: "Pause shipments only." },
  ],
  incorrect_cvc: [{ afterHours: 0, action: "request-card-update", note: "Cannot be fixed by retrying." }],
  authentication_required: [
    { afterHours: 0, action: "request-card-update", note: "Needs the member present to authenticate." },
  ],
  processing_error: [
    { afterHours: 6, action: "retry", note: "Processor-side; a short retry usually clears it." },
    { afterHours: 48, action: "notify-staff", note: "Repeated processing errors are an integration fault." },
  ],
  unknown: [
    { afterHours: 24, action: "retry", note: "" },
    { afterHours: 120, action: "notify-staff", note: "Unclassified failures need eyes." },
  ],
  default: [
    { afterHours: 24, action: "retry", note: "" },
    { afterHours: 168, action: "request-card-update", note: "" },
    { afterHours: 336, action: "notify-staff", note: "" },
  ],
};

export function dunningLadderFor(code: ChargeResult["failureCode"]): DunningStep[] {
  return DUNNING_LADDER[code ?? "default"] ?? DUNNING_LADDER.default;
}

/**
 * Statement descriptor.
 *
 * Neutral by default. A member's bank statement is read by whoever opens the
 * post, and "ALPHA HEALTH TRT" on a shared account is a disclosure the member
 * never consented to. The clinic name alone is enough to be recognisable.
 */
export const DEFAULT_DESCRIPTOR = "ALPHA HEALTH";
