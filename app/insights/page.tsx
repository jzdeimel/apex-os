import { redirect } from "next/navigation";
import { Activity, FlaskConical, Users } from "lucide-react";
import { actorFromPrincipal } from "@/lib/auth/actor";
import { currentPrincipal } from "@/lib/auth/principal";
import { readPopulationInsights } from "@/lib/db/operationalInsightsRepo";
import { Card, CardContent } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const principal = await currentPrincipal();
  const actor = principal ? actorFromPrincipal(principal) : null;
  if (!actor || !["coach", "provider", "nursing"].includes(actor.accessProfile)) {
    redirect("/");
  }
  const data = await readPopulationInsights({
    actorId: actor.id,
    accessProfile: actor.accessProfile,
    locationIds: actor.locationIds,
  });

  return (
    <div className="space-y-8">
      <header>
        <p className="label-eyebrow">Authorized care cohort</p>
        <h1 className="mt-1 font-display text-title font-semibold text-ink-50">Population insights</h1>
        <p className="mt-2 max-w-3xl text-body text-ink-400">
          Calculated from the newest non-preliminary Apex observation for each patient and marker.
          Repeat testing does not cause one patient to count multiple times.
        </p>
      </header>
      <section className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-5"><Users className="h-5 w-5 text-teal-300" /><p className="mt-3 stat-mono text-title text-ink-50">{data.patients}</p><p className="text-detail text-ink-400">patients in scope</p></CardContent></Card>
        <Card><CardContent className="p-5"><FlaskConical className="h-5 w-5 text-gold-300" /><p className="mt-3 stat-mono text-title text-ink-50">{data.withLabs}</p><p className="text-detail text-ink-400">with structured labs</p></CardContent></Card>
        <Card><CardContent className="p-5"><Activity className="h-5 w-5 text-purple-300" /><p className="mt-3 stat-mono text-title text-ink-50">{data.markers.length}</p><p className="text-detail text-ink-400">markers summarized</p></CardContent></Card>
      </section>
      <Card>
        <CardContent className="p-0">
          <div className="border-b border-ink-800 p-5"><h2 className="font-display text-title text-ink-50">Highest abnormal prevalence</h2><p className="mt-1 text-detail text-ink-400">Descriptive cohort data only; no treatment recommendation is generated.</p></div>
          {data.markers.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-detail">
                <thead className="text-micro uppercase text-ink-500"><tr><th className="px-5 py-3">Marker</th><th className="px-5 py-3">Patients measured</th><th className="px-5 py-3">Flagged</th><th className="px-5 py-3">Critical</th><th className="px-5 py-3">Rate</th></tr></thead>
                <tbody>{data.markers.map((row) => <tr key={row.name} className="border-t border-ink-800"><td className="px-5 py-3 font-medium text-ink-100">{row.name}</td><td className="px-5 py-3 text-ink-300">{row.total}</td><td className="px-5 py-3 text-ink-300">{row.abnormal}</td><td className="px-5 py-3 text-ink-300">{row.critical}</td><td className="px-5 py-3 stat-mono text-gold-300">{Math.round(row.abnormalRate * 100)}%</td></tr>)}</tbody>
              </table>
            </div>
          ) : <p className="p-6 text-body text-ink-400">No structured non-preliminary lab observations are available in this scope.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
