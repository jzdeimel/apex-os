import { NextRequest, NextResponse } from "next/server";
import { fail, unavailable } from "@/lib/api/respond";
import { requestIsSameOrigin } from "@/lib/api/origin";
import { patientSubjectForToken } from "@/lib/auth/patientRepo";
import { PATIENT_SESSION_COOKIE } from "@/lib/auth/patientTokens";
import { nowIso } from "@/lib/clock";
import {
  bookAppointmentWithLedger,
  changeAppointmentWithLedger,
  readAppointmentCareScope,
  readPatientSelfBookingSlots,
} from "@/lib/db/repo";
import { isFeatureEnabledFor } from "@/lib/features/server";
import { appointmentRequestId } from "@/lib/scheduling/lifecycle";

export const dynamic = "force-dynamic";

const REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;

async function patientFor(request: NextRequest) {
  return patientSubjectForToken(
    request.cookies.get(PATIENT_SESSION_COOKIE)?.value,
  );
}

async function allowed(clientId: string) {
  return isFeatureEnabledFor("self-booking", { clientId });
}

export async function GET(request: NextRequest) {
  try {
    const patient = await patientFor(request);
    if (!patient) return fail(401, "Not authenticated.");
    if (!(await allowed(patient.clientId))) {
      return fail(404, "Self-booking is not enabled for this account.");
    }
    const availability = await readPatientSelfBookingSlots(patient.clientId);
    return NextResponse.json({ ok: true, authoritative: true, ...availability });
  } catch (error) {
    return unavailable("patient.appointments.slots", error, "Appointment availability is temporarily unavailable.");
  }
}

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return fail(403, "This booking request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.requestId !== "string" || !REQUEST_ID.test(body.requestId) || typeof body.startAt !== "string") {
    return fail(400, "startAt and a valid requestId are required.");
  }
  try {
    const patient = await patientFor(request);
    if (!patient) return fail(401, "Not authenticated.");
    if (!(await allowed(patient.clientId))) return fail(404, "Self-booking is not enabled for this account.");
    const availability = await readPatientSelfBookingSlots(patient.clientId);
    if (!availability.ready) return fail(409, availability.reason);
    const slot = availability.slots.find((item) => item.startAt === body.startAt);
    if (!slot) return fail(409, "That opening is no longer available. Refresh and choose another time.");
    const at = nowIso();
    const result = await bookAppointmentWithLedger({
      id: appointmentRequestId(patient.clientId, body.requestId),
      clientId: patient.clientId,
      staffId: slot.staffId,
      locationId: slot.locationId,
      visitType: slot.visitType,
      modality: slot.modality,
      startAt: slot.startAt,
      endAt: slot.endAt,
      reason: "Patient self-booked assigned-coach follow-up",
      actorId: patient.clientId,
      actorName: `${patient.firstName} ${patient.lastName}`.trim(),
      actorRole: "Patient",
      at,
    });
    if (!result.appointment) {
      return NextResponse.json(
        { ok: false, error: result.issues.join(" "), issues: result.issues },
        { status: 409 },
      );
    }
    return NextResponse.json({
      ok: true,
      authoritative: true,
      appointment: result.appointment,
      ledgerId: result.ledger?.id ?? null,
      duplicate: result.duplicate,
    });
  } catch (error) {
    return unavailable("patient.appointments.book", error, "The appointment was not confirmed.");
  }
}

export async function PATCH(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return fail(403, "This appointment request came from an untrusted origin.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || body.action !== "cancel" || typeof body.id !== "string" || typeof body.reason !== "string" || !body.reason.trim()) {
    return fail(400, "id, action cancel, and a reason are required.");
  }
  try {
    const patient = await patientFor(request);
    if (!patient) return fail(401, "Not authenticated.");
    if (!(await allowed(patient.clientId))) return fail(404, "Self-booking is not enabled for this account.");
    const loaded = await readAppointmentCareScope(body.id);
    if (!loaded || loaded.appointment.clientId !== patient.clientId) return fail(404, "Unknown appointment.");
    const result = await changeAppointmentWithLedger({
      id: body.id,
      action: "cancel",
      actorId: patient.clientId,
      actorName: `${patient.firstName} ${patient.lastName}`.trim(),
      actorRole: "Patient",
      at: nowIso(),
      reason: body.reason.trim().slice(0, 2_000),
    });
    if (result.status === "missing") return fail(404, "Unknown appointment.");
    if (result.status !== "ok") return fail(result.status === "conflict" ? 409 : 400, result.reason);
    return NextResponse.json({ ok: true, authoritative: true, appointment: result.appointment, ledgerId: result.ledger.id });
  } catch (error) {
    return unavailable("patient.appointments.cancel", error, "The appointment was not cancelled.");
  }
}
