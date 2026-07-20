"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Ban,
  Check,
  ChevronDown,
  ChevronUp,
  DoorOpen,
  Hourglass,
  LogIn,
  MapPin,
  Undo2,
  UserX,
  Video,
} from "lucide-react";
import type { LocationId } from "@/lib/types";
import { locationName } from "@/lib/mock/locations";
import { visitTypeMap } from "@/lib/booking/availability";
import { Badge, Button, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { shortHash } from "@/lib/trace/hash";
import type { Room } from "@/lib/frontdesk/rooms";
import { roomLabel } from "@/lib/frontdesk/rooms";
import {
  transitionEncounter,
  undoLastStep,
  deskStaffFor,
  type DeskState,
} from "@/lib/frontdesk/encounters";
import { isVirtual, providerLabel, type DeskRow } from "@/lib/frontdesk/day";
import { duration, hhmm, deskNowIso } from "@/lib/frontdesk/clock";
import { useDeskDay } from "@/lib/frontdesk/useDesk";
import { RoomPicker } from "@/components/frontdesk/RoomPicker";
import { DeskClockStrip } from "@/components/frontdesk/DeskClockStrip";
import { cn } from "@/lib/utils";

/**
 * The board a front-desk person leaves open all day.
 *
 * It is a sibling of `components/coach/TodayQueue.tsx` and borrows its two best
 * decisions on purpose:
 *
 *  1. THREE DISJOINT BANDS. Who is in the building, who is still to come, and
 *     what is finished. A single mixed list forces the person at the counter to
 *     re-read the whole day to answer "is anyone waiting", which is the one
 *     question they are asked continuously.
 *  2. ROWS DO NOT MOVE WHEN YOU WORK THEM. In the queue that was a frozen sort;
 *     here it falls out of the sort key — the waiting band is ordered by
 *     ARRIVAL time, which never changes once recorded. Marking somebody Roomed
 *     swaps their chip and their timer and moves them nowhere.
 *
 * Where it deliberately differs: this screen is CALMER than the coach console.
 * The coach console ranks and argues — priority scores, contributing factors,
 * why-lines. A desk does not need to be told who matters most; the person who
 * matters most is standing in front of them. So there is no ranking, no score,
 * no recommendation. Time order, big targets, obvious state.
 */

// ---------------------------------------------------------------------------
// State presentation
// ---------------------------------------------------------------------------

const STATE_META: Record<
  DeskState,
  { label: string; tone: React.ComponentProps<typeof Badge>["tone"]; icon: React.ElementType }
> = {
  Scheduled: { label: "Expected", tone: "neutral", icon: Hourglass },
  Arrived: { label: "Waiting", tone: "watch", icon: LogIn },
  Roomed: { label: "In a room", tone: "low", icon: DoorOpen },
  Completed: { label: "Done", tone: "optimal", icon: Check },
  "No Show": { label: "No show", tone: "high", icon: UserX },
  Cancelled: { label: "Cancelled", tone: "neutral", icon: Ban },
};

/** What the ledger row that just landed should say in a toast. */
function receipt(ledgerId: string, hash: string): string {
  return `Ledger ${ledgerId} · ${shortHash(hash)}`;
}

// ---------------------------------------------------------------------------
// A row
// ---------------------------------------------------------------------------

function DeskRowCard({
  row,
  occupied,
  showLocation,
}: {
  row: DeskRow;
  /** Room id → the row currently in it, for the rooming picker. */
  occupied: Record<string, DeskRow>;
  /** Only in the all-sites view. On a single site it is noise on every row. */
  showLocation: boolean;
}) {
  // Every clock on this row was computed in `deskDay` against one `now`, so a
  // row cannot disagree with the strip above it about what time it is.
  const { toast } = useToast();
  const reduce = useReducedMotion();
  const [rooming, setRooming] = React.useState(false);

  const { appt, client, state } = row;
  const meta = STATE_META[state];
  const StateIcon = meta.icon;
  const virtual = isVirtual(appt);
  const closed = row.band === "closed";

  /** Every transition goes through here so the ledger write can never be skipped. */
  const move = React.useCallback(
    (to: DeskState, room?: Room) => {
      const result = transitionEncounter({
        appointment: appt,
        client,
        to,
        roomId: room?.id,
        at: deskNowIso(),
        actorId: deskStaffFor(appt.locationId),
      });
      if (!result) {
        toast("That move isn't allowed from here", {
          desc: `${state} → ${to} is not a step this visit can take. Nothing was recorded.`,
          tone: "warn",
        });
        return;
      }
      setRooming(false);
      const who = client ? client.firstName : appt.clientName;
      const titles: Record<DeskState, string> = {
        Scheduled: `${who} put back to expected`,
        Arrived: `${who} checked in`,
        Roomed: `${who} → ${roomLabel(room?.id)}`,
        Completed: `${who} checked out`,
        "No Show": `${who} marked no-show`,
        Cancelled: `${who} cancelled`,
      };
      toast(titles[to], { desc: receipt(result.row.id, result.row.hash) });
    },
    [appt, client, state, toast],
  );

  const undo = React.useCallback(() => {
    const result = undoLastStep(appt, client);
    if (!result) {
      toast("Nothing to undo on this visit", {
        desc: "This row's state came from the seeded record, not from a desk action.",
        tone: "info",
      });
      return;
    }
    toast("Corrected", {
      desc: `Back to ${result.encounter.state}. The mistaken row stays in the chain — ${receipt(result.row.id, result.row.hash)} records the correction.`,
    });
  }, [appt, client, toast]);

  // The one control that dominates the row, sized for a thumb.
  const primary = (() => {
    if (state === "Scheduled")
      return (
        <Button
          variant="primary"
          onClick={() => move("Arrived")}
          className="h-11 min-w-[7.5rem] px-4 text-body"
        >
          <LogIn className="h-4 w-4" />
          {virtual ? "Joined" : "Check in"}
        </Button>
      );

    if (state === "Arrived") {
      if (virtual)
        return (
          <Button
            variant="primary"
            onClick={() => move("Roomed")}
            className="h-11 min-w-[7.5rem] px-4 text-body"
          >
            <Video className="h-4 w-4" />
            In visit
          </Button>
        );
      return (
        <Button
          variant="primary"
          onClick={() => setRooming((v) => !v)}
          aria-expanded={rooming}
          className="h-11 min-w-[7.5rem] px-4 text-body"
        >
          <DoorOpen className="h-4 w-4" />
          Room
        </Button>
      );
    }

    if (state === "Roomed")
      return (
        <Button
          variant="success"
          onClick={() => move("Completed")}
          className="h-11 min-w-[7.5rem] px-4 text-body"
        >
          <Check className="h-4 w-4" />
          Check out
        </Button>
      );

    return null;
  })();

  return (
    <motion.div
      layout={reduce ? false : "position"}
      transition={{ duration: reduce ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "card relative overflow-hidden px-3 py-2.5",
        state === "Arrived" && "border-watch/30",
        state === "Roomed" && "border-low/30",
        closed && "opacity-70",
      )}
    >
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-3">
        {/* ── Time. The first thing read, so it is the largest thing shown. ── */}
        <div className="flex shrink-0 items-baseline gap-2 lg:w-[7.5rem] lg:flex-col lg:items-start lg:gap-0">
          <span className="stat-mono text-heading font-semibold leading-none text-ink-50">
            {hhmm(appt.start)}
          </span>
          <span className="text-micro text-ink-600">
            {visitTypeMap[appt.type]?.durationMin ?? appt.durationMin} min
          </span>
        </div>

        {/* ── Who, what, with whom ─────────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge tone={meta.tone}>
              <StateIcon className="h-3 w-3" />
              {meta.label}
            </Badge>

            {/* The encounter clock. This is the number that did not exist. */}
            {state === "Arrived" &&
              (row.arrivalKnown ? (
                <span
                  className={cn(
                    "stat-mono text-micro font-medium",
                    (row.waitingMin ?? 0) >= 15 ? "text-high" : "text-watch",
                  )}
                >
                  waiting {duration(row.waitingMin ?? 0)}
                </span>
              ) : (
                // The audit's finding, rendered. `ap-02` ships as "Checked In"
                // with no arrival timestamp anywhere in the record, so the wait
                // is genuinely unknowable. Showing "0m" would invent it.
                <span className="text-micro text-ink-500">arrival time not recorded</span>
              ))}

            {state === "Roomed" && (
              <span className="stat-mono text-micro font-medium text-low">
                in {duration(row.inRoomMin ?? 0)}
                {row.overrunMin !== undefined && row.overrunMin > 2 && (
                  <span className="ml-1 text-high">· {row.overrunMin}m over</span>
                )}
              </span>
            )}

            {state === "Scheduled" && row.lateMin > 0 && (
              <span className="stat-mono text-micro font-medium text-watch">
                {duration(row.lateMin)} late
              </span>
            )}

            {row.roomId && (
              <span className="inline-flex items-center gap-1 text-micro text-ink-400">
                <DoorOpen className="h-3 w-3" />
                {roomLabel(row.roomId)}
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            {client ? (
              <Link
                href={`/clients/${client.id}`}
                className="min-w-0 truncate rounded-control text-body font-semibold text-ink-50 transition-colors hover:text-low focus-ring"
              >
                {client.firstName} {client.lastName}
              </Link>
            ) : (
              <span className="min-w-0 truncate text-body font-semibold text-ink-50">
                {appt.clientName}
              </span>
            )}
            {client && <span className="stat-mono text-micro text-ink-600">{client.mrn}</span>}
          </div>

          <p className="mt-0.5 truncate text-detail text-ink-400">
            {visitTypeMap[appt.type]?.label ?? appt.type} · {providerLabel(appt)}
            {showLocation && (
              <span className="text-ink-500"> · {locationName(appt.locationId)}</span>
            )}
          </p>
        </div>

        {/* ── Actions ──────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {primary}

          {state === "Scheduled" && (
            <>
              <Button size="sm" variant="outline" onClick={() => move("No Show")}>
                <UserX className="h-3.5 w-3.5" />
                No show
              </Button>
              <Button size="sm" variant="ghost" onClick={() => move("Cancelled")}>
                Cancel
              </Button>
            </>
          )}

          {state === "Arrived" && (
            <Button size="sm" variant="ghost" onClick={() => move("Cancelled")} title="Left without being seen">
              Left
            </Button>
          )}

          {row.deskRecorded && (
            <Button size="sm" variant="ghost" onClick={undo} title="Undo the last step">
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Rooming opens in place, under the name it concerns. */}
      <AnimatePresence initial={false}>
        {rooming && (
          <motion.div
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduce ? undefined : { opacity: 0, height: 0 }}
            transition={{ duration: reduce ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <RoomPicker
              appt={appt}
              occupied={occupied}
              onPick={(room) => move("Roomed", room)}
              onCancel={() => setRooming(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Bands
// ---------------------------------------------------------------------------

function BandHeading({
  label,
  count,
  hint,
  className,
}: {
  label: string;
  count: number;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1", className)}
    >
      <p className="label-eyebrow">{label}</p>
      <div className="flex items-baseline gap-2">
        {hint && <span className="text-micro text-ink-600">{hint}</span>}
        <span className="stat-mono text-detail font-semibold text-ink-200">{count}</span>
      </div>
    </div>
  );
}

/** The NOW line. One hairline and a time — nothing else earns the space. */
function NowLine({ now }: { now: string }) {
  return (
    <div className="flex items-center gap-2 py-1" aria-label={`Current time ${hhmm(now)}`}>
      <span className="stat-mono shrink-0 rounded-control bg-low/15 px-1.5 py-0.5 text-micro font-semibold text-low">
        {hhmm(now)}
      </span>
      <span className="h-px flex-1 bg-low/40" />
      <span className="text-micro uppercase tracking-wide text-low/70">now</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

export function DeskBoard() {
  const { day, now, scope } = useDeskDay();
  const [showClosed, setShowClosed] = React.useState(false);
  const showLocation = scope === "all";

  // Where the NOW line falls in the upcoming band: before the first visit whose
  // booked start is still in the future. Everything above it is running late.
  const nowIndex = React.useMemo(() => {
    const i = day.upcoming.findIndex((r) => r.appt.start > now);
    return i === -1 ? day.upcoming.length : i;
  }, [day.upcoming, now]);

  const empty = day.all.length === 0;

  return (
    <div className="space-y-5">
      <DeskClockStrip day={day} now={now} />

      {empty && (
        <EmptyState
          icon={<MapPin className="h-6 w-6" />}
          title={
            scope === "all"
              ? "Nothing on the books anywhere today"
              : `No visits booked at ${locationName(scope as LocationId)} today`
          }
          hint="The seeded day holds 15 appointments across five sites. Book a caller in and they land here immediately."
        />
      )}

      {/* ── In the building ───────────────────────────────────────────────── */}
      {day.here.length > 0 && (
        <section className="space-y-1.5">
          <BandHeading
            label="In the building"
            count={day.here.length}
            hint="first come, first served"
          />
          {day.here.map((row) => (
            <DeskRowCard
              key={row.appt.id}
              row={row}
              occupied={day.occupiedRooms}
              showLocation={showLocation}
            />
          ))}
        </section>
      )}

      {/* ── Still to come ─────────────────────────────────────────────────── */}
      {day.upcoming.length > 0 && (
        <section className="space-y-1.5">
          <BandHeading label="Still to come" count={day.upcoming.length} />
          {day.upcoming.map((row, i) => (
            <React.Fragment key={row.appt.id}>
              {i === nowIndex && <NowLine now={now} />}
              <DeskRowCard
                row={row}
                occupied={day.occupiedRooms}
                showLocation={showLocation}
              />
            </React.Fragment>
          ))}
          {nowIndex === day.upcoming.length && <NowLine now={now} />}
        </section>
      )}

      {/* ── Closed out ────────────────────────────────────────────────────── */}
      {day.closed.length > 0 && (
        <section className="space-y-1.5">
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            aria-expanded={showClosed}
            className="flex w-full items-center justify-between rounded-control px-1 py-1 text-left transition-colors hover:bg-ink-800/40 focus-ring"
          >
            <BandHeading label="Closed out" count={day.closed.length} />
            {showClosed ? (
              <ChevronUp className="ml-2 h-4 w-4 shrink-0 text-ink-500" />
            ) : (
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-ink-500" />
            )}
          </button>

          {/* Collapsed by default. A finished visit is the one thing on this
              screen nobody needs to see — but it must stay reachable, because
              the most common desk error is closing out the wrong person and
              the fix is one undo away in here. */}
          {showClosed &&
            day.closed.map((row) => (
              <DeskRowCard
                key={row.appt.id}
                row={row}
                occupied={day.occupiedRooms}
                showLocation={showLocation}
              />
            ))}
        </section>
      )}

      {/* ── The honest footnote ───────────────────────────────────────────── */}
      {/*
        Said once, quietly, at the bottom — not in a banner and not in a toast.
        The board writes a real hash-chained ledger row on every transition and
        shows the row id back, which is exactly the kind of detail that makes a
        viewer assume durability. `lib/trace/ledger.ts:289` is a module-scope
        array. Somebody should be told that before they draw a conclusion from
        it, and only once, because a warning repeated on every row stops being
        read by lunchtime.
      */}
      <p className="border-t border-ink-800/60 pt-4 text-detail leading-relaxed text-ink-600">
        Check-ins, rooming and check-outs write real rows to the audit chain and the row id is shown
        back to you. That chain lives in memory: it is per-server-process and it does not survive a
        restart. The seeded appointment records are never edited either — the desk keeps its own
        encounter journal beside them — so a visit cancelled here still occupies its slot in the
        booking engine.
      </p>
    </div>
  );
}
