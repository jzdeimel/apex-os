"use client";

/**
 * My Plan — "what I'm on, and why".
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
 *
 * The redesign turns each protocol item into the four things a member at 6am
 * actually needs — WHAT it is, WHEN to take it, HOW it goes in, and WHY it's on
 * the list — with the why one tap away rather than absent. Layout is a single
 * column at 390px throughout; multi-column grids only appear from `sm` up.
 */

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { buildPlanOfCare } from "@/lib/planOfCare/engine";
import { memberSummary } from "@/lib/planOfCare/memberVoice";
import { whyThisAll, whyOpenedEvent } from "@/lib/member/whyThis";
import { WhyThisPanel } from "@/components/portal/WhyThisPanel";
import { appendLedger } from "@/lib/trace/ledger";
import type { PlanItem } from "@/lib/planOfCare/types";
import { staffMap } from "@/lib/mock/staff";
import { Card, CardContent, Badge } from "@/components/ui/primitives";
import { Stagger, StaggerItem } from "@/components/portal/still";
import { formatDate, cn } from "@/lib/utils";
import { useMeClient, PortalPageHeader } from "@/components/portal/PortalHeader";
import { MyLevelNow } from "@/components/portal/MyLevelNow";
import { InjectionSiteMap } from "@/components/portal/InjectionSiteMap";
import { ReconstitutionCalculator } from "@/components/portal/ReconstitutionCalculator";
import { ChevronDown, Lock, Utensils, Dumbbell, FlaskConical, CalendarCheck, ShieldCheck } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Timing-of-day is a coaching detail that the plan engine does not model (it
 * REMOVED: a `timingFor()` helper used to pick "Morning, with food" / "Evening,
 * before bed" from a hash of the item id and render it under the label "When".
 *
 * That was invented clinical guidance. Deterministic is not the same as true —
 * a member reading "Evening, before bed" at 6am has no way to know the app made
 * it up, and it sat directly above the lock chip whose entire job is to signal
 * that we are careful with clinical detail. Fabricating a value next to that
 * badge borrows credibility the value has not earned.
 *
 * If timing is ever shown here it must come from the signed prescription, not
 * from this file.
 */

/** Internal cadence strings are staff-facing. Say something a member can act on. */
function memberCadence(cadence?: string) {
  if (!cadence || cadence === "Provider-defined") return "Schedule set on your signed plan";
  return cadence;
}

/**
 * `PlanItem.modality` is the CANDIDATE'S NAME, not a route.
 *
 * The engine sets it from `r.candidates[0]?.name` — "BPC-157", "Semaglutide",
 * "Nutrition coaching". Labelling that "How" produced the nonsense fact
 * `How: BPC-157`. It is a *what*, so it is labelled What, and the route is
 * simply not claimed because nothing in the plan model carries one.
 */
function memberWhat(modality?: string) {
  return modality ?? null;
}

/** A small labelled fact. Used for the what/when/how row on every item. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-micro uppercase tracking-wide text-ink-600">{label}</p>
      <p className="mt-0.5 text-detail leading-snug text-ink-200">{value}</p>
    </div>
  );
}

export default function PortalProtocolPage() {
  // Audit fix (GAP_ANALYSIS.md, "Portal renderable as a woman"): this was the
  // module constant ME, which pinned the portal to one male member.
  const client = useMeClient();
  // Pinned demo clock, matching the portal layout provider.
  const PROTOCOL_NOW = "2026-06-12T09:00:00";
  const plan = buildPlanOfCare(client);
  const provider = staffMap[client.providerId];
  const coach = staffMap[client.coachId];
  const [open, setOpen] = useState<string | null>(plan.protocol[0]?.id ?? null);

  /**
   * The traceback for every item, computed once.
   *
   * Per-item would recompute the consult and lab joins on every expand; the
   * whole plan is a dozen items and the joins are pure, so one memo is both
   * cheaper and keeps the panel a dumb renderer.
   */
  const why = useMemo(() => whyThisAll(client, plan), [client, plan]);

  const totalProtocol = plan.protocol.length;
  const signedOff = plan.protocol.filter((i) => why[i.id]?.signoff.state === "signed-off").length;

  /**
   * Opening the reasoning is a read of the member's own chart, and reads are
   * first-class events in this ledger. Appended from the handler rather than
   * from render — an append during render would mutate the hash chain on every
   * re-render and desync the server and client copies of it.
   */
  const toggle = (id: string, item: PlanItem) =>
    setOpen((cur) => {
      if (cur === id) return null;
      appendLedger(whyOpenedEvent(client, item));
      return id;
    });

  /**
   * Shared expandable row. The evidence panel is the whole point of it: a
   * member who can see *why* a thing is on their list is a member who takes it.
   */
  function EvidenceItem({ item, facts }: { item: PlanItem; facts?: React.ReactNode }) {
    const isOpen = open === item.id;
    return (
      <div
        className={cn(
          "hairline overflow-hidden rounded-panel bg-ink-900/50 transition-colors",
          isOpen && "bg-ink-900",
        )}
      >
        <button
          onClick={() => toggle(item.id, item)}
          aria-expanded={isOpen}
          className="focus-ring flex w-full items-start gap-3 p-4 text-left sm:p-5"
        >
          <div className="min-w-0 flex-1">
            <p className="text-body font-medium leading-snug text-ink-50">{item.title}</p>
            <p className="mt-1.5 text-detail leading-relaxed text-ink-400">{memberSummary(item)}</p>
            {facts}
          </div>
          <ChevronDown
            className={cn(
              "mt-1 h-4 w-4 shrink-0 text-ink-500 transition-transform motion-reduce:transition-none",
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
              <div className="border-t border-ink-800 px-4 py-4 sm:px-5">
                {/* The panel does the whole job now — reasons, the panel and
                    day each number came off, the conversation it was raised
                    in, the rule that fired and who signed it. The old block
                    here rendered `because[]` and a claim that "every line
                    traces back" to something; the claim is now the render
                    rather than a sentence underneath it, and where it does not
                    hold the panel says so. */}
                <WhyThisPanel why={why[item.id]} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    /**
     * space-y-12 between sections, space-y-2.5 between the rows inside one.
     *
     * Every section on this page used to be a Card wrapping a stack of already
     * bordered rows — a box around boxes — separated from the next Card by the
     * same 32px that separated the rows inside it. The Cards are gone: the only
     * boxed thing left is the summary at the top (which is genuinely the one
     * dominant element) and the individual expandable rows. Grouping is now
     * done with space and headings, which is what a designed page does.
     */
    <div className="space-y-12">
      <PortalPageHeader
        eyebrow="Your plan"
        title="What you're on, and why"
        subtitle="The same plan your coach and your provider are working from — including the reason behind every single line of it."
      />

      {/* Summary ------------------------------------------------------------ */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="font-display text-title font-semibold text-ink-50">
              Your <span className="stat-mono">{plan.durationWeeks}</span>-week block
            </h2>
            {/* Derived from the ITEMS, not from `plan.status`.

                The engine sets `plan.status` to "Awaiting provider" whenever
                there is any protocol at all, regardless of what has actually
                been signed. That was survivable while this page said nothing
                about individual sign-offs — it is not now, because the
                traceback panel reads each item's real approval state and a
                member was being shown "with your provider for sign-off" at the
                top and "Dr Vale has approved this" three inches below it. The
                per-item state is the true one, so the header defers to it. */}
            <Badge tone={signedOff === totalProtocol && totalProtocol > 0 ? "optimal" : "watch"}>
              {totalProtocol === 0
                ? "Nutrition and training this block"
                : signedOff === totalProtocol
                  ? "Signed and running"
                  : signedOff === 0
                    ? "With your provider for sign-off"
                    : `${signedOff} of ${totalProtocol} signed off`}
            </Badge>
          </div>
          <p className="mt-3 max-w-prose text-body leading-relaxed text-ink-300">{plan.summary}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {plan.goals.map((g) => (
              <Badge key={g} tone="neutral">
                {g}
              </Badge>
            ))}
          </div>
          <p className="mt-4 text-micro leading-relaxed text-ink-500">
            Built {formatDate(plan.createdAt)} · reviewed by {provider?.name} · day-to-day with {coach?.name}.
          </p>
        </CardContent>
      </Card>

      {/* Protocol ----------------------------------------------------------- */}
      <section>
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-ink-500" />
          <h2 className="font-display text-title font-semibold text-ink-50">What to take</h2>
        </div>
        <p className="mt-2 max-w-prose text-detail leading-relaxed text-ink-400">
          What it is and roughly when. The exact amount lives on the signed order from your provider — we
          never print it here, and we never let this page be the thing you dose from.
        </p>

        <Stagger className="mt-4 space-y-2.5">
          {plan.protocol.map((item) => {
            const what = memberWhat(item.modality);
            return (
              <StaggerItem key={item.id}>
                <EvidenceItem
                  item={item}
                  facts={
                    <>
                      {/* what / when / how, as a labelled grid rather than a
                          row of undifferentiated chips — a member scanning at
                          6am needs "when" to be findable, not decoded. */}
                      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <Fact label="How often" value={memberCadence(item.cadence)} />
                        {what && <Fact label="What" value={what} />}
                      </div>
                      {/* The lock chip is not decoration. It is the member-facing
                          statement of the safety boundary. */}
                      <span className="mt-3 inline-flex items-center gap-1.5 rounded-control border border-ink-600/60 bg-ink-800 px-2.5 py-1 text-micro font-medium leading-none text-ink-300">
                        <Lock className="h-3 w-3" />
                        Amount set by {provider?.name ?? "your provider"}
                      </span>
                    </>
                  }
                />
              </StaggerItem>
            );
          })}
          {plan.protocol.length === 0 && (
            <p className="text-detail text-ink-400">
              Nothing prescribed right now — your plan is nutrition and training for this block.
            </p>
          )}
        </Stagger>
      </section>

      {/* Where your levels are now -----------------------------------------
          Personalised pharmacokinetics from the member's own logged doses. Sits
          directly under the plan summary because "what am I on" and "where is it
          in me right now" are the same question at two resolutions. Renders
          nothing when the member is on no characterised compound. */}
      <MyLevelNow clientId={client.id} iso={PROTOCOL_NOW} />

      {/* Injection-site rotation -------------------------------------------
          The other half of "where is it in me": absorption depends on WHERE the
          dose landed, not just when. Sits with the level curve because a flat
          curve and an overused site are the same story. Renders nothing for a
          member with nothing that rotates sites. */}
      <InjectionSiteMap clientId={client.id} iso={PROTOCOL_NOW} />

      {/* Mixing & draw ------------------------------------------------------
          The arithmetic between "5mg powder" and "10 units on the pin" is where
          a self-administered peptide goes ten-fold wrong. Sits with the dosing
          tools because it is a dosing tool. Renders nothing unless the member
          has something that gets reconstituted. */}
      <ReconstitutionCalculator clientId={client.id} />

      {/* Nutrition ---------------------------------------------------------- */}
      <section>
        <div className="flex items-center gap-2">
          <Utensils className="h-5 w-5 text-ink-500" />
          <h2 className="font-display text-title font-semibold text-ink-50">What to eat</h2>
        </div>

        {plan.macros && (
          <>
            <p className="mt-2 max-w-prose text-detail leading-relaxed text-ink-400">
              Hit protein first. The other three take care of themselves most days.
            </p>
            {/* 2-up at 390px, 4-up from sm. Four tiles side by side on a phone
                turns every number into two cramped lines. */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Protein a day", value: `${plan.macros.proteinG}`, unit: "g", lead: true },
                { label: "Calories a day", value: plan.macros.calories.toLocaleString(), unit: "kcal" },
                { label: "Carbs a day", value: `${plan.macros.carbsG}`, unit: "g" },
                { label: "Fat a day", value: `${plan.macros.fatG}`, unit: "g" },
              ].map((m) => (
                <div
                  key={m.label}
                  className={cn(
                    "hairline rounded-panel p-4",
                    // Protein is the one target the plan is actually built
                    // around, so it is visually first and visually louder.
                    m.lead ? "border-optimal/25 bg-optimal/8" : "bg-ink-900/50",
                  )}
                >
                  <p className="text-micro uppercase tracking-wide text-ink-500">{m.label}</p>
                  <p className="stat-mono mt-1.5 text-title font-semibold text-ink-50">
                    {m.value}
                    <span className="ml-1 text-micro font-normal text-ink-500">{m.unit}</span>
                  </p>
                </div>
              ))}
            </div>
            {/* `basis` is rendered verbatim — the plain-English arithmetic is
                the answer to "where did 190 g of protein come from?". */}
            <p className="mt-3 rounded-panel border border-optimal/20 bg-optimal/5 p-4 text-detail leading-relaxed text-ink-300">
              <span className="font-medium text-ink-100">How we got there: </span>
              {plan.macros.basis}
            </p>
          </>
        )}

        <Stagger className="mt-4 space-y-2.5">
          {plan.nutrition.map((item) => (
            <StaggerItem key={item.id}>
              <EvidenceItem item={item} />
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Training ----------------------------------------------------------- */}
      <section>
        <div className="flex items-center gap-2">
          <Dumbbell className="h-5 w-5 text-ink-500" />
          <h2 className="font-display text-title font-semibold text-ink-50">How to train</h2>
        </div>
        <p className="mt-2 max-w-prose text-detail leading-relaxed text-ink-400">
          Your week, laid out. Swap days around if life gets in the way — the order matters less than the
          total.
        </p>

        {/* A vertical list on a phone: seven training days as a grid of
            squares is a desktop idea that becomes unreadable at 390px. */}
        <div className="mt-4 space-y-2 sm:grid grid-cols-1 sm:grid-cols-2 sm:gap-2 sm:space-y-0 lg:grid-cols-4">
          {plan.trainingSplit.map((b) => (
            <div key={b.day} className="hairline rounded-panel bg-ink-900/50 p-4">
              <p className="text-micro uppercase tracking-wide text-ink-500">{b.day}</p>
              <p className="mt-1 text-body font-medium text-ink-50">{b.focus}</p>
              <p className="mt-1 text-detail leading-relaxed text-ink-400">{b.detail}</p>
            </div>
          ))}
        </div>

        <Stagger className="mt-4 space-y-2.5">
          {plan.training.map((item) => (
            <StaggerItem key={item.id}>
              <EvidenceItem item={item} />
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Monitoring ladder --------------------------------------------------- */}
      <section>
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-5 w-5 text-ink-500" />
          <h2 className="font-display text-title font-semibold text-ink-50">How we&rsquo;ll know it&rsquo;s working</h2>
        </div>
        <p className="mt-2 max-w-prose text-detail leading-relaxed text-ink-400">
          Published up front so nobody has to wonder whether they were forgotten.
        </p>

        <ol className="relative mt-5 space-y-5 pl-6">
          <span aria-hidden className="absolute bottom-2 left-[7px] top-2 w-px bg-ink-700" />
          {plan.monitoring.map((m) => (
            <li key={m.week} className="relative">
              <span
                aria-hidden
                className="absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-optimal/60 bg-ink-950"
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="stat-mono text-micro text-ink-300">Week {m.week}</span>
                <p className="text-body font-medium text-ink-50">{m.label}</p>
                <Badge tone={m.owner === "Member" ? "optimal" : "neutral"}>
                  {m.owner === "Member" ? "You" : m.owner === "Coach" ? "Your coach" : "Your provider"}
                </Badge>
              </div>
              <p className="mt-1.5 text-detail leading-relaxed text-ink-400">{m.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Safety screening ----------------------------------------------------- */}
      {plan.screened.length > 0 && (
        <section>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-ink-500" />
            <h2 className="font-display text-title font-semibold text-ink-50">Checks we ran first</h2>
          </div>
          <p className="mt-2 max-w-prose text-detail leading-relaxed text-ink-400">
            Shown to you for the same reason it is shown to your provider: a check nobody can see is a check
            nobody can verify happened.
          </p>
          <div className="mt-4 space-y-2 sm:grid grid-cols-1 sm:grid-cols-2 sm:gap-2 sm:space-y-0">
            {plan.screened.map((s) => (
              <div key={s.check} className="hairline flex items-start gap-3 rounded-panel bg-ink-900/50 p-4">
                <Badge tone={s.passed ? "optimal" : "high"}>{s.passed ? "Clear" : "Flagged"}</Badge>
                <div className="min-w-0">
                  <p className="text-detail text-ink-100">{s.check}</p>
                  <p className="mt-0.5 text-detail leading-relaxed text-ink-400">{s.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
