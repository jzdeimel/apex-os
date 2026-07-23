import { NextResponse } from "next/server";

import { unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { readExecutiveSummary } from "@/lib/db/executiveRepo";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard("read:business-metrics");
  if (!g.ok) return g.res;
  try {
    const summary = await readExecutiveSummary();
    return NextResponse.json({ ok: true, authoritative: true, summary });
  } catch (error) {
    return unavailable("executive.summary", error, "The authoritative executive summary is temporarily unavailable.");
  }
}
