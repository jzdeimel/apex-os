/**
 * The single switch that separates "a demo of Apex" from "the system running a
 * clinic".
 *
 * WHY ONE SWITCH. Apex grew as a demo, so demo affordances are scattered
 * through it: a seeded staff roster that can stand in for real identity, a
 * member switcher that lets the portal act as any patient, seeded intake links,
 * a persona picker that changes what you are allowed to do. Each was reasonable
 * on its own and collectively they are a way to walk around the authorization
 * model. Gating them behind separate ad-hoc checks guarantees one gets missed.
 *
 * FAILS SAFE. Demo behaviour is only ever enabled by an EXPLICIT opt-in. An
 * unset, misspelt or empty variable means production rules, because the failure
 * we can afford is "the demo is less convenient", not "the clinic is less safe".
 *
 * Set APEX_DEMO_MODE=true (or NEXT_PUBLIC_APEX_DEMO_MODE=true for values the
 * browser needs) to turn demo behaviour on.
 */

function truthy(v: string | undefined): boolean {
  return v === "true" || v === "1";
}

/**
 * Server-side demo flag. Never trust this on the client — client code cannot
 * see APEX_DEMO_MODE at all, which is deliberate: a browser must not be able to
 * observe or influence whether the server relaxes its rules.
 */
export const IS_DEMO = truthy(process.env.APEX_DEMO_MODE);

/**
 * The browser-visible flag, for demo-only UI (the member switcher, the persona
 * picker, seeded links). Separate variable because `NEXT_PUBLIC_*` is inlined
 * into the client bundle and the server flag must not be.
 */
export const IS_DEMO_UI = truthy(process.env.NEXT_PUBLIC_APEX_DEMO_MODE);

/**
 * True when Apex must behave as a system of record: no seeded identity
 * fallback, no acting-as-another-patient, no demo links.
 */
export const IS_PRODUCTION_BEHAVIOUR = !IS_DEMO;

/**
 * Which release preset the feature registry starts from.
 *
 * WHY AN ENVIRONMENT VARIABLE AND NOT A DATABASE ROW
 * --------------------------------------------------
 * Per-feature overrides are administration and belong in Postgres, where an
 * owner can change them without a deploy — that is the whole point of
 * `feature_flag`. The PRESET is a different kind of thing: it is which product
 * this deployment is, and it changes exactly once, at a release boundary, as a
 * deliberate act with a rollback. Binding it to the image means a rollback of
 * the image is a rollback of the posture, which is the behaviour you want at
 * 6am on Aug 7.
 *
 * Unknown or unset resolves to `clinic-v1` — the smaller surface. An
 * environment typo must not silently ship the full product to a clinic.
 */
export const FEATURE_PRESET: "clinic-v1" | "full" =
  process.env.APEX_FEATURE_PRESET === "full" ? "full" : "clinic-v1";
