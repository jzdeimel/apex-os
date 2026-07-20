"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, TrendingUp, Syringe, FlaskConical, MessageSquare } from "lucide-react";
import { LayoutDashboard, Users, Brain, ListChecks, Bot } from "lucide-react";
import { usePortal } from "@/lib/portalStore";
import type { PortalId } from "@/lib/portals";
import { cn } from "@/lib/utils";

/**
 * Mobile bottom navigation, per portal.
 *
 * This used to be ONE hardcoded list — Home, Clients, Insights, Tasks, Copilot —
 * rendered in every portal including the member's. So a patient on a phone was
 * shown a "Clients" tab, and tapping it took them to the full staff roster.
 * Reading is deliberately not gated in this app (the rule is that authorship is
 * what narrows, not access), which meant nothing downstream stopped them.
 *
 * The sidebar has been portal-aware since the three portals were introduced;
 * this component was simply missed, and on mobile it IS the navigation — the
 * sidebar is behind a menu button. So the leak was worst exactly where it was
 * least visible to anyone testing on a laptop.
 *
 * Five destinations per portal, chosen as the things someone opens the app FOR,
 * not a truncation of the sidebar. A member's five are their day; an operator's
 * five are their queue.
 */

interface Item {
  href: string;
  label: string;
  icon: typeof Heart;
}

const BY_PORTAL: Record<PortalId, Item[]> = {
  patient: [
    { href: "/portal", label: "Today", icon: Heart },
    { href: "/portal/progress", label: "Progress", icon: TrendingUp },
    { href: "/portal/protocol", label: "Protocol", icon: Syringe },
    { href: "/portal/labs", label: "Labs", icon: FlaskConical },
    { href: "/portal/messages", label: "Messages", icon: MessageSquare },
  ],
  coach: [
    { href: "/coach", label: "Today", icon: LayoutDashboard },
    { href: "/coach/roster", label: "Members", icon: Users },
    { href: "/coach/consults", label: "Consults", icon: ListChecks },
    { href: "/tasks", label: "Tasks", icon: ListChecks },
    { href: "/agent", label: "Ask Apex", icon: Bot },
  ],
  clinic: [
    { href: "/clinic", label: "Today", icon: LayoutDashboard },
    { href: "/clinic/sign", label: "Sign", icon: ListChecks },
    { href: "/clients", label: "Patients", icon: Users },
    { href: "/insights", label: "Seeing", icon: Brain },
    { href: "/agent", label: "Ask Apex", icon: Bot },
  ],
};

export function BottomNav() {
  const pathname = usePathname();
  const { portal } = usePortal();
  const items = BY_PORTAL[portal.id] ?? BY_PORTAL.coach;

  // Longest-prefix match, so /portal/progress highlights Progress rather than
  // Today — a plain startsWith would light up both, since /portal prefixes them.
  const activeHref = items
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-800 bg-ink-950/95 backdrop-blur-xl lg:hidden">
      <div className="grid grid-cols-5">
        {items.map((it) => {
          const active = it.href === activeHref;
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2.5 text-micro font-medium transition-colors",
                active ? "text-gold-300" : "text-ink-500",
              )}
            >
              <it.icon className={cn("h-5 w-5", active && "text-gold-400")} />
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
