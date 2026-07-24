import { NextResponse } from "next/server";

import { unavailable } from "@/lib/api/respond";
import { readPublicLocations } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

/**
 * Public, non-PHI clinic reference used by the acquisition and intake journey.
 * Inactive clinics are excluded in the repository, so the public form cannot
 * keep accepting leads for a location operations has closed.
 */
export async function GET() {
  try {
    return NextResponse.json(
      {
        ok: true,
        authoritative: true,
        locations: await readPublicLocations(),
      },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  } catch (error) {
    return unavailable(
      "public.locations",
      error,
      "Clinic choices are temporarily unavailable. Please call Alpha Health.",
    );
  }
}
