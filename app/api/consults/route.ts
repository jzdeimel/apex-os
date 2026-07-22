import { NextResponse } from "next/server";

import { currentPrincipal } from "@/lib/auth/principal";
import { guard } from "@/lib/auth/guard";
import { listConsultsForClient } from "@/lib/db/repo";
import { getClient } from "@/lib/mock/clients";
import { unavailable } from "@/lib/api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Durable, authorized consult history for the client profile. */
export async function GET(req: Request) {
  if (!(await currentPrincipal())) {
    return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
  }

  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "clientId is required." }, { status: 400 });
  }
  const client = getClient(clientId);
  if (!client) {
    return NextResponse.json({ ok: false, error: "Unknown client." }, { status: 404 });
  }

  // Consults can contain internal Medical review. Both Coach and Medical hold
  // read:clinical on their assigned care team; operations-only Admin does not.
  const g = await guard("read:clinical", {
    coachId: client.coachId,
    providerId: client.providerId,
    locationId: client.locationId,
  });
  if (!g.ok) return g.res;

  try {
    const consults = await listConsultsForClient(clientId, g.actor.id);
    return NextResponse.json({ ok: true, consults });
  } catch (err) {
    return unavailable(
      "consult.history",
      err,
      "The saved consult history is temporarily unavailable.",
    );
  }
}
