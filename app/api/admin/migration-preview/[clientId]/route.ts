import { NextRequest, NextResponse } from "next/server";

import { unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { nowIso } from "@/lib/clock";
import { readAlphaMigrationPatient } from "@/lib/db/migrationPreviewRepo";
import { appendLedgerRow } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ clientId: string }> },
) {
  const g = await guard("admin:export");
  if (!g.ok) return g.res;

  const { clientId } = await context.params;
  try {
    const preview = await readAlphaMigrationPatient(clientId);
    if (!preview) {
      return NextResponse.json(
        { ok: false, error: "Imported Alpha patient not found." },
        { status: 404, headers: { "Cache-Control": "no-store, private" } },
      );
    }
    const ledger = await appendLedgerRow(
      {
        actorId: g.actor.id,
        actorName: g.principal.name,
        actorRole: g.actor.accessProfile,
        action: "view",
        entity: "chart",
        entityId: clientId,
        reason: "Viewed an imported Alpha patient record in Apex nonproduction.",
        after: {
          sourceSystem: preview.sourceSystem,
          consultCount: preview.consults.length,
          contactCount: preview.contacts.length,
          sourceRecordCount: preview.sourceRecords.length,
        },
      },
      nowIso(),
    );
    return NextResponse.json(
      { ok: true, durableAudit: true, ledgerId: ledger.id, ...preview },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    return unavailable(
      "admin.migration-preview.patient",
      error,
      "The imported Alpha patient record is temporarily unavailable.",
    );
  }
}
