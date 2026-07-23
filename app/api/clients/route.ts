import { NextRequest, NextResponse } from "next/server";

import { unavailable } from "@/lib/api/respond";
import { actorFromPrincipal } from "@/lib/auth/actor";
import { currentPrincipal } from "@/lib/auth/principal";
import { can, hasCapability } from "@/lib/authz/capabilities";
import { nowIso } from "@/lib/clock";
import { readAlphaMigrationPreview } from "@/lib/db/migrationPreviewRepo";
import { appendLedgerRow } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const principal = await currentPrincipal();
  if (!principal) {
    return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
  }
  const actor = actorFromPrincipal(principal);
  if (!actor) {
    return NextResponse.json({ ok: false, error: "No staff record for this sign-in." }, { status: 403 });
  }

  const mayOpenDirectory = (
    can(actor, "read:chart").allowed ||
    can(actor, "read:directory").allowed ||
    can(actor, "read:all-clients").allowed
  );
  if (!mayOpenDirectory) {
    return NextResponse.json(
      { ok: false, error: "Your role does not include access to the patient directory." },
      { status: 403 },
    );
  }

  const page = Number.parseInt(request.nextUrl.searchParams.get("page") ?? "0", 10);
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const mayReadClinical = hasCapability(actor.accessProfile, "read:clinical");
  const mayReadFinancial = hasCapability(actor.accessProfile, "read:financial");
  const mayReadOrders = hasCapability(actor.accessProfile, "read:orders");

  try {
    const preview = await readAlphaMigrationPreview({
      query,
      page,
      pageSize: 25,
      access: {
        allClients: hasCapability(actor.accessProfile, "read:all-clients"),
        staffId: actor.id,
        locationIds: actor.locationIds,
      },
    });
    const ledger = await appendLedgerRow(
      {
        actorId: actor.id,
        actorName: principal.name,
        actorRole: actor.accessProfile,
        action: "view",
        entity: "chart",
        entityId: "patient-directory",
        reason: "Viewed the authoritative Apex patient directory.",
        after: {
          resultCount: preview.patients.length,
          queryApplied: Boolean(preview.query),
          accessProfile: actor.accessProfile,
        },
      },
      nowIso(),
    );

    return NextResponse.json(
      {
        ok: true,
        authoritative: true,
        durableAudit: true,
        ledgerId: ledger.id,
        query: preview.query,
        page: preview.page,
        pageSize: preview.pageSize,
        matching: preview.matching,
        permissions: {
          clinical: mayReadClinical,
          financial: mayReadFinancial,
          orders: mayReadOrders,
        },
        patients: preview.patients.map((patient) => ({
          id: patient.id,
          mrn: patient.mrn,
          firstName: patient.firstName,
          lastName: patient.lastName,
          preferredName: patient.preferredName,
          dateOfBirth: patient.dateOfBirth,
          email: patient.email,
          phone: patient.phone,
          status: patient.status,
          homeLocationId: patient.homeLocationId,
          consultCount: mayReadClinical ? patient.consultCount : null,
          contactCount: patient.contactCount,
          saleCount: mayReadFinancial ? patient.saleCount : null,
          netSalesCents: mayReadFinancial ? patient.netSalesCents : null,
          fulfillmentCount: mayReadOrders ? patient.fulfillmentCount : null,
        })),
      },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    return unavailable(
      "clients.directory",
      error,
      "The authoritative patient directory is temporarily unavailable.",
    );
  }
}
