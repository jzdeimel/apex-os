import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/db/client";
import { migrationState } from "@/lib/db/migrate";

/**
 * Health and readiness.
 *
 * Reports DEGRADED rather than healthy when the database is absent or a
 * migration failed. The application still serves every page in that state —
 * reads are seeded — so a plain 200 would be honest about liveness and
 * misleading about capability, and an operator would have no way to tell that
 * every write was being refused.
 *
 * Deliberately carries no PHI, no connection string and no schema detail: this
 * endpoint is reachable without authentication, so it says whether things work
 * and nothing about what is in them.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const migration = migrationState();
  const degraded = !isConfigured || migration.status === "failed";

  return NextResponse.json(
    {
      status: degraded ? "degraded" : "ok",
      database: isConfigured ? "configured" : "not-configured",
      migration: migration.status,
      // Writes are refused, loudly, when this is false. See lib/db/client.ts.
      writePathsEnabled: isConfigured && migration.status === "applied",
    },
    { status: degraded ? 503 : 200 },
  );
}
