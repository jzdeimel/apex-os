"use client";

import Link from "next/link";
import { Siren, Clock, CheckCircle2, ArrowUpRight } from "lucide-react";
import {
  slaState,
  formatSla,
  isResolved,
} from "@/lib/escalations/queue";
import type { Escalation } from "@/lib/escalations/types";
import { useEscalations } from "@/components/escalations/useEscalations";
import { staffName } from "@/lib/mock/staff";
import { getClient, clientName } from "@/lib/mock/clients";
import { Card, CardContent, Badge, EmptyState } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";

/**
 * The coach's side of an escalation.
 *
 * This is the half the audited system has no equivalent for at all. There, a
 * coach flags something for a provider by saying it out loud or sending a text
 * — and then has no way to find out whether it landed, whether anyone picked it
 * up, or what the answer was. The member asks "what did the doctor say?" and
 * the coach has to go chase a human to find out.
 *
 * An escalation nobody can see the state of is the same as no escalation. So
 * both sides read the same record: the provider works it from
 * /clinic/escalations, and the coach watches it here, with the same clock.
 */

function StateBadge({ e, now }: { e: Escalation; now: string }) {
  if (isResolved(e)) {
    return (
      <Badge tone="optimal">
        <CheckCircle2 className="h-3 w-3" />
        {e.status}
      </Badge>
    );
  }
  const state = slaState(e, now);
  return (
    <Badge tone={state === "overdue" ? "high" : state === "due-soon" ? "watch" : "neutral"}>
      <Clock className="h-3 w-3" />
      {formatSla(e, now)}
    </Badge>
  );
}

/** Escalations raised on one member — rendered on the client 360. */
export function ClientEscalations({ clientId }: { clientId: string }) {
  const { items: list, now, loading, error } = useEscalations({ clientId });

  if (loading) return <p className="text-detail text-ink-500">Loading escalation history…</p>;
  if (error) {
    return (
      <p className="rounded-lg border border-critical/35 bg-critical/10 px-3 py-2 text-detail text-critical">
        Escalation history unavailable: {error}
      </p>
    );
  }

  if (list.length === 0) {
    return (
      <EmptyState
        icon={<Siren className="h-6 w-6" />}
        title="Nothing waiting on a provider"
        hint="Flag something from a consult and it lands in their queue with a clock on it."
      />
    );
  }

  return (
    <div className="space-y-3">
      {list.map((e) => (
        <div key={e.id}>
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={e.priority === "Urgent" ? "high" : e.priority === "Prompt" ? "watch" : "neutral"}>
                      {e.priority}
                    </Badge>
                    <Badge tone="neutral">{e.kind}</Badge>
                    <StateBadge e={e} now={now} />
                  </div>
                  <p className="mt-2 text-body text-ink-100">{e.question}</p>
                  {e.sourceQuote && (
                    <blockquote className="mt-2 border-l-2 border-ink-700 pl-3 text-detail italic leading-relaxed text-ink-500">
                      {e.sourceQuote}
                    </blockquote>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink-800/60 pt-2.5 text-micro text-ink-500">
                <span>
                  Raised by <span className="text-ink-300">{staffName(e.raisedByStaffId)}</span>
                </span>
                <span className="stat-mono">{formatDateTime(e.raisedAt)}</span>
                <span>·</span>
                <span>
                  With <span className="text-ink-300">{staffName(e.assignedToStaffId)}</span>
                </span>
              </div>

              {e.answer ? (
                <div className="mt-3 rounded-lg border border-optimal/25 bg-optimal/5 p-3">
                  <p className="label-eyebrow text-optimal">
                    Answer from {staffName(e.answeredByStaffId ?? e.assignedToStaffId)}
                  </p>
                  <p className="mt-1.5 text-detail leading-relaxed text-ink-200">{e.answer}</p>
                  {e.answeredAt && (
                    <p className="stat-mono mt-1.5 text-micro text-ink-600">
                      {formatDateTime(e.answeredAt)}
                    </p>
                  )}
                  {/* The sentence a coach can read straight to the member. */}
                  <p className="mt-2 text-micro text-ink-500">
                    Safe to relay to the member.
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-micro text-ink-500">
                  Nothing to relay yet — you can tell the member their provider is reviewing it.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}

/** Compact strip for the coach's Today page: what I'm still waiting on. */
export function CoachWaitingOn({ coachId }: { coachId: string }) {
  const { items, now, loading, error } = useEscalations({ raisedBy: coachId });
  const open = items.filter((e) => !isResolved(e));
  const answered = items.filter((e) => e.status === "Answered");

  if (loading || error || (open.length === 0 && answered.length === 0)) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="label-eyebrow">Waiting on a provider</p>
          <div className="flex items-center gap-2">
            {answered.length > 0 && (
              <Badge tone="optimal">
                {answered.length} answered — ready to relay
              </Badge>
            )}
            <Badge tone={open.length > 0 ? "watch" : "neutral"}>{open.length} open</Badge>
          </div>
        </div>

        <ul className="mt-3 space-y-2">
          {[...answered, ...open].slice(0, 4).map((e) => {
            const client = getClient(e.clientId);
            return (
              <li key={e.id}>
                <Link
                  href={`/clients/${e.clientId}`}
                  className="flex items-start gap-2.5 rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2 transition-colors hover:border-ink-700 focus-ring"
                >
                  <StateBadge e={e} now={now} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-ink-100">
                      {client ? clientName(client) : e.clientId}
                    </span>
                    <span className="block truncate text-micro text-ink-500">{e.question}</span>
                  </span>
                  <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-600" />
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
