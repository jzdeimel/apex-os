import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Gift, Link2 } from "lucide-react";
import { PatientReferralLink } from "@/components/patient/PatientReferralLink";
import { Card, CardContent } from "@/components/ui/primitives";
import { patientSubjectForToken } from "@/lib/auth/patientRepo";
import { PATIENT_SESSION_COOKIE } from "@/lib/auth/patientTokens";
import { readPatientReferrals } from "@/lib/db/repo";
import { isFeatureEnabledFor } from "@/lib/features/server";

export const dynamic = "force-dynamic";

export default async function PatientReferPage() {
  const cookieStore = await cookies();
  const subject = await patientSubjectForToken(cookieStore.get(PATIENT_SESSION_COOKIE)?.value);
  if (!subject) redirect("/patient-sign-in");
  const enabled = await isFeatureEnabledFor("member-referrals", { clientId: subject.clientId });
  if (!enabled) redirect("/patient");
  const referrals = await readPatientReferrals(subject.clientId);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
      <Link href="/patient" className="inline-flex items-center gap-2 text-detail font-medium text-teal-300 hover:text-teal-200"><ArrowLeft className="h-4 w-4" /> Back to your record</Link>
      <header className="mt-7 border-b border-ink-700/70 pb-7">
        <p className="label-eyebrow">Tracked referral</p>
        <h1 className="mt-3 font-display text-display text-ink-50">Refer a friend</h1>
        <p className="mt-3 max-w-2xl text-body leading-relaxed text-ink-400">Create a private link to Alpha Health’s real intake flow. Apex records attribution, qualification, and any reward as explicit audited states.</p>
      </header>
      <Card className="mt-8"><CardContent className="p-6"><div className="flex items-center gap-3"><Link2 className="h-5 w-5 text-teal-300" /><h2 className="font-display text-title text-ink-50">Share link</h2></div><div className="mt-5"><PatientReferralLink /></div></CardContent></Card>
      <Card className="mt-5"><CardContent className="p-6"><div className="flex items-center gap-3"><Gift className="h-5 w-5 text-gold-300" /><h2 className="font-display text-title text-ink-50">Referral history</h2></div><ul className="mt-5 space-y-3">{referrals.length ? referrals.map((row) => <li key={row.id} className="rounded-control border border-ink-700 bg-ink-900/40 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="capitalize text-ink-100">{row.status}</span><span className="text-micro text-ink-500">Issued {row.issuedAt.toLocaleDateString()}</span></div>{row.rewardDescription && <p className="mt-2 text-detail text-gold-200">{row.rewardDescription}</p>}</li>) : <li className="text-body text-ink-400">No referral links have been issued.</li>}</ul></CardContent></Card>
    </main>
  );
}
