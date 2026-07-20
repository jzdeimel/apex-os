/**
 * Next.js startup hook.
 *
 * Runs once per server process, before the first request is served. This is
 * where migrations are applied — see lib/db/migrate.ts for why they run in the
 * container rather than from a developer machine.
 *
 * The `NEXT_RUNTIME` guard matters: this file is also evaluated in the Edge
 * runtime, which has no TCP sockets and therefore no Postgres driver. Importing
 * the database client there fails the build with an error that does not mention
 * the runtime, which is a genuinely confusing half hour. The dynamic import
 * keeps the driver out of the Edge bundle entirely.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runMigrations } = await import("@/lib/db/migrate");
  const state = await runMigrations();

  // One line, no PHI, at boot only. The application's logging discipline is
  // otherwise near-total silence (2 console statements in 101k lines) and that
  // is worth preserving — but "did the schema apply" is the one fact an
  // operator needs from a cold start, and finding it in the ledger would
  // require the ledger to be working, which is what this line reports on.
  if (state.status === "applied") {
    console.info("[apex] migrations applied");
  } else if (state.status === "failed") {
    console.error("[apex] migrations FAILED — write paths are degraded:", state.error);
  } else if (state.status === "not-configured") {
    console.info("[apex] DATABASE_URL not set — running with seeded reads, write paths disabled");
  }
}
