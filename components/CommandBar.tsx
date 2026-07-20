"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clients, clientName } from "@/lib/mock/clients";
import { SUGGESTED_PROMPTS } from "@/lib/agentResponses";
import { locationName } from "@/lib/mock/locations";
import { cn } from "@/lib/utils";
import {
  Search,
  CornerDownLeft,
  LayoutDashboard,
  Users,
  Brain,
  Sparkles,
  Boxes,
  Workflow,
  Bot,
  CalendarDays,
  BarChart3,
  Smartphone,
  ListChecks,
  Network,
  Settings,
  User,
  Command,
} from "lucide-react";

type Item =
  | { kind: "page"; label: string; href: string; icon: typeof Users }
  | { kind: "client"; label: string; href: string; sub: string }
  | { kind: "prompt"; label: string; href: string };

const PAGES: { label: string; href: string; icon: typeof Users }[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Clients", href: "/clients", icon: Users },
  { label: "AI Insights", href: "/insights", icon: Brain },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Recommendations", href: "/recommendations", icon: Sparkles },
  { label: "Agent Swarm", href: "/swarm", icon: Network },
  { label: "Supply Chain", href: "/supply-chain", icon: Boxes },
  { label: "Automations", href: "/automations", icon: Workflow },
  { label: "Tasks", href: "/tasks", icon: ListChecks },
  { label: "Team Schedule", href: "/schedule", icon: CalendarDays },
  { label: "Client Portal", href: "/portal", icon: Smartphone },
  { label: "Coach Copilot", href: "/agent", icon: Bot },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function CommandBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const query = q.trim().toLowerCase();
    const pages: Item[] = PAGES.filter((p) => p.label.toLowerCase().includes(query)).map((p) => ({
      kind: "page",
      label: p.label,
      href: p.href,
      icon: p.icon,
    }));
    const cl: Item[] = clients
      .filter((c) => !query || clientName(c).toLowerCase().includes(query))
      .slice(0, query ? 6 : 4)
      .map((c) => ({ kind: "client", label: clientName(c), href: `/clients/${c.id}`, sub: `${c.age}${c.sex === "male" ? "M" : "F"} · ${locationName(c.locationId)} · ${c.status}` }));
    const prompts: Item[] = SUGGESTED_PROMPTS.filter((p) => !query || p.toLowerCase().includes(query))
      .slice(0, query ? 5 : 3)
      .map((p) => ({ kind: "prompt", label: p, href: `/agent?q=${encodeURIComponent(p)}` }));
    return [...pages, ...cl, ...prompts];
  }, [q]);

  useEffect(() => {
    if (active >= items.length) setActive(0);
  }, [items, active]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-ink-700 bg-ink-850 shadow-glow animate-fade-up">
        <div className="flex items-center gap-2 border-b border-ink-800 px-4">
          <Search className="h-4 w-4 text-ink-500" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === "Enter" && items[active]) { e.preventDefault(); go(items[active].href); }
            }}
            placeholder="Search pages, clients, or ask the copilot…"
            className="h-12 flex-1 bg-transparent text-body text-ink-100 placeholder:text-ink-500 focus:outline-none"
          />
          <kbd className="hidden rounded border border-ink-700 px-1.5 py-0.5 text-micro text-ink-500 sm:block">ESC</kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {items.length === 0 && <p className="px-3 py-6 text-center text-body text-ink-500">No matches.</p>}
          {items.map((it, i) => (
            <button
              key={`${it.kind}-${it.href}-${i}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(it.href)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                active === i ? "bg-ink-700/70" : "hover:bg-ink-800/60",
              )}
            >
              <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-md", it.kind === "prompt" ? "bg-gold-400/15 text-gold-300" : "bg-ink-800 text-ink-400")}>
                {it.kind === "page" && <it.icon className="h-3.5 w-3.5" />}
                {it.kind === "client" && <User className="h-3.5 w-3.5" />}
                {it.kind === "prompt" && <Sparkles className="h-3.5 w-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body text-ink-100">{it.label}</span>
                <span className="block truncate text-micro text-ink-500">
                  {it.kind === "page" ? "Go to page" : it.kind === "client" ? it.sub : "Ask Coach Copilot"}
                </span>
              </span>
              {active === i && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-ink-500" />}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-ink-800 px-3 py-2 text-micro text-ink-600">
          <span className="inline-flex items-center gap-1"><Command className="h-3 w-3" />K to toggle</span>
          <span>↑↓ navigate · ↵ open</span>
        </div>
      </div>
    </div>
  );
}
