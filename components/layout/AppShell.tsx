"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { BottomNav } from "@/components/layout/BottomNav";
import { CommandBar } from "@/components/CommandBar";
import { DemoTour } from "@/components/DemoTour";
import { motion, AnimatePresence } from "framer-motion";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <CommandBar />
      <DemoTour />
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <BottomNav />
      <div className="lg:pl-64">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 pb-24 lg:px-8 lg:py-8 lg:pb-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
        <footer className="mx-auto w-full max-w-[1400px] px-4 pb-24 lg:px-8 lg:pb-10">
          <p className="border-t border-ink-800/60 pt-4 text-center text-[11px] text-ink-600">
            Apex — demonstration build. Simulated Mindbody data. No PHI, no
            real prescribing, no real fulfillment. © Alpha Health (demo).
          </p>
        </footer>
      </div>
    </div>
  );
}
