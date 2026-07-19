import type { Location, LocationId } from "@/lib/types";

export const locations: Location[] = [
  {
    id: "raleigh",
    name: "Alpha Health — Raleigh",
    short: "Raleigh",
    city: "Raleigh",
    state: "NC",
    address: "701 Mutual Ct, Suite 100, Raleigh, NC",
    phone: "919-891-8149",
    type: "clinic",
    timezone: "America/New_York",
  },
  {
    id: "raleigh-boutique",
    name: "Alpha Health — Raleigh Boutique",
    short: "Raleigh Boutique",
    city: "Raleigh",
    state: "NC",
    address: "6325 Falls of Neuse Rd, Suite 27, Raleigh, NC",
    phone: "919-891-8149",
    type: "clinic",
    timezone: "America/New_York",
  },
  {
    id: "southern-pines",
    name: "Alpha Health — Southern Pines",
    short: "Southern Pines",
    city: "Southern Pines",
    state: "NC",
    address: "1545 US Hwy 1, Southern Pines, NC",
    phone: "910-696-6299",
    type: "clinic",
    timezone: "America/New_York",
  },
  {
    id: "myrtle-beach",
    name: "Alpha Health — Myrtle Beach",
    short: "Myrtle Beach",
    city: "Myrtle Beach",
    state: "SC",
    address: "4999 Carolina Forest Blvd, #9, Myrtle Beach, SC",
    phone: "843-790-0480",
    type: "clinic",
    timezone: "America/New_York",
  },
  {
    id: "telehealth",
    name: "Alpha Health — Telehealth",
    short: "Telehealth",
    city: "Virtual",
    state: "—",
    phone: "833-549-9993",
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
