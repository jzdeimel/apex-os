import { cache } from "react";
import { isConfigured } from "@/lib/db/client";
import { listFeatureFlags } from "@/lib/db/repo";
import { currentPrincipal } from "@/lib/auth/principal";
import { FEATURE_PRESET } from "@/lib/config";
import {
  evaluateFeatures,
  explainFeature,
  type FeatureSubject,
  type FlagRow,
  type FlagScope,
} from "@/lib/features/evaluate";
import {
  presetDefaults,
  type FeatureKey,
  type PresetId,
} from "@/lib/features/catalog";

/**
 * Feature resolution against the real world. SERVER ONLY.
 *
 * `lib/features/evaluate.ts` holds the decision; this file supplies it with
 * rows, a subject and a preset. The split exists so the rule that decides what
 * a clinic can see is testable without a database.
 *
 * ── WHAT HAPPENS WITH NO DATABASE ──────────────────────────────────────────
 * The preset defaults, and nothing else. This is the one place in the codebase
 * that degrades quietly rather than throwing, and the reason is that the
 * failure mode points the safe way: with no overrides, `clinic-v1` resolves to
 * the smallest surface Apex has. A missing database makes the product *less*
 * exposed, not more.
 *
 * Contrast lib/db/client.ts, which refuses outright — because a WRITE that
 * silently does nothing is a lie about the record. A READ that falls back to a
 * conservative default is not.
 *
 * ── CACHED PER REQUEST ─────────────────────────────────────────────────────
 * `cache()` is React's request-scoped memo, not a TTL cache. Every gate, every
 * nav render and every page in one request shares a single SELECT, and the next
 * request sees the flag change immediately. A time-based cache would mean an
 * owner flipping a switch and watching nothing happen for N seconds, which is
 * how someone ends up flipping it four more times.
 */

/** Read every override once per request. Empty when there is no database. */
const loadRows = cache(async (): Promise<FlagRow[]> => {
  if (!isConfigured) return [];
  try {
    const rows = await listFeatureFlags();
    return rows.map((r) => ({
      key: r.key,
      scope: r.scope as FlagScope,
      targetId: r.targetId,
      enabled: r.enabled,
    }));
  } catch {
    // Deliberately swallowed. A flag read failing must not take down a clinical
    // page — the preset defaults are a coherent, conservative posture and the
    // health endpoint already reports database trouble honestly. Rethrowing
    // here would convert a config-store hiccup into an outage of the chart.
    return [];
  }
});

export function activePreset(): PresetId {
  return FEATURE_PRESET;
}

/**
 * The subject for the signed-in staff member.
 *
 * An unmapped or absent principal yields an empty subject, which matches no
 * scoped rows and therefore resolves to global + preset. That is correct: a
 * request with no identity gets the least specific, most conservative answer.
 */
const currentSubject = cache(async (): Promise<FeatureSubject> => {
  const principal = await currentPrincipal();
  if (!principal) return {};
  return {
    role: principal.role,
    locationIds: principal.locationIds,
    staffId: principal.staffId,
  };
});

/** Every feature, resolved for the signed-in staff member. */
export const featuresForCurrentUser = cache(
  async (): Promise<Record<FeatureKey, boolean>> => {
    const [rows, subject] = await Promise.all([loadRows(), currentSubject()]);
    return evaluateFeatures(rows, subject, activePreset());
  },
);

/** One feature, resolved for the signed-in staff member. */
export async function isFeatureEnabled(key: FeatureKey): Promise<boolean> {
  return (await featuresForCurrentUser())[key];
}

/**
 * Resolve for an explicit subject rather than the session.
 *
 * Needed wherever the answer is about someone who is not the caller: "is the
 * portal on for THIS member" is asked by staff, and the member-facing pilot
 * gate is asked by a request that has no staff principal at all.
 */
export async function featuresFor(
  subject: FeatureSubject,
): Promise<Record<FeatureKey, boolean>> {
  const rows = await loadRows();
  return evaluateFeatures(rows, subject, activePreset());
}

export async function isFeatureEnabledFor(
  key: FeatureKey,
  subject: FeatureSubject,
): Promise<boolean> {
  return (await featuresFor(subject))[key];
}

/** Why a feature resolved the way it did, for the owner console. */
export async function explain(key: FeatureKey, subject: FeatureSubject) {
  const rows = await loadRows();
  return explainFeature(key, rows, subject, activePreset());
}

/**
 * Every override, with the preset baseline alongside it.
 *
 * The owner console needs both: the toggle shows the resolved value, and the
 * row underneath has to be able to say "this is an override" versus "this is
 * what the release ships with", because clearing and setting are different
 * operations with different consequences at the next release.
 */
export async function flagAdminView(): Promise<{
  preset: PresetId;
  defaults: Record<FeatureKey, boolean>;
  overrides: FlagRow[];
}> {
  const preset = activePreset();
  return {
    preset,
    defaults: presetDefaults(preset),
    overrides: await loadRows(),
  };
}
