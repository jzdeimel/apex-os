"use client";

import * as React from "react";
import { Check, MessageSquareText } from "lucide-react";
import {
  formatTargetDate,
  reactorLabel,
  targetNoun,
  useReactionsForClient,
  type Reaction,
} from "@/lib/member/reactions";
import { staffMap } from "@/lib/mock/staff";
import { cn } from "@/lib/utils";
import type { StaffMember } from "@/lib/types";

/**
 * COACH REACTIONS — the member sees that a real, named human read their log.
 *
 * This is the payoff half of the loop the audit calls the cheapest large
 * retention win (docs/audit/ENGAGEMENT.md #4): "A named human responding to your
 * Tuesday entry beats any confetti, and it converts the journal from a diary
 * into a relationship." The member logs, their coach reacts, and the member
 * comes back here to see whether they did.
 *
 * HONESTY — the whole point of the feature.
 *   - This renders ONLY reactions a coach actually wrote. There is no seeding.
 *   - When a coach has left nothing, the honest answer is an empty state, not a
 *     fabricated "Coach Tyler saw your check-in". That would be the same lie the
 *     old Save toast told, and it is exactly what we are not doing.
 *   - The reaction appears AFTER a coach leaves one (in MemberPulse), in the
 *     same session or across a tab, via the live store. That is the real
 *     mechanic, demonstrated — not a prop.
 *
 * TONE — this is an adult men's-health product, not a social feed. A reaction is
 * a quiet, warm acknowledgement: no counts, no like-buttons, no red. An "ack"
 * reads as one calm line; a note is shown in the coach's own words. Nothing here
 * competes with the clinical content around it.
 *
 * HYDRATION SAFETY. `useReactionsForClient` starts empty and reads storage in an
 * effect; until it has, this renders nothing rather than flashing a premature
 * "no note yet" that a real note would then replace.
 */

function AckLine({ reaction }: { reaction: Reaction }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-control bg-optimal/12 text-optimal">
        <Check className="h-3 w-3" />
      </span>
      <p className="min-w-0 text-detail leading-relaxed text-ink-300">
        <span className="font-medium text-ink-100">{reactorLabel(reaction.staffId)}</span> saw your{" "}
        {targetNoun(reaction.targetType)}
        <span className="text-ink-500"> · {formatTargetDate(reaction.targetDate)}</span>
      </p>
    </li>
  );
}

function NoteLine({ reaction }: { reaction: Reaction }) {
  const actor = staffMap[reaction.staffId] as StaffMember | undefined;
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-control bg-gold-400/12 text-micro font-semibold text-gold-300">
        {actor?.avatarInitials ?? "•"}
      </span>
      <div className="min-w-0">
        <p className="text-detail leading-relaxed text-ink-200">
          &ldquo;{reaction.body}&rdquo;
        </p>
        <p className="mt-0.5 text-micro text-ink-500">
          {reactorLabel(reaction.staffId)} · on your {targetNoun(reaction.targetType)},{" "}
          {formatTargetDate(reaction.targetDate)}
        </p>
      </div>
    </li>
  );
}

export function CoachReactions({ clientId, className }: { clientId: string; className?: string }) {
  const { reactions, hydrated } = useReactionsForClient(clientId);

  // Newest first. Stored chronologically, so a reverse is enough — no timestamp
  // sort that would tie on the pinned demo clock.
  const ordered = React.useMemo(() => [...reactions].reverse(), [reactions]);

  // Before the read effect lands we do not know whether a coach has reacted, so
  // assert nothing. A one-frame blank is calmer and more honest than a "no note
  // yet" that pops into a note.
  if (!hydrated) return null;

  return (
    <div className={cn("card p-4 sm:p-6", className)}>
      <div className="flex items-center gap-2">
        <MessageSquareText className="h-4 w-4 text-gold-300" />
        <h2 className="font-display text-heading font-semibold text-ink-50">From your coach</h2>
      </div>

      {ordered.length === 0 ? (
        // The correct, honest empty state. Warm, not a prompt to do anything.
        <p className="mt-2 max-w-prose text-detail leading-relaxed text-ink-400">
          Your coach hasn&rsquo;t left a note yet. When they read one of your check-ins, you&rsquo;ll
          see it here — a real person, by name.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {ordered.map((r) =>
            r.kind === "note" ? (
              <NoteLine key={r.id} reaction={r} />
            ) : (
              <AckLine key={r.id} reaction={r} />
            ),
          )}
        </ul>
      )}
    </div>
  );
}

export default CoachReactions;
