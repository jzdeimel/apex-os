"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { BottomNav } from "@/components/layout/BottomNav";
import { CommandBar } from "@/components/CommandBar";
import { DemoTour } from "@/components/DemoTour";
import { usePortal } from "@/lib/portalStore";
import { IS_DEMO_UI } from "@/lib/publicConfig";
import { motion, AnimatePresence } from "framer-motion";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { portal, isEntry } = usePortal();
  const isMember = portal.id === "patient";

  // The entry screen is a pre-auth surface: no nav, no chrome, no tour.
  // It paints itself edge to edge.
  if (isEntry) return <>{children}</>;

  return (
    <div className="min-h-screen">
      {/* Portal accent wash — the ambient cue for "which surface am I in". */}
      <motion.div
        aria-hidden
        key={portal.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7 }}
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background: `radial-gradient(48rem 32rem at 10% -6%, ${portal.accent.hex}12, transparent 60%)`,
        }}
      />

      {/* A member has nothing to command and no product tour to take — both of
          these are operator affordances, and putting them on a member surface
          is how a patient portal ends up feeling like internal software. */}
      {!isMember && <CommandBar />}
      {!isMember && IS_DEMO_UI && <DemoTour />}
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <BottomNav />
      <div className="lg:pl-64">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 pb-24 lg:px-8 lg:py-8 lg:pb-8">
          {/*
            Route transition.

            This was an `<AnimatePresence mode="wait">` with an `exit` state, and
            it was the single worst bug in the app: roughly half of all
            client-side navigations rendered a blank page.

            Why it failed. `mode="wait"` keeps the outgoing element mounted so it
            can play its exit animation. But the element it kept renders
            `{children}` — and in the App Router that is ONE mutable slot, not a
            per-route tree. So when the router committed (immediately, for a
            prefetched Link), the *incoming* page's markup was swapped into the
            still-exiting node and animated down to `opacity: 0`. The presence
            swap then left it pinned there permanently. The content was in the
            DOM the entire time, fully readable to `innerText` — which is exactly
            why three separate automated sweeps reported "clean" while the owner
            was looking at an empty screen. Only `getComputedStyle().opacity`
            could see it.

            Why this version cannot regress. The keyed `div` remounts per route,
            so the animation restarts; but it is a CSS animation that ends on the
            visible frame, and the element's resting style is already visible.
            The transition can only ever move content TOWARDS being seen. There
            is no exit state, no retained node, and no JavaScript that can leave
            a page stuck invisible.
          */}
          <div key={pathname} className="animate-page-in">
            {children}
          </div>
        </main>
        <footer className="mx-auto w-full max-w-[1400px] px-4 pb-24 lg:px-8 lg:pb-10">
          <p className="border-t border-ink-800/60 pt-4 text-center text-micro text-ink-600">
            {IS_DEMO_UI
              ? "Apex — demonstration build. Synthetic data only. © Alpha Health."
              : "Apex OS — Alpha Health restricted clinical system. Authorized use only."}
          </p>
        </footer>
      </div>
    </div>
  );
}
