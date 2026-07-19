/**
 * Apex runs three distinct portals over one system of record.
 *
 * Each portal is a full experience with its own identity class, navigation,
 * accent and home route — not a role flag on a single console. The accent is
 * threaded into the shell (sidebar rail, topbar hairline, focus glow) so a
 * viewer always knows which surface they are standing in.
 *
 * Portal accents are deliberately NOT the clinical status colors: a portal
 * accent must never be confused with an `optimal | watch | low | high` reading.
 */

export type PortalId = "patient" | "clinic" | "coach";

/** Who signs in, and how. Mirrors the production identity plan. */
export interface PortalIdentity {
  /** Human label for the login method shown on the picker. */
  method: string;
  /** Short note on session policy, rendered on the picker card. */
  session: string;
}

export interface PortalDef {
  id: PortalId;
  /** Product-facing name. */
  label: string;
  /** Who this portal is for, one line. */
  persona: string;
  /** Marketing-grade one-liner used on the entry screen. */
  tagline: string;
  /** Route a session lands on after choosing this portal. */
  home: string;
  /**
   * Route prefixes owned exclusively by this portal.
   *
   * Deliberately narrow. Operator routes shared by clinic and coach
   * (/clients, /tasks, /insights…) are intentionally left UNOWNED so they
   * inherit whichever portal the session chose — a coach visiting /clients
   * keeps coach chrome, a provider keeps clinic chrome, and neither has to
   * have the page duplicated.
   */
  prefixes: string[];
  identity: PortalIdentity;
  /** Tailwind-ready accent tokens. `hex` drives SVG/canvas work. */
  accent: {
    hex: string;
    /** e.g. "text-optimal" */
    text: string;
    /** e.g. "bg-optimal" */
    bg: string;
    /** e.g. "border-optimal/30" */
    border: string;
    /** Soft translucent fill for chips/wash. */
    soft: string;
    /** Gradient stops for hero washes. */
    gradient: string;
  };
}

export const PORTALS: Record<PortalId, PortalDef> = {
  patient: {
    id: "patient",
    label: "Client Portal",
    persona: "Members",
    tagline: "Your protocol, your labs, your progress — and a full record of who has looked at it.",
    home: "/portal",
    prefixes: ["/portal"],
    identity: {
      method: "Passkey or magic link",
      session: "30-day rolling · device-bound",
    },
    accent: {
      hex: "#34d399",
      text: "text-optimal",
      bg: "bg-optimal",
      border: "border-optimal/30",
      soft: "bg-optimal/12",
      gradient: "from-optimal/20 via-optimal/5 to-transparent",
    },
  },
  clinic: {
    id: "clinic",
    label: "Medical Console",
    persona: "Providers & clinicians",
    tagline: "Charting, labs, prescribing and sign-off — every action provenance-stamped.",
    home: "/clinic",
    prefixes: ["/clinic"],
    identity: {
      method: "Entra ID · MFA required",
      session: "8-hour · re-auth to sign",
    },
    accent: {
      hex: "#e93d3d",
      text: "text-gold-400",
      bg: "bg-gold-500",
      border: "border-gold-400/30",
      soft: "bg-gold-400/12",
      gradient: "from-gold-500/20 via-gold-500/5 to-transparent",
    },
  },
  coach: {
    id: "coach",
    label: "Coach Console",
    persona: "Health coaches & front desk",
    tagline: "Your roster, today's queue, and the next best action for every member.",
    home: "/coach",
    prefixes: ["/coach"],
    identity: {
      method: "Google Workspace · domain-locked",
      session: "8-hour · least-privilege",
    },
    accent: {
      hex: "#e0bd6e",
      text: "text-watch",
      bg: "bg-watch",
      border: "border-watch/30",
      soft: "bg-watch/12",
      gradient: "from-watch/20 via-watch/5 to-transparent",
    },
  },
};

export const PORTAL_ORDER: PortalId[] = ["patient", "clinic", "coach"];

/** Ordered list for rendering the picker. */
export const PORTAL_LIST: PortalDef[] = PORTAL_ORDER.map((id) => PORTALS[id]);

/**
 * Resolve which portal a pathname belongs to.
 *
 * Longest-prefix wins so `/clinic/chart` can't be claimed by a shorter
 * registration. Returns null on unowned routes (the entry screen, settings).
 */
export function portalForPath(pathname: string): PortalDef | null {
  let best: { def: PortalDef; len: number } | null = null;
  for (const def of PORTAL_LIST) {
    for (const prefix of def.prefixes) {
      const owns = pathname === prefix || pathname.startsWith(prefix + "/");
      if (owns && (!best || prefix.length > best.len)) {
        best = { def, len: prefix.length };
      }
    }
  }
  return best?.def ?? null;
}

export function isPortalId(v: unknown): v is PortalId {
  return typeof v === "string" && v in PORTALS;
}
