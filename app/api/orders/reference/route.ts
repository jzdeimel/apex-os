import { NextResponse } from "next/server";

import { unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { readOrderReference } from "@/lib/db/orderRepo";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard("write:order");
  if (!g.ok) return g.res;
  try {
    return NextResponse.json({
      ok: true,
      reference: await readOrderReference(g.actor),
      actor: { id: g.actor.id, name: g.principal.name, role: g.actor.role },
    });
  } catch (error) {
    return unavailable("orders.reference", error, "The patient order directory is temporarily unavailable.");
  }
}
