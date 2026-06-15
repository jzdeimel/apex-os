import type { Task } from "@/lib/types";

export const seedTasks: Task[] = [
  { id: "t-01", clientId: "c-002", type: "Provider approval needed", title: "Provider approval needed — Andre B. hormone discussion", assigneeId: "st-001", dueDate: "2026-06-12T17:00:00", priority: "high", done: false },
  { id: "t-02", clientId: "c-006", type: "Review results", title: "Review thyroid panel — Priya S.", assigneeId: "st-002", dueDate: "2026-06-12T15:00:00", priority: "high", done: false },
  { id: "t-03", clientId: "c-023", type: "Provider approval needed", title: "Provider approval needed — Tony C. recommendations", assigneeId: "st-001", dueDate: "2026-06-12T16:00:00", priority: "high", done: false },
  { id: "t-04", clientId: "c-013", type: "Schedule follow-up", title: "Schedule follow-up — Nathan P. (overdue)", assigneeId: "st-005", dueDate: "2026-06-11T12:00:00", priority: "high", done: false },
  { id: "t-05", clientId: "c-020", type: "Send lab reminder", title: "Send lab reminder — Chloe M.", assigneeId: "st-006", dueDate: "2026-06-13T09:00:00", priority: "medium", done: false },
  { id: "t-06", clientId: "c-009", type: "Send lab reminder", title: "Send lab reminder — Liam O.", assigneeId: "st-011", dueDate: "2026-06-13T09:00:00", priority: "low", done: false },
  { id: "t-07", type: "Check inventory", title: "Reorder VIP nasal spray — Myrtle Beach (out of stock)", assigneeId: "st-010", dueDate: "2026-06-12T13:00:00", priority: "high", done: false },
  { id: "t-08", type: "Check inventory", title: "Transfer GHK-Cu Raleigh → Myrtle Beach (low)", assigneeId: "st-010", dueDate: "2026-06-13T10:00:00", priority: "medium", done: false },
  { id: "t-09", clientId: "c-022", type: "Call client", title: "Call client — Naomi F. follow-up due", assigneeId: "st-011", dueDate: "2026-06-10T14:00:00", priority: "medium", done: false },
  { id: "t-10", clientId: "c-005", type: "Review results", title: "Review lipid trend — Derek H.", assigneeId: "st-003", dueDate: "2026-06-14T11:00:00", priority: "medium", done: false },
  { id: "t-11", clientId: "c-008", type: "Provider approval needed", title: "Provider approval needed — Tara D. metabolic plan", assigneeId: "st-004", dueDate: "2026-06-13T12:00:00", priority: "high", done: false },
  { id: "t-12", clientId: "c-001", type: "Call client", title: "Call client — Jake M. check-in", assigneeId: "st-005", dueDate: "2026-06-15T10:00:00", priority: "low", done: true },
];
