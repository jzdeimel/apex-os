"use client";

import { useMemo, useState } from "react";
import { Users, Info, ShieldCheck } from "lucide-react";
import { getClient } from "@/lib/mock/clients";
import {
  cohortFor,
  trajectory,
  memberSeries,
  whereYouAre,
  memberWeekDate,
  weeksIn,
  metricLabel,
  COHORT_METRICS,
  K_MIN,
  type CohortMetric,
} from "@/lib/cohort/trajectory";
import { TrendArea } from "@/components/charts";
import { Card, CardContent, Badge, EmptyState } from "@/components/ui/primitives";
import { FadeIn } from "@/components/portal/still";

/**
 * "Members like you, six months in."
 *
 * The most dangerous card in the member portal, so the copy is as load-bearing
 * as the code.
 *
 * Three things this component will not do:
 *
 *  - It will not render a cohort under K_MIN. The engine refuses to return one;
 *    this component renders an honest empty state instead of degrading to a
 *    smaller comparison. "Not enough people match yet" is a real answer.
 *
 *  - It will not state an outcome. Everything here is a range with a median.
 *    There is no sentence anywhere in this file beginning "you will", and the
 *    disclaimer that the band is not a prediction is not a footnote — it sits
 *    directly under the chart where the eye lands after reading it.
 *
 *  - It will not render another member. No names, no monograms, no counts of
 *    "3 members near you", no testimonial. The engine's types make this
 *    structurally impossible; the rule is restated here because the next person
 *    to edit this file will be tempted.
 *
 * The matching criteria are shown openly rather than summarised. A comparison a
 * member cannot inspect is a comparison they have to take on faith, and this is
 * the wrong product to ask for faith in.
 */

const BAND_EDGE = "#5b6472";
const BAND_MID = "#98a2b0";
const YOU = "var(--chart-brand)";

export function PeopleLikeYou({
  clientId,
  defaultMetric = "bodyFat",
}: {
  clientId: string;
  defaultMetric?: CohortMetric;
}) {
  const client = getClient(clientId);
  const cohort = useMemo(() => (client ? cohortFor(client) : null), [client]);

  /**
   * Body-composition metrics only exist for members with an InBody on file, so
   * a cohort can clear the floor on head-count and still not clear it on scans.
   * Opening on a withheld metric would make a working card look broken, so the
   * initial tab is the caller's preference only if it actually has a band.
   * Every metric stays clickable — the withheld state explains itself, and
   * hiding it would conceal that data is being suppressed at all.
   */
  const available = useMemo(
    () =>
      cohort?.ok
        ? COHORT_METRICS.filter((m) => trajectory(cohort.key, m).ok)
        : [],
    [cohort],
  );
  const [metric, setMetric] = useState<CohortMetric>(defaultMetric);
  const activeMetric =
    available.includes(metric) || available.length === 0 ? metric : available[0];

  const traj = useMemo(
    () => (cohort?.ok ? trajectory(cohort.key, activeMetric) : null),
    [cohort, activeMetric],
  );
  const mine = useMemo(
    () => (client && cohort?.ok ? memberSeries(client, cohort.key, activeMetric) : null),
    [client, cohort, activeMetric],
  );
  const spot = useMemo(
    () => (client && cohort?.ok ? whereYouAre(client, cohort.key, activeMetric) : null),
    [client, cohort, activeMetric],
  );

  // Merge band + own line onto one date axis (the member's own calendar).
  const chartData = useMemo(() => {
    if (!client || !traj?.ok) return [];
    const own = mine?.ok
      ? new Map(mine.points.map((p) => [p.week, p.value]))
      : new Map<number, number>();
    return traj.points.map((p) => ({
      date: memberWeekDate(client, p.week),
      p75: p.p75,
      p50: p.p50,
      p25: p.p25,
      ...(own.has(p.week) ? { you: own.get(p.week) as number } : {}),
    }));
  }, [client, traj, mine]);

  if (!client) return null;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="label-eyebrow">Context</p>
            <h3 className="mt-1 font-display text-heading font-semibold text-ink-50">
              Members like you, six months in
            </h3>
          </div>
          <Badge tone="neutral" className="shrink-0">
            <ShieldCheck className="h-3 w-3" /> Aggregate only
          </Badge>
        </div>

        {/* ── Below the floor, or nothing to compare on ───────────────── */}
        {!cohort?.ok ? (
          <CohortWithheld
            reason={cohort?.reason ?? "no-baseline"}
            attempted={cohort?.attempted ?? []}
          />
        ) : (
          <>
            <p className="mt-3 max-w-prose text-detail leading-relaxed text-ink-300">
              {leadCopy(cohort.matched)} The shaded band is where most of them
              were at each point. It is not a prediction.
            </p>

            {/* ── Who you are being compared to ───────────────────────── */}
            <div className="mt-4 rounded-panel border border-ink-800 bg-ink-900/40 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Users className="h-3.5 w-3.5 shrink-0 text-ink-500" />
                <span className="text-micro uppercase tracking-wide text-ink-500">
                  Matched on
                </span>
                <span className="ml-auto text-micro text-ink-500">
                  <span className="stat-mono text-ink-200">{cohort.size}</span> members
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {cohort.criteria.map((c) => (
                  <Badge key={c} tone="neutral">
                    {c}
                  </Badge>
                ))}
              </div>
              <p className="mt-2.5 text-micro leading-relaxed text-ink-600">
                Matched on where people started, never on how they finished — so
                members who plateaued or stopped are still in the band.
              </p>
            </div>

            {/* ── Metric switch ───────────────────────────────────────── */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {COHORT_METRICS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  aria-pressed={m === activeMetric}
                  className={`rounded-control border px-2.5 py-1 text-micro transition-colors focus-ring ${
                    m === activeMetric
                      ? "border-gold-400/40 bg-gold-400/12 text-gold-200"
                      : "border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-200"
                  }`}
                >
                  {metricLabel(m)}
                </button>
              ))}
            </div>

            {/* ── The band + your line ────────────────────────────────── */}
            {!traj?.ok ? (
              <MetricWithheld reason={traj?.reason ?? "no-data-for-metric"} />
            ) : (
              <FadeIn key={activeMetric}>
                <div className="mt-4">
                  <TrendArea
                    data={chartData}
                    height={240}
                    series={[
                      { key: "p75", label: "75th percentile", color: BAND_EDGE },
                      { key: "p50", label: "Median", color: BAND_MID },
                      { key: "p25", label: "25th percentile", color: BAND_EDGE },
                      ...(mine?.ok ? [{ key: "you", label: "You", color: YOU }] : []),
                    ]}
                  />

                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-micro text-ink-500">
                    <Legend color={BAND_EDGE} label={`Middle half of members (25th–75th)`} />
                    <Legend color={BAND_MID} label="Median member" />
                    {mine?.ok && <Legend color={YOU} label="You" />}
                    {traj.unit && (
                      <span className="text-ink-600">
                        {traj.label} · {traj.unit}
                      </span>
                    )}
                  </div>

                  {/* The disclaimer sits under the chart, not in a footer. */}
                  <p className="mt-3 flex items-start gap-2 rounded-control border border-ink-800 bg-ink-900/40 px-3 py-2.5 text-micro leading-relaxed text-ink-400">
                    <Info className="mt-0.5 h-3 w-3 shrink-0 text-ink-500" />
                    <span>
                      This is what already happened to other members — a range,
                      not a forecast. Half of them fell outside the shaded band.
                      Nothing here says what your own results are going to be;
                      your plan is built on your labs and your provider&apos;s
                      judgement, not on this chart.
                    </span>
                  </p>

                  {/* ── Where you currently sit ──────────────────────── */}
                  {spot?.ok && (
                    <div className="mt-3 rounded-panel border border-ink-800 bg-ink-900/40 p-4">
                      <p className="label-eyebrow">Where you are</p>
                      <p className="mt-1.5 text-detail leading-relaxed text-ink-200">
                        You are{" "}
                        <span className="stat-mono text-ink-50">{weeksIn(client)}</span>{" "}
                        weeks in. At week{" "}
                        <span className="stat-mono text-ink-50">{spot.week}</span> your{" "}
                        {traj.label.toLowerCase()} was{" "}
                        <span className="stat-mono text-ink-50">
                          {spot.value}
                          {traj.unit}
                        </span>
                        {spot.inBand
                          ? " — inside the band, alongside most of the group."
                          : " — outside the band, which is where roughly half of the group also sits at some point."}
                      </p>
                      <p className="mt-2 text-micro leading-relaxed text-ink-600">
                        Position in the group, not a score. Being above or below
                        the band is information for your next conversation with
                        your coach, not a verdict.
                      </p>
                    </div>
                  )}

                  <p className="mt-3 text-micro text-ink-600">
                    Based on{" "}
                    <span className="stat-mono text-ink-400">{traj.n}</span> members at
                    week 0. Groups smaller than{" "}
                    <span className="stat-mono text-ink-400">{K_MIN}</span> are never
                    shown, at any point on the line, so no one here is
                    identifiable.
                  </p>
                </div>
              </FadeIn>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The lead sentence is generated from the axes the engine actually matched on,
 * never hardcoded.
 *
 * The floor frequently forces the comparison out to "same sex, same goal, any
 * age". Describing that as "similar age, similar starting point" would be a
 * small, comfortable, entirely deniable lie — and it is the kind that erodes a
 * member's ability to trust anything else on the screen. So when the match is
 * loose, the copy says it is loose.
 */
function leadCopy(matched: { age: "band" | "range" | "any"; startingBodyFat: boolean }): string {
  if (matched.startingBodyFat) {
    return "Members who started where you did — same goal, similar age, similar starting point.";
  }
  if (matched.age === "band" || matched.age === "range") {
    return "Members with the same goal as you, in a similar age range. We could not match closely on starting body composition without the group getting too small to show.";
  }
  return "Members with the same goal as you. This group spans a wide age range — matching more tightly than that would have left too few people to show anything at all.";
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {label}
    </span>
  );
}

/**
 * The sub-floor state. It says what happened and why, because "no data" reads
 * as a broken feature while "too few people match to show this responsibly"
 * reads as the product working correctly — which it is.
 */
function CohortWithheld({ reason, attempted }: { reason: string; attempted: string[] }) {
  if (reason === "no-baseline") {
    return (
      <div className="mt-3">
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="We don't have a starting point for you yet"
          hint="Once your intake goals and first scan are on file, we can show you how members who started where you did have progressed."
        />
      </div>
    );
  }

  return (
    <div className="mt-3">
      <EmptyState
        icon={<ShieldCheck className="h-6 w-6" />}
        title="Not enough members match you closely enough to show this yet"
        hint={`We only show this when at least ${K_MIN} members share your starting point. Fewer than that and the chart would start describing individuals rather than a group — so we leave it out rather than loosen the comparison until it stops meaning anything.`}
      />
      {attempted.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-micro uppercase tracking-wide text-ink-600">
            We looked for
          </span>
          {attempted.map((c) => (
            <Badge key={c} tone="neutral">
              {c}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricWithheld({ reason }: { reason: string }) {
  const copy: Record<string, { title: string; hint: string }> = {
    "cohort-too-small": {
      title: "Too few members have this measurement to show a range",
      hint: `Fewer than ${K_MIN} members of your group have this recorded, so we don't chart it.`,
    },
    "not-enough-history": {
      title: "Your group hasn't been going long enough to show a line yet",
      hint: "We have a couple of points, which is not a trend. This fills in as more members reach the later weeks.",
    },
    "no-data-for-metric": {
      title: "No measurements on file for this yet",
      hint: "This appears once enough scans have been recorded.",
    },
  };
  const c = copy[reason] ?? copy["no-data-for-metric"];
  return (
    <div className="mt-4">
      <EmptyState icon={<Info className="h-6 w-6" />} title={c.title} hint={c.hint} />
    </div>
  );
}

export default PeopleLikeYou;
