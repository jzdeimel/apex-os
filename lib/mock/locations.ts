import type { Location, LocationId } from "@/lib/types";

export const locations: Location[] = [
  {
    id: "raleigh",
    name: "Alpha Health — Raleigh",
    short: "Raleigh",
    city: "Raleigh",
    state: "NC",
    address: "4110 Briargrove Cir, Raleigh, NC",
    type: "clinic",
    timezone: "America/New_York",
  },
  {
    id: "raleigh-boutique",
    name: "Alpha Health — Raleigh Boutique",
    short: "Raleigh Boutique",
    city: "Raleigh",
    state: "NC",
    address: "8480 Honeycutt Rd, Raleigh, NC",
    type: "clinic",
    timezone: "America/New_York",
  },
  {
    id: "southern-pines",
    name: "Alpha Health — Southern Pines",
    short: "Southern Pines",
    city: "Southern Pines",
    state: "NC",
    address: "200 SW Broad St, Southern Pines, NC",
    type: "clinic",
    timezone: "America/New_York",
  },
  {
    id: "myrtle-beach",
    name: "Alpha Health — Myrtle Beach",
    short: "Myrtle Beach",
    city: "Myrtle Beach",
    state: "SC",
    address: "1320 Farrow Pkwy, Myrtle Beach, SC",
    type: "clinic",
    timezone: "America/New_York",
  },
  {
    id: "telehealth",
    name: "Alpha Health — Telehealth",
    short: "Telehealth",
    city: "Virtual",
    state: "—",
    type: "virtual",
    timezone: "America/New_York",
  },
];

export const locationMap: Record<LocationId, Location> = Object.fromEntries(
  locations.map((l) => [l.id, l]),
) as Record<LocationId, Location>;

export function locationName(id: LocationId) {
  return locationMap[id]?.short ?? id;
}
