"use client";

import { Menu, Search, ShieldCheck, Phone, HeartPulse } from "lucide-react";
import Link from "next/link";
import { LocationFilter } from "@/components/LocationFilter";
import { NotificationBell } from "@/components/NotificationBell";
import { usePortal } from "@/lib/portalStore";
import { PersonaSwitcher } from "@/components/layout/PersonaSwitcher";
import { me } from "@/components/portal/PortalHeader";
import { BRAND } from "@/lib/brand";

/**
 * One header, three genuinely different products.
 *
 * The chrome is not "the same bar with a few things hidden" — the three
 * audiences want opposite things from it:
 *
 *  MEMBER   — almost nothing. No command palette (a member has nothing to
 *             command), no location filter (they belong to one clinic), no
 *             cross-practice counters. What they want at the top of the screen
 *             is reassurance and a way to reach a human, so that is what is
 *             there: their clinic, and the phone number.
 *  COACH    — speed. The palette is the primary navigation for someone working
 *             a queue all day, so it is wide and labelled with its shortcut.
 *  MEDICAL  — the same density, framed clinically, with the licensed-review
 *             disclaimer kept in view because they are the one signing.
 */
export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { portal } = usePortal();
  const isMember = portal.id === "patient";
  const member = isMember ? me() : null;

  const openCommand = () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true }),
    );
  };

  return (
    <header className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950/80 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-4 py-3 lg:px-6">
        <button
          onClick={onMenu}
          className="text-ink-300 hover:text-ink-50 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {isMember ? (
          /* ── Member: where you're cared for, and how to reach a person ── */
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm text-ink-300">
              <HeartPulse className="h-4 w-4 text-optimal" />
              <span className="truncate font-medium text-ink-100">
                {member ? member.firstName : "Your"} · Alpha Health
              </span>
            </span>
            <a
              href={`tel:${BRAND.telehealthPhone}`}
              className="hidden items-center gap-1.5 rounded-full border border-ink-800 bg-ink-900/60 px-2.5 py-1 text-[11px] text-ink-300 transition-colors hover:border-ink-700 hover:text-ink-100 focus-ring sm:inline-flex"
            >
              <Phone className="h-3 w-3" />
              {BRAND.telehealthPhone}
            </a>
          </div>
        ) : (
          /* ── Staff: the palette is the primary navigation ── */
          <>
            <button
              onClick={openCommand}
              className="relative hidden h-9 max-w-sm flex-1 items-center rounded-lg border border-ink-800 bg-ink-900/70 pl-9 pr-2 text-left text-sm text-ink-500 transition-colors hover:border-ink-700 sm:flex"
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
              {portal.id === "clinic" ? "Find a patient, lab or protocol…" : "Find a member, order or task…"}
              <kbd className="ml-auto rounded border border-ink-700 px-1.5 py-0.5 text-[10px] text-ink-500">
                ⌘K
              </kbd>
            </button>
            <button
              onClick={openCommand}
              className="text-ink-300 hover:text-ink-50 sm:hidden"
              aria-label="Search"
            >
              <Search className="h-5 w-5" />
            </button>
          </>
        )}

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {!isMember && <LocationFilter />}
          {!isMember && <NotificationBell />}
          <PersonaSwitcher />
        </div>
      </div>

      {/* Compliance ribbon — worded for whoever is reading it. */}
      <div className="flex items-center gap-2 border-t border-ink-800/60 bg-ink-900/40 px-4 py-1.5 lg:px-6">
        <ShieldCheck
          className="h-3.5 w-3.5 shrink-0"
          style={{ color: isMember ? "#34d399" : undefined }}
        />
        <p className="text-[11px] text-ink-400">
          {isMember ? (
            <>
              Demonstration build. Synthetic data — not a real health record, and
              not medical advice.
            </>
          ) : portal.id === "clinic" ? (
            <>
              Demo only. Apex proposes; a licensed clinician decides. Dosing and
              sign-off are yours alone.
            </>
          ) : (
            <>
              Demo only. Not medical advice. Anything clinical needs provider
              review before it reaches a member.
            </>
          )}
        </p>
      </div>
    </header>
  );
}
