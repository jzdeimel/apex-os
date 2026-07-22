import { NCV_COMPONENTS, type NcvComponentId } from "@/lib/scheduling/ncv";
import type { CredentialClass } from "@/lib/scheduling/credentials";

/**
 * ENCOUNTER LIFECYCLE — pure. No database, no clock, no actor.
 *
 * The rule this file exists to hold: **a visit completes when its segments
 * complete, never independently.** `appointment.status` could be set to
 * "Completed" by anything that felt like it; an encounter cannot, because the
 * only function that produces a completed encounter takes the segments as its
 * argument and looks at them.
 *
 * That matters beyond tidiness. "Visit complete" is a clinical and a billing
 * assertion. A visit marked complete with an unsigned physical says a provider
 * saw the patient when no provider has signed anything.
 */

export type EncounterKind = "new-client-visit" | "follow-up" | "lab-only" | "walk-in";

export type SegmentStatus = "pending" | "in-progress" | "complete" | "not-required";

export interface SegmentPlan {
  component: NcvComponentId;
  sequence: number;
  requiredCredentials: readonly (readonly CredentialClass[])[];
  /** False when the visit type does not include this part at all. */
  required: boolean;
}

/**
 * Which segments a visit kind is made of.
 *
 * A New Client Visit is Stephanie Butler's three. Everything else is a subset,
 * and the subsets are explicit rather than derived — a follow-up that
 * accidentally inherited a coach-intro requirement would block every follow-up
 * in the building on a coach's availability.
 */
export function segmentPlanFor(kind: EncounterKind): SegmentPlan[] {
  const all = [...NCV_COMPONENTS].sort((a, b) => a.sequence - b.sequence);

  switch (kind) {
    case "new-client-visit":
      return all.map((c) => ({
        component: c.id,
        sequence: c.sequence,
        requiredCredentials: c.tiers,
        required: true,
      }));

    case "lab-only":
      return all
        .filter((c) => c.id === "lab-draw")
        .map((c) => ({
          component: c.id,
          sequence: 1,
          requiredCredentials: c.tiers,
          required: true,
        }));

    case "follow-up":
      return all
        .filter((c) => c.id === "physical")
        .map((c) => ({
          component: c.id,
          sequence: 1,
          requiredCredentials: c.tiers,
          required: true,
        }));

    case "walk-in":
      // Deliberately empty. A walk-in is whatever it turns out to be, and
      // pre-declaring segments it may not need would produce an encounter that
      // can never complete. Segments are added as they happen.
      return [];
  }
}

export interface SegmentState {
  component: NcvComponentId;
  status: SegmentStatus;
  required: boolean;
}

export interface CompletionVerdict {
  complete: boolean;
  /** Segments still owed, in sequence order. Empty when complete. */
  outstanding: NcvComponentId[];
  /** Plain-language state for the board. */
  summary: string;
}

/**
 * Can this encounter be closed?
 *
 * `not-required` counts as settled — a segment waived with a stated reason is
 * a decision, not an omission. `waivedReason` on the row is what makes the two
 * distinguishable, and the repository refuses a waiver without one.
 */
export function completionVerdict(segments: readonly SegmentState[]): CompletionVerdict {
  const outstanding = segments
    .filter((s) => s.required && s.status !== "complete" && s.status !== "not-required")
    .map((s) => s.component);

  if (segments.length === 0) {
    return {
      complete: false,
      outstanding: [],
      summary: "Nothing has happened in this visit yet.",
    };
  }

  if (outstanding.length === 0) {
    return { complete: true, outstanding: [], summary: "All parts done." };
  }

  const label: Record<NcvComponentId, string> = {
    "coach-intro": "coach introduction",
    "lab-draw": "lab draw",
    physical: "provider physical",
  };

  return {
    complete: false,
    outstanding,
    summary: `Waiting on: ${outstanding.map((c) => label[c]).join(", ")}.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Vitals                                                                      */
/* -------------------------------------------------------------------------- */

export interface VitalsInput {
  systolic?: number;
  diastolic?: number;
  heartRate?: number;
  respiratoryRate?: number;
  spo2?: number;
  temperatureC?: number;
  weightKg?: number;
  heightCm?: number;
}

export interface VitalsProblem {
  field: keyof VitalsInput;
  severity: "error" | "warning";
  message: string;
}

/**
 * Range-check vitals before they become a clinical record.
 *
 * TWO SEVERITIES, AND THE DISTINCTION IS THE WHOLE POINT.
 *
 *   · `error`   — physiologically impossible or definitionally wrong. A typo.
 *                 Refused, because storing it corrupts every trend that reads
 *                 the series afterwards.
 *   · `warning` — possible but alarming. NOT refused. A systolic of 210 is a
 *                 real reading on a real patient and a system that rejects it
 *                 teaches the nurse to round it down to something the form
 *                 accepts, which is the worst outcome available.
 *
 * That second case is why this is not a schema constraint. A CHECK constraint
 * can only refuse, and refusing a true reading is a clinical safety problem
 * dressed as data hygiene.
 */
export function validateVitals(v: VitalsInput): VitalsProblem[] {
  const problems: VitalsProblem[] = [];

  const range = (
    field: keyof VitalsInput,
    value: number | undefined,
    hard: [number, number],
    soft: [number, number],
    unit: string,
  ) => {
    if (value === undefined) return;
    if (!Number.isFinite(value)) {
      problems.push({ field, severity: "error", message: `${field} is not a number.` });
      return;
    }
    if (value < hard[0] || value > hard[1]) {
      problems.push({
        field,
        severity: "error",
        message: `${value}${unit} is outside anything physiologically possible. Check the entry.`,
      });
      return;
    }
    if (value < soft[0] || value > soft[1]) {
      problems.push({
        field,
        severity: "warning",
        message: `${value}${unit} is outside the usual range. Recorded as entered — flag it if it is real.`,
      });
    }
  };

  range("systolic", v.systolic, [40, 300], [90, 180], " mmHg");
  range("diastolic", v.diastolic, [20, 200], [50, 110], " mmHg");
  range("heartRate", v.heartRate, [20, 250], [45, 120], " bpm");
  range("respiratoryRate", v.respiratoryRate, [4, 60], [10, 24], " /min");
  range("spo2", v.spo2, [50, 100], [92, 100], "%");
  range("temperatureC", v.temperatureC, [25, 45], [35.5, 38.0], "°C");
  range("weightKg", v.weightKg, [20, 400], [40, 250], " kg");
  range("heightCm", v.heightCm, [90, 260], [140, 210], " cm");

  /**
   * Systolic must exceed diastolic. This catches the transposition — 80/120
   * typed into the wrong boxes — which passes every individual range check and
   * is the single most common vitals entry error there is.
   */
  if (v.systolic !== undefined && v.diastolic !== undefined && v.systolic <= v.diastolic) {
    problems.push({
      field: "systolic",
      severity: "error",
      message: `Systolic (${v.systolic}) must be higher than diastolic (${v.diastolic}). These look transposed.`,
    });
  }

  return problems;
}

/** True when nothing blocks storage. Warnings do not block. */
export function vitalsAcceptable(problems: readonly VitalsProblem[]): boolean {
  return !problems.some((p) => p.severity === "error");
}

/**
 * Did this person hold a credential the segment required?
 *
 * Checked at COMPLETION, not only at assignment. A segment assigned to a nurse
 * and completed by whoever happened to be logged in at the workstation is the
 * failure this prevents, and shared workstations are how a busy clinic runs.
 */
export function credentialSatisfies(
  held: CredentialClass | null,
  required: readonly (readonly CredentialClass[])[] | null | undefined,
): boolean {
  if (!required || required.length === 0) return true;
  if (!held) return false;
  return required.some((tier) => tier.includes(held));
}
