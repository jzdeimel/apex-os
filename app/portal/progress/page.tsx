"use client";

/**
 * Progress — the emotional payoff screen.
 *
 * Body-composition history already exists in the record; in the live system it
 * is trapped behind a staff login, so a member who wants to know whether the
 * last three months worked has to ask someone to read it to them. Here it is
 * just… theirs.
 *
 * The re-rank is the design: a member who is anxious and paying a lot of money
 * gets ONE sentence at the top — the number that moved most, in plain English,
 * with the honesty caveat attached ("measured, not estimated"). The four delta
 * tiles, the charts, the streaks and the milestone list are all still here,
 * they just stop competing with the win for the first screenful.
 *
 * Units are converted to pounds because the scan device reports kilograms and
 * no member in Raleigh thinks in kilograms.
 */

import { useMemo, useState } from "react";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { alphaScore, scoreColor } from "@/lib/alphaScore";
import { buildPlanOfCare } from "@/lib/planOfCare/engine";
import { Card, CardContent, EmptyState } from "@/components/ui/primitives";
import { TrendLine, TrendArea } from "@/components/charts";
import { FadeIn } from "@/components/portal/still";
import { Tabs } from "@/components/ui/Tabs";
import { formatDate, seededRandom, cn, absolute } from "@/lib/utils";
import { ME, me, PortalPageHeader } from "@/components/portal/PortalHeader";
import { Flame, TrendingDown, TrendingUp, Trophy, LineChart as LineChartIcon } from "lucide-react";

const KG_TO_LB = 2.20462;
const lb = (kg: number) => Math.round(kg * KG_TO_LB * 10) / 10;

/** "2026-01-20" → "January". Deterministic: the ISO string is always supplied. */
// timeZone pinned for the same reason as lib/utils: an unpinned formatter
// renders differently on a UTC server than in the viewer's browser, which is a
// hydration mismatch rather than a cosmetic difference.
const monthOf = (iso: string) =>
  absolute(iso).toLocaleDateString("en-US", { timeZone: "UTC", month: "long" });

export default function PortalProgressPage() {
  const client = me();
  const scan = getScanForClient(ME);
  const score = alphaScore(client);
  const plan = buildPlanOfCare(client);
  const [tab, setTab] = useState("body");

  // Chart series. Recharts wants one row per date with every series on it, so
  // the three body measures are flattened here rather than in three passes.
  const bodyData = useMemo(
    () =>
      (scan?.history ?? []).map((h) => ({
        date: h.date,
        weight: lb(h.weightKg),
        muscle: lb(h.skeletalMuscleKg),
        bodyFat: h.bodyFatPct,
      })),
    [scan],
  );

  // BodyScan.history is optional in the type, so narrow once here rather than
  // sprinkling non-null assertions through the JSX.
  const history = scan?.history ?? [];
  const first = history[0];
  const last = history[history.length - 1];

  const baselineMonth = first ? monthOf(first.date) : "your first scan";

  /**
   * The four numbers, computed once and reused by both the headline and the
   * tiles so the hero can never disagree with the row underneath it.
   *
   * `weight` is scored as the least meaningful mover on purpose — it swings
   * with hydration and food timing, and leading with it would make a good week
   * look like a bad one. Body fat and muscle come off the same device under the
   * same conditions, which is what makes them worth a headline.
   */
  const movers = useMemo(() => {
    if (!first || !last) return [];
    return [
      {
        key: "bodyFat",
        label: "Body fat",
        now: `${last.bodyFatPct.toFixed(1)}%`,
        delta: Math.round((last.bodyFatPct - first.bodyFatPct) * 10) / 10,
        unit: "pts",
        goodWhenDown: true,
        weight: 3, // ranking weight for "biggest mover", not body weight
        headline: (d: number) =>
          `Down ${Math.abs(d).toFixed(1)} points of body fat since ${baselineMonth}`,
        because: "Measured on the same scanner, same time of day, every visit — not estimated.",
      },
      {
        key: "muscle",
        label: "Muscle",
        now: `${lb(last.skeletalMuscleKg).toFixed(1)} lb`,
        delta: Math.round((lb(last.skeletalMuscleKg) - lb(first.skeletalMuscleKg)) * 10) / 10,
        unit: "lb",
        goodWhenDown: false,
        weight: 2.5,
        headline: (d: number) => `Up ${Math.abs(d).toFixed(1)} lb of muscle since ${baselineMonth}`,
        because: "Holding lean mass while the fat comes off is the outcome the plan is aiming at.",
      },
      {
        key: "score",
        label: "Alpha Score",
        now: `${score.score}`,
        delta: score.trend[score.trend.length - 1].value - score.trend[0].value,
        unit: "pts",
        goodWhenDown: false,
        weight: 1.5,
        headline: (d: number) => `Your Alpha Score is up ${Math.abs(d)} points since ${baselineMonth}`,
        because: "A summary of your last few panels moving back toward range. It is not a grade.",
      },
      {
        key: "weight",
        label: "Weight",
        now: `${lb(last.weightKg).toFixed(1)} lb`,
        delta: Math.round((lb(last.weightKg) - lb(first.weightKg)) * 10) / 10,
        unit: "lb",
        goodWhenDown: true,
        weight: 1,
        headline: (d: number) => `Down ${Math.abs(d).toFixed(1)} lb since ${baselineMonth}`,
        because: "The noisiest number on this page — body fat is the one worth trusting.",
      },
    ];
  }, [first, last, score, baselineMonth]);

  /**
   * The single win. Only ever an *improvement*: if nothing has moved the right
   * way we say so plainly rather than dressing a flat month up as a victory —
   * a member can check every one of these numbers, so a claim they can falsify
   * costs more trust than it buys.
   */
  const win = useMemo(() => {
    const improved = movers.filter((m) => (m.goodWhenDown ? m.delta < 0 : m.delta > 0));
    if (improved.length === 0) return null;
    return improved.sort((a, b) => Math.abs(b.delta) * b.weight - Math.abs(a.delta) * a.weight)[0];
  }, [movers]);

  /**
   * Streaks are member-reported behaviours, which the mock layer does not
   * model. Derived deterministically from the member id so the numbers are
   * stable across reloads and never drift between screenshots.
   */
  const streaks = useMemo(() => {
    const r = seededRandom(ME + "streaks");
    return [
      { label: "Check-ins logged", value: 11 + Math.floor(r() * 6), unit: "weeks running", icon: Flame },
      { label: "Training sessions", value: 38 + Math.floor(r() * 12), unit: "this block", icon: Trophy },
      { label: "Protein target hit", value: 74 + Math.floor(r() * 14), unit: "% of days", icon: TrendingUp },
    ];
  }, []);

  /**
   * Milestones are computed from real movement in the record, not authored
   * copy — if the numbers stop supporting a claim, the claim disappears rather
   * than becoming a lie the member can check.
   */
  const milestones = useMemo(() => {
    const out: { title: string; detail: string; when: string }[] = [];
    if (first && last) {
      const dW = lb(first.weightKg) - lb(last.weightKg);
      const dBf = Math.round((first.bodyFatPct - last.bodyFatPct) * 10) / 10;
      const dM = Math.round((last.skeletalMuscleKg - first.skeletalMuscleKg) * KG_TO_LB * 10) / 10;
      if (dW > 0)
        out.push({
          title: `Down ${dW.toFixed(1)} lb since ${baselineMonth}`,
          detail: "Weight is the noisiest number here — the body-fat line is the one worth trusting.",
          when: last.date,
        });
      if (dBf > 0)
        out.push({
          title: `${dBf.toFixed(1)} points of body fat gone`,
          detail: "Same device, same conditions each scan, so this is a real comparison.",
          when: last.date,
        });
      if (dM > 0)
        out.push({
          title: `Held on to muscle — up ${dM.toFixed(1)} lb`,
          detail: "Losing fat while keeping lean mass is the outcome the plan is actually aiming at.",
          when: last.date,
        });
    }
    const scoreGain = score.trend[score.trend.length - 1].value - score.trend[0].value;
    if (scoreGain > 0)
      out.push({
        title: `Alpha Score up ${scoreGain} points`,
        detail: "Driven mostly by your metabolic and hormone markers moving back toward range.",
        when: score.trend[score.trend.length - 1].date,
      });
    return out;
  }, [first, last, score, baselineMonth]);

  if (!scan) {
    return (
      <div className="space-y-6">
        <PortalPageHeader
          eyebrow="Progress"
          title="Is this working?"
          subtitle="Where your numbers have moved since you started."
        />
        <EmptyState
          icon={<LineChartIcon className="h-6 w-6" />}
          title="No body scans on file yet"
          hint="Your first scan gets booked at your next visit — after that this page fills in on its own."
        />
      </div>
    );
  }

  return (
    /* Groups, not a flat stack: the win panel, the four movers, the charts and
       the two lists are 48px apart, while the tiles inside each are 12px
       apart. */
    <div className="space-y-12">
      <PortalPageHeader
        eyebrow="Progress"
        title="Is this working?"
        subtitle="Every scan and every panel since you started, side by side. Nothing here is rounded in your favour."
      />

      {/* ------------------------------------------------------------------ */}
      {/* The win. One number, one sentence, above everything else.          */}
      {/* ------------------------------------------------------------------ */}
      <FadeIn>
        <div className="relative overflow-hidden rounded-panel border border-optimal/25 bg-gradient-to-br from-optimal/15 via-optimal/5 to-transparent px-5 py-7 sm:px-8 sm:py-10">
          {win ? (
            <>
              <p className="label-eyebrow">Your biggest move</p>
              <p className="mt-3 font-display text-display font-semibold leading-[1.15] tracking-tight text-ink-50 sm:text-display">
                {win.headline(win.delta)}
              </p>
              <p className="mt-3 max-w-prose text-body leading-relaxed text-ink-300">{win.because}</p>
              <p className="mt-5 text-detail text-ink-400">
                From{" "}
                <span className="stat-mono text-ink-200">
                  {win.key === "bodyFat"
                    ? `${first!.bodyFatPct.toFixed(1)}%`
                    : win.key === "muscle"
                      ? `${lb(first!.skeletalMuscleKg).toFixed(1)} lb`
                      : win.key === "score"
                        ? `${score.trend[0].value}`
                        : `${lb(first!.weightKg).toFixed(1)} lb`}
                </span>{" "}
                in {baselineMonth} to <span className="stat-mono text-ink-100">{win.now}</span> on{" "}
                {formatDate(last!.date)}.
              </p>
            </>
          ) : (
            <>
              <p className="label-eyebrow">This block</p>
              <p className="mt-3 font-display text-title font-semibold leading-tight text-ink-50">
                Nothing has moved much yet — and that&rsquo;s worth saying out loud.
              </p>
              <p className="mt-3 max-w-prose text-body leading-relaxed text-ink-300">
                Flat months happen. Bring this page to your next visit; it&rsquo;s exactly the conversation
                your provider wants to have.
              </p>
            </>
          )}
        </div>
      </FadeIn>

      {/* ------------------------------------------------------------------ */}
      {/* The other three numbers. 2-up on a phone, 4-up on a desk.          */}
      {/* ------------------------------------------------------------------ */}
      {/* The Stagger/StaggerItem wrapper is gone, so the Cards are direct grid
          children and `h-full` finally does what it says — the tiles are equal
          height instead of each being as tall as its own text. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {movers.map((k) => {
          const improving = k.goodWhenDown ? k.delta < 0 : k.delta > 0;
          const Icon = k.delta < 0 ? TrendingDown : TrendingUp;
          return (
            <Card key={k.key} className="card-hover h-full min-w-0">
              <CardContent className="p-4">
                <p className="text-micro uppercase text-ink-500">{k.label}</p>
                <p className="stat-mono mt-1.5 text-title text-ink-50">{k.now}</p>
                <p
                  className={cn(
                    "mt-1.5 flex flex-wrap items-center gap-x-1 text-micro",
                    improving ? "text-optimal" : "text-ink-400",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="stat-mono">
                    {k.delta > 0 ? "+" : ""}
                    {k.delta.toFixed(1)} {k.unit}
                  </span>
                  <span className="text-ink-500">since {baselineMonth.slice(0, 3)}</span>
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts ------------------------------------------------------------- */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="font-display text-title font-semibold text-ink-50">The long view</h2>
              <p className="mt-1 text-detail text-ink-400">
                <span className="stat-mono">{history.length}</span> scans on the same device, from{" "}
                {first ? formatDate(first.date) : "—"} to {formatDate(scan.scannedOn)}.
              </p>
            </div>
            <Tabs
              tabs={[
                { id: "body", label: "Body" },
                { id: "score", label: "Alpha Score" },
              ]}
              active={tab}
              onChange={setTab}
            />
          </div>

          {/* Charts get their own overflow context so a wide series can never
              push the page sideways on a 390px screen. */}
          <div className="mt-5 overflow-x-auto">
            {tab === "body" ? (
              <FadeIn key="body">
                <TrendArea
                  data={bodyData}
                  series={[
                    { key: "weight", label: "Weight (lb)", color: "#60a5fa" },
                    { key: "muscle", label: "Muscle (lb)", color: "#34d399" },
                    { key: "bodyFat", label: "Body fat (%)", color: "#e0bd6e" },
                  ]}
                  height={280}
                />
                <p className="mt-3 text-detail leading-relaxed text-ink-500">
                  Weight moves with hydration and food timing; body fat and muscle are the lines your coach
                  actually reads. All three come from the same {scan.device.replace(" (simulated)", "")} scan.
                </p>
              </FadeIn>
            ) : (
              <FadeIn key="score">
                <TrendLine data={score.trend} height={280} />
                <p className="mt-3 text-detail leading-relaxed text-ink-500">
                  One point per panel. Currently{" "}
                  <span className="stat-mono" style={{ color: scoreColor(score.band) }}>
                    {score.score}
                  </span>{" "}
                  — {score.label.toLowerCase()}. It is a summary of your results, not a grade.
                </p>
              </FadeIn>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Streaks + milestones ----------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5 sm:p-6">
            <h2 className="font-display text-title text-ink-50">The part you control</h2>
            <p className="mt-1 text-detail text-ink-400">Showing up is the input. Everything above is the output.</p>
            {/* Rows, not boxes-in-a-box. The green icon tile on each row is
                gone too: a coloured square behind a glyph is decoration, and
                three of them turned a two-column read into a traffic light.
                The count on the right is what the row is for, so it is the
                only thing here with any weight. */}
            <div className="mt-5 divide-y divide-ink-800/60 border-y border-ink-800/60">
              {streaks.map((s) => (
                <div key={s.label} className="flex items-center gap-3.5 py-3.5">
                  <s.icon className="h-4 w-4 shrink-0 text-ink-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-medium text-ink-50">{s.label}</p>
                    <p className="text-micro text-ink-500">{s.unit}</p>
                  </div>
                  <span className="stat-mono shrink-0 text-title text-ink-50">{s.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 sm:p-6">
            <h2 className="font-display text-title text-ink-50">Everything that moved</h2>
            <p className="mt-1 text-detail text-ink-400">
              Pulled straight from your scans — if a number stops supporting one of these, it disappears.
            </p>
            {/* The date was a green badge. A date is not a status — colour
                here was pure decoration, and it made every milestone shout
                equally. It is a muted date now, which is what it is. */}
            <div className="mt-5 divide-y divide-ink-800/60 border-y border-ink-800/60">
              {milestones.map((m) => (
                <div key={m.title} className="py-3.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="text-body font-medium text-ink-50">{m.title}</p>
                    <span className="stat-mono shrink-0 text-micro text-ink-500">{formatDate(m.when)}</span>
                  </div>
                  <p className="mt-1 text-detail leading-relaxed text-ink-400">{m.detail}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-micro leading-relaxed text-ink-500">
              Your plan re-checks these at weeks{" "}
              <span className="stat-mono">
                {plan.monitoring
                  .filter((m) => m.week > 0)
                  .map((m) => m.week)
                  .join(", ")}
              </span>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
