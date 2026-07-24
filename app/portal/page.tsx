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
import { usePortal } from "@/lib/portalStore";
import { cn, formatDate, formatDateTime, formatTime, relativeDays, absolute } from "@/lib/utils";
import { useMe, useMeClient, threadFor } from "@/components/portal/PortalHeader";
import { DailyRings } from "@/components/portal/DailyRings";
import { TodayBlock } from "@/components/portal/TodayBlock";
import { WeeklyReview } from "@/components/portal/WeeklyReview";
import { StreakCard } from "@/components/portal/StreakCard";
import { HabitDrawer } from "@/components/portal/HabitDrawer";
import { RefillRunway } from "@/components/portal/RefillRunway";
import { AskMyRecord } from "@/components/portal/AskMyRecord";
import { ClientMomentumPanel } from "@/components/portal/ClientMomentumPanel";
import { NextMoveRail } from "@/components/intelligence/NextMoveRail";
import { memberMoves } from "@/lib/intelligence/memberMoves";
import { ArrowRight, MessageSquare, ShieldCheck } from "lucide-react";

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
  // Audit fix: these were the module constant ME / me(), which pinned every
  // portal page to one male member and made the whole women's track dead code.
  const meId = useMe();
  const client = useMeClient();
  const plan = buildPlanOfCare(client);
  const membership = membershipForClient(meId);
  const coach = staffMap[client.coachId];
  const provider = staffMap[client.providerId];
  const activeProgram = client.programs.find((p) => p.status === "Active") ?? client.programs[0];

  const nextAppt = appointmentsForClient(meId).find((a) => a.start >= NOW);

  // Where the member is in ALPHA HEALTH's published four-step process. This is
  // deliberately not `client.status` — "Active Protocol" is our enum, not a
  // sentence anyone has ever said to a patient.
  const journeyNow = journeyStepFor(client.status);

  // Monitoring checkpoints are keyed to weeks-since-plan-start; we surface the
  // ones the member has not reached yet. Week 0 drops off on its own once the
  // plan is running, so it never needs special-casing.
  const weeksIn = Math.floor(
    (absolute(NOW).getTime() - absolute(activeProgram?.startedOn ?? client.joinedOn).getTime()) /
      (1000 * 60 * 60 * 24 * 7),
  );
  const upcoming = plan.monitoring.filter((m) => m.week > weeksIn).slice(0, 3);

  // One message, not three. The preview exists to say "someone replied", and
  // the thread is one tap away for anyone who wants more than that.
  const latestMessage = [...threadFor(client)].reverse()[0];

  const orderStage = ORDER_STAGES[CURRENT_STAGE];

  return (
    /**
     * Spacing carries the outline.
     *
     * This page used to be a single `space-y-8` stack: twelve cards, every gap
     * identical, so the eye got no help telling "today" from "admin" and the
     * whole screen read as one undifferentiated list. Now the four groups are
     * 48px apart and the cards inside a group are 16px apart. The contrast is
     * the point — uniform gaps are what make a layout look generated rather
     * than composed.
     *
     * MemberLogProvider used to wrap this element. It now lives in
     * `app/portal/layout.tsx` — mounting it on a page scoped the member's log to
     * this one route and made `useMemberLog` throw everywhere else.
     */
    <div className="space-y-12">
      {/* ------------------------------------------------------------------ */}
      {/* 1 · Greeting — one line, no metrics. The rings below are the data.  */}
      {/* ------------------------------------------------------------------ */}
      {/* No entry animation. This is the first thing on the screen and it is
          static content — fading it in delays the one element the member came
          for and is the most recognisable tell of a generated interface.
          Motion on this page is reserved for the rings, where it carries
          meaning. */}
      <div
        className={cn(
          "relative overflow-hidden rounded-panel border border-ink-700/70 bg-ink-850 px-5 py-8 sm:px-8 sm:py-10",
          "bg-gradient-to-br",
          portal.accent.gradient,
        )}
      >
        <p className="label-eyebrow">{formatDate(NOW)}</p>
        <h1 className="mt-3 font-display text-display leading-[1.05] tracking-tight text-ink-50">
          Good morning,
          <br />
          {client.firstName}.
        </h1>
        <p className="mt-4 max-w-prose text-body leading-relaxed text-ink-300">
          You&rsquo;re <span className="stat-mono text-ink-100">{Math.min(weeksIn, plan.durationWeeks)}</span>{" "}
          weeks into a <span className="stat-mono text-ink-100">{plan.durationWeeks}</span>-week block. Close
          your three rings and the day counts — that&rsquo;s the whole job.
        </p>

        {/* One accent, not three. These three facts previously arrived as a
            green badge, a gold badge and a bordered chip with a pin icon in
            it, which reads as decoration rather than information. Membership
            tier is the only one that is genuinely a status, so it keeps the
            accent; the programme and the location are plain text, which is
            what they always were. */}
        <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-detail text-ink-400">
          {membership && <Badge tone="gold">{membership.tier}</Badge>}
          {activeProgram && (
            <span>
              {activeProgram.name} · since {formatDate(activeProgram.startedOn)}
            </span>
          )}
          <span aria-hidden className="text-ink-600">
            ·
          </span>
          <span>{locationName(client.locationId)}</span>
        </div>
      </div>

      {/* ================================================================== */}
      {/* GROUP · TODAY — the doing, then the reporting.                      */}
      {/*                                                                     */}
      {/* Logging comes FIRST. The dashboard used to open with seventeen cards */}
      {/* of read-only status while the actual logging lived on four other     */}
      {/* routes — and marking a dose as taken existed nowhere in the app at   */}
      {/* all, so the protocol ring was a picture of adherence rather than a   */}
      {/* record of one. What you have to do now sits above everything that    */}
      {/* reports on what you did.                                             */}
      {/* ================================================================== */}
      <NextMoveRail
        eyebrow="Apex intelligence"
        title="Worth checking today"
        detail="Apex summarizes recent record changes, care-team messages and practical next steps in one place."
        moves={memberMoves(client, NOW)}
      />

      <TodayBlock clientId={meId} iso={NOW} />

      <DailyRings clientId={meId} />

      {/* ================================================================== */}
      {/* GROUP · THE WEEK AND THE HABIT LAYER.                               */}
      {/* ================================================================== */}
      <div className="space-y-4">

      {/* ------------------------------------------------------------------ */}
      {/* 2a · The week.                                                      */}
      {/*                                                                     */}
      {/* Directly under the rings because it is the same question at a       */}
      {/* different resolution: the rings answer "what do I do today", this   */}
      {/* answers "was any of it worth it". Above the habit layer on purpose  */}
      {/* — a member who only ever reads two cards should get the honest week */}
      {/* before the streak, not after it.                                    */}
      {/* ------------------------------------------------------------------ */}
      <WeeklyReview client={client} />

      <ClientMomentumPanel client={client} />

      {/* ------------------------------------------------------------------ */}
      {/* 2b · The habit layer.                                              */}
      {/*                                                                     */}
      {/* Streak and season sit directly under the rings because they are     */}
      {/* what makes closing them matter tomorrow as well as today. Refill    */}
      {/* runway is here rather than buried in orders: running out is the     */}
      {/* single most common reason a protocol lapses, and a member should    */}
      {/* never discover it from an empty drawer.                             */}
      {/* ------------------------------------------------------------------ */}
      {/* One compact row, not four competing cards. Streak and level are
          motivation, not the job; refill runway is here because running out is
          the commonest reason a protocol lapses and a member should never learn
          it from an empty drawer. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StreakCard clientId={meId} />
        <RefillRunway client={client} />
      </div>

      <HabitDrawer clientId={meId} />
      </div>

      {/* Ask-your-record last on this screen: it answers a question the member
          already has, so it belongs after the things that might answer it
          first. Standalone: it is a different kind of thing from either the
          habit cards above or the logistics below. */}
      <AskMyRecord clientId={meId} />

      {/* ================================================================== */}
      {/* GROUP · WHERE THINGS STAND — journey, visit, order, people.         */}
      {/* ================================================================== */}
      <div className="space-y-4">
      {/* ------------------------------------------------------------------ */}
      {/* 3 · Where I am — the clinic's four steps, not our state machine.    */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <p className="label-eyebrow">Where you are</p>
          <h2 className="mt-2 font-display text-title text-ink-50">
            Step <span className="stat-mono">{journeyNow.step}</span> of{" "}
            <span className="stat-mono">{JOURNEY.length}</span> — {journeyNow.title}
          </h2>
          <p className="mt-2 max-w-prose text-detail leading-relaxed text-ink-400">{journeyNow.detail}</p>

          {/* Segment rail. Four short bars read as progress on a 390px
              screen where four labelled nodes would wrap into mush; the
              labels sit underneath in a single row of small caps. */}
          <ol className="mt-6 flex gap-1.5" aria-label="Your progress through Alpha Health's four steps">
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
                      "mt-2 block truncate text-micro uppercase",
                      done || current ? "text-ink-300" : "text-ink-600",
                    )}
                  >
                    {/* First word only — "Free", "Testing", "Clinician-led",
                        "Coaching" — so nothing wraps at 390px. The tick is
                        dropped: the filled bar above already says "done", and
                        repeating it in a second colour is decoration. */}
                    {j.title.split(" ")[0]}
                  </span>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* 4 · What's next — the visit, then the checkpoints.                  */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <p className="label-eyebrow">Your next visit</p>
          {nextAppt ? (
            <>
              {/* The date is the one dominant thing in this card. It was
                  competing with a green badge repeating the same fact in
                  words; the badge is now plain text on the detail line, so
                  the date carries the card on its own. */}
              <p className="mt-2 font-display text-display leading-none text-ink-50">
                {formatDate(nextAppt.start)}
              </p>
              <p className="stat-mono mt-2 text-title text-ink-300">{formatTime(nextAppt.start)}</p>
              <p className="mt-4 text-detail text-ink-400">
                {nextAppt.type} with {staffMap[nextAppt.staffId]?.name} ·{" "}
                <span className="stat-mono">{nextAppt.durationMin}</span> min ·{" "}
                {locationName(nextAppt.locationId)} · {relativeDays(nextAppt.start)}
              </p>
              <p className="mt-3 max-w-prose text-detail leading-relaxed text-ink-500">
                You mentioned sleep on the 10th. It&rsquo;s already attached to this visit, so you won&rsquo;t
                have to bring it up cold.
              </p>
            </>
          ) : (
            <p className="mt-2 text-detail text-ink-400">
              Nothing on the calendar yet. Message your coach and they&rsquo;ll book it.
            </p>
          )}

          {upcoming.length > 0 && (
            /* mt-8: a real gap between "the next visit" and "everything after
               it", rather than the uniform mt-6 that made the two groups read
               as one list. */
            <div className="mt-8 border-t border-ink-800/60 pt-6">
              <p className="label-eyebrow">Then</p>
              {/* Hairline rows, not cards. These used to be rounded, filled,
                  bordered boxes sitting inside a bordered card inside a
                  bordered card — three levels of box for a three-line list.
                  A rule between rows separates them just as well. */}
              <ul className="mt-3 divide-y divide-ink-800/60">
                {upcoming.map((m) => (
                  <li key={m.week} className="flex items-baseline gap-3 py-3">
                    <span className="stat-mono w-10 shrink-0 text-micro uppercase text-ink-500">
                      wk {m.week}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-detail font-medium text-ink-50">{m.label}</p>
                      <p className="mt-0.5 text-detail leading-relaxed text-ink-400">{m.detail}</p>
                    </div>
                    {/* Owner is the anxiety-reducer: "you" vs "us" answers
                        "is someone waiting on me?" without being asked. Only
                        the member's own rows are accented — those are the ones
                        that need an action. */}
                    <span
                      className={cn(
                        "shrink-0 text-micro uppercase",
                        m.owner === "Member" ? "text-optimal" : "text-ink-500",
                      )}
                    >
                      {m.owner === "Member" ? "You" : m.owner === "Coach" ? "Coach" : "Provider"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* 5 · Your order — one line and a rail. Details on demand.            */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          {/* The coloured icon tile is gone. A green rounded square with a
              lorry in it is decoration — the sentence already says a refill is
              arriving, and the segment rail below already carries the status
              colour. */}
          <p className="text-heading text-ink-50">Your refill arrives today</p>
          <p className="mt-1 text-detail text-ink-400">
            <span className="stat-mono">2</span> items · out for delivery since{" "}
            <span className="stat-mono">{formatTime(orderStage.at)}</span>
          </p>

          {/* Five segments, one per lifecycle stage. The labels are in the
              title attribute and the summary line rather than printed five
              times across a 390px viewport. */}
          <ol className="mt-5 flex gap-1.5">
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

          <details className="group mt-5">
            <summary className="focus-ring inline-flex cursor-pointer list-none items-center gap-1 rounded-control text-detail text-ink-400 hover:text-ink-100">
              Full tracking
              <ArrowRight className="h-3 w-3 transition-transform group-open:rotate-90" />
            </summary>
            <div className="mt-4 divide-y divide-ink-800/60 border-t border-ink-800/60">
              {ORDER_STAGES.map((stage, i) => (
                <div key={stage.key} className="flex items-baseline justify-between gap-3 py-2 text-detail">
                  <span className={i <= CURRENT_STAGE ? "text-ink-200" : "text-ink-600"}>{stage.label}</span>
                  <span className="stat-mono shrink-0 text-micro text-ink-500">
                    {stage.at ? formatDateTime(stage.at) : "Expected today"}
                  </span>
                </div>
              ))}
            </div>
            <p className="stat-mono mt-3 text-micro text-ink-500">1Z999AA10123456784</p>
            <p className="mt-1 max-w-prose text-micro leading-relaxed text-ink-500">
              This updates itself from the carrier. Nobody at the clinic has to look it up and text it to
              you.
            </p>
          </details>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* 6 · My people. Named humans, one tap to reach them.                 */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <p className="label-eyebrow">Your people</p>
          <h2 className="mt-2 font-display text-title text-ink-50">
            Two humans, and they both know your name
          </h2>

          {/* Two hairline rows instead of two filled, bordered, rounded cards
              nested inside this one. The avatar is the only filled shape here,
              which is what makes it read as a person rather than a tile. */}
          <div className="mt-5 divide-y divide-ink-800/60 border-y border-ink-800/60">
            {[
              { s: coach, what: "Your coach", blurb: "Day to day — food, training, check-ins." },
              { s: provider, what: "Your provider", blurb: "Sets and signs anything medical." },
            ].map(({ s, what, blurb }) => (
              <div key={what} className="flex items-start gap-4 py-4">
                <span
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-detail font-semibold text-[color:var(--on-swatch)]"
                  style={{ background: portal.accent.hex }}
                >
                  {s?.avatarInitials}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-body font-medium text-ink-50">{s?.name}</p>
                  <p className="text-micro uppercase text-ink-500">
                    {what} · {s?.credentials}
                  </p>
                  <p className="mt-1.5 text-detail leading-relaxed text-ink-400">{blurb}</p>
                </div>
              </div>
            ))}
          </div>

          {/* The one call to action on this card, and now the only accented
              thing on it. It was previously a green-tinted, green-bordered
              panel with a green icon and a green arrow — four accents for one
              link. */}
          <Link
            href="/portal/messages"
            className="focus-ring mt-6 flex items-center gap-3 rounded-control border border-ink-700/70 bg-ink-900/50 p-4 transition-colors hover:border-ink-600"
          >
            <MessageSquare className="h-5 w-5 shrink-0 text-optimal" />
            <span className="min-w-0 flex-1">
              <span className="block text-detail font-medium text-ink-100">Message your team</span>
              {latestMessage && (
                <span className="mt-0.5 line-clamp-1 block text-detail text-ink-400">
                  {latestMessage.who === "me" ? "You" : latestMessage.from}: {latestMessage.body}
                </span>
              )}
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-ink-500" />
          </Link>

          <Link
            href="/portal/access"
            className="focus-ring mt-3 flex items-center gap-2 rounded-control py-1 text-detail text-ink-500 hover:text-ink-200"
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span className="min-w-0">Every look at your chart is logged — name, time and reason.</span>
            <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0" />
          </Link>
        </CardContent>
      </Card>
      </div>

      <p className="pb-2 text-center text-micro text-ink-600">Demonstration data.</p>
    </div>
  );
}
