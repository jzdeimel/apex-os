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
 * A failed migration does NOT take the process down. That is a deliberate
 * trade for this stage: reads are still served entirely from seeded data, so a
 * migration failure would otherwise turn a write-path problem into a total
 * outage of a working application. The error is logged once, loudly, and
 * `migrationState` records it so a health endpoint can report degraded rather
 * than the app pretending it is fine.
 *
 * That trade inverts once reads move to Postgres: at that point a bad schema
 * means bad data, and refusing to start is correct. There is a comment on the
 * check below to make that switch obvious when the time comes.
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
    // Not an error worth shouting about: the app is designed to run without a
    // database while reads remain seeded. The write paths say so themselves.
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
    //
    // WHEN READS MOVE TO POSTGRES, CHANGE THIS TO RETHROW.
    // While reads are seeded, a migration failure degrades the write paths and
    // nothing else, so killing the process would convert a partial failure into
    // a total one. Once a page's content depends on this schema, serving that
    // page against an unmigrated database is worse than not serving it.
    //
    return state;
  }
}
