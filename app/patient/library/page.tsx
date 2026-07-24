import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, ShieldCheck, Stethoscope } from "lucide-react";
import { PeptideGallery } from "@/components/peptides/PeptideGallery";
import { Card, CardContent } from "@/components/ui/primitives";
import { patientSubjectForToken } from "@/lib/auth/patientRepo";
import { PATIENT_SESSION_COOKIE } from "@/lib/auth/patientTokens";
import { isFeatureEnabledFor } from "@/lib/features/server";
import {
  LIBRARY_DISCLAIMER,
  PROVIDER_LINE,
  peptideLibrary,
} from "@/lib/peptides/library";

export const dynamic = "force-dynamic";

export default async function PatientLibraryPage() {
  const cookieStore = await cookies();
  const subject = await patientSubjectForToken(
    cookieStore.get(PATIENT_SESSION_COOKIE)?.value,
  );
  if (!subject) redirect("/patient-sign-in");
  const enabled = await isFeatureEnabledFor("member-education", {
    clientId: subject.clientId,
  });
  if (!enabled) redirect("/patient");

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
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
          General reference, not a prescription
        </div>
        <h1 className="mt-3 flex items-center gap-3 font-display text-display text-ink-50">
          <BookOpen className="h-7 w-7 text-gold-300" aria-hidden />
          Compound library
        </h1>
        <p className="mt-3 max-w-3xl text-body leading-relaxed text-ink-400">
          Plain-language explanations with visible evidence limits. This page
          does not infer what is on your plan and contains no dosing instructions.
        </p>
      </header>

      <Card className="mt-8 border-gold-400/30">
        <CardContent className="flex gap-4 p-5">
          <Stethoscope className="mt-1 h-5 w-5 shrink-0 text-gold-300" aria-hidden />
          <div className="space-y-2">
            <p className="text-body leading-relaxed text-ink-200">{PROVIDER_LINE}</p>
            <p className="text-detail leading-relaxed text-ink-400">
              {LIBRARY_DISCLAIMER}
            </p>
          </div>
        </CardContent>
      </Card>

      <section className="mt-8">
        <PeptideGallery entries={[...peptideLibrary]} planChips={{}} />
      </section>
    </main>
  );
}
