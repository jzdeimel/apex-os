import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarCheck } from "lucide-react";
import { PatientBooking } from "@/components/patient/PatientBooking";
import { Card, CardContent } from "@/components/ui/primitives";
import { patientPortalSummary, patientSubjectForToken } from "@/lib/auth/patientRepo";
import { PATIENT_SESSION_COOKIE } from "@/lib/auth/patientTokens";
import { readPatientSelfBookingSlots } from "@/lib/db/repo";
import { isFeatureEnabledFor } from "@/lib/features/server";

export const dynamic = "force-dynamic";

export default async function PatientBookPage() {
  const cookieStore = await cookies();
  const subject = await patientSubjectForToken(cookieStore.get(PATIENT_SESSION_COOKIE)?.value);
  if (!subject) redirect("/patient-sign-in");
  const enabled = await isFeatureEnabledFor("self-booking", { clientId: subject.clientId });
  if (!enabled) redirect("/patient");
  const [summary, availability] = await Promise.all([
    patientPortalSummary(subject.clientId),
    readPatientSelfBookingSlots(subject.clientId),
  ]);
  if (!summary) redirect("/patient-sign-in");
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
      <Link href="/patient" className="inline-flex items-center gap-2 text-detail font-medium text-teal-300 hover:text-teal-200"><ArrowLeft className="h-4 w-4" /> Back to your record</Link>
      <header className="mt-7 border-b border-ink-700/70 pb-7"><p className="label-eyebrow">Verified availability</p><h1 className="mt-3 flex items-center gap-3 font-display text-display text-ink-50"><CalendarCheck className="h-7 w-7 text-teal-300" /> Appointments</h1><p className="mt-3 max-w-2xl text-body leading-relaxed text-ink-400">Book or cancel a virtual follow-up with your assigned coach. Medical scheduling still routes through your coach.</p></header>
      <Card className="mt-8"><CardContent className="p-6"><PatientBooking slots={availability.slots} timezone={summary.patient.timezone} upcoming={summary.appointments.map((visit) => ({ id: visit.id, visitType: visit.visitType, startAt: visit.startAt.toISOString(), staffName: visit.staffName }))} /></CardContent></Card>
      {!availability.ready && <p className="mt-4 text-detail text-ink-500">Scheduling configuration: {availability.reason}</p>}
    </main>
  );
}
