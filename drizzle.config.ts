import type { Config } from "drizzle-kit";

/**
 * Drizzle configuration.
 *
 * Migrations are checked in under lib/db/migrations and applied by the running
 * container at boot (see lib/db/migrate.ts), NOT by a developer's laptop
 * against production. That is deliberate: a schema change that only exists on
 * someone's machine is a schema change nobody can review, and a credential that
 * has to reach a laptop to run a migration is a credential with a much larger
 * blast radius than one that never leaves Azure.
 */
export default {
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
} satisfies Config;
