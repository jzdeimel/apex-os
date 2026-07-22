// =============================================================================
// Apex — core data model
// Mock-only types. No PHI. No real prescribing. Demo purposes only.
// =============================================================================

import type { CredentialClass } from "@/lib/scheduling/credentials";

export type LocationId =
  | "raleigh"
  | "raleigh-boutique"
  | "southern-pines"
  | "myrtle-beach"
  | "telehealth";

export interface Location {
  id: LocationId;
  name: string;
  short: string;
  city: string;
  state: string;
  address?: string;
  phone?: string;
  type: "clinic" | "virtual";
  timezone: string;
}

/**
 * Apex has exactly four roles: Admin, Coach, Medical, and Client.
 *
 * Client is not a StaffRole — members authenticate through a separate identity
 * class (see lib/portals.ts) and can never resolve to a staff session. The
 * specialist roles of the system Apex replaces (Order Specialist, Tracking
 * Specialist) are folded into Admin, because most of what those roles do by
 * hand today — re-keying patient data into a second application, harvesting
 * tracking numbers out of email — is work Apex removes rather than assigns.
 */
export type StaffRole = "Admin" | "Coach" | "Medical";

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  /**
   * What this person may PERFORM, as opposed to what they may WRITE.
   *
   * `role` answers the authorization question and has three values, which is
   * right for it. Scheduling asks a different question — Stephanie Butler's NCV
   * spec requires "the lowest appropriate clinical license" per component — and
   * three values cannot express it: under `role` alone a medical director and a
   * nurse are the same resource, so a lab draw consumes an MD's afternoon.
   *
   * See lib/scheduling/credentials.ts. Null means UNKNOWN, never "any": an
   * unknown credential is not schedulable for a clinical component, because
   * defaulting it up over-licenses someone into a physical exam.
   */
  credentialClass: CredentialClass | null;
  credentials?: string; // display text, e.g. "MD", "NP", "PA-C", "CPT"
  locationIds: LocationId[];
  email: string;
  canApprove: boolean; // only licensed providers may approve recommendations
  avatarInitials: string;
  bio?: string;
}

export type Goal =
  | "Fat loss"
  | "Recovery"
  | "Libido"
  | "Energy"
  | "Sleep"
  | "Cognition"
  | "Joint pain"
  | "Muscle gain"
  | "Skin/hair";

export type Symptom =
  | "Low energy"
  | "Poor sleep"
  | "Brain fog"
  | "Low libido"
  | "Joint pain"
  | "Slow recovery"
  | "Weight gain"
  | "Hair thinning"
  | "Mood changes"
  | "Reduced strength"
  | "Cold intolerance"
  | "Elevated stress";

export type ClientStatus =
  | "Lead"
  | "Consult Booked"
  | "Labs Ordered"
  | "Results Ready"
  | "Plan Review"
  | "Active Protocol"
  | "Follow-Up Due"
  | "Inactive";

export type RiskLevel = "none" | "low" | "moderate" | "high";

export interface Program {
  name: string;
  category: RecommendationCategory;
  startedOn: string; // ISO date
  status: "Active" | "Paused" | "Completed";
}

export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  sex: "male" | "female";
  age: number;
  /**
   * THE CLINIC THAT OWNS THE RELATIONSHIP — not where the last visit happened.
   *
   * Paul Kennard, 2026-07-21: a telehealth patient "does not live within a
   * distance of a clinic that allows for them to come in. They are then
   * categorised as a telehealth patient as though it is its own location, with
   * its own coach." So `telehealth` is a legitimate value here — it is a PANEL.
   *
   * What it must never absorb is a one-off virtual visit by a clinic patient:
   * "I am not a telehealth patient despite using a telehealth mode of
   * communication." That distinction now lives on `Appointment.modality`.
   *
   * This field drives coach assignment, provider coverage and — once Clover is
   * wired — which of the four merchant accounts is credited. Getting it wrong
   * misroutes money silently, because every individual charge still succeeds.
   * See lib/payments/merchants.ts, which also handles the case this field
   * cannot answer: a telehealth-panel patient has no clinic and therefore no
   * merchant account of their own.
   */
  locationId: LocationId;
  status: ClientStatus;
  coachId: string;
  providerId: string;
  goals: Goal[];
  symptoms: Symptom[];
  programs: Program[];
  joinedOn: string; // ISO
  latestLabDate?: string; // ISO
  nextAppointment?: string; // ISO datetime
  planStatus:
    | "No plan"
    | "Draft"
    | "Awaiting provider"
    | "Active"
    | "Needs review";
  riskFlags: RiskFlag[];
  email: string;
  phone: string;
  /** Apex-issued medical record number. Apex mints it; no external system owns it. */
  mrn: string;
  avatarColor: string; // tailwind-ish hex for the monogram chip
  lifetimeValue: number;
}

export interface RiskFlag {
  level: RiskLevel;
  label: string;
  detail: string;
}

// ---------------------------------------------------------------------------
// Labs
// ---------------------------------------------------------------------------

export type BiomarkerStatus = "optimal" | "low" | "high" | "watch";

export interface Biomarker {
  key: string;
  name: string;
  value: number;
  unit: string;
  refLow: number;
  refHigh: number;
  // "optimal" window can be tighter than the lab reference range
  optimalLow?: number;
  optimalHigh?: number;
  status: BiomarkerStatus;
  category:
    | "Hormones"
    | "Thyroid"
    | "Metabolic"
    | "Inflammation"
    | "Nutrients"
    | "Lipids"
    | "Organ"
    | "Blood"
    | "Prostate";
  history?: { date: string; value: number }[];
}

export interface LabResult {
  id: string;
  clientId: string;
  panelName: string; // e.g. "Alpha Base Panel"
  collectedOn: string; // ISO date
  resultedOn: string; // ISO date
  status: "Resulted" | "Pending" | "Ordered";
  biomarkers: Biomarker[];
  summary: string; // AI-assisted plain-language summary (review required)
}

// ---------------------------------------------------------------------------
// Body composition
// ---------------------------------------------------------------------------

export interface SegmentalLean {
  segment: "Left Arm" | "Right Arm" | "Trunk" | "Left Leg" | "Right Leg";
  massKg: number;
  rating: "low" | "normal" | "high";
}

export interface BodyScan {
  id: string;
  clientId: string;
  scannedOn: string; // ISO
  device: string;
  weightKg: number;
  bodyFatPct: number;
  skeletalMuscleKg: number;
  visceralFatLevel: number;
  bmr: number; // kcal
  totalBodyWaterPct: number;
  segmental: SegmentalLean[];
  history?: { date: string; weightKg: number; bodyFatPct: number; skeletalMuscleKg: number }[];
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

export type RecommendationCategory =
  | "Recovery / tissue support"
  | "Metabolic / weight management"
  | "Hormone optimization discussion"
  | "Sleep / recovery support"
  | "Libido / sexual wellness"
  | "Skin / hair / aesthetics support"
  | "Energy / mitochondrial support"
  | "Inflammation / gut support"
  | "Thyroid optimization discussion";

export type RecommendationStatus =
  | "draft"
  | "coach reviewed"
  | "provider approved"
  | "declined";

export interface CandidateProtocol {
  name: string; // e.g. "BPC-157", "Semaglutide", "Nutrition coaching"
  kind: "peptide" | "medication" | "service" | "hormone" | "supplement";
  inventoryAvailable: boolean | null; // null = not an inventory item (a service)
}

export interface ContraindicationCheck {
  label: string;
  passed: boolean; // true = clear, false = flagged
  note: string;
}

export interface Recommendation {
  id: string;
  clientId: string;
  title: string;
  category: RecommendationCategory;
  rationale: string; // WHY it was suggested
  triggeredBy: string[]; // which goals/labs/symptoms triggered it
  supporting: {
    goals: Goal[];
    symptoms: Symptom[];
    labs: { name: string; value: string; status: BiomarkerStatus }[];
  };
  candidates: CandidateProtocol[];
  contraindicationChecks: ContraindicationCheck[];
  confidence: number; // 0..1
  riskLevel: RiskLevel;
  requiresProviderApproval: true; // always true
  status: RecommendationStatus;
  suggestedNextStep: string;
  generatedOn: string; // ISO
}

export interface RecommendationRule {
  id: string;
  name: string;
  category: RecommendationCategory;
  description: string;
  enabled: boolean;
  // human-readable trigger logic for the rules editor
  triggerSummary: string;
  candidateNames: string[];
  defaultConfidence: number;
  defaultRisk: RiskLevel;
}

// ---------------------------------------------------------------------------
// Supply chain
// ---------------------------------------------------------------------------

export type InventoryStatus =
  | "in stock"
  | "low"
  | "expiring soon"
  | "out of stock";

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category:
    | "Peptide"
    | "Medication"
    | "Hormone"
    | "Lab Kit"
    | "Injection Supply"
    | "IV Supply";
  locationId: LocationId;
  quantity: number;
  unit: string; // "vials", "kits", "boxes", "units"
  lotNumber: string;
  expirationDate: string; // ISO
  vendorId: string;
  reorderPoint: number;
  unitCost: number;
  status: InventoryStatus;
}

export interface Vendor {
  id: string;
  name: string;
  type:
    | "Third-Party Peptide Vendor"
    | "Compounding Pharmacy"
    | "Lab Supplier"
    | "Medical Supply"
    | "Diagnostics";
  contact: string;
  leadTimeDays: number;
  rating: number; // 1..5
  catalog: string[]; // product names
}

export interface PurchaseOrder {
  id: string;
  vendorId: string;
  locationId: LocationId;
  createdOn: string;
  status: "Draft" | "Submitted" | "Approved" | "Received";
  lines: { name: string; quantity: number; unitCost: number }[];
}

// ---------------------------------------------------------------------------
// Automations
// ---------------------------------------------------------------------------

export interface Automation {
  id: string;
  name: string;
  description: string;
  trigger: string;
  audience: string;
  channel: "SMS" | "Email" | "In-App" | "Task";
  enabled: boolean;
  lastRun: string; // ISO
  nextRun: string; // ISO
  previewMessage: string; // generic, non-medical
  runsThisMonth: number;
}

// ---------------------------------------------------------------------------
// Tasks / Timeline / Notes
// ---------------------------------------------------------------------------

export type TaskType =
  | "Call client"
  | "Send lab reminder"
  | "Review results"
  | "Schedule follow-up"
  | "Check inventory"
  | "Provider approval needed";

export interface Task {
  id: string;
  clientId?: string;
  type: TaskType;
  title: string;
  assigneeId: string;
  dueDate: string; // ISO
  priority: "low" | "medium" | "high";
  done: boolean;
}

export type TimelineEventType =
  | "Lead created"
  | "Consult booked"
  | "Intake submitted"
  | "Labs ordered"
  | "Results received"
  | "Body scan completed"
  | "AI recommendations generated"
  | "Coach reviewed"
  | "Provider approved"
  | "Follow-up scheduled";

export interface TimelineEvent {
  id: string;
  clientId: string;
  type: TimelineEventType;
  detail: string;
  at: string; // ISO datetime
  actorId?: string;
}

export interface Note {
  id: string;
  clientId: string;
  author: "Coach" | "Provider" | "AI";
  authorId?: string;
  body: string;
  createdAt: string; // ISO
  pinned?: boolean;
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

export interface Appointment {
  id: string;
  clientId: string;
  clientName: string;
  staffId: string;
  locationId: LocationId;
  type:
    | "Initial Consult"
    | "Lab Draw"
    | "Body Scan"
    | "Plan Review"
    | "Follow-Up"
    | "IV Therapy"
    | "Telehealth";
  /**
   * HOW the visit is delivered — distinct from WHERE the patient belongs.
   *
   * Paul Kennard drew this line explicitly on 2026-07-21: a *telehealth
   * patient* lives too far from a clinic and is "categorised as a telehealth
   * patient as though it is its own location, with its own coach". A Raleigh
   * patient taking one visit by video is NOT a telehealth patient — "I am not a
   * telehealth patient despite using a telehealth mode of communication."
   *
   * Apex modelled telehealth only as a `LocationId`, which collapses the two.
   * That is not cosmetic: `Client.locationId` drives coach assignment, provider
   * coverage AND — once Clover's four per-clinic merchant accounts are wired —
   * WHICH CLINIC GETS PAID. A Raleigh member filed under "telehealth" for a
   * single video follow-up would bill the wrong merchant account.
   *
   * The staff roster confirms the same shape independently: nobody is *located*
   * at telehealth. Jerry Cattelane's title is "Telehealth Physician" and his
   * location is Myrtle Beach; Marc McCully, the telehealth coach, is Myrtle
   * Beach. Telehealth is a panel served by clinic staff, not a sixth clinic.
   *
   * So `locationId` stays the clinic responsible for the visit, and this says
   * how it happened. `type: "Telehealth"` is retained only for seeded data and
   * is deprecated — read `modality`.
   */
  modality: "in-person" | "virtual";
  start: string; // ISO datetime
  durationMin: number;
  status: "Scheduled" | "Checked In" | "Completed" | "No Show";
}

// ---------------------------------------------------------------------------
// Membership — owned by Apex
// ---------------------------------------------------------------------------
//
// Apex is the system of record. There is deliberately no `externalId`, no
// `lastSyncedAt` and no sync state on this type: nothing mirrors an outside
// system, so nothing can drift from one.

export type MembershipTier =
  | "Single Visit"
  | "Alpha Monthly"
  | "Alpha Elite"
  | "Alpha Concierge";

export type MembershipStatus = "Active" | "Paused" | "Lapsed";

export interface Membership {
  id: string;
  clientId: string;
  tier: MembershipTier;
  status: MembershipStatus;
  /** Whole dollars per month. 0 for pay-as-you-go tiers. */
  monthlyRate: number;
  startedOn: string;
  /** Absent once a membership has lapsed. */
  renewsOn?: string;
  visitsYTD: number;
  lifetimeSpend: number;
  /** Protocol credit included by the higher tiers, in cents. */
  protocolCreditCents: number;
}
