export interface StaffPatientPilotPolicyInput {
  clientSynthetic: boolean;
  staffId?: string;
  staffActive?: boolean;
}

/**
 * A staff-as-patient login is two linked identities, never an elevated patient
 * role. The linked client must be synthetic so test activity stays out of care,
 * revenue, and capacity reporting, and the staff identity must still be active.
 */
export function staffPatientPilotPolicy(input: StaffPatientPilotPolicyInput): string | null {
  if (!input.staffId) return null;
  if (!input.clientSynthetic) return "A staff-as-patient pilot must use a synthetic client record.";
  if (input.staffActive !== true) return "The linked staff identity is not active.";
  return null;
}
