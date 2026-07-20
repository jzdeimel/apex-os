import {
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
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  MessageSquare,
  Network,
  Package,
  PenLine,
  PhoneCall,
  PlusCircle,
  Receipt,
  Repeat,
  Rows3,
  Settings,
  ShieldAlert,
  Siren,
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
      section: "Every day",
      items: [
        { href: "/portal", label: "Today", icon: Heart, spotlight: true },
        { href: "/portal/progress", label: "Progress", icon: TrendingUp },
        { href: "/portal/protocol", label: "My Protocol", icon: Syringe },
        { href: "/portal/sites", label: "Injection sites", icon: Activity },
      ],
    },
    {
      section: "My health",
      items: [
        { href: "/portal/labs", label: "Lab Results", icon: FlaskConical },
        { href: "/portal/journal", label: "How I feel", icon: PenLine },
        { href: "/portal/food", label: "Food", icon: Compass },
        { href: "/portal/train", label: "Training", icon: Gauge },
      ],
    },
    {
      section: "Explore",
      items: [
        { href: "/portal/explore", label: "What's available", icon: Sparkles, spotlight: true },
        { href: "/portal/learn", label: "Learn", icon: GraduationCap },
        { href: "/portal/library", label: "Peptide library", icon: FlaskConical },
        { href: "/portal/community", label: "Community", icon: UsersRound, spotlight: true },
      ],
    },
    {
      section: "Account",
      items: [
        { href: "/portal/messages", label: "Messages", icon: MessageSquare },
        { href: "/portal/book-visit", label: "Book a visit", icon: CalendarDays },
        { href: "/portal/team", label: "My care team", icon: Stethoscope },
        { href: "/portal/costs", label: "Costs", icon: Wallet },
        { href: "/portal/receipts", label: "Receipts", icon: Receipt },
        { href: "/portal/refer", label: "Refer a friend", icon: Award },
        { href: "/portal/access", label: "Who viewed my chart", icon: Eye, spotlight: true },
        { href: "/portal/consents", label: "Consents", icon: FileSignature },
      ],
    },
  ],

  clinic: [
    {
      section: "Clinical",
      items: [
        { href: "/clinic", label: "Today", icon: LayoutDashboard },
        { href: "/clinic/escalations", label: "Escalations", icon: Siren, spotlight: true },
        { href: "/clinic/sign", label: "Sign queue", icon: FileSignature, spotlight: true },
        { href: "/clients", label: "Patients", icon: Users },
        { href: "/recommendations", label: "Awaiting sign-off", icon: Sparkles },
        { href: "/coach/consults", label: "Consults", icon: ClipboardList },
        { href: "/schedule", label: "Schedule", icon: CalendarDays },
      ],
    },
    {
      section: "Intelligence",
      items: [
        { href: "/insights", label: "What we're seeing", icon: Brain },
        { href: "/agent", label: "Ask Apex", icon: Bot },
        { href: "/coach/documents", label: "Documents", icon: FileText },
      ],
    },
    {
      section: "Governance",
      items: [
        { href: "/clinic/ledger", label: "Audit trail", icon: History, spotlight: true },
        { href: "/admin/roster", label: "Roster health", icon: Rows3 },
        { href: "/admin/quality", label: "Quality", icon: ShieldAlert },
        { href: "/settings", label: "Settings", icon: Settings },
      ],
    },
  ],

  coach: [
    {
      section: "My Day",
      items: [
        { href: "/coach", label: "Today", icon: Gauge, spotlight: true },
        { href: "/coach/roster", label: "My members", icon: Users },
        { href: "/coach/gaps", label: "Care gaps", icon: LifeBuoy, spotlight: true },
        { href: "/coach/consults", label: "Consults", icon: ClipboardList },
        { href: "/tasks", label: "Tasks", icon: ListChecks },
        { href: "/agent", label: "Ask Apex", icon: Bot },
      ],
    },
    {
      section: "Ordering",
      items: [
        { href: "/coach/order", label: "Place an order", icon: PlusCircle, spotlight: true },
        { href: "/coach/orders", label: "Orders", icon: Package },
        { href: "/coach/subscriptions", label: "Refills", icon: Repeat },
        { href: "/supply-chain", label: "Stock & vendors", icon: Boxes },
      ],
    },
    {
      section: "Growth",
      items: [
        { href: "/insights", label: "What we're seeing", icon: Brain },
        { href: "/coach/winback", label: "Lapsed members", icon: Repeat },
        { href: "/automations", label: "Automations", icon: Workflow },
        { href: "/analytics", label: "Analytics", icon: BarChart3 },
      ],
    },
    {
      section: "Team",
      items: [
        { href: "/coach/documents", label: "Documents", icon: FileText },
        { href: "/coach/training", label: "Training", icon: GraduationCap, spotlight: true },
        { href: "/coach/handoff", label: "Handoff packet", icon: Rows3 },
        { href: "/schedule", label: "Team calendar", icon: CalendarDays },
        { href: "/swarm", label: "Background agents", icon: Network },
        { href: "/settings", label: "Settings", icon: Settings },
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
        { href: "/desk/book", label: "Book a caller", icon: PhoneCall, spotlight: true },
        { href: "/desk/rooms", label: "Rooms", icon: DoorOpen },
        { href: "/schedule", label: "Who's on today", icon: CalendarDays },
      ],
    },
    {
      section: "Look someone up",
      items: [
        { href: "/tasks", label: "Tasks", icon: ClipboardList },
      ],
    },
    {
      section: "Site",
      items: [
        { href: "/supply-chain", label: "Stock", icon: Boxes },
        { href: "/settings", label: "Settings", icon: Settings },
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
        { href: "/exec/capacity", label: "Capacity & load", icon: Activity },
        { href: "/exec/pipeline", label: "Lead pipeline", icon: Workflow },
      ],
    },
    {
      section: "Look deeper",
      items: [
        { href: "/admin/daily-report", label: "Daily order report", icon: Receipt },
        { href: "/analytics", label: "Analytics", icon: BarChart3 },
        { href: "/clinic/ledger", label: "Audit trail", icon: History },
        { href: "/admin/quality", label: "Quality", icon: ShieldAlert },
      ],
    },
    {
      section: "The clinic",
      items: [
        { href: "/clients", label: "Members", icon: Users },
        { href: "/schedule", label: "Team calendar", icon: CalendarDays },
        { href: "/supply-chain", label: "Stock & vendors", icon: Boxes },
        { href: "/settings", label: "Settings", icon: Settings },
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
