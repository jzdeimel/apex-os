export const LEAD_STAGES = [
  "new",
  "contacted",
  "intake-submitted",
  "consult-booked",
  "converted",
  "lost",
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];

const TRANSITIONS: Record<LeadStage, LeadStage[]> = {
  new: ["contacted", "intake-submitted", "lost"],
  contacted: ["intake-submitted", "consult-booked", "lost"],
  "intake-submitted": ["contacted", "consult-booked", "lost"],
  "consult-booked": ["lost"],
  lost: ["new"],
  converted: [],
};

export function isLeadStage(value: string): value is LeadStage {
  return (LEAD_STAGES as readonly string[]).includes(value);
}

export function leadTransitionAllowed(from: string, to: string): boolean {
  return isLeadStage(from) && isLeadStage(to) && TRANSITIONS[from].includes(to);
}

/**
 * Patient creation is deliberately separate from the ordinary pipeline graph.
 *
 * A drag/drop stage change must never manufacture a chart. Conversion is
 * permitted only after intake exists (or after the subsequent consult-booked
 * stage) and must run inside the lead-to-client transaction that creates the
 * patient, carries consent forward, records the stage event, and witnesses the
 * change in the audit ledger.
 */
export function leadConversionAllowed(stage: string): boolean {
  return stage === "intake-submitted" || stage === "consult-booked";
}
