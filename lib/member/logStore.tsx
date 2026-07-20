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
 *
 * AUDIT FINDING (docs/audit/ENGAGEMENT.md, "the finding that subsumes every
 * other"): this store used to hold exactly ONE day. The restore was gated on
 * `parsed?.date === date`, so yesterday's log was parsed, found stale and
 * dropped on the floor. Nothing accumulated, which meant no streak, trend or
 * adherence surface in the product could ever read a real member action — they
 * all fell back to `seededRandom`. It now keeps a bounded `days[]` history and
 * `today` is derived from it.
 *
 * WHAT IS STILL NOT FIXED, and cannot be fixed here: the play and trend layers
 * (`lib/play/streak.ts`, `lib/symptoms/journal.ts`, `lib/daily/today.ts`) still
 * read their own seeded fiction. Giving them a real history to read is the
 * precondition for repointing them; the repoint itself is a separate change
 * across files this store does not own.
 */

export interface DoseLog {
  rxId: string;
  takenAt: string;
  /**
   * The medication's display name at the time it was logged.
   *
   * Denormalised on purpose. `undoDose` has to name the thing it is retracting
   * in the ledger, and it is handed only an rxId by the call site — a ledger row
   * reading "Member retracted rx-0d41f2" is not an audit record anybody can use.
   */
  name?: string;
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
  /**
   * Every day this device has a record for, oldest first, INCLUDING today.
   *
   * Exposed so streak, adherence and trend surfaces have something real to read
   * instead of a PRNG. Empty until the hydration effect has run — a consumer
   * that needs to distinguish "no history" from "not read yet" checks `hydrated`.
   */
  history: DayLog[];
  /** True once localStorage has been read, so the UI can avoid flashing. */
  hydrated: boolean;
  logDose(rxId: string, name: string, opts?: { site?: string }): void;
  skipDose(rxId: string, name: string, reason: string): void;
  undoDose(rxId: string): void;
  logWeight(lb: number): void;
  logFeel(answers: Record<string, number>): void;
  isDoseLogged(rxId: string): DoseLog | undefined;
}

/**
 * v2 — v1 stored a bare `DayLog`. The key is versioned rather than migrated in
 * place because a half-migrated clinical record is worse than a fresh one, and
 * a demo has nothing to lose by starting clean.
 */
const KEY = "apex_member_log_v2";

/**
 * How many days of history to keep on the device.
 *
 * Bounded because localStorage is a few megabytes shared with everything else on
 * the origin, and an unbounded array of days is a store that eventually starts
 * throwing on write. 180 covers two 12-week blocks with room over, which is
 * longer than any streak or trend surface in the app looks back.
 */
const MAX_DAYS = 180;

/**
 * One shared empty array for the pre-hydration frames.
 *
 * A fresh `[]` per render is a new identity, which walks straight through every
 * `useMemo` downstream and re-renders the whole portal on every paint until the
 * read effect lands. Cheap to get right, tedious to find later.
 */
const EMPTY_DAYS: DayLog[] = [];

const LogContext = createContext<LogState | null>(null);

function emptyDay(date: string): DayLog {
  return { date, doses: [] };
}

/** Ascending by date, capped to the most recent MAX_DAYS. */
function normalise(days: DayLog[]): DayLog[] {
  return [...days]
    .filter((d) => typeof d?.date === "string" && Array.isArray(d?.doses))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_DAYS);
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

  /**
   * The days AND whose days they are, held as one value.
   *
   * The owner is in the state rather than in a ref because the demo member is
   * switchable (`setDemoMember` in components/portal/PortalHeader.tsx) and this
   * provider is now mounted for the whole portal, so `clientId` really does
   * change under it. With two separate pieces of state there is one commit where
   * the prop says member B and `days` still holds member A's log — and the write
   * effect below would fire in that commit and save A's doses under B's key,
   * silently copying one member's medication record onto another's. A ref does
   * not fix it either: a ref set inside the read effect is already updated by
   * the time the write effect runs in the same commit. Tying the two together
   * means the mismatch is representable, checkable, and checked.
   */
  const [store, setStore] = useState<{ owner: string | null; days: DayLog[] }>({
    owner: null,
    days: [],
  });

  // The stored log is only this member's log once the owner matches. Until
  // then — first paint, and the commit after a member switch — it reads empty,
  // which is the honest answer to "what has this member logged".
  const hydrated = store.owner === clientId;
  const days = hydrated ? store.days : EMPTY_DAYS;

  // Read persisted state AFTER mount only. See the hydration note above.
  useEffect(() => {
    let loaded: DayLog[] = [];
    try {
      const raw = window.localStorage.getItem(`${KEY}:${clientId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as { days?: DayLog[] };
        if (Array.isArray(parsed?.days)) loaded = normalise(parsed.days);
      }
    } catch {
      // A corrupt or unavailable store must not take the page down with it.
    }
    setStore({ owner: clientId, days: loaded });
  }, [clientId]);

  /**
   * Today, derived rather than stored.
   *
   * A separate `today` state alongside the history is two copies of one fact,
   * and the previous version of this file demonstrated what happens: the copies
   * diverged and the history lost. Deriving it means a day rolling over is
   * automatically correct — yesterday's entry stays in `days` as history and
   * today starts empty, with no date-comparison branch to get wrong.
   */
  const today = useMemo(() => days.find((d) => d.date === date) ?? emptyDay(date), [days, date]);

  /**
   * Replace one day and keep the rest.
   *
   * The state update is a pure functional update and the write is a separate
   * effect below. Writing to storage inside the updater would work, but React
   * invokes updaters twice in development StrictMode, and a store whose
   * correctness depends on a reducer being called exactly once is a store that
   * breaks the first time somebody adds a concurrent feature.
   */
  const persist = useCallback(
    (next: DayLog) => {
      setStore((prev) =>
        // A write against a log that has not loaded yet would be a write against
        // an empty array, which is how a day gets silently erased. There is no
        // such window in practice — the UI is driven by state that is also empty
        // until then — but the guard costs nothing and the failure is a lost
        // clinical record.
        prev.owner !== clientId
          ? prev
          : { owner: prev.owner, days: normalise([...prev.days.filter((d) => d.date !== next.date), next]) },
      );
    },
    [clientId],
  );

  // Guarded on the owner so the empty initial state cannot overwrite what is
  // already stored before the read effect above has run, and so a member switch
  // cannot write the previous member's log to the new member's key. Same trick,
  // and the same reason, as `loaded` in lib/portalStore.tsx.
  useEffect(() => {
    if (store.owner !== clientId) return;
    try {
      window.localStorage.setItem(`${KEY}:${clientId}`, JSON.stringify({ days: store.days }));
    } catch {
      /* private mode, quota — the in-memory state still works for this session */
    }
  }, [store, clientId]);

  const logDose = useCallback(
    (rxId: string, name: string, opts?: { site?: string }) => {
      const entry: DoseLog = { rxId, takenAt: nowIso, name, site: opts?.site };
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
      const entry: DoseLog = { rxId, takenAt: nowIso, name, skipped: true, skipReason: reason };
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

  /**
   * Retract a dose the member logged by mistake.
   *
   * AUDIT FINDING (friction inventory #6): this used to filter local state and
   * write nothing. The original "Member recorded X as taken" row therefore sat
   * in the ledger forever, asserting an administration the member had explicitly
   * taken back — the one class of error an audit log exists to prevent.
   *
   * Fixed the way `components/coach/BulkBar.tsx:44-45` already does it: undo is
   * a COMPENSATING WRITE, not a delete. The ledger is append-only and
   * hash-chained (lib/trace/ledger.ts), so the original row stays and a second
   * row reverses it. "It was logged and then retracted" is the true fact about
   * that chart, and a store that can erase the first half is a store whose audit
   * trail means nothing.
   */
  const undoDose = useCallback(
    (rxId: string) => {
      const entry = today.doses.find((d) => d.rxId === rxId);
      persist({ ...today, doses: today.doses.filter((d) => d.rxId !== rxId) });
      // Nothing to reverse if there was nothing there — a double-tap on Undo
      // must not append a second retraction of a row that no longer exists.
      if (!entry) return;
      const what = entry.name ?? rxId;
      appendLedger({
        actorId: clientId,
        actorName: "Member",
        actorRole: "Patient",
        action: "update",
        entity: "protocol",
        entityId: rxId,
        subjectId: clientId,
        reason: entry.skipped
          ? `Member retracted the earlier "not taken" record for ${what} — reverses the row logged at ${entry.takenAt}`
          : `Member retracted the earlier "taken" record for ${what} — reverses the row logged at ${entry.takenAt}`,
      });
    },
    [today, persist, clientId],
  );

  const logWeight = useCallback(
    (lb: number) => {
      // AUDIT FINDING (friction inventory #4): a dead edit affordance in
      // QuickLog passed NaN straight through, which rendered "NaN lb logged" and
      // wrote "Member logged NaN lb" to the ledger. The affordance is now a real
      // edit control, and this is the backstop: a weight that is not a positive
      // finite number is not a weight, and refusing it here means no future
      // caller can put one on a chart either.
      if (!Number.isFinite(lb) || lb <= 0) return;
      const correcting = today.weightLb !== undefined;
      persist({ ...today, weightLb: lb });
      appendLedger({
        actorId: clientId,
        actorName: "Member",
        actorRole: "Patient",
        action: "update",
        entity: "chart",
        entityId: `weight-${date}`,
        subjectId: clientId,
        // A correction is a new row, never an edit of the old one — the earlier
        // figure and the fact that it was changed are both part of the record.
        reason: correcting
          ? `Member corrected today's weight to ${lb} lb, from ${today.weightLb} lb (self-reported)`
          : `Member logged weight ${lb} lb (self-reported)`,
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
    () => ({
      today,
      history: days,
      hydrated,
      logDose,
      skipDose,
      undoDose,
      logWeight,
      logFeel,
      isDoseLogged,
    }),
    [today, days, hydrated, logDose, skipDose, undoDose, logWeight, logFeel, isDoseLogged],
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
