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
 * The three seats the owner can sit in.
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
];

export function personaFor(portal: PortalId): Persona {
  return PERSONAS.find((p) => p.id === portal) ?? PERSONAS[2];
}
