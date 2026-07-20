"use client";

import * as React from "react";
import { Activity, Check, NotebookPen, Scale, Syringe, HeartPulse } from "lucide-react";
import type { DayLog } from "@/lib/member/logStore";
import {
  addReaction,
  formatTargetDate,
  reactorLabel,
  useReactionsForClient,
  type ReactionTargetType,
} from "@/lib/member/reactions";
import { getClient, clientName } from "@/lib/mock/clients";
import { Button, Textarea, Badge, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

/**
 * MEMBER PULSE — the coach reads what a member logged, and reacts.
 *
 * AUDIT FINDING (docs/audit/ENGAGEMENT.md): coach reactions on logs are the
 * "cheapest large retention win" (#4), and the reason they did not exist is
 * named in the same document — "Requires a coach-side journal read surface,
 * which does not exist." This is that surface. The coach persona had NO way to
 * see a member's day-to-day self-logs anywhere in the app; now it does, and the
 * reaction is one tap away from the thing being reacted to.
 *
 * WHAT IT READS. The member's REAL self-logs — the same `apex_member_log_v2`
 * store the portal writes to (lib/member/logStore.tsx). Nothing here is
 * fabricated: if the member has logged nothing, the coach sees an honest empty
 * state, not invented activity. That matters because the coach's adherence view
 * must never assert a dose that was not taken.
 *
 * HYDRATION SAFETY. The member log is read in an effect, never during render —
 * same rule as everything else that touches localStorage in this codebase.
 * State starts empty and is owner-guarded so a member switch cannot show one
 * member's log under another's name.
 */

/**
 * MUST stay in sync with `KEY` in lib/member/logStore.tsx.
 *
 * logStore keeps that constant private and this component is not allowed to
 * modify logStore, so the key is duplicated here rather than imported. The
 * exported `DayLog` TYPE is imported so the SHAPE cannot drift silently; only
 * the storage-key string is repeated, and this comment is the contract that it
 * tracks logStore. In production both sides read `readMemberHistory` from
 * lib/db/repo.ts and this duplication disappears.
 */
const MEMBER_LOG_KEY = "apex_member_log_v2";

/** Pinned demo clock — the coach console never reads the wall clock either. */
const TODAY = "2026-06-12";

/** How many recent logged days to surface. A pulse, not a full chart history. */
const RECENT_DAYS = 8;

interface LoggedItem {
  type: ReactionTargetType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** What the member actually recorded on a day, as react-able items. */
function itemsFor(day: DayLog): LoggedItem[] {
  const items: LoggedItem[] = [];
  const feelCount = day.feel ? Object.keys(day.feel).length : 0;
  if (feelCount > 0) {
    items.push({ type: "checkin", label: `Check-in · ${feelCount}/6`, icon: NotebookPen });
  }
  if (typeof day.weightLb === "number") {
    items.push({ type: "weight", label: `${day.weightLb} lb`, icon: Scale });
  }
  const doses = day.doses ?? [];
  if (doses.length > 0) {
    const taken = doses.filter((d) => !d.skipped).length;
    const skipped = doses.length - taken;
    const label =
      `${taken} dose${taken === 1 ? "" : "s"} logged` + (skipped ? `, ${skipped} skipped` : "");
    items.push({ type: "dose", label, icon: Syringe });
  }
  return items;
}

function readMemberDays(clientId: string): DayLog[] {
  try {
    const raw = window.localStorage.getItem(`${MEMBER_LOG_KEY}:${clientId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { days?: DayLog[] };
    if (!Array.isArray(parsed?.days)) return [];
    return parsed.days
      .filter((d) => typeof d?.date === "string" && Array.isArray(d?.doses))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

export function MemberPulse({ clientId, staffId }: { clientId: string; staffId: string }) {
  const { toast } = useToast();
  const client = getClient(clientId);
  const first = client?.firstName ?? "this member";

  // Owner-guarded, effect-only read of the member's real log. Same shape as
  // logStore's own hydration guard: until `owner === clientId`, days is empty.
  const [store, setStore] = React.useState<{ owner: string | null; days: DayLog[] }>({
    owner: null,
    days: [],
  });
  React.useEffect(() => {
    setStore({ owner: clientId, days: readMemberDays(clientId) });
  }, [clientId]);
  const loaded = store.owner === clientId;

  const { reactions } = useReactionsForClient(clientId);

  // Which day's note composer is open. Single-select — a wall of open textareas
  // is the feed this surface is deliberately not.
  const [noteFor, setNoteFor] = React.useState<string | null>(null);
  const [noteText, setNoteText] = React.useState("");

  // Recent days that actually hold something, newest first.
  const recent = React.useMemo(
    () =>
      store.days
        .filter((d) => itemsFor(d).length > 0)
        .slice(-RECENT_DAYS)
        .reverse(),
    [store.days],
  );

  const ack = React.useCallback(
    (targetType: ReactionTargetType, targetDate: string) => {
      addReaction({ targetType, targetDate, clientId, staffId, kind: "ack" });
      toast(`${first} will see this`, { desc: "Acknowledged — a quiet nudge that a human read it." });
    },
    [clientId, staffId, first, toast],
  );

  const sendNote = React.useCallback(
    (targetDate: string) => {
      const body = noteText.trim();
      if (!body) return;
      addReaction({ targetType: "day", targetDate, clientId, staffId, kind: "note", body });
      setNoteFor(null);
      setNoteText("");
      toast(`Note sent to ${first}`, { desc: "It appears on their journal, under how they feel." });
    },
    [noteText, clientId, staffId, first, toast],
  );

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-ink-700/70 p-4">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-gold-300" />
          <p className="label-eyebrow">Member pulse</p>
        </div>
        <h3 className="mt-1 font-display text-heading font-semibold text-ink-50">
          What {client ? clientName(client) : "this member"} has logged
        </h3>
        {/* Cites the finding this surface exists to satisfy — a named human
            responding to a specific entry beats any confetti. */}
        <p className="mt-1 max-w-prose text-detail leading-relaxed text-ink-400">
          Their own check-ins, weight and doses. A quick acknowledgement or a
          line back turns the log from a diary into a conversation.
        </p>
      </div>

      <div className="p-4">
        {!loaded ? (
          <p className="py-6 text-center text-detail text-ink-500">Reading {first}&rsquo;s log…</p>
        ) : recent.length === 0 ? (
          /* Honest empty state — no invented activity. A coach can still reach
             out; a note to a quiet member is real outreach, not a reaction to
             nothing, so it is framed as a note rather than an acknowledgement. */
          <div className="space-y-4">
            <EmptyState
              icon={<Activity className="h-6 w-6" />}
              title={`${first} hasn't logged anything in this browser yet`}
              hint="When they log a check-in, weight or dose it shows here for you to acknowledge. Nothing is invented — this reads their real entries."
            />
            <DayNote
              date={TODAY}
              first={first}
              open={noteFor === TODAY}
              value={noteText}
              onOpen={() => setNoteFor((d) => (d === TODAY ? null : TODAY))}
              onChange={setNoteText}
              onSend={() => sendNote(TODAY)}
              label="Leave a note anyway"
            />
          </div>
        ) : (
          <ul className="space-y-2.5">
            {recent.map((day) => {
              const items = itemsFor(day);
              const dayReactions = reactions.filter((r) => r.targetDate === day.date);
              const acked = new Set(
                dayReactions.filter((r) => r.kind === "ack").map((r) => r.targetType),
              );
              const notes = dayReactions.filter((r) => r.kind === "note");
              return (
                <li key={day.date} className="hairline rounded-panel border bg-ink-900/50 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="text-detail font-medium text-ink-100">
                      {formatTargetDate(day.date)}
                      {day.date === TODAY && (
                        <span className="ml-2 text-micro font-normal text-ink-500">today</span>
                      )}
                    </span>
                  </div>

                  <div className="mt-2.5 grid grid-cols-1 gap-1.5">
                    {items.map((item) => {
                      const Icon = item.icon;
                      const isAcked = acked.has(item.type);
                      return (
                        <div
                          key={item.type}
                          className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5"
                        >
                          <span className="flex min-w-0 items-center gap-2 text-detail text-ink-300">
                            <Icon className="h-3.5 w-3.5 shrink-0 text-ink-500" />
                            <span className="min-w-0 truncate">{item.label}</span>
                          </span>
                          {isAcked ? (
                            <Badge tone="optimal">
                              <Check className="h-3 w-3" />
                              Seen
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => ack(item.type, day.date)}
                              aria-label={`Acknowledge ${item.label}`}
                            >
                              <Check className="h-3.5 w-3.5" />
                              Seen
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Notes the coach has already left on this day — their own
                      side of the thread, so a second note is a follow-up, not a
                      forgotten repeat. */}
                  {notes.length > 0 && (
                    <ul className="mt-2.5 space-y-1.5 border-t border-ink-700/60 pt-2.5">
                      {notes.map((n) => (
                        <li key={n.id} className="text-detail leading-relaxed text-ink-400">
                          <span className="text-micro text-ink-500">{reactorLabel(n.staffId)}: </span>
                          &ldquo;{n.body}&rdquo;
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-2.5">
                    <DayNote
                      date={day.date}
                      first={first}
                      open={noteFor === day.date}
                      value={noteText}
                      onOpen={() => setNoteFor((d) => (d === day.date ? null : day.date))}
                      onChange={setNoteText}
                      onSend={() => sendNote(day.date)}
                      label={notes.length > 0 ? "Add another line" : "Leave a note"}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * A single day's note composer. Collapsed to a link until the coach opens it,
 * so the default state of the panel is calm — reading, not a row of empty boxes.
 */
function DayNote({
  date,
  first,
  open,
  value,
  onOpen,
  onChange,
  onSend,
  label,
}: {
  date: string;
  first: string;
  open: boolean;
  value: string;
  onOpen: () => void;
  onChange: (v: string) => void;
  onSend: () => void;
  label: string;
}) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="focus-ring rounded-control text-detail font-medium text-gold-300 hover:text-gold-200"
      >
        {label}
      </button>
    );
  }
  return (
    <div className="min-w-0">
      <label htmlFor={`note-${date}`} className="sr-only">
        A note for {first}
      </label>
      <Textarea
        id={`note-${date}`}
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`A quiet line to ${first} — "Saw your Tuesday. Solid week."`}
      />
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" variant="primary" onClick={onSend} disabled={value.trim().length === 0}>
          Send
        </Button>
        <Button size="sm" variant="ghost" onClick={onOpen}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default MemberPulse;
