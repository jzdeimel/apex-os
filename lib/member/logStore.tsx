"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { appendLedger } from "@/lib/trace/ledger";
import { absolute } from "@/lib/utils";

/**
 * What the member actually logged today.
 *
 * WHY THIS EXISTS
 * ---------------
 * The portal showed a protocol ring sitting at 50% and there was no way in the
 * entire application to move it. Nothing could be marked as taken. The rings
 * were a picture of adherence rather than a record of it, the doses card told a
 * member what to draw and then offered them nothing to press, and every genuine
 * logging action lived on some other screen.
 *
 * So a member opened the app, read a wall of cards, and left without recording
 * anything. That is the opposite of the product: a daily habit needs the thing
 * you came to do to be the thing in front of you.
 *
 * HYDRATION SAFETY — read this before changing the initial state.
 * State starts EMPTY and localStorage is read in an effect, never during
 * render. Seeding from storage at render time would make the server (which has
 * no storage) and the client disagree on the first paint, which is the exact
 * mismatch class that produced a fortnight of phantom bugs in this codebase.
 * The cost is one frame showing "not logged"; the alternative is a broken tree.
 *
 * PERSISTENCE. localStorage is right for a demo and wrong for production — it is
 * per-device, so a member logging on their phone would not see it on a laptop,
 * and clearing site data destroys a clinical record. In production this belongs
 * behind the same append-only ledger the rest of the app writes to. The shape
 * here is deliberately ledger-friendly so that swap is a transport change.
 */

export interface DoseLog {
  rxId: string;
  takenAt: string;
  /** Injection site chosen, where the item rotates sites. */
  site?: string;
  /** Set when the member records that they deliberately skipped it. */
  skipped?: boolean;
  skipReason?: string;
}

export interface DayLog {
  /** YYYY-MM-DD, in the clinic zone. */
  date: string;
  doses: DoseLog[];
  weightLb?: number;
  /** 1–5 ratings keyed by question. */
  feel?: Record<string, number>;
}

interface LogState {
  today: DayLog;
  /** True once localStorage has been read, so the UI can avoid flashing. */
  hydrated: boolean;
  logDose(rxId: string, name: string, opts?: { site?: string }): void;
  skipDose(rxId: string, name: string, reason: string): void;
  undoDose(rxId: string): void;
  logWeight(lb: number): void;
  logFeel(answers: Record<string, number>): void;
  isDoseLogged(rxId: string): DoseLog | undefined;
}

const KEY = "apex_member_log_v1";

const LogContext = createContext<LogState | null>(null);

function emptyDay(date: string): DayLog {
  return { date, doses: [] };
}

export function MemberLogProvider({
  children,
  clientId,
  /** The pinned demo clock. Never `new Date()` — see the hydration note above. */
  nowIso,
}: {
  children: React.ReactNode;
  clientId: string;
  nowIso: string;
}) {
  const date = nowIso.slice(0, 10);
  const [today, setToday] = useState<DayLog>(() => emptyDay(date));
  const [hydrated, setHydrated] = useState(false);

  // Read persisted state AFTER mount only.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`${KEY}:${clientId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as DayLog;
        // A log from a previous day is history, not today's state. Starting
        // fresh is correct; carrying it forward would show yesterday's doses as
        // already done.
        if (parsed?.date === date) setToday(parsed);
      }
    } catch {
      // A corrupt or unavailable store must not take the page down with it.
    }
    setHydrated(true);
  }, [clientId, date]);

  const persist = useCallback(
    (next: DayLog) => {
      setToday(next);
      try {
        window.localStorage.setItem(`${KEY}:${clientId}`, JSON.stringify(next));
      } catch {
        /* private mode, quota — the in-memory state still works for this session */
      }
    },
    [clientId],
  );

  const logDose = useCallback(
    (rxId: string, name: string, opts?: { site?: string }) => {
      const entry: DoseLog = { rxId, takenAt: nowIso, site: opts?.site };
      persist({ ...today, doses: [...today.doses.filter((d) => d.rxId !== rxId), entry] });
      // Self-reported, and recorded as such. A closed ring is a member saying
      // they took it, which is not the same as confirmation that they did — the
      // ledger says which, so nobody downstream mistakes one for the other.
      appendLedger({
        actorId: clientId,
        actorName: "Member",
        actorRole: "Patient",
        action: "update",
        entity: "protocol",
        entityId: rxId,
        subjectId: clientId,
        reason: `Member recorded ${name} as taken${opts?.site ? ` at ${opts.site}` : ""} (self-reported)`,
      });
    },
    [today, persist, nowIso, clientId],
  );

  const skipDose = useCallback(
    (rxId: string, name: string, reason: string) => {
      const entry: DoseLog = { rxId, takenAt: nowIso, skipped: true, skipReason: reason };
      persist({ ...today, doses: [...today.doses.filter((d) => d.rxId !== rxId), entry] });
      appendLedger({
        actorId: clientId,
        actorName: "Member",
        actorRole: "Patient",
        action: "update",
        entity: "protocol",
        entityId: rxId,
        subjectId: clientId,
        reason: `Member recorded ${name} as not taken — ${reason}`,
      });
    },
    [today, persist, nowIso, clientId],
  );

  const undoDose = useCallback(
    (rxId: string) => {
      persist({ ...today, doses: today.doses.filter((d) => d.rxId !== rxId) });
    },
    [today, persist],
  );

  const logWeight = useCallback(
    (lb: number) => {
      persist({ ...today, weightLb: lb });
      appendLedger({
        actorId: clientId,
        actorName: "Member",
        actorRole: "Patient",
        action: "update",
        entity: "chart",
        entityId: `weight-${date}`,
        subjectId: clientId,
        reason: `Member logged weight ${lb} lb (self-reported)`,
      });
    },
    [today, persist, clientId, date],
  );

  const logFeel = useCallback(
    (answers: Record<string, number>) => {
      persist({ ...today, feel: answers });
      appendLedger({
        actorId: clientId,
        actorName: "Member",
        actorRole: "Patient",
        action: "update",
        entity: "note",
        entityId: `checkin-${date}`,
        subjectId: clientId,
        reason: `Member completed the daily check-in (${Object.keys(answers).length} answers)`,
      });
    },
    [today, persist, clientId, date],
  );

  const isDoseLogged = useCallback(
    (rxId: string) => today.doses.find((d) => d.rxId === rxId),
    [today],
  );

  const value = useMemo(
    () => ({ today, hydrated, logDose, skipDose, undoDose, logWeight, logFeel, isDoseLogged }),
    [today, hydrated, logDose, skipDose, undoDose, logWeight, logFeel, isDoseLogged],
  );

  return <LogContext.Provider value={value}>{children}</LogContext.Provider>;
}

export function useMemberLog(): LogState {
  const ctx = useContext(LogContext);
  if (!ctx) throw new Error("useMemberLog must be used inside MemberLogProvider");
  return ctx;
}

/** Injection sites, in the order a rotation actually walks them. */
export const INJECTION_SITES = [
  "Abdomen — left",
  "Abdomen — right",
  "Thigh — left",
  "Thigh — right",
  "Glute — left",
  "Glute — right",
];

/**
 * Next site in the rotation, given what was used most recently.
 *
 * Rotation matters clinically — repeatedly injecting one site causes local
 * tissue changes that alter absorption — so the app suggests rather than making
 * the member remember. It is a suggestion, not a lock: the member can pick any
 * site, because they know things the app does not, like which side is bruised.
 */
export function suggestNextSite(recent: string[]): string {
  if (!recent.length) return INJECTION_SITES[0];
  const lastIndex = INJECTION_SITES.indexOf(recent[recent.length - 1]);
  if (lastIndex < 0) return INJECTION_SITES[0];
  return INJECTION_SITES[(lastIndex + 1) % INJECTION_SITES.length];
}

/** Convenience for surfaces that want "did they do everything today". */
export function dayCompletion(day: DayLog, dosesDue: number): {
  logged: number;
  due: number;
  complete: boolean;
} {
  const logged = day.doses.filter((d) => !d.skipped).length;
  return { logged, due: dosesDue, complete: dosesDue > 0 && logged >= dosesDue };
}
