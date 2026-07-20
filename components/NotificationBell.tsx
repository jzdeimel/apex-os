"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { clients } from "@/lib/mock/clients";
import { seededRecommendations } from "@/lib/mock/recommendations";
import { inventory } from "@/lib/mock/inventory";
import { Bell, FlaskConical, Sparkles, PackageX, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const { locationFilter, recStatus } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const inLoc = (loc: string) => locationFilter === "all" || loc === locationFilter;
  const cl = clients.filter((c) => inLoc(c.locationId));

  const resultsReady = cl.filter((c) => c.status === "Results Ready");
  const overdue = cl.filter((c) => c.status === "Follow-Up Due");
  const pending = seededRecommendations.filter((r) => {
    const c = clients.find((x) => x.id === r.clientId);
    const s = recStatus[r.id] ?? r.status;
    return c && inLoc(c.locationId) && (s === "draft" || s === "coach reviewed");
  });
  const invAlerts = inventory.filter((i) => inLoc(i.locationId) && i.status !== "in stock");

  const items = [
    { icon: Sparkles, tone: "text-gold-300", text: `${pending.length} recommendations need provider approval`, href: "/recommendations", n: pending.length },
    { icon: FlaskConical, tone: "text-low", text: `${resultsReady.length} clients have results ready`, href: "/clients", n: resultsReady.length },
    { icon: Clock, tone: "text-high", text: `${overdue.length} follow-ups overdue`, href: "/insights", n: overdue.length },
    { icon: PackageX, tone: "text-watch", text: `${invAlerts.length} inventory alerts`, href: "/supply-chain", n: invAlerts.length },
  ].filter((i) => i.n > 0);

  const total = items.reduce((s, i) => s + i.n, 0);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-9 w-9 place-items-center rounded-lg border border-ink-800 bg-ink-900/70 text-ink-300 transition-colors hover:text-ink-50 focus-ring"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {total > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-gold-400 px-1 text-micro font-bold text-ink-950">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-ink-700 bg-ink-850 shadow-card animate-fade-up">
          <div className="border-b border-ink-800 px-4 py-2.5">
            <span className="text-body font-semibold text-ink-100">Notifications</span>
            <span className="ml-2 text-detail text-ink-500">{total} need attention</span>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {items.length === 0 ? (
              <p className="px-3 py-8 text-center text-body text-ink-500">You&apos;re all caught up ✨</p>
            ) : (
              items.map((it, i) => (
                <Link
                  key={i}
                  href={it.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-ink-800/70"
                >
                  <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink-800", it.tone)}>
                    <it.icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1 text-body text-ink-200">{it.text}</span>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
