import { notFound } from "next/navigation";
import { FlaskConical } from "lucide-react";

import { currentPrincipal } from "@/lib/auth/principal";
import { actorFromPrincipal } from "@/lib/auth/actor";
import { can } from "@/lib/authz/capabilities";
import { isConfigured } from "@/lib/db/client";
import { readLabDrawQueue } from "@/lib/db/repo";
import { clientMap, clientName } from "@/lib/mock/clients";
import { locationMap } from "@/lib/mock/locations";
import { Badge } from "@/components/ui/primitives";
import type { LocationId } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * THE LAB DRAW QUEUE — the nurse's worklist.
 *
 * Matt Chilson, 2026-07-21: "the client's for lab draw, so this will go into a
 * lab draw queue... the nurse, Natalie in this case, would go and see the name
 * there. She'd open that up, it would show all the information that we could
 * pull from the intake paperwork."
 *
 * ── IT READS FROM POSTGRES, AND SAYS SO WHEN IT CANNOT ─────────────────────
 * Most surfaces in this app still read seeded fixtures. This one does not,
 * because a queue of fictional patients is worse than an empty one: a nurse who
 * learns the queue is decorative stops looking at it, and then the real one
 * goes unread too. With no database it says that plainly rather than falling
 * back to something that looks populated.
 */
export default async function LabDrawQueuePage() {
  const principal = await currentPrincipal();
  const actor = principal ? actorFromPrincipal(principal) : null;
  if (!actor || !can(actor, "read:clinical").allowed) notFound();

  if (!isConfigured) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="font-display text-3xl font-semibold text-ink-50">Lab draw queue</h1>
        <p className="mt-4 rounded-lg border border-watch/30 bg-watch/10 p-4 text-sm text-ink-200">
          There is no database configured for this environment, so there is no
          queue to show. This screen does not fall back to sample patients —
          a worklist you cannot trust is one nobody reads.
        </p>
      </div>
    );
  }

  let rows: Awaited<ReturnType<typeof readLabDrawQueue>> = [];
  let error: string | null = null;
  try {
    // Scoped to the locations this staff member covers. A nurse in Raleigh has
    // no business reading the Myrtle Beach queue, and scope is already carried
    // on the principal from the staff row.
    const all = await readLabDrawQueue();
    rows = all.filter((r) => actor.locationIds.includes(r.locationId));
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not read the queue.";
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-50">
          Lab draw queue
        </h1>
        <p className="mt-2 text-sm text-ink-300">
          Patients waiting for a draw, longest wait first. Opening one shows what
          intake already told us, so the only thing left to enter is vitals.
        </p>
      </header>

      {error && (
        <p className="rounded-lg border border-high/30 bg-high/10 p-4 text-sm text-high">
          {error}
        </p>
      )}

      {!error && rows.length === 0 && (
        <div className="rounded-lg border border-ink-700/60 bg-ink-900/30 p-8 text-center">
          <FlaskConical className="mx-auto h-6 w-6 text-ink-500" />
          <p className="mt-3 text-sm text-ink-300">Nobody is waiting for a draw.</p>
        </div>
      )}

      <ul className="space-y-2">
        {rows.map((r) => {
          const client = clientMap[r.clientId];
          return (
            <li
              key={r.segmentId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-700/60 bg-ink-900/30 p-4"
            >
              <div className="min-w-0">
                <div className="font-medium text-ink-100">
                  {client ? clientName(client) : r.clientId}
                </div>
                <div className="mt-0.5 text-xs text-ink-400">
                  {locationMap[r.locationId as LocationId]?.short ?? r.locationId} ·{" "}
                  {r.kind === "new-client-visit" ? "New client visit" : r.kind} · arrived{" "}
                  {new Date(r.startedAt).toISOString().slice(11, 16)} UTC
                </div>
              </div>
              <Badge tone={r.status === "in-progress" ? "watch" : "neutral"}>
                {r.status === "in-progress" ? "in progress" : "waiting"}
              </Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
