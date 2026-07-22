import { NextResponse } from "next/server";
import { fail, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { readSchedulingReference } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard("write:schedule");
  if (!g.ok) return g.res;
  if (g.actor.role !== "Admin") return fail(403, "The front-desk booking directory is Admin-only.");
  try {
    const reference = await readSchedulingReference();
    const allowed = new Set(g.actor.locationIds);
    const locations = reference.locations.filter((row) => allowed.has(row.id));
    const locationIds = new Set(locations.map((row) => row.id));
    const staff = reference.staff.filter((row) => {
      const ids = Array.isArray(row.locationIds) ? row.locationIds as string[] : [];
      return ids.some((id) => locationIds.has(id));
    });
    return NextResponse.json({ ok: true, clients: reference.clients, staff, locations });
  } catch (error) {
    return unavailable("scheduling.reference", error, "The booking directory is temporarily unavailable.");
  }
}

