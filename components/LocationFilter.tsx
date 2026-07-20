"use client";

import { MapPin } from "lucide-react";
import { useStore } from "@/lib/store";
import { locations } from "@/lib/mock/locations";
import type { LocationId } from "@/lib/types";

export function LocationFilter() {
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
        <option value="all">All locations</option>
        {locations.map((l) => (
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
