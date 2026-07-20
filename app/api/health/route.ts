import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/db/client";
import { migrationState, runMigrations } from "@/lib/db/migrate";

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
  /**
   * Health is also the migration trigger.
   *
   * Migrations run lazily on first database use (see lib/db/client.ts), and
   * right now no UI writes to the database — so without this they would never
   * run at all. A readiness probe is a good place for it: it is called on every
   * deploy, it is idempotent because Drizzle records applied migrations and
   * takes an advisory lock, and it means the schema is in place before the first
   * real write rather than racing it.
   */
  await runMigrations();
  const migration = migrationState();
  /**
   * `pending` counts as degraded, not ok.
   *
   * The first version treated only `failed` as degraded, so a database that was
   * configured but whose migrations had never run reported `status: "ok"` with
   * `writePathsEnabled: false` — a green light over a system that could not
   * write. That is precisely the falsely-reassuring signal this codebase keeps
   * getting audited for. If the write paths are not enabled, this endpoint says
   * so in the status field, not only in a detail nobody reads.
   */
  const degraded = !isConfigured || migration.status !== "applied";

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
