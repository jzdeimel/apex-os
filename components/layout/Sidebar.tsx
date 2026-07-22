"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { AlphaMark, AlphaLogo } from "@/components/brand/AlphaLogo";
import { Activity, ChevronsUpDown, X, Check, LogOut } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { usePortal } from "@/lib/portalStore";
import { PORTAL_LIST } from "@/lib/portals";
import { PORTAL_NAV, filterNavByFeatures } from "@/lib/nav";
import { useFeatures, usePreset } from "@/lib/features/client";
import { SupportLink } from "@/components/SupportLink";
import { signOut } from "@/lib/auth/session";

export function Sidebar({
  mobileOpen,
  onClose,
}: {
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { portal, setPortal } = usePortal();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // Feature-filtered so the rail never offers a link the server would 404.
  const features = useFeatures();
  const preset = usePreset();
  const groups = filterNavByFeatures(PORTAL_NAV[portal.id], features, preset);

  // Longest-match so /clinic/ledger highlights Ledger, not Command Center.
  const activeHref = groups
    .flatMap((g) => g.items)
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          // `app-rail` re-scopes the ink variables to dark values inside this
          // element only (app/globals.css). Under the V1 skin the page canvas
          // is light and the rail stays dark — which is V1's actual design, and
          // the most recognisable thing about the app a coach opens daily.
          // Nothing else in this file changes between skins.
          "app-rail fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-ink-800 bg-ink-950/95 backdrop-blur-xl transition-transform lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Accent rail — the strongest "which portal" signal in the chrome. */}
        <motion.div
          aria-hidden
          className="absolute inset-y-0 left-0 w-px"
          animate={{
            background: `linear-gradient(180deg, transparent, ${portal.accent.hex}, transparent)`,
          }}
          transition={{ duration: 0.6 }}
        />

        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/" className="group flex items-center gap-2.5" onClick={onClose} aria-label="Alpha Health — home">
            {/* The real Alpha Health mark + wordmark. apex is dark, so the
                white-text lockup. */}
            <AlphaMark size={30} className="shrink-0 transition-transform group-hover:scale-105" />
            <AlphaLogo height={16} className="opacity-95" />
          </Link>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-100 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Portal switcher ──────────────────────────────────────── */}
        {/*
          AUDIT 1.1: this mapped ALL FIVE portals into links with no member gate,
          so a patient's own sidebar advertised "Medical Console · Providers &
          clinicians" and "Owner Console · Ownership" and one tap reached them.
          The switcher is an owner affordance for inspecting other surfaces, and
          it must not appear inside the surface being inspected.
        */}
        {portal.id !== "patient" && (
        <div className="relative mx-3 mb-2">
          <button
            onClick={() => setSwitcherOpen((v) => !v)}
            aria-expanded={switcherOpen}
            aria-haspopup="listbox"
            className="flex w-full items-center gap-2.5 rounded-xl border border-ink-800 bg-ink-900/60 px-3 py-2 text-left transition-colors hover:border-ink-700 focus-ring"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: portal.accent.hex }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-detail font-medium text-ink-100">
                {portal.label}
              </span>
              <span className="block truncate text-micro text-ink-500">
                {portal.persona}
              </span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-ink-500" />
          </button>

          {switcherOpen && (
            <motion.div
              role="listbox"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-card"
            >
              {PORTAL_LIST.map((p) => (
                <Link
                  key={p.id}
                  href={p.home}
                  role="option"
                  aria-selected={p.id === portal.id}
                  onClick={() => {
                    setPortal(p.id);
                    setSwitcherOpen(false);
                    onClose();
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-ink-800"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: p.accent.hex }}
                  />
                  <span className="flex-1 text-detail text-ink-200">{p.label}</span>
                  {p.id === portal.id && <Check className="h-3.5 w-3.5 text-ink-400" />}
                </Link>
              ))}
            </motion.div>
          )}
        </div>

        )}

        {/* ── Nav ──────────────────────────────────────────────────── */}
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-2">
          {groups.map((group, gi) => (
            <div key={group.section ?? `g-${gi}`} className="space-y-1">
              {group.section ? (
                <p className="px-3 pb-1 pt-1 text-micro font-semibold uppercase tracking-[0.16em] text-ink-600">
                  {group.section}
                </p>
              ) : (
                <div className="mx-3 border-t border-ink-800/70 pt-2" />
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = item.href === activeHref;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-body font-medium transition-colors",
                      active ? "text-ink-50" : "text-ink-300 hover:bg-ink-850 hover:text-ink-50",
                    )}
                  >
                    {/* Shared-layout pill slides between items instead of
                        popping — the single cheapest "premium" cue in the nav. */}
                    {active && (
                      <motion.span
                        layoutId="nav-active"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        className="absolute inset-0 rounded-xl bg-ink-800"
                        style={{ boxShadow: `inset 2px 0 0 ${portal.accent.hex}` }}
                      />
                    )}
                    <Icon
                      className={cn(
                        "relative h-[18px] w-[18px] transition-colors",
                        active ? portal.accent.text : "text-ink-500 group-hover:text-ink-300",
                      )}
                    />
                    <span className="relative flex-1">{item.label}</span>
                    {item.spotlight && !active && (
                      <span
                        className="relative h-1.5 w-1.5 animate-pulse-soft rounded-full"
                        style={{ background: portal.accent.hex }}
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="m-3 rounded-xl border border-ink-800 bg-ink-900/60 p-3">
          <p className="text-micro font-medium uppercase tracking-wide text-ink-300">
            Demo environment
          </p>
          <p className="mt-1 text-micro leading-relaxed text-ink-500">
            Mock data only. Not medical advice. Recommendations require licensed
            provider review.
          </p>
        </div>

        {/* Support sits in normal flow at the end of the nav, so it can never
            cover content the way a floating launcher does. */}
        <div className="mx-3 mb-3">
          <SupportLink />
        </div>

        {/* Sign out clears any member data held in this browser before handing
            off to EasyAuth logout — a shared clinic workstation must not leak
            the last person's record to the next. */}
        <button
          type="button"
          onClick={() => signOut()}
          className="focus-ring mx-3 mb-3 flex items-center gap-2 rounded-lg border border-ink-800 px-3 py-2 text-detail text-ink-400 transition-colors hover:border-ink-700 hover:text-ink-100"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </aside>
    </>
  );
}
