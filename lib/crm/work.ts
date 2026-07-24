import { isLeadStage, type LeadStage } from "@/lib/crm/pipeline";

/** Initial operating target. Leadership can replace it with an approved policy later. */
export const DEFAULT_FIRST_RESPONSE_MINUTES = 15;

export function leadFirstResponseDueAt(
  capturedAt: string | Date,
  minutes = DEFAULT_FIRST_RESPONSE_MINUTES,
): Date {
  const at = capturedAt instanceof Date ? capturedAt : new Date(capturedAt);
  const safeMinutes = Number.isFinite(minutes) ? Math.min(Math.max(minutes, 1), 24 * 60) : DEFAULT_FIRST_RESPONSE_MINUTES;
  return new Date(at.getTime() + safeMinutes * 60_000);
}

export type LeadSlaState = "met" | "open" | "overdue";

export function leadSlaState(input: {
  dueAt: string | Date;
  firstContactedAt?: string | Date | null;
  now?: string | Date;
}): LeadSlaState {
  const due = new Date(input.dueAt).getTime();
  if (input.firstContactedAt) {
    return new Date(input.firstContactedAt).getTime() <= due ? "met" : "overdue";
  }
  return new Date(input.now ?? new Date()).getTime() <= due ? "open" : "overdue";
}

export function leadNoteAcceptable(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 2 && value.trim().length <= 2_000;
}

export function leadTaskAcceptable(input: {
  title: unknown;
  dueAt: unknown;
}): boolean {
  if (typeof input.title !== "string" || input.title.trim().length < 2 || input.title.trim().length > 200) {
    return false;
  }
  if (typeof input.dueAt !== "string") return false;
  const due = new Date(input.dueAt);
  return Number.isFinite(due.getTime());
}

export function lostReasonAcceptable(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 3 && value.trim().length <= 1_000;
}

export function nextLeadStages(stage: string): LeadStage[] {
  if (!isLeadStage(stage)) return [];
  const candidates: LeadStage[] = [
    "new",
    "contacted",
    "intake-submitted",
    "consult-booked",
    "lost",
  ];
  return candidates.filter((candidate) => {
    if (stage === "new") return ["contacted", "intake-submitted", "lost"].includes(candidate);
    if (stage === "contacted") return ["intake-submitted", "consult-booked", "lost"].includes(candidate);
    if (stage === "intake-submitted") return ["contacted", "consult-booked", "lost"].includes(candidate);
    if (stage === "consult-booked") return candidate === "lost";
    if (stage === "lost") return candidate === "new";
    return false;
  });
}
