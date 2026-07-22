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
import { MotionConfig } from "framer-motion";
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

/**
 * The gamification opt-out.
 *
 * AUDIT FINDING P0-1 (docs/audit/ENGAGEMENT.md): there was no way to turn any of
 * this off. A grep for `hideXp|gamif|optOut|showXp` returned zero matches
 * repo-wide. A member who wanted none of it still got StreakCard, the season and
 * quest board, LevelCard with confetti, and the streak tiles on Progress.
 *
 * The argument for the switch is one the codebase already makes about
 * notifications — `components/portal/NotificationPrefs.tsx:250`: *"A reminder
 * system you can't turn down isn't encouragement, it's pestering."* The same
 * sentence is true of a scoreboard, and it was never applied to display.
 *
 * It is safe to honour because the clinical product does not depend on it: labs,
 * protocol, journal, messages, plan-of-care and consents read nothing from
 * `lib/play/*`. Turning this off removes motivation furniture and no care.
 *
 * REJECTED: defaulting to OFF. That would be a different product decision made
 * by an audit fix, and it would hide the mechanics from members who like them.
 * The defect is the absence of a choice, not the default.
 *
 * HYDRATION: defaults to `true` and reads storage in an effect, never during
 * render — same discipline as `chosen` below and as `lib/member/logStore.tsx`.
 * A member who has opted out sees one frame of the cards before they go. The
 * alternative is a server/client disagreement on first paint, which is the bug
 * class this codebase has paid for repeatedly.
 */
const PLAY_KEY = "apex_play_v1";

interface PortalStore {
  /** The portal whose chrome should render right now. */
  portal: PortalDef;
  /** What the user explicitly chose at the entry screen, if anything. */
  chosen: PortalId | null;
  setPortal: (id: PortalId) => void;
  clearPortal: () => void;
  /** True on routes that own no portal (the entry screen). */
  isEntry: boolean;
  /** False when the member has switched off streaks, points, quests and seasons. */
  playOn: boolean;
  setPlayOn: (next: boolean) => void;
}

const Ctx = createContext<PortalStore | null>(null);

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const [chosen, setChosen] = useState<PortalId | null>(null);
  const [playOn, setPlayOnState] = useState(true);
  const loaded = useRef(false);

  // Hydrate once. Guarded so the persist effect below can't write back an
  // empty value before we've read what was there.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (isPortalId(raw)) setChosen(raw);
      // Only an explicit "off" turns it off. A missing key, a corrupt value or
      // unavailable storage all mean "the member never said", which is on.
      if (window.localStorage.getItem(PLAY_KEY) === "off") setPlayOnState(false);
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

  /**
   * Pre-auth surfaces render bare — no sidebar, no topbar, no app chrome.
   *
   * The entry screen, the public booking page and a tokenized intake link are
   * all seen by someone who is not signed in and may not be a member yet. The
   * intake link in particular gets opened by a stranger from an SMS, so leaking
   * any operator chrome onto it would be both wrong and alarming.
   *
   * The emergency card is the sharpest case: it is held up to a triage nurse by
   * someone who may be unable to speak for themselves. It must render instantly,
   * with no login, no navigation and nothing to tap — anything resembling an app
   * around it is noise at the worst possible moment.
   */
  const isEntry =
    (fromRoute === null && pathname === "/") ||
    pathname === "/book" ||
    pathname === "/demo" ||
    pathname === "/patient-sign-in" ||
    pathname.startsWith("/intake/") ||
    pathname.startsWith("/card/");

  const portal = fromRoute ?? (chosen ? PORTALS[chosen] : PORTALS.patient /* AUDIT: least privilege. The fallback for an unknown
      viewer was PORTALS.clinic, so anyone the app could not identify became a
      clinician by default — the same inversion as the localStorage role that
      defaulted to "Medical". The safe default is the surface with the least
      reach. */);

  const setPortal = useCallback((id: PortalId) => setChosen(id), []);
  const clearPortal = useCallback(() => setChosen(null), []);

  // Written on the click rather than in a persist effect. The effect pattern
  // used for `chosen` needs the `loaded` guard to avoid clobbering storage
  // before the read; a preference that only ever changes from a deliberate tap
  // has no such race, and writing at the source keeps the two concerns apart.
  const setPlayOn = useCallback((next: boolean) => {
    setPlayOnState(next);
    try {
      window.localStorage.setItem(PLAY_KEY, next ? "on" : "off");
    } catch {
      /* private mode, quota — the choice still holds for this session */
    }
  }, []);

  const value = useMemo<PortalStore>(
    () => ({ portal, chosen, setPortal, clearPortal, isEntry, playOn, setPlayOn }),
    [portal, chosen, setPortal, clearPortal, isEntry, playOn, setPlayOn],
  );

  // Motion authority. The old behaviour deferred entirely to the OS
  // `prefers-reduced-motion` setting — so a viewer whose system had animations
  // turned off (common on Windows) saw a completely static app while the code
  // insisted it was "alive". Now the in-app `playOn` toggle is the authority and
  // defaults ON, so motion shows for everyone by default and can be turned off:
  //  - MotionConfig reducedMotion="never" makes framer-motion animate regardless
  //    of the OS flag (this is what un-freezes the 26 components that gated on
  //    useReducedMotion); "user" hands control back to the OS when the member
  //    deliberately turns motion off.
  //  - the `data-motion` attribute drives the CSS reduce-motion block, which now
  //    keys off the app choice instead of the OS media query.
  useEffect(() => {
    document.documentElement.setAttribute("data-motion", playOn ? "on" : "off");
  }, [playOn]);

  return (
    <Ctx.Provider value={value}>
      <MotionConfig reducedMotion={playOn ? "never" : "user"}>{children}</MotionConfig>
    </Ctx.Provider>
  );
}

export function usePortal(): PortalStore {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // The entry screen renders above the provider during the very first paint
    // in some Next transitions; a safe default beats a crash on a demo.
    return {
      portal: PORTALS.patient /* AUDIT: least privilege. The fallback for an unknown
      viewer was PORTALS.clinic, so anyone the app could not identify became a
      clinician by default — the same inversion as the localStorage role that
      defaulted to "Medical". The safe default is the surface with the least
      reach. */,
      chosen: null,
      setPortal: () => {},
      clearPortal: () => {},
      isEntry: false,
      playOn: true,
      setPlayOn: () => {},
    };
  }
  return ctx;
}

/**
 * Narrow hook for the play surfaces, so a streak card does not have to know
 * what a portal is. Every component under `lib/play/*` gates on this.
 *
 * The `on` default outside a provider is `true` for the same reason the SSR
 * default is: a card that silently disappears because a context was missing is
 * a much harder bug to see than one that renders when it should not.
 */
export function useGamification(): { on: boolean; setOn: (next: boolean) => void } {
  const { playOn, setPlayOn } = usePortal();
  return { on: playOn, setOn: setPlayOn };
}
