"use client";

import { AlertTriangle, DoorOpen } from "lucide-react";
import type { Appointment } from "@/lib/types";
import { roomsFor, type Room } from "@/lib/frontdesk/rooms";
import type { DeskRow } from "@/lib/frontdesk/day";
import { cn } from "@/lib/utils";

/**
 * Which room.
 *
 * Rooming is a two-tap action, not a two-screen one: the picker opens INSIDE
 * the row, under the person it concerns, so the name stays on screen while the
 * choice is made. A modal here would cover the board at the exact moment the
 * user needs to see whether Exam 2 is free.
 *
 * Three things this refuses to do:
 *
 *  · OFFER A ROOM THAT IS TAKEN. An occupied room renders with the member
 *    currently in it and is not clickable. The desk already knows this from
 *    walking past the door; the software should not be the one thing in the
 *    building that does not.
 *  · OFFER A ROOM THAT DOES NOT EXIST. The list is `roomsFor(site, visitType)`,
 *    so the boutique never offers a scanner it does not have.
 *  · HIDE THE MISMATCH. When a site has no room of the right kind, the picker
 *    says so and still offers the rooms that do exist, flagged. A Body Scan at
 *    the boutique is a real scheduling mistake and the desk needs to be able to
 *    put the person somewhere while they sort it out — refusing outright would
 *    leave them standing in reception.
 */
export function RoomPicker({
  appt,
  occupied,
  onPick,
  onCancel,
}: {
  appt: Appointment;
  /** Room id → the row currently in it. */
  occupied: Record<string, DeskRow>;
  onPick: (room: Room) => void;
  onCancel: () => void;
}) {
  const { suited, other, noSuitableRoom, kind } = roomsFor(appt.locationId, appt.type);

  if (kind === null) {
    // Telehealth. There is no room, and inventing one would be the smallest
    // possible lie on the biggest possible surface.
    return null;
  }

  const groups: { label: string; rooms: Room[]; flagged: boolean }[] = [
    { label: noSuitableRoom ? "" : "Right room for this visit", rooms: suited, flagged: false },
    { label: "Other rooms on site", rooms: other, flagged: true },
  ].filter((g) => g.rooms.length > 0);

  return (
    <div className="mt-2 rounded-panel border border-low/30 bg-low/[0.06] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="label-eyebrow">Room {firstName(appt)}</p>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-control px-2 py-1 text-micro text-ink-400 transition-colors hover:text-ink-100 focus-ring"
        >
          Cancel
        </button>
      </div>

      {noSuitableRoom && (
        <p className="mt-2 flex items-start gap-2 text-detail leading-relaxed text-watch">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            This site has no {kind} room. {appt.type} is booked somewhere it cannot properly be
            delivered — room them anywhere for now and flag the booking.
          </span>
        </p>
      )}

      {groups.map((g) => (
        <div key={g.label || "suited"} className="mt-2.5">
          {g.label && <p className="text-micro uppercase tracking-wide text-ink-600">{g.label}</p>}
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
            {g.rooms.map((r) => {
              const taken = occupied[r.id];
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={!!taken}
                  onClick={() => onPick(r)}
                  title={r.note}
                  className={cn(
                    // Tall targets: this is tapped with a thumb, one-handed,
                    // while the member is standing there.
                    "min-h-[3.25rem] rounded-control border px-2.5 py-2 text-left transition-colors focus-ring",
                    taken
                      ? "cursor-not-allowed border-ink-800 bg-ink-900/40"
                      : g.flagged
                        ? "border-watch/30 bg-ink-850/70 hover:border-watch/60"
                        : "border-ink-600 bg-ink-850/70 hover:border-low/60 hover:bg-low/10",
                  )}
                >
                  <span
                    className={cn(
                      "block truncate text-detail font-medium",
                      taken ? "text-ink-600" : "text-ink-50",
                    )}
                  >
                    {r.label}
                  </span>
                  <span className="mt-0.5 block truncate text-micro text-ink-500">
                    {taken
                      ? `${taken.client?.firstName ?? taken.appt.clientName} in here`
                      : (r.note ?? "Open")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {suited.length === 0 && other.length === 0 && (
        <p className="mt-2 flex items-start gap-2 text-detail text-ink-400">
          <DoorOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          No rooms are modelled for this site.
        </p>
      )}
    </div>
  );
}

/** First name only in the picker heading — the full row is directly above it. */
function firstName(appt: Appointment): string {
  return appt.clientName.split(" ")[0] ?? appt.clientName;
}
