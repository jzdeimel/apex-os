import type { StaffRole } from "@/lib/types";
import type { PortalId } from "@/lib/portals";

/**
 * Who is signed in, and whether they may look through someone else's eyes.
 *
 * Exactly one account carries `canSwitchPersona` — the owner's. Everyone else
 * is locked to the surface their role belongs to, which is the behaviour the
 * real product needs: in the audited system a role switcher was visible to
 * every user, which meant a coach could put themselves in a clinician's view.
 *
 * The switcher is a VIEW control, not a permissions control. Assuming a persona
 * changes which portal renders; it does not grant a capability the owner does
 * not already hold, and every action taken while switched still records the
 * real signed-in account as the actor (see lib/authz/capabilities.ts, and the
 * `viewerId` threading in components/orders/OrderCard.tsx for why that matters).
 */

export interface ViewerAccount {
  id: string;
  name: string;
  email: string;
  initials: string;
  role: StaffRole;
  /** Owner-only. Gates the persona switcher. */
  canSwitchPersona: boolean;
}

/** The signed-in account for this demo build. */
export const VIEWER: ViewerAccount = {
  id: "st-owner",
  name: "Zack Deimel",
  email: "zack@goalphahealth.com",
  initials: "ZD",
  role: "Admin",
  canSwitchPersona: true,
};

export interface Persona {
  id: PortalId;
  /** What the switcher calls it. */
  label: string;
  /** Who this persona is, one line. */
  who: string;
  /** The staff or client record the view is rendered as. */
  asId: string;
  asName: string;
  asDetail: string;
  /** Where entering this persona lands you. */
  home: string;
}

/**
 * The four seats the owner can sit in.
 *
 * Each names a real record in the demo dataset so the surfaces render populated
 * — an owner previewing "Coach" with nobody's roster attached would learn
 * nothing about whether the coach experience works.
 */
export const PERSONAS: Persona[] = [
  {
    id: "patient",
    label: "Member",
    who: "What a client sees",
    asId: "c-001",
    asName: "Jake Morrison",
    asDetail: "Raleigh · Alpha Elite · week 12",
    home: "/portal",
  },
  {
    id: "coach",
    label: "Coach",
    who: "What a coach sees",
    asId: "st-005",
    asName: "Tyler Brooks",
    asDetail: "Raleigh · 41 members",
    home: "/coach",
  },
  {
    id: "clinic",
    label: "Medical",
    who: "What a clinician sees",
    asId: "st-001",
    asName: "Dr. Marcus Vale",
    asDetail: "Medical director · MD",
    home: "/clinic",
  },
  /**
   * The front desk.
   *
   * Rendered as Hannah Whitfield — the Admin actually rostered at Raleigh in
   * lib/mock/staff.ts, which is also who `deskStaffFor("raleigh")` resolves to,
   * so the person in the seat and the actor on every ledger row the desk writes
   * are the same human. Apex has no `Front Desk` staff role to name (GAP_ANALYSIS,
   * OWNERSHIP/ADMIN, "Staff roles" — three roles for a job that needs nine), so
   * the detail line says Admin, because that is what the record says.
   */
  {
    id: "desk",
    label: "Front Desk",
    who: "What reception sees",
    asId: "st-009",
    asName: "Hannah Whitfield",
    asDetail: "Patient experience, Raleigh · Admin",
    home: "/desk",
  },
  /**
   * The owner — and the one entry in this list that is not a disguise.
   *
   * Every other seat here answers "what does someone else see", and the switcher
   * exists so the owner can check that those surfaces work. This one renders the
   * owner as himself: `asId` is VIEWER.id, so the account in the seat and the
   * account signed in are the same record, and nothing is being assumed.
   *
   * It is listed anyway rather than left out. `personaFor()` falls back to
   * PERSONAS[2] — Medical — for any portal with no entry, so omitting this would
   * have left the topbar reading "viewing as Medical" while the owner console was
   * on screen. A false identity label on the one console that renders clinic-wide
   * financials is exactly the class of small, plausible untruth this whole audit
   * was about.
   */
  {
    id: "exec",
    label: "Owner",
    who: "Your own seat — not a persona",
    asId: VIEWER.id,
    asName: VIEWER.name,
    asDetail: "Ownership · all locations",
    home: "/exec",
  },
];

export function personaFor(portal: PortalId): Persona {
  return PERSONAS.find((p) => p.id === portal) ?? PERSONAS[2];
}

// ---------------------------------------------------------------------------
// Demo member roster — which chart the Member seat renders
// ---------------------------------------------------------------------------

/**
 * DEMO AFFORDANCE. Same class of thing as the guided tour and the persona
 * switcher above it: a control that exists so a demo can be driven, not a
 * production feature. In the real product the portal's subject is the session's
 * own identity and there is nothing to pick.
 *
 * Why it exists at all: the audit (docs/audit/GAP_ANALYSIS.md, CLIENT table,
 * "Portal renderable as a woman", P0) found the member portal hard-wired to
 * `ME = "c-001"` — Jake Morrison, male, 41 — with ~50 call sites. Meanwhile the
 * women's track was fully built and completely unreachable: female reference
 * windows on five markers (lib/mock/labs.ts:19-32), a genuine perimenopause /
 * female-testosterone / SHBG shelf in the education library gated by
 * `articlesForSex` (lib/education/library.ts:573), and the male/female care-track
 * picker in lib/brand.ts:115. Alpha Health treats men AND women and is growing
 * the women's HRT line, so a demo that can only ever be a man's chart
 * misrepresents half the business. Every one of those code paths is exercised
 * the moment the subject id is allowed to change; none of them needed new logic.
 *
 * Only ids that are worth showing belong here. Each entry names a seeded client
 * with a lab panel on file, because a portal whose Labs page is empty teaches
 * the viewer the wrong thing about the product. Names, ages and programmes are
 * NOT copied into this list — they are resolved from lib/mock/clients at render
 * time, so this roster cannot drift away from the seed the way a duplicated
 * label would.
 */
export interface DemoMember {
  /** Client id in lib/mock/clients. */
  id: string;
  /** Why this chart is worth switching to — shown in the picker. */
  why: string;
}

export const DEMO_MEMBERS: DemoMember[] = [
  // The default. Every ~50 call site resolved to this before the fix, and it
  // stays first so the demo opens exactly where it always did.
  { id: "c-001", why: "Men's metabolic track — the default chart" },
  // The point of the whole exercise: a woman's panel renders against the FEMALE
  // reference windows and the education shelf switches to the women's track.
  { id: "c-014", why: "Women's track — female lab ranges, active protocol" },
  // Perimenopausal band. The library's perimenopause and women's-hormone-panel
  // articles only surface for a female member in this age range.
  { id: "c-016", why: "Women's track — perimenopause band, plan in review" },
  // Women on the hormone programme now exist in the seed (c-006/008/010/016
  // were enrolled with menopause lab patterns), so c-016 above is both female and
  // on Hormone Optimization — it drives the Women's Health / HRT panel and the
  // menopause tracker. This one keeps the men's HRT programme reachable too.
  { id: "c-011", why: "Hormone Optimization programme — men's HRT" },
  // Recovery & Performance track — drives the recovery readiness panel.
  { id: "c-007", why: "Recovery & Performance track — recovery readiness + peptides" },
];

export function isDemoMemberId(id: string | null | undefined): id is string {
  return !!id && DEMO_MEMBERS.some((m) => m.id === id);
}
