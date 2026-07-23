export const RESOURCE_TYPES = ["room", "equipment"] as const;
export const RESOURCE_KINDS = ["exam", "consult", "draw", "infusion", "scan", "general"] as const;
export const RESOURCE_STATUSES = ["active", "out-of-service", "retired"] as const;
export const RESERVATION_STATUSES = ["reserved", "in-use", "released", "cancelled"] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export function resourceKindForVisit(visitType: string): ResourceKind | null {
  const normalized = visitType.trim().toLowerCase();
  if (normalized.includes("telehealth") || normalized.includes("virtual")) return null;
  if (normalized.includes("lab") || normalized.includes("draw")) return "draw";
  if (normalized.includes("infusion") || normalized.includes("iv therapy")) return "infusion";
  if (normalized.includes("scan")) return "scan";
  return "exam";
}

export function resourceSuitableForVisit(kind: string, visitType: string) {
  const wanted = resourceKindForVisit(visitType);
  if (wanted === null) return false;
  if (wanted === "exam") return kind === "exam" || kind === "consult" || kind === "general";
  return kind === wanted || kind === "general";
}

export function reservationTransitionAllowed(from: ReservationStatus, to: ReservationStatus) {
  if (from === to) return true;
  if (from === "reserved") return to === "in-use" || to === "released" || to === "cancelled";
  if (from === "in-use") return to === "released";
  return false;
}

export function clinicResourceRequestId(locationId: string, requestId: string) {
  return `resource-${locationId}-${requestId}`;
}

export function resourceReservationRequestId(resourceId: string, requestId: string) {
  return `reservation-${resourceId}-${requestId}`;
}
