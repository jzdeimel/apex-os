import { clients } from "@/lib/mock/clients";
import { seededRandom, absolute } from "@/lib/utils";
import type {
  ConsentGrant,
  ConsentScope,
  ConsentScopeStatus,
  ConsentSource,
  ConsentSummary,
  ContactChannel,
} from "@/lib/comms/types";

/**
 * Consent evaluation.
 *
 * Two rules govern everything below:
 *
 *  1. FAIL CLOSED. An unknown client, an unknown scope, an unparseable date, a
 *     missing grant — all resolve to "no consent". The audited system's helper
 *     returns `true` when it can't find a record ("assume they said yes at
 *     intake"), which is exactly backwards: the absence of evidence of consent
 *     is the absence of consent.
 *  2. REVOCATION IS TERMINAL AND ADDITIVE. We never delete a grant. A revoked
 *     grant stays in the record with its `revokedAt`, because the question an
 *     auditor asks is not "may we text them today" but "were we permitted to
 *     text them on March 4th". A deleted row cannot answer that.
 */

/** Pinned clock. Nothing in Apex reads the wall clock. */
const NOW = absolute("2026-06-12T09:00:00");

/** Channels a member can hold a grant on. Phone/in-person are consented at the door. */
const CONSENTABLE: ContactChannel[] = ["SMS", "Email", "Portal message"];

const SOURCES: ConsentSource[] = [
  "Intake form",
  "Portal preferences",
  "Written addendum",
  "Verbal — documented",
];

function isoDaysBefore(days: number): string {
  return absolute(NOW.getTime() - days * 86_400_000).toISOString();
}

function isoDaysAfter(days: number): string {
  return absolute(NOW.getTime() + days * 86_400_000).toISOString();
}

/**
 * Deterministic grant set per client.
 *
 * Shape of the population, chosen so the demo shows the guard rails firing
 * rather than a wall of green:
 *  - clinical + operational: granted for essentially everyone (that is what
 *    intake is for), on SMS + Email + Portal message
 *  - marketing: roughly three quarters granted; the rest split between
 *    "revoked via STOP" and "never granted"
 */
function buildGrants(clientId: string): ConsentGrant[] {
  const rand = seededRandom(`apex-consent-v1:${clientId}`);
  const out: ConsentGrant[] = [];
  let n = 0;

  const push = (g: Omit<ConsentGrant, "id">) => {
    n += 1;
    out.push({ ...g, id: `cg-${clientId.slice(-3)}-${String(n).padStart(2, "0")}` });
  };

  const intakeDaysAgo = 60 + Math.floor(rand() * 400);
  const intakeAt = isoDaysBefore(intakeDaysAgo);

  // --- clinical -----------------------------------------------------------
  // Portal message is always granted for clinical: it is the encrypted channel,
  // and it is what makes a lab result deliverable when SMS is refused.
  const clinicalChannels: ContactChannel[] = ["Portal message"];
  if (rand() > 0.12) clinicalChannels.push("Email");
  if (rand() > 0.3) clinicalChannels.push("SMS");
  for (const channel of clinicalChannels) {
    push({
      clientId,
      scope: "clinical",
      channel,
      grantedAt: intakeAt,
      grantedVia: "Intake form",
      version: "clinical-comms-v3",
      sourceDocument: `Consent to Communicate PHI (v3) — signed ${intakeAt.slice(0, 10)}`,
    });
  }

  // --- operational --------------------------------------------------------
  // Everyone. A member who cannot be told their order shipped is a member the
  // front desk has to phone, which is the cost we are removing.
  for (const channel of CONSENTABLE) {
    push({
      clientId,
      scope: "operational",
      channel,
      grantedAt: intakeAt,
      grantedVia: "Intake form",
      version: "operational-comms-v2",
      sourceDocument: `Service Communications Authorization (v2) — signed ${intakeAt.slice(0, 10)}`,
    });
  }

  // --- marketing ----------------------------------------------------------
  const marketingRoll = rand();
  if (marketingRoll < 0.14) {
    // Granted, then revoked — the STOP keyword path. The grant stays.
    const grantedDaysAgo = intakeDaysAgo - 5;
    const revokedDaysAgo = Math.max(2, Math.floor(grantedDaysAgo * rand()));
    for (const channel of ["SMS", "Email"] as ContactChannel[]) {
      push({
        clientId,
        scope: "marketing",
        channel,
        grantedAt: isoDaysBefore(grantedDaysAgo),
        grantedVia: "Intake form",
        revokedAt: isoDaysBefore(revokedDaysAgo),
        version: "marketing-tcpa-v4",
        sourceDocument:
          channel === "SMS"
            ? "TCPA Express Written Consent (v4) — revoked by STOP keyword"
            : "TCPA Express Written Consent (v4) — revoked via portal preferences",
      });
    }
  } else if (marketingRoll < 0.26) {
    // Never granted. No row at all — and `hasConsent` must say no, not shrug.
  } else {
    const via = SOURCES[Math.floor(rand() * SOURCES.length)];
    const channels: ContactChannel[] = rand() > 0.35 ? ["SMS", "Email"] : ["Email"];
    // A slice of marketing consent is time-boxed by policy — the expiry path
    // needs to be exercised by the demo, not just handled in theory.
    const expires = rand() < 0.18;
    for (const channel of channels) {
      push({
        clientId,
        scope: "marketing",
        channel,
        grantedAt: isoDaysBefore(intakeDaysAgo - 3),
        grantedVia: via,
        ...(expires
          ? { expiresAt: rand() > 0.5 ? isoDaysBefore(9) : isoDaysAfter(120) }
          : {}),
        version: "marketing-tcpa-v4",
        sourceDocument: `TCPA Express Written Consent (v4) — ${via}`,
      });
    }
  }

  return out;
}

/** Built once at module load; keyed for O(1) lookup by the send guard. */
const GRANTS_BY_CLIENT: Record<string, ConsentGrant[]> = (() => {
  const map: Record<string, ConsentGrant[]> = {};
  for (const c of clients) map[c.id] = buildGrants(c.id);
  return map;
})();

/** Every grant on file for a client, including revoked ones. */
export function grantsForClient(clientId: string): ConsentGrant[] {
  return GRANTS_BY_CLIENT[clientId] ?? [];
}

/** True only while the grant is live at `at`. Any ambiguity resolves to false. */
export function grantIsLive(grant: ConsentGrant, at: Date = NOW): boolean {
  const t = at.getTime();
  const granted = Date.parse(grant.grantedAt);
  if (!Number.isFinite(granted) || granted > t) return false;
  if (grant.revokedAt) {
    const revoked = Date.parse(grant.revokedAt);
    // An unparseable revocation date is still a revocation. Fail closed.
    if (!Number.isFinite(revoked) || revoked <= t) return false;
  }
  if (grant.expiresAt) {
    const expires = Date.parse(grant.expiresAt);
    if (!Number.isFinite(expires) || expires <= t) return false;
  }
  return true;
}

/**
 * The single question the send path asks. Returns false for unknown clients,
 * unknown scopes, and channels with no grant — never throws, never assumes.
 */
export function hasConsent(
  clientId: string,
  scope: ConsentScope,
  channel: ContactChannel,
  at: Date = NOW,
): boolean {
  return grantsForClient(clientId).some(
    (g) => g.scope === scope && g.channel === channel && grantIsLive(g, at),
  );
}

/** The specific grant authorizing a send — recorded on the ledger event. */
export function activeGrant(
  clientId: string,
  scope: ConsentScope,
  channel: ContactChannel,
  at: Date = NOW,
): ConsentGrant | undefined {
  return grantsForClient(clientId).find(
    (g) => g.scope === scope && g.channel === channel && grantIsLive(g, at),
  );
}

const SCOPE_ORDER: ConsentScope[] = ["clinical", "operational", "marketing"];

export const SCOPE_LABEL: Record<ConsentScope, string> = {
  clinical: "Clinical (PHI)",
  operational: "Operational",
  marketing: "Marketing",
};

export const SCOPE_DESCRIPTION: Record<ConsentScope, string> = {
  clinical: "Lab results, dosing, symptoms — protected health information.",
  operational: "Appointments, order status, billing logistics. No clinical detail.",
  marketing: "Promotional offers and campaigns. TCPA-governed.",
};

/**
 * Per-scope status for rendering. Deliberately returns a row for *every* scope
 * even when there is no grant — a missing scope must be visibly "not granted",
 * not silently absent from the panel.
 */
export function consentSummary(clientId: string, at: Date = NOW): ConsentSummary {
  const all = grantsForClient(clientId);

  const scopes: ConsentScopeStatus[] = SCOPE_ORDER.map((scope) => {
    const forScope = all.filter((g) => g.scope === scope);
    const live = forScope.filter((g) => grantIsLive(g, at));
    const blocked = forScope.filter((g) => !grantIsLive(g, at));
    const revoked = forScope.find((g) => g.revokedAt);
    const expired = blocked.find((g) => g.expiresAt && !g.revokedAt);

    let reason: string;
    if (live.length > 0) {
      reason = `Granted ${absolute(live[0].grantedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })} via ${live[0].grantedVia}.`;
    } else if (revoked) {
      reason = `Revoked ${absolute(revoked.revokedAt as string).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}. Sends on this scope are blocked.`;
    } else if (expired) {
      reason = "Consent expired. Re-consent required before sending.";
    } else {
      reason = "No consent on file. Sends on this scope are blocked.";
    }

    return {
      scope,
      active: live.length > 0,
      channels: live.map((g) => g.channel),
      blockedChannels: blocked.map((g) => g.channel),
      grantedAt: live[0]?.grantedAt ?? forScope[0]?.grantedAt,
      revokedAt: revoked?.revokedAt,
      expiresAt: live.find((g) => g.expiresAt)?.expiresAt ?? expired?.expiresAt,
      reason,
    };
  });

  return {
    clientId,
    scopes,
    marketingReachable: scopes.find((s) => s.scope === "marketing")?.active ?? false,
  };
}

/** Clinic-wide rollup for the ops dashboard. */
export function consentStats(at: Date = NOW) {
  let marketingOk = 0;
  let clinicalSmsOk = 0;
  let revoked = 0;
  for (const c of clients) {
    const summary = consentSummary(c.id, at);
    if (summary.marketingReachable) marketingOk += 1;
    if (hasConsent(c.id, "clinical", "SMS", at)) clinicalSmsOk += 1;
    if (summary.scopes.some((s) => s.revokedAt)) revoked += 1;
  }
  return {
    total: clients.length,
    marketingReachable: marketingOk,
    clinicalSmsReachable: clinicalSmsOk,
    withRevocation: revoked,
  };
}
