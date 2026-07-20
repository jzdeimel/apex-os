"use client";

import * as React from "react";
import { Boxes, DoorClosed, DoorOpen, MapPin, Phone, Video } from "lucide-react";
import Link from "next/link";
import type { LocationId } from "@/lib/types";
import { locationMap, locationName } from "@/lib/mock/locations";
import { inventory } from "@/lib/mock/inventory";
import { visitTypeMap } from "@/lib/booking/availability";
import { roomsAt } from "@/lib/frontdesk/rooms";
import { duration } from "@/lib/frontdesk/clock";
import { useDeskDay, deskLocations } from "@/lib/frontdesk/useDesk";
import { currentDeskStaffId } from "@/lib/frontdesk/scope";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * Which rooms are going, and what is actually in this building.
 *
 * A room board is the second thing a desk looks at after the queue: "can I put
 * the 11:15 draw somewhere yet". It is deliberately a grid of doors rather than
 * a list — the shape of the answer is spatial, and staff already hold a mental
 * map of the corridor.
 *
 * Occupancy is derived from the encounter journal, not stored twice. A room is
 * occupied because somebody is Roomed in it; there is no separate room-status
 * field that could drift out of agreement with the board next door.
 */

const KIND_LABEL: Record<string, string> = {
  exam: "Exam",
  consult: "Consult",
  draw: "Draw",
  infusion: "Infusion",
  scan: "Scan",
};

function SiteRooms({ locationId }: { locationId: LocationId }) {
  const { day } = useDeskDay();
  const rooms = roomsAt(locationId);
  const loc = locationMap[locationId];

  if (loc.type === "virtual") {
    return (
      <div className="card p-4">
        <p className="flex items-center gap-2 font-display text-heading font-semibold text-ink-50">
          <Video className="h-4 w-4 text-low" />
          Telehealth has no rooms
        </p>
        <p className="mt-2 text-detail leading-relaxed text-ink-400">
          A video member is sitting in their own kitchen. The desk still marks them joined and
          closes the visit out, so the encounter clock runs — there is simply no door to assign,
          and inventing a “Virtual Room 1” to keep the state machine tidy would be the smallest
          possible lie on the largest possible surface.
        </p>
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className="card p-4 text-detail text-ink-400">
        No rooms are modelled for {loc.short}.
      </div>
    );
  }

  const free = rooms.filter((r) => !day.occupiedRooms[r.id]).length;

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="label-eyebrow">{loc.short} · rooms</p>
        <p className="text-micro text-ink-500">
          <span className="stat-mono text-ink-200">{free}</span> of{" "}
          <span className="stat-mono text-ink-200">{rooms.length}</span> free
        </p>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((r) => {
          const row = day.occupiedRooms[r.id];
          const over = row?.overrunMin !== undefined && row.overrunMin > 2;
          return (
            <div
              key={r.id}
              className={cn(
                "card min-w-0 px-3 py-2.5",
                row ? "border-low/35" : "border-ink-700/70",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-body font-semibold text-ink-50">{r.label}</p>
                <Badge tone={row ? "low" : "neutral"}>
                  {row ? <DoorClosed className="h-3 w-3" /> : <DoorOpen className="h-3 w-3" />}
                  {row ? "In use" : "Free"}
                </Badge>
              </div>

              <p className="mt-0.5 truncate text-micro text-ink-600">
                {KIND_LABEL[r.kind] ?? r.kind}
                {r.note ? ` · ${r.note}` : ""}
              </p>

              {row && (
                <div className="mt-2 min-w-0 border-t border-ink-800/70 pt-2">
                  <p className="truncate text-detail font-medium text-ink-100">
                    {row.client ? `${row.client.firstName} ${row.client.lastName}` : row.appt.clientName}
                  </p>
                  <p className="mt-0.5 truncate text-micro text-ink-500">
                    {visitTypeMap[row.appt.type]?.label ?? row.appt.type} ·{" "}
                    <span className={cn("stat-mono", over ? "text-high" : "text-low")}>
                      {duration(row.inRoomMin ?? 0)}
                      {over ? ` · ${row.overrunMin}m over` : ""}
                    </span>
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * What is actually true about this site.
 *
 * The stock line exists to answer a specific audit finding.
 * `app/supply-chain/page.tsx:112` charts inventory per location and
 * raleigh-boutique — which holds ZERO rows in `lib/mock/inventory.ts` — simply
 * vanishes from the chart. A location that disappears reads as a location that
 * is fine. So this card names every site, always, and says out loud when the
 * number is missing rather than absent: nought rows in the fixture is a gap in
 * the DATA, not an empty shelf, and those two things need different phone calls.
 */
function SiteFacts({ locationId }: { locationId: LocationId }) {
  const loc = locationMap[locationId];
  const rows = inventory.filter((i) => i.locationId === locationId);
  const rooms = roomsAt(locationId);
  const lowRows = rows.filter((i) => i.status === "low" || i.status === "out of stock").length;

  return (
    <div className="card min-w-0 px-3 py-2.5">
      <p className="truncate text-body font-semibold text-ink-50">{loc.short}</p>

      <p className="mt-1 flex items-start gap-1.5 text-micro leading-relaxed text-ink-500">
        {loc.type === "virtual" ? (
          <Video className="mt-0.5 h-3 w-3 shrink-0" />
        ) : (
          <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
        )}
        <span className="min-w-0">{loc.address ?? "Virtual — no address"}</span>
      </p>

      {loc.phone && (
        <p className="mt-1 flex items-center gap-1.5 text-micro text-ink-500">
          <Phone className="h-3 w-3 shrink-0" />
          <span className="stat-mono">{loc.phone}</span>
        </p>
      )}

      <p className="mt-2 flex items-start gap-1.5 border-t border-ink-800/70 pt-2 text-micro leading-relaxed">
        <Boxes className="mt-0.5 h-3 w-3 shrink-0 text-ink-500" />
        {rows.length === 0 ? (
          <span className="min-w-0 text-watch">
            No inventory rows in the seed for this site. Not “nothing in stock” — nothing modelled.
            The supply-chain chart drops this location entirely rather than saying so.
          </span>
        ) : (
          <span className="min-w-0 text-ink-500">
            <span className="stat-mono text-ink-200">{rows.length}</span> stock lines
            {lowRows > 0 && (
              <span className="text-watch">
                {" "}
                · <span className="stat-mono">{lowRows}</span> low or out
              </span>
            )}{" "}
            ·{" "}
            <Link href="/supply-chain" className="rounded-control underline focus-ring">
              Stock
            </Link>
          </span>
        )}
      </p>

      <p className="mt-1 text-micro text-ink-600">
        {rooms.length === 0
          ? "No rooms — video only"
          : `${rooms.length} room${rooms.length === 1 ? "" : "s"}`}
      </p>
    </div>
  );
}

export function RoomBoard() {
  const { day, scope } = useDeskDay();
  const allowedSites = deskLocations(currentDeskStaffId());
  const sites: LocationId[] = scope === "all" ? allowedSites : [scope as LocationId];

  return (
    <div className="space-y-6">
      {sites.map((id) => (
        <SiteRooms key={id} locationId={id} />
      ))}

      <section>
        <p className="label-eyebrow">
          {scope === "all" ? "Every site" : `${locationName(scope as LocationId)} · site facts`}
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {/* Always every site, even when the board is scoped to one. The whole
              point of the stock line is that a location missing from a summary
              is indistinguishable from a location that is fine. */}
          {allowedSites.map((id: LocationId) => (
            <SiteFacts key={id} locationId={id} />
          ))}
        </div>
      </section>

      <p className="border-t border-ink-800/60 pt-4 text-detail leading-relaxed text-ink-600">
        Occupancy is derived from the encounter journal — a room is in use because somebody was
        roomed into it on the day board, not because a second room-status field says so. It is
        in-memory and resets when the server process does.{" "}
        {day.inRoomCount === 0 && "Nothing is in a room right now."}
      </p>
    </div>
  );
}
