"use client";

/**
 * My Labs — the member's own results, in language a member can use.
 *
 * The frame for this whole page is the clinic's own sentence: "We look past
 * 'normal' labs to find the real cause." That is not a slogan we borrowed for
 * decoration — it is literally what the data model does, because `Biomarker`
 * carries BOTH the lab's reference band and a tighter optimal window. So the
 * page's job is to make that visible: every marker draws both bands, and a
 * value sitting inside the grey but outside the green gets called out by name.
 * That single case is the clinic's entire value proposition, rendered.
 *
 * Two other deliberate choices:
 *
 *  - GROUPED BY MEANING, NOT BY PANEL. `Biomarker.category` is a lab-ordering
 *    taxonomy (Metabolic, Lipids, Organ, Blood). A member does not have a
 *    "Lipids" question, they have a "is my heart okay" question. The category
 *    map below translates once; every marker still appears exactly once.
 *  - TRANSLATED STATUS. `optimal | watch | low | high` are internal clinical
 *    states; a member reading "high" next to their name at 11pm on a Sunday
 *    learns nothing except that they should panic. Apex maps those four states
 *    onto three things a member can act on: it's fine, keep an eye on it, or
 *    bring it up with us. The raw number, unit and range are all still shown —
 *    this is translation, not concealment.
 */

import { useMemo, useState } from "react";
import { getLabsForClient } from "@/lib/mock/labs";
import type { Biomarker, BiomarkerStatus } from "@/lib/types";
import { staffMap } from "@/lib/mock/staff";
import { Card, CardContent, Badge, EmptyState } from "@/components/ui/primitives";
import { Tabs } from "@/components/ui/Tabs";
import { Stagger, StaggerItem, SwitchView, FadeIn } from "@/components/motion";
import { PILLARS } from "@/lib/brand";
import { formatDate, clamp, cn } from "@/lib/utils";
import { ME, me, PortalPageHeader } from "@/components/portal/PortalHeader";
import { Term } from "@/components/ui/Term";
import { FlaskConical, Eye } from "lucide-react";

/** The three member-facing readings, and the tone each maps to. */
type MemberReading = "in-range" | "watching" | "discuss";

const READING: Record<MemberReading, { label: string; tone: "optimal" | "watch" | "high"; blurb: string }> = {
  "in-range": {
    label: "In range",
    tone: "optimal",
    blurb: "Right where we want it. Nothing to do.",
  },
  watching: {
    label: "Worth watching",
    tone: "watch",
    blurb: "Inside the lab's normal range but not yet where we'd like it. We track it, we don't chase it.",
  },
  discuss: {
    label: "Let's discuss",
    tone: "high",
    blurb: "Outside the lab's normal range. Your provider has already seen this — it comes up at your visit.",
  },
};

function readingFor(status: BiomarkerStatus): MemberReading {
  if (status === "optimal") return "in-range";
  if (status === "watch") return "watching";
  return "discuss"; // low and high both mean "we need to talk about it"
}

/** True when the lab would call this normal but the plan would not. */
function normalButNotOptimal(b: Biomarker): boolean {
  const inRef = b.value >= b.refLow && b.value <= b.refHigh;
  const optLow = b.optimalLow ?? b.refLow;
  const optHigh = b.optimalHigh ?? b.refHigh;
  return inRef && (b.value < optLow || b.value > optHigh);
}

// ---------------------------------------------------------------------------
// Grouping — by what a marker means to a person, not by which panel ordered it
// ---------------------------------------------------------------------------

interface MemberGroup {
  id: string;
  title: string;
  why: string;
  /** `Biomarker["category"]` values that roll up into this group. */
  categories: Biomarker["category"][];
}

const MEMBER_GROUPS: MemberGroup[] = [
  {
    id: "energy",
    title: "Energy & thyroid",
    why: "Your metabolic thermostat. Low output here shows up as cold hands, flat energy and weight that will not move even when everything else is right.",
    categories: ["Thyroid"],
  },
  {
    id: "hormones",
    title: "Hormones",
    why: "These set your drive, recovery, mood and how easily you hold muscle. They are the markers most likely to explain how you actually feel day to day.",
    categories: ["Hormones"],
  },
  {
    id: "heart",
    title: "Heart & metabolic",
    why: "How your body handles fuel, and the long-horizon markers for your heart. These move earlier than the scale does, which is why we watch them closely when fat loss is the goal.",
    categories: ["Metabolic", "Lipids"],
  },
  {
    id: "inflammation",
    title: "Inflammation",
    why: "A background noise level for the whole body. Raised numbers here often track with poor sleep, a hard training week or a recent illness.",
    categories: ["Inflammation"],
  },
  {
    id: "nutrients",
    title: "Vitamins & minerals",
    why: "The easiest wins on any panel. These are usually fixable with food or a supplement rather than anything prescribed.",
    categories: ["Nutrients"],
  },
  {
    id: "safety",
    title: "Safety checks",
    why: "Liver, kidneys, blood counts and age-appropriate screening. We recheck these on schedule so anything on your plan stays comfortably clear of your organs.",
    categories: ["Organ", "Blood", "Prostate"],
  },
];

/**
 * Range bar — the argument of this page, drawn.
 *
 * Scaled to the lab reference range with a little padding so an out-of-range
 * value still lands on the track instead of falling off the end. The optimal
 * window is drawn as a distinct band on top of the grey one, because "normal"
 * and "where we want you" being different things is the single most useful
 * idea a member can take away from their own results.
 */
function RangeBar({ b }: { b: Biomarker }) {
  const pad = (b.refHigh - b.refLow) * 0.22 || 1;
  const lo = b.refLow - pad;
  const hi = b.refHigh + pad;
  const pct = (v: number) => clamp(((v - lo) / (hi - lo)) * 100, 0, 100);

  const optLow = b.optimalLow ?? b.refLow;
  const optHigh = b.optimalHigh ?? b.refHigh;

  return (
    <div className="mt-3">
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-ink-800">
        {/* what the lab calls normal */}
        <span
          className="absolute inset-y-0 bg-ink-700"
          style={{ left: `${pct(b.refLow)}%`, width: `${pct(b.refHigh) - pct(b.refLow)}%` }}
        />
        {/* the tighter window the plan actually targets */}
        <span
          className="absolute inset-y-0 bg-optimal/45"
          style={{ left: `${pct(optLow)}%`, width: `${Math.max(pct(optHigh) - pct(optLow), 1.5)}%` }}
        />
      </div>
      {/* the member's own value, riding on top of both bands */}
      <div className="relative h-0">
        <span
          className="absolute -top-[15px] h-5 w-[3px] -translate-x-1/2 rounded-full bg-ink-50 shadow-[0_0_0_2px_rgba(0,0,0,0.6)]"
          style={{ left: `${pct(b.value)}%` }}
          aria-hidden
        />
      </div>
      {/* Endpoints carry their units so the numbers under the bar are never
          three anonymous digits floating in space. */}
      <div className="mt-2.5 flex items-baseline justify-between gap-2 text-[10px] text-ink-600">
        <span className="stat-mono">{b.refLow}</span>
        <span className="text-optimal">
          where we aim: <span className="stat-mono">{optLow}</span>–<span className="stat-mono">{optHigh}</span>
        </span>
        <span className="stat-mono">{b.refHigh}</span>
      </div>
    </div>
  );
}

export default function PortalLabsPage() {
  const client = me();
  const labs = getLabsForClient(ME);
  const provider = staffMap[client.providerId];
  const [group, setGroup] = useState("all");

  const grouped = useMemo(() => {
    const markers = labs?.biomarkers ?? [];
    return MEMBER_GROUPS.map((g) => ({
      ...g,
      markers: markers.filter((b) => g.categories.includes(b.category)),
    })).filter((g) => g.markers.length > 0);
  }, [labs]);

  const counts = useMemo(() => {
    const c = { "in-range": 0, watching: 0, discuss: 0 } as Record<MemberReading, number>;
    for (const b of labs?.biomarkers ?? []) c[readingFor(b.status)]++;
    return c;
  }, [labs]);

  /** The markers that prove the clinic's point. Named, not just counted. */
  const missedByNormal = useMemo(
    () => (labs?.biomarkers ?? []).filter(normalButNotOptimal),
    [labs],
  );

  if (!labs) {
    return (
      <div className="space-y-6">
        <PortalPageHeader
          eyebrow="Your results"
          title="Your labs"
          subtitle="Everything measured on your last panel, in plain language."
        />
        <EmptyState
          icon={<FlaskConical className="h-6 w-6" />}
          title="No results yet"
          hint="Your first panel is drawn before your plan is written. Results land here the moment they are back."
        />
      </div>
    );
  }

  const shown = group === "all" ? grouped : grouped.filter((g) => g.id === group);

  return (
    <div className="space-y-8">
      <PortalPageHeader
        eyebrow="Your results"
        title="Your labs"
        subtitle={`All ${labs.biomarkers.length} markers from your ${formatDate(labs.collectedOn)} panel — the same numbers your care team is reading. ${provider?.name} reviewed them on ${formatDate(labs.resultedOn)}.`}
      />

      {/* ------------------------------------------------------------------ */}
      {/* The frame. The clinic's own sentence, then the proof of it.        */}
      {/* ------------------------------------------------------------------ */}
      <FadeIn>
        <div className="rounded-3xl border border-optimal/25 bg-gradient-to-br from-optimal/15 via-optimal/5 to-transparent px-5 py-7 sm:px-8 sm:py-9">
          <p className="label-eyebrow">{PILLARS[0].title}</p>
          <p className="mt-3 font-display text-[1.5rem] font-semibold leading-tight tracking-tight text-ink-50 sm:text-3xl">
            {/* Verbatim from Alpha Health. We show it because we can back it. */}
            {PILLARS[0].blurb}
          </p>

          {/* The legend IS the explanation. Two swatches, two sentences. */}
          <div className="mt-6 space-y-3">
            <div className="flex items-start gap-3">
              <span className="mt-1 h-2.5 w-8 shrink-0 rounded-full bg-ink-700" />
              <p className="text-[13px] leading-relaxed text-ink-300">
                <span className="font-medium text-ink-100">Normal</span> — the range the lab uses for the
                general population, sick and healthy alike.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-1 h-2.5 w-8 shrink-0 rounded-full bg-optimal/45" />
              <p className="text-[13px] leading-relaxed text-ink-300">
                <span className="font-medium text-ink-100">Where we aim</span> — the tighter window your plan
                targets. It sits inside &ldquo;normal&rdquo;, and it is the one your provider reads.
              </p>
            </div>
          </div>

          {missedByNormal.length > 0 && (
            <div className="mt-6 border-t border-optimal/20 pt-5">
              <p className="flex items-start gap-2.5 text-[15px] leading-relaxed text-ink-100">
                <Eye className="mt-0.5 h-4 w-4 shrink-0 text-optimal" />
                <span>
                  <span className="stat-mono font-semibold">{missedByNormal.length}</span> of your results
                  would be called normal at any other clinic — and are still not where we want them.
                </span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {missedByNormal.map((b) => (
                  <span
                    key={b.key}
                    className="inline-flex items-center gap-1.5 rounded-full border border-ink-600/60 bg-ink-900/60 px-2.5 py-1 text-[11px] text-ink-200"
                  >
                    <Term k={b.key}>{b.name}</Term>
                    <span className="stat-mono text-ink-400">
                      {b.value} {b.unit}
                    </span>
                  </span>
                ))}
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-ink-400">
                None of these is an emergency. They are the reason your plan looks the way it does.
              </p>
            </div>
          )}
        </div>
      </FadeIn>

      {/* Summary counts ------------------------------------------------------ */}
      {/* Single column at 390px: three cards abreast on a phone shrinks the
          explanation under each one to unreadable. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(Object.keys(READING) as MemberReading[]).map((k) => (
          <Card key={k}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-2">
                <Badge tone={READING[k].tone}>{READING[k].label}</Badge>
                <span className="stat-mono text-3xl font-semibold text-ink-50">{counts[k]}</span>
              </div>
              <p className="mt-2.5 text-[13px] leading-relaxed text-ink-400">{READING[k].blurb}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Group filter -------------------------------------------------------- */}
      <Tabs
        tabs={[
          { id: "all", label: "Everything", count: labs.biomarkers.length },
          ...grouped.map((g) => ({ id: g.id, label: g.title, count: g.markers.length })),
        ]}
        active={group}
        onChange={setGroup}
      />

      <SwitchView k={group} className="space-y-4">
        {shown.map((g) => (
          <Card key={g.id}>
            <CardContent className="p-5 sm:p-6">
              <h2 className="font-display text-xl font-semibold text-ink-50">{g.title}</h2>
              <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-400">{g.why}</p>

              <Stagger className="mt-5 space-y-3 md:grid grid-cols-1 md:grid-cols-2 md:gap-3 md:space-y-0">
                {g.markers.map((b) => {
                  const r = readingFor(b.status);
                  const missed = normalButNotOptimal(b);
                  const prev = b.history && b.history.length > 1 ? b.history[b.history.length - 2] : null;
                  return (
                    <StaggerItem key={b.key}>
                      <div
                        className={cn(
                          "hairline h-full rounded-2xl bg-ink-900/50 p-4 sm:p-5",
                          // The "normal but not optimal" case earns a visible
                          // edge — it is the case the page exists to surface.
                          missed && "border-watch/30 bg-watch/5",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-snug text-ink-50">
                              <Term k={b.key}>{b.name}</Term>
                            </p>
                            <p className="stat-mono mt-1.5 text-2xl font-semibold text-ink-50">
                              {b.value}
                              <span className="ml-1.5 text-xs font-normal text-ink-500">{b.unit}</span>
                            </p>
                          </div>
                          <Badge tone={READING[r].tone}>{READING[r].label}</Badge>
                        </div>

                        <RangeBar b={b} />

                        {missed && (
                          <p className="mt-3 text-[12px] leading-relaxed text-watch">
                            Normal by the lab&rsquo;s standard, outside where we aim. Tracked, not chased.
                          </p>
                        )}

                        {prev && (
                          <p className="mt-3 text-[12px] leading-relaxed text-ink-500">
                            Last panel{" "}
                            <span className="stat-mono text-ink-400">
                              {prev.value} {b.unit}
                            </span>{" "}
                            —{" "}
                            {b.value === prev.value
                              ? "unchanged"
                              : `${b.value > prev.value ? "up" : "down"} since ${formatDate(prev.date)}`}
                          </p>
                        )}
                      </div>
                    </StaggerItem>
                  );
                })}
              </Stagger>
            </CardContent>
          </Card>
        ))}
      </SwitchView>

      <p className="pb-2 text-[13px] leading-relaxed text-ink-500">
        These are your results, not advice. Anything on this page is worth raising at your next visit — and if
        something changes before then, message your coach rather than waiting.
      </p>
    </div>
  );
}
