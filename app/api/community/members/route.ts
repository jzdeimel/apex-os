import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { requestIsSameOrigin } from "@/lib/api/origin";
import { guard } from "@/lib/auth/guard";
import { hasCapability } from "@/lib/authz/capabilities";
import { nowIso } from "@/lib/clock";
import {
  searchCommunityEligibleClients,
  setCommunityMembershipWithLedger,
} from "@/lib/db/communityRepo";
import { isFeatureEnabled } from "@/lib/features/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const g = await guard("moderate:community");
  if (!g.ok) return g.res;
  if (!(await isFeatureEnabled("community"))) return fail(404, "Community is not enabled.");
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ ok: true, clients: [] });
  try {
    const assignedCoachId =
      g.actor.accessProfile === "coach" &&
      !hasCapability(g.actor.accessProfile, "admin:community-policy")
        ? g.actor.id
        : undefined;
    const clients = await searchCommunityEligibleClients(query, 20, assignedCoachId);
    return NextResponse.json({ ok: true, clients });
  } catch (error) {
    return unavailable("community.members.search", error, "Patient search is temporarily unavailable.");
  }
}

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return fail(403, "This enrollment came from an untrusted origin.");
  const g = await guard("moderate:community");
  if (!g.ok) return g.res;
  if (!(await isFeatureEnabled("community"))) return fail(404, "Community is not enabled.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.groupId !== "string" ||
    typeof body.clientId !== "string" ||
    typeof body.handle !== "string" ||
    typeof body.active !== "boolean"
  ) {
    return fail(400, "groupId, clientId, handle, and active are required.");
  }
  try {
    const result = await setCommunityMembershipWithLedger({
      groupId: body.groupId,
      clientId: body.clientId,
      handle: body.handle,
      active: body.active,
      actorId: g.actor.id,
      actorName: g.principal.name,
      actorRole: g.actor.role,
      allowAnyOwner: hasCapability(g.actor.accessProfile, "admin:community-policy"),
      at: nowIso(),
    });
    return NextResponse.json({
      ok: true,
      membership: result.membership,
      ledgerId: result.ledger.id,
    });
  } catch (error) {
    return unavailable("community.members.save", error, "Community enrollment was not confirmed.");
  }
}
