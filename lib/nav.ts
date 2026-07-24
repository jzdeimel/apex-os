import {
  UserPlus,
  Megaphone,
  Activity,
  Award,
  BarChart3,
  Bot,
  Boxes,
  Brain,
  CalendarDays,
  ClipboardList,
  Compass,
  DoorOpen,
  Eye,
  FileSignature,
  FileText,
  FlaskConical,
  Gauge,
  GraduationCap,
  Heart,
  History,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  MessageSquare,
  Network,
  Package,
  PenLine,
  Pill,
  PhoneCall,
  PlusCircle,
  Receipt,
  Repeat,
  Rows3,
  Settings,
  ShieldAlert,
  Siren,
  SlidersHorizontal,
  Sparkles,
  Stethoscope,
  Syringe,
  TrendingUp,
  Users,
  UsersRound,
  Wallet,
  Workflow,
} from "lucide-react";
import type { PortalId } from "@/lib/portals";
import { featureForPath } from "@/lib/features/catalog";
import { labelFor } from "@/lib/nav/v1Parity";
import { isFixtureOnlyPath } from "@/lib/productionSurfaces";

export interface NavItem {
  href: string;
  label: string;
  icon: typeof Users;
  /** Renders a small accent dot — used to draw the eye to demo centrepieces. */
  spotlight?: boolean;
}

export interface NavGroup {
  section?: string;
  items: NavItem[];
}

/**
 * Navigation per portal.
 *
 * The asymmetry is deliberate and it is a product decision, not an oversight.
 *
 * The member's nav is grouped into four short sections because members abandon
 * dense navigation — everything needed daily is in the first group, and the
 * rest is there when they go looking. The operator portals are broad because
 * staff live in them all day and shallow nav costs them clicks all day.
 *
 * `spotlight` marks the surfaces worth showing someone first. It is a demo
 * affordance, not a permanent part of the product.
 *
 * NAMING. Labels say what a surface IS, in the words a person would use out
 * loud. "Command Center", "AI Insights" and "Copilot" were replaced because
 * they are product-speak: they describe a category of software rather than the
 * job the screen does, and they are interchangeable between any two dashboards.
 * The member side already had the right instinct -- "How I feel", "Who viewed my
 * chart", "What's available" -- and the operator side now matches it.
 */
export const PORTAL_NAV: Record<PortalId, NavGroup[]> = {
  patient: [
    {
      section: "Your care",
      items: [
        { href: "/patient", label: "Today", icon: Heart, spotlight: true },
        { href: "/patient/progress", label: "Progress", icon: TrendingUp },
        { href: "/patient/plans", label: "Food & training plans", icon: ClipboardList },
        { href: "/patient/records", label: "Record requests", icon: FileText },
        { href: "/patient/book", label: "Book a follow-up", icon: CalendarDays },
      ],
    },
    {
      section: "Explore",
      items: [
        { href: "/patient/services", label: "What's available", icon: Compass },
        { href: "/patient/learn", label: "Learn", icon: GraduationCap },
        { href: "/patient/library", label: "Peptide library", icon: FlaskConical },
        { href: "/patient/refer", label: "Refer a friend", icon: UserPlus },
        { href: "/patient/community", label: "Community", icon: UsersRound, spotlight: true },
      ],
    },
  ],

  clinic: [
    {
      section: "Clinical",
      items: [
        { href: "/clinic", label: "Today", icon: LayoutDashboard },
        { href: "/clinic/escalations", label: "Escalations", icon: Siren, spotlight: true },
        { href: "/support", label: "Operations support", icon: LifeBuoy },
        { href: "/clinic/sign", label: "Sign queue", icon: FileSignature, spotlight: true },
        { href: "/clients", label: "Patients", icon: Users },
        { href: "/recommendations", label: "Awaiting sign-off", icon: Sparkles },
        { href: "/schedule", label: "Schedule", icon: CalendarDays },
      ],
    },
    {
      section: "Intelligence",
      items: [
        { href: "/insights", label: "What we're seeing", icon: Brain },
        { href: "/clinic/community", label: "Community", icon: UsersRound, spotlight: true },
        { href: "/agent", label: "Ask Apex", icon: Bot },
      ],
    },
    {
      section: "Governance",
      items: [
        { href: "/clinic/ledger", label: "Audit trail", icon: History, spotlight: true },
      ],
    },
  ],

  coach: [
    {
      section: "My Day",
      items: [
        { href: "/coach", label: "Today", icon: Gauge, spotlight: true },
        { href: "/coach/messages", label: "Patient messages", icon: MessageSquare, spotlight: true },
        { href: "/clients", label: "My members", icon: Users },
        { href: "/support", label: "Operations support", icon: LifeBuoy },
        { href: "/tasks", label: "Tasks", icon: ListChecks },
        { href: "/agent", label: "Ask Apex", icon: Bot },
      ],
    },
    {
      section: "Ordering",
      items: [
        { href: "/supply-chain", label: "Stock & fulfillment", icon: Boxes },
      ],
    },
    {
      section: "Growth",
      items: [
        { href: "/insights", label: "What we're seeing", icon: Brain },
        { href: "/coach/community", label: "Community", icon: UsersRound, spotlight: true },
        { href: "/coach/winback", label: "Lapsed members", icon: Repeat },
        { href: "/automations", label: "Automations", icon: Workflow },
        // Analytics (revenue/MRR) is an owner surface — it lives on the exec
        // console only, not here. A coach's growth work is members, not money.
      ],
    },
    {
      section: "Team",
      items: [
        { href: "/schedule", label: "Team calendar", icon: CalendarDays },
        { href: "/swarm", label: "Background agents", icon: Network },
      ],
    },
  ],

  /**
   * The front desk is the SHORTEST nav in the product, and that is the design.
   *
   * The operator portals above are broad because coaches and clinicians live in
   * them all day and shallow nav costs them clicks all day. A desk is the
   * opposite: it does four things, repeatedly, at speed, while somebody is
   * standing there. Every extra destination is one more thing to scan past on
   * the way to the two that matter, so the two that matter are first.
   *
   * `/clients`, `/tasks`, `/schedule` and `/supply-chain` are unowned operator
   * routes — see the `prefixes` note in lib/portals.ts — so they render with
   * desk chrome rather than needing a desk-specific copy of each page.
   */
  /*
   * AUDIT 1.3: "Look someone up → Members → /clients" was in this tree, and
   * /clients is a fourteen-tab clinical chart with no gate — panel-wide risk
   * donut, Alpha Score distribution, full lab panels, AI interpretation, symptom
   * search, and a textarea that WRITES to the chart. A receptionist needs name,
   * date of birth, phone and next appointment; they do not need a testosterone
   * level, and they certainly do not need to author a consult.
   *
   * Removed rather than gated, because the desk's own three pages already
   * answer the reception question correctly at appointment-type granularity.
   * A desk-safe lookup surface is the proper replacement and is not built yet —
   * so this is a removal with a known gap, not a fix.
   */
  desk: [
    {
      section: "The counter",
      items: [
        { href: "/desk", label: "Today", icon: ListChecks, spotlight: true },
        { href: "/desk/book", label: "Book caller or walk-in", icon: PhoneCall, spotlight: true },
        { href: "/desk/rooms", label: "Rooms", icon: DoorOpen },
        { href: "/schedule", label: "Who's on today", icon: CalendarDays },
      ],
    },
    {
      section: "Look someone up",
      items: [
        { href: "/tasks", label: "Tasks", icon: ClipboardList },
        { href: "/support", label: "Operations support", icon: LifeBuoy },
        { href: "/desk/community", label: "Community", icon: UsersRound, spotlight: true },
      ],
    },
    {
      section: "Site",
      items: [
        { href: "/supply-chain", label: "Stock", icon: Boxes },
      ],
    },
  ],

  /**
   * The owner. Short, like the desk, for the opposite reason.
   *
   * A coach's nav is broad because they work a queue all day. An owner opens
   * the app, answers three questions and closes it. Everything that matters is
   * on `/exec` itself; the two sub-routes exist because capacity and pipeline
   * each need more room than a morning screen can spare, not because they are
   * daily destinations.
   *
   * "Daily order report" is listed here and NOWHERE ELSE in any nav tree. The
   * audit found app/admin/daily-report — 383 lines of genuinely computed,
   * genuinely useful work — reachable only by typing the URL. It is an ops
   * document rather than an owner one, so it is not promoted onto the morning
   * screen; but the owner is the person who notices it has stopped being read,
   * which makes this the right place to put the only link to it.
   */
  exec: [
    {
      section: "Ownership",
      items: [
        { href: "/exec", label: "Morning", icon: Gauge, spotlight: true },
        { href: "/exec/marketing", label: "Acquisition", icon: Megaphone },
      ],
    },
    {
      section: "Look deeper",
      items: [
        { href: "/clinic/ledger", label: "Audit trail", icon: History },
        { href: "/admin/cases", label: "Support & records", icon: LifeBuoy, spotlight: true },
        { href: "/admin/migration-preview", label: "Imported Alpha patients", icon: Rows3, spotlight: true },
        { href: "/admin/patient-access", label: "Patient access", icon: KeyRound },
      ],
    },
    {
      section: "The clinic",
      items: [
        { href: "/clients", label: "Members", icon: Users },
        { href: "/exec/community", label: "Community", icon: UsersRound, spotlight: true },
        { href: "/schedule", label: "Team calendar", icon: CalendarDays },
        { href: "/supply-chain", label: "Stock & vendors", icon: Boxes },
        { href: "/exec/features", label: "Features", icon: SlidersHorizontal },
      ],
    },
  ],
};

/** Flattened items for a portal — used by the command palette. */
export function navItemsFor(portal: PortalId): NavItem[] {
  return PORTAL_NAV[portal].flatMap((g) => g.items);
}

/** Every navigable route across all portals, deduped. */
export function allNavItems(): NavItem[] {
  const seen = new Set<string>();
  const out: NavItem[] = [];
  for (const groups of Object.values(PORTAL_NAV)) {
    for (const g of groups) {
      for (const item of g.items) {
        if (seen.has(item.href)) continue;
        seen.add(item.href);
        out.push(item);
      }
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Feature filtering                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Drop nav items whose route belongs to a disabled feature.
 *
 * PURE, AND THEREFORE NOT THE ENFORCEMENT. `lib/features/gate.tsx` is what
 * actually refuses a request; this only stops the sidebar advertising a link
 * that would 404. Both are needed and neither substitutes for the other: a nav
 * that lies wastes a click, a missing gate exposes a surface.
 *
 * Groups that empty out are removed entirely, so a section heading never sits
 * above nothing — "Growth" with no items under it reads as a broken build.
 */
export function filterNavByFeatures(
  groups: NavGroup[],
  enabled: Record<string, boolean>,
  /**
   * The active release preset. Under `clinic-v1` the labels switch to the words
   * Alpha OS V1 uses, so a coach who spent two weeks learning "Clients" is not
   * asked to learn "My members" on the morning of the cutover. See
   * lib/nav/v1Parity.ts — the mapping is taken from V1's own nav, verbatim.
   */
  preset: string = "clinic-v1",
): NavGroup[] {
  const allowFixtures =
    process.env.NEXT_PUBLIC_APEX_DEMO_MODE === "true";
  const out: NavGroup[] = [];
  for (const group of groups) {
    const items = group.items
      .filter((item) => {
        if (!allowFixtures && isFixtureOnlyPath(item.href)) return false;
        const owner = featureForPath(item.href);
        return !owner || enabled[owner.key] !== false;
      })
      .map((item) => {
        const label = labelFor(item.href, item.label, preset);
        return label === item.label ? item : { ...item, label };
      });
    if (items.length > 0) out.push({ ...group, items });
  }
  return out;
}
