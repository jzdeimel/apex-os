import { createHash } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  or,
  sql as raw,
} from "drizzle-orm";

import { requireDb } from "@/lib/db/client";
import {
  communityAttachment,
  communityGroup,
  communityMemberBlock,
  communityMembership,
  communityModerationCase,
  communityPost,
  communityReport,
  client,
  escalation,
  staff,
} from "@/lib/db/schema";
import { appendLedgerInTx } from "@/lib/db/repo";
import { classifyPost } from "@/lib/community/guard";
import {
  DEFAULT_COMMUNITY_POLICY,
  COMMUNITY_ATTACHMENT_MIME_TYPES,
  moderationDueTimes,
  moderationTransitionAllowed,
  resolutionAcceptable,
  retentionUntil,
  severityForCommunityReport,
  type CommunityModerationAction,
  type CommunityModerationSeverity,
  type CommunityModerationStatus,
  type CommunityReportReason,
} from "@/lib/community/moderation";

type DbTx = Parameters<Parameters<ReturnType<typeof requireDb>["transaction"]>[0]>[0];

function recordId(kind: string, ...parts: string[]) {
  return `com-${kind}-${createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 24)}`;
}

function textOrNull(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function earlier(a: Date, b: Date) {
  return a.getTime() <= b.getTime() ? a : b;
}

const SEVERITY_RANK: Record<CommunityModerationSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export async function readCommunityGroups() {
  const db = requireDb();
  const groups = await db.select().from(communityGroup).orderBy(asc(communityGroup.name));
  const staffIds = [
    ...new Set(
      groups
        .flatMap((group) => [group.ownerStaffId, group.backupStaffId])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const owners = staffIds.length
    ? await db
        .select({ id: staff.id, name: staff.name, active: staff.active })
        .from(staff)
        .where(inArray(staff.id, staffIds))
    : [];
  const byId = new Map(owners.map((owner) => [owner.id, owner]));
  return groups.map((group) => ({
    ...group,
    owner: byId.get(group.ownerStaffId) ?? null,
    backup: group.backupStaffId ? byId.get(group.backupStaffId) ?? null : null,
  }));
}

export async function readCommunityModeratorCandidates() {
  const db = requireDb();
  return db
    .select({
      id: staff.id,
      name: staff.name,
      title: staff.title,
      accessProfile: staff.accessProfile,
      locationIds: staff.locationIds,
    })
    .from(staff)
    .where(
      and(
        eq(staff.active, true),
        inArray(staff.accessProfile, ["coach", "operations", "owner"]),
      ),
    )
    .orderBy(asc(staff.name));
}

export async function searchCommunityEligibleClients(
  query: string,
  limit = 20,
  assignedCoachId?: string,
) {
  const db = requireDb();
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) return [];
  const pattern = `%${normalized.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  const rows = await db
    .select({
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      preferredName: client.preferredName,
      email: client.email,
      assignedCoachId: client.assignedCoachId,
      homeLocationId: client.homeLocationId,
    })
    .from(client)
    .where(
      and(
        eq(client.status, "active"),
        assignedCoachId ? eq(client.assignedCoachId, assignedCoachId) : undefined,
        raw`(
          lower(${client.firstName} || ' ' || ${client.lastName}) LIKE ${pattern} ESCAPE '\'
          OR lower(coalesce(${client.email}, '')) LIKE ${pattern} ESCAPE '\'
        )`,
      ),
    )
    .orderBy(asc(client.lastName), asc(client.firstName))
    .limit(Math.min(Math.max(limit, 1), 50));
  const ids = rows.map((row) => row.id);
  const memberships = ids.length
    ? await db
        .select({
          clientId: communityMembership.clientId,
          groupId: communityMembership.groupId,
          status: communityMembership.status,
          handle: communityMembership.handle,
        })
        .from(communityMembership)
        .where(inArray(communityMembership.clientId, ids))
    : [];
  const byClient = new Map(memberships.map((row) => [row.clientId, row]));
  return rows.map((row) => ({ ...row, membership: byClient.get(row.id) ?? null }));
}

export async function setCommunityMembershipWithLedger(input: {
  groupId: string;
  clientId: string;
  handle: string;
  active: boolean;
  actorId: string;
  actorName: string;
  actorRole: string;
  allowAnyOwner: boolean;
  at: string;
}) {
  const db = requireDb();
  const handle = input.handle.trim();
  if (!/^[A-Za-z][A-Za-z0-9_-]{2,31}$/.test(handle)) {
    throw new Error("Community handle must be 3-32 letters, numbers, underscores, or hyphens.");
  }
  return db.transaction(async (tx) => {
    const [scope] = await tx
      .select({
        clientId: client.id,
        clientStatus: client.status,
        assignedCoachId: client.assignedCoachId,
        groupStatus: communityGroup.status,
        ownerStaffId: communityGroup.ownerStaffId,
      })
      .from(client)
      .innerJoin(communityGroup, eq(communityGroup.id, input.groupId))
      .where(eq(client.id, input.clientId))
      .limit(1);
    if (!scope || scope.clientStatus !== "active") throw new Error("Only active patients may join community.");
    if (scope.groupStatus !== "active") throw new Error("Community group is not active.");
    if (scope.assignedCoachId !== scope.ownerStaffId) {
      throw new Error("A patient may join only the group owned by their assigned coach.");
    }
    if (!input.allowAnyOwner && scope.ownerStaffId !== input.actorId) {
      throw new Error("A coach may enroll patients only in the community group they own.");
    }
    const [before] = await tx
      .select()
      .from(communityMembership)
      .where(
        and(
          eq(communityMembership.groupId, input.groupId),
          eq(communityMembership.clientId, input.clientId),
        ),
      )
      .limit(1);
    const status = input.active ? "active" : "left";
    const at = new Date(input.at);
    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: before ? "update" : "create",
        entity: "community",
        entityId: `${input.groupId}:${input.clientId}`,
        subjectId: input.clientId,
        reason: input.active ? "Enroll patient in coach-owned community" : "Remove patient from community",
        before: before ? { status: before.status, handle: before.handle } : undefined,
        after: { status, handle, groupId: input.groupId },
      },
      input.at,
    );
    const [membership] = await tx
      .insert(communityMembership)
      .values({
        groupId: input.groupId,
        clientId: input.clientId,
        handle,
        status,
        joinedAt: before?.joinedAt ?? at,
        leftAt: input.active ? null : at,
        updatedAt: at,
      })
      .onConflictDoUpdate({
        target: [communityMembership.groupId, communityMembership.clientId],
        set: {
          handle,
          status,
          leftAt: input.active ? null : at,
          updatedAt: at,
        },
      })
      .returning();
    return { membership, ledger };
  });
}

export async function upsertCommunityGroupWithLedger(input: {
  id: string;
  name: string;
  charter: string;
  locationId?: string | null;
  ownerStaffId: string;
  backupStaffId?: string | null;
  status?: "active" | "paused" | "archived";
  criticalResponseMinutes?: number;
  highResponseMinutes?: number;
  mediumResponseMinutes?: number;
  lowResponseMinutes?: number;
  contentRetentionDays?: number;
  moderationEvidenceRetentionDays?: number;
  attachmentRetentionDays?: number;
  attachmentsEnabled?: boolean;
  maxAttachmentBytes?: number;
  allowedAttachmentMimeTypes?: string[];
  actorId: string;
  actorName: string;
  actorRole: string;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    const staffIds = [input.ownerStaffId, input.backupStaffId].filter(
      (id): id is string => Boolean(id),
    );
    const activeStaff = staffIds.length
      ? await tx
          .select({ id: staff.id, active: staff.active, accessProfile: staff.accessProfile })
          .from(staff)
          .where(inArray(staff.id, staffIds))
      : [];
    const activeById = new Map(activeStaff.map((row) => [row.id, row]));
    if (!activeById.get(input.ownerStaffId)?.active) {
      throw new Error("Community owner must be an active Apex staff member.");
    }
    if (activeById.get(input.ownerStaffId)?.accessProfile !== "coach") {
      throw new Error("The primary community moderator must be the group's active coach.");
    }
    if (input.backupStaffId && !activeById.get(input.backupStaffId)?.active) {
      throw new Error("Community backup moderator must be an active Apex staff member.");
    }
    if (
      input.backupStaffId &&
      !["coach", "operations", "owner"].includes(
        activeById.get(input.backupStaffId)?.accessProfile ?? "",
      )
    ) {
      throw new Error("Community backup moderator must be a coach, operations lead, or owner.");
    }
    if (input.ownerStaffId === input.backupStaffId) {
      throw new Error("Community owner and backup moderator must be different people.");
    }

    const [before] = await tx
      .select()
      .from(communityGroup)
      .where(eq(communityGroup.id, input.id))
      .limit(1);
    const policy = {
      criticalResponseMinutes:
        input.criticalResponseMinutes ?? before?.criticalResponseMinutes ??
        DEFAULT_COMMUNITY_POLICY.responseMinutes.critical,
      highResponseMinutes:
        input.highResponseMinutes ?? before?.highResponseMinutes ??
        DEFAULT_COMMUNITY_POLICY.responseMinutes.high,
      mediumResponseMinutes:
        input.mediumResponseMinutes ?? before?.mediumResponseMinutes ??
        DEFAULT_COMMUNITY_POLICY.responseMinutes.medium,
      lowResponseMinutes:
        input.lowResponseMinutes ?? before?.lowResponseMinutes ??
        DEFAULT_COMMUNITY_POLICY.responseMinutes.low,
      contentRetentionDays:
        input.contentRetentionDays ?? before?.contentRetentionDays ??
        DEFAULT_COMMUNITY_POLICY.contentRetentionDays,
      moderationEvidenceRetentionDays:
        input.moderationEvidenceRetentionDays ?? before?.moderationEvidenceRetentionDays ??
        DEFAULT_COMMUNITY_POLICY.moderationEvidenceRetentionDays,
      attachmentRetentionDays:
        input.attachmentRetentionDays ?? before?.attachmentRetentionDays ??
        DEFAULT_COMMUNITY_POLICY.attachmentRetentionDays,
      attachmentsEnabled: input.attachmentsEnabled ?? before?.attachmentsEnabled ?? false,
      maxAttachmentBytes:
        input.maxAttachmentBytes ?? before?.maxAttachmentBytes ??
        DEFAULT_COMMUNITY_POLICY.maxAttachmentBytes,
      allowedAttachmentMimeTypes:
        input.allowedAttachmentMimeTypes ?? (
          Array.isArray(before?.allowedAttachmentMimeTypes)
            ? (before.allowedAttachmentMimeTypes as string[])
            : [...DEFAULT_COMMUNITY_POLICY.allowedAttachmentMimeTypes]
        ),
    };

    const responseValues = [
      policy.criticalResponseMinutes,
      policy.highResponseMinutes,
      policy.mediumResponseMinutes,
      policy.lowResponseMinutes,
    ];
    if (
      responseValues.some(
        (minutes) => !Number.isInteger(minutes) || minutes < 5 || minutes > 10_080,
      ) ||
      policy.criticalResponseMinutes > policy.highResponseMinutes ||
      policy.highResponseMinutes > policy.mediumResponseMinutes ||
      policy.mediumResponseMinutes > policy.lowResponseMinutes
    ) {
      throw new Error("Community response SLAs must be ordered from critical to low and remain within 5 minutes-7 days.");
    }
    retentionUntil(input.at, policy.contentRetentionDays);
    retentionUntil(input.at, policy.moderationEvidenceRetentionDays);
    retentionUntil(input.at, policy.attachmentRetentionDays);
    if (
      !Number.isInteger(policy.maxAttachmentBytes) ||
      policy.maxAttachmentBytes < 1 ||
      policy.maxAttachmentBytes > 25 * 1024 * 1024
    ) {
      throw new Error("Community attachment limit must be between 1 byte and 25 MB.");
    }
    if (
      policy.allowedAttachmentMimeTypes.length === 0 ||
      policy.allowedAttachmentMimeTypes.some(
        (mime) => !COMMUNITY_ATTACHMENT_MIME_TYPES.includes(mime as never),
      )
    ) {
      throw new Error("Community attachments may allow only JPEG, PNG, and PDF.");
    }

    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: before ? "update" : "create",
        entity: "community",
        entityId: input.id,
        reason: "Configure owned community moderation policy",
        before: before
          ? {
              ownerStaffId: before.ownerStaffId,
              backupStaffId: before.backupStaffId,
              status: before.status,
              attachmentsEnabled: before.attachmentsEnabled,
            }
          : undefined,
        after: {
          ownerStaffId: input.ownerStaffId,
          backupStaffId: input.backupStaffId ?? null,
          status: input.status ?? before?.status ?? "active",
          attachmentsEnabled: policy.attachmentsEnabled,
          retentionDays: {
            content: policy.contentRetentionDays,
            evidence: policy.moderationEvidenceRetentionDays,
            attachments: policy.attachmentRetentionDays,
          },
        },
      },
      input.at,
    );

    const values = {
      id: input.id,
      name: input.name.trim(),
      charter: input.charter.trim(),
      locationId: input.locationId ?? null,
      ownerStaffId: input.ownerStaffId,
      backupStaffId: input.backupStaffId ?? null,
      status: input.status ?? before?.status ?? "active",
      ...policy,
      updatedAt: new Date(input.at),
      updatedBy: input.actorId,
      ledgerId: ledger.id,
    };
    const [group] = await tx
      .insert(communityGroup)
      .values({ ...values, createdAt: before?.createdAt ?? new Date(input.at) })
      .onConflictDoUpdate({
        target: communityGroup.id,
        set: values,
      })
      .returning();
    return { group, ledger };
  });
}

export async function readPatientCommunity(clientId: string, at = new Date()) {
  const db = requireDb();
  const [membership] = await db
    .select({
      groupId: communityMembership.groupId,
      handle: communityMembership.handle,
      joinedAt: communityMembership.joinedAt,
      groupName: communityGroup.name,
      charter: communityGroup.charter,
      ownerStaffId: communityGroup.ownerStaffId,
      backupStaffId: communityGroup.backupStaffId,
      attachmentsEnabled: communityGroup.attachmentsEnabled,
      maxAttachmentBytes: communityGroup.maxAttachmentBytes,
      allowedAttachmentMimeTypes: communityGroup.allowedAttachmentMimeTypes,
      criticalResponseMinutes: communityGroup.criticalResponseMinutes,
      highResponseMinutes: communityGroup.highResponseMinutes,
      mediumResponseMinutes: communityGroup.mediumResponseMinutes,
      lowResponseMinutes: communityGroup.lowResponseMinutes,
      contentRetentionDays: communityGroup.contentRetentionDays,
      attachmentRetentionDays: communityGroup.attachmentRetentionDays,
    })
    .from(communityMembership)
    .innerJoin(communityGroup, eq(communityMembership.groupId, communityGroup.id))
    .where(
      and(
        eq(communityMembership.clientId, clientId),
        eq(communityMembership.status, "active"),
        eq(communityGroup.status, "active"),
      ),
    )
    .limit(1);
  if (!membership) return null;

  const [blockedRows, postRows] = await Promise.all([
    db
      .select({ blockedClientId: communityMemberBlock.blockedClientId })
      .from(communityMemberBlock)
      .where(
        and(
          eq(communityMemberBlock.blockerClientId, clientId),
          eq(communityMemberBlock.status, "active"),
        ),
      ),
    db
      .select()
      .from(communityPost)
      .where(
        and(
          eq(communityPost.groupId, membership.groupId),
          eq(communityPost.status, "published"),
          gt(communityPost.retentionUntil, at),
        ),
      )
      .orderBy(desc(communityPost.postedAt))
      .limit(100),
  ]);
  const blocked = new Set(blockedRows.map((row) => row.blockedClientId));
  const visiblePosts = postRows.filter(
    (post) => !post.authorClientId || !blocked.has(post.authorClientId),
  );
  const postIds = visiblePosts.map((post) => post.id);
  const attachmentRows = postIds.length
    ? await db
        .select({
          id: communityAttachment.id,
          postId: communityAttachment.postId,
          originalName: communityAttachment.originalName,
          mimeType: communityAttachment.mimeType,
          byteSize: communityAttachment.byteSize,
        })
        .from(communityAttachment)
        .where(
          and(
            inArray(communityAttachment.postId, postIds),
            eq(communityAttachment.scanStatus, "clean"),
            isNotNull(communityAttachment.releasedAt),
            gt(communityAttachment.retentionUntil, at),
          ),
        )
    : [];
  const attachmentsByPost = new Map<string, typeof attachmentRows>();
  for (const attachment of attachmentRows) {
    const list = attachmentsByPost.get(attachment.postId) ?? [];
    list.push(attachment);
    attachmentsByPost.set(attachment.postId, list);
  }
  const ownerRows = await db
    .select({ id: staff.id, name: staff.name })
    .from(staff)
    .where(
      or(
        eq(staff.id, membership.ownerStaffId),
        membership.backupStaffId
          ? eq(staff.id, membership.backupStaffId)
          : eq(staff.id, membership.ownerStaffId),
      ),
    );
  const ownerById = new Map(ownerRows.map((row) => [row.id, row.name]));
  return {
    membership: {
      handle: membership.handle,
      joinedAt: membership.joinedAt,
    },
    group: {
      id: membership.groupId,
      name: membership.groupName,
      charter: membership.charter,
      owner: {
        id: membership.ownerStaffId,
        name: ownerById.get(membership.ownerStaffId) ?? "Assigned coach moderator",
      },
      backup: membership.backupStaffId
        ? {
            id: membership.backupStaffId,
            name: ownerById.get(membership.backupStaffId) ?? "Backup moderator",
          }
        : null,
      policy: {
        attachmentsEnabled: membership.attachmentsEnabled,
        maxAttachmentBytes: membership.maxAttachmentBytes,
        allowedAttachmentMimeTypes: membership.allowedAttachmentMimeTypes,
        responseMinutes: {
          critical: membership.criticalResponseMinutes,
          high: membership.highResponseMinutes,
          medium: membership.mediumResponseMinutes,
          low: membership.lowResponseMinutes,
        },
        contentRetentionDays: membership.contentRetentionDays,
        attachmentRetentionDays: membership.attachmentRetentionDays,
      },
    },
    posts: visiblePosts.map((post) => ({
      id: post.id,
      parentPostId: post.parentPostId,
      authorKind: post.authorKind,
      authorHandle: post.authorHandle,
      body: post.body,
      postedAt: post.postedAt,
      isMine: post.authorClientId === clientId,
      canBlock: Boolean(post.authorClientId && post.authorClientId !== clientId),
      attachments: attachmentsByPost.get(post.id) ?? [],
    })),
  };
}

export async function createPatientCommunityPostWithLedger(input: {
  clientId: string;
  patientName: string;
  requestId: string;
  body: string;
  parentPostId?: string | null;
  at: string;
}) {
  const db = requireDb();
  const id = recordId("post", input.clientId, input.requestId);
  const text = input.body.trim();
  if (!text || text.length > 3_000) throw new Error("Community posts must be 1-3,000 characters.");
  const verdict = classifyPost(text);
  if (!verdict.safe) return { status: "blocked" as const, verdict };

  return db.transaction(async (tx) => {
    const [membership] = await tx
      .select({
        groupId: communityMembership.groupId,
        handle: communityMembership.handle,
        retentionDays: communityGroup.contentRetentionDays,
        groupStatus: communityGroup.status,
      })
      .from(communityMembership)
      .innerJoin(communityGroup, eq(communityMembership.groupId, communityGroup.id))
      .where(
        and(
          eq(communityMembership.clientId, input.clientId),
          eq(communityMembership.status, "active"),
        ),
      )
      .limit(1);
    if (!membership || membership.groupStatus !== "active") {
      throw new Error("You are not in an active community group.");
    }
    if (input.parentPostId) {
      const [parent] = await tx
        .select({ id: communityPost.id })
        .from(communityPost)
        .where(
          and(
            eq(communityPost.id, input.parentPostId),
            eq(communityPost.groupId, membership.groupId),
            eq(communityPost.status, "published"),
          ),
        )
        .limit(1);
      if (!parent) throw new Error("The post you replied to is unavailable.");
    }

    const [inserted] = await tx
      .insert(communityPost)
      .values({
        id,
        groupId: membership.groupId,
        parentPostId: input.parentPostId ?? null,
        authorKind: "member",
        authorClientId: input.clientId,
        authorStaffId: null,
        authorHandle: membership.handle,
        body: text,
        postedAt: new Date(input.at),
        retentionUntil: retentionUntil(input.at, membership.retentionDays),
      })
      .onConflictDoNothing({ target: communityPost.id })
      .returning();
    if (!inserted) {
      const [existing] = await tx
        .select()
        .from(communityPost)
        .where(and(eq(communityPost.id, id), eq(communityPost.authorClientId, input.clientId)))
        .limit(1);
      if (!existing || existing.body !== text) throw new Error("Community request id conflict.");
      return { status: "ok" as const, duplicate: true, post: existing, ledger: null };
    }

    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.clientId,
        actorName: input.patientName,
        actorRole: "Client",
        action: "create",
        entity: "community",
        entityId: id,
        subjectId: input.clientId,
        reason: input.parentPostId ? "Patient replied in owned community group" : "Patient posted in owned community group",
        after: { groupId: membership.groupId, handle: membership.handle, parentPostId: input.parentPostId ?? null },
      },
      input.at,
    );
    const [post] = await tx
      .update(communityPost)
      .set({ ledgerId: ledger.id })
      .where(eq(communityPost.id, id))
      .returning();
    return { status: "ok" as const, duplicate: false, post, ledger };
  });
}

async function lockPost(tx: DbTx, postId: string) {
  await tx.execute(raw`SELECT pg_advisory_xact_lock(hashtext(${postId}))`);
}

export async function reportCommunityPostWithLedger(input: {
  postId: string;
  requestId: string;
  reason: CommunityReportReason;
  detail?: string | null;
  reporterKind: "patient" | "staff";
  reporterId: string;
  reporterName: string;
  reporterRole: string;
  at: string;
}) {
  const db = requireDb();
  const reportId = recordId("report", input.reporterKind, input.reporterId, input.requestId);
  return db.transaction(async (tx) => {
    await lockPost(tx, input.postId);
    const [existing] = await tx
      .select()
      .from(communityReport)
      .where(eq(communityReport.id, reportId))
      .limit(1);
    if (existing) return { duplicate: true, report: existing, case: null, ledger: null };

    const [post] = await tx
      .select({
        postId: communityPost.id,
        groupId: communityPost.groupId,
        authorClientId: communityPost.authorClientId,
        postStatus: communityPost.status,
        ownerStaffId: communityGroup.ownerStaffId,
        criticalResponseMinutes: communityGroup.criticalResponseMinutes,
        highResponseMinutes: communityGroup.highResponseMinutes,
        mediumResponseMinutes: communityGroup.mediumResponseMinutes,
        lowResponseMinutes: communityGroup.lowResponseMinutes,
        evidenceRetentionDays: communityGroup.moderationEvidenceRetentionDays,
      })
      .from(communityPost)
      .innerJoin(communityGroup, eq(communityPost.groupId, communityGroup.id))
      .where(eq(communityPost.id, input.postId))
      .limit(1);
    if (!post || post.postStatus === "removed") throw new Error("That community post is unavailable.");
    if (input.reporterKind === "patient") {
      const [membership] = await tx
        .select({ clientId: communityMembership.clientId })
        .from(communityMembership)
        .where(
          and(
            eq(communityMembership.groupId, post.groupId),
            eq(communityMembership.clientId, input.reporterId),
            eq(communityMembership.status, "active"),
          ),
        )
        .limit(1);
      if (!membership) throw new Error("You cannot report a post outside your community group.");
    }

    const responseMinutes = {
      critical: post.criticalResponseMinutes,
      high: post.highResponseMinutes,
      medium: post.mediumResponseMinutes,
      low: post.lowResponseMinutes,
    };
    const due = moderationDueTimes(input.reason, input.at, { responseMinutes });
    let [moderationCase] = await tx
      .select()
      .from(communityModerationCase)
      .where(
        and(
          eq(communityModerationCase.postId, post.postId),
          or(
            eq(communityModerationCase.status, "open"),
            eq(communityModerationCase.status, "in-review"),
          ),
        ),
      )
      .orderBy(asc(communityModerationCase.createdAt))
      .limit(1);

    if (!moderationCase) {
      const caseId = recordId("case", post.postId, input.at);
      [moderationCase] = await tx
        .insert(communityModerationCase)
        .values({
          id: caseId,
          groupId: post.groupId,
          postId: post.postId,
          ownerStaffId: post.ownerStaffId,
          severity: due.severity,
          status: "open",
          firstResponseDueAt: due.firstResponseDueAt,
          resolutionDueAt: due.resolutionDueAt,
          createdAt: new Date(input.at),
          updatedAt: new Date(input.at),
          retentionUntil: retentionUntil(input.at, post.evidenceRetentionDays),
        })
        .returning();
    } else if (
      SEVERITY_RANK[due.severity] >
      SEVERITY_RANK[moderationCase.severity as CommunityModerationSeverity]
    ) {
      [moderationCase] = await tx
        .update(communityModerationCase)
        .set({
          severity: due.severity,
          firstResponseDueAt: earlier(moderationCase.firstResponseDueAt, due.firstResponseDueAt),
          resolutionDueAt: earlier(moderationCase.resolutionDueAt, due.resolutionDueAt),
          updatedAt: new Date(input.at),
        })
        .where(eq(communityModerationCase.id, moderationCase.id))
        .returning();
    }

    const [report] = await tx
      .insert(communityReport)
      .values({
        id: reportId,
        requestId: input.requestId,
        caseId: moderationCase.id,
        postId: post.postId,
        reporterKind: input.reporterKind,
        reporterClientId: input.reporterKind === "patient" ? input.reporterId : null,
        reporterStaffId: input.reporterKind === "staff" ? input.reporterId : null,
        reason: input.reason,
        detail: textOrNull(input.detail),
        createdAt: new Date(input.at),
      })
      .returning();
    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.reporterId,
        actorName: input.reporterName,
        actorRole: input.reporterRole,
        action: "create",
        entity: "community",
        entityId: reportId,
        subjectId: input.reporterKind === "patient" ? input.reporterId : undefined,
        reason: "Community post reported for moderator review",
        after: {
          caseId: moderationCase.id,
          postId: post.postId,
          reportReason: input.reason,
          ownerStaffId: moderationCase.ownerStaffId,
          severity: moderationCase.severity,
          firstResponseDueAt: moderationCase.firstResponseDueAt.toISOString(),
        },
      },
      input.at,
    );
    return { duplicate: false, report, case: moderationCase, ledger };
  });
}

export async function setCommunityBlockForPost(input: {
  blockerClientId: string;
  blockerName: string;
  postId: string;
  blocked: boolean;
  reason?: string | null;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    const [post] = await tx
      .select({
        groupId: communityPost.groupId,
        authorClientId: communityPost.authorClientId,
      })
      .from(communityPost)
      .where(eq(communityPost.id, input.postId))
      .limit(1);
    if (!post?.authorClientId) throw new Error("Staff and unavailable authors cannot be blocked.");
    if (post.authorClientId === input.blockerClientId) throw new Error("You cannot block yourself.");
    const memberships = await tx
      .select({ clientId: communityMembership.clientId })
      .from(communityMembership)
      .where(
        and(
          eq(communityMembership.groupId, post.groupId),
          inArray(communityMembership.clientId, [input.blockerClientId, post.authorClientId]),
          eq(communityMembership.status, "active"),
        ),
      );
    if (memberships.length !== 2) throw new Error("Both members must belong to the same active group.");

    const id = recordId("block", input.blockerClientId, post.authorClientId);
    const [row] = await tx
      .insert(communityMemberBlock)
      .values({
        id,
        blockerClientId: input.blockerClientId,
        blockedClientId: post.authorClientId,
        status: input.blocked ? "active" : "lifted",
        reason: textOrNull(input.reason),
        createdAt: new Date(input.at),
        liftedAt: input.blocked ? null : new Date(input.at),
      })
      .onConflictDoUpdate({
        target: [
          communityMemberBlock.blockerClientId,
          communityMemberBlock.blockedClientId,
        ],
        set: {
          status: input.blocked ? "active" : "lifted",
          reason: textOrNull(input.reason),
          liftedAt: input.blocked ? null : new Date(input.at),
        },
      })
      .returning();
    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.blockerClientId,
        actorName: input.blockerName,
        actorRole: "Client",
        action: "update",
        entity: "community",
        entityId: id,
        subjectId: input.blockerClientId,
        reason: input.blocked ? "Patient blocked a community member" : "Patient unblocked a community member",
        after: { status: row.status },
      },
      input.at,
    );
    return { block: row, ledger };
  });
}

export async function readCommunityModerationQueue(input: {
  moderatorStaffId?: string;
  includeClosed?: boolean;
  limit?: number;
}) {
  const db = requireDb();
  const filters = [];
  if (input.moderatorStaffId) {
    filters.push(
      or(
        eq(communityModerationCase.ownerStaffId, input.moderatorStaffId),
        eq(communityGroup.backupStaffId, input.moderatorStaffId),
      )!,
    );
  }
  if (!input.includeClosed) {
    filters.push(
      or(
        eq(communityModerationCase.status, "open"),
        eq(communityModerationCase.status, "in-review"),
      )!,
    );
  }
  const rows = await db
    .select({
      case: communityModerationCase,
      post: {
        id: communityPost.id,
        authorHandle: communityPost.authorHandle,
        authorKind: communityPost.authorKind,
        body: communityPost.body,
        status: communityPost.status,
        postedAt: communityPost.postedAt,
      },
      group: {
        id: communityGroup.id,
        name: communityGroup.name,
        ownerStaffId: communityGroup.ownerStaffId,
      },
    })
    .from(communityModerationCase)
    .innerJoin(communityPost, eq(communityModerationCase.postId, communityPost.id))
    .innerJoin(communityGroup, eq(communityModerationCase.groupId, communityGroup.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(communityModerationCase.firstResponseDueAt))
    .limit(Math.min(Math.max(input.limit ?? 100, 1), 500));
  const caseIds = rows.map((row) => row.case.id);
  const reports = caseIds.length
    ? await db
        .select()
        .from(communityReport)
        .where(inArray(communityReport.caseId, caseIds))
        .orderBy(asc(communityReport.createdAt))
    : [];
  const ownerIds = [...new Set(rows.map((row) => row.case.ownerStaffId))];
  const owners = ownerIds.length
    ? await db
        .select({ id: staff.id, name: staff.name, active: staff.active })
        .from(staff)
        .where(inArray(staff.id, ownerIds))
    : [];
  const ownerById = new Map(owners.map((owner) => [owner.id, owner]));
  return rows.map((row) => ({
    ...row,
    owner: ownerById.get(row.case.ownerStaffId) ?? null,
    reports: reports.filter((report) => report.caseId === row.case.id),
  }));
}

export async function transitionCommunityModerationCaseWithLedger(input: {
  id: string;
  status: CommunityModerationStatus;
  action?: CommunityModerationAction;
  resolution?: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  allowAnyOwner: boolean;
  at: string;
}) {
  const db = requireDb();
  return db.transaction(async (tx) => {
    await tx.execute(raw`SELECT pg_advisory_xact_lock(hashtext(${input.id}))`);
    const [current] = await tx
      .select()
      .from(communityModerationCase)
      .where(eq(communityModerationCase.id, input.id))
      .limit(1);
    if (!current) return { status: "missing" as const };
    if (!input.allowAnyOwner && current.ownerStaffId !== input.actorId) {
      const [group] = await tx
        .select({ backupStaffId: communityGroup.backupStaffId })
        .from(communityGroup)
        .where(eq(communityGroup.id, current.groupId))
        .limit(1);
      if (group?.backupStaffId !== input.actorId) {
        return {
          status: "forbidden" as const,
          reason: "This moderation case belongs to another moderator.",
        };
      }
    }
    const from = current.status as CommunityModerationStatus;
    if (!moderationTransitionAllowed(from, input.status)) {
      return { status: "conflict" as const, reason: `Cannot move a ${from} case to ${input.status}.` };
    }
    if (
      !resolutionAcceptable({
        status: input.status,
        action: input.action,
        resolution: input.resolution,
      })
    ) {
      return { status: "conflict" as const, reason: "Closed cases require an action and resolution." };
    }
    const at = new Date(input.at);
    const closing = input.status === "resolved" || input.status === "dismissed";
    const needsMember =
      closing &&
      (input.action === "suspend-member" || input.action === "route-to-care-team");
    const [affectedPost] = needsMember
      ? await tx
          .select({
            authorClientId: communityPost.authorClientId,
            body: communityPost.body,
            status: communityPost.status,
          })
          .from(communityPost)
          .where(eq(communityPost.id, current.postId))
          .limit(1)
      : [];
    if (needsMember && !affectedPost?.authorClientId) {
      return {
        status: "conflict" as const,
        reason: "That action requires a patient-authored community post.",
      };
    }
    const firstResponse =
      current.firstRespondedAt ?? (input.status !== "open" ? at : null);
    const ledger = await appendLedgerInTx(
      tx,
      {
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        action: closing ? "approve" : "update",
        entity: "community",
        entityId: current.id,
        reason: closing ? "Community moderation case closed" : "Community moderation case acknowledged",
        before: { status: current.status, postStatus: null },
        after: {
          status: input.status,
          action: input.action ?? null,
          resolution: textOrNull(input.resolution),
        },
      },
      input.at,
    );
    const [updated] = await tx
      .update(communityModerationCase)
      .set({
        status: input.status,
        firstRespondedAt: firstResponse,
        firstRespondedBy:
          current.firstRespondedBy ?? (input.status !== "open" ? input.actorId : null),
        resolvedAt: closing ? at : null,
        resolvedBy: closing ? input.actorId : null,
        action: input.action ?? current.action,
        resolution: textOrNull(input.resolution) ?? current.resolution,
        updatedAt: at,
        ledgerId: ledger.id,
      })
      .where(eq(communityModerationCase.id, current.id))
      .returning();
    if (closing && (input.action === "hide-post" || input.action === "remove-post")) {
      await tx
        .update(communityPost)
        .set({
          status: input.action === "hide-post" ? "hidden" : "removed",
          hiddenAt: at,
          hiddenBy: input.actorId,
          removalReason: textOrNull(input.resolution),
        })
        .where(eq(communityPost.id, current.postId));
    }
    if (closing && input.action === "suspend-member" && affectedPost?.authorClientId) {
      await tx
        .update(communityMembership)
        .set({
          status: "suspended",
          leftAt: at,
          updatedAt: at,
        })
        .where(
          and(
            eq(communityMembership.groupId, current.groupId),
            eq(communityMembership.clientId, affectedPost.authorClientId),
          ),
        );
    }
    if (closing && input.action === "route-to-care-team" && affectedPost?.authorClientId) {
      const escalationId = recordId("escalation", current.id);
      await tx
        .insert(escalation)
        .values({
          id: escalationId,
          clientId: affectedPost.authorClientId,
          raisedByStaffId: input.actorId,
          raisedAt: at,
          kind: "Community safety concern",
          priority:
            current.severity === "critical"
              ? "Urgent"
              : current.severity === "high"
                ? "Prompt"
                : "Routine",
          question: input.resolution?.trim() ?? "Review the owned community moderation concern.",
          memberQuote: affectedPost.body,
          dueAt: current.resolutionDueAt,
          ledgerId: ledger.id,
        })
        .onConflictDoNothing({ target: escalation.id });
    }
    return { status: "ok" as const, case: updated, ledger };
  });
}
