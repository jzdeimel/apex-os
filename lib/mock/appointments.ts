import type { Appointment } from "@/lib/types";
import { clientMap, clientName } from "@/lib/mock/clients";

type Seed = Omit<Appointment, "clientName">;

const seed: Seed[] = [
  { id: "ap-01", clientId: "c-013", staffId: "st-001", locationId: "raleigh", type: "Follow-Up", start: "2026-06-12T09:30:00", durationMin: 30, status: "Completed" },
  { id: "ap-02", clientId: "c-023", staffId: "st-005", locationId: "raleigh", type: "Plan Review", start: "2026-06-12T10:30:00", durationMin: 45, status: "Checked In" },
  { id: "ap-03", clientId: "c-006", staffId: "st-002", locationId: "raleigh", type: "Lab Draw", start: "2026-06-12T11:15:00", durationMin: 20, status: "Scheduled" },
  { id: "ap-04", clientId: "c-022", staffId: "st-001", locationId: "telehealth", type: "Telehealth", start: "2026-06-12T12:00:00", durationMin: 30, status: "Scheduled" },
  { id: "ap-05", clientId: "c-002", staffId: "st-006", locationId: "raleigh", type: "Body Scan", start: "2026-06-12T13:00:00", durationMin: 20, status: "Scheduled" },
  { id: "ap-06", clientId: "c-008", staffId: "st-004", locationId: "southern-pines", type: "Plan Review", start: "2026-06-12T14:00:00", durationMin: 45, status: "Scheduled" },
  { id: "ap-07", clientId: "c-005", staffId: "st-003", locationId: "myrtle-beach", type: "Follow-Up", start: "2026-06-12T15:00:00", durationMin: 30, status: "Scheduled" },
  { id: "ap-08", clientId: "c-016", staffId: "st-002", locationId: "raleigh", type: "Initial Consult", start: "2026-06-12T16:00:00", durationMin: 45, status: "Scheduled" },
  { id: "ap-09", clientId: "c-011", staffId: "st-003", locationId: "myrtle-beach", type: "IV Therapy", start: "2026-06-12T16:30:00", durationMin: 60, status: "Scheduled" },
  // tomorrow+ (used by client profiles)
  { id: "ap-10", clientId: "c-002", staffId: "st-001", locationId: "raleigh", type: "Plan Review", start: "2026-06-13T11:30:00", durationMin: 45, status: "Scheduled" },
  { id: "ap-11", clientId: "c-010", staffId: "st-002", locationId: "raleigh", type: "Initial Consult", start: "2026-06-13T15:00:00", durationMin: 45, status: "Scheduled" },
  { id: "ap-12", clientId: "c-003", staffId: "st-004", locationId: "southern-pines", type: "Plan Review", start: "2026-06-14T09:00:00", durationMin: 45, status: "Scheduled" },
  { id: "ap-13", clientId: "c-017", staffId: "st-004", locationId: "southern-pines", type: "Initial Consult", start: "2026-06-14T11:00:00", durationMin: 45, status: "Scheduled" },
  { id: "ap-14", clientId: "c-001", staffId: "st-001", locationId: "raleigh", type: "Follow-Up", start: "2026-06-15T14:00:00", durationMin: 30, status: "Scheduled" },
  { id: "ap-15", clientId: "c-023", staffId: "st-001", locationId: "raleigh", type: "Plan Review", start: "2026-06-15T09:30:00", durationMin: 45, status: "Scheduled" },
];

export const appointments: Appointment[] = seed.map((a) => ({
  ...a,
  clientName: clientMap[a.clientId] ? clientName(clientMap[a.clientId]) : a.clientId,
}));

export const todaysAppointments = appointments
  .filter((a) => a.start.startsWith("2026-06-12"))
  .sort((a, b) => a.start.localeCompare(b.start));

export function appointmentsForClient(clientId: string) {
  return appointments
    .filter((a) => a.clientId === clientId)
    .sort((a, b) => a.start.localeCompare(b.start));
}
