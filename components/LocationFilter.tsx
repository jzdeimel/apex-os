"use client";

import { MapPin } from "lucide-react";
import { useStore } from "@/lib/store";
import { locations } from "@/lib/mock/locations";
import { scopeFor, currentDeskStaffId } from "@/lib/frontdesk/scope";
import { usePortal } from "@/lib/portalStore";
import type { LocationId } from "@/lib/types";

export function LocationFilter() {
  const { portal } = usePortal();
  // The desk is the only portal with a per-person location assignment today.
  // Every other staff portal is clinic-wide, and ownership is explicitly
  // unrestricted — see lib/frontdesk/scope.ts.
  const scope = portal.id === "desk" ? scopeFor(currentDeskStaffId()) : null;
  const visible = scope ? locations.filter((l) => scope.allowed.includes(l.id)) : locations;
  const allowAll = !scope || scope.unrestricted;

  const { locationFilter, setLocationFilter } = useStore();

  return (
    <div className="relative flex items-center">
      <MapPin className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-gold-400/80" />
      <select
        value={locationFilter}
        onChange={(e) => setLocationFilter(e.target.value as LocationId | "all")}
        className="h-9 appearance-none rounded-lg border border-ink-800 bg-ink-900/70 pl-8 pr-7 text-detail font-medium text-ink-100 focus-ring"
        aria-label="Filter by location"
      >
        {/*
          SCOPED. This filter used to offer every site to every staff portal,
          which handed a receptionist at one clinic a picker for the other
          three — the same minimum-necessary problem the desk day board had, in
          shared chrome where it was easier to miss.

          Ownership keeps "All locations" because comparing sites is the job.
          A desk assigned to one clinic gets no "all" option at all: an option
          that reveals other locations' volume is a leak even if the rows behind
          it are filtered.
        */}
        {allowAll && <option value="all">All locations</option>}
        {visible.map((l) => (
          <option key={l.id} value={l.id}>
            {l.short}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2.5 h-3 w-3 text-ink-500"
        viewBox="0 0 12 12"
        fill="none"
      >
        <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
