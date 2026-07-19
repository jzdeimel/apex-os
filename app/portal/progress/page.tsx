"use client";

/**
 * Progress — the member's own trend lines.
 *
 * Body-composition history already exists in the record; in the live system it
 * is trapped behind a staff login, so a member who wants to know whether the
 * last three months worked has to ask someone to read it to them. Here it is
 * just… theirs. Units are converted to pounds because the scan device reports
 * kilograms and no member in Raleigh thinks in kilograms.
 */

import { useMemo, useState } from "react";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { alphaScore, scoreColor } from "@/lib/alphaScore";
import { buildPlanOfCare } from "@/lib/planOfCare/engine";
import { Card, CardContent, Badge, EmptyState } from "@/components/ui/primitives";
import { TrendLine, TrendArea } from "@/components/charts";
import { Stagger, StaggerItem, FadeIn } from "@/components/motion";
import { Tabs } from "@/components/ui/Tabs";
import { formatDate, seededRandom, cn } from "@/lib/utils";
import { ME, me, PortalPageHeader } from "@/components/portal/PortalHeader";
import { Flame, TrendingDown, TrendingUp, Trophy, LineChart as LineChartIcon } from "lucide-react";

const KG_TO_LB = 2.20462;
const lb = (kg: number) => Math.round(kg * KG_TO_LB * 10) / 10;

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
          title: `Down ${dW.toFixed(1)} lb since January`,
          detail: "Weight is the noisiest number here — the body-fat line below is the one worth trusting.",
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
  }, [first, last, score]);

  if (!scan) {
    return (
      <div className="space-y-6">
        <PortalPageHeader
          eyebrow="Progress"
          title="Your progress"
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
    <div className="space-y-6">
      <PortalPageHeader
        eyebrow="Progress"
        title="Your progress"
        subtitle="Every scan and every panel since you started, side by side. Nothing here is rounded in our favour."
      />

      {/* Headline deltas ---------------------------------------------------- */}
      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Weight",
            now: `${lb(last!.weightKg).toFixed(1)} lb`,
            delta: lb(last!.weightKg) - lb(first!.weightKg),
            unit: "lb",
            goodWhenDown: true,
          },
          {
            label: "Body fat",
            now: `${last!.bodyFatPct.toFixed(1)}%`,
            delta: Math.round((last!.bodyFatPct - first!.bodyFatPct) * 10) / 10,
            unit: "pts",
            goodWhenDown: true,
          },
          {
            label: "Muscle",
            now: `${lb(last!.skeletalMuscleKg).toFixed(1)} lb`,
            delta: Math.round((lb(last!.skeletalMuscleKg) - lb(first!.skeletalMuscleKg)) * 10) / 10,
            unit: "lb",
            goodWhenDown: false,
          },
          {
            label: "Alpha Score",
            now: `${score.score}`,
            delta: score.trend[score.trend.length - 1].value - score.trend[0].value,
            unit: "pts",
            goodWhenDown: false,
          },
        ].map((k) => {
          const improving = k.goodWhenDown ? k.delta < 0 : k.delta > 0;
          const Icon = k.delta < 0 ? TrendingDown : TrendingUp;
          return (
            <StaggerItem key={k.label}>
              <Card className="card-hover h-full">
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wide text-ink-500">{k.label}</p>
                  <p className="stat-mono mt-1 text-2xl font-semibold text-ink-50">{k.now}</p>
                  <p
                    className={cn(
                      "mt-1 flex items-center gap-1 text-xs",
                      improving ? "text-optimal" : "text-ink-400",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="stat-mono">
                      {k.delta > 0 ? "+" : ""}
                      {k.delta.toFixed(1)} {k.unit}
                    </span>
                    <span className="text-ink-500">since Jan</span>
                  </p>
                </CardContent>
              </Card>
            </StaggerItem>
          );
        })}
      </Stagger>

      {/* Charts ------------------------------------------------------------- */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-ink-50">The long view</h2>
              <p className="mt-0.5 text-sm text-ink-400">
                <span className="stat-mono">{history.length}</span> scans on the same device, from{" "}
                {first ? formatDate(first.date) : "—"} to {formatDate(scan.scannedOn)}.
              </p>
            </div>
            <Tabs
              tabs={[
                { id: "body", label: "Body composition" },
                { id: "score", label: "Alpha Score" },
              ]}
              active={tab}
              onChange={setTab}
            />
          </div>

          <div className="mt-5">
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
                <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
                  Weight moves with hydration and food timing; body fat and muscle are the lines your coach
                  actually reads. All three come from the same {scan.device.replace(" (simulated)", "")} scan.
                </p>
              </FadeIn>
            ) : (
              <FadeIn key="score">
                <TrendLine data={score.trend} height={280} />
                <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
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
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h2 className="font-display text-base font-semibold text-ink-50">Consistency</h2>
            <p className="mt-1 text-sm text-ink-400">The part of this you control.</p>
            <div className="mt-4 space-y-3">
              {streaks.map((s) => (
                <div key={s.label} className="hairline flex items-center gap-3 rounded-xl bg-ink-900/50 p-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-optimal/15 text-optimal">
                    <s.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-50">{s.label}</p>
                    <p className="text-xs text-ink-500">{s.unit}</p>
                  </div>
                  <span className="stat-mono text-xl font-semibold text-ink-50">{s.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h2 className="font-display text-base font-semibold text-ink-50">Wins so far</h2>
            <p className="mt-1 text-sm text-ink-400">
              Pulled straight from your scans — if a number stops supporting one of these, it disappears.
            </p>
            <Stagger className="mt-4 space-y-2">
              {milestones.map((m) => (
                <StaggerItem key={m.title}>
                  <div className="hairline rounded-xl bg-ink-900/50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-ink-50">{m.title}</p>
                      <Badge tone="optimal">{formatDate(m.when)}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-400">{m.detail}</p>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
            <p className="mt-4 text-[11px] leading-relaxed text-ink-500">
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
