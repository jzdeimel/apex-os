import { migrate } from "drizzle-orm/postgres-js/migrator";
import { and, eq } from "drizzle-orm";
import { db, sql, isConfigured } from "@/lib/db/client";
import { staff as staffTable } from "@/lib/db/schema";
import { staff as seededStaff } from "@/lib/mock/staff";
import { inferAccessProfile } from "@/lib/authz/profiles";

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

    // Seed the staff roster (idempotent insert) so the authority table is
    // populated the moment the schema exists. This is deliberately done here
    // against `db` directly rather than through repo.seedStaff(): the repository
    // guard refuses writes while migrations are pending, and migration bootstrap
    // is the one place that must be allowed to finish creating that ready state.
    try {
      for (const s of seededStaff) {
        const accessProfile = inferAccessProfile({
          id: s.id,
          role: s.role,
          credentials: s.credentials,
          title: s.bio,
        });
        await db.insert(staffTable).values({
          id: s.id,
          email: s.email ?? `${s.id}@alphahealth.demo`,
          name: s.name,
          role: s.role,
          accessProfile,
          locationIds: s.locationIds ?? [],
          credentials: s.credentials ?? null,
          canApprove: s.canApprove ?? false,
          active: true,
        }).onConflictDoNothing({ target: staffTable.id });
        // Older non-production databases may already contain the seeded row
        // from before job-specific access profiles existed. Initialize only the
        // fail-closed placeholder; never overwrite a profile an operator
        // explicitly assigned in Apex.
        if (accessProfile !== "unassigned") {
          await db
            .update(staffTable)
            .set({ accessProfile })
            .where(
              and(
                eq(staffTable.id, s.id),
                eq(staffTable.accessProfile, "unassigned"),
              ),
            );
        }
      }
    } catch (seedErr) {
      console.error("[apex] staff seed failed:", seedErr instanceof Error ? seedErr.message : seedErr);
    }

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
