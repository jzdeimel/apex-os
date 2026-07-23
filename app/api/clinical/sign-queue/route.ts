import { NextResponse } from "next/server";

import { unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { readAuthorSigningQueue } from "@/lib/db/clinicalQueueRepo";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard("sign:encounter");
  if (!g.ok) return g.res;
  try {
    const notes = await readAuthorSigningQueue(g.actor.id);
    return NextResponse.json({
      ok: true,
      authoritative: true,
      queue: notes,
      recommendationQueue: {
        enabled: false,
        reason: "Apex has no authoritative recommendation record yet; seeded recommendations are disabled.",
      },
    });
  } catch (error) {
    return unavailable("clinical.sign-queue", error, "The clinical signing queue is temporarily unavailable.");
  }
}
