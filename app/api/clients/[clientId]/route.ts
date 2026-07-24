import { NextRequest, NextResponse } from "next/server";

import { unavailable } from "@/lib/api/respond";
import { actorFromPrincipal } from "@/lib/auth/actor";
import { currentPrincipal } from "@/lib/auth/principal";
import { can, hasCapability } from "@/lib/authz/capabilities";
import { nowIso } from "@/lib/clock";
import { readAlphaMigrationPatient } from "@/lib/db/migrationPreviewRepo";
import { appendLedgerRow, readClientCareScope } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ clientId: string }> },
) {
  const principal = await currentPrincipal();
  if (!principal) {
    return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
  }
  const actor = actorFromPrincipal(principal);
  if (!actor) {
    return NextResponse.json({ ok: false, error: "No staff record for this sign-in." }, { status: 403 });
  }

  const { clientId } = await context.params;
  try {
    const careScope = await readClientCareScope(clientId);
    if (!careScope) {
      return NextResponse.json(
        { ok: false, error: "Patient not found." },
        { status: 404, headers: { "Cache-Control": "no-store, private" } },
      );
    }
    const subject = {
      coachId: careScope.assignedCoachId ?? undefined,
      providerId: careScope.assignedProviderId ?? undefined,
      locationId: careScope.locationId ?? undefined,
    };
    const chartDecision = can(actor, "read:chart", subject);
    const directoryDecision = can(actor, "read:directory", subject);
    const allDecision = can(actor, "read:all-clients", subject);
    if (!chartDecision.allowed && !directoryDecision.allowed && !allDecision.allowed) {
      return NextResponse.json(
        { ok: false, error: chartDecision.resolveVia ?? chartDecision.reason },
        { status: 403, headers: { "Cache-Control": "no-store, private" } },
      );
    }

    const record = await readAlphaMigrationPatient(clientId);
    if (!record) {
      return NextResponse.json(
        { ok: false, error: "Patient is not available in the authoritative Apex record." },
        { status: 404, headers: { "Cache-Control": "no-store, private" } },
      );
    }

    const clinical = hasCapability(actor.accessProfile, "read:clinical");
    const contacts = hasCapability(actor.accessProfile, "read:messages") ||
      hasCapability(actor.accessProfile, "write:contact");
    const financial = hasCapability(actor.accessProfile, "read:financial");
    const fulfillment = hasCapability(actor.accessProfile, "read:orders");
    const canCall = can(actor, "call:patient", subject).allowed;
    const writeConsult = can(actor, "write:consult", subject).allowed;
    const writeNutrition = can(actor, "write:nutrition", subject).allowed;
    const writeTraining = can(actor, "write:training", subject).allowed;
    const ledger = await appendLedgerRow(
      {
        actorId: actor.id,
        actorName: principal.name,
        actorRole: actor.accessProfile,
        action: "view",
        entity: "chart",
        entityId: clientId,
        reason: "Viewed an authoritative Apex patient chart.",
        after: {
          sourceSystem: record.sourceSystem,
          clinical,
          contacts,
          financial,
          fulfillment,
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
        canCall,
        permissions: { clinical, contacts, financial, fulfillment, writeConsult, writeNutrition, writeTraining },
        patient: record.patient,
        consults: clinical ? record.consults : [],
        contacts: contacts ? record.contacts : [],
        sales: financial ? record.sales : [],
        fulfillment: fulfillment ? record.fulfillment : [],
      },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    return unavailable(
      "clients.patient",
      error,
      "The authoritative patient chart is temporarily unavailable.",
    );
  }
}
