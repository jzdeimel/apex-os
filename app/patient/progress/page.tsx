import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Circle, Flame, Gauge, Trophy } from "lucide-react";
import { PatientCheckIn } from "@/components/patient/PatientCheckIn";
import { Card, CardContent } from "@/components/ui/primitives";
import { patientPortalSummary, patientSubjectForToken } from "@/lib/auth/patientRepo";
import { PATIENT_SESSION_COOKIE } from "@/lib/auth/patientTokens";
import { readPatientExperience } from "@/lib/db/patientExperienceRepo";
import { isFeatureEnabledFor } from "@/lib/features/server";
import { patientProgress } from "@/lib/patient/progress";

export const dynamic = "force-dynamic";

function dateInZone(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).format(date);
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export default async function PatientProgressPage() {
  const cookieStore = await cookies();
  const subject = await patientSubjectForToken(
    cookieStore.get(PATIENT_SESSION_COOKIE)?.value,
  );
  if (!subject) redirect("/patient-sign-in");
  const summary = await patientPortalSummary(subject.clientId);
  if (!summary) redirect("/patient-sign-in");
  const featureEnabled = await isFeatureEnabledFor("gamification", {
    clientId: subject.clientId,
  });
  if (!featureEnabled) redirect("/patient");

  const today = dateInZone(new Date(), summary.patient.timezone);
  const experience = await readPatientExperience(
    subject.clientId,
    shiftDate(today, -120),
  );
  if (!experience.preferences.gamificationEnabled) redirect("/patient");
  const progress = patientProgress(today, experience.days, experience.doses);

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
      <Link
        href="/patient"
        className="inline-flex items-center gap-2 text-detail font-medium text-teal-300 hover:text-teal-200"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to your record
      </Link>
      <header className="mt-7 border-b border-ink-700/70 pb-7">
        <p className="label-eyebrow">Your recorded activity</p>
        <h1 className="mt-3 font-display text-display text-ink-50">Progress</h1>
        <p className="mt-3 max-w-2xl text-body leading-relaxed text-ink-400">
          These numbers come from check-ins and dose logs saved to your Apex
          record. They are engagement summaries, not clinical outcomes.
        </p>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-5"><Flame className="h-5 w-5 text-gold-300" /><p className="mt-3 stat-mono text-display text-ink-50">{progress.streak}</p><p className="text-detail text-ink-400">day current streak</p></CardContent></Card>
        <Card><CardContent className="p-5"><Gauge className="h-5 w-5 text-teal-300" /><p className="mt-3 stat-mono text-display text-ink-50">{progress.activeThisWeek}/7</p><p className="text-detail text-ink-400">active days this week</p></CardContent></Card>
        <Card><CardContent className="p-5"><Trophy className="h-5 w-5 text-purple-300" /><p className="mt-3 stat-mono text-display text-ink-50">Level {progress.level}</p><p className="text-detail text-ink-400">{progress.totalActiveDays} recorded days</p></CardContent></Card>
      </section>

      <Card className="mt-5">
        <CardContent className="p-6">
          <h2 className="font-display text-title text-ink-50">Today’s check-in</h2>
          <p className="mt-2 text-detail text-ink-400">
            Saving again today corrects today’s check-in; it does not create a duplicate.
          </p>
          <div className="mt-5"><PatientCheckIn date={today} /></div>
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardContent className="p-6">
          <h2 className="font-display text-title text-ink-50">Current quests</h2>
          <ul className="mt-5 space-y-3">
            {progress.quests.map((quest) => (
              <li key={quest.id} className="flex items-center gap-3 rounded-control border border-ink-700 bg-ink-900/40 p-4">
                {quest.complete ? <CheckCircle2 className="h-5 w-5 text-optimal" /> : <Circle className="h-5 w-5 text-ink-500" />}
                <span className="flex-1 text-body text-ink-200">{quest.label}</span>
                <span className="stat-mono text-detail text-ink-400">{quest.progress}/{quest.goal}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
