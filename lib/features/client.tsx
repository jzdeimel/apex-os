"use client";

import { createContext, useContext } from "react";
import { presetDefaults, DEFAULT_PRESET, type FeatureKey } from "@/lib/features/catalog";

/**
 * The resolved feature map, handed to the client tree.
 *
 * READ THIS BEFORE USING IT FOR ANYTHING THAT MATTERS
 * ---------------------------------------------------
 * This is a RENDERING HINT. It is not a permission, and it is not enforcement.
 * Everything here arrives in the browser, where the user can read it, and a
 * sufficiently motivated one can make React render whatever they like.
 *
 * Enforcement is `lib/features/gate.tsx`, server-side, per route. This context
 * exists so the navigation does not advertise a surface that would 404, and so
 * an inline affordance (a "share to community" button) can disappear along with
 * the feature that backs it.
 *
 * The distinction is the exact one the audit found this codebase getting wrong:
 * `lib/authz/capabilities.ts` was 276 lines of correct reasoning with zero
 * import sites while the real gate was a client-side role string. Use this to
 * make the UI honest; never use it to decide whether something is allowed.
 *
 * FALLBACK IS THE CONSERVATIVE PRESET, NOT "EVERYTHING ON"
 * -------------------------------------------------------
 * A component rendered outside the provider gets `clinic-v1` defaults rather
 * than an empty object read as all-false or a permissive all-true. Missing
 * context is a wiring bug, and the version of that bug that hides a working
 * button is much cheaper than the one that shows a disabled surface.
 */
export type FeatureMap = Record<FeatureKey, boolean>;

interface FeatureContextValue {
  features: FeatureMap;
  /**
   * The active release preset, carried alongside the flags because the nav
   * needs it to pick vocabulary — under `clinic-v1` the sidebar uses Alpha OS
   * V1's words so coaches are not relearning labels. See lib/nav/v1Parity.ts.
   */
  preset: string;
}

const FeatureContext = createContext<FeatureContextValue | null>(null);

export function FeatureProvider({
  value,
  preset,
  children,
}: {
  value: FeatureMap;
  preset: string;
  children: React.ReactNode;
}) {
  return (
    <FeatureContext.Provider value={{ features: value, preset }}>
      {children}
    </FeatureContext.Provider>
  );
}

export function useFeatures(): FeatureMap {
  return useContext(FeatureContext)?.features ?? presetDefaults(DEFAULT_PRESET);
}

/** The active release preset. Defaults conservatively, like the flags do. */
export function usePreset(): string {
  return useContext(FeatureContext)?.preset ?? DEFAULT_PRESET;
}

export function useFeature(key: FeatureKey): boolean {
  return useFeatures()[key];
}
