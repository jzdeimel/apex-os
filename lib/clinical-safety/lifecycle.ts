import { sha256 } from "@/lib/trace/hash";

export const ADVERSE_EVENT_SEVERITIES = ["mild", "moderate", "severe", "life-threatening"] as const;
export const ADVERSE_EVENT_REPORTERS = ["member", "coach", "clinician"] as const;

export type AdverseEventSeverity = (typeof ADVERSE_EVENT_SEVERITIES)[number];

export function adverseEventRequestId(clientId: string, requestId: string) {
  return `ae-${sha256(`adverse-event:${clientId}:${requestId}`).slice(0, 32)}`;
}

export function consultAddendumRequestId(consultId: string, requestId: string) {
  return `add-${sha256(`consult-addendum:${consultId}:${requestId}`).slice(0, 32)}`;
}

export function adverseEventRequiresUrgentReview(severity: AdverseEventSeverity) {
  return severity === "severe" || severity === "life-threatening";
}

export function adverseEventReviewAcceptable(input: {
  severity: AdverseEventSeverity;
  outcome?: string;
  actionTaken?: string;
}) {
  if (!input.outcome?.trim() || !input.actionTaken?.trim()) return false;
  if (adverseEventRequiresUrgentReview(input.severity) && input.actionTaken.trim().length < 10) return false;
  return true;
}
