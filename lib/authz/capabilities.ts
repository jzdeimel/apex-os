import type { StaffRole } from "@/lib/types";
import type { AccessProfile } from "@/lib/authz/profiles";

/**
 * Who can do what in Apex.
 *
 * ── The governing principle ───────────────────────────────────────────────
 * The split is about who may **write a clinical decision**, not about who may
 * **read the record**.
 *
 * The system Apex replaces got this backwards. It gated *reading* — a coach
 * could not see the plan of care, the H&P, or the intake form, even though the
 * plan's own schema comment calls it "the source of truth the coach's plan
 * builds from." That restriction made coaches less effective without making
 * anything safer: the coach still had to coach off that plan, they just had to
 * phone a colleague to find out what was in it.
 *
 * Apex inverts it. Everyone on a member's care team reads everything about
 * that member. What narrows is *authorship*: only a licensed provider can set
 * a dose, sign a clinical record, or order labs.
 *
 * Read access is not unlimited — it is scoped by assignment and location, and
 * every read is a ledger event the member can see in their own portal. That is
 * a far stronger control than hiding a tab, because it is auditable and the
 * subject can inspect it.
 *
 * ── The line that matters ─────────────────────────────────────────────────
 * THE DOSE IS THE LINE. Testosterone is a Schedule III controlled substance
 * and most peptides are prescriber-directed. A coach may build the entire plan
 * — nutrition, training, cadence, timing, monitoring — and may never set an
 * amount. That is enforced structurally: `PlanItem` in lib/planOfCare/types.ts
 * has no dose field at all, so there is nothing for a permission check to
 * forget to guard.
 */

export type Capability =
  // ── Reading ────────────────────────────────────────────────────────────
  | "read:chart"            // demographics, membership, timeline
  | "read:clinical"         // labs, plan of care, prescriptions, consults
  | "read:financial"        // purchases, invoices, LTV
  | "read:ledger"           // the audit ledger
  | "read:all-clients"      // beyond one's own assigned book
  | "read:location-clients" // operational minimum within assigned locations
  | "read:directory"        // minimum patient identity needed for operations
  | "read:all-schedules"    // clinic-wide schedule, not only the actor's own
  | "read:orders"
  | "read:inventory"
  | "read:crm"
  | "read:messages"
  /**
   * Acquisition and channel performance across the business. OWNER ONLY, and
   * deliberately NOT read:financial — a coach holds that so they can discuss a
   * member's own plan costs, which is a different question from how the funnel
   * is performing. Keeping them separate is what makes "money only on the owner
   * console" a capability rule instead of a page-routing convention.
   */
  | "read:business-metrics"

  // ── Coaching authorship ────────────────────────────────────────────────
  | "write:consult"         // record and sign a coaching consult
  | "write:nutrition"       // macro targets, meal guidance
  | "write:training"        // training split, progression
  | "write:adherence"       // check-ins, habit targets, streaks
  | "write:contact"         // log a touch, message the member
  | "write:demographics"    // fix a phone number, address, email
  | "write:task"
  | "write:clinical-history"
  | "report:adverse-event"
  | "review:adverse-event"
  | "read:schedule"
  | "write:schedule"

  // ── Commerce ───────────────────────────────────────────────────────────
  | "write:order"           // place or reorder
  | "write:membership"      // change plan, pause, resume
  | "write:refund"
  | "write:inventory"
  | "write:fulfillment"
  | "write:crm"
  | "write:communications"
  | "write:quality"
  | "override:schedule"

  // ── Licensed authorship — provider only ────────────────────────────────
  | "write:prescription"    // THE DOSE. Never delegable.
  | "sign:plan-of-care"     // approve the clinical section
  | "sign:encounter"        // sign a clinical note; makes it immutable
  | "order:labs"
  | "collect:labs"          // document specimen identity and collection
  | "record:lab-results"    // transcribe/import results; cannot release them
  | "sign:labs"             // review and sign off results
  | "override:contraindication"

  // ── Escalation ─────────────────────────────────────────────────────────
  | "escalate:provider"     // coach → provider queue
  | "triage:escalation"     // work that queue

  // ── Administration ─────────────────────────────────────────────────────
  | "admin:roles"
  | "admin:rule-sets"       // publish a clinical rule-set version
  | "admin:locations"
  | "admin:calendars"
  | "admin:export"          // export the ledger / a member's record
  | "admin:break-glass";    // emergency read outside assignment

/**
 * Capability grants by role.
 *
 * Deliberately explicit rather than hierarchical: there is no "admin gets
 * everything" shortcut. In the audited system an admin was a blanket superuser
 * that satisfied every gate, which meant the owner account could quietly write
 * a prescription. Here, `write:prescription` is granted to exactly one role,
 * and no amount of seniority substitutes for a license.
 */
const GRANTS: Record<AccessProfile, Capability[]> = {
  provider: [
    "read:chart", "read:clinical", "read:financial", "read:ledger", "read:messages",
    "write:consult", "write:nutrition", "write:training", "write:adherence",
    "write:contact", "write:demographics", "write:task", "write:order",
    "read:schedule", "write:schedule",
    "write:clinical-history",
    "report:adverse-event", "review:adverse-event",
    // The licensed set — this row is the entire reason the role exists.
    "write:prescription", "sign:plan-of-care", "sign:encounter",
    "order:labs", "collect:labs", "record:lab-results", "sign:labs", "override:contraindication",
    "triage:escalation",
  ],
  nursing: [
    "read:chart", "read:clinical", "read:ledger", "read:schedule", "read:messages", "read:location-clients",
    "write:consult", "write:clinical-history", "write:contact", "write:task",
    "report:adverse-event",
    "collect:labs", "record:lab-results",
  ],
  coach: [
    // Full read on their own book. This is the deliberate inversion.
    "read:chart", "read:clinical", "read:financial", "read:messages",
    // Coaching is authorship, not data entry — nutrition and training are the
    // coach's actual expertise and they own them outright.
    "write:consult", "write:nutrition", "write:training", "write:adherence",
    "write:contact", "write:demographics", "write:task", "write:order",
    "report:adverse-event",
    "read:schedule", "write:schedule",
    "escalate:provider",
  ],
  "front-desk": [
    "read:directory", "read:location-clients", "read:schedule", "read:all-schedules",
    "write:contact", "write:demographics", "write:task", "write:schedule",
  ],
  billing: [
    "read:directory", "read:financial", "read:all-clients",
    "write:membership", "write:refund",
  ],
  fulfillment: [
    "read:directory", "read:location-clients", "read:orders", "read:inventory",
    "write:inventory", "write:fulfillment",
  ],
  marketing: [
    "read:crm", "read:business-metrics", "write:crm", "write:communications",
  ],
  operations: [
    "read:directory", "read:location-clients", "read:financial", "read:ledger", "read:all-clients",
    "read:schedule", "read:all-schedules", "read:orders", "read:inventory", "read:crm", "read:messages",
    "write:contact", "write:demographics", "write:task",
    "write:schedule", "override:schedule", "write:order", "write:membership",
    "write:inventory", "write:fulfillment", "write:crm", "write:quality",
    "read:business-metrics",
    "admin:locations", "admin:calendars", "admin:export", "admin:break-glass",
  ],
  executive: [
    "read:financial", "read:ledger", "read:business-metrics", "admin:export",
  ],
  "system-admin": [
    "read:ledger", "admin:roles", "admin:locations", "admin:calendars", "admin:export",
  ],
  owner: [
    "read:directory", "read:financial", "read:ledger", "read:all-clients",
    "read:schedule", "read:all-schedules", "read:orders", "read:inventory", "read:crm", "read:messages",
    "read:business-metrics", "write:schedule", "override:schedule", "write:membership",
    "write:refund", "write:inventory", "write:fulfillment", "write:crm",
    "write:communications", "write:quality", "admin:roles", "admin:locations",
    "admin:calendars", "admin:export", "admin:break-glass",
  ],
  unassigned: [],
};

/** Roles that may hold a clinical license. Used for credential gating. */
export const LICENSED_ROLES: StaffRole[] = ["Medical"];

export interface Actor {
  id: string;
  role: StaffRole;
  /** Server-resolved job profile. `unassigned` has no capabilities. */
  accessProfile: AccessProfile;
  /** Location ids this actor covers. Empty = no scope; fails closed. */
  locationIds: string[];
  /** True while an approved break-glass window is open. */
  breakGlass?: boolean;
}

export interface Decision {
  allowed: boolean;
  /** Plain-language reason, shown in the UI and written to the ledger. */
  reason: string;
  /** Set when a denial could be resolved by asking someone specific. */
  resolveVia?: string;
}

/**
 * Can this actor perform this capability, optionally on this subject?
 *
 * Every call is a ledger event — **including denials**. In the audited system a
 * blocked cross-scope access threw before anything was written, so the single
 * most security-relevant event in the product left no trace at all.
 */
export function can(
  actor: Actor,
  capability: Capability,
  subject?: { coachId?: string; providerId?: string; locationId?: string },
): Decision {
  const grants = GRANTS[actor.accessProfile] ?? [];

  if (!grants.includes(capability)) {
    return {
      allowed: false,
      reason: `${actor.accessProfile} cannot ${capability.replace(":", " ")}.`,
      resolveVia: resolveHint(capability),
    };
  }

  // Capability held. Now check that this actor is on this member's care team.
  if (subject) {
    /**
     * A subject with NO care team cannot be care-team-checked.
     *
     * This is the walk-in case: someone standing at the desk who is not in the
     * system yet has, by definition, no coach and no provider. Comparing
     * `undefined === actor.id` is always false, so without this the receptionist
     * capturing them was told "Not on this member's care team" about a person
     * who is not a member and has no team — and creating a new patient was
     * impossible for everyone except holders of read:all-clients.
     *
     * Location scope still applies below, which is the check that actually
     * means something here: you may only create a person at a site you cover.
     * Subjects that DO carry a care team are unaffected.
     */
    const hasCareTeam = subject.coachId !== undefined || subject.providerId !== undefined;
    const onCareTeam =
      subject.coachId === actor.id || subject.providerId === actor.id;
    const inLocation =
      !subject.locationId || actor.locationIds.includes(subject.locationId);

    const locationOperational =
      grants.includes("read:location-clients") &&
      inLocation &&
      [
        "read:directory",
        "read:clinical",
        "read:schedule",
        "write:schedule",
        "write:contact",
        "write:demographics",
        "write:task",
        "write:consult",
        "write:clinical-history",
        "read:orders",
        "read:inventory",
        "write:inventory",
        "write:fulfillment",
        "collect:labs",
        "record:lab-results",
        "report:adverse-event",
      ].includes(capability);

    if (hasCareTeam && !onCareTeam && !grants.includes("read:all-clients") && !locationOperational) {
      if (actor.breakGlass) {
        return {
          allowed: true,
          reason: "Break-glass access — logged and reported to the compliance officer.",
        };
      }
      // Fail closed, and say so honestly rather than pretending the record
      // does not exist.
      return {
        allowed: false,
        reason: "Not on this member's care team.",
        resolveVia: "Use break-glass if this is urgent, or ask their coach.",
      };
    }

    if (!inLocation && !grants.includes("read:all-clients")) {
      return {
        allowed: false,
        reason: "This member belongs to a location you do not cover.",
        resolveVia: "Ask an operations lead to extend your location coverage.",
      };
    }
  }

  return { allowed: true, reason: "Granted." };
}

function resolveHint(capability: Capability): string | undefined {
  if (capability === "write:prescription")
    return "Dosing is set by a licensed provider. Escalate this to the member's provider.";
  if (capability.startsWith("sign:") || capability.startsWith("order:"))
    return "Requires a licensed provider. Escalate from the consult.";
  if (capability.startsWith("admin:"))
    return "Requires an operations lead.";
  if (capability === "write:refund") return "Requires an operations lead.";
  return undefined;
}

export function capabilitiesFor(profile: AccessProfile): Capability[] {
  return GRANTS[profile] ?? [];
}

export function hasCapability(profile: AccessProfile, capability: Capability): boolean {
  return (GRANTS[profile] ?? []).includes(capability);
}

/**
 * The comparison table rendered in Settings.
 *
 * Shipping this as a visible product surface is intentional: staff should be
 * able to see exactly where the line is without reading source, and a member
 * asking "who can change my protocol?" deserves a straight answer.
 */
export const CAPABILITY_GROUPS: {
  group: string;
  note: string;
  capabilities: { id: Capability; label: string }[];
}[] = [
  {
    group: "Reading the record",
    note: "Coaches and providers see the same record. Access is scoped to the member's care team and every read is logged to the member's own access log.",
    capabilities: [
      { id: "read:chart", label: "Chart, membership, timeline" },
      { id: "read:clinical", label: "Labs, plan of care, prescriptions" },
      { id: "read:financial", label: "Purchases and lifetime value" },
      { id: "read:ledger", label: "The audit ledger" },
    ],
  },
  {
    group: "Coaching",
    note: "Nutrition and training are the coach's craft. They own them outright — no provider countersignature needed.",
    capabilities: [
      { id: "write:consult", label: "Record and sign a coaching consult" },
      { id: "write:nutrition", label: "Set macro targets and meal guidance" },
      { id: "write:training", label: "Set the training split" },
      { id: "write:adherence", label: "Check-ins, habits, streaks" },
      { id: "write:contact", label: "Message the member, log a touch" },
      { id: "write:demographics", label: "Correct phone, email, address" },
    ],
  },
  {
    group: "Clinical — licensed only",
    note: "The dose is the line. A coach may build every other part of the plan and may never set an amount.",
    capabilities: [
      { id: "write:prescription", label: "Set dose, frequency and route" },
      { id: "sign:plan-of-care", label: "Approve the clinical plan" },
      { id: "sign:encounter", label: "Sign a clinical note (makes it immutable)" },
      { id: "order:labs", label: "Order a lab panel" },
      { id: "collect:labs", label: "Collect and identify specimens" },
      { id: "record:lab-results", label: "Import results for provider review" },
      { id: "sign:labs", label: "Review and sign off results" },
      { id: "override:contraindication", label: "Override a contraindication flag" },
    ],
  },
  {
    group: "Commerce",
    note: "Coaches can place and reorder. Plan changes and refunds sit with the front desk and operations.",
    capabilities: [
      { id: "write:order", label: "Place or reorder" },
      { id: "write:membership", label: "Change, pause or resume a plan" },
      { id: "write:refund", label: "Issue a refund" },
    ],
  },
  {
    group: "Administration",
    note: "Deliberately narrow. There is no blanket superuser — seniority never substitutes for a license.",
    capabilities: [
      { id: "admin:roles", label: "Assign roles" },
      { id: "admin:rule-sets", label: "Publish a clinical rule-set version" },
      { id: "admin:export", label: "Export a record or the ledger" },
      { id: "admin:break-glass", label: "Emergency access outside assignment" },
    ],
  },
];
