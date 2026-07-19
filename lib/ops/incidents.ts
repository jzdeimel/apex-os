import type { LocationId } from "@/lib/types";
import { clients, clientMap, clientName } from "@/lib/mock/clients";
import { staff, staffMap, staffName } from "@/lib/mock/staff";
import { appendLedger, type LedgerRow } from "@/lib/trace/ledger";
import { VIEWER } from "@/lib/viewer";
import { seededRandom } from "@/lib/utils";

/**
 * INCIDENT & COMPLAINT LOG.
 *
 * The least glamorous surface in Apex and the first one an auditor, a
 * malpractice carrier or a state board asks to see. Nobody demos it. Everybody
 * needs it.
 *
 * ---------------------------------------------------------------------------
 * WHAT MAKES A LOG SURVIVE AN AUDIT
 * ---------------------------------------------------------------------------
 * Three properties, and a log missing any one of them is worse than no log
 * because it creates a false record:
 *
 *  1. NOTHING IS EVER DELETED OR EDITED IN PLACE. An incident that was
 *     downgraded from "high" to "low" three weeks after it was filed is the
 *     single most interesting row in any log, and a system that overwrites
 *     severity destroys exactly that. Every state change here appends a ledger
 *     row carrying the before and the after, so the downgrade is visible and
 *     attributable years later.
 *  2. THE CLOCK STARTS WHEN IT HAPPENED, NOT WHEN IT WAS FILED. `at` is the
 *     occurrence time; `reportedAt` is when it entered the system. The gap
 *     between them is a finding in itself — a serious event filed nine days
 *     late says something about the reporting culture that no severity field
 *     captures.
 *  3. ACTIONS ARE TIMESTAMPED AND OWNED. "We addressed it" is not a record.
 *     Each action carries who did what and when, so a resolution can be
 *     reconstructed rather than asserted.
 *
 * ---------------------------------------------------------------------------
 * WHY SEVERITY IS ASSIGNED, NOT COMPUTED
 * ---------------------------------------------------------------------------
 * There is no rule that reliably derives clinical severity from a category. A
 * missed appointment is trivial; a missed appointment for a member whose lab
 * showed a critical value is not, and only a person knows the difference.
 * Severity is therefore a human field with a definition attached (see
 * `SEVERITY_DEFINITION`) rather than a computed one, and changing it is a
 * logged act.
 */

/** Pinned clock. */
const NOW_ISO = "2026-06-12T09:00:00";
const NOW = new Date(NOW_ISO);
const DAY_MS = 86_400_000;

export type IncidentKind =
  | "Clinical safety"
  | "Medication / protocol error"
  | "Privacy / PHI"
  | "Member complaint"
  | "Billing dispute"
  | "Facility / equipment"
  | "Staff conduct"
  | "Supply / cold chain";

export type IncidentSeverity = "low" | "moderate" | "high" | "critical";

export type IncidentStatus =
  | "Open"
  | "Under review"
  | "Action taken"
  | "Resolved"
  | "Escalated";

export interface IncidentAction {
  id: string;
  at: string;
  byId: string;
  byName: string;
  /** What was actually done. Not a status change — those are `status` moves. */
  detail: string;
}

export interface Incident {
  id: string;
  /** When it happened. */
  at: string;
  /** When it was filed. The gap from `at` is itself a signal. */
  reportedAt: string;
  kind: IncidentKind;
  severity: IncidentSeverity;
  reportedBy: string;
  locationId: LocationId;
  /** Present when a specific member was involved. Many incidents have none. */
  clientId?: string;
  summary: string;
  actions: IncidentAction[];
  status: IncidentStatus;
  resolvedAt?: string;
}

/**
 * Severity definitions.
 *
 * Written down and rendered on screen because severity fields without published
 * definitions drift within about six months: one manager's "high" becomes
 * another's "moderate", the trend line flattens, and the flattening looks like
 * improvement.
 */
export const SEVERITY_DEFINITION: Record<IncidentSeverity, string> = {
  critical:
    "Member harm occurred, or PHI was disclosed outside the clinic. Notify the medical director the same day.",
  high: "Member harm was possible and was avoided by chance rather than by a control. Review within 24 hours.",
  moderate: "Care or service was materially affected. No potential for harm. Review within 5 business days.",
  low: "Service annoyance or a near-miss caught by an existing control working as designed.",
};

export const SEVERITY_ORDER: IncidentSeverity[] = ["critical", "high", "moderate", "low"];

export const SEVERITY_TONE: Record<IncidentSeverity, "high" | "watch" | "neutral"> = {
  critical: "high",
  high: "high",
  moderate: "watch",
  low: "neutral",
};

/** Days a severity may sit unresolved before it is overdue. */
export const RESOLUTION_TARGET_DAYS: Record<IncidentSeverity, number> = {
  critical: 1,
  high: 3,
  moderate: 10,
  low: 21,
};

export const STATUS_ORDER: IncidentStatus[] = [
  "Open",
  "Under review",
  "Action taken",
  "Escalated",
  "Resolved",
];

/**
 * Legal state machine.
 *
 * A resolved incident cannot be silently reopened into "Open" — it goes to
 * "Under review", so the record shows a reopening rather than presenting as if
 * it had never been closed.
 */
export const ALLOWED_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  Open: ["Under review", "Escalated"],
  "Under review": ["Action taken", "Escalated", "Resolved"],
  "Action taken": ["Resolved", "Escalated", "Under review"],
  Escalated: ["Under review", "Action taken", "Resolved"],
  Resolved: ["Under review"],
};

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

interface Template {
  kind: IncidentKind;
  severity: IncidentSeverity;
  summary: string;
  needsClient: boolean;
  actions: string[];
}

/**
 * Incident templates.
 *
 * Operational and service events only. Nothing here asserts a dose, a route, a
 * frequency or a clinical outcome — an incident log that fabricates "member
 * received 200mg instead of 100mg" would be inventing a clinical fact in the
 * one record type most likely to be read as authoritative.
 */
const TEMPLATES: Template[] = [
  {
    kind: "Member complaint",
    severity: "low",
    summary: "Member reported a 40-minute wait past their appointment time with no update from the front desk.",
    needsClient: true,
    actions: [
      "Called the member, apologised, credited the visit fee.",
      "Added a front-desk rule: any wait past 15 minutes gets a verbal update.",
    ],
  },
  {
    kind: "Member complaint",
    severity: "moderate",
    summary: "Member could not reach their coach for six days across three channels. Coach was on leave with no cover assigned.",
    needsClient: true,
    actions: [
      "Assigned interim coach and contacted the member the same day.",
      "Leave process updated to require a named cover before leave is approved.",
    ],
  },
  {
    kind: "Privacy / PHI",
    severity: "critical",
    summary: "Lab result letter placed in the wrong envelope and mailed to a different member. Recipient called to report it.",
    needsClient: true,
    actions: [
      "Recovered the document from the recipient and confirmed destruction in writing.",
      "Notified the affected member by phone and in writing.",
      "Breach assessment completed and filed with the privacy officer.",
    ],
  },
  {
    kind: "Privacy / PHI",
    severity: "high",
    summary: "Workstation at the front desk left unlocked and unattended with a member chart on screen.",
    needsClient: false,
    actions: [
      "Screen-lock timeout reduced to 90 seconds across all clinic workstations.",
      "Re-ran privacy acknowledgement with the front-desk team.",
    ],
  },
  {
    kind: "Medication / protocol error",
    severity: "high",
    summary: "Protocol change signed by the provider was not reflected in the member's plan for three days; member continued on the superseded plan.",
    needsClient: true,
    actions: [
      "Provider contacted the member directly and confirmed the current plan.",
      "Root cause: plan supersession did not fire on the mobile client. Defect raised.",
    ],
  },
  {
    kind: "Medication / protocol error",
    severity: "moderate",
    summary: "Order dispatched to fulfilment against a plan that had not yet been provider-signed. Caught at the pharmacy, not by us.",
    needsClient: true,
    actions: [
      "Order held and cancelled before shipment.",
      "Approval gate moved ahead of dispatch in the order lifecycle.",
    ],
  },
  {
    kind: "Supply / cold chain",
    severity: "high",
    summary: "Refrigerator at Myrtle Beach logged 11°C overnight. Contents quarantined pending vendor guidance.",
    needsClient: false,
    actions: [
      "Stock quarantined and vendor contacted for stability guidance.",
      "Continuous temperature logging with alerting installed.",
    ],
  },
  {
    kind: "Facility / equipment",
    severity: "moderate",
    summary: "Body composition scanner out of service for four days; scheduled scans not proactively rescheduled.",
    needsClient: false,
    actions: [
      "Vendor callout raised; loaner unit sourced.",
      "Affected members contacted and rebooked.",
    ],
  },
  {
    kind: "Billing dispute",
    severity: "low",
    summary: "Member charged for a membership month after requesting a pause. Pause request was in a chat thread, never actioned.",
    needsClient: true,
    actions: [
      "Refunded in full.",
      "Pause requests now only accepted through the portal, which creates a record.",
    ],
  },
  {
    kind: "Billing dispute",
    severity: "moderate",
    summary: "Member invoiced twice for the same lab panel across two systems during the migration window.",
    needsClient: true,
    actions: ["Duplicate charge reversed.", "Reconciliation report added to the daily ops run."],
  },
  {
    kind: "Clinical safety",
    severity: "critical",
    summary: "Resulted panel with out-of-range markers sat unreviewed for nine days. Member was not contacted in that window.",
    needsClient: true,
    actions: [
      "Panel reviewed by the medical director and the member contacted the same day.",
      "Unreviewed-lab alerting enabled at 48 hours, with a daily worklist to the on-duty provider.",
    ],
  },
  {
    kind: "Clinical safety",
    severity: "high",
    summary: "Member reported a reaction after a visit and could not reach anyone outside opening hours. No after-hours path was published.",
    needsClient: true,
    actions: [
      "Provider contacted the member that evening.",
      "After-hours escalation number published in the portal and on every visit summary.",
    ],
  },
  {
    kind: "Staff conduct",
    severity: "moderate",
    summary: "Coach answered a member's dosing question directly rather than routing it to the provider.",
    needsClient: true,
    actions: [
      "Provider contacted the member and confirmed the correct guidance.",
      "Coach re-sat scope-of-practice certification.",
    ],
  },
  {
    kind: "Member complaint",
    severity: "low",
    summary: "Member received four automated messages in two days from separate systems during the migration cutover.",
    needsClient: true,
    actions: ["Apologised.", "Per-member weekly message cap enforced across every send surface."],
  },
  {
    kind: "Facility / equipment",
    severity: "low",
    summary: "Consult room air conditioning failed during an afternoon clinic; two visits moved to a different room.",
    needsClient: false,
    actions: ["Contractor attended next morning."],
  },
];

const LOCATION_IDS: LocationId[] = [
  "raleigh",
  "raleigh-boutique",
  "southern-pines",
  "myrtle-beach",
  "telehealth",
];

function isoAt(daysAgo: number, hour: number, minute: number): string {
  const d = new Date(NOW.getTime() - daysAgo * DAY_MS);
  d.setHours(hour, minute, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

function generate(): Incident[] {
  const out: Incident[] = [];
  const reporters = staff.filter((s) => s.role !== "Medical" || s.canApprove);

  for (let i = 0; i < 26; i++) {
    const rand = seededRandom(`apex-incident-v1:${i}`);
    const t = TEMPLATES[i % TEMPLATES.length];

    const daysAgo = 1 + Math.floor(rand() * 150);
    const at = isoAt(daysAgo, 8 + Math.floor(rand() * 10), rand() < 0.5 ? 5 : 40);

    // Reporting lag: usually same day, sometimes days later. The lag on a
    // serious incident is the finding, so it is modelled rather than assumed
    // to be zero.
    const lagDays = rand() < 0.62 ? 0 : 1 + Math.floor(rand() * 9);
    const reportedAt = isoAt(Math.max(0, daysAgo - lagDays), 9 + Math.floor(rand() * 8), 15);

    const reporter = reporters[Math.floor(rand() * reporters.length)];
    const client = t.needsClient ? clients[Math.floor(rand() * clients.length)] : undefined;

    const target = RESOLUTION_TARGET_DAYS[t.severity];
    // Most incidents get worked. A minority — deliberately including serious
    // ones — are still open past target, because that is the row this log
    // exists to surface.
    const resolveRoll = rand();
    const resolved = resolveRoll < (t.severity === "low" ? 0.7 : 0.78);

    const actionCount = resolved ? t.actions.length : Math.min(t.actions.length, Math.floor(rand() * 2));
    const actions: IncidentAction[] = t.actions.slice(0, actionCount).map((detail, k) => {
      const actor = reporters[Math.floor(seededRandom(`${i}:action:${k}`)() * reporters.length)];
      return {
        id: `inc-${String(i + 1).padStart(3, "0")}-a${k + 1}`,
        at: isoAt(Math.max(0, daysAgo - lagDays - (k + 1)), 11 + k, 30),
        byId: actor.id,
        byName: actor.name,
        detail,
      };
    });

    let status: IncidentStatus;
    let resolvedAt: string | undefined;
    if (resolved) {
      status = "Resolved";
      resolvedAt = isoAt(
        Math.max(0, daysAgo - lagDays - Math.max(1, Math.floor(target * (0.4 + rand())))),
        16,
        0,
      );
    } else if (t.severity === "critical" || t.severity === "high") {
      status = rand() < 0.5 ? "Escalated" : "Under review";
    } else {
      status = actions.length > 0 ? "Action taken" : "Open";
    }

    out.push({
      id: `inc-${String(i + 1).padStart(3, "0")}`,
      at,
      reportedAt,
      kind: t.kind,
      severity: t.severity,
      reportedBy: reporter.id,
      locationId: client?.locationId ?? LOCATION_IDS[Math.floor(rand() * LOCATION_IDS.length)],
      clientId: client?.id,
      summary: t.summary,
      actions,
      status,
      resolvedAt,
    });
  }

  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * The log. Mutable only through the functions below, each of which appends a
 * ledger row — see the module docblock on why nothing is edited in place.
 */
export const incidents: Incident[] = generate();

// ---------------------------------------------------------------------------
// Derived
// ---------------------------------------------------------------------------

/** Days from occurrence to filing. Anything over 1 on a serious incident is a finding. */
export function reportingLagDays(inc: Incident): number {
  return Math.max(
    0,
    Math.round((new Date(inc.reportedAt).getTime() - new Date(inc.at).getTime()) / DAY_MS),
  );
}

/** Days open. Resolved incidents freeze at their resolution date. */
export function ageDays(inc: Incident): number {
  const end = inc.resolvedAt ? new Date(inc.resolvedAt).getTime() : NOW.getTime();
  return Math.max(0, Math.round((end - new Date(inc.reportedAt).getTime()) / DAY_MS));
}

export function isOverdue(inc: Incident): boolean {
  if (inc.status === "Resolved") return false;
  return ageDays(inc) > RESOLUTION_TARGET_DAYS[inc.severity];
}

export interface IncidentFilter {
  status?: IncidentStatus | "all" | "open";
  severity?: IncidentSeverity | "all";
  kind?: IncidentKind | "all";
  locationId?: LocationId | "all";
}

/**
 * Filtered view, ordered severity-first then oldest-first.
 *
 * Newest-first is the wrong default for a work queue: the row that has been
 * ignored longest is the one that gets ignored again, and putting today's minor
 * complaint above a three-week-old high-severity item is how that happens.
 */
export function filterIncidents(f: IncidentFilter = {}): Incident[] {
  return incidents
    .filter((i) => {
      if (f.status === "open") return i.status !== "Resolved";
      if (f.status && f.status !== "all" && i.status !== f.status) return false;
      return true;
    })
    .filter((i) => !f.severity || f.severity === "all" || i.severity === f.severity)
    .filter((i) => !f.kind || f.kind === "all" || i.kind === f.kind)
    .filter((i) => !f.locationId || f.locationId === "all" || i.locationId === f.locationId)
    .sort(
      (a, b) =>
        Number(a.status === "Resolved") - Number(b.status === "Resolved") ||
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
        a.reportedAt.localeCompare(b.reportedAt),
    );
}

export interface IncidentStats {
  total: number;
  open: number;
  overdue: number;
  criticalOpen: number;
  medianReportingLagDays: number;
  /** Filed more than a day after they happened. A culture measure. */
  lateFiled: number;
  byKind: { kind: IncidentKind; count: number; open: number }[];
  bySeverity: { severity: IncidentSeverity; count: number; open: number }[];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function incidentStats(rows: Incident[] = incidents): IncidentStats {
  const open = rows.filter((i) => i.status !== "Resolved");
  const kinds = [...new Set(rows.map((i) => i.kind))];

  return {
    total: rows.length,
    open: open.length,
    overdue: rows.filter(isOverdue).length,
    criticalOpen: open.filter((i) => i.severity === "critical" || i.severity === "high").length,
    medianReportingLagDays: median(rows.map(reportingLagDays)),
    lateFiled: rows.filter((i) => reportingLagDays(i) > 1).length,
    byKind: kinds
      .map((kind) => ({
        kind,
        count: rows.filter((i) => i.kind === kind).length,
        open: open.filter((i) => i.kind === kind).length,
      }))
      .sort((a, b) => b.count - a.count),
    bySeverity: SEVERITY_ORDER.map((severity) => ({
      severity,
      count: rows.filter((i) => i.severity === severity).length,
      open: open.filter((i) => i.severity === severity).length,
    })),
  };
}

// ---------------------------------------------------------------------------
// Mutations — every one appends a ledger row
// ---------------------------------------------------------------------------

function ledgerFor(
  inc: Incident,
  action: "create" | "update" | "sign" | "approve",
  reason: string,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
): LedgerRow {
  const client = inc.clientId ? clientMap[inc.clientId] : undefined;
  return appendLedger({
    actorId: VIEWER.id,
    actorName: VIEWER.name,
    actorRole: VIEWER.role,
    action,
    entity: "note",
    entityId: inc.id,
    ...(client ? { subjectId: client.id, subjectName: clientName(client) } : {}),
    locationId: inc.locationId,
    reason,
    ...(before ? { before } : {}),
    after,
  });
}

export class IncidentTransitionError extends Error {
  constructor(from: IncidentStatus, to: IncidentStatus) {
    super(
      `Cannot move an incident from "${from}" to "${to}". Allowed: ${ALLOWED_TRANSITIONS[from].join(", ") || "none"}.`,
    );
    this.name = "IncidentTransitionError";
  }
}

/**
 * Move an incident's status.
 *
 * Rejects illegal transitions rather than accepting them and letting the log
 * describe a sequence that never happened. A reason is required on every move
 * because "why did this get closed" is the question a log is read to answer.
 */
export function transitionIncident(
  incidentId: string,
  to: IncidentStatus,
  reason: string,
): { incident: Incident; ledger: LedgerRow } {
  const inc = incidents.find((i) => i.id === incidentId);
  if (!inc) throw new Error(`Unknown incident: ${incidentId}`);
  if (!ALLOWED_TRANSITIONS[inc.status].includes(to)) {
    throw new IncidentTransitionError(inc.status, to);
  }
  if (!reason.trim()) throw new Error("A status change requires a reason.");

  const before = { status: inc.status, resolvedAt: inc.resolvedAt ?? null };

  inc.status = to;
  if (to === "Resolved") inc.resolvedAt = NOW_ISO;
  // Reopening clears the resolution stamp but the ledger keeps the original —
  // the record shows it was closed and then reopened, not that it never closed.
  else inc.resolvedAt = undefined;

  const ledger = ledgerFor(
    inc,
    to === "Resolved" ? "approve" : "update",
    `Incident ${inc.id} → ${to}: ${reason}`,
    before,
    { status: inc.status, resolvedAt: inc.resolvedAt ?? null, severity: inc.severity, kind: inc.kind },
  );

  return { incident: inc, ledger };
}

/** Append an action. Actions are additive only — there is no edit and no delete. */
export function addAction(
  incidentId: string,
  detail: string,
): { incident: Incident; ledger: LedgerRow } {
  const inc = incidents.find((i) => i.id === incidentId);
  if (!inc) throw new Error(`Unknown incident: ${incidentId}`);
  if (!detail.trim()) throw new Error("An action requires a description of what was done.");

  const action: IncidentAction = {
    id: `${inc.id}-a${inc.actions.length + 1}`,
    at: NOW_ISO,
    byId: VIEWER.id,
    byName: VIEWER.name,
    detail: detail.trim(),
  };
  inc.actions.push(action);

  const ledger = ledgerFor(
    inc,
    "update",
    `Action recorded on ${inc.id}`,
    { actionCount: inc.actions.length - 1 },
    { actionCount: inc.actions.length, action: action.detail, by: action.byName },
  );

  return { incident: inc, ledger };
}

/**
 * Change severity.
 *
 * Separated from `transitionIncident` deliberately. A severity change is the
 * edit most likely to be made for the wrong reason — to make a report look
 * better — so it gets its own attributable ledger row with the old and new
 * value on it, rather than being folded into a general update.
 */
export function reclassifyIncident(
  incidentId: string,
  severity: IncidentSeverity,
  reason: string,
): { incident: Incident; ledger: LedgerRow } {
  const inc = incidents.find((i) => i.id === incidentId);
  if (!inc) throw new Error(`Unknown incident: ${incidentId}`);
  if (!reason.trim()) throw new Error("A severity change requires a reason.");
  if (inc.severity === severity) return { incident: inc, ledger: ledgerFor(inc, "update", "No change", undefined, { severity }) };

  const before = { severity: inc.severity };
  inc.severity = severity;

  const ledger = ledgerFor(
    inc,
    "update",
    `Severity ${before.severity} → ${severity}: ${reason}`,
    before,
    { severity, definition: SEVERITY_DEFINITION[severity] },
  );

  return { incident: inc, ledger };
}

/** File a new incident. */
export function fileIncident(input: {
  kind: IncidentKind;
  severity: IncidentSeverity;
  locationId: LocationId;
  clientId?: string;
  summary: string;
  occurredAt?: string;
}): { incident: Incident; ledger: LedgerRow } {
  if (!input.summary.trim()) throw new Error("An incident requires a summary.");

  const inc: Incident = {
    id: `inc-${String(incidents.length + 1).padStart(3, "0")}`,
    at: input.occurredAt ?? NOW_ISO,
    reportedAt: NOW_ISO,
    kind: input.kind,
    severity: input.severity,
    reportedBy: VIEWER.id,
    locationId: input.locationId,
    clientId: input.clientId,
    summary: input.summary.trim(),
    actions: [],
    status: "Open",
  };
  incidents.unshift(inc);

  const ledger = ledgerFor(inc, "create", `Incident filed: ${inc.kind}`, undefined, {
    id: inc.id,
    kind: inc.kind,
    severity: inc.severity,
    status: inc.status,
    reportingLagDays: reportingLagDays(inc),
  });

  return { incident: inc, ledger };
}

export { staffName, staffMap, clientMap };
