import {
  FEATURES,
  presetDefaults,
  type FeatureKey,
  type PresetId,
} from "@/lib/features/catalog";

/**
 * Flag resolution. PURE — no database, no request, no clock.
 *
 * Everything that touches IO lives in lib/features/server.ts. This file is the
 * decision, which is the part that has to be right, and keeping it free of IO
 * is what makes it exercisable without a Postgres.
 *
 * ── SPECIFICITY ORDER ──────────────────────────────────────────────────────
 * A feature can be set at five scopes. The most specific row that matches the
 * subject wins:
 *
 *      staff  >  client  >  location  >  role  >  global  >  preset default
 *
 * That order is not arbitrary. It reads as "a decision about one person beats a
 * decision about a group", which is how an owner actually thinks about this:
 * the Aug 7 pilot is *global off, on for these ten clients*, and the coach
 * preview is *on for these staff*. If group beat individual, neither would be
 * expressible.
 *
 * ── OFF IS NOT SPECIAL ─────────────────────────────────────────────────────
 * A more specific ON overrides a broader OFF, and a more specific OFF overrides
 * a broader ON. There is no "any off wins" short-circuit, because that would
 * make the pilot impossible to express: global-off would be unbeatable and the
 * ten pilot clients could never be turned on.
 *
 * The cost of that choice is that a global kill switch is not absolute — a
 * per-client row still wins. Where a real kill switch is needed, delete the
 * narrower rows; `clearFeature` exists for exactly that and the owner console
 * says so.
 *
 * ── AMBIGUITY IS RESOLVED, NEVER GUESSED ───────────────────────────────────
 * A staff member covering three locations can match three location rows that
 * disagree. Plan order must not decide clinical or commercial behaviour — the
 * `staff_oid_idx` comment in lib/db/schema.ts makes the same argument about
 * identity. So same-scope conflicts resolve to the SAFER value, which is the
 * one that grants less: if any matching location row says off, the location
 * scope evaluates to off. Deterministic, and it fails toward less exposure.
 */

export type FlagScope = "global" | "role" | "location" | "staff" | "client";

export interface FlagRow {
  key: string;
  scope: FlagScope;
  /** Null for global. The role name, location id, staff id or client id otherwise. */
  targetId: string | null;
  enabled: boolean;
}

/**
 * Who we are deciding for.
 *
 * Every field is optional because the same evaluator answers questions about a
 * signed-in staff member, about a member portal session, and about nobody at
 * all (an unauthenticated public route still needs to know whether a feature
 * exists). A field that is absent simply matches no rows at that scope.
 */
export interface FeatureSubject {
  role?: string | null;
  locationIds?: readonly string[];
  staffId?: string | null;
  clientId?: string | null;
}

/** Specificity, ascending. Index in this array is the precedence rank. */
const SCOPE_RANK: Record<FlagScope, number> = {
  global: 0,
  role: 1,
  location: 2,
  client: 3,
  staff: 4,
};

function matches(row: FlagRow, subject: FeatureSubject): boolean {
  switch (row.scope) {
    case "global":
      return true;
    case "role":
      return !!subject.role && row.targetId === subject.role;
    case "location":
      return !!row.targetId && (subject.locationIds ?? []).includes(row.targetId);
    case "staff":
      return !!subject.staffId && row.targetId === subject.staffId;
    case "client":
      return !!subject.clientId && row.targetId === subject.clientId;
  }
}

/**
 * Resolve every feature for one subject.
 *
 * Returns a complete map — every key in the registry is present. Callers never
 * have to distinguish "false" from "absent", which is the distinction that
 * produces the silent-exposure bug described in the catalog docblock.
 */
export function evaluateFeatures(
  rows: readonly FlagRow[],
  subject: FeatureSubject,
  preset: PresetId,
): Record<FeatureKey, boolean> {
  const out = presetDefaults(preset);

  // Highest specificity rank seen per key, so a later low-rank row cannot
  // overwrite an earlier high-rank decision regardless of row order.
  const winningRank: Partial<Record<string, number>> = {};

  for (const row of rows) {
    if (!(row.key in out)) continue; // retired or unknown key — see catalog docblock
    if (!matches(row, subject)) continue;

    const rank = SCOPE_RANK[row.scope];
    const current = winningRank[row.key];

    if (current === undefined || rank > current) {
      out[row.key as FeatureKey] = row.enabled;
      winningRank[row.key] = rank;
      continue;
    }

    // Same scope, conflicting rows (e.g. two locations the staff member
    // covers). Resolve to the value that grants less, never to plan order.
    if (rank === current && !row.enabled) {
      out[row.key as FeatureKey] = false;
    }
  }

  return out;
}

/** Single-key convenience. Same rules; use when only one answer is needed. */
export function evaluateFeature(
  key: FeatureKey,
  rows: readonly FlagRow[],
  subject: FeatureSubject,
  preset: PresetId,
): boolean {
  return evaluateFeatures(rows, subject, preset)[key];
}

/**
 * Explain a resolution — which scope decided, and what it beat.
 *
 * The owner console renders this. "Community is off" invites the question "off
 * for whom, and who turned it off"; a toggle list that cannot answer that is
 * how a flag gets flipped twice and nobody knows which setting is live.
 */
export interface FeatureExplanation {
  key: FeatureKey;
  enabled: boolean;
  decidedBy: FlagScope | "preset";
  decidedByTarget: string | null;
  /** Rows that matched but lost to something more specific. */
  overridden: FlagRow[];
}

export function explainFeature(
  key: FeatureKey,
  rows: readonly FlagRow[],
  subject: FeatureSubject,
  preset: PresetId,
): FeatureExplanation {
  const matched = rows.filter((r) => r.key === key && matches(r, subject));
  if (matched.length === 0) {
    return {
      key,
      enabled: presetDefaults(preset)[key],
      decidedBy: "preset",
      decidedByTarget: preset,
      overridden: [],
    };
  }

  const topRank = Math.max(...matched.map((r) => SCOPE_RANK[r.scope]));
  const top = matched.filter((r) => SCOPE_RANK[r.scope] === topRank);
  // Same tie-break as the evaluator: any off at the winning scope wins.
  const winner = top.find((r) => !r.enabled) ?? top[0];

  return {
    key,
    enabled: winner.enabled,
    decidedBy: winner.scope,
    decidedByTarget: winner.targetId,
    overridden: matched.filter((r) => r !== winner),
  };
}

/** Every feature that owns at least one route. Used to build the gate map. */
export function routedFeatures(): FeatureKey[] {
  return FEATURES.filter((f) => f.routes.length > 0).map((f) => f.key);
}
