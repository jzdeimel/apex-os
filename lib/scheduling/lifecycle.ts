export type AppointmentState = "Scheduled" | "Arrived" | "Roomed" | "Completed" | "No Show" | "Cancelled";

const TRANSITIONS: Record<AppointmentState, AppointmentState[]> = {
  Scheduled: ["Arrived", "No Show", "Cancelled"],
  Arrived: ["Roomed", "Completed", "Cancelled", "Scheduled"],
  Roomed: ["Completed", "Arrived", "Cancelled"],
  Completed: ["Roomed", "Arrived"],
  "No Show": ["Scheduled", "Arrived"],
  Cancelled: ["Scheduled", "Arrived"],
};

export function normalizedAppointmentState(value: string): AppointmentState | null {
  if (value === "Checked In") return "Arrived";
  return Object.hasOwn(TRANSITIONS, value) ? value as AppointmentState : null;
}

export function appointmentTransitionAllowed(from: string, to: AppointmentState) {
  const current = normalizedAppointmentState(from);
  return current ? TRANSITIONS[current].includes(to) : false;
}

export function appointmentRequestId(clientId: string, requestId: string) {
  const digest = createHash("sha256").update(`apex-appointment-v1\0${clientId}\0${requestId}`).digest("hex");
  return `appt-${digest.slice(0, 40)}`;
}
import { createHash } from "node:crypto";

