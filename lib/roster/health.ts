import type { Client, LocationId } from "@/lib/types";
import { clients, clientName } from "@/lib/mock/clients";
import { membershipForClient } from "@/lib/mock/memberships";
import { orders } from "@/lib/mock/orders";
import { seededRandom } from "@/lib/utils";

/**
 * ROSTER HEALTH — data quality as an operational surface.
 *
 * ── Why this page exists ──────────────────────────────────────────────────
 * Every clinic's roster rots. A client is created at the front desk mid-phone
 * call and the phone number never gets typed. A coach leaves and their book is
 * never reassigned. A membership lapses and nobody flips the client status, so
 * the member keeps appearing on "active" reports forever.
 *
 * None of that is dramatic on the day it happens. It becomes dramatic the day
 * a $600 cold-chain order ships to a member you cannot reach, or the day a
 * member with no assigned provider sits in "Results Ready" for six weeks
 * because there is literally nobody the queue could route them to.
 *
 * ── THE THING THE AUDITED SYSTEM GETS WRONG ───────────────────────────────
 * Its roster page finds the problems. It genuinely does — the detection logic
 * is fine. Then it renders them as inert rows of text. The client's name is
 * not a link. There is no action on the row. To fix one flagged client you
 * copy the name, open the client search, paste, open the record, find the tab
 * that owns the broken field, edit it, save, then go back to the report and
 * find your place again. Roughly six navigations per finding, times a
 * three-hundred-row report, which is why nobody ever works the report and why
 * the same findings are still on it a year later.
 *
 * A finding that is expensive to act on is not a finding. It is a complaint.
 *
 * So every finding this module produces carries `fixHref` — one click to the
 * exact record — and, where the fix is unambiguous, an `inlineFix` the admin
 * can apply from the row without leaving the page. Applying it appends a
 * ledger row, because a data correction on a patient record is a change to
 * the chart and must be attributable.
 */

/** Pinned demo clock. Never `new Date()` with no argument. */
export const NOW = "2026-06-12T09:00:00";

const DAY_MS = 1000 * 60 * 60 * 24;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.floor(
    (new Date(toIso).getTime() - new Date(fromIso).getTime()) / DAY_MS,
  );
}

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

export type Severity = "critical" | "warning" | "info";

export const SEVERITY_ORDER: Severity[] = ["critical", "warning", "info"];

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  warning: "Needs attention",
  info: "Worth cleaning up",
};

export const SEVERITY_TONE: Record<Severity, "high" | "watch" | "info"> = {
  critical: "high",
  warning: "watch",
  info: "info",
};

/**
 * Score weights. A critical finding costs 5x an informational one, so a roster
 * with two hundred stale-contact nudges still scores better than one with
 * forty unreachable members — which is the correct priority ordering for an
 * admin deciding where an afternoon goes.
 */
const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 5,
  warning: 2,
  info: 1,
};

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

export type CheckId =
  | "no-coach"
  | "no-provider"
  | "missing-contact"
  | "no-location"
  | "no-labs"
  | "stale"
  | "membership-lapsed"
  | "appointment-past";

export interface CheckDef {
  id: CheckId;
  label: string;
  severity: Severity;
  /**
   * One line, in the admin's language, explaining the operational consequence.
   * Not "field is null" — what breaks downstream when it stays null.
   */
  whyItMatters: string;
  /** Where on the client record the fix lives. */
  fixLabel: string;
}

export const CHECKS: CheckDef[] = [
  {
    id: "no-coach",
    label: "No assigned coach",
    severity: "critical",
    whyItMatters:
      "Nobody owns this member. They appear on no coach's roster, so check-ins, adherence and escalations all silently route to no one.",
    fixLabel: "Assign a coach",
  },
  {
    id: "no-provider",
    label: "No assigned provider",
    severity: "critical",
    whyItMatters:
      "Only a licensed provider can approve a protocol. With no provider on the record, this member's plan cannot be signed and will sit in the review queue indefinitely.",
    fixLabel: "Assign a provider",
  },
  {
    id: "missing-contact",
    label: "Missing email or phone",
    severity: "critical",
    whyItMatters:
      "A missing phone means an order ships to a member you cannot reach — no delivery confirmation, no cold-chain warning, no way to say the shipment is delayed.",
    fixLabel: "Add contact details",
  },
  {
    id: "membership-lapsed",
    label: "Membership lapsed but status still active",
    severity: "critical",
    whyItMatters:
      "The clinical record says active, billing says lapsed. This member is being coached and shipped to for free, and they are counted in MRR that will never arrive.",
    fixLabel: "Reconcile membership",
  },
  {
    id: "no-location",
    label: "No home location",
    severity: "warning",
    whyItMatters:
      "Location drives access scope, scheduling and inventory. An unlocated member is invisible to every location-filtered board in Apex, including this one.",
    fixLabel: "Set home location",
  },
  {
    id: "no-labs",
    label: "No labs on file at a stage that requires them",
    severity: "warning",
    whyItMatters:
      "This member's status says a provider has results to act on, and there are none. Either the draw never happened or the result never came back — both need a phone call today.",
    fixLabel: "Review lab orders",
  },
  {
    id: "appointment-past",
    label: "Next appointment is in the past",
    severity: "warning",
    whyItMatters:
      "The next-appointment field is what every follow-up automation reads. A past date means the member looks scheduled to the system and is scheduled to nobody in reality.",
    fixLabel: "Rebook",
  },
  {
    id: "stale",
    label: "No contact in 60+ days",
    severity: "info",
    whyItMatters:
      "Two months of silence is the strongest churn signal in the book. Nothing is broken yet — that is exactly why it is cheap to fix now.",
    fixLabel: "Log a touch",
  },
];

export const CHECK_BY_ID: Record<CheckId, CheckDef> = Object.fromEntries(
  CHECKS.map((c) => [c.id, c]),
) as Record<CheckId, CheckDef>;

// ---------------------------------------------------------------------------
// The synthetic gap overlay
// ---------------------------------------------------------------------------

/**
 * DEMO-SHAPED, AND HONEST ABOUT IT.
 *
 * In production these checks read the client record directly: `!c.coachId`,
 * `!c.phone`, and so on. There is no overlay and this whole section does not
 * exist.
 *
 * The demo dataset, however, is generated and therefore synthetically perfect
 * — every client has a coach, a provider, an email and a phone. A data-quality
 * page over flawless data renders an empty state and teaches the viewer
 * nothing about whether the surface works.
 *
 * So a deterministic overlay marks a small share of records as having arrived
 * from the legacy migration with gaps, seeded by client id. Same clients,
 * same gaps, every render, on every machine. `effectiveClient()` is the only
 * reader; every check below consumes its output rather than the raw record, so
 * deleting this section and returning the client unchanged is all it takes to
 * make the module production-real.
 */
interface Gap {
  coach: boolean;
  provider: boolean;
  email: boolean;
  phone: boolean;
  location: boolean;
  /** A next-appointment date that came across already in the past. */
  staleAppointment: boolean;
}

const NO_GAP: Gap = {
  coach: false,
  provider: false,
  email: false,
  phone: false,
  location: false,
  staleAppointment: false,
};

function gapFor(client: Client): Gap {
  const rand = seededRandom(`roster-gap:${client.id}`);
  const roll = rand();
  // ~92% of the book migrated cleanly. The rest is what an admin works.
  if (roll > 0.085) return NO_GAP;
  return {
    coach: rand() < 0.28,
    provider: rand() < 0.24,
    email: rand() < 0.3,
    phone: rand() < 0.34,
    // A truly unlocated record is rare — it takes a bad import to produce one.
    location: rand() < 0.06,
    staleAppointment: rand() < 0.4,
  };
}

/** How far in the past a migrated appointment date landed. Stable per client. */
function staleAppointmentDate(client: Client, nowIso: string): string {
  const rand = seededRandom(`roster-appt:${client.id}`);
  const daysAgo = 3 + Math.floor(rand() * 70);
  const d = new Date(new Date(nowIso).getTime() - daysAgo * DAY_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(9 + (daysAgo % 8))}:00:00`
  );
}

/**
 * The client as the data actually is, gaps included. Everything downstream —
 * checks, counts, the score — reads this, never the raw record.
 */
export interface EffectiveClient {
  client: Client;
  coachId: string | null;
  providerId: string | null;
  email: string | null;
  phone: string | null;
  locationId: LocationId | null;
  nextAppointment?: string;
}

export function effectiveClient(
  client: Client,
  nowIso: string = NOW,
): EffectiveClient {
  const gap = gapFor(client);
  return {
    client,
    coachId: gap.coach ? null : client.coachId,
    providerId: gap.provider ? null : client.providerId,
    email: gap.email ? null : client.email,
    phone: gap.phone ? null : client.phone,
    locationId: gap.location ? null : client.locationId,
    nextAppointment:
      gap.staleAppointment && client.nextAppointment
        ? staleAppointmentDate(client, nowIso)
        : client.nextAppointment,
  };
}

// ---------------------------------------------------------------------------
// Derived signals (these are real — no overlay involved)
// ---------------------------------------------------------------------------

/** Statuses that imply a provider is already acting on results. */
const LABS_EXPECTED_AT: ReadonlySet<Client["status"]> = new Set([
  "Results Ready",
  "Plan Review",
  "Active Protocol",
  "Follow-Up Due",
]);

/** Statuses where an active membership is genuinely expected. */
const ACTIVE_CARE_STATUSES: ReadonlySet<Client["status"]> = new Set([
  "Active Protocol",
  "Follow-Up Due",
  "Plan Review",
]);

/**
 * Most recent evidence anyone interacted with this member, from real records:
 * the last lab, the last order placed, and the join date as a floor.
 *
 * Deliberately NOT derived from the audit ledger. The ledger is a 240-row demo
 * sample, so "no ledger event" would flag nearly the whole book — a check that
 * fires on everything is indistinguishable from a check that is broken.
 */
const lastOrderByClient: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const o of orders) {
    const at = o.lastActivity ?? o.placedAt;
    if (!out[o.clientId] || out[o.clientId] < at) out[o.clientId] = at;
  }
  return out;
})();

export function lastTouchAt(client: Client): string {
  const candidates = [
    client.joinedOn,
    client.latestLabDate,
    lastOrderByClient[client.id],
  ].filter((x): x is string => Boolean(x));
  return candidates.reduce((a, b) => (a > b ? a : b));
}

const STALE_DAYS = 60;

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

/**
 * An inline fix the admin can apply from the row.
 *
 * `apply` is intentionally absent — this is a demo build and nothing mutates
 * the seeded dataset. What the row DOES do on resolve is append a ledger entry
 * describing the correction, which is the part that matters architecturally: a
 * data correction on a patient record is a chart change and must be
 * attributable to a person, a time and a stated before/after.
 */
export interface InlineFix {
  /** Button copy. Imperative, specific. */
  label: string;
  /** What the value becomes, for the ledger diff and the confirmation toast. */
  resolution: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export interface Finding {
  /** Stable across renders so resolved state can be tracked by id. */
  id: string;
  checkId: CheckId;
  severity: Severity;
  clientId: string;
  clientName: string;
  mrn: string;
  locationId: LocationId | null;
  /** What is wrong with THIS record, specifically. */
  detail: string;
  /** One click to the record that fixes it. */
  fixHref: string;
  inlineFix?: InlineFix;
}

/** Suggest the busiest-adjacent coach at the member's location. */
function suggestAssignee(
  ec: EffectiveClient,
  kind: "coach" | "provider",
): string | null {
  // The suggestion is the value already on the record — the overlay hid it,
  // and in production this would be a real "most available at this location"
  // query. Either way the point is identical: the row proposes an answer
  // instead of making the admin go find one.
  return kind === "coach" ? ec.client.coachId : ec.client.providerId;
}

function findingsForClient(ec: EffectiveClient, nowIso: string): Finding[] {
  const c = ec.client;
  const out: Finding[] = [];
  const name = clientName(c);
  const href = `/clients/${c.id}`;
  const base = {
    clientId: c.id,
    clientName: name,
    mrn: c.mrn,
    locationId: ec.locationId,
  };

  const push = (
    checkId: CheckId,
    detail: string,
    inlineFix?: InlineFix,
    hrefOverride?: string,
  ) => {
    out.push({
      id: `${c.id}:${checkId}`,
      checkId,
      severity: CHECK_BY_ID[checkId].severity,
      detail,
      fixHref: hrefOverride ?? href,
      inlineFix,
      ...base,
    });
  };

  // ── Critical ────────────────────────────────────────────────────────────
  if (!ec.coachId) {
    const suggested = suggestAssignee(ec, "coach");
    push(
      "no-coach",
      "Coach field is empty. This member is on no roster.",
      suggested
        ? {
            label: "Assign coach",
            resolution: "Assigned to the coach covering this location",
            before: { coachId: null },
            after: { coachId: suggested },
          }
        : undefined,
    );
  }

  if (!ec.providerId) {
    const suggested = suggestAssignee(ec, "provider");
    push(
      "no-provider",
      `Provider field is empty while plan status is "${c.planStatus}".`,
      suggested
        ? {
            label: "Assign provider",
            resolution: "Assigned to the approving provider at this location",
            before: { providerId: null },
            after: { providerId: suggested },
          }
        : undefined,
    );
  }

  if (!ec.email || !ec.phone) {
    const missing = !ec.email && !ec.phone ? "email and phone" : !ec.phone ? "phone" : "email";
    push(
      "missing-contact",
      `No ${missing} on file. ${
        !ec.phone
          ? "Shipping notifications and delivery exceptions have nowhere to go."
          : "Lab results and portal invitations cannot be delivered."
      }`,
    );
  }

  const membership = membershipForClient(c.id);
  if (membership?.status === "Lapsed" && ACTIVE_CARE_STATUSES.has(c.status)) {
    push(
      "membership-lapsed",
      `${membership.tier} lapsed, but client status is "${c.status}". Billing and care disagree.`,
      {
        label: "Flag for billing",
        resolution: "Routed to billing for reconciliation",
        before: { membershipStatus: "Lapsed", clientStatus: c.status },
        after: { reconciliation: "queued", owner: "Billing" },
      },
    );
  }

  // ── Warning ─────────────────────────────────────────────────────────────
  if (!ec.locationId) {
    push(
      "no-location",
      "No home location. Excluded from every location-scoped board and schedule.",
    );
  }

  if (LABS_EXPECTED_AT.has(c.status) && !c.latestLabDate) {
    push(
      "no-labs",
      `Status is "${c.status}" with no lab result on file. Either the draw never happened or the result never returned.`,
    );
  }

  if (ec.nextAppointment && ec.nextAppointment < nowIso) {
    const days = daysBetween(ec.nextAppointment, nowIso);
    push(
      "appointment-past",
      `Next appointment was ${days} day${days === 1 ? "" : "s"} ago and was never rebooked or closed out.`,
      undefined,
      `/schedule`,
    );
  }

  // ── Info ────────────────────────────────────────────────────────────────
  if (c.status !== "Inactive") {
    const touch = lastTouchAt(c);
    const days = daysBetween(touch, nowIso);
    if (days >= STALE_DAYS) {
      push(
        "stale",
        `No lab, order or visit in ${days} days. Last recorded activity ${touch.slice(0, 10)}.`,
      );
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

export interface CheckSummary {
  check: CheckDef;
  count: number;
}

export interface RosterHealth {
  /** Every finding, ordered critical-first then by client name. */
  findings: Finding[];
  /** Findings bucketed by severity, in display order. */
  bySeverity: Array<{ severity: Severity; findings: Finding[] }>;
  countsByCheck: CheckSummary[];
  clientsScanned: number;
  /** Distinct clients carrying at least one finding. */
  clientsAffected: number;
  /** 0–100. 100 = every record complete. */
  score: number;
  scannedAt: string;
}

export interface RosterFilter {
  locationId?: LocationId | "all";
  checkId?: CheckId | "all";
  severity?: Severity | "all";
  /** Finding ids the admin resolved this session — excluded from the result. */
  resolvedIds?: ReadonlySet<string>;
}

/**
 * Health score.
 *
 * Weighted penalty against the theoretical worst case (every client carrying
 * every check), then floored at 0. The absolute number matters less than its
 * direction: an admin who works the critical bucket must see it move, and a
 * flat percentage of clean records would barely budge for forty fixes across
 * five hundred members.
 */
function scoreFor(findings: Finding[], clientsScanned: number): number {
  if (clientsScanned === 0) return 100;
  const penalty = findings.reduce(
    (sum, f) => sum + SEVERITY_WEIGHT[f.severity],
    0,
  );
  // Denominator: one critical finding per client in the book. That is the
  // realistic floor of a genuinely broken roster, not the arithmetic worst
  // case (every client failing every check), which no real dataset approaches
  // and which would compress every plausible score into the high nineties.
  const ceiling = clientsScanned * SEVERITY_WEIGHT.critical;
  return Math.max(0, Math.round(100 - (penalty / ceiling) * 100));
}

export function runRosterHealth(
  filter: RosterFilter = {},
  nowIso: string = NOW,
): RosterHealth {
  const {
    locationId = "all",
    checkId = "all",
    severity = "all",
    resolvedIds,
  } = filter;

  const scoped = clients.map((c) => effectiveClient(c, nowIso));

  let findings: Finding[] = [];
  for (const ec of scoped) {
    findings.push(...findingsForClient(ec, nowIso));
  }

  // Location filter is applied to FINDINGS, not clients, so a record with no
  // location still shows up under "All locations" — the unlocated member is
  // precisely the one a location-scoped view would hide, and hiding it is how
  // it stays broken for a year.
  if (locationId !== "all") {
    findings = findings.filter((f) => f.locationId === locationId);
  }
  if (severity !== "all") {
    findings = findings.filter((f) => f.severity === severity);
  }
  if (resolvedIds && resolvedIds.size > 0) {
    findings = findings.filter((f) => !resolvedIds.has(f.id));
  }

  // Per-check counts are taken BEFORE the check filter is applied, so the
  // filter control keeps showing what selecting each option would yield. A
  // filter whose own counts collapse to zero the moment you use it is a filter
  // you can only use once.
  const countsByCheck = CHECKS.map((check) => ({
    check,
    count: findings.filter((f) => f.checkId === check.id).length,
  }));

  // Scored before the check filter narrows the view: the health score is a
  // property of the roster, not of whatever the admin is currently looking at.
  const score = scoreFor(
    findings,
    locationId === "all"
      ? scoped.length
      : scoped.filter((s) => s.locationId === locationId).length,
  );
  const clientsAffected = new Set(findings.map((f) => f.clientId)).size;

  if (checkId !== "all") {
    findings = findings.filter((f) => f.checkId === checkId);
  }

  const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  findings.sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] ||
      a.clientName.localeCompare(b.clientName) ||
      a.checkId.localeCompare(b.checkId),
  );

  const bySeverity = SEVERITY_ORDER.map((s) => ({
    severity: s,
    findings: findings.filter((f) => f.severity === s),
  }));

  const clientsScanned =
    locationId === "all"
      ? scoped.length
      : scoped.filter((s) => s.locationId === locationId).length;

  return {
    findings,
    bySeverity,
    countsByCheck,
    clientsScanned,
    clientsAffected,
    score,
    scannedAt: nowIso,
  };
}

/** Band for the score ring. */
export function scoreBand(score: number): {
  label: string;
  tone: "optimal" | "watch" | "high";
  color: string;
} {
  if (score >= 85) return { label: "Healthy", tone: "optimal", color: "#34d399" };
  if (score >= 60) return { label: "Needs work", tone: "watch", color: "#e0bd6e" };
  return { label: "At risk", tone: "high", color: "#e93d3d" };
}
