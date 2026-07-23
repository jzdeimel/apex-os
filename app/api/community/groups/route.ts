import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { requestIsSameOrigin } from "@/lib/api/origin";
import { guard } from "@/lib/auth/guard";
import { nowIso } from "@/lib/clock";
import {
  readCommunityGroups,
  readCommunityModeratorCandidates,
  upsertCommunityGroupWithLedger,
} from "@/lib/db/communityRepo";
import { isFeatureEnabled } from "@/lib/features/server";

export const dynamic = "force-dynamic";
const GROUP_ID = /^[a-z0-9][a-z0-9_-]{2,80}$/;

export async function GET() {
  const g = await guard("read:community-moderation");
  if (!g.ok) return g.res;
  if (!(await isFeatureEnabled("community"))) return fail(404, "Community is not enabled.");
  try {
    const canManage = g.actor.accessProfile === "owner" ||
      g.actor.accessProfile === "operations" ||
      g.actor.accessProfile === "system-admin";
    const [allGroups, moderatorCandidates] = await Promise.all([
      readCommunityGroups(),
      canManage ? readCommunityModeratorCandidates() : Promise.resolve([]),
    ]);
    const groups = g.actor.accessProfile === "coach"
      ? allGroups.filter(
          (group) =>
            group.ownerStaffId === g.actor.id || group.backupStaffId === g.actor.id,
        )
      : allGroups;
    return NextResponse.json({
      ok: true,
      groups,
      moderatorCandidates,
      canManage,
      attachmentStorageReady: process.env.COMMUNITY_ATTACHMENT_STORAGE_READY === "true",
    });
  } catch (error) {
    return unavailable("community.groups.list", error, "Community policy is temporarily unavailable.");
  }
}

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return fail(403, "This policy request came from an untrusted origin.");
  const g = await guard("admin:community-policy");
  if (!g.ok) return g.res;
  if (!(await isFeatureEnabled("community"))) return fail(404, "Community is not enabled.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.id !== "string" ||
    !GROUP_ID.test(body.id) ||
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.length > 120 ||
    typeof body.charter !== "string" ||
    !body.charter.trim() ||
    body.charter.length > 2_000 ||
    typeof body.ownerStaffId !== "string"
  ) {
    return fail(400, "Valid id, name, charter, and ownerStaffId are required.");
  }
  if (body.attachmentsEnabled === true && process.env.COMMUNITY_ATTACHMENT_STORAGE_READY !== "true") {
    return fail(
      409,
      "Attachments cannot be enabled until private storage and malware scanning are configured.",
    );
  }
  try {
    const result = await upsertCommunityGroupWithLedger({
      id: body.id,
      name: body.name,
      charter: body.charter,
      locationId: typeof body.locationId === "string" ? body.locationId : null,
      ownerStaffId: body.ownerStaffId,
      backupStaffId: typeof body.backupStaffId === "string" ? body.backupStaffId : null,
      status:
        body.status === "paused" || body.status === "archived" ? body.status : "active",
      criticalResponseMinutes:
        typeof body.criticalResponseMinutes === "number" ? body.criticalResponseMinutes : undefined,
      highResponseMinutes:
        typeof body.highResponseMinutes === "number" ? body.highResponseMinutes : undefined,
      mediumResponseMinutes:
        typeof body.mediumResponseMinutes === "number" ? body.mediumResponseMinutes : undefined,
      lowResponseMinutes:
        typeof body.lowResponseMinutes === "number" ? body.lowResponseMinutes : undefined,
      contentRetentionDays:
        typeof body.contentRetentionDays === "number" ? body.contentRetentionDays : undefined,
      moderationEvidenceRetentionDays:
        typeof body.moderationEvidenceRetentionDays === "number"
          ? body.moderationEvidenceRetentionDays
          : undefined,
      attachmentRetentionDays:
        typeof body.attachmentRetentionDays === "number"
          ? body.attachmentRetentionDays
          : undefined,
      attachmentsEnabled:
        typeof body.attachmentsEnabled === "boolean" ? body.attachmentsEnabled : undefined,
      maxAttachmentBytes:
        typeof body.maxAttachmentBytes === "number" ? body.maxAttachmentBytes : undefined,
      allowedAttachmentMimeTypes:
        Array.isArray(body.allowedAttachmentMimeTypes) &&
        body.allowedAttachmentMimeTypes.every((value) => typeof value === "string")
          ? (body.allowedAttachmentMimeTypes as string[])
          : undefined,
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      at: nowIso(),
    });
    return NextResponse.json({ ok: true, group: result.group, ledgerId: result.ledger.id });
  } catch (error) {
    return unavailable("community.groups.save", error, "Community policy was not saved.");
  }
}
