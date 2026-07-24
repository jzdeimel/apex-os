export const OPERATIONAL_CASE_KINDS = [
  "support",
  "complaint",
  "record-access",
  "record-release",
  "record-amendment",
] as const;
export type OperationalCaseKind = (typeof OPERATIONAL_CASE_KINDS)[number];

export const OPERATIONAL_CASE_PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export type OperationalCasePriority = (typeof OPERATIONAL_CASE_PRIORITIES)[number];

export const OPERATIONAL_CASE_STATUSES = [
  "new",
  "assigned",
  "in-progress",
  "waiting-on-patient",
  "fulfilled",
  "denied",
  "closed",
] as const;
export type OperationalCaseStatus = (typeof OPERATIONAL_CASE_STATUSES)[number];

const TRANSITIONS: Record<OperationalCaseStatus, OperationalCaseStatus[]> = {
  new: ["assigned", "in-progress", "waiting-on-patient", "denied"],
  assigned: ["in-progress", "waiting-on-patient", "fulfilled", "denied"],
  "in-progress": ["waiting-on-patient", "fulfilled", "denied"],
  "waiting-on-patient": ["in-progress", "fulfilled", "denied"],
  fulfilled: ["closed"],
  denied: ["closed", "in-progress"],
  closed: ["in-progress"],
};

export function isOperationalCaseKind(value: unknown): value is OperationalCaseKind {
  return typeof value === "string" && (OPERATIONAL_CASE_KINDS as readonly string[]).includes(value);
}

export function isOperationalCasePriority(value: unknown): value is OperationalCasePriority {
  return typeof value === "string" && (OPERATIONAL_CASE_PRIORITIES as readonly string[]).includes(value);
}

export function isOperationalCaseStatus(value: unknown): value is OperationalCaseStatus {
  return typeof value === "string" && (OPERATIONAL_CASE_STATUSES as readonly string[]).includes(value);
}

export function operationalCaseTransitionAllowed(from: string, to: string): boolean {
  return isOperationalCaseStatus(from) && isOperationalCaseStatus(to) && TRANSITIONS[from].includes(to);
}

function plusMinutes(at: Date, minutes: number) {
  return new Date(at.getTime() + minutes * 60_000);
}

function plusDays(at: Date, days: number) {
  return new Date(at.getTime() + days * 24 * 60 * 60_000);
}

/**
 * Case clocks are snapshotted at intake. Records deadlines match the outer
 * federal HIPAA action windows; state law and internal policy may be stricter.
 */
export function operationalCaseClocks(
  kind: OperationalCaseKind,
  priority: OperationalCasePriority,
  createdAt: string | Date,
) {
  const at = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const firstResponseMinutes: Record<OperationalCasePriority, number> = {
    urgent: 15,
    high: 60,
    normal: 4 * 60,
    low: 24 * 60,
  };
  const resolutionDays: Record<OperationalCasePriority, number> = {
    urgent: 1,
    high: 2,
    normal: 5,
    low: 10,
  };
  const recordsKind = kind.startsWith("record-");
  return {
    firstResponseDueAt: plusMinutes(at, firstResponseMinutes[priority]),
    dueAt:
      kind === "record-amendment"
        ? plusDays(at, 60)
        : recordsKind
          ? plusDays(at, 30)
          : plusDays(at, resolutionDays[priority]),
    retentionUntil: plusDays(at, 7 * 365),
  };
}

export function operationalCaseInputAcceptable(input: {
  kind: OperationalCaseKind;
  subject: unknown;
  detail: unknown;
  recordScope?: unknown;
  amendmentRecordReference?: unknown;
  amendmentRequestedText?: unknown;
}): string | null {
  if (typeof input.subject !== "string" || input.subject.trim().length < 3 || input.subject.trim().length > 200) {
    return "A subject between 3 and 200 characters is required.";
  }
  if (typeof input.detail !== "string" || input.detail.trim().length < 5 || input.detail.trim().length > 5_000) {
    return "Details between 5 and 5,000 characters are required.";
  }
  if (input.kind.startsWith("record-") && (typeof input.recordScope !== "string" || input.recordScope.trim().length < 3)) {
    return "Describe which records you are requesting.";
  }
  if (
    input.kind === "record-amendment" &&
    (typeof input.amendmentRecordReference !== "string" ||
      input.amendmentRecordReference.trim().length < 3 ||
      typeof input.amendmentRequestedText !== "string" ||
      input.amendmentRequestedText.trim().length < 3)
  ) {
    return "An amendment request needs the record reference and requested correction.";
  }
  return null;
}

export function operationalCaseClosureAcceptable(input: {
  status: OperationalCaseStatus;
  resolution?: string | null;
  denialReason?: string | null;
}): boolean {
  if (input.status === "fulfilled" || input.status === "closed") {
    return Boolean(input.resolution?.trim());
  }
  if (input.status === "denied") return Boolean(input.denialReason?.trim());
  return true;
}
