"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown, Eye, ShieldCheck } from "lucide-react";
import { VIEWER, PERSONAS, personaFor, DEMO_MEMBERS } from "@/lib/viewer";
import { usePortal } from "@/lib/portalStore";
import { PORTALS } from "@/lib/portals";
import { ME, useMe, setDemoMember } from "@/components/portal/PortalHeader";
import { getClient } from "@/lib/mock/clients";

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

  // Which chart the Member seat renders. DEMO AFFORDANCE — see DEMO_MEMBERS in
  // lib/viewer.ts for why this control exists at all.
  const meId = useMe();
  const meClient = getClient(meId);

  /**
   * One forced re-render after the stored choice is restored.
   *
   * `useMe()` is hydration-safe by design: it returns the default on the server
   * and on the first client render, then the persisted id arrives one commit
   * later. Subscribers pick that up on their own. Topbar does not subscribe —
   * it calls the non-reactive `me()` accessor and sits ABOVE this component, so
   * a returning viewer would see "Jake · Alpha Health" in the header while the
   * page below greeted a different member. Refreshing the route once, only when
   * a non-default member was actually restored, re-renders the header with the
   * right name. Guarded by a ref so it cannot become a loop.
   */
  const refreshed = useRef(false);
  useEffect(() => {
    if (refreshed.current || meId === ME) return;
    refreshed.current = true;
    router.refresh();
  }, [meId, router]);

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
        <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-micro font-bold text-ink-950">
          {VIEWER.initials}
        </span>
        <span className="hidden text-detail font-medium text-ink-200 sm:block">{VIEWER.name}</span>
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
        <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-micro font-bold text-ink-950">
          {VIEWER.initials}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block truncate text-detail font-medium leading-tight text-ink-200">
            {VIEWER.name}
          </span>
          <span className="flex items-center gap-1 text-micro leading-tight text-ink-500">
            <Eye className="h-2.5 w-2.5" />
            {/* In the Member seat the seat name alone is ambiguous now that the
                subject can change — say WHOSE chart is on screen. */}
            viewing as {active.label}
            {portal.id === "patient" && meClient ? ` · ${meClient.firstName}` : ""}
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
            /* max-h + scroll, not overflow-hidden: the menu grew from three
               rows to eight when the member picker was added, and on a short
               laptop viewport the fixed-height version silently clipped the
               last members off the bottom with no way to reach them. */
            className="absolute right-0 top-full z-50 mt-1.5 max-h-[min(80vh,34rem)] w-72 overflow-y-auto overscroll-contain rounded-xl border border-ink-700 bg-ink-900 shadow-card"
          >
            <div className="border-b border-ink-800 px-3 py-2.5">
              <p className="text-micro font-medium text-ink-200">{VIEWER.name}</p>
              <p className="text-micro text-ink-500">{VIEWER.email}</p>
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
                      <span className="text-detail font-medium text-ink-100">{p.label}</span>
                      <span className="text-micro text-ink-600">{p.who}</span>
                    </span>
                    {/* The Member seat's subject is selectable now, so its
                        label has to follow the selection — a static
                        "as Jake Morrison" would contradict the picker directly
                        below it. Staff seats are still fixed records. */}
                    <span className="mt-0.5 block truncate text-micro text-ink-400">
                      as{" "}
                      {p.id === "patient" && meClient
                        ? `${meClient.firstName} ${meClient.lastName}`
                        : p.asName}
                    </span>
                    <span className="block truncate text-micro text-ink-600">
                      {p.id === "patient" && meClient
                        ? `${meClient.sex === "female" ? "Female" : "Male"} · ${meClient.age}`
                        : p.asDetail}
                    </span>
                  </span>
                  {isActive && <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-400" />}
                </button>
              );
            })}

            {/* ------------------------------------------------------------ */}
            {/* Which member the Member seat renders.                        */}
            {/*                                                              */}
            {/* Nested under the persona list rather than given its own      */}
            {/* control, because it is a refinement of one seat and not a    */}
            {/* fourth seat. Picking a name also enters the Member seat —    */}
            {/* choosing a chart you then have to navigate to would be two   */}
            {/* steps for one intent.                                        */}
            {/*                                                              */}
            {/* Audit fix: the portal used to be hard-wired to a single male */}
            {/* subject, which made the female lab reference windows and the */}
            {/* entire women's education track unreachable in any demo.      */}
            {/* ------------------------------------------------------------ */}
            <div className="border-t border-ink-800 px-3 pb-1 pt-2.5">
              <p className="label-eyebrow">Member seat renders as</p>
            </div>

            {DEMO_MEMBERS.map((m) => {
              const c = getClient(m.id);
              if (!c) return null;
              const isMe = c.id === meId;
              return (
                <button
                  key={m.id}
                  /* Deliberately NOT role="option": this menu is already a
                     single-select listbox of seats, and a second selected
                     option inside it would announce two current choices. These
                     are plain buttons that refine the seat above. */
                  aria-current={isMe ? "true" : undefined}
                  onClick={() => {
                    setDemoMember(m.id);
                    setPortal("patient");
                    setOpen(false);
                    router.push("/portal");
                    // The portal pages subscribe and update themselves; the
                    // topbar above this menu does not, so nudge the route once.
                    router.refresh();
                  }}
                  className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-ink-800 focus-ring"
                >
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: c.avatarColor }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-detail text-ink-100">
                      {c.firstName} {c.lastName}
                      <span className="ml-1.5 text-micro text-ink-600">
                        {/* Sex and age are the two facts that decide which
                            reference ranges and which education track this
                            chart renders with — so they are the label. */}
                        {c.sex === "female" ? "F" : "M"} · {c.age}
                      </span>
                    </span>
                    <span className="block truncate text-micro text-ink-500">{m.why}</span>
                  </span>
                  {isMe && <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-400" />}
                </button>
              );
            })}

            <div className="flex items-start gap-2 border-t border-ink-800 bg-ink-950/50 px-3 py-2.5">
              <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-optimal" />
              <p className="text-micro leading-relaxed text-ink-500">
                Owner preview. Switching changes what you see, never what you may
                do — anything you act on still records{" "}
                <span className="text-ink-400">{VIEWER.name}</span> as the actor.
                Choosing a member is a demo control over synthetic records; a
                real member portal has one subject and no picker.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
