/**
 * Demo-only selectors over the synthetic escalation corpus.
 *
 * Operational queue math lives in queue.ts without importing fixture data.
 * Keeping these selectors separate prevents a shared Medical screen from
 * loading synthetic patients merely to sort real database rows.
 */
import { escalations } from "@/lib/mock/escalations";
import {
  isOverdue,
  isResolved,
  NOW,
} from "@/lib/escalations/queue";
import type { Escalation } from "@/lib/escalations/types";

export const ME_PROVIDER = "st-001";

export function queueFor(providerId: string): Escalation[] {
  return escalations.filter((row) => row.assignedToStaffId === providerId);
}

export function openEscalations(): Escalation[] {
  return escalations.filter((row) => !isResolved(row));
}

export function overdueEscalations(nowIso: string = NOW): Escalation[] {
  return escalations.filter((row) => !isResolved(row) && isOverdue(row, nowIso));
}

export function escalationsForClient(clientId: string): Escalation[] {
  return escalations.filter((row) => row.clientId === clientId);
}

export function escalationsRaisedBy(coachId: string): Escalation[] {
  return escalations.filter((row) => row.raisedByStaffId === coachId);
}
