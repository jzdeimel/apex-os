import { NextRequest, NextResponse } from "next/server";

import { fail, unavailable } from "@/lib/api/respond";
import { requestIsSameOrigin } from "@/lib/api/origin";
import { actorFromPrincipal } from "@/lib/auth/actor";
import { patientSubjectForToken } from "@/lib/auth/patientRepo";
import { currentPrincipal } from "@/lib/auth/principal";
import { PATIENT_SESSION_COOKIE } from "@/lib/auth/patientTokens";
import { can } from "@/lib/authz/capabilities";
import {
  logDose,
  readClientCareScope,
  retractDose,
  upsertMemberDay,
} from "@/lib/db/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  op?: "dose" | "retract" | "day";
  clientId?: string;
  doseId?: string;
  prescriptionId?: string;
  date?: string;
  takenAt?: string;
  site?: string;
  skipped?: boolean;
  skipReason?: string;
  weightLb?: number;
  feel?: Record<string, number>;
}

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) {
    return fail(403, "This member-log request came from an untrusted origin.");
  }

  try {
    const patient = await patientSubjectForToken(
      request.cookies.get(PATIENT_SESSION_COOKIE)?.value,
    );
    const principal = patient ? null : await currentPrincipal();
    if (!patient && !principal) return fail(401, "Not authenticated.");
    const body = (await request.json().catch(() => null)) as Body | null;
    if (!body || !body.op) return fail(400, "op is required.");

    // A patient session always chooses its own chart. Staff callers may supply
    // a patient id, but the server-owned care team determines authorization.
    const clientId = patient?.clientId ?? body.clientId;
    if (!clientId) return fail(400, "clientId is required for staff writes.");
    const scope = await readClientCareScope(clientId);
    if (!scope || scope.status !== "active") return fail(404, "Unknown member.");

    if (!patient) {
      const actor = principal ? actorFromPrincipal(principal) : null;
      const allowed =
        actor &&
        can(actor, "write:adherence", {
          coachId: scope.assignedCoachId ?? undefined,
          providerId: scope.assignedProviderId ?? undefined,
          locationId: scope.locationId ?? undefined,
        }).allowed;
      if (!allowed) {
        return fail(403, "You are not permitted to write to this member's log.");
      }
    }

    if (body.op === "dose") {
      if (!body.doseId || !body.prescriptionId || !body.date || !body.takenAt) {
        return fail(
          400,
          "doseId, prescriptionId, date and takenAt are required.",
        );
      }
      await logDose({
        id: body.doseId,
        clientId,
        prescriptionId: body.prescriptionId,
        date: body.date,
        takenAt: body.takenAt,
        site: body.site,
        skipped: body.skipped,
        skipReason: body.skipReason,
      });
      return NextResponse.json({ ok: true, authoritative: true });
    }

    if (body.op === "retract") {
      if (!body.doseId) return fail(400, "doseId is required.");
      const retracted = await retractDose(
        body.doseId,
        clientId,
        new Date().toISOString(),
      );
      if (!retracted) return fail(409, "That dose could not be retracted.");
      return NextResponse.json({ ok: true, authoritative: true });
    }

    if (body.op === "day") {
      if (!body.date) return fail(400, "date is required.");
      await upsertMemberDay({
        clientId,
        date: body.date,
        weightLb: body.weightLb,
        feel: body.feel,
      });
      return NextResponse.json({ ok: true, authoritative: true });
    }

    return fail(400, "Unknown op.");
  } catch (error) {
    return unavailable(
      "member.log",
      error,
      "We could not save that member entry. Please try again.",
    );
  }
}
