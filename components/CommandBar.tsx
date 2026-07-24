"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Command,
  CornerDownLeft,
  Loader2,
  Search,
  User,
  Users,
} from "lucide-react";

import { useFeatures, usePreset } from "@/lib/features/client";
import { filterNavByFeatures, navItemsFor } from "@/lib/nav";
import { usePortal } from "@/lib/portalStore";
import { cn } from "@/lib/utils";

type Item =
  | { kind: "page"; label: string; href: string; icon: typeof Users }
  | { kind: "client"; label: string; href: string; sub: string };

type SearchPatient = {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  homeLocationId: string | null;
  status: string;
};

/**
 * Shared staff command palette.
 *
 * Route results come from the same feature-filtered navigation used by the
 * sidebar. Patient results come from the scoped, audited Postgres directory.
 * There are deliberately no seeded people, scripted prompts, or links to
 * retired demonstration routes in this palette.
 */
export function CommandBar() {
  const router = useRouter();
  const { portal } = usePortal();
  const features = useFeatures();
  const preset = usePreset();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [patients, setPatients] = useState<SearchPatient[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    setPatients([]);
    setSearchError(null);
    window.setTimeout(() => inputRef.current?.focus(), 40);
  }, [open]);

  const pages = useMemo(
    () => filterNavByFeatures(
      [{ items: navItemsFor(portal.id) }],
      features,
      preset,
    )[0]?.items ?? [],
    [features, portal.id, preset],
  );

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 2) {
      setPatients([]);
      setSearching(false);
      setSearchError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      void fetch(`/api/clients?q=${encodeURIComponent(trimmed)}&page=0`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !payload.ok) {
            throw new Error(payload.error || "Patient search is unavailable.");
          }
          setPatients((payload.patients ?? []).slice(0, 8));
        })
        .catch((cause) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          setPatients([]);
          setSearchError(
            cause instanceof Error ? cause.message : "Patient search is unavailable.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  const items = useMemo<Item[]>(() => {
    const normalized = query.trim().toLowerCase();
    const pageItems: Item[] = pages
      .filter((page) => page.label.toLowerCase().includes(normalized))
      .map((page) => ({
        kind: "page",
        label: page.label,
        href: page.href,
        icon: page.icon,
      }));
    const patientItems: Item[] = patients.map((patient) => ({
      kind: "client",
      label: `${patient.preferredName || patient.firstName} ${patient.lastName}`,
      href: `/clients/${patient.id}`,
      sub: `${patient.mrn} · ${patient.homeLocationId || "Clinic unresolved"} · ${patient.status}`,
    }));
    return [...pageItems, ...patientItems];
  }, [pages, patients, query]);

  useEffect(() => {
    if (active >= items.length) setActive(0);
  }, [active, items.length]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search Apex"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-ink-700 bg-ink-850 shadow-glow animate-fade-up">
        <div className="flex items-center gap-2 border-b border-ink-800 px-4">
          <Search className="h-4 w-4 text-ink-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((current) => Math.min(current + 1, items.length - 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((current) => Math.max(current - 1, 0));
              }
              if (event.key === "Enter" && items[active]) {
                event.preventDefault();
                go(items[active].href);
              }
            }}
            placeholder="Search pages or patients…"
            className="h-12 flex-1 bg-transparent text-body text-ink-100 placeholder:text-ink-500 focus:outline-none"
          />
          <kbd className="hidden rounded border border-ink-700 px-1.5 py-0.5 text-micro text-ink-500 sm:block">
            ESC
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {searching && (
            <p className="flex items-center justify-center gap-2 px-3 py-4 text-detail text-ink-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching the patient directory…
            </p>
          )}
          {searchError && (
            <p className="px-3 py-4 text-center text-detail text-high">{searchError}</p>
          )}
          {!searching && !searchError && items.length === 0 && (
            <p className="px-3 py-6 text-center text-body text-ink-500">No matches.</p>
          )}
          {items.map((item, index) => (
            <button
              key={`${item.kind}-${item.href}-${index}`}
              type="button"
              onMouseEnter={() => setActive(index)}
              onClick={() => go(item.href)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                active === index ? "bg-ink-700/70" : "hover:bg-ink-800/60",
              )}
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-ink-800 text-ink-400">
                {item.kind === "page" ? (
                  <item.icon className="h-3.5 w-3.5" />
                ) : (
                  <User className="h-3.5 w-3.5" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body text-ink-100">{item.label}</span>
                <span className="block truncate text-micro text-ink-500">
                  {item.kind === "page" ? "Go to page" : item.sub}
                </span>
              </span>
              {active === index && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-ink-500" />}
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
