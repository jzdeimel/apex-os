"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { History, AlertTriangle, ArrowRight, RotateCcw } from "lucide-react";
import {
  replayAt,
  timelineMarks,
  diffSnapshots,
  NOW,
  type ChartSnapshot,
  type TimelineMark,
  type MarkKind,
} from "@/lib/trace/replay";
import { staffName } from "@/lib/mock/staff";
import { getClient, clientName } from "@/lib/mock/clients";
import { appendLedger } from "@/lib/trace/ledger";
import { VIEWER } from "@/lib/viewer";
import { Card, CardContent, Badge, Button, EmptyState } from "@/components/ui/primitives";
import { cn, formatDate, formatDateTime, absolute } from "@/lib/utils";

/**
 * The Time Machine.
 *
 * Scrub a member's chart backwards through its own history. The engine in
 * lib/trace/replay.ts guarantees the hard part — that a replayed snapshot cannot
 * show information that did not exist yet — so this component's job is the other
 * half of that promise: make it *impossible to mistake a replay for the live
 * chart*.
 *
 * That is why the banner is permanent rather than a toast, why it sits above the
 * content instead of beside it, and why the whole panel takes a visible amber
 * cast while scrubbed. A reviewer who wanders away mid-scrub and comes back must
 * be told what they are looking at without having to remember.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

const MARK_COLOR: Record<MarkKind, string> = {
  join: "#94a1a6",
  consult: "#60a5fa",
  lab: "#2dd4bf",
  order: "#a78bfa",
  escalation: "#f87171",
  plan: "#e93d3d",
  now: "#e0bd6e",
};

const MARK_LABEL: Record<MarkKind, string> = {
  join: "Membership",
  consult: "Consult",
  lab: "Lab",
  order: "Order",
  escalation: "Escalation",
  plan: "Plan",
  now: "Today",
};

const DAY_MS = 86_400_000;

/** Same mixed-regime parse as the engine. Kept local so this file stays pure UI. */
function ms(iso: string): number {
  return absolute(iso.length === 10 ? `${iso}T00:00:00` : iso).getTime();
}

/** How long before NOW, in the words a clinician would use out loud. */
function agoLabel(iso: string): string {
  const days = Math.round((ms(NOW) - ms(iso)) / DAY_MS);
  if (days <= 0) return "current record";
  if (days === 1) return "1 day ago";
  if (days < 45) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months < 24 ? `${months} months ago` : `${Math.round(days / 365)} years ago`;
}

function statusTone(status: string) {
  if (status === "Active Protocol" || status === "Active") return "optimal" as const;
  if (status === "Needs review" || status === "Awaiting provider") return "watch" as const;
  if (status === "No plan" || status === "Lead") return "neutral" as const;
  return "info" as const;
}

/* ------------------------------------------------------------------ *
 * Stat tile
 * ------------------------------------------------------------------ */

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
      <div className="label-eyebrow text-ink-400">{label}</div>
      <div className="stat-mono mt-1 text-heading text-ink-50">{value}</div>
      {hint && <div className="mt-0.5 text-detail text-ink-500">{hint}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */

/**
 * Marks a value the record cannot actually vouch for at a past date.
 *
 * In a product whose thesis is provenance, rendering a derived value with the
 * same weight as a recorded one is the core failure mode — so the distinction
 * is visible, not just commented.
 */
function NotVersioned() {
  return (
    <span
      title="Not versioned — this field has no dated history on the record."
      className="inline-flex items-center rounded-full border border-ink-700 bg-ink-800/60 px-1.5 py-0.5 text-micro font-medium text-ink-400"
    >
      not versioned
    </span>
  );
}

export function TimeMachine({ clientId }: { clientId: string }) {
  const marks = React.useMemo<TimelineMark[]>(() => timelineMarks(clientId), [clientId]);
  const lastIndex = Math.max(0, marks.length - 1);

  // Opens on "today" every time. The live record is the default truth; you have
  // to deliberately travel away from it.
  const [index, setIndex] = React.useState(lastIndex);
  React.useEffect(() => setIndex(lastIndex), [clientId, lastIndex]);

  /**
   * A replay IS a chart access, and a more sensitive one than a normal view —
   * it is a reconstruction of what someone knew at a past moment. Logging it
   * once per chart (not per scrub, which would write a row per keystroke) keeps
   * the component honest: it renders "N chart accesses logged to this point"
   * while itself being one of them.
   */
  const logged = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (logged.current === clientId) return;
    logged.current = clientId;
    const client = getClient(clientId);
    appendLedger({
      actorId: VIEWER.id,
      actorName: VIEWER.name,
      actorRole: VIEWER.role,
      action: "view",
      entity: "chart",
      entityId: `replay-${clientId}`,
      subjectId: clientId,
      subjectName: client ? clientName(client) : undefined,
      locationId: client?.locationId,
      reason: "Point-in-time replay of this chart",
    });
  }, [clientId]);

  const current = marks[Math.min(index, lastIndex)];
  const scrubbed = index < lastIndex;

  const snapshot = React.useMemo<ChartSnapshot>(
    () => replayAt(clientId, current?.at ?? NOW),
    [clientId, current?.at],
  );
  const today = React.useMemo<ChartSnapshot>(() => replayAt(clientId, NOW), [clientId]);
  const diffs = React.useMemo(() => diffSnapshots(snapshot, today), [snapshot, today]);

  const inputRef = React.useRef<HTMLInputElement>(null);

  // Arrow keys step between marks from anywhere in the panel, not only when the
  // range input itself holds focus — the scrubber is the whole interaction, and
  // a reviewer reading the diff should be able to walk history without
  // re-acquiring the thumb. The native handler already covers the input, so we
  // skip it there to avoid double-stepping.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target === inputRef.current) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setIndex((i) => Math.min(lastIndex, i + 1));
    }
  };

  if (marks.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={<History className="h-5 w-5" />}
            title="No history to replay"
            hint="This chart has no dated events yet."
          />
        </CardContent>
      </Card>
    );
  }

  // Positions are computed in INDEX space, not time space, so that every marker
  // sits exactly where the thumb will land on it. Time-space ticks look more
  // honest and are worse: the thumb snaps and the dots do not, so they drift
  // apart and the user learns to distrust both.
  const pct = (i: number) => (lastIndex === 0 ? 100 : (i / lastIndex) * 100);

  return (
    <div
      onKeyDown={onKeyDown}
      className={cn(
        "space-y-4 rounded-xl transition-colors",
        // The whole panel takes a visible cast while scrubbed — the `watch`
        // token, which everywhere else in Apex means "look at this before you act".
        scrubbed && "ring-1 ring-watch/40",
      )}
    >
      {/* ---- The banner. Permanent while scrubbed, never a dismissible toast. ---- */}
      <AnimatePresence initial={false}>
        {scrubbed && (
          <motion.div
            key="replay-banner"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: EASE }}
            role="status"
            aria-live="polite"
            className="flex flex-col gap-2 rounded-lg border border-watch/50 bg-watch/10 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-watch" />
              <p className="text-body text-ink-100">
                Viewing this chart as it was on{" "}
                <span className="stat-mono font-semibold">{formatDate(snapshot.asOf)}</span>.{" "}
                <span className="font-semibold">This is not the current record.</span>
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIndex(lastIndex)}
              className="shrink-0 self-start sm:self-auto"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Return to today
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <Card>
        <CardContent className="space-y-5">
          {/* ---- As-of header ---- */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="label-eyebrow text-ink-400">
                <History className="mr-1.5 inline h-3.5 w-3.5" />
                Replaying chart as of
              </div>
              <div className="font-display text-title text-ink-50 sm:text-title">
                {formatDate(snapshot.asOf)}
              </div>
              <div className="mt-0.5 text-body text-ink-400">
                {agoLabel(snapshot.asOf)} · {current?.label}
              </div>
            </div>
            <Badge tone={scrubbed ? "watch" : "optimal"}>
              {scrubbed ? "Historical replay" : "Live record"}
            </Badge>
          </div>

          {/* ---- Scrubber ---- */}
          <div>
            <div className="relative h-10">
              {/* rail */}
              <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-ink-800" />
              {/* elapsed */}
              <div
                className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gold-500/70"
                style={{ width: `${pct(index)}%` }}
              />
              {/* event markers */}
              {marks.map((m, i) => (
                <span
                  key={`${m.at}-${i}`}
                  title={`${formatDateTime(m.at)} — ${m.label}`}
                  className={cn(
                    "absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-ink-950 transition-transform",
                    i === index && "scale-150",
                  )}
                  style={{ left: `${pct(i)}%`, backgroundColor: MARK_COLOR[m.kind] }}
                />
              ))}
              {/* thumb */}
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gold-400 bg-ink-950 shadow-lg"
                style={{ left: `${pct(index)}%` }}
              />
              {/* The real control sits invisibly on top: native keyboard, drag,
                  touch and screen-reader semantics for free, our visuals below. */}
              <input
                ref={inputRef}
                type="range"
                min={0}
                max={lastIndex}
                step={1}
                value={index}
                onChange={(e) => setIndex(Number(e.target.value))}
                aria-label="Replay date"
                aria-valuetext={`${formatDate(current?.at ?? NOW)} — ${current?.label ?? ""}`}
                className="focus-ring absolute inset-0 w-full cursor-pointer opacity-0"
              />
            </div>

            <div className="mt-1 flex items-center justify-between text-detail text-ink-500">
              <span className="stat-mono">{formatDate(marks[0].at)}</span>
              <span>← → steps between events</span>
              <span className="stat-mono">Today</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
              {(Object.keys(MARK_LABEL) as MarkKind[])
                .filter((k) => marks.some((m) => m.kind === k))
                .map((k) => (
                  <span key={k} className="flex items-center gap-1.5 text-detail text-ink-400">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: MARK_COLOR[k] }}
                    />
                    {MARK_LABEL[k]}
                  </span>
                ))}
            </div>
          </div>

          {/* ---- The snapshot ---- */}
          <motion.div
            key={snapshot.asOf}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat
                label="Alpha Score"
                value={snapshot.alphaScore ?? "—"}
                hint={snapshot.alphaScore === null ? "no labs yet" : undefined}
              />
              <Stat
                label="Labs known"
                value={snapshot.labCount}
                hint={snapshot.latestLabDate ? formatDate(snapshot.latestLabDate) : "none resulted"}
              />
              <Stat label="Consults" value={snapshot.consultCount} />
              <Stat label="Open orders" value={snapshot.openOrders} />
              <Stat label="Open escalations" value={snapshot.escalationsOpen} />
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
                <div className="label-eyebrow text-ink-400">Status then</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone={statusTone(snapshot.status)}>{snapshot.status}</Badge>
                  <Badge tone={statusTone(snapshot.planStatus)}>
                    Plan: {snapshot.planStatus}
                  </Badge>
                </div>
              </div>

              <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
                <div className="flex items-center gap-2">
                  <span className="label-eyebrow text-ink-400">Care team</span>
                  <NotVersioned />
                </div>
                {snapshot.careTeam ? (
                  <dl className="mt-2 space-y-1 text-body">
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-400">Coach</dt>
                      <dd className="text-ink-100">{staffName(snapshot.careTeam.coachId)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-400">Provider</dt>
                      <dd className="text-ink-100">{staffName(snapshot.careTeam.providerId)}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-2 text-body leading-relaxed text-ink-500">
                    Assignment changes aren&rsquo;t dated on the record, so we can&rsquo;t say who
                    held this member on this date. Showing today&rsquo;s coach would attribute a
                    past visit to the wrong clinician.
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
                <div className="flex items-center gap-2">
                  <span className="label-eyebrow text-ink-400">Protocol in force</span>
                  <NotVersioned />
                </div>
                {snapshot.activeProtocolItems === null ? (
                  <p className="mt-2 text-body leading-relaxed text-ink-500">
                    Protocol changes aren&rsquo;t written to the record as dated entries yet, so
                    what was in force on this date isn&rsquo;t reconstructable. Today&rsquo;s plan
                    is derived from today&rsquo;s labs — showing it here would name treatments
                    justified by results that hadn&rsquo;t come back yet.
                  </p>
                ) : snapshot.activeProtocolItems.length === 0 ? (
                  <p className="mt-2 text-body text-ink-500">Nothing in force at this date.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-body text-ink-100">
                    {(snapshot.activeProtocolItems ?? []).map((t) => (
                      <li key={t} className="flex gap-2">
                        <span className="text-gold-500">·</span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* The reason the feature exists. Not a stat — a sentence a reviewer
                can quote back when asked whether a decision was reasonable. */}
            <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
              <div className="label-eyebrow text-ink-400">What the care team knew</div>
              <ul className="mt-2 space-y-1.5">
                {snapshot.knownAt.map((k) => (
                  <li key={k} className="flex gap-2 text-body text-ink-200">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-500" />
                    <span>{k}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </CardContent>
      </Card>

      {/* ---- What changed since ---- */}
      <Card>
        <CardContent>
          <div className="label-eyebrow text-ink-400">
            What changed since {formatDate(snapshot.asOf)}
          </div>
          {!scrubbed ? (
            <p className="mt-2 text-body text-ink-500">
              You are on the current record. Scrub backwards to compare.
            </p>
          ) : diffs.length === 0 ? (
            <p className="mt-2 text-body text-ink-500">
              Nothing tracked on this chart changed between then and today.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {diffs.map((d, i) => (
                <li
                  key={`${d.field}-${i}`}
                  className="grid grid-cols-1 items-center gap-1 rounded-lg border border-ink-800 bg-ink-900/40 p-2.5 sm:grid-cols-[9rem_1fr_auto_1fr]"
                >
                  <span className="text-detail uppercase tracking-wide text-ink-400">{d.field}</span>
                  <span className="stat-mono text-body text-ink-400 line-through decoration-ink-600">
                    {d.from}
                  </span>
                  <ArrowRight className="hidden h-3.5 w-3.5 text-ink-600 sm:block" />
                  <span className="stat-mono text-body text-ink-50">{d.to}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default TimeMachine;
