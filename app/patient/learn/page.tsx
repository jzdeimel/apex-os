import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, GraduationCap, ShieldCheck } from "lucide-react";
import { EducationCentre } from "@/components/portal/EducationCentre";
import { patientPortalSummary, patientSubjectForToken } from "@/lib/auth/patientRepo";
import { PATIENT_SESSION_COOKIE } from "@/lib/auth/patientTokens";
import { isFeatureEnabledFor } from "@/lib/features/server";

export const dynamic = "force-dynamic";

export default async function PatientLearnPage() {
  const cookieStore = await cookies();
  const subject = await patientSubjectForToken(
    cookieStore.get(PATIENT_SESSION_COOKIE)?.value,
  );
  if (!subject) redirect("/patient-sign-in");
  const enabled = await isFeatureEnabledFor("member-education", {
    clientId: subject.clientId,
  });
  if (!enabled) redirect("/patient");
  const summary = await patientPortalSummary(subject.clientId);
  if (!summary) redirect("/patient-sign-in");

  const sex =
    summary.patient.sex === "male" || summary.patient.sex === "female"
      ? summary.patient.sex
      : null;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <Link
        href="/patient"
        className="inline-flex items-center gap-2 text-detail font-medium text-teal-300 hover:text-teal-200"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to your record
      </Link>
      <header className="mt-7 border-b border-ink-700/70 pb-7">
        <div className="flex items-center gap-2 text-detail text-teal-300">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Reviewed Alpha Health education
        </div>
        <h1 className="mt-3 flex items-center gap-3 font-display text-display text-ink-50">
          <GraduationCap className="h-7 w-7 text-gold-300" aria-hidden />
          Learn
        </h1>
        <p className="mt-3 max-w-2xl text-body leading-relaxed text-ink-400">
          Plain-language education selected for your care track. This library
          never invents a result, diagnosis, dose, or individual recommendation.
        </p>
      </header>
      <section className="mt-8">
        <EducationCentre
          profile={{
            stableId: subject.clientId,
            sex,
          }}
        />
      </section>
    </main>
  );
}
