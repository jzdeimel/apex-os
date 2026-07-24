import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { existsSync } from "node:fs";

/**
 * Module resolution hooks that teach Node the `@/` alias.
 *
 * WHY THIS EXISTS RATHER THAN A TEST RUNNER
 * -----------------------------------------
 * The spec checks (scripts/spec-checks.ts) verify the rules that came out of
 * the 2026-07-21 requirements — the NCV credential priority, the feature-flag
 * pilot shape, the five intake must-knows, the three-way order routing. Those
 * had been running as a scratch harness, which meant they proved something once
 * and guarded nothing.
 *
 * Making them permanent needed either a test framework (vitest + its transitive
 * tree, a config file, and a second module resolver to keep in sync with
 * tsconfig) or thirty lines of resolver. Node 22 strips TypeScript types
 * natively and can register resolution hooks, so the only thing actually
 * missing was `@/` — which tsconfig defines and Node does not read.
 *
 * Thirty lines, zero dependencies, and the checks run against the SAME source
 * the application imports rather than a compiled copy that can drift.
 */

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

/** Extensions tried, in order, for an extensionless alias import. */
const CANDIDATES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx", ".json", ".js", ".mjs"];

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) return nextResolve(specifier, context);

  const base = resolvePath(ROOT, specifier.slice(2));
  for (const ext of CANDIDATES) {
    const candidate = base + ext;
    if (existsSync(candidate)) {
      return nextResolve(pathToFileURL(candidate).href, context);
    }
  }

  // Deliberately explicit. A silently unresolved alias would surface later as
  // "X is not a function", which is a much longer debugging session than a
  // resolver saying exactly which path it looked for.
  throw new Error(
    `Cannot resolve "${specifier}" from the @/ alias. Looked under ${base} with ` +
      `extensions: ${CANDIDATES.filter(Boolean).join(", ")}`,
  );
}
