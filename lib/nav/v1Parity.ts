/**
 * V1 PARITY — so nobody has to relearn anything.
 *
 * Paul Kennard set the requirement on the 2026-07-21 sync:
 *
 *   "It's V2 underneath with similar enough skinning that we're not asking the
 *    people who have learned stuff in the last two weeks to have to relearn
 *    anything in a new way."
 *
 * Coaches have been living in Alpha OS V1 (portal.goalphahealth.com) for weeks.
 * They know where Clients is. They know the button is called New Order. Apex
 * built the same surfaces and gave several of them different names — "My
 * members", "Place an order", "Stock & vendors", "Morning", "Audit trail" — all
 * arguably better, and all of them a tax on somebody who already learned the
 * other word.
 *
 * This module removes that tax two ways:
 *
 *   1. VOCABULARY. `V1_LABELS` maps an Apex route to the word V1 uses for it,
 *      taken verbatim from V1's `lib/nav.ts`. Applied when the release preset
 *      is `clinic-v1`; the full product keeps Apex's own naming.
 *   2. LOOK. The skin itself — see app/globals.css. V1 is a LIGHT application
 *      with a DARK SIDEBAR RAIL; Apex is dark throughout. That difference reads
 *      as "new system" before a single label is examined, and it is the first
 *      thing anyone notices.
 *
 * ── ROUTES ARE NOT COPIED ──────────────────────────────────────────────────
 * Apex keeps its own URLs. Renaming directories to match a system being retired
 * would bake V1's information architecture into V2 permanently, and V1's IA is
 * one of the things V2 exists to improve. This is a skin, not a port.
 *
 * It also does not invent parity that does not exist. Where V1 has a surface
 * Apex genuinely lacks — Point of Sale, FutureMe Studio — that gap is listed in
 * `V1_SURFACES_APEX_LACKS` so it is countable before the cutover rather than
 * discovered during training.
 */

/**
 * Apex route → the label V1 uses.
 *
 * Only entries where the two differ. Where Apex and V1 already agree ("Today",
 * "Orders", "Documents", "Tasks", "Pipeline", "Capacity", "Settings") there is
 * nothing to map.
 */
export const V1_LABELS: Record<string, string> = {
  // ── Coach ────────────────────────────────────────────────────────────────
  "/coach/roster": "Clients",
  "/coach/order": "New Order",
  "/coach/training": "Quizzes",
  "/supply-chain": "Inventory",
  "/schedule": "Calendar",
  "/coach/handoff": "Handoff",

  // ── Clinic / provider ────────────────────────────────────────────────────
  "/clients": "Clients",
  "/clinic/sign": "Lab Review",
  "/clinic/ledger": "Audit Log",
  "/desk": "Front Desk",

  // ── Exec ─────────────────────────────────────────────────────────────────
  "/exec": "KPI Dashboard",
  "/analytics": "Revenue",
  "/coach/subscriptions": "Memberships",
  "/admin/effectiveness": "Outcomes",
  "/admin/roster": "Coaches",
  "/admin/daily-report": "Reports",
  "/exec/marketing": "Marketing",

  // ── Member portal ────────────────────────────────────────────────────────
  // V1 keeps the patient sidebar to five destinations on purpose — its own nav
  // says so ("deliberately just 5 primary destinations for non-technical clinic
  // patients"). Apex's member nav is much broader; the labels at least match.
  "/portal": "Home",
  "/portal/book-visit": "Appointments",
  "/portal/progress": "My Health",
  "/portal/explore": "Shop",
  "/portal/protocol": "Medications",
};

/**
 * V1 surfaces Apex has no equivalent for.
 *
 * Kept as data rather than as a gap someone rediscovers during training. Each
 * of these is a screen a coach uses today and will look for on 7 August, so
 * each is either a build item or a conversation — but it should not be a
 * surprise on the morning of the cutover.
 */
export const V1_SURFACES_APEX_LACKS = [
  { v1: "/coach/pos", label: "Point of Sale", note: "In-clinic card-present checkout. Needs the Clover work (T22)." },
  { v1: "/coach/futureme", label: "FutureMe Studio", note: "Photo-based projection. No Apex equivalent; likely a deliberate cut." },
  { v1: "/coach/shipments", label: "Shipments", note: "Aliased to Orders. Apex tracks shipment state inside the order, not as its own board." },
  { v1: "/clinic/poc", label: "Plan of Care builder", note: "Aliased to Consults. The robust builder is explicitly deferred past V2." },
  { v1: "/admin/promotions", label: "Promotions", note: "Aliased to Marketing. Discount/promo engine is not built." },
] as const;

/** The label to show for a route, given the active preset. */
export function labelFor(href: string, apexLabel: string, preset: string): string {
  if (preset !== "clinic-v1") return apexLabel;
  return V1_LABELS[href] ?? apexLabel;
}
