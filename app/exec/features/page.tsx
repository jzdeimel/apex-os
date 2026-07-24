import { notFound } from "next/navigation";

import { currentPrincipal } from "@/lib/auth/principal";
import { actorFromPrincipal } from "@/lib/auth/actor";
import { can } from "@/lib/authz/capabilities";
import { flagAdminView } from "@/lib/features/server";
import { FEATURES, PRESETS, featureDef } from "@/lib/features/catalog";
import { explainFeature } from "@/lib/features/evaluate";
import { FeatureToggles } from "@/app/exec/features/FeatureToggles";

export const dynamic = "force-dynamic";

/**
 * Owner console — feature switches.
 *
 * A SERVER COMPONENT ON PURPOSE. The list of what a clinic has switched off is
 * itself operational information, and the authority check that decides who may
 * see it runs here, before any of it reaches a browser. The interactive part is
 * a small client island underneath (`FeatureToggles`); everything above it —
 * resolution, explanation, who decided — is computed server-side.
 *
 * This is the surface behind the promise made on the 2026-07-21 sync: "turn
 * features on and off at will for coaches and clients, and you don't have to do
 * anything in Azure."
 */
export default async function FeaturesPage() {
  const principal = await currentPrincipal();
  const actor = principal ? actorFromPrincipal(principal) : null;
  // 404 rather than 403 — see lib/features/gate.tsx on why a refusal should not
  // confirm what exists.
  if (!actor || !can(actor, "admin:roles").allowed) notFound();

  const { preset, overrides } = await flagAdminView();

  // Resolved for the OWNER'S own subject, which is what the toggle shows. The
  // explanation underneath names the scope that decided, so an owner who sees
  // "on" while a coach sees "off" can find out why without guessing.
  const subject = {
    role: principal!.role,
    locationIds: principal!.locationIds,
    staffId: principal!.staffId,
  };

  const rows = FEATURES.map((f) => ({
    def: f,
    explanation: explainFeature(f.key, overrides, subject, preset),
    /** Overrides at any scope, not just the ones matching this viewer. */
    allOverrides: overrides.filter((o) => o.key === f.key),
  }));

  const byPortal = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = row.def.portals[0] ?? "other";
    if (!byPortal.has(group)) byPortal.set(group, []);
    byPortal.get(group)!.push(row);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-50">
          Features
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-300">
          What this clinic can see and do. Changes take effect on the next page
          load — no deploy, no Azure. Every change is written to the audit trail
          with your name on it.
        </p>

        <div className="mt-4 rounded-lg border border-gold-400/30 bg-gold-400/5 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-gold-300">
            Global controls
          </div>
          <p className="mt-1 text-sm leading-relaxed text-ink-200">
            Every switch below turns that feature on or off for everyone in the
            clinic. Only Admins can change these switches. Scoped pilot rules
            can still make a narrower exception for a role, location, staff
            member or patient.
          </p>
        </div>

        <div className="mt-4 rounded-lg border border-ink-700/60 bg-ink-900/40 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-ink-400">
            Release preset
          </div>
          <div className="mt-1 font-medium text-ink-100">{PRESETS[preset].label}</div>
          <p className="mt-1 text-sm text-ink-400">{PRESETS[preset].description}</p>
          <p className="mt-3 text-xs leading-relaxed text-ink-500">
            The preset ships with the build and changes at a release, not from
            this screen — so rolling back the image rolls back the posture. The
            switches below override it per role, location, staff member or
            patient.
          </p>
        </div>
      </header>

      {[...byPortal.entries()].map(([portal, group]) => (
        <section key={portal} className="mb-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">
            {portal}
          </h2>
          <FeatureToggles
            rows={group.map((r) => ({
              key: r.def.key,
              availableInShared: r.def.availableInShared !== false,
              unavailableReason: r.def.unavailableReason,
              label: r.def.label,
              description: r.def.description,
              caution: r.def.caution,
              routes: [...r.def.routes],
              enabled: r.explanation.enabled,
              decidedBy: r.explanation.decidedBy,
              decidedByTarget: r.explanation.decidedByTarget,
              overrideCount: r.allOverrides.length,
              presetDefault: featureDef(r.def.key).defaults[preset],
            }))}
          />
        </section>
      ))}
    </div>
  );
}
