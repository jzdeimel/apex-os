import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql, isConfigured } from "@/lib/db/client";

/**
 * Apply pending migrations at boot.
 *
 * WHY IN THE CONTAINER AND NOT FROM A LAPTOP
 * ------------------------------------------
 * Running migrations from a developer machine means the production credential
 * has to reach that machine, which enlarges its blast radius enormously — and
 * for a system heading toward PHI, "who could reach the database" is a question
 * with a compliance answer. Applying them here means the credential lives only
 * as a Container App secret and is read only by the app's own process.
 *
 * It also removes an entire class of incident: the schema a replica is running
 * against is, by construction, the schema shipped in the same image.
 *
 * IDEMPOTENT AND CONCURRENT-SAFE
 * ------------------------------
 * Drizzle records applied migrations in `__drizzle_migrations` and takes an
 * advisory lock, so N replicas starting at once is safe — one applies, the rest
 * wait then no-op. Do NOT "optimise" this by gating it on replica index.
 *
 * FAILURE POLICY
 * --------------
 * A failed migration marks the database unavailable. Authoritative pages and
 * APIs then fail closed through requireDb(); no fixture read model is promoted
 * during an outage. The health endpoint reports the exact migration state.
 */

export type MigrationState =
  | { status: "not-configured" }
  | { status: "pending" }
  | { status: "applied"; at: string }
  | { status: "failed"; at: string; error: string };

let state: MigrationState = isConfigured ? { status: "pending" } : { status: "not-configured" };
let started = false;

export function migrationState(): MigrationState {
  return state;
}

/**
 * Run once per process. Safe to call from multiple entry points — the `started`
 * flag makes the second call a no-op rather than a second migration attempt.
 */
export async function runMigrations(): Promise<MigrationState> {
  if (started) return state;
  started = true;

  if (!db || !sql) {
    state = { status: "not-configured" };
    // Local builds may start without Postgres so compilation and fail-closed
    // boundary tests can run. Shared Apex always supplies DATABASE_URL; active
    // reads and writes never promote fixtures when it is absent.
    return state;
  }

  const at = new Date().toISOString();
  try {
    await migrate(db, { migrationsFolder: "./lib/db/migrations" });

    state = { status: "applied", at };
    return state;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    state = { status: "failed", at, error };
    // The single place in the application where logging is warranted, and it
    // carries no PHI — a migration error is schema text, not patient data.
    console.error("[apex] migration failed:", error);
    return state;
  }
}
