"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import {
  PORTALS,
  isPortalId,
  portalForPath,
  type PortalDef,
  type PortalId,
} from "@/lib/portals";

/**
 * Tracks which portal the current session is "signed into".
 *
 * Two sources of truth, in priority order:
 *   1. the route  — a URL under /portal is unambiguously the client portal
 *   2. the choice — what was picked on the entry screen, for unowned routes
 *
 * The route wins because a shared link should render the right chrome without
 * the recipient having gone through the picker first.
 *
 * In production this is replaced by the session's identity class, which is why
 * the shape here is deliberately narrow: an id in, a definition out.
 */

const STORAGE_KEY = "apex_portal_v1";

interface PortalStore {
  /** The portal whose chrome should render right now. */
  portal: PortalDef;
  /** What the user explicitly chose at the entry screen, if anything. */
  chosen: PortalId | null;
  setPortal: (id: PortalId) => void;
  clearPortal: () => void;
  /** True on routes that own no portal (the entry screen). */
  isEntry: boolean;
}

const Ctx = createContext<PortalStore | null>(null);

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const [chosen, setChosen] = useState<PortalId | null>(null);
  const loaded = useRef(false);

  // Hydrate once. Guarded so the persist effect below can't write back an
  // empty value before we've read what was there.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (isPortalId(raw)) setChosen(raw);
    } catch {
      /* storage unavailable — the picker still works, it just won't persist */
    }
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      if (chosen) window.localStorage.setItem(STORAGE_KEY, chosen);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* no-op */
    }
  }, [chosen]);

  const fromRoute = portalForPath(pathname);
  const isEntry = fromRoute === null && pathname === "/";

  const portal = fromRoute ?? (chosen ? PORTALS[chosen] : PORTALS.clinic);

  const setPortal = useCallback((id: PortalId) => setChosen(id), []);
  const clearPortal = useCallback(() => setChosen(null), []);

  const value = useMemo<PortalStore>(
    () => ({ portal, chosen, setPortal, clearPortal, isEntry }),
    [portal, chosen, setPortal, clearPortal, isEntry],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePortal(): PortalStore {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // The entry screen renders above the provider during the very first paint
    // in some Next transitions; a safe default beats a crash on a demo.
    return {
      portal: PORTALS.clinic,
      chosen: null,
      setPortal: () => {},
      clearPortal: () => {},
      isEntry: false,
    };
  }
  return ctx;
}
