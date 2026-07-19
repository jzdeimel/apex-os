"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown, Eye, ShieldCheck } from "lucide-react";
import { VIEWER, PERSONAS, personaFor } from "@/lib/viewer";
import { usePortal } from "@/lib/portalStore";
import { PORTALS } from "@/lib/portals";

/**
 * Owner-only persona switcher.
 *
 * Renders for exactly one account. Everyone else sees their own identity chip
 * and nothing else — in the system Apex replaces the role switcher was visible
 * to every user, which let a coach put themselves in a clinician's view.
 *
 * Two things this deliberately is not:
 *  - It is not a permission grant. Sitting in the Medical seat does not let the
 *    owner sign a note; `can()` still resolves against their real role.
 *  - It is not anonymous. Anything done while switched still records the real
 *    signed-in account as the actor, which is why every write path takes an
 *    explicit viewer id rather than inferring one from the rendered view.
 */
export function PersonaSwitcher() {
  const router = useRouter();
  const { portal, setPortal } = usePortal();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = personaFor(portal.id);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Not the owner: a plain identity chip, no switching affordance at all.
  if (!VIEWER.canSwitchPersona) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-ink-800 bg-ink-900/70 px-2.5 py-1.5">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-[10px] font-bold text-ink-950">
          {VIEWER.initials}
        </span>
        <span className="hidden text-xs font-medium text-ink-200 sm:block">{VIEWER.name}</span>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-2 rounded-lg border border-ink-800 bg-ink-900/70 px-2.5 py-1.5 transition-colors hover:border-ink-700 focus-ring"
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-[10px] font-bold text-ink-950">
          {VIEWER.initials}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block truncate text-xs font-medium leading-tight text-ink-200">
            {VIEWER.name}
          </span>
          <span className="flex items-center gap-1 text-[10px] leading-tight text-ink-500">
            <Eye className="h-2.5 w-2.5" />
            viewing as {active.label}
          </span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-500" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-card"
          >
            <div className="border-b border-ink-800 px-3 py-2.5">
              <p className="text-[11px] font-medium text-ink-200">{VIEWER.name}</p>
              <p className="text-[10px] text-ink-500">{VIEWER.email}</p>
            </div>

            <div className="px-3 pb-1 pt-2">
              <p className="label-eyebrow">View the product as</p>
            </div>

            {PERSONAS.map((p) => {
              const def = PORTALS[p.id];
              const isActive = p.id === portal.id;
              return (
                <button
                  key={p.id}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => {
                    setPortal(p.id);
                    setOpen(false);
                    router.push(p.home);
                  }}
                  className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-ink-800 focus-ring"
                >
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: def.accent.hex }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className="text-[13px] font-medium text-ink-100">{p.label}</span>
                      <span className="text-[10px] text-ink-600">{p.who}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-ink-400">
                      as {p.asName}
                    </span>
                    <span className="block truncate text-[10px] text-ink-600">{p.asDetail}</span>
                  </span>
                  {isActive && <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-400" />}
                </button>
              );
            })}

            <div className="flex items-start gap-2 border-t border-ink-800 bg-ink-950/50 px-3 py-2.5">
              <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-optimal" />
              <p className="text-[10px] leading-relaxed text-ink-500">
                Owner preview. Switching changes what you see, never what you may
                do — anything you act on still records{" "}
                <span className="text-ink-400">{VIEWER.name}</span> as the actor.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
