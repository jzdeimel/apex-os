"use client";

/**
 * My Program — the member home.
 *
 * The system Apex replaces has no client portal at all. A member learns their
 * order shipped because a coach reads an internal board and texts them; they
 * learn what their plan says because someone reads it aloud. This page is the
 * whole thesis in one screen: the member sees their own score, their own care
 * team by name, what happens next and where their order actually is, without
 * asking a human for any of it.
 */

import Link from "next/link";
import { alphaScore, scoreColor } from "@/lib/alphaScore";
import { AlphaScoreRing } from "@/components/AlphaScoreRing";
import { buildPlanOfCare } from "@/lib/planOfCare/engine";
import { staffMap } from "@/lib/mock/staff";
import { locationName } from "@/lib/mock/locations";
import { membershipForClient } from "@/lib/mock/memberships";
import { appointmentsForClient } from "@/lib/mock/appointments";
import { Card, CardContent, Badge, Progress } from "@/components/ui/primitives";
import { Stagger, StaggerItem, FadeIn } from "@/components/motion";
import { usePortal } from "@/lib/portalStore";
import { cn, formatDate, formatDateTime, relativeDays } from "@/lib/utils";
import { ME, me, MEMBER_THREAD } from "@/components/portal/PortalHeader";
import { DailyRings } from "@/components/portal/DailyRings";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  MapPin,
  MessageSquare,
  Package,
  Truck,
  Home,
  Circle,
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
 * forever, discarding the carrier status it already fetched. Apex models the
 * lifecycle as ordered stages with real timestamps, so "where is my refill"
 * has an answer that does not involve a phone call.
 */
const ORDER_STAGES: { key: string; label: string; icon: typeof Package; at?: string }[] = [
  { key: "placed", label: "Ordered", icon: Package, at: "2026-06-06T10:14:00" },
  { key: "filled", label: "Filled by pharmacy", icon: CheckCircle2, at: "2026-06-08T15:40:00" },
  { key: "shipped", label: "Shipped", icon: Truck, at: "2026-06-09T09:02:00" },
  { key: "out", label: "Out for delivery", icon: Truck, at: "2026-06-12T07:31:00" },
  { key: "delivered", label: "Delivered", icon: Home },
];
const CURRENT_STAGE = 3; // index into ORDER_STAGES — out for delivery

export default function PortalHomePage() {
  const { portal } = usePortal();
  const client = me();
  const score = alphaScore(client);
  const plan = buildPlanOfCare(client);
  const membership = membershipForClient(ME);
  const coach = staffMap[client.coachId];
  const provider = staffMap[client.providerId];
  const activeProgram = client.programs.find((p) => p.status === "Active") ?? client.programs[0];

  const nextAppt = appointmentsForClient(ME).find((a) => a.start >= NOW);

  // Monitoring checkpoints are keyed to weeks-since-plan-start; we surface the
  // ones the member has not reached yet. Week 0 drops off on its own once the
  // plan is running, so it never needs special-casing.
  const weeksIn = Math.floor(
    (new Date(NOW).getTime() - new Date(activeProgram?.startedOn ?? client.joinedOn).getTime()) /
      (1000 * 60 * 60 * 24 * 7),
  );
  const upcoming = plan.monitoring.filter((m) => m.week > weeksIn).slice(0, 4);

  const recent = [...MEMBER_THREAD].slice(-3).reverse();
  const markerCount = score.domains.reduce((s, d) => s + d.markers, 0);

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                               */}
      {/* ------------------------------------------------------------------ */}
      <FadeIn>
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border border-ink-700/70 bg-ink-850 p-6",
            "bg-gradient-to-br",
            portal.accent.gradient,
          )}
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="label-eyebrow">My program</p>
              <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink-50">
                Good morning, {client.firstName}
              </h1>
              <p className="mt-1 max-w-xl text-sm text-ink-400">
                Week <span className="stat-mono text-ink-200">{Math.min(weeksIn, plan.durationWeeks)}</span> of your{" "}
                <span className="stat-mono text-ink-200">{plan.durationWeeks}</span>-week block. Everything your
                care team can see about your plan, you can see here too.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {activeProgram && (
                  <Badge tone="optimal">
                    {activeProgram.name} · since {formatDate(activeProgram.startedOn)}
                  </Badge>
                )}
                {membership && <Badge tone="gold">{membership.tier} membership</Badge>}
                <Badge tone="neutral">
                  <MapPin className="h-3 w-3" />
                  {locationName(client.locationId)}
                </Badge>
              </div>
            </div>

            {/* Score plus its domain breakdown. The member sees the parts, not
                just the headline — a single opaque number is exactly the kind
                of black box this product exists to delete. */}
            <div className="w-full shrink-0 rounded-xl border border-ink-700/70 bg-ink-900/60 p-4 lg:w-[22rem]">
              <div className="flex items-center justify-between gap-3">
                <AlphaScoreRing result={score} size={72} />
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wide text-ink-600">Last updated</p>
                  <p className="stat-mono text-xs text-ink-300">{formatDate(client.latestLabDate)}</p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {score.domains.slice(0, 5).map((d) => (
                  <div key={d.name} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 truncate text-xs text-ink-400">{d.name}</span>
                    <Progress
                      value={d.score}
                      tone={d.score >= 75 ? "optimal" : d.score >= 50 ? "gold" : "high"}
                      className="flex-1"
                    />
                    <span className="stat-mono w-8 shrink-0 text-right text-xs text-ink-200">{d.score}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
                Built from <span className="stat-mono text-ink-400">{markerCount}</span> results on your last
                panel plus your body scan. It is a way to see movement over time — not a diagnosis.
              </p>
            </div>
          </div>
        </div>
      </FadeIn>

      {/* ------------------------------------------------------------------ */}
      {/* Care team + next visit                                             */}
      {/* ------------------------------------------------------------------ */}
      {/* The daily loop sits above everything else: this is the reason to
          open Apex on an ordinary Tuesday. */}
      <DailyRings clientId={ME} />

      <Stagger className="grid gap-4 lg:grid-cols-3">
        <StaggerItem className="lg:col-span-2">
          <Card className="h-full">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-ink-50">Your care team</h2>
                <Link
                  href="/portal/messages"
                  className="focus-ring inline-flex items-center gap-1 rounded-md text-xs text-ink-400 hover:text-ink-100"
                >
                  Message them <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  { s: coach, what: "Your coach", blurb: "Day to day — food, training, check-ins." },
                  { s: provider, what: "Your provider", blurb: "Sets and signs anything medical." },
                ].map(({ s, what, blurb }) => (
                  <div key={what} className="hairline flex items-start gap-3 rounded-xl bg-ink-900/50 p-3">
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-semibold text-ink-950"
                      style={{ background: portal.accent.hex }}
                    >
                      {s?.avatarInitials}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-50">{s?.name}</p>
                      <p className="text-[11px] uppercase tracking-wide text-ink-500">
                        {what} · {s?.credentials}
                      </p>
                      <p className="mt-1 text-xs text-ink-400">{blurb}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="h-full">
            <CardContent className="p-5">
              <h2 className="font-display text-base font-semibold text-ink-50">Next visit</h2>
              {nextAppt ? (
                <div className="mt-3">
                  <p className="stat-mono text-lg text-ink-50">{formatDateTime(nextAppt.start)}</p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {nextAppt.type} · <span className="stat-mono">{nextAppt.durationMin}</span> min ·{" "}
                    {locationName(nextAppt.locationId)}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge tone="optimal">
                      <CalendarClock className="h-3 w-3" />
                      {relativeDays(nextAppt.start)}
                    </Badge>
                    <Badge tone="neutral">with {staffMap[nextAppt.staffId]?.name}</Badge>
                  </div>
                  <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
                    You asked about sleep on the 10th — it is already attached to this visit, so you will not
                    have to bring it up cold.
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-ink-400">
                  Nothing on the calendar. Message your coach to book.
                </p>
              )}
            </CardContent>
          </Card>
        </StaggerItem>
      </Stagger>

      {/* ------------------------------------------------------------------ */}
      {/* Order status strip                                                 */}
      {/* ------------------------------------------------------------------ */}
      <FadeIn>
        <Card>
          <CardContent className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-ink-50">Your current order</h2>
              <Badge tone="optimal">
                <Truck className="h-3 w-3" />
                Out for delivery
              </Badge>
            </div>
            <p className="mt-1 text-sm text-ink-400">
              Refill · <span className="stat-mono">2</span> items · tracking{" "}
              <span className="stat-mono text-ink-300">1Z999AA10123456784</span>
            </p>

            <ol className="mt-5 grid gap-4 sm:grid-cols-5">
              {ORDER_STAGES.map((stage, i) => {
                const done = i < CURRENT_STAGE;
                const current = i === CURRENT_STAGE;
                const Icon = done || current ? stage.icon : Circle;
                return (
                  <li key={stage.key} className="relative">
                    {/* Connector, drawn only on the horizontal (sm+) layout. */}
                    {i < ORDER_STAGES.length - 1 && (
                      <span
                        aria-hidden
                        className={cn(
                          "absolute left-[calc(50%+1.25rem)] right-[calc(-50%+1.25rem)] top-4 hidden h-px sm:block",
                          done ? "bg-optimal/50" : "bg-ink-700",
                        )}
                      />
                    )}
                    <div className="flex flex-col items-center text-center">
                      <span
                        className={cn(
                          "grid h-8 w-8 place-items-center rounded-full border",
                          done && "border-optimal/40 bg-optimal/15 text-optimal",
                          current && "border-optimal bg-optimal/25 text-optimal",
                          !done && !current && "border-ink-700 bg-ink-900 text-ink-600",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <p
                        className={cn(
                          "mt-2 text-xs font-medium",
                          done || current ? "text-ink-100" : "text-ink-500",
                        )}
                      >
                        {stage.label}
                      </p>
                      <p className="stat-mono mt-0.5 text-[10px] text-ink-500">
                        {stage.at ? formatDateTime(stage.at) : "Expected today"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>

            <p className="mt-5 text-[11px] leading-relaxed text-ink-500">
              This updates itself from the carrier. Nobody at the clinic has to look it up and text it to you.
            </p>
          </CardContent>
        </Card>
      </FadeIn>

      {/* ------------------------------------------------------------------ */}
      {/* What's next + recent messages                                      */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h2 className="font-display text-base font-semibold text-ink-50">What&rsquo;s next</h2>
            <p className="mt-1 text-sm text-ink-400">
              The checkpoints built into your plan, and who owns each one.
            </p>
            <Stagger className="mt-4 space-y-2">
              {upcoming.map((m) => (
                <StaggerItem key={m.week}>
                  <div className="hairline flex items-start gap-3 rounded-xl bg-ink-900/50 p-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-ink-700 bg-ink-850">
                      <span className="stat-mono text-xs text-ink-200">W{m.week}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink-50">{m.label}</p>
                      <p className="mt-0.5 text-xs text-ink-400">{m.detail}</p>
                    </div>
                    <Badge tone={m.owner === "Member" ? "optimal" : "neutral"}>
                      {m.owner === "Member" ? "You" : m.owner === "Coach" ? "Your coach" : "Your provider"}
                    </Badge>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-ink-50">Recent messages</h2>
              <Link
                href="/portal/messages"
                className="focus-ring inline-flex items-center gap-1 rounded-md text-xs text-ink-400 hover:text-ink-100"
              >
                Open thread <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="mt-4 space-y-2">
              {recent.map((m) => (
                <div key={m.id} className="hairline rounded-xl bg-ink-900/50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-medium text-ink-200">
                      {m.who === "me" ? "You" : m.from}
                      {m.who === "team" && m.role && <span className="ml-1.5 text-ink-500">{m.role}</span>}
                    </p>
                    <span className="stat-mono shrink-0 text-[10px] text-ink-500">{formatDateTime(m.at)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-ink-400">{m.body}</p>
                </div>
              ))}
            </div>

            <Link
              href="/portal/access"
              className="focus-ring mt-4 flex items-center gap-2 rounded-xl border border-optimal/25 bg-optimal/10 p-3 text-xs text-ink-200 hover:bg-optimal/15"
            >
              <MessageSquare className="h-4 w-4 shrink-0 text-optimal" />
              <span>Curious who has opened your chart? Every look is listed — name, time and reason.</span>
              <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-optimal" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <p className="text-center text-[11px] text-ink-600">
        Score band: <span style={{ color: scoreColor(score.band) }}>{score.label}</span> · Demonstration data.
      </p>
    </div>
  );
}
