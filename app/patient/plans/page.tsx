import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Dumbbell, Salad } from "lucide-react";
import { Card, CardContent } from "@/components/ui/primitives";
import { patientSubjectForToken } from "@/lib/auth/patientRepo";
import { PATIENT_SESSION_COOKIE } from "@/lib/auth/patientTokens";
import { readPatientPlans } from "@/lib/db/repo";
import { isFeatureEnabledFor } from "@/lib/features/server";

export const dynamic = "force-dynamic";

export default async function PatientPlansPage() {
  const cookieStore = await cookies();
  const subject = await patientSubjectForToken(cookieStore.get(PATIENT_SESSION_COOKIE)?.value);
  if (!subject) redirect("/patient-sign-in");
  const enabled = await isFeatureEnabledFor("member-nutrition", { clientId: subject.clientId });
  if (!enabled) redirect("/patient");
  const plans = await readPatientPlans(subject.clientId);

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
      <Link href="/patient" className="inline-flex items-center gap-2 text-detail font-medium text-teal-300 hover:text-teal-200"><ArrowLeft className="h-4 w-4" /> Back to your record</Link>
      <header className="mt-7 border-b border-ink-700/70 pb-7">
        <p className="label-eyebrow">Published by your care team</p>
        <h1 className="mt-3 font-display text-display text-ink-50">Food and training plans</h1>
        <p className="mt-3 max-w-2xl text-body leading-relaxed text-ink-400">Only the current published versions appear here. Contact your coach before changing activity when symptoms or medical restrictions are involved.</p>
      </header>
      <section className="mt-8 space-y-5">
        {plans.length ? plans.map((plan) => {
          const content = Array.isArray(plan.content) ? plan.content as Array<{ heading?: unknown; body?: unknown }> : [];
          return (
            <Card key={plan.id}>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">{plan.category === "nutrition" ? <Salad className="h-5 w-5 text-teal-300" /> : <Dumbbell className="h-5 w-5 text-gold-300" />}<h2 className="font-display text-title text-ink-50">{plan.title}</h2><span className="ml-auto text-micro text-ink-500">Version {plan.version}</span></div>
                {plan.summary && <p className="mt-3 text-body text-ink-300">{plan.summary}</p>}
                <div className="mt-5 space-y-4">{content.map((section, index) => <div key={index} className="rounded-control border border-ink-700 bg-ink-900/40 p-4"><h3 className="font-medium text-ink-100">{String(section.heading ?? "Guidance")}</h3><p className="mt-2 whitespace-pre-wrap text-body leading-relaxed text-ink-300">{String(section.body ?? "")}</p></div>)}</div>
                {plan.effectiveOn && <p className="mt-4 text-micro text-ink-500">Effective {plan.effectiveOn}</p>}
              </CardContent>
            </Card>
          );
        }) : <Card><CardContent className="p-6 text-body text-ink-400">Your care team has not published a food or training plan in Apex yet.</CardContent></Card>}
      </section>
    </main>
  );
}
