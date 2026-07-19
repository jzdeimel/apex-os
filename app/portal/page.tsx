"use client";

/**
 * Member home — 6am, on a phone, before the gym.
 *
 * The question this screen answers is not "what is my clinical state", it is
 * "what do I do today, am I on track, and who do I call if I'm worried". So the
 * screen is ruthlessly reduced to four things, in this order:
 *
 *   1. TODAY      — <DailyRings/>, untouched. The reason to open the app at all.
 *   2. WHERE I AM — the clinic's own four-step journey, not our ClientStatus.
 *   3. WHAT'S NEXT— the next visit, the next checkpoints, the order in transit.
 *   4. MY PEOPLE  — named humans and a way to reach them.
 *
 * Everything else that used to live here (the Alpha Score domain breakdown,
 * the five-stage order timeline, the three-message inbox preview) has been
 * demoted rather than deleted: the score lives on Progress where it is read
 * alongside its trend, the order collapses to a one-line status with the full
 * timeline still reachable, and messages collapse to the latest reply. A member
 * abandons dense navigation; nothing here is lost, it is just not all shouted
 * at once.
 */

import Link from "next/link";
import { buildPlanOfCare } from "@/lib/planOfCare/engine";
import { staffMap } from "@/lib/mock/staff";
import { locationName } from "@/lib/mock/locations";
import { membershipForClient } from "@/lib/mock/memberships";
import { appointmentsForClient } from "@/lib/mock/appointments";
import { JOURNEY, journeyStepFor } from "@/lib/brand";
import { Card, CardContent, Badge } from "@/components/ui/primitives";
import { Stagger, StaggerItem, FadeIn } from "@/components/motion";
import { usePortal } from "@/lib/portalStore";
import { cn, formatDate, formatDateTime, formatTime, relativeDays } from "@/lib/utils";
import { ME, me, MEMBER_THREAD } from "@/components/portal/PortalHeader";
import { DailyRings } from "@/components/portal/DailyRings";
import {
  ArrowRight,
  Check,
  MapPin,
  MessageSquare,
  Truck,
  ShieldCheck,
} from "lucide-react";

/**
 * The pinned demo clock. Every "now" in the portal comes from here — never
 * `new Date()` with no argument — so a screenshot taken today and one taken
 * next year are identical.
 */
const NOW = "2026-06-12T09:00:00";

/**
 * Order lifecycle.
 *
 * The live system stops at "has a tracking number" and renders "Shipped"
 * forever, discarding the carrier status it already fetched. Apex keeps the
 * full ordered lifecycle with real timestamps — but a member on their phone
 * only needs the current rung and the ETA, so the home screen renders the
 * stages as a five-segment bar and puts the labelled history behind a tap.
 */
const ORDER_STAGES: { key: string; label: string; at?: string }[] = [
  { key: "placed", label: "Ordered", at: "2026-06-06T10:14:00" },
  { key: "filled", label: "Filled by pharmacy", at: "2026-06-08T15:40:00" },
  { key: "shipped", label: "Shipped", at: "2026-06-09T09:02:00" },
  { key: "out", label: "Out for delivery", at: "2026-06-12T07:31:00" },
  { key: "delivered", label: "Delivered" },
];
const CURRENT_STAGE = 3; // index into ORDER_STAGES — out for delivery

export default function PortalHomePage() {
  const { portal } = usePortal();
  const client = me();
  const plan = buildPlanOfCare(client);
  const membership = membershipForClient(ME);
  const coach = staffMap[client.coachId];
  const provider = staffMap[client.providerId];
  const activeProgram = client.programs.find((p) => p.status === "Active") ?? client.programs[0];

  const nextAppt = appointmentsForClient(ME).find((a) => a.start >= NOW);

  // Where the member is in ALPHA HEALTH's published four-step process. This is
  // deliberately not `client.status` — "Active Protocol" is our enum, not a
  // sentence anyone has ever said to a patient.
  const journeyNow = journeyStepFor(client.status);

  // Monitoring checkpoints are keyed to weeks-since-plan-start; we surface the
  // ones the member has not reached yet. Week 0 drops off on its own once the
  // plan is running, so it never needs special-casing.
  const weeksIn = Math.floor(
    (new Date(NOW).getTime() - new Date(activeProgram?.startedOn ?? client.joinedOn).getTime()) /
      (1000 * 60 * 60 * 24 * 7),
  );
  const upcoming = plan.monitoring.filter((m) => m.week > weeksIn).slice(0, 3);

  // One message, not three. The preview exists to say "someone replied", and
  // the thread is one tap away for anyone who wants more than that.
  const latestMessage = [...MEMBER_THREAD].reverse()[0];

  const orderStage = ORDER_STAGES[CURRENT_STAGE];

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------------------ */}
      {/* 1 · Greeting — one line, no metrics. The rings below are the data.  */}
      {/* ------------------------------------------------------------------ */}
      <FadeIn>
        <div
          className={cn(
            "relative overflow-hidden rounded-3xl border border-ink-700/70 bg-ink-850 px-5 py-7 sm:px-7 sm:py-9",
            "bg-gradient-to-br",
            portal.accent.gradient,
          )}
        >
          <p className="label-eyebrow">{formatDate(NOW)}</p>
          <h1 className="mt-2 font-display text-[2rem] font-semibold leading-[1.05] tracking-tight text-ink-50 sm:text-5xl">
            Good morning,
            <br />
            {client.firstName}.
          </h1>
          <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-ink-300">
            You&rsquo;re <span className="stat-mono text-ink-100">{Math.min(weeksIn, plan.durationWeeks)}</span>{" "}
            weeks into a <span className="stat-mono text-ink-100">{plan.durationWeeks}</span>-week block. Close
            your three rings and the day counts — that&rsquo;s the whole job.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {activeProgram && (
              <Badge tone="optimal">
                {activeProgram.name} · since {formatDate(activeProgram.startedOn)}
              </Badge>
            )}
            {membership && <Badge tone="gold">{membership.tier}</Badge>}
            <Badge tone="neutral">
              <MapPin className="h-3 w-3" />
              {locationName(client.locationId)}
            </Badge>
          </div>
        </div>
      </FadeIn>

      {/* ------------------------------------------------------------------ */}
      {/* 2 · Today. The centrepiece — everything else orbits it.             */}
      {/* ------------------------------------------------------------------ */}
      <DailyRings clientId={ME} />

      {/* ------------------------------------------------------------------ */}
      {/* 3 · Where I am — the clinic's four steps, not our state machine.    */}
      {/* ------------------------------------------------------------------ */}
      <FadeIn>
        <Card>
          <CardContent className="p-5 sm:p-6">
            <p className="label-eyebrow">Where you are</p>
            <h2 className="mt-2 font-display text-xl font-semibold text-ink-50">
              Step <span className="stat-mono">{journeyNow.step}</span> of{" "}
              <span className="stat-mono">{JOURNEY.length}</span> — {journeyNow.title}
            </h2>
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-400">{journeyNow.detail}</p>

            {/* Segment rail. Four short bars read as progress on a 390px
                screen where four labelled nodes would wrap into mush; the
                labels sit underneath in a single row of small caps. */}
            <ol className="mt-5 flex gap-1.5" aria-label="Your progress through Alpha Health's four steps">
              {JOURNEY.map((j) => {
                const done = j.step < journeyNow.step;
                const current = j.step === journeyNow.step;
                return (
                  <li key={j.step} className="min-w-0 flex-1">
                    <span
                      aria-hidden
                      className={cn(
                        "block h-1.5 rounded-full",
                        done && "bg-optimal/60",
                        current && "bg-optimal",
                        !done && !current && "bg-ink-700",
                      )}
                    />
                    <span
                      className={cn(
                        "mt-2 block truncate text-[10px] uppercase tracking-wide",
                        done || current ? "text-ink-300" : "text-ink-600",
                      )}
                    >
                      {/* First word only — "Free", "Testing", "Clinician-led",
                          "Coaching" — so nothing wraps at 390px. */}
                      {j.title.split(" ")[0]}
                      {done && <Check className="ml-1 inline h-3 w-3 text-optimal" />}
                    </span>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      </FadeIn>

      {/* ------------------------------------------------------------------ */}
      {/* 4 · What's next — the visit, then the checkpoints.                  */}
      {/* ------------------------------------------------------------------ */}
      <FadeIn>
        <Card>
          <CardContent className="p-5 sm:p-6">
            <p className="label-eyebrow">Your next visit</p>
            {nextAppt ? (
              <>
                <p className="mt-2 font-display text-2xl font-semibold leading-tight text-ink-50 sm:text-3xl">
                  {formatDate(nextAppt.start)}
                  <span className="stat-mono ml-2 text-lg text-ink-300 sm:text-xl">
                    {formatTime(nextAppt.start)}
                  </span>
                </p>
                <p className="mt-2 text-sm text-ink-400">
                  {nextAppt.type} with {staffMap[nextAppt.staffId]?.name} ·{" "}
                  <span className="stat-mono">{nextAppt.durationMin}</span> min ·{" "}
                  {locationName(nextAppt.locationId)}
                </p>
                <div className="mt-3">
                  <Badge tone="optimal">{relativeDays(nextAppt.start)}</Badge>
                </div>
                <p className="mt-4 text-[13px] leading-relaxed text-ink-500">
                  You mentioned sleep on the 10th. It&rsquo;s already attached to this visit, so you won&rsquo;t
                  have to bring it up cold.
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-400">
                Nothing on the calendar yet. Message your coach and they&rsquo;ll book it.
              </p>
            )}

            {upcoming.length > 0 && (
              <div className="mt-6 border-t border-ink-800 pt-5">
                <p className="label-eyebrow">Then</p>
                <Stagger className="mt-3 space-y-2">
                  {upcoming.map((m) => (
                    <StaggerItem key={m.week}>
                      <div className="hairline flex items-start gap-3 rounded-xl bg-ink-900/50 p-3.5">
                        <span className="stat-mono mt-0.5 shrink-0 rounded-md border border-ink-700 bg-ink-850 px-2 py-1 text-[11px] text-ink-300">
                          wk {m.week}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink-50">{m.label}</p>
                          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-400">{m.detail}</p>
                        </div>
                        {/* Owner is the anxiety-reducer: "you" vs "us" answers
                            "is someone waiting on me?" without being asked. */}
                        <Badge tone={m.owner === "Member" ? "optimal" : "neutral"}>
                          {m.owner === "Member" ? "You" : m.owner === "Coach" ? "Coach" : "Provider"}
                        </Badge>
                      </div>
                    </StaggerItem>
                  ))}
                </Stagger>
              </div>
            )}
          </CardContent>
        </Card>
      </FadeIn>

      {/* ------------------------------------------------------------------ */}
      {/* 5 · Your order — one line and a rail. Details on demand.            */}
      {/* ------------------------------------------------------------------ */}
      <FadeIn>
        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-optimal/12 text-optimal">
                <Truck className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-medium text-ink-50">Your refill arrives today</p>
                <p className="mt-0.5 text-[13px] text-ink-400">
                  <span className="stat-mono">2</span> items · out for delivery since{" "}
                  <span className="stat-mono">{formatTime(orderStage.at)}</span>
                </p>
              </div>
            </div>

            {/* Five segments, one per lifecycle stage. The labels are in the
                title attribute and the summary line rather than printed five
                times across a 390px viewport. */}
            <ol className="mt-4 flex gap-1.5">
              {ORDER_STAGES.map((stage, i) => (
                <li key={stage.key} className="min-w-0 flex-1">
                  <span
                    title={stage.at ? `${stage.label} · ${formatDateTime(stage.at)}` : `${stage.label} · expected today`}
                    className={cn(
                      "block h-1.5 rounded-full",
                      i < CURRENT_STAGE && "bg-optimal/60",
                      i === CURRENT_STAGE && "bg-optimal",
                      i > CURRENT_STAGE && "bg-ink-700",
                    )}
                  />
                </li>
              ))}
            </ol>

            <details className="group mt-4">
              <summary className="focus-ring inline-flex cursor-pointer list-none items-center gap-1 rounded-md text-[13px] text-ink-400 hover:text-ink-100">
                Full tracking
                <ArrowRight className="h-3 w-3 transition-transform group-open:rotate-90" />
              </summary>
              <div className="mt-3 space-y-2">
                {ORDER_STAGES.map((stage, i) => (
                  <div key={stage.key} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className={i <= CURRENT_STAGE ? "text-ink-200" : "text-ink-600"}>{stage.label}</span>
                    <span className="stat-mono shrink-0 text-xs text-ink-500">
                      {stage.at ? formatDateTime(stage.at) : "Expected today"}
                    </span>
                  </div>
                ))}
                <p className="stat-mono pt-1 text-xs text-ink-500">1Z999AA10123456784</p>
                <p className="text-[12px] leading-relaxed text-ink-500">
                  This updates itself from the carrier. Nobody at the clinic has to look it up and text it to
                  you.
                </p>
              </div>
            </details>
          </CardContent>
        </Card>
      </FadeIn>

      {/* ------------------------------------------------------------------ */}
      {/* 6 · My people. Named humans, one tap to reach them.                 */}
      {/* ------------------------------------------------------------------ */}
      <FadeIn>
        <Card>
          <CardContent className="p-5 sm:p-6">
            <p className="label-eyebrow">Your people</p>
            <h2 className="mt-2 font-display text-xl font-semibold text-ink-50">
              Two humans, and they both know your name
            </h2>

            <div className="mt-4 space-y-2.5">
              {[
                { s: coach, what: "Your coach", blurb: "Day to day — food, training, check-ins." },
                { s: provider, what: "Your provider", blurb: "Sets and signs anything medical." },
              ].map(({ s, what, blurb }) => (
                <div key={what} className="hairline flex items-start gap-3.5 rounded-2xl bg-ink-900/50 p-4">
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-semibold text-ink-950"
                    style={{ background: portal.accent.hex }}
                  >
                    {s?.avatarInitials}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-medium text-ink-50">{s?.name}</p>
                    <p className="text-[11px] uppercase tracking-wide text-ink-500">
                      {what} · {s?.credentials}
                    </p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink-400">{blurb}</p>
                  </div>
                </div>
              ))}
            </div>

            <Link
              href="/portal/messages"
              className="focus-ring mt-4 flex items-center gap-3 rounded-2xl border border-optimal/25 bg-optimal/10 p-4 hover:bg-optimal/15"
            >
              <MessageSquare className="h-5 w-5 shrink-0 text-optimal" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink-100">Message your team</span>
                {latestMessage && (
                  <span className="mt-0.5 line-clamp-1 block text-[13px] text-ink-400">
                    {latestMessage.who === "me" ? "You" : latestMessage.from}: {latestMessage.body}
                  </span>
                )}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-optimal" />
            </Link>

            <Link
              href="/portal/access"
              className="focus-ring mt-2 flex items-center gap-2 rounded-xl p-2 text-[13px] text-ink-500 hover:text-ink-200"
            >
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>Every look at your chart is logged — name, time and reason.</span>
              <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0" />
            </Link>
          </CardContent>
        </Card>
      </FadeIn>

      <p className="pb-2 text-center text-[11px] text-ink-600">Demonstration data.</p>
    </div>
  );
}
