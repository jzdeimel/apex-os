import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, UserX } from "lucide-react";

import { currentPrincipal } from "@/lib/auth/principal";
import { actorFromPrincipal } from "@/lib/auth/actor";
import { can } from "@/lib/authz/capabilities";
import { allCoverage } from "@/lib/scheduling/coverage";
import { CREDENTIAL_LABEL } from "@/lib/scheduling/credentials";
import { Badge } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

/**
 * New Client Visit coverage, per clinic.
 *
 * A server component because the answer is about the ROSTER, not about the
 * viewer, and because the staffing shape of the business is not something to
 * ship to a browser for anyone who opens devtools.
 *
 * What it exists to prevent: a New Client Visit booked at a location that
 * cannot perform one of its three required parts. Stephanie Butler's spec makes
 * the coach introduction non-substitutable, and two of the four clinics run a
 * single coach — so this is not a theoretical failure, it is a Tuesday.
 */
export default async function CoveragePage() {
  const principal = await currentPrincipal();
  const actor = principal ? actorFromPrincipal(principal) : null;
  /**
   * `read:chart` — which every staff role holds — rather than
   * `read:all-clients`, which is Admin-only and 404'd this page for the
   * providers and coaches who most need it.
   *
   * The gate is deliberately wide because the content is deliberately narrow:
   * staff credentials by location and nothing else. No patient appears on this
   * page. The people who need to know a visit cannot be staffed are the people
   * who book them — the desk, the coaches — not just the owner.
   */
  if (!actor || !can(actor, "read:chart").allowed) notFound();

  const coverage = allCoverage();
  const blocked = coverage.filter((c) => !c.canRunNcv);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-50">
          New client visit coverage
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-300">
          Every new client visit needs three things: a coach introduction, a lab
          draw, and a provider physical. The coach introduction has no
          substitution. This is who can do what, by clinic.
        </p>

        {blocked.length > 0 ? (
          <div className="mt-4 rounded-lg border border-high/30 bg-high/10 p-4">
            <p className="flex items-center gap-2 font-medium text-high">
              <AlertTriangle className="h-4 w-4" />
              {blocked.length === 1
                ? `${blocked[0].name} cannot run a new client visit.`
                : `${blocked.length} clinics cannot run a new client visit.`}
            </p>
            <p className="mt-1 text-sm text-ink-300">
              Booking one there will fail at the missing part. Fix the staffing
              or stop offering the appointment at that location.
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-optimal/30 bg-optimal/10 p-4">
            <p className="flex items-center gap-2 font-medium text-optimal">
              <CheckCircle2 className="h-4 w-4" />
              Every clinic can staff all three parts.
            </p>
          </div>
        )}
      </header>

      <div className="space-y-4">
        {coverage.map((c) => (
          <section
            key={c.locationId}
            className="rounded-lg border border-ink-700/60 bg-ink-900/30 p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-xl font-medium text-ink-100">{c.name}</h2>
              {c.canRunNcv ? (
                <Badge tone="optimal">can run an NCV</Badge>
              ) : (
                <Badge tone="high">cannot run an NCV</Badge>
              )}
            </div>

            {c.gaps.length > 0 && (
              <ul className="mt-4 space-y-2">
                {c.gaps.map((g) => (
                  <li
                    key={g.component}
                    className="rounded-md border border-high/30 bg-high/5 p-3 text-sm"
                  >
                    <span className="font-medium text-high">No {g.label.toLowerCase()}.</span>{" "}
                    <span className="text-ink-300">
                      Needs one of: {g.wouldNeed.join(", ")}.
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* A single qualified person is not a gap today and is the thing
                that becomes one. Naming them is the point — "Raleigh cannot see
                new patients when Zac is out" is a sentence the owner can act
                on; "coverage: OK" is not. */}
            {c.singlePoints.length > 0 && (
              <ul className="mt-4 space-y-2">
                {c.singlePoints.map((s) => (
                  <li
                    key={s.component}
                    className="flex items-start gap-2 rounded-md border border-watch/30 bg-watch/5 p-3 text-sm"
                  >
                    <UserX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-watch" />
                    <span className="text-ink-300">
                      <span className="font-medium text-watch">{s.only}</span> is the
                      only person here who can do the {s.label.toLowerCase()}. No new
                      client visits on days they are out.
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-4 font-mono text-[11px] text-ink-500">
              {c.credentials.length > 0
                ? c.credentials.map((cr) => CREDENTIAL_LABEL[cr]).join(" · ")
                : "No credentialed staff on file for this location."}
            </p>
          </section>
        ))}
      </div>

      <p className="mt-8 max-w-2xl text-xs leading-relaxed text-ink-500">
        This is about licences, not calendars — it asks whether anyone here
        <em> can</em> do the work, not whether they are free at 2pm. Telehealth
        is not listed because nobody is rostered there: it is a patient panel
        served by clinic staff, and the telehealth new-client flow has not been
        specified.
      </p>
    </div>
  );
}
