import { createHash } from "node:crypto";

export type LabOrderState = "ordered" | "collected" | "in-transit" | "partial" | "resulted" | "reviewed" | "cancelled";
export type LabResultStatus = "preliminary" | "final" | "corrected";
export type LabObservationFlag = "normal" | "abnormal-low" | "abnormal-high" | "critical-low" | "critical-high" | "unknown";

const ORDER_TRANSITIONS: Record<LabOrderState, LabOrderState[]> = {
  ordered: ["collected", "cancelled"],
  collected: ["in-transit", "partial", "resulted", "cancelled"],
  "in-transit": ["partial", "resulted"],
  partial: ["resulted"],
  resulted: ["reviewed"],
  reviewed: ["resulted"], // a corrected vendor result reopens provider review
  cancelled: [],
};

export function labOrderTransitionAllowed(from: string, to: LabOrderState) {
  return Object.hasOwn(ORDER_TRANSITIONS, from) && ORDER_TRANSITIONS[from as LabOrderState].includes(to);
}

export function isObservationFlag(value: unknown): value is LabObservationFlag {
  return typeof value === "string" && [
    "normal", "abnormal-low", "abnormal-high", "critical-low", "critical-high", "unknown",
  ].includes(value);
}

export function isResultStatus(value: unknown): value is LabResultStatus {
  return value === "preliminary" || value === "final" || value === "corrected";
}

export function resultRisk(observations: Array<{ flag: LabObservationFlag; critical?: boolean }>) {
  const critical = observations.some((row) => row.critical || row.flag === "critical-low" || row.flag === "critical-high");
  const abnormal = critical || observations.some((row) => row.flag !== "normal");
  return { abnormal, critical };
}

export function patientReleaseVerdict(input: {
  isCritical: boolean;
  criticalAcknowledged: boolean;
  releaseRequested: boolean;
}) {
  if (!input.releaseRequested) return { allowed: true, status: "held" as const, reason: "Provider kept the result held." };
  if (input.isCritical && !input.criticalAcknowledged) {
    return { allowed: false, status: "held" as const, reason: "A critical result cannot be released before explicit provider acknowledgement." };
  }
  return { allowed: true, status: "released" as const, reason: "Licensed review completed." };
}

function opaqueId(namespace: string, clientId: string, requestId: string) {
  const digest = createHash("sha256").update(`${namespace}\0${clientId}\0${requestId}`).digest("hex");
  return digest.slice(0, 40);
}

export function labOrderRequestId(clientId: string, requestId: string) {
  return `lbo-${opaqueId("apex-lab-order-v1", clientId, requestId)}`;
}

export function labResultRequestId(clientId: string, requestId: string) {
  return `lbr-${opaqueId("apex-lab-result-v1", clientId, requestId)}`;
}

export function labSpecimenRequestId(orderId: string, requestId: string) {
  return `lbs-${opaqueId("apex-lab-specimen-v1", orderId, requestId)}`;
}

export function labReviewRequestId(resultId: string, requestId: string) {
  return `lbv-${opaqueId("apex-lab-review-v1", resultId, requestId)}`;
}

export function labReleaseRequestId(resultId: string, requestId: string) {
  return `lbx-${opaqueId("apex-lab-release-v1", resultId, requestId)}`;
}
