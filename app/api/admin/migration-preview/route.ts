import { NextRequest, NextResponse } from "next/server";

import { unavailable } from "@/lib/api/respond";
import { guard } from "@/lib/auth/guard";
import { nowIso } from "@/lib/clock";
import { readAlphaMigrationPreview } from "@/lib/db/migrationPreviewRepo";
import { appendLedgerRow } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const g = await guard("admin:export");
  if (!g.ok) return g.res;

  const page = Number.parseInt(request.nextUrl.searchParams.get("page") ?? "0", 10);
  const query = request.nextUrl.searchParams.get("q") ?? "";

  try {
    const preview = await readAlphaMigrationPreview({ query, page, pageSize: 25 });
    const ledger = await appendLedgerRow(
      {
        actorId: g.actor.id,
        actorName: g.principal.name,
        actorRole: g.actor.accessProfile,
        action: "view",
        entity: "chart",
        entityId: "alpha-import-preview",
        reason: "Viewed the protected Alpha-to-Apex migration preview.",
        after: {
          resultCount: preview.patients.length,
          queryApplied: Boolean(preview.query),
          sourceSystem: preview.sourceSystem,
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
      "admin.migration-preview",
      error,
      "The protected Alpha import preview is temporarily unavailable.",
    );
  }
}
