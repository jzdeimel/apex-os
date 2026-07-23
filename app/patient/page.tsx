import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Beaker, CalendarDays, FileCheck2, ShieldCheck, Stethoscope } from "lucide-react";
import { Card, CardContent } from "@/components/ui/primitives";
import { PatientSignOut } from "@/components/patient/PatientSignOut";
import { PatientCoachMessages } from "@/components/patient/PatientCoachMessages";
import { patientPortalSummary, patientSubjectForToken } from "@/lib/auth/patientRepo";
import { PATIENT_SESSION_COOKIE } from "@/lib/auth/patientTokens";

export const dynamic = "force-dynamic";

function formatDateTime(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
    timeZoneName: "short",
  }).format(value);
}

export default async function PatientPilotPage() {
  const cookieStore = await cookies();
  const subject = await patientSubjectForToken(cookieStore.get(PATIENT_SESSION_COOKIE)?.value);
  if (!subject) redirect("/patient-sign-in");
  const summary = await patientPortalSummary(subject.clientId);
  if (!summary) redirect("/patient-sign-in");

  const displayName = summary.patient.preferredName || summary.patient.firstName;
  const coach = summary.careTeam.find((member) => member.relationship === "coach");
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="flex flex-col gap-5 border-b border-ink-700/70 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-detail text-teal-300">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Secure patient pilot
          </div>
          <h1 className="mt-3 font-display text-display text-ink-50">Welcome, {displayName}.</h1>
          <p className="mt-3 max-w-2xl text-body leading-relaxed text-ink-400">
            This view comes only from your authenticated Apex patient record. It does not use the demonstration data shown in staff previews.
          </p>
        </div>
        <PatientSignOut />
      </header>

      <section className="mt-8 grid gap-5 lg:grid-cols-2" aria-label="Patient record summary">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-gold-300" aria-hidden />
              <h2 className="font-display text-title text-ink-50">Upcoming visits</h2>
            </div>
            {summary.appointments.length ? (
              <ol className="mt-5 space-y-4">
                {summary.appointments.map((visit) => (
                  <li key={visit.id} className="rounded-control border border-ink-700 bg-ink-900/40 p-4">
                    <p className="font-medium text-ink-100">{visit.visitType}</p>
                    <p className="mt-1 text-detail text-ink-300">
                      {formatDateTime(visit.startAt, summary.patient.timezone)} · {visit.modality}
                    </p>
                    <p className="mt-1 text-detail text-ink-400">
                      {[visit.staffName, visit.locationName].filter(Boolean).join(" · ") || "Assignment pending"}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-5 text-body text-ink-400">No upcoming visit is currently scheduled.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Stethoscope className="h-5 w-5 text-teal-300" aria-hidden />
              <h2 className="font-display text-title text-ink-50">Your care team</h2>
            </div>
            {summary.careTeam.length ? (
              <ul className="mt-5 space-y-4">
                {summary.careTeam.map((member) => (
                  <li key={`${member.relationship}-${member.id}`} className="rounded-control border border-ink-700 bg-ink-900/40 p-4">
                    <p className="font-medium text-ink-100">{member.name}</p>
                    <p className="mt-1 text-detail capitalize text-ink-400">
                      {member.relationship}{member.title ? ` · ${member.title}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 text-body text-ink-400">Care-team assignments are still being confirmed.</p>
            )}
            {summary.patient.homeLocation && (
              <p className="mt-5 text-detail text-ink-400">Home clinic: {summary.patient.homeLocation}</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <PatientCoachMessages
              coachName={coach?.name ?? null}
              timezone={summary.patient.timezone}
              initialMessages={summary.messages
                .filter((entry) => entry.thread === "coach")
                .reverse()
                .map((entry) => ({
                  id: entry.id,
                  senderKind: entry.senderKind,
                  body: entry.body,
                  sentAt: entry.sentAt.toISOString(),
                  readAt: entry.readAt?.toISOString() ?? null,
                  escalationId: entry.escalationId,
                }))}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Beaker className="h-5 w-5 text-gold-300" aria-hidden />
              <h2 className="font-display text-title text-ink-50">Reviewed lab results</h2>
            </div>
            {summary.labs.length ? (
              <div className="mt-5 space-y-4">
                {summary.labs.map((lab) => (
                  <article key={lab.id} className="rounded-control border border-ink-700 bg-ink-900/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-ink-100">Resulted {formatDateTime(lab.resultedAt, summary.patient.timezone)}</p>
                      <span className={`rounded-full px-2 py-1 text-micro ${lab.critical ? "bg-high/10 text-high" : lab.abnormal ? "bg-watch/10 text-watch" : "bg-optimal/10 text-optimal"}`}>{lab.critical ? "Critical · follow-up documented" : lab.abnormal ? "Outside reference" : "Within reference"}</span>
                    </div>
                    <p className="mt-3 text-detail leading-relaxed text-ink-300">{lab.summary}</p>
                    <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-detail"><thead className="text-micro uppercase text-ink-500"><tr><th className="pb-2">Marker</th><th className="pb-2">Value</th><th className="pb-2">Reference</th><th className="pb-2">Flag</th></tr></thead><tbody>{lab.observations.map((row) => <tr key={row.id} className="border-t border-ink-800"><td className="py-2 text-ink-200">{row.name}</td><td className="py-2 text-ink-100">{row.valueNumeric ?? row.valueText} {row.unit ?? ""}</td><td className="py-2 text-ink-400">{row.referenceRange ?? "—"}</td><td className="py-2 text-ink-400">{row.flag}</td></tr>)}</tbody></table></div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-5 text-body text-ink-400">No provider-reviewed lab result has been released to you yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <FileCheck2 className="h-5 w-5 text-purple-300" aria-hidden />
              <h2 className="font-display text-title text-ink-50">Signed documents</h2>
            </div>
            {summary.signedDocuments.length ? (
              <ol className="mt-5 space-y-3">
                {summary.signedDocuments.map((document) => (
                  <li key={document.id} className="flex items-center justify-between gap-4 rounded-control border border-ink-700 bg-ink-900/40 p-4">
                    <div>
                      <p className="font-medium text-ink-100">{document.title}</p>
                      <p className="mt-1 text-detail text-ink-500">Version {document.version}</p>
                    </div>
                    <FileCheck2 className="h-5 w-5 shrink-0 text-teal-300" aria-label="Signed" />
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-5 text-body text-ink-400">No signed document is available in Apex yet.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <aside className="mt-8 rounded-panel border border-gold-400/30 bg-gold-400/5 p-5 text-detail leading-relaxed text-ink-300">
        This patient pilot now supports authoritative messaging to your assigned coach. Appointments, documents, and the rest of the chart remain read-only while those workflows complete validation.
      </aside>
    </main>
  );
}
