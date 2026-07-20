"use client";

import { useEffect, useState } from "react";
import { appendLedger } from "@/lib/trace/ledger";
import { staffMap } from "@/lib/mock/staff";
import { getClient, clientName } from "@/lib/mock/clients";
import { absolute } from "@/lib/utils";

/**
 * Break-glass emergency access.
 *
 * WHAT IT IS
 * ----------
 * The sanctioned exception to the location boundary. `canViewClient`
 * (lib/access/clientScope.ts) refuses a staff member a chart outside their
 * assigned locations — which is correct almost always and catastrophic in the
 * one case that matters: a patient collapses at a clinic they do not normally
 * attend, and the provider in front of them needs the chart NOW. A boundary
 * with no emergency override is not a safety feature, it is a hazard with good
 * intentions.
 *
 * WHY IT IS SAFE TO HAVE
 * ----------------------
 * Break-glass is not a loophole; it is the most heavily witnessed action in the
 * system. Opening it:
 *   1. Requires a typed justification. No reason, no access — the friction is
 *      the point, because a reason someone had to write is a reason they can be
 *      asked about later.
 *   2. Writes a `break-glass` ledger row, which is a first-class action the
 *      member's own access log renders in red as "Used emergency access on your
 *      chart". The patient sees it. That visibility is the deterrent.
 *   3. Is time-boxed. The grant expires, so it is an emergency window, not a
 *      standing elevation. A provider who needs ongoing access to an
 *      out-of-location patient should be reassigned, not living on break-glass.
 *
 * The capability model already anticipated this (lib/authz/capabilities.ts:
 * `admin:break-glass`, and `can()` honours `actor.breakGlass`), and the
 * location refusal already points here. This module is the missing verb.
 *
 * HOW FAR IT GOES, HONESTLY
 * -------------------------
 * Client-side, over the in-memory ledger, like everything else at this stage.
 * The grant lives in localStorage and the ledger row does not survive a restart
 * yet. In production the grant is a server session and the row is durable — but
 * the SHAPE is already right: a real ledger append with a real reason, which is
 * the part that has to be correct for this to mean anything.
 */

const KEY = "apex_breakglass_v1";
/** Emergency windows are short on purpose — this is not a standing grant. */
const WINDOW_MS = 60 * 60 * 1000;

interface Grant {
  staffId: string;
  clientId: string;
  openedAt: string;
  reason: string;
}

/* -------------------------------------------------------------------------- */
/* Store                                                                       */
/* -------------------------------------------------------------------------- */

function readGrants(): Grant[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Grant[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeGrants(grants: Grant[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(grants));
    // Same-tab subscribers do not get the native `storage` event, so nudge them.
    window.dispatchEvent(new Event("apex-breakglass"));
  } catch {
    /* private mode / quota — the in-memory read still works this session */
  }
}

function isLive(g: Grant, nowIso: string): boolean {
  return absolute(nowIso).getTime() - absolute(g.openedAt).getTime() < WINDOW_MS;
}

/**
 * Open an emergency window and write the witnessed record.
 *
 * The ledger append is the load-bearing line. A break-glass that opened the
 * chart but did not write the row would be the exact failure this whole product
 * is audited against — an action that claims to be accountable and is not.
 */
export function openBreakGlass(input: {
  staffId: string;
  clientId: string;
  reason: string;
  nowIso: string;
}): void {
  const { staffId, clientId, reason, nowIso } = input;
  const actor = staffMap[staffId];
  const subject = getClient(clientId);

  appendLedger({
    actorId: staffId,
    actorName: actor?.name ?? staffId,
    actorRole: actor?.role ?? "Medical",
    action: "break-glass",
    entity: "chart",
    entityId: clientId,
    subjectId: clientId,
    subjectName: subject ? clientName(subject) : clientId,
    locationId: subject?.locationId,
    reason,
  });

  const grants = readGrants().filter((g) => !(g.staffId === staffId && g.clientId === clientId));
  grants.push({ staffId, clientId, openedAt: nowIso, reason });
  writeGrants(grants);
}

/** Is there a live emergency window for this staff member on this chart? */
export function hasBreakGlass(staffId: string | null, clientId: string, nowIso: string): boolean {
  if (!staffId) return false;
  return readGrants().some(
    (g) => g.staffId === staffId && g.clientId === clientId && isLive(g, nowIso),
  );
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Reactive break-glass state for a chart.
 *
 * Hydration-safe on the same terms as logStore: starts closed, reads storage in
 * an effect, never during render. The cost is one frame showing the gate before
 * an open window is recognised, which is correct — defaulting OPEN before we
 * have read anything would grant access on a guess.
 */
export function useBreakGlass(staffId: string | null, clientId: string, nowIso: string) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () => setOpen(hasBreakGlass(staffId, clientId, nowIso));
    sync();
    window.addEventListener("apex-breakglass", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("apex-breakglass", sync);
      window.removeEventListener("storage", sync);
    };
  }, [staffId, clientId, nowIso]);

  const open_ = (reason: string) => {
    if (!staffId) return;
    openBreakGlass({ staffId, clientId, reason, nowIso });
    setOpen(true);
  };

  return { open, breakTheGlass: open_ };
}
