"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Clock,
  PhoneCall,
  Search,
  ShieldCheck,
  UserPlus,
  X,
} from "lucide-react";
import type { Client, LocationId } from "@/lib/types";
import {
  VISIT_TYPES,
  availabilityByDay,
  blockedByLicensure,
  bookSlot,
  eligibleStaff,
  memberStateOn,
  venuesFor,
  visitTypeMap,
  BOOKING_NOW,
  type Slot,
  type VisitTypeId,
} from "@/lib/booking/availability";
import { travelFor } from "@/lib/account/travel";
import { clients, clientName } from "@/lib/mock/clients";
import { staffName } from "@/lib/mock/staff";
import { locationMap, locationName } from "@/lib/mock/locations";
import { Badge, Button, Input, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { shortHash } from "@/lib/trace/hash";
import { deskStaffFor } from "@/lib/frontdesk/encounters";
import { useDeskScope } from "@/lib/frontdesk/useDesk";
import { cn, formatDate } from "@/lib/utils";

/**
 * Book the person on the phone into a real slot.
 *
 * AUDIT FINDING (GAP_ANALYSIS.md, FRONT DESK, P0): `lib/booking/availability.ts`
 * is one of the best modules in this codebase — roster minus booked minus
 * duration, role-gated, with genuine telehealth state-licensure gating — and it
 * was wired to the MEMBER PORTAL ONLY. Alpha Health runs an 833 line plus four
 * per-location numbers; "book this caller into a real slot" is the single most
 * frequent thing anybody at a counter does, and it had no staff surface at all.
 *
 * This is that surface. It calls the same engine — `availabilityByDay`,
 * `eligibleStaff`, `blockedByLicensure`, `bookSlot`. Not one line of
 * availability logic is reimplemented here, which is the point: a second
 * booking engine is how a clinic ends up with two answers to "is 2pm free".
 *
 * WHY IT IS NOT A WIZARD. `components/portal/BookVisit.tsx` walks a member
 * through four steps at 9pm on a sofa, and that is right for a member. A
 * front-desk person is holding a phone against their shoulder while somebody
 * says "any chance of Thursday?" — they need every control visible at once so
 * they can change the answer three times in one sentence. Same engine,
 * genuinely different shape.
 */

const NOW_DATE = BOOKING_NOW.slice(0, 10);

// ---------------------------------------------------------------------------
// Who is on the phone
// ---------------------------------------------------------------------------

/**
 * Caller lookup.
 *
 * Name, phone and MRN, because a caller identifies themselves with whichever
 * one they can remember. Digits are compared with punctuation stripped: nobody
 * reads out "(919) 555-0142" and the desk should not have to type the brackets.
 */
function findCallers(query: string): Client[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const digits = q.replace(/\D/g, "");
  return clients
    .filter((c) => {
      if (clientName(c).toLowerCase().includes(q)) return true;
      if (c.mrn.toLowerCase().includes(q)) return true;
      if (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits)) return true;
      return false;
    })
    .slice(0, 8);
}

function CallerSearch({ onPick }: { onPick: (c: Client) => void }) {
  const [q, setQ] = React.useState("");
  const results = React.useMemo(() => findCallers(q), [q]);

  return (
    <div>
      <label className="label-eyebrow" htmlFor="desk-caller">
        Who is calling
      </label>
      <div className="relative mt-1.5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
        <Input
          id="desk-caller"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, phone or MRN"
          autoComplete="off"
          className="h-11 pl-9 text-body"
        />
      </div>

      {q.trim().length >= 2 && (
        <div className="mt-2 space-y-1.5">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c)}
              className="flex w-full min-w-0 items-center gap-3 rounded-panel border border-ink-700 bg-ink-850/70 px-3 py-2.5 text-left transition-colors hover:border-low/50 hover:bg-low/[0.06] focus-ring"
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-micro font-bold text-[color:var(--on-swatch)]"
                style={{ background: c.avatarColor }}
              >
                {c.firstName[0]}
                {c.lastName[0]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-medium text-ink-50">
                  {clientName(c)}
                </span>
                <span className="block truncate text-micro text-ink-500">
                  <span className="stat-mono">{c.phone}</span> · {c.mrn} ·{" "}
                  {locationName(c.locationId)}
                </span>
              </span>
            </button>
          ))}

          {results.length === 0 && (
            /*
             * The honest dead end.
             *
             * A caller who is not in the book is a LEAD, and Apex cannot create
             * one: `lib/store.tsx` exports `addLead` and the inventory audit
             * found it has zero call sites — the only lead-creation path in the
             * product is never called, and `app/book/page.tsx:104` validates its
             * form and then discards it. So this panel does not offer an "add
             * new caller" button that would toast a record it cannot write.
             */
            <div className="rounded-panel border border-ink-700 bg-ink-900/50 p-3">
              <p className="flex items-center gap-2 text-detail font-medium text-ink-100">
                <UserPlus className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                Nobody in the book matches “{q.trim()}”
              </p>
              <p className="mt-1.5 text-detail leading-relaxed text-ink-400">
                Apex has no lead-capture write path yet — the new-client form at{" "}
                <Link href="/book" className="rounded-control text-ink-200 underline focus-ring">
                  /book
                </Link>{" "}
                validates and discards, and `addLead` has no call sites. Take the caller&apos;s
                details the way you do today; there is nothing here that would save them.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The booker
// ---------------------------------------------------------------------------

export function PhoneBooking() {
  const { toast } = useToast();
  const [scope] = useDeskScope();

  const [caller, setCaller] = React.useState<Client | null>(null);
  const [visitType, setVisitType] = React.useState<VisitTypeId>("Follow-Up");
  const [venue, setVenue] = React.useState<LocationId>(scope === "all" ? "raleigh" : scope);
  const [staffId, setStaffId] = React.useState<string>("any");
  const [dayIdx, setDayIdx] = React.useState(0);
  const [chosen, setChosen] = React.useState<Slot | null>(null);
  const [booked, setBooked] = React.useState<{ slot: Slot; ledgerId: string; hash: string } | null>(
    null,
  );

  const travel = caller ? travelFor(caller.id) : null;

  // Venues this visit type can physically be delivered at. Keeps the venue
  // select honest — a Lab Draw never offers Telehealth.
  const venues = React.useMemo(() => venuesFor(visitType), [visitType]);
  React.useEffect(() => {
    if (!venues.includes(venue)) setVenue(venues[0]);
  }, [venues, venue]);

  const memberState = React.useMemo(
    () => (caller ? memberStateOn(caller, NOW_DATE, travel) : "NC"),
    [caller, travel],
  );

  const days = React.useMemo(() => {
    if (!caller) return [];
    return availabilityByDay({
      visitType,
      locationId: venue,
      staffId: staffId === "any" ? undefined : staffId,
      fromIso: NOW_DATE,
      memberState: venue === "telehealth" ? memberState : undefined,
    });
  }, [caller, visitType, venue, staffId, memberState]);

  const people = React.useMemo(
    () =>
      caller
        ? eligibleStaff(visitType, venue, caller, venue === "telehealth" ? memberState : undefined)
        : [],
    [caller, visitType, venue, memberState],
  );

  const blocked = React.useMemo(
    () => (venue === "telehealth" ? blockedByLicensure(visitType, memberState) : []),
    [venue, visitType, memberState],
  );

  const activeDay = days[dayIdx];

  /**
   * When the desk said "anyone", collapse to distinct START TIMES.
   *
   * Four rostered providers at fifteen-minute granularity is seventy-odd
   * buttons for one Tuesday, most of them the same moment wearing a different
   * name. A caller asking "what have you got Thursday morning" wants times.
   * Their own care team wins the tie, which is what the desk would do anyway.
   */
  const shown = React.useMemo(() => {
    const slots = activeDay?.slots ?? [];
    if (staffId !== "any" || !caller) return slots;
    const byTime = new Map<string, Slot>();
    for (const s of slots) {
      const held = byTime.get(s.time);
      const mine = s.staffId === caller.providerId || s.staffId === caller.coachId;
      const heldMine =
        held && (held.staffId === caller.providerId || held.staffId === caller.coachId);
      if (!held || (mine && !heldMine)) byTime.set(s.time, s);
    }
    return [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));
  }, [activeDay, staffId, caller]);

  function confirm() {
    if (!chosen || !caller) return;
    const result = bookSlot(chosen, caller, {
      bookedBy: "staff",
      reason: "Front desk booked an inbound caller into an open slot",
    });
    if (!result) {
      // The honest refusal. `bookSlot` re-checks availability before it commits
      // rather than trusting the slot object this component is holding.
      toast("That time went while you were talking", {
        desc: "Somebody took it between this list rendering and your click. Nothing was double-booked — pick another.",
        tone: "warn",
      });
      setChosen(null);
      return;
    }
    setBooked({ slot: chosen, ledgerId: result.ledgerId, hash: result.ledgerHash });
    toast(`Booked · ${clientName(caller)}`, {
      desc: `${formatDate(chosen.startIso)} at ${chosen.time} with ${chosen.staffName}. Ledger ${result.ledgerId} · ${shortHash(result.ledgerHash)}`,
    });
  }

  function reset() {
    setCaller(null);
    setChosen(null);
    setBooked(null);
    setDayIdx(0);
    setStaffId("any");
  }

  // ── Booked ──────────────────────────────────────────────────────────────
  if (booked && caller) {
    const sameDay = booked.slot.date === NOW_DATE;
    return (
      <div className="card border-optimal/30 p-4">
        <Badge tone="optimal">
          <Check className="h-3 w-3" /> Booked
        </Badge>
        <h3 className="mt-3 font-display text-title font-semibold leading-tight text-ink-50">
          {clientName(caller)} · {formatDate(booked.slot.startIso)} at{" "}
          <span className="stat-mono">{booked.slot.time}</span>
        </h3>
        <p className="mt-2 text-body leading-relaxed text-ink-400">
          {visitTypeMap[booked.slot.visitType].label} with {booked.slot.staffName}
          {booked.slot.staffCredentials ? `, ${booked.slot.staffCredentials}` : ""} ·{" "}
          {locationName(booked.slot.locationId)}
        </p>
        <p className="mt-3 rounded-panel border border-ink-700 bg-ink-900/50 p-3 text-detail leading-relaxed text-ink-400">
          Written to the audit chain as{" "}
          <span className="stat-mono text-ink-200">{booked.ledgerId}</span>, hash{" "}
          <span className="stat-mono text-ink-200">{shortHash(booked.hash)}</span>, with the desk
          recorded as the actor and {caller.firstName} as the subject.
          {sameDay
            ? " It is on today's board now — the day view reads the same booking engine."
            : " It will appear on the board for that date."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={reset} className="h-11 px-4 text-body">
            <PhoneCall className="h-4 w-4" />
            Next caller
          </Button>
          <Link href="/desk">
            <Button variant="outline" className="h-11 px-4 text-body">
              Back to the day
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // ── Pick a caller ───────────────────────────────────────────────────────
  if (!caller) {
    return (
      <div className="card p-4">
        <CallerSearch onPick={setCaller} />
      </div>
    );
  }

  // ── Book ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* The caller, pinned. On a call the one thing that must never scroll
          away is whose appointment this is. */}
      <div className="card flex flex-wrap items-center gap-3 px-3 py-2.5">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-detail font-bold text-[color:var(--on-swatch)]"
          style={{ background: caller.avatarColor }}
        >
          {caller.firstName[0]}
          {caller.lastName[0]}
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href="/desk"
            className="block truncate rounded-control text-body font-semibold text-ink-50 transition-colors hover:text-low focus-ring"
          >
            {clientName(caller)}
          </Link>
          <p className="truncate text-micro text-ink-500">
            <span className="stat-mono">{caller.phone}</span> · {caller.mrn} · home clinic{" "}
            {locationName(caller.locationId)}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={reset} title="Different caller">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Everything at once. Three selects, one row on a desk monitor, stacked
          on the tablet at the counter. */}
      <div className="card grid grid-cols-1 gap-3 p-3 sm:grid-cols-3">
        <div className="min-w-0">
          <label className="label-eyebrow" htmlFor="desk-visit">
            Visit
          </label>
          <Select
            id="desk-visit"
            value={visitType}
            onChange={(e) => {
              setVisitType(e.target.value as VisitTypeId);
              setStaffId("any");
              setDayIdx(0);
              setChosen(null);
            }}
            className="mt-1.5 h-11 text-body"
          >
            {VISIT_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} · {t.durationMin}m
              </option>
            ))}
          </Select>
        </div>

        <div className="min-w-0">
          <label className="label-eyebrow" htmlFor="desk-venue">
            Where
          </label>
          <Select
            id="desk-venue"
            value={venue}
            onChange={(e) => {
              setVenue(e.target.value as LocationId);
              setStaffId("any");
              setDayIdx(0);
              setChosen(null);
            }}
            className="mt-1.5 h-11 text-body"
          >
            {venues.map((v) => (
              <option key={v} value={v}>
                {locationMap[v].short}
              </option>
            ))}
          </Select>
        </div>

        <div className="min-w-0">
          <label className="label-eyebrow" htmlFor="desk-who">
            With
          </label>
          <Select
            id="desk-who"
            value={staffId}
            onChange={(e) => {
              setStaffId(e.target.value);
              setDayIdx(0);
              setChosen(null);
            }}
            className="mt-1.5 h-11 text-body"
          >
            <option value="any">Anyone available</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.onCareTeam ? " (their team)" : ""}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Licensure. The single best piece of clinical logic in this codebase,
          and the desk needs it more than the member does — the desk is the one
          who would otherwise say "sure, Dr. Vale can see you Thursday" to
          somebody who has just mentioned they'll be in Georgia. */}
      {venue === "telehealth" && (
        <div
          className={cn(
            "card flex gap-3 p-3",
            memberState !== (locationMap[caller.locationId]?.state ?? "NC") && "border-watch/30",
          )}
        >
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-watch" />
          <div className="min-w-0">
            <p className="text-detail font-medium text-ink-100">
              Only clinicians licensed in {memberState} are listed.
            </p>
            <p className="mt-1 text-detail leading-relaxed text-ink-400">
              A telehealth visit legally happens where the member is sitting. Ask the caller where
              they will physically be that day before you promise anyone.
              {blocked.length > 0 && (
                <>
                  {" "}
                  Not available for {memberState}:{" "}
                  <span className="text-ink-300">{blocked.map((b) => b.name).join(", ")}</span>.
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {people.length === 0 && (
        <div className="card flex gap-3 border-watch/30 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-watch" />
          <p className="min-w-0 text-detail leading-relaxed text-ink-300">
            Nobody qualified is available for {visitTypeMap[visitType].label} at{" "}
            {locationName(venue)}
            {venue === "telehealth" ? ` for a member in ${memberState}` : ""}. Try another site or
            visit type rather than booking something that cannot be delivered.
          </p>
        </div>
      )}

      {/* Day strip. Fourteen days is the engine's horizon and it is not this
          component's business to invent a fifteenth. */}
      {days.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {days.map((d, i) => {
            const openTimes = new Set(d.slots.map((s) => s.time)).size;
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => {
                  setDayIdx(i);
                  setChosen(null);
                }}
                className={cn(
                  "min-w-[4.5rem] shrink-0 rounded-panel border px-2.5 py-2 text-center transition-colors focus-ring",
                  i === dayIdx
                    ? "border-low/50 bg-low/10"
                    : "border-ink-700 bg-ink-850/60 hover:border-ink-600",
                )}
              >
                <span className="block text-micro uppercase tracking-wide text-ink-400">
                  {d.label}
                </span>
                <span className="stat-mono mt-0.5 block text-detail text-ink-50">
                  {d.date.slice(8)}
                </span>
                <span
                  className={cn(
                    "mt-1 block text-micro",
                    openTimes ? "text-optimal" : "text-ink-600",
                  )}
                >
                  {openTimes ? `${openTimes} open` : d.unstaffed ? "closed" : "full"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Two-up on a phone so the clinician's name under each time is still
          readable; four across the counter tablet, six on the desk monitor. */}
      {activeDay && shown.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {shown.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setChosen(s)}
              className={cn(
                // Deliberately tall. This is tapped at speed, mid-sentence.
                "min-h-[3.5rem] rounded-panel border px-2 py-2 text-center transition-colors focus-ring",
                chosen?.id === s.id
                  ? "border-low/60 bg-low/15"
                  : "border-ink-700 bg-ink-850/60 hover:border-ink-600",
              )}
            >
              <span className="stat-mono block text-body font-semibold text-ink-50">{s.time}</span>
              <span className="mt-0.5 block truncate text-micro text-ink-500">
                {s.staffName.replace(/^Dr\.\s*/, "")}
              </span>
            </button>
          ))}
        </div>
      )}

      {activeDay && shown.length === 0 && days.length > 0 && (
        <p className="card p-3 text-detail leading-relaxed text-ink-400">
          {activeDay.unstaffed
            ? `Nobody qualified is rostered at ${locationName(venue)} on ${formatDate(activeDay.date)}.`
            : `${formatDate(activeDay.date)} is fully booked.`}{" "}
          Every time on this screen comes from the published roster minus what is already on the
          books — an empty day is a real answer, not a loading state.
        </p>
      )}

      {chosen && (
        <div className="card border-low/40 p-4">
          <p className="label-eyebrow">Read this back to them</p>
          <p className="mt-2 font-display text-heading font-semibold leading-snug text-ink-50">
            {visitTypeMap[chosen.visitType].label} · {formatDate(chosen.startIso)} at{" "}
            <span className="stat-mono">{chosen.time}</span>
          </p>
          <p className="mt-1.5 text-detail leading-relaxed text-ink-400">
            {chosen.staffName}
            {chosen.staffCredentials ? `, ${chosen.staffCredentials}` : ""} ·{" "}
            {locationName(chosen.locationId)} · <span className="stat-mono">{chosen.durationMin}</span>{" "}
            min
            {locationMap[chosen.locationId]?.address
              ? ` · ${locationMap[chosen.locationId].address}`
              : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={confirm} className="h-11 px-5 text-body">
              <Check className="h-4 w-4" />
              Book it
            </Button>
            <Button variant="ghost" onClick={() => setChosen(null)} className="h-11 px-4 text-body">
              Another time
            </Button>
          </div>
        </div>
      )}

      <p className="text-detail leading-relaxed text-ink-600">
        <Clock className="mr-1 inline h-3.5 w-3.5 -translate-y-px" />
        Availability comes from <span className="text-ink-500">lib/booking/availability.ts</span> —
        the published roster minus what is already booked minus the visit&apos;s own duration, with
        lunch blocked. Booking as{" "}
        <span className="text-ink-500">{staffName(deskStaffFor(scope))}</span> writes a real ledger
        row. The
        booking itself lives in a module array for this session, not a database.
      </p>
    </div>
  );
}
