"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, TrendingUp, FlaskConical, MessageSquare, UsersRound } from "lucide-react";
import { LayoutDashboard, Users, ListChecks, Bot } from "lucide-react";
import { DoorOpen, PhoneCall, CalendarDays } from "lucide-react";
import { Gauge, Activity, Workflow } from "lucide-react";
import { usePortal } from "@/lib/portalStore";
import type { PortalId } from "@/lib/portals";
import { useFeatures, usePreset } from "@/lib/features/client";
import { featureForPath } from "@/lib/features/catalog";
import { labelFor } from "@/lib/nav/v1Parity";
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
    { href: "/portal/labs", label: "Labs", icon: FlaskConical },
    { href: "/portal/community", label: "Community", icon: UsersRound },
    { href: "/portal/messages", label: "Messages", icon: MessageSquare },
  ],
  coach: [
    { href: "/coach", label: "Today", icon: LayoutDashboard },
    { href: "/coach/roster", label: "Members", icon: Users },
    { href: "/tasks", label: "Tasks", icon: ListChecks },
    { href: "/coach/community", label: "Community", icon: UsersRound },
    { href: "/agent", label: "Ask Apex", icon: Bot },
  ],
  clinic: [
    { href: "/clinic", label: "Today", icon: LayoutDashboard },
    { href: "/clinic/sign", label: "Sign", icon: ListChecks },
    { href: "/clients", label: "Patients", icon: Users },
    { href: "/clinic/community", label: "Community", icon: UsersRound },
    { href: "/agent", label: "Ask Apex", icon: Bot },
  ],
  /**
   * The desk's five are its whole job, and on the tablet at the counter this
   * bar IS the navigation — the sidebar is behind a menu button. So the two
   * things done hundreds of times a day (the board, and booking the caller on
   * hold) sit at the two easiest thumb positions rather than being ordered to
   * match the sidebar.
   */
  desk: [
    { href: "/desk", label: "Today", icon: ListChecks },
    { href: "/desk/book", label: "Book", icon: PhoneCall },
    { href: "/desk/rooms", label: "Rooms", icon: DoorOpen },
    // AUDIT 1.3: was /clients — a fourteen-tab clinical chart a receptionist has
    // no business reading, and can write notes to. Removed here as well as from
    // lib/nav.ts; the desk's own pages answer the reception question.
    { href: "/schedule", label: "Schedule", icon: CalendarDays },
    { href: "/desk/community", label: "Community", icon: UsersRound },
  ],
  /**
   * The owner reads this on a phone, standing up, before the drive in — which
   * is why /exec is built to answer its three questions in one scroll rather
   * than splitting them across tabs. These five are escape hatches from that
   * screen, not a substitute for it, so Morning stays first.
   */
  exec: [
    { href: "/exec", label: "Morning", icon: Gauge },
    { href: "/exec/capacity", label: "Capacity", icon: Activity },
    { href: "/exec/pipeline", label: "Pipeline", icon: Workflow },
    { href: "/exec/community", label: "Community", icon: UsersRound },
    { href: "/clients", label: "Members", icon: Users },
  ],
};

export function BottomNav() {
  const pathname = usePathname();
  const { portal } = usePortal();
  const features = useFeatures();

  // Feature-filtered like the sidebar. This bar IS the navigation on mobile, so
  // a link to a disabled surface is not a cosmetic problem here — it is a dead
  // thumb target in one of five positions someone taps all day.
  const preset = usePreset();
  const items = (BY_PORTAL[portal.id] ?? BY_PORTAL.coach)
    .filter((item) => {
      const owner = featureForPath(item.href);
      return !owner || features[owner.key] !== false;
    })
    // Same V1 vocabulary as the sidebar. A bar that says "Members" while the
    // sidebar says "Clients" is worse than either word on its own.
    .map((item) => ({ ...item, label: labelFor(item.href, item.label, preset) }));

  // Longest-prefix match, so /portal/progress highlights Progress rather than
  // Today — a plain startsWith would light up both, since /portal prefixes them.
  const activeHref = items
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-800 bg-ink-950/95 backdrop-blur-xl lg:hidden">
      {/* Column count follows the surviving items. A fixed grid-cols-5 with a
          feature switched off leaves a dead cell and shifts every thumb target
          off the position muscle memory expects. */}
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))` }}
      >
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
