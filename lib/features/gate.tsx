import { notFound } from "next/navigation";
import { isFeatureEnabled } from "@/lib/features/server";
import type { FeatureKey } from "@/lib/features/catalog";

/**
 * The server-side route gate.
 *
 * WHY THIS IS NOT NAVIGATION FILTERING
 * ------------------------------------
 * Hiding a link is not disabling a feature. The audited system's entire
 * authorization model was client-side — `role === "Medical"` read from a React
 * state value the user could edit in devtools (lib/auth/principal.ts explains
 * the whole sorry thing) — and a flag system that only filtered `lib/nav.ts`
 * would repeat that mistake in a new place. Anyone who typed the URL, kept a
 * bookmark, or followed a link from an email would walk straight into a surface
 * the owner had switched off.
 *
 * So every routed feature gets a `layout.tsx` that calls this. The check runs on
 * the server, before the page's client bundle is reached.
 *
 * 404, NOT 403
 * ------------
 * A disabled feature answers "there is nothing here", not "there is something
 * here you may not have". 403 confirms the surface exists, which is information
 * the clinic did not choose to publish — and for `community` or `emergency-card`
 * the existence of the surface is itself a statement about how the clinic
 * operates.
 *
 * WHY A FACTORY
 * -------------
 * 64 of 75 pages in this app are client components, so the gate cannot live in
 * the page. A layout can be a server component regardless of what it wraps,
 * which makes a two-line `layout.tsx` per gated route the smallest correct
 * enforcement point:
 *
 *     // app/community/layout.tsx
 *     import { featureLayout } from "@/lib/features/gate";
 *     export default featureLayout("community");
 *
 * Keep it that shape. A gate that is easy to add is a gate people add.
 */
export function featureLayout(key: FeatureKey) {
  return async function FeatureGatedLayout({
    children,
  }: {
    children: React.ReactNode;
  }) {
    if (!(await isFeatureEnabled(key))) notFound();
    return <>{children}</>;
  };
}

/**
 * Gate on a feature resolved for a MEMBER rather than the caller.
 *
 * The member portal pilot is the reason this exists: `member-portal` is global
 * off and enabled per client, so the question is never "is it on for the staff
 * member looking at this" but "is it on for whoever this record belongs to".
 */
export function memberFeatureLayout(
  key: FeatureKey,
  resolveClientId: () => Promise<string | null>,
) {
  return async function MemberFeatureGatedLayout({
    children,
  }: {
    children: React.ReactNode;
  }) {
    const clientId = await resolveClientId();
    const { isFeatureEnabledFor } = await import("@/lib/features/server");
    if (!(await isFeatureEnabledFor(key, { clientId }))) notFound();
    return <>{children}</>;
  };
}

/**
 * Assert a feature inside an API route.
 *
 * Routes have no layout to hang a gate on, and an endpoint that keeps writing
 * after its surface is switched off is the same bug as a hidden-but-live page.
 * Returns null when permitted so a caller reads as:
 *
 *     const blocked = await featureBlocked("community");
 *     if (blocked) return blocked;
 */
export async function featureBlocked(key: FeatureKey) {
  if (await isFeatureEnabled(key)) return null;
  const { NextResponse } = await import("next/server");
  return NextResponse.json(
    { ok: false, error: "This feature is not enabled for this clinic." },
    { status: 404 },
  );
}
