import { NextResponse } from "next/server";

import { unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { readAuthorSigningQueue } from "@/lib/db/clinicalQueueRepo";
import { readClinicalRecommendations } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard("sign:encounter");
  if (!g.ok) return g.res;
  try {
    const [notes, recommendations] = await Promise.all([
      readAuthorSigningQueue(g.actor.id),
      readClinicalRecommendations({
        assignedProviderId: g.actor.id,
        status: "pending",
      }),
    ]);
    return NextResponse.json({
      ok: true,
      authoritative: true,
      queue: notes,
      recommendationQueue: {
        enabled: true,
        count: recommendations.length,
        rows: recommendations,
        path: "/recommendations",
      },
    });
  } catch (error) {
    return unavailable("clinical.sign-queue", error, "The clinical signing queue is temporarily unavailable.");
  }
}
