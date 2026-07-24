import Link from "next/link";
import { redirect } from "next/navigation";
import { HeartHandshake, PhoneCall } from "lucide-react";
import { actorFromPrincipal } from "@/lib/auth/actor";
import { currentPrincipal } from "@/lib/auth/principal";
import { readWinbackCandidates } from "@/lib/db/operationalInsightsRepo";
import { Card, CardContent } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default async function CoachWinBackPage() {
  const principal = await currentPrincipal();
  const actor = principal ? actorFromPrincipal(principal) : null;
  if (!actor) redirect("/");
  if (!["coach", "operations", "owner"].includes(actor.accessProfile)) redirect("/");
  const candidates = await readWinbackCandidates({
    actorId: actor.id,
    accessProfile: actor.accessProfile,
    locationIds: actor.locationIds,
  });

  return (
    <div className="space-y-8">
      <header>
        <p className="label-eyebrow">Authoritative retention queue</p>
        <h1 className="mt-1 font-display text-title font-semibold tracking-tight text-ink-50">
          Win-backs
        </h1>
        <p className="mt-2 max-w-3xl text-body text-ink-400">
          Real patients with an inactive chart or terminal membership and no
          future visit. The score is a transparent recency ordering, not an AI prediction.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-5"><p className="label-eyebrow">Lapsed candidates</p><p className="mt-2 stat-mono text-title text-ink-50">{candidates.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="label-eyebrow">Work today</p><p className="mt-2 stat-mono text-title text-gold-300">{Math.min(10, candidates.length)}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="label-eyebrow">Historical value</p><p className="mt-2 stat-mono text-title text-ink-50">{money(candidates.reduce((sum, row) => sum + row.lifetimeValueCents, 0))}</p></CardContent></Card>
      </div>

      {candidates.length ? (
        <div className="space-y-3">
          {candidates.slice(0, 50).map((row) => (
            <Card key={row.id}>
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/clients/${row.id}`} className="font-medium text-ink-100 hover:text-gold-300">
                      {row.preferredName || row.firstName} {row.lastName}
                    </Link>
                    <span className="rounded-full bg-ink-800 px-2 py-1 text-micro text-ink-300">{row.trigger}</span>
                  </div>
                  <p className="mt-2 text-detail text-ink-400">
                    Last recorded activity {row.daysSinceActivity} days ago · {money(row.lifetimeValueCents)} historical net sales
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right"><p className="stat-mono text-title text-gold-300">{row.winnability}</p><p className="text-micro text-ink-500">recency score</p></div>
                  <Link href={`/clients/${row.id}`} className="inline-flex items-center gap-2 rounded-control border border-ink-700 px-3 py-2 text-detail text-ink-200 hover:border-gold-400/50">
                    <PhoneCall className="h-4 w-4" /> Open chart
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card><CardContent className="p-8 text-center"><HeartHandshake className="mx-auto h-7 w-7 text-teal-300" /><h2 className="mt-3 font-display text-title text-ink-50">No lapsed patients in this scope</h2><p className="mt-2 text-body text-ink-400">Active patients are never placed here merely because a message is old.</p></CardContent></Card>
      )}
    </div>
  );
}
