import {
  Activity,
  BarChart3,
  Bot,
  Boxes,
  Brain,
  CalendarDays,
  ClipboardList,
  Eye,
  FileSignature,
  FlaskConical,
  Gauge,
  Heart,
  History,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Network,
  Package,
  Rows3,
  Siren,
  Settings,
  Sparkles,
  Stethoscope,
  Syringe,
  TrendingUp,
  Users,
  Workflow,
} from "lucide-react";
import type { PortalId } from "@/lib/portals";

export interface NavItem {
  href: string;
  label: string;
  icon: typeof Users;
  /** Renders a small accent dot — used to draw the eye to demo centerpieces. */
  spotlight?: boolean;
}

export interface NavGroup {
  section?: string;
  items: NavItem[];
}

/**
 * Navigation per portal.
 *
 * Note the deliberate asymmetry: the client portal is short (7 items) because
 * members abandon dense navigation, while the operator portals are broad
 * because staff live in them all day and shallow nav costs them clicks.
 */
export const PORTAL_NAV: Record<PortalId, NavGroup[]> = {
  patient: [
    {
      items: [
        { href: "/portal", label: "Today", icon: Heart, spotlight: true },
        { href: "/portal/progress", label: "Progress", icon: TrendingUp },
        { href: "/portal/protocol", label: "My Protocol", icon: Syringe },
        { href: "/portal/labs", label: "Lab Results", icon: FlaskConical },
      ],
    },
    {
      section: "Account",
      items: [
        { href: "/portal/messages", label: "Messages", icon: MessageSquare },
        {
          href: "/portal/access",
          label: "Who viewed my chart",
          icon: Eye,
          spotlight: true,
        },
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
      ],
    },
    {
      section: "Governance",
      items: [
        {
          href: "/clinic/ledger",
          label: "Audit Ledger",
          icon: History,
          spotlight: true,
        },
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
        { href: "/coach/consults", label: "Consults", icon: ClipboardList },
        { href: "/coach/orders", label: "Orders", icon: Package, spotlight: true },
        { href: "/tasks", label: "Tasks", icon: ListChecks },
        { href: "/agent", label: "Coach Copilot", icon: Bot },
      ],
    },
    {
      section: "Growth",
      items: [
        { href: "/insights", label: "AI Insights", icon: Brain },
        { href: "/automations", label: "Automations", icon: Workflow },
        { href: "/analytics", label: "Analytics", icon: BarChart3 },
      ],
    },
    {
      section: "Operations",
      items: [
        { href: "/supply-chain", label: "Supply Chain", icon: Boxes },
        { href: "/swarm", label: "Agent Swarm", icon: Network, spotlight: true },
        { href: "/schedule", label: "Team Schedule", icon: CalendarDays },
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
