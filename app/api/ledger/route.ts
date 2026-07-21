import { NextResponse } from "next/server";
import { fail, serverError, unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { readLedger } from "@/lib/db/repo";

/**
 * Read the DURABLE audit trail — the rows actually written to Postgres by the
 * gated mutation endpoints (consult sign, etc.).
 *
 * This is the other half of making traceability true: not only does a sign write
 * a real row, you can read the persisted chain back. Distinct from the seeded
 * in-memory ledger the demo also shows — this one is empty until a real mutation
 * happens, and everything in it survived a round-trip through the database.
 *
 * Gated on read:ledger (Medical, Admin, owner). Unmapped or unentitled → refused.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard("read:ledger");
  if (!g.ok) return g.res;

  try {
    const rows = await readLedger(200);
    return NextResponse.json({
      ok: true,
      durable: true,
      count: rows.length,
      rows,
    });
  } catch (err) {
    return unavailable("ledger.read", err, 'The audit ledger is unavailable.');
  }
}
