/**
 * Apex runs four distinct portals over one system of record.
 *
 * Each portal is a full experience with its own identity class, navigation,
 * accent and home route — not a role flag on a single console. The accent is
 * threaded into the shell (sidebar rail, topbar hairline, focus glow) so a
 * viewer always knows which surface they are standing in.
 *
 * Portal accents are deliberately NOT the clinical status colors: a portal
 * accent must never be confused with an `optimal | watch | low | high` reading.
 */

export type PortalId = "patient" | "clinic" | "coach" | "desk" | "exec";

/**
 * Who signs in, and how.
 *
 * SPLIT INTO LIVE AND PLANNED, DELIBERATELY.
 *
 * These fields previously held the production identity PLAN — "Passkey or magic
 * link", "Google Workspace · domain-locked", "Shared workstation · badge tap",
 * "MFA required", "re-auth to sign" — and the entry screen rendered them as
 * plain statements of fact. None of it existed. Five cards on the first screen
 * of the product made five specific security claims the code did not honour,
 * which is the exact failure this codebase keeps being audited for, on the worst
 * possible subject.
 *
 * The plan is worth keeping; presenting it as the present tense was not. So
 * `method` and `session` now describe WHAT ACTUALLY HAPPENS WHEN YOU CLICK
 * ENTER, and `planned` carries the intended production posture, which the UI
 * must render as a plan and never as a property.
 */
export interface PortalIdentity {
  /** What actually authenticates this portal today. */
  method: string;
  /** Session policy actually in force today. */
  session: string;
  /** The intended production identity model. NOT what happens today. */
  planned: string;
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
      method: "Single-use magic link · pilot cohort",
      session: "15-minute idle · 12-hour absolute · server-enforced",
      planned: "External ID or passkey · device-bound · recovery policy",
    },
    accent: {
      hex: "var(--c-optimal)",
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
      method: "Entra ID · Alpha Health tenant",
      session: "EasyAuth · fixed 8-hour · no re-auth on sign yet",
      planned: "MFA enforced · 8-hour · re-auth to sign",
    },
    accent: {
      hex: "var(--chart-brand)",
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
    // Was "Health coaches & front desk". It never was the front desk: nothing
    // in the coach portal could check anybody in, and folding two jobs into one
    // persona label is most of why the desk went unbuilt for so long.
    persona: "Health coaches",
    tagline: "Your roster, today's queue, and the next best action for every member.",
    home: "/coach",
    prefixes: ["/coach"],
    identity: {
      method: "Entra ID · Alpha Health tenant",
      session: "EasyAuth · fixed 8-hour",
      planned: "Google Workspace · domain-locked · 8-hour · least-privilege",
    },
    accent: {
      hex: "var(--c-watch)",
      text: "text-watch",
      bg: "bg-watch",
      border: "border-watch/30",
      soft: "bg-watch/12",
      gradient: "from-watch/20 via-watch/5 to-transparent",
    },
  },
  /**
   * The front desk.
   *
   * A separate portal rather than a tab inside the coach console, because it is
   * a separate JOB done by a separate person on separate hardware — a desk
   * monitor and a tablet at the counter, all day, with a member standing in
   * front of them. Its whole surface area is the encounter: who is here, how
   * long have they been here, which room, and book the person on the phone.
   * None of that is coaching, and none of it belongs behind a coach's queue.
   *
   * The accent is the calm blue rather than another warm tone. The coach and
   * clinic consoles are urgent surfaces and look it; a desk that also shouts
   * gives the person at the counter nowhere to rest their eyes for eight hours.
   */
  desk: {
    id: "desk",
    label: "Front Desk",
    persona: "Reception & patient experience",
    tagline: "Who is here, how long they have waited, which room — and book the caller on hold.",
    home: "/desk",
    prefixes: ["/desk"],
    identity: {
      method: "Entra ID · Alpha Health tenant",
      // Deliberately NOT "auto-locks at the counter". No idle lock exists
      // anywhere in Apex (GAP_ANALYSIS, COMPLIANCE, "Session timeout" — P0) and
      // a shared reception terminal is the single worst place to imply one.
      session: "EasyAuth · fixed 8-hour · no idle lock",
      planned: "Shared workstation · badge tap · shift-length",
    },
    accent: {
      hex: "var(--c-low)",
      text: "text-low",
      bg: "bg-low",
      border: "border-low/30",
      soft: "bg-low/12",
      gradient: "from-low/20 via-low/5 to-transparent",
    },
  },
  /**
   * The owner.
   *
   * A separate portal rather than an "Analytics" item inside the coach console,
   * because the question it answers is not an operator's. A coach console is
   * organised around a queue of people; this is organised around whether the
   * business is healthy, and the two have almost no surface in common.
   *
   * It is also the one portal that is NOT a persona to be assumed. The other
   * four answer "what does a member / clinician / coach / receptionist see";
   * this one is simply where the signed-in owner lives, which is why it names a
   * real account (lib/viewer.ts, VIEWER) rather than a seeded stand-in.
   *
   * THE ACCENT IS DELIBERATELY ACHROMATIC. Every colour in this system already
   * carries a meaning — gold is the brand and the clinic, and optimal / watch /
   * low are clinical status readings that the other portals have now spent.
   * Taking a fifth hue would either collide with a lab result's semantics or
   * invent a sixth colour for a design system whose whole argument is restraint.
   * Platinum reads as executive, competes with nothing, and leaves the console's
   * only saturated elements to be the figures that are actually urgent.
   */
  exec: {
    id: "exec",
    label: "Owner Console",
    persona: "Ownership",
    tagline: "What happened yesterday, what needs you today, and where every number came from.",
    home: "/exec",
    prefixes: ["/exec"],
    identity: {
      method: "Entra ID · Alpha Health tenant",
      // No claim of an idle lock: none exists anywhere in Apex (GAP_ANALYSIS,
      // COMPLIANCE, "Session timeout" — P0), and this console renders
      // clinic-wide financials.
      session: "EasyAuth · fixed 8-hour · no idle lock",
      planned: "MFA enforced · 8-hour · owner account",
    },
    accent: {
      hex: "#c9ced4",
      text: "text-ink-200",
      bg: "bg-ink-200",
      border: "border-ink-400/30",
      soft: "bg-ink-200/12",
      gradient: "from-ink-200/15 via-ink-200/5 to-transparent",
    },
  },
};

export const PORTAL_ORDER: PortalId[] = ["patient", "clinic", "coach", "desk", "exec"];

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
