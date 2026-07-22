import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

/**
 * The database connection.
 *
 * SERVER ONLY. Importing this from a client component would ship the driver —
 * and, far worse, the connection string — to the browser. Next will refuse at
 * build time, but the guard below fails faster and says why.
 *
 * CONFIGURED OR ABSENT, NEVER FAKED
 * ---------------------------------
 * `DATABASE_URL` is supplied at runtime as a Container App secret; it is never
 * in the repo, never in an image layer, and never in a commit. When it is
 * missing, `db` is null and every repository call throws a named error.
 *
 * That refusal is deliberate and it is the lesson of the audit
 * (docs/audit/GAP_ANALYSIS.md). This codebase was full of controls that
 * asserted an outcome and performed none — a reorder button that created no
 * order, a toast claiming "Written to the ledger" with no write. A database
 * layer that silently degraded to in-memory would be the most damaging version
 * of that pattern: writes that appear to succeed, an audit trail that looks
 * populated, and nobody discovering the truth until someone asks the ledger a
 * question it cannot answer.
 *
 * A loud failure is recoverable. A quiet fake is not.
 *
 * CONNECTION POOLING
 * ------------------
 * Container Apps scales to multiple replicas and a Burstable Postgres has a low
 * connection ceiling, so the pool is deliberately small. `max: 5` per replica
 * against `Standard_B1ms` leaves headroom for migrations and an admin session.
 * Raise the SKU before raising this number.
 */

const url = process.env.DATABASE_URL;

/**
 * Azure Postgres Flexible Server requires TLS. `sslmode=require` in the URL
 * covers it, but a connection string edited by hand is exactly the kind of
 * thing that loses a query parameter, so it is asserted here too.
 */
function connect(connectionString: string) {
  return postgres(connectionString, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: "require",
    // Prepared statements are disabled because Azure's connection pooling in
    // transaction mode does not support them. Named statements would work
    // against a direct connection and fail the moment pooling is turned on,
    // which is a bug that only appears under load.
    prepare: false,
    onnotice: () => {},
  });
}

export const sql = url ? connect(url) : null;

export const db = sql ? drizzle(sql, { schema }) : null;

export const isConfigured = db !== null;

/**
 * Get the database, or throw a message that names the fix.
 *
 * Every repository function calls this rather than touching `db` directly, so
 * there is exactly one place that can decide what "no database" means — and it
 * decides "stop", not "pretend".
 */
let migrationsKicked = false;
let migrationsReady = !url;
let migrationError: string | null = null;

/**
 * Kick migrations once, on first database use.
 *
 * This replaced a Next `instrumentation.ts` boot hook. That hook is evaluated
 * for the Edge runtime as well as Node, so it pulled the Postgres driver into
 * an Edge bundle that has no TCP stack and broke the build outright — and the
 * `NEXT_RUNTIME` guard inside it could not prevent that, because the problem is
 * static analysis rather than execution.
 *
 * Lazy is arguably better anyway: a process that never touches the database
 * never pays for a migration check, and the first write is a perfectly good
 * moment to insist the schema exists.
 *
 * Kicked in the background, but writes fail fast while the migration is still
 * pending. A first write racing an unapplied schema produces misleading driver
 * errors and can leave compound workflows half-explained; a clear "try again in
 * a moment" is the safer cold-start failure until the repository API becomes
 * async end-to-end.
 */
function kickMigrations() {
  if (migrationsKicked) return;
  migrationsKicked = true;
  void import("@/lib/db/migrate")
    .then((m) => m.runMigrations())
    .then((state) => {
      if (state.status === "failed") migrationError = state.error;
      migrationsReady = true;
    })
    .catch((err) => {
      migrationError = err instanceof Error ? err.message : String(err);
      migrationsReady = true;
    });
}

export function requireDb() {
  kickMigrations();
  if (!db) {
    throw new Error(
      "DATABASE_URL is not set. Apex refuses to run write paths against no database — " +
        "a write that silently does nothing is worse than one that fails. " +
        "Set it as a Container App secret: az containerapp secret set -g apex-prod -n ca-apex " +
        '--secrets "database-url=postgresql://..." and bind it with --set-env-vars ' +
        "DATABASE_URL=secretref:database-url",
    );
  }
  if (!migrationsReady) {
    throw new Error("Database migrations are still applying. Please retry in a moment.");
  }
  if (migrationError) {
    throw new Error(`Database migrations failed: ${migrationError}`);
  }
  return db;
}

export { schema };
