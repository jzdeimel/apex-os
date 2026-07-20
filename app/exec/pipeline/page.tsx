import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NotComputableCard, ProvenanceChip } from "@/components/exec/Figure";
import {
  stageCensus,
  topOfFunnel,
  consultShowRate,
  pipelineGaps,
} from "@/lib/exec/leads";
import { formatDate } from "@/lib/utils";

/**
 * OWNER CONSOLE · Lead pipeline.
 *
 * The brief for this page was "be honest that it barely exists", and the page is
 * mostly that honesty. See `lib/exec/leads.ts` for the full finding; the short
 * version is that the entire lead model is one enum value on a patient record,
 * `addLead` has zero call sites, `app/book/page.tsx` collects a real capture
 * form and discards it, and consequently **Apex cannot answer "how many leads
 * did we get last month"** — not approximately, not with a caveat. A Lead has no
 * creation timestamp, so there is no field to filter a month against.
 *
 * ---------------------------------------------------------------------------
 * THE DESIGN PROBLEM: A FUNNEL IS THE WRONG COMPONENT
 * ---------------------------------------------------------------------------
 * The obvious build here is a funnel chart, and `lib/analytics.ts:123-143`
 * already produces one by counting clients at-or-past each status. It renders
 * convincingly and it is not a funnel. A funnel is a cohort — of the people who
 * entered in March, what share reached each stage. That is a census — of the
 * people here today, where each one is standing.
 *
 * The tell is that a census cannot go down. A member who converted in March and
 * cancelled in May still counts as converted, because status only records where
 * they are now. A conversion metric that can only rise is not a metric, and
 * drawing it in the tapering-funnel shape borrows the credibility of a
 * measurement the data cannot support.
 *
 * So the census renders as a plain horizontal census — flat bars, counts, and
 * NO rate between stages. The one genuine ratio available, consult show rate,
 * is computed separately from dated booking records and is carefully not called
 * a conversion rate.
 */
export default function ExecPipelinePage() {
  const census = stageCensus();
  const top = topOfFunnel();
  const show = consultShowRate();
  const gaps = pipelineGaps();

  const max = Math.max(...census.map((s) => s.count), 1);

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <Link
            href="/exec"
            className="focus-ring inline-flex items-center gap-1 rounded text-micro text-ink-500 transition-colors hover:text-ink-300"
          >
            <ArrowLeft className="h-3 w-3" />
            Morning
          </Link>
          <p className="label-eyebrow mt-1">OWNER CONSOLE</p>
          <h1 className="mt-0.5 font-display text-title font-semibold tracking-tight text-ink-50">
            Lead pipeline
          </h1>
        </div>
      </header>

      {/* The headline finding, stated before anything is rendered. */}
      <section className="mt-4">
        <div className="card border-watch/40 bg-watch/5 p-3.5">
          <p className="font-display text-heading font-semibold text-ink-50">
            Apex cannot tell you how many leads you got last month.
          </p>
          <p className="mt-1.5 max-w-4xl text-detail leading-snug text-ink-300">
            Not approximately. The entire lead model is one value —{" "}
            <span className="stat-mono text-ink-200">&ldquo;Lead&rdquo;</span> — in the status enum
            on a patient record. There is no lead entity, no source, no UTM, no campaign, no
            referrer, no stage history, no owner and no SLA. A Lead carries no creation date
            distinct from <span className="stat-mono text-ink-200">joinedOn</span>, so there is no
            field a month could be filtered against.{" "}
            <span className="stat-mono text-ink-200">addLead</span> in lib/store.tsx is the only
            lead-creation path in the product and it has zero call sites; app/book/page.tsx:104-113
            validates a real capture form and then discards it.
          </p>
          <p className="mt-2 max-w-4xl text-detail leading-snug text-ink-400">
            Everything below is what can honestly be shown instead: a census of where the book is
            standing today, and the one slice of acquisition that carries real timestamps.
          </p>
        </div>
      </section>

      {/* ---- Dated top-of-funnel ------------------------------------------ */}
      <section className="mt-5">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-heading font-semibold text-ink-50">
            What is genuinely dated
          </h2>
          <p className="text-micro text-ink-500">
            {formatDate(top.from)} → {formatDate(top.to)} · {top.windowDays} days
          </p>
        </div>

        <div className="card p-3.5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
            <Stat label="Consults booked" value={top.consultsBooked} />
            <Stat label="Consults held" value={top.consultsHeld} tone="text-optimal" />
            <Stat label="No-show / late cancel" value={top.consultsLost} tone="text-watch" />
            <Stat label="Intakes documented" value={top.intakesDocumented} />
          </div>

          <div className="mt-3 border-t border-ink-800/60 pt-3">
            {show ? (
              <p className="text-detail leading-snug text-ink-300">
                <span className="stat-mono text-heading font-semibold text-ink-50">
                  {Math.round(show.rate * 100)}%
                </span>{" "}
                consult show rate over {show.n} booked consults.{" "}
                <span className="text-ink-400">
                  This is a real rate with a real denominator, and it is deliberately{" "}
                  <em>not</em> a conversion rate — it says whether people turned up, and nothing
                  about whether they bought anything. Apex records no dated conversion event, so
                  the second question has no answer.
                </span>
              </p>
            ) : (
              <p className="text-detail leading-snug text-ink-400">
                Show rate withheld — fewer than 20 booked consults in the window. A rate on a thin
                denominator is how a slot gets cancelled for no reason, so the floor from
                lib/analytics/attendance.ts is applied here too.
              </p>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <ProvenanceChip provenance="measured" />
            <p className="min-w-0 flex-1 text-micro leading-snug text-ink-500">
              Counted from bookings of type &ldquo;Initial Consult&rdquo; and consults of kind
              &ldquo;Intake&rdquo; whose timestamps fall in the window (lib/analytics/attendance.ts,
              lib/mock/consults.ts). Booking records are synthesised — the arithmetic is real, the
              visits are seeded.
            </p>
          </div>
        </div>
      </section>

      {/* ---- The census, explicitly not a funnel --------------------------- */}
      <section className="mt-5">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-heading font-semibold text-ink-50">
            Where the book is standing today
          </h2>
          <ProvenanceChip provenance="measured" />
        </div>

        <div className="card p-3.5">
          <div className="space-y-2">
            {census.map((s) => (
              <div key={s.stage} className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-detail font-medium text-ink-100">{s.stage}</span>
                  <span className="stat-mono text-detail text-ink-200">{s.count}</span>
                </div>
                {/* Flat bars, uniform colour, no taper. A funnel silhouette would
                    borrow the credibility of a cohort measurement this data
                    cannot support. */}
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink-900">
                  <div
                    className="h-full rounded-full bg-ink-600"
                    style={{ width: `${Math.max(1, (s.count / max) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <p className="mt-3 border-l-2 border-ink-700 pl-2.5 text-detail leading-snug text-ink-400">
            A census, not a funnel, and rendered without a single rate between stages on purpose.
            These are counts of where 500 people are standing right now — not a cohort. Dividing
            one stage by another would produce a number that looks exactly like a conversion rate,
            cannot be interpreted as one, and would be quoted as one within a week. Note also that
            a member who converted and later cancelled still counts at their current stage forever,
            so nothing here can fall the way a real funnel does.
          </p>
        </div>
      </section>

      {/* ---- The gaps ------------------------------------------------------ */}
      <section className="mt-8 border-t border-ink-800/60 pt-6">
        <div className="mb-2">
          <h2 className="font-display text-heading font-semibold text-ink-50">
            What Apex cannot capture yet
          </h2>
          <p className="mt-1 max-w-3xl text-detail leading-snug text-ink-400">
            Four acquisition questions with no record behind them. Each names the table in
            lib/db/schema.ts that would close it — <span className="stat-mono">lead</span> and{" "}
            <span className="stat-mono">lead_stage_event</span> are both already defined, neither
            is populated, and the database is not wired to the UI.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {gaps.map((g) => (
            <NotComputableCard key={g.id} item={g} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "text-ink-50",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="label-eyebrow truncate">{label}</p>
      <p className={`stat-mono mt-1 text-title font-semibold leading-none ${tone}`}>{value}</p>
    </div>
  );
}
