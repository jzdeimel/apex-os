import { NextResponse } from "next/server";
import { unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { readSchedulingReference } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard("read:all-schedules");
  if (!g.ok) return g.res;
  try {
    const reference = await readSchedulingReference();
    const allowed = new Set(g.actor.locationIds);
    const locations = reference.locations.filter((row) => allowed.has(row.id));
    const locationIds = new Set(locations.map((row) => row.id));
    const clients = reference.clients.filter((row) => row.homeLocationId && locationIds.has(row.homeLocationId));
    const staff = reference.staff.filter((row) => {
      const ids = Array.isArray(row.locationIds) ? row.locationIds as string[] : [];
      return ids.some((id) => locationIds.has(id));
    });
    return NextResponse.json({ ok: true, clients, staff, locations });
  } catch (error) {
    return unavailable("scheduling.reference", error, "The booking directory is temporarily unavailable.");
  }
}
