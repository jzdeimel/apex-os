"use client";

import { useEffect, useState } from "react";

/**
 * The signed-in staff member, in a client component.
 *
 * WHY THIS EXISTS
 * ---------------
 * `lib/viewer.ts` exports a hardcoded `VIEWER` account, and several modules
 * used it to stamp ledger rows — `lib/labs/ingest.ts` attributed every lab
 * import to it. A ledger row attributed to a constant is worse than a missing
 * one: it is a false statement about who touched a clinical record, and when
 * read back it is indistinguishable from a true one. The hash chain exists to
 * answer "who did this", and a fixed answer voids the answer without breaking
 * the chain.
 *
 * A client component cannot call `currentPrincipal()` — `headers()` is a server
 * API, and an identity a client component could compute is an identity it could
 * lie about. So it asks the server, which resolves the Entra principal against
 * the staff table and answers with what it found.
 *
 * ── NULL IS A REAL STATE AND CALLERS MUST HANDLE IT ────────────────────────
 * `null` covers three cases that all mean the same thing operationally: not
 * loaded yet, not authenticated, and authenticated but unmapped to a staff row.
 * None of them may be defaulted into an actor. A caller that needs to write
 * must disable the control until this resolves — which is the honest behaviour
 * anyway, because a write it cannot attribute is a write it should not make.
 */
export interface CurrentStaff {
  id: string;
  name: string;
  role: string;
}

/** Module-level cache — the answer does not change within a session. */
let cached: CurrentStaff | null | undefined;
let inflight: Promise<CurrentStaff | null> | null = null;

async function load(): Promise<CurrentStaff | null> {
  if (cached !== undefined) return cached;
  if (inflight) return inflight;

  inflight = fetch("/api/me", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      // `mapped` false means authenticated with no staff record — no role, no
      // capabilities, and therefore not an actor. See app/api/me/route.ts.
      const staff =
        j && j.authenticated && j.mapped && j.staffId && j.role
          ? { id: j.staffId as string, name: (j.name as string) ?? j.staffId, role: j.role as string }
          : null;
      cached = staff;
      return staff;
    })
    .catch(() => {
      // Deliberately NOT cached — a network blip must not pin "unauthenticated"
      // for the rest of the session.
      return null;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function useCurrentStaff(): CurrentStaff | null {
  const [staff, setStaff] = useState<CurrentStaff | null>(cached ?? null);

  useEffect(() => {
    let alive = true;
    void load().then((s) => {
      if (alive) setStaff(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  return staff;
}
