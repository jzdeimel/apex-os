"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Brain, ListChecks, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/insights", label: "Insights", icon: Brain },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/agent", label: "Copilot", icon: Bot },
];

export function BottomNav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-800 bg-ink-950/95 backdrop-blur-xl lg:hidden">
      <div className="grid grid-cols-5">
        {ITEMS.map((it) => {
          const active = isActive(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors",
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
