"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Sparkles,
  Boxes,
  Workflow,
  Bot,
  Brain,
  BarChart3,
  CalendarDays,
  Smartphone,
  ListChecks,
  Network,
  Settings,
  Activity,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV: { section?: string; items: { href: string; label: string; icon: typeof Users }[] }[] = [
  {
    section: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/insights", label: "AI Insights", icon: Brain },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    section: "Clients",
    items: [
      { href: "/clients", label: "Clients", icon: Users },
      { href: "/recommendations", label: "Recommendations", icon: Sparkles },
      { href: "/portal", label: "Client Portal", icon: Smartphone },
    ],
  },
  {
    section: "Operations",
    items: [
      { href: "/swarm", label: "Agent Swarm", icon: Network },
      { href: "/supply-chain", label: "Supply Chain", icon: Boxes },
      { href: "/tasks", label: "Tasks", icon: ListChecks },
      { href: "/schedule", label: "Team Schedule", icon: CalendarDays },
      { href: "/automations", label: "Automations", icon: Workflow },
    ],
  },
  {
    items: [
      { href: "/agent", label: "Coach Copilot", icon: Bot },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function Sidebar({
  mobileOpen,
  onClose,
}: {
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-ink-800 bg-ink-950/95 backdrop-blur-xl transition-transform lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/" className="flex items-center gap-2.5" onClick={onClose}>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-gold-300 to-gold-600 text-ink-950 shadow-glow">
              <Activity className="h-5 w-5" strokeWidth={2.4} />
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-display text-base font-bold tracking-tight text-ink-50">
                Apex
              </span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-gold-400/80">
                Alpha Health
              </span>
            </span>
          </Link>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-100 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-2">
          {NAV.map((group, gi) => (
            <div key={group.section ?? `g-${gi}`} className="space-y-1">
              {group.section ? (
                <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-600">
                  {group.section}
                </p>
              ) : (
                <div className="mx-3 border-t border-ink-800/70 pt-2" />
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-ink-800 text-ink-50" : "text-ink-300 hover:bg-ink-850 hover:text-ink-50",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-[18px] w-[18px] transition-colors",
                        active ? "text-gold-400" : "text-ink-500 group-hover:text-ink-300",
                      )}
                    />
                    {item.label}
                    {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-gold-400" />}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="m-3 rounded-xl border border-ink-800 bg-ink-900/60 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-gold-400/80">
            Demo environment
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-500">
            Mock data only. Not medical advice. Recommendations require licensed
            provider review.
          </p>
        </div>
      </aside>
    </>
  );
}
