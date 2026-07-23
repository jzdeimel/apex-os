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
