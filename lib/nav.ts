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
        { href: "/clinic", label: "Command Center", icon: LayoutDashboard },
        { href: "/clinic/escalations", label: "Escalations", icon: Siren, spotlight: true },
        { href: "/clinic/sign", label: "Sign queue", icon: FileSignature, spotlight: true },
        { href: "/clients", label: "Patients", icon: Users },
        { href: "/recommendations", label: "Review Queue", icon: Sparkles },
        { href: "/coach/consults", label: "Consults", icon: ClipboardList },
        { href: "/schedule", label: "Schedule", icon: CalendarDays },
      ],
    },
    {
      section: "Intelligence",
      items: [
        { href: "/insights", label: "AI Insights", icon: Brain },
        { href: "/agent", label: "Clinical Copilot", icon: Bot },
        { href: "/coach/documents", label: "Documents", icon: FileText },
      ],
    },
    {
      section: "Governance",
      items: [
        { href: "/clinic/ledger", label: "Audit Ledger", icon: History, spotlight: true },
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
        { href: "/coach/roster", label: "My Roster", icon: Users },
        { href: "/coach/gaps", label: "Care gaps", icon: LifeBuoy, spotlight: true },
        { href: "/coach/consults", label: "Consults", icon: ClipboardList },
        { href: "/tasks", label: "Tasks", icon: ListChecks },
        { href: "/agent", label: "Coach Copilot", icon: Bot },
      ],
    },
    {
      section: "Ordering",
      items: [
        { href: "/coach/order", label: "Place an order", icon: PlusCircle, spotlight: true },
        { href: "/coach/orders", label: "Orders", icon: Package },
        { href: "/coach/subscriptions", label: "Refills", icon: Repeat },
        { href: "/supply-chain", label: "Supply Chain", icon: Boxes },
      ],
    },
    {
      section: "Growth",
      items: [
        { href: "/insights", label: "AI Insights", icon: Brain },
        { href: "/coach/winback", label: "Win-back", icon: Repeat },
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
        { href: "/schedule", label: "Team Schedule", icon: CalendarDays },
        { href: "/swarm", label: "Agent Swarm", icon: Network },
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
