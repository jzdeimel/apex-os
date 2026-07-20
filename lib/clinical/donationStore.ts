"use client";

import { useEffect, useState } from "react";
import { appendLedger } from "@/lib/trace/ledger";
import { getClient, clientName } from "@/lib/mock/clients";

/**
 * Blood-donation log.
 *
 * A donation is a clinical event with a downstream effect on haematocrit, so it
 * is recorded like one: it writes a ledger row against the patient, and it is
 * read back to compute the next eligible date and to annotate the HCT trend.
 *
 * HONESTY, SAME AS EVERYWHERE
 * ---------------------------
 * Client-side over localStorage at this stage, like the member dose log and the
 * break-glass grant. The ledger append is the load-bearing part and its shape is
 * already right — actor, subject, a typed action and a reason — so moving it to
 * a Postgres insert is mechanical. The store does NOT invent a post-donation
 * haematocrit; it records that a donation happened and when, and leaves the next
 * measured value to the next real panel.
 */

const KEY = "apex_donations_v1";

export type DonationKind = "red-cross" | "therapeutic-phlebotomy";

export interface Donation {
  id: string;
  clientId: string;
  date: string; // ISO date
  kind: DonationKind;
  note?: string;
}

export const KIND_LABEL: Record<DonationKind, string> = {
  "red-cross": "Blood donation (Red Cross)",
  "therapeutic-phlebotomy": "Therapeutic phlebotomy",
};

function read(): Donation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Donation[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(all: Donation[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
    window.dispatchEvent(new Event("apex-donations"));
  } catch {
    /* private mode / quota — the session copy still holds */
  }
}

export function logDonation(input: {
  clientId: string;
  date: string;
  kind: DonationKind;
  note?: string;
  actorId: string;
  actorName: string;
  actorRole: string;
}): Donation {
  const { clientId, date, kind, note, actorId, actorName, actorRole } = input;
  const subject = getClient(clientId);
  const id = `don-${date}-${kind}`;

  appendLedger({
    actorId,
    actorName,
    actorRole,
    action: "create",
    entity: "note",
    entityId: id,
    subjectId: clientId,
    subjectName: subject ? clientName(subject) : clientId,
    locationId: subject?.locationId,
    reason: `${KIND_LABEL[kind]} recorded${note ? ` — ${note}` : ""}`,
  });

  const all = read().filter((d) => d.id !== id);
  const next = [...all, { id, clientId, date, kind, note }].sort((a, b) => a.date.localeCompare(b.date));
  write(next);
  return next[next.length - 1];
}

/** Reactive donation history for one client. Hydration-safe: empty until read. */
export function useDonations(clientId: string) {
  const [donations, setDonations] = useState<Donation[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const sync = () => {
      setDonations(read().filter((d) => d.clientId === clientId));
      setHydrated(true);
    };
    sync();
    window.addEventListener("apex-donations", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("apex-donations", sync);
      window.removeEventListener("storage", sync);
    };
  }, [clientId]);

  return { donations, hydrated };
}
