/**
 * Community moderation policy.
 *
 * The community feed is deliberately not a clinical chart, but a report can
 * still contain a disclosure, a threat, or unsafe medical advice. Those reports
 * therefore need the same properties as other operational work in Apex:
 * a named owner, a due time, immutable evidence, and an explicit resolution.
 *
 * The defaults are conservative and may be tightened per group. Attachment
 * uploads remain disabled until a private object store and malware scanner are
 * configured. The UI is allowed to show the policy; it is never allowed to
 * pretend an unscanned file is available.
 */

export const COMMUNITY_REPORT_REASONS = [
  "privacy",
  "unsafe-medical-advice",
  "self-harm-or-threat",
  "harassment",
  "impersonation",
  "spam",
  "other",
] as const;

export type CommunityReportReason = (typeof COMMUNITY_REPORT_REASONS)[number];
export type CommunityModerationSeverity = "critical" | "high" | "medium" | "low";
export type CommunityModerationStatus = "open" | "in-review" | "resolved" | "dismissed";
export type CommunityModerationAction =
  | "none"
  | "hide-post"
  | "remove-post"
  | "warn-member"
  | "suspend-member"
  | "route-to-care-team";

export const COMMUNITY_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
] as const;

export const DEFAULT_COMMUNITY_POLICY = {
  responseMinutes: {
    critical: 15,
    high: 60,
    medium: 240,
    low: 1_440,
  } satisfies Record<CommunityModerationSeverity, number>,
  resolutionMinutes: {
    critical: 60,
    high: 240,
    medium: 1_440,
    low: 2_880,
  } satisfies Record<CommunityModerationSeverity, number>,
  contentRetentionDays: 365,
  moderationEvidenceRetentionDays: 2_555,
  attachmentRetentionDays: 365,
  maxAttachmentBytes: 10 * 1024 * 1024,
  allowedAttachmentMimeTypes: COMMUNITY_ATTACHMENT_MIME_TYPES,
  attachmentUploadsEnabled: false,
} as const;

const SEVERITY_BY_REASON: Record<CommunityReportReason, CommunityModerationSeverity> = {
  privacy: "high",
  "unsafe-medical-advice": "high",
  "self-harm-or-threat": "critical",
  harassment: "medium",
  impersonation: "medium",
  spam: "low",
  other: "medium",
};

export function isCommunityReportReason(value: unknown): value is CommunityReportReason {
  return typeof value === "string" &&
    COMMUNITY_REPORT_REASONS.includes(value as CommunityReportReason);
}

export function severityForCommunityReport(reason: CommunityReportReason): CommunityModerationSeverity {
  return SEVERITY_BY_REASON[reason];
}

function plusMinutes(at: string | Date, minutes: number): Date {
  const value = typeof at === "string" ? new Date(at) : new Date(at);
  if (!Number.isFinite(value.getTime())) throw new Error("Moderation time is invalid.");
  return new Date(value.getTime() + minutes * 60_000);
}

export function moderationDueTimes(
  reason: CommunityReportReason,
  at: string | Date,
  policy: {
    responseMinutes?: Partial<Record<CommunityModerationSeverity, number>>;
    resolutionMinutes?: Partial<Record<CommunityModerationSeverity, number>>;
  } = {},
) {
  const severity = severityForCommunityReport(reason);
  const responseMinutes =
    policy.responseMinutes?.[severity] ?? DEFAULT_COMMUNITY_POLICY.responseMinutes[severity];
  const resolutionMinutes =
    policy.resolutionMinutes?.[severity] ?? DEFAULT_COMMUNITY_POLICY.resolutionMinutes[severity];
  if (!Number.isInteger(responseMinutes) || responseMinutes < 5 || responseMinutes > 10_080) {
    throw new Error("Community response SLA must be between 5 minutes and 7 days.");
  }
  if (
    !Number.isInteger(resolutionMinutes) ||
    resolutionMinutes < responseMinutes ||
    resolutionMinutes > 43_200
  ) {
    throw new Error("Community resolution SLA must follow response and be within 30 days.");
  }
  return {
    severity,
    responseMinutes,
    resolutionMinutes,
    firstResponseDueAt: plusMinutes(at, responseMinutes),
    resolutionDueAt: plusMinutes(at, resolutionMinutes),
  };
}

export function retentionUntil(at: string | Date, days: number): Date {
  if (!Number.isInteger(days) || days < 30 || days > 3_650) {
    throw new Error("Community retention must be between 30 days and 10 years.");
  }
  return plusMinutes(at, days * 24 * 60);
}

export function moderationTransitionAllowed(
  from: CommunityModerationStatus,
  to: CommunityModerationStatus,
): boolean {
  if (from === to) return true;
  if (from === "open") return to === "in-review" || to === "resolved" || to === "dismissed";
  if (from === "in-review") return to === "resolved" || to === "dismissed";
  return false;
}

export function resolutionAcceptable(input: {
  status: CommunityModerationStatus;
  action?: CommunityModerationAction;
  resolution?: string;
}): boolean {
  if (input.status === "open" || input.status === "in-review") return true;
  return Boolean(input.action && input.resolution?.trim().length && input.resolution.trim().length <= 5_000);
}

export function communityAttachmentPolicy(input: {
  mimeType: string;
  byteSize: number;
  scanStatus: "pending" | "clean" | "quarantined" | "failed";
  uploadsEnabled?: boolean;
  maxBytes?: number;
  allowedMimeTypes?: readonly string[];
}) {
  const uploadsEnabled = input.uploadsEnabled ?? DEFAULT_COMMUNITY_POLICY.attachmentUploadsEnabled;
  const maxBytes = input.maxBytes ?? DEFAULT_COMMUNITY_POLICY.maxAttachmentBytes;
  const allowedMimeTypes = input.allowedMimeTypes ?? DEFAULT_COMMUNITY_POLICY.allowedAttachmentMimeTypes;
  if (!uploadsEnabled) {
    return {
      accepted: false,
      publishable: false,
      reason: "Attachments are disabled until private storage and malware scanning are configured.",
    };
  }
  if (!allowedMimeTypes.includes(input.mimeType)) {
    return {
      accepted: false,
      publishable: false,
      reason: "Only JPEG, PNG, and PDF attachments are allowed.",
    };
  }
  if (!Number.isInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > maxBytes) {
    return {
      accepted: false,
      publishable: false,
      reason: `Attachments must be between 1 byte and ${Math.floor(maxBytes / 1024 / 1024)} MB.`,
    };
  }
  if (input.scanStatus !== "clean") {
    return {
      accepted: true,
      publishable: false,
      reason:
        input.scanStatus === "quarantined"
          ? "The attachment was quarantined."
          : "The attachment remains private until malware scanning succeeds.",
    };
  }
  return { accepted: true, publishable: true, reason: "Attachment passed policy and malware scanning." };
}

export function communityQueueState(input: {
  status: CommunityModerationStatus;
  firstResponseDueAt: string | Date;
  resolutionDueAt: string | Date;
  firstRespondedAt?: string | Date | null;
  now: string | Date;
}) {
  const now = new Date(input.now).getTime();
  const firstResponseDueAt = new Date(input.firstResponseDueAt).getTime();
  const resolutionDueAt = new Date(input.resolutionDueAt).getTime();
  if (![now, firstResponseDueAt, resolutionDueAt].every(Number.isFinite)) {
    throw new Error("Community queue time is invalid.");
  }
  if (input.status === "resolved" || input.status === "dismissed") return "closed" as const;
  if (!input.firstRespondedAt && now > firstResponseDueAt) return "response-overdue" as const;
  if (now > resolutionDueAt) return "resolution-overdue" as const;
  return "on-track" as const;
}
