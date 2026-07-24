/**
 * Proves that every shared route's static runtime graph is fixture-free.
 *
 * Page hiding alone is insufficient: an authoritative API once imported the
 * old demo ledger for its hash helper, which initialized seeded patients and
 * staff as a module side effect. This walks TypeScript import declarations
 * (excluding type-only and lazy demo imports) from every route that is not
 * retired by `lib/productionSurfaces.ts`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

import {
  isFixtureOnlyApiPath,
  isFixtureOnlyPath,
} from "@/lib/productionSurfaces";

const root = process.cwd();

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function routeFor(file: string, leaf: "page.tsx" | "route.ts"): string {
  const relative = path
    .relative(path.join(root, "app"), file)
    .replaceAll("\\", "/");
  const withoutLeaf = relative.replace(new RegExp(`/${leaf.replace(".", "\\.")}$`), "");
  return `/${withoutLeaf === leaf ? "" : withoutLeaf}`;
}

function resolveImport(from: string, specifier: string): string | null {
  if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return null;
  const base = specifier.startsWith("@/")
    ? path.join(root, specifier.slice(2))
    : path.resolve(path.dirname(from), specifier);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function staticImports(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports: string[] = [];
  for (const statement of parsed.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }
    const clause = statement.importClause;
    if (clause?.isTypeOnly) continue;
    if (
      clause &&
      !clause.name &&
      clause.namedBindings &&
      ts.isNamedImports(clause.namedBindings) &&
      clause.namedBindings.elements.every((element) => element.isTypeOnly)
    ) {
      continue;
    }
    imports.push(statement.moduleSpecifier.text);
  }
  return imports;
}

function fixtureChains(entry: string): string[][] {
  const queue: Array<{ file: string; chain: string[] }> = [
    { file: entry, chain: [path.relative(root, entry).replaceAll("\\", "/")] },
  ];
  const seen = new Set<string>();
  const findings: string[][] = [];
  while (queue.length) {
    const current = queue.pop()!;
    if (seen.has(current.file)) continue;
    seen.add(current.file);
    const relative = path.relative(root, current.file).replaceAll("\\", "/");
    if (relative.startsWith("lib/mock/")) {
      findings.push(current.chain);
      continue;
    }
    for (const specifier of staticImports(current.file)) {
      const resolved = resolveImport(current.file, specifier);
      if (resolved) {
        queue.push({
          file: resolved,
          chain: [
            ...current.chain,
            path.relative(root, resolved).replaceAll("\\", "/"),
          ],
        });
      }
    }
  }
  return findings;
}

const entries: Array<{ route: string; file: string }> = [
  { route: "<root-layout>", file: path.join(root, "app", "layout.tsx") },
  { route: "<middleware>", file: path.join(root, "middleware.ts") },
];

for (const file of walk(path.join(root, "app"))) {
  if (file.endsWith(`${path.sep}page.tsx`)) {
    const route = routeFor(file, "page.tsx");
    if (!isFixtureOnlyPath(route)) entries.push({ route, file });
  }
  if (file.endsWith(`${path.sep}route.ts`)) {
    const route = routeFor(file, "route.ts");
    if (!isFixtureOnlyApiPath(route)) entries.push({ route, file });
  }
}

const failures = entries.flatMap(({ route, file }) =>
  fixtureChains(file).map((chain) => ({ route, chain })),
);

if (failures.length) {
  console.error(
    `PRODUCTION SURFACE AUDIT FAILED: ${failures.length} fixture import chain(s) are reachable.`,
  );
  for (const failure of failures) {
    console.error(`\n${failure.route}\n  ${failure.chain.join("\n  -> ")}`);
  }
  process.exit(1);
}

console.log(
  `PRODUCTION SURFACE AUDIT PASS: ${entries.length} active route and shell entries have no static runtime import of lib/mock/*.`,
);
