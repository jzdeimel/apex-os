"use client";

/**
 * My Labs — the member's own results, in language a member can use.
 *
 * The deliberate translation layer here is the whole design. `optimal | watch |
 * low | high` are internal clinical states; a member reading "high" next to
 * their name at 11pm on a Sunday learns nothing except that they should panic.
 * Apex maps those four states onto three things a member can actually do
 * something with: it's fine, keep an eye on it, or bring it up with us.
 *
 * The raw number, unit and range are all still shown. This is translation, not
 * concealment — hiding the value would just recreate the opacity we are
 * replacing.
 */

import { useMemo, useState } from "react";
import { getLabsForClient } from "@/lib/mock/labs";
import type { Biomarker, BiomarkerStatus } from "@/lib/types";
import { staffMap } from "@/lib/mock/staff";
import { Card, CardContent, Badge, EmptyState } from "@/components/ui/primitives";
import { Tabs } from "@/components/ui/Tabs";
import { Stagger, StaggerItem, SwitchView } from "@/components/motion";
import { formatDate, clamp, cn } from "@/lib/utils";
import { ME, me, PortalPageHeader } from "@/components/portal/PortalHeader";
import { FlaskConical, Info } from "lucide-react";

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

/**
 * Plain-English explainer per marker group. Written to answer "why do you even
 * measure this", not to restate the panel name in longer words.
 */
const GROUP_COPY: Record<string, { title: string; why: string }> = {
  Hormones: {
    title: "Hormones",
    why: "These set your energy, drive, recovery and how easily you hold muscle. They are the markers most likely to explain how you actually feel day to day.",
  },
  Metabolic: {
    title: "Blood sugar & metabolism",
    why: "How well your body handles fuel. These move earlier than weight does, which is why we watch them closely when fat loss is the goal.",
  },
  Lipids: {
    title: "Cholesterol",
    why: "Long-horizon cardiovascular markers. They rarely need anything urgent, and they respond well to the nutrition side of your plan.",
  },
  Inflammation: {
    title: "Inflammation",
    why: "A background noise level for the whole body. Raised numbers here often track with poor sleep, hard training weeks or a recent illness.",
  },
  Thyroid: {
    title: "Thyroid",
    why: "Your metabolic thermostat. Low output shows up as cold hands, flat energy and stubborn weight even when everything else is right.",
  },
  Nutrients: {
    title: "Vitamins & minerals",
    why: "The easiest wins on any panel. These are usually fixable with food or a supplement rather than anything prescribed.",
  },
  Organ: {
    title: "Liver & kidneys",
    why: "Safety monitoring. We recheck these on schedule so anything on your protocol stays comfortably clear of your organs.",
  },
  Blood: {
    title: "Blood counts",
    why: "Oxygen carrying and blood thickness. On hormone therapy this is the number we re-check most often.",
  },
  Prostate: {
    title: "Prostate",
    why: "Routine age-appropriate screening, tracked alongside your hormone markers.",
  },
};

const GROUP_ORDER = [
  "Hormones",
  "Metabolic",
  "Thyroid",
  "Inflammation",
  "Nutrients",
  "Lipids",
  "Organ",
  "Blood",
  "Prostate",
];

/**
 * Range bar.
 *
 * Scaled to the lab reference range with a little padding so an out-of-range
 * value still lands on the track instead of falling off the end. The optimal
 * window is drawn as a distinct band, because "normal" and "where we want you"
 * being different things is the single most useful idea on this page.
 */
function RangeBar({ b }: { b: Biomarker }) {
  const pad = (b.refHigh - b.refLow) * 0.22 || 1;
  const lo = b.refLow - pad;
  const hi = b.refHigh + pad;
  const pct = (v: number) => clamp(((v - lo) / (hi - lo)) * 100, 0, 100);

  const optLow = b.optimalLow ?? b.refLow;
  const optHigh = b.optimalHigh ?? b.refHigh;

  return (
    <div className="mt-2">
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-ink-800">
        {/* lab reference range */}
        <span
          className="absolute inset-y-0 bg-ink-700"
          style={{ left: `${pct(b.refLow)}%`, width: `${pct(b.refHigh) - pct(b.refLow)}%` }}
        />
        {/* the tighter window the plan actually targets */}
        <span
          className="absolute inset-y-0 bg-optimal/40"
          style={{ left: `${pct(optLow)}%`, width: `${Math.max(pct(optHigh) - pct(optLow), 1.5)}%` }}
        />
      </div>
      {/* the member's value */}
      <div className="relative h-0">
        <span
          className="absolute -top-[13px] h-4 w-[3px] -translate-x-1/2 rounded-full bg-ink-50 shadow-[0_0_0_2px_rgba(0,0,0,0.55)]"
          style={{ left: `${pct(b.value)}%` }}
          aria-hidden
        />
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-ink-600">
        <span className="stat-mono">{b.refLow}</span>
        <span className="text-optimal">where we aim</span>
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
    const map = new Map<string, Biomarker[]>();
    for (const b of labs?.biomarkers ?? []) {
      if (!map.has(b.category)) map.set(b.category, []);
      map.get(b.category)!.push(b);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, markers: map.get(g)! }));
  }, [labs]);

  const counts = useMemo(() => {
    const c = { "in-range": 0, watching: 0, discuss: 0 } as Record<MemberReading, number>;
    for (const b of labs?.biomarkers ?? []) c[readingFor(b.status)]++;
    return c;
  }, [labs]);

  if (!labs) {
    return (
      <div className="space-y-6">
        <PortalPageHeader
          eyebrow="My labs"
          title="Your results"
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

  const shown = group === "all" ? grouped : grouped.filter((g) => g.group === group);

  return (
    <div className="space-y-6">
      <PortalPageHeader
        eyebrow="My labs"
        title="Your results"
        subtitle={`All ${labs.biomarkers.length} markers from your ${formatDate(labs.collectedOn)} panel — the same numbers your care team is reading.`}
      />

      {/* Summary counts ------------------------------------------------------ */}
      <div className="grid gap-3 sm:grid-cols-3">
        {(Object.keys(READING) as MemberReading[]).map((k) => (
          <Card key={k}>
            <CardContent className="p-4">
              <div className="flex items-baseline justify-between gap-2">
                <Badge tone={READING[k].tone}>{READING[k].label}</Badge>
                <span className="stat-mono text-2xl font-semibold text-ink-50">{counts[k]}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-400">{READING[k].blurb}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-optimal/20 bg-optimal/5 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-optimal" />
        <p className="text-xs leading-relaxed text-ink-300">
          Two ranges matter on every line below. The grey band is what the lab calls normal for the general
          population. The green band is the tighter window your plan is aiming at — being inside the grey but
          outside the green is common, and it is not something to worry about on your own.{" "}
          {provider?.name} reviewed this panel on {formatDate(labs.resultedOn)}.
        </p>
      </div>

      {/* Group filter -------------------------------------------------------- */}
      <Tabs
        tabs={[
          { id: "all", label: "Everything", count: labs.biomarkers.length },
          ...grouped.map((g) => ({
            id: g.group,
            label: GROUP_COPY[g.group]?.title ?? g.group,
            count: g.markers.length,
          })),
        ]}
        active={group}
        onChange={setGroup}
      />

      <SwitchView k={group} className="space-y-4">
        {shown.map(({ group: g, markers }) => (
          <Card key={g}>
            <CardContent className="p-5">
              <h2 className="font-display text-base font-semibold text-ink-50">
                {GROUP_COPY[g]?.title ?? g}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-400">
                {GROUP_COPY[g]?.why ?? "Part of your standard panel."}
              </p>

              <Stagger className="mt-4 grid gap-3 md:grid-cols-2">
                {markers.map((b) => {
                  const r = readingFor(b.status);
                  return (
                    <StaggerItem key={b.key}>
                      <div className="hairline h-full rounded-xl bg-ink-900/50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink-50">{b.name}</p>
                            <p className="stat-mono mt-1 text-xl font-semibold text-ink-50">
                              {b.value}
                              <span className="ml-1 text-xs font-normal text-ink-500">{b.unit}</span>
                            </p>
                          </div>
                          <Badge tone={READING[r].tone}>{READING[r].label}</Badge>
                        </div>

                        <RangeBar b={b} />

                        {b.history && b.history.length > 1 && (
                          <p className="mt-3 text-[11px] text-ink-500">
                            Last panel:{" "}
                            <span className="stat-mono text-ink-400">
                              {b.history[b.history.length - 2].value} {b.unit}
                            </span>{" "}
                            <span
                              className={cn(
                                b.value === b.history[b.history.length - 2].value
                                  ? "text-ink-500"
                                  : "text-ink-400",
                              )}
                            >
                              (
                              {b.value > b.history[b.history.length - 2].value ? "up" : "down"} since{" "}
                              {formatDate(b.history[b.history.length - 2].date)})
                            </span>
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

      <p className="text-[11px] leading-relaxed text-ink-500">
        These are your results, not advice. Anything on this page is worth raising at your next visit — and if
        something changes before then, message your coach rather than waiting.
      </p>
    </div>
  );
}
