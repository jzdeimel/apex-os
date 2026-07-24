import { NextResponse } from "next/server";

import { unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { authoritativeIntegrityAudit } from "@/lib/db/auditRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Administrative integrity report over authoritative PostgreSQL records. */
export async function GET() {
  const g = await guard("admin:export");
  if (!g.ok) return g.res;
  try {
    return NextResponse.json(await authoritativeIntegrityAudit());
  } catch (error) {
    return unavailable(
      "audit.authoritative",
      error,
      "The authoritative integrity audit is temporarily unavailable.",
    );
  }
}
