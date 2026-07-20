import { absolute } from "@/lib/utils";
import { sha256 } from "@/lib/trace/hash";
import type { LedgerDraft } from "@/lib/trace/ledger";
import { staffMap } from "@/lib/mock/staff";
import { activeGrant, hasConsent } from "@/lib/comms/consent";
import { outboundThisWeek } from "@/lib/mock/contactLog";
import type {
  ConsentGrant,
  ConsentScope,
  ContactChannel,
} from "@/lib/comms/types";

/**
 * The only way a message leaves Apex.
 *
 * `sendMessage` is the single guarded entry point. The provider classes below
 * are intentionally NOT the public surface — nothing outside this module should
 * construct one, because a provider knows how to deliver a message but knows
 * nothing about whether it is allowed to. Putting the guard in the caller is
 * how the audited system ended up with three send paths and one consent check.
 *
 * Nothing here actually transmits. This is a demo build; `DemoProvider`
 * simulates deterministic delivery and `AcsProvider` documents the production
 * seam without opening a socket.
 */

// ---------------------------------------------------------------------------
// Policy constants
// ---------------------------------------------------------------------------

/**
 * Quiet hours, local clinic time. No non-urgent outbound between 21:00 and
 * 08:00.
 *
 * Failure mode this prevents: a batched reminder job that runs on UTC cron
 * fires at 02:40 local, a member's phone lights up, and they reply STOP. We
 * then lose the *operational* channel too, because members do not opt out
 * scope-by-scope — they opt out of the clinic. One badly-timed 2am text costs
 * the ability to tell that member their labs are back. Urgent clinical sends
 * (a provider escalation) may override with an explicit `urgent: true`, which
 * is recorded on the ledger event so overrides are countable, not invisible.
 */
export const QUIET_HOURS = { startHour: 21, endHour: 8 } as const;

/**
 * Maximum non-urgent outbound messages to one member in a rolling 7 days.
 *
 * Failure mode this prevents: message fatigue disengagement. Each automated
 * surface in the audited system has its own cadence — reminders, campaign
 * blasts, refill nudges, coach check-ins — and none of them can see the others,
 * so an active member on three programs can receive eleven messages in a week
 * from four systems that each believe they sent two. Members stop reading, then
 * stop replying, then miss the message that actually mattered. The cap is
 * enforced per *member*, not per surface, because the member experiences the
 * total.
 */
export const WEEKLY_CAP = 5;

/** Pinned clock. */
const NOW = absolute("2026-06-12T09:00:00");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OutboundMessage {
  clientId: string;
  staffId: string;
  channel: ContactChannel;
  scope: ConsentScope;
  body: string;
  subject?: string;
  threadId?: string;
  /** Destination address/number. Never logged in full. */
  to: string;
}

export interface SendInput extends OutboundMessage {
  /**
   * Required. A retried request with the same key must not produce a second
   * message. The audited system has no idempotency anywhere, so a double-click
   * on "Send to all" is a double send with no way to tell after the fact.
   */
  idempotencyKey: string;
  /** Bypasses quiet hours only. Never bypasses consent or the weekly cap. */
  urgent?: boolean;
  /**
   * Prior non-urgent sends in the last 7 days.
   *
   * Optional ONLY as a test seam. When omitted the count is derived from the
   * contact log rather than defaulting to zero — a cap a caller can defeat by
   * forgetting a field is exactly the "enforced by convention" failure this
   * module exists to avoid.
   */
  recentSendCount?: number;
  /** Injectable for tests/preview. Defaults to the pinned NOW. */
  at?: Date;
}

export type SendRefusal =
  | "no-consent"
  | "quiet-hours"
  | "weekly-cap"
  | "missing-idempotency-key"
  | "empty-body";

export interface SendResult {
  ok: boolean;
  /** ACS message id, or the demo equivalent. Absent when refused. */
  deliveryId?: string;
  refusal?: SendRefusal;
  message: string;
  /** The grant that authorized this send, for the record. */
  grant?: ConsentGrant;
  /**
   * Exactly what would be appended to the hash-chained ledger. Returned rather
   * than written so the caller can show the user the event *before* it happens
   * — traceability the member can read, not just an audit trail.
   */
  ledgerEvent: PendingLedgerEvent;
}

/**
 * Exactly a `LedgerDraft` (lib/trace/ledger.ts), so it really does drop
 * straight into `appendLedger` with no adapter.
 *
 * This type previously omitted `actorName` and `actorRole` while claiming
 * compatibility — which meant the claim was only true until someone tried it.
 * Aliasing the real type is what makes the compiler enforce the promise
 * instead of a comment asserting it.
 */
export type PendingLedgerEvent = LedgerDraft;

/** Typed refusal. Callers catch this specifically — never a bare Error. */
export class ConsentError extends Error {
  readonly refusal: SendRefusal;
  readonly clientId: string;
  readonly scope: ConsentScope;
  readonly channel: ContactChannel;

  constructor(
    refusal: SendRefusal,
    message: string,
    ctx: { clientId: string; scope: ConsentScope; channel: ContactChannel },
  ) {
    super(message);
    this.name = "ConsentError";
    this.refusal = refusal;
    this.clientId = ctx.clientId;
    this.scope = ctx.scope;
    this.channel = ctx.channel;
  }
}

// ---------------------------------------------------------------------------
// Provider seam
// ---------------------------------------------------------------------------

export interface CommsProvider {
  readonly name: string;
  send(msg: OutboundMessage, idempotencyKey: string): Promise<SendResult["deliveryId"]>;
}

/**
 * Production adapter — Azure Communication Services.
 *
 * In production this calls ACS Email (`EmailClient.beginSend`) and ACS SMS
 * (`SmsClient.send`) from `@azure/communication-email` / `-sms`. Apex never
 * holds the ACS connection string in configuration or environment: it lives in
 * Key Vault and is read at startup through the Container App's system-assigned
 * managed identity (`DefaultAzureCredential`), so rotating the key is a Key
 * Vault operation and no secret is ever present in a repo, an image layer, or a
 * deployment variable.
 *
 * `idempotencyKey` maps to the ACS client request id, which makes a retried
 * send a no-op at the service boundary rather than at ours.
 *
 * It is deliberately inert in this build — Apex demos must not be able to
 * transmit to a real number.
 */
export class AcsProvider implements CommsProvider {
  readonly name = "azure-communication-services";

  async send(msg: OutboundMessage, idempotencyKey: string): Promise<string> {
    // Production: resolve credential -> client -> beginSend/send -> poll status,
    // then persist the returned message id as ContactEntry.deliveryId so the
    // delivery report webhook can reconcile against it later.
    throw new Error(
      "AcsProvider is not wired in the Apex demo build. Transmission is disabled by design.",
    );
  }
}

/** Deterministic stand-in. Same input, same delivery id, every render. */
export class DemoProvider implements CommsProvider {
  readonly name = "apex-demo";

  async send(msg: OutboundMessage, idempotencyKey: string): Promise<string> {
    return `acs-demo-${sha256(`${idempotencyKey}:${msg.clientId}:${msg.channel}`).slice(0, 12)}`;
  }
}

/** The demo build always uses the inert provider. */
export const provider: CommsProvider = new DemoProvider();

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** 21:00–08:00 spans midnight, so this is an OR, not a range check. */
export function inQuietHours(at: Date = NOW): boolean {
  const h = at.getUTCHours();
  return h >= QUIET_HOURS.startHour || h < QUIET_HOURS.endHour;
}

/** Next permissible send time, for the "scheduled for 8:00am" affordance. */
export function nextSendWindow(at: Date = NOW): Date {
  if (!inQuietHours(at)) return at;
  const next = absolute(at);
  if (at.getUTCHours() >= QUIET_HOURS.startHour) next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(QUIET_HOURS.endHour, 0, 0, 0);
  return next;
}

function denial(
  input: SendInput,
  refusal: SendRefusal,
  message: string,
  at: Date,
): SendResult {
  return {
    ok: false,
    refusal,
    message,
    ledgerEvent: {
      // No `at`: appendLedger stamps the time. A caller that could set it could
      // backdate an event, which is the one thing an append-only log must refuse.
      actorId: input.staffId,
      actorName: staffMap[input.staffId]?.name ?? "Unknown",
      actorRole: staffMap[input.staffId]?.role ?? "Coach",
      action: "deny",
      entity: "consent",
      entityId: `msg-${sha256(input.idempotencyKey || "no-key").slice(0, 10)}`,
      subjectId: input.clientId,
      reason: message,
      after: {
        refusal,
        channel: input.channel,
        scope: input.scope,
        provider: provider.name,
      },
    },
  };
}

/**
 * The guarded entry point. Order matters: consent is evaluated first so a
 * blocked member never reaches rate-limit logic that would leak whether we
 * have been messaging them.
 *
 * Refusals are returned as a result *and* available as a throw via
 * `sendMessageOrThrow` — UI wants the former, jobs want the latter.
 */
export async function sendMessage(input: SendInput): Promise<SendResult> {
  const at = input.at ?? NOW;

  // (d) idempotency is mandatory, checked before anything with side effects.
  if (!input.idempotencyKey || input.idempotencyKey.trim().length === 0) {
    return denial(
      input,
      "missing-idempotency-key",
      "Send refused: no idempotency key. A retry could double-send.",
      at,
    );
  }

  if (!input.body || input.body.trim().length === 0) {
    return denial(input, "empty-body", "Send refused: empty message body.", at);
  }

  // (a) consent — structural, not conventional.
  if (!hasConsent(input.clientId, input.scope, input.channel, at)) {
    return denial(
      input,
      "no-consent",
      `Send refused: no live ${input.scope} consent for ${input.channel}. Consent is revoked, expired, or never granted.`,
      at,
    );
  }
  const grant = activeGrant(input.clientId, input.scope, input.channel, at);

  // (b) quiet hours — urgent clinical may override, and the override is logged.
  if (!input.urgent && inQuietHours(at)) {
    return denial(
      input,
      "quiet-hours",
      `Send refused: quiet hours (${QUIET_HOURS.startHour}:00–0${QUIET_HOURS.endHour}:00). Queued for ${nextSendWindow(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.`,
      at,
    );
  }

  // (c) weekly cap — per member, across every surface.
  const recent = input.recentSendCount ?? outboundThisWeek(input.clientId);
  if (!input.urgent && recent >= WEEKLY_CAP) {
    return denial(
      input,
      "weekly-cap",
      `Send refused: member has already received ${recent} messages this week (cap ${WEEKLY_CAP}).`,
      at,
    );
  }

  const deliveryId = await provider.send(input, input.idempotencyKey);

  return {
    ok: true,
    deliveryId,
    grant,
    message: `Queued via ${provider.name}.`,
    ledgerEvent: {
      actorId: input.staffId,
      actorName: staffMap[input.staffId]?.name ?? "Unknown",
      actorRole: staffMap[input.staffId]?.role ?? "Coach",
      action: "create",
      entity: "note",
      entityId: `msg-${sha256(input.idempotencyKey).slice(0, 10)}`,
      subjectId: input.clientId,
      reason: `${input.scope} ${input.channel} send`,
      after: {
        channel: input.channel,
        scope: input.scope,
        // The authorizing grant is stamped onto the event so legality is
        // re-derivable from the ledger alone, without re-reading consent state
        // that may have changed since.
        grantId: grant?.id,
        grantVersion: grant?.version,
        urgent: Boolean(input.urgent),
        chars: input.body.length,
        deliveryId,
        idempotencyKey: input.idempotencyKey,
        provider: provider.name,
      },
    },
  };
}

/** Same guard, throwing form — for background jobs that must fail loudly. */
export async function sendMessageOrThrow(input: SendInput): Promise<SendResult> {
  const result = await sendMessage(input);
  if (!result.ok) {
    throw new ConsentError(result.refusal ?? "no-consent", result.message, {
      clientId: input.clientId,
      scope: input.scope,
      channel: input.channel,
    });
  }
  return result;
}

/**
 * Non-async preflight for the compose UI: same predicates, no provider call.
 * Lets the send button explain itself before it is pressed.
 */
export function previewSend(input: Omit<SendInput, "idempotencyKey">): {
  allowed: boolean;
  refusal?: SendRefusal;
  message: string;
} {
  const at = input.at ?? NOW;
  if (!hasConsent(input.clientId, input.scope, input.channel, at)) {
    return {
      allowed: false,
      refusal: "no-consent",
      message: `No live ${input.scope} consent for ${input.channel}.`,
    };
  }
  if (!input.urgent && inQuietHours(at)) {
    return { allowed: false, refusal: "quiet-hours", message: "Quiet hours — will queue until 8:00 AM." };
  }
  if (!input.urgent && (input.recentSendCount ?? outboundThisWeek(input.clientId)) >= WEEKLY_CAP) {
    return { allowed: false, refusal: "weekly-cap", message: `Weekly cap of ${WEEKLY_CAP} reached.` };
  }
  return { allowed: true, message: "Ready to send." };
}
