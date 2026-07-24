import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BadgeDollarSign, CheckCircle2, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/primitives";
import { patientPortalSummary, patientSubjectForToken } from "@/lib/auth/patientRepo";
import { PATIENT_SESSION_COOKIE } from "@/lib/auth/patientTokens";
import { CARE_TRACKS } from "@/lib/brand";
import { readPatientExperience } from "@/lib/db/patientExperienceRepo";
import { isFeatureEnabledFor } from "@/lib/features/server";

export const dynamic = "force-dynamic";

export default async function PatientServicesPage() {
  const cookieStore = await cookies();
  const subject = await patientSubjectForToken(
    cookieStore.get(PATIENT_SESSION_COOKIE)?.value,
  );
  if (!subject) redirect("/patient-sign-in");
  const enabled = await isFeatureEnabledFor("member-explore", {
    clientId: subject.clientId,
  });
  if (!enabled) redirect("/patient");
  const summary = await patientPortalSummary(subject.clientId);
  if (!summary) redirect("/patient-sign-in");
  const experience = await readPatientExperience(subject.clientId, "9999-12-31");
  const track =
    summary.patient.sex === "female"
      ? CARE_TRACKS.female
      : summary.patient.sex === "male"
        ? CARE_TRACKS.male
        : null;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
      <Link href="/patient" className="inline-flex items-center gap-2 text-detail font-medium text-teal-300 hover:text-teal-200">
        <ArrowLeft className="h-4 w-4" /> Back to your record
      </Link>
      <header className="mt-7 border-b border-ink-700/70 pb-7">
        <p className="label-eyebrow">Alpha Health services</p>
        <h1 className="mt-3 font-display text-display text-ink-50">What’s available</h1>
        <p className="mt-3 max-w-2xl text-body leading-relaxed text-ink-400">
          A factual service overview and your current Apex membership. Nothing
          on this page is a recommendation or a promise that a treatment is right for you.
        </p>
      </header>

      <Card className="mt-8">
        <CardContent className="p-6">
          <div className="flex items-center gap-3"><BadgeDollarSign className="h-5 w-5 text-gold-300" /><h2 className="font-display text-title text-ink-50">Your membership</h2></div>
          {experience.membership ? (
            <div className="mt-5 rounded-control border border-ink-700 bg-ink-900/40 p-4">
              <p className="font-medium text-ink-100">{experience.membership.planName}</p>
              <p className="mt-1 text-detail capitalize text-ink-400">{experience.membership.status.replace("_", " ")}</p>
              {experience.membership.nextBillOn && <p className="mt-1 text-detail text-ink-400">Next billing date on record: {experience.membership.nextBillOn}</p>}
            </div>
          ) : (
            <p className="mt-5 text-body text-ink-400">
              No active Apex membership record is available. Your coach can verify your current arrangement.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardContent className="p-6">
          <h2 className="font-display text-title text-ink-50">{track?.label ?? "Clinic services"}</h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {(track?.services ?? [...new Set([...CARE_TRACKS.male.services, ...CARE_TRACKS.female.services])]).map((service) => (
              <li key={service} className="flex items-start gap-3 rounded-control border border-ink-700 bg-ink-900/40 p-4 text-body text-ink-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" /> {service}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Link href="/patient#coach-messages" className="mt-5 flex items-center gap-4 rounded-panel border border-teal-400/30 bg-teal-400/[0.05] p-5 hover:border-teal-400/55">
        <MessageSquare className="h-5 w-5 text-teal-300" />
        <div><p className="font-medium text-ink-100">Ask your coach</p><p className="mt-1 text-detail text-ink-400">Your coach is the front door for availability, pricing, and clinical routing.</p></div>
      </Link>
    </main>
  );
}
