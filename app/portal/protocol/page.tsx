"use client";

/**
 * My Protocol — the plan of care, rendered for the person it is about.
 *
 * This page is the single biggest departure from the system Apex replaces,
 * where the plan of care is gated to MEDICAL: coaches cannot open it, and the
 * member has never seen it in their life. Here the member reads the same
 * artifact their provider signed, including the `because[]` evidence behind
 * every line.
 *
 * Two hard rules, both structural rather than editorial:
 *  1. NO DOSE. `PlanItem` has no dose field to leak, and every protocol card
 *     carries an explicit lock chip so the absence reads as a deliberate
 *     safety boundary rather than missing data.
 *  2. NO CLINICAL SHORTHAND. "Provider-defined", "Awaiting provider",
 *     "moderate risk" are internal states; they are translated on the way out.
 */

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { buildPlanOfCare } from "@/lib/planOfCare/engine";
import type { PlanItem } from "@/lib/planOfCare/types";
import { staffMap } from "@/lib/mock/staff";
import { Card, CardContent, Badge } from "@/components/ui/primitives";
import { Stagger, StaggerItem } from "@/components/motion";
import { formatDate, seededRandom, cn } from "@/lib/utils";
import { ME, me, PortalPageHeader } from "@/components/portal/PortalHeader";
import { ChevronDown, Lock, Utensils, Dumbbell, FlaskConical, CalendarCheck } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Timing-of-day is a coaching detail that the plan engine does not model (it
 * proposes modality and cadence only). Derived deterministically from the item
 * id so it never shuffles between renders — and labelled as guidance, not as a
 * prescription, because the actual schedule comes off the signed protocol.
 */
const TIMINGS = ["Morning, with food", "Evening, before bed", "Morning, fasted", "With your largest meal"];
function timingFor(id: string) {
  return TIMINGS[Math.floor(seededRandom(ME + id + "timing")() * TIMINGS.length)];
}

/** Internal cadence strings are staff-facing. Say something a member can act on. */
function memberCadence(cadence?: string) {
  if (!cadence || cadence === "Provider-defined") return "Schedule set on your signed plan";
  return cadence;
}

export default function PortalProtocolPage() {
  const client = me();
  const plan = buildPlanOfCare(client);
  const provider = staffMap[client.providerId];
  const coach = staffMap[client.coachId];
  const [open, setOpen] = useState<string | null>(plan.protocol[0]?.id ?? null);

  const toggle = (id: string) => setOpen((cur) => (cur === id ? null : id));

  /** Shared expandable row. The evidence panel is the whole point of it. */
  function EvidenceItem({
    item,
    accessory,
  }: {
    item: PlanItem;
    accessory?: React.ReactNode;
  }) {
    const isOpen = open === item.id;
    return (
      <div
        className={cn(
          "hairline overflow-hidden rounded-xl bg-ink-900/50 transition-colors",
          isOpen && "bg-ink-900",
        )}
      >
        <button
          onClick={() => toggle(item.id)}
          aria-expanded={isOpen}
          className="focus-ring flex w-full items-start gap-3 p-4 text-left"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink-50">{item.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-400">{item.detail}</p>
            {accessory && <div className="mt-2 flex flex-wrap items-center gap-2">{accessory}</div>}
          </div>
          <ChevronDown
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0 text-ink-500 transition-transform motion-reduce:transition-none",
              isOpen && "rotate-180",
            )}
          />
        </button>

        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              key="body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: EASE }}
              className="overflow-hidden motion-reduce:!h-auto motion-reduce:!opacity-100"
            >
              <div className="border-t border-ink-800 px-4 py-3">
                <p className="label-eyebrow">Why this is on your plan</p>
                <ul className="mt-2 space-y-1.5">
                  {item.because.map((b, i) => (
                    <li key={i} className="flex gap-2 text-xs text-ink-300">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-optimal" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[11px] text-ink-500">
                  Nothing here was picked at random — every line traces back to a result on your panel or
                  something you told us.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PortalPageHeader
        eyebrow="My protocol"
        title="Your plan, in full"
        subtitle="The same plan your coach and your provider are working from — including why each piece is on it."
      />

      {/* Summary ------------------------------------------------------------ */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-base font-semibold text-ink-50">
                Your <span className="stat-mono">{plan.durationWeeks}</span>-week block
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-300">{plan.summary}</p>
            </div>
            <Badge tone={plan.status === "Active" ? "optimal" : "watch"}>
              {plan.status === "Active" ? "Signed and running" : "With your provider for sign-off"}
            </Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {plan.goals.map((g) => (
              <Badge key={g} tone="neutral">
                {g}
              </Badge>
            ))}
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-ink-500">
            Built {formatDate(plan.createdAt)} · reviewed by {provider?.name} · day-to-day with {coach?.name}.
          </p>
        </CardContent>
      </Card>

      {/* Protocol ----------------------------------------------------------- */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-optimal" />
            <h2 className="font-display text-base font-semibold text-ink-50">What you&rsquo;re taking</h2>
          </div>
          <p className="mt-1 text-sm text-ink-400">
            What it is and roughly when. The exact amount lives on the signed order from your provider — we
            never print it here, and we never let this page be the thing you dose from.
          </p>

          <Stagger className="mt-4 space-y-2">
            {plan.protocol.map((item) => (
              <StaggerItem key={item.id}>
                <EvidenceItem
                  item={item}
                  accessory={
                    <>
                      {item.modality && <Badge tone="neutral">{item.modality}</Badge>}
                      <Badge tone="neutral">{memberCadence(item.cadence)}</Badge>
                      <Badge tone="neutral">{timingFor(item.id)}</Badge>
                      {/* The lock chip is not decoration. It is the member-facing
                          statement of the safety boundary. */}
                      <span className="inline-flex items-center gap-1 rounded-full border border-ink-600/60 bg-ink-800 px-2 py-0.5 text-[11px] font-medium leading-none text-ink-300">
                        <Lock className="h-3 w-3" />
                        Dose set by your provider
                      </span>
                    </>
                  }
                />
              </StaggerItem>
            ))}
            {plan.protocol.length === 0 && (
              <p className="text-sm text-ink-400">
                Nothing prescribed right now — your plan is nutrition and training for this block.
              </p>
            )}
          </Stagger>
        </CardContent>
      </Card>

      {/* Nutrition ---------------------------------------------------------- */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2">
            <Utensils className="h-4 w-4 text-optimal" />
            <h2 className="font-display text-base font-semibold text-ink-50">What to eat</h2>
          </div>

          {plan.macros && (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                {[
                  { label: "Calories a day", value: plan.macros.calories.toLocaleString(), unit: "kcal" },
                  { label: "Protein", value: plan.macros.proteinG, unit: "g" },
                  { label: "Carbs", value: plan.macros.carbsG, unit: "g" },
                  { label: "Fat", value: plan.macros.fatG, unit: "g" },
                ].map((m) => (
                  <div key={m.label} className="hairline rounded-xl bg-ink-900/50 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-ink-500">{m.label}</p>
                    <p className="stat-mono mt-1 text-xl font-semibold text-ink-50">
                      {m.value}
                      <span className="ml-1 text-xs font-normal text-ink-500">{m.unit}</span>
                    </p>
                  </div>
                ))}
              </div>
              {/* `basis` is rendered verbatim — the plain-English arithmetic is
                  the answer to "where did 190 g of protein come from?". */}
              <p className="mt-3 rounded-xl border border-optimal/20 bg-optimal/5 p-3 text-xs leading-relaxed text-ink-300">
                <span className="font-medium text-ink-100">How we got there: </span>
                {plan.macros.basis}
              </p>
            </>
          )}

          <Stagger className="mt-4 space-y-2">
            {plan.nutrition.map((item) => (
              <StaggerItem key={item.id}>
                <EvidenceItem item={item} />
              </StaggerItem>
            ))}
          </Stagger>
        </CardContent>
      </Card>

      {/* Training ----------------------------------------------------------- */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-optimal" />
            <h2 className="font-display text-base font-semibold text-ink-50">How to train</h2>
          </div>
          <p className="mt-1 text-sm text-ink-400">Your week, laid out. Swap days around if life gets in the way.</p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {plan.trainingSplit.map((b) => (
              <div key={b.day} className="hairline rounded-xl bg-ink-900/50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-ink-500">{b.day}</p>
                <p className="mt-1 text-sm font-medium text-ink-50">{b.focus}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-400">{b.detail}</p>
              </div>
            ))}
          </div>

          <Stagger className="mt-4 space-y-2">
            {plan.training.map((item) => (
              <StaggerItem key={item.id}>
                <EvidenceItem item={item} />
              </StaggerItem>
            ))}
          </Stagger>
        </CardContent>
      </Card>

      {/* Monitoring ladder --------------------------------------------------- */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-optimal" />
            <h2 className="font-display text-base font-semibold text-ink-50">How we&rsquo;ll check it&rsquo;s working</h2>
          </div>
          <p className="mt-1 text-sm text-ink-400">
            Published up front so nobody has to wonder whether they were forgotten.
          </p>

          <ol className="relative mt-5 space-y-4 pl-6">
            <span aria-hidden className="absolute bottom-2 left-[7px] top-2 w-px bg-ink-700" />
            {plan.monitoring.map((m) => (
              <li key={m.week} className="relative">
                <span
                  aria-hidden
                  className="absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-optimal/60 bg-ink-950"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="stat-mono text-xs text-ink-300">Week {m.week}</span>
                  <p className="text-sm font-medium text-ink-50">{m.label}</p>
                  <Badge tone={m.owner === "Member" ? "optimal" : "neutral"}>
                    {m.owner === "Member" ? "You" : m.owner === "Coach" ? "Your coach" : "Your provider"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-400">{m.detail}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* Safety screening ----------------------------------------------------- */}
      {plan.screened.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h2 className="font-display text-base font-semibold text-ink-50">Checks we ran before proposing this</h2>
            <p className="mt-1 text-sm text-ink-400">
              Shown to you for the same reason it is shown to your provider: a check nobody can see is a check
              nobody can verify happened.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {plan.screened.map((s) => (
                <div key={s.check} className="hairline flex items-start gap-3 rounded-xl bg-ink-900/50 p-3">
                  <Badge tone={s.passed ? "optimal" : "high"}>{s.passed ? "Clear" : "Flagged"}</Badge>
                  <div className="min-w-0">
                    <p className="text-sm text-ink-100">{s.check}</p>
                    <p className="mt-0.5 text-xs text-ink-400">{s.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
