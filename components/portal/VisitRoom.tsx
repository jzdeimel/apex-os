"use client";

/**
 * The telehealth room — and the reason the visit is not a cold start.
 *
 * Two halves, and the second one is the point.
 *
 * LEFT: the pre-flight check, then the room. The check runs before the join
 * button is live because the most common way a video visit fails is a member
 * discovering at 2:00pm that the browser never had microphone permission —
 * ten minutes of a clinician's day spent on "can you hear me now".
 *
 * RIGHT: the member's own plan and the summary of their last consult, on the
 * same screen as the call. A telehealth visit where the member cannot remember
 * what was decided last time and the plan is two taps away in another tab is a
 * visit that spends its first five minutes reconstructing itself. Putting the
 * plan next to the video is not decoration; it is the difference between a
 * thirty-minute visit and a twenty-minute one.
 *
 * Member-facing plan copy goes through `memberSummary`/`memberReasons` — the
 * engine's own wording is written for a chart, not for the person whose body it
 * describes. No dose appears anywhere on this screen, because no dose exists in
 * `PlanItem`.
 */

import { useState } from "react";
import { MotionConfig } from "framer-motion";
import {
  AlertTriangle,
  Camera,
  Check,
  Circle,
  Clock,
  Globe,
  Loader2,
  Lock,
  Mic,
  ShieldCheck,
  Video,
  X,
} from "lucide-react";
import { roomFor, ROOM_ASSURANCES, type PreflightCheck, type VisitRoomState } from "@/lib/visits/room";
import { buildPlanOfCare } from "@/lib/planOfCare/engine";
import { memberSummary, memberReasons } from "@/lib/planOfCare/memberVoice";
import { latestConsult } from "@/lib/mock/consults";
import { staffMap } from "@/lib/mock/staff";
import { locationName } from "@/lib/mock/locations";
import { Badge, Button, Card, CardContent, EmptyState } from "@/components/ui/primitives";
import { FadeIn, Stagger, StaggerItem } from "@/components/portal/still";
import { useMeClient } from "@/components/portal/PortalHeader";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

const CHECK_ICON = {
  camera: Camera,
  microphone: Mic,
  connection: Globe,
  browser: ShieldCheck,
} as const;

export function VisitRoom({ apptId }: { apptId: string }) {
  // Audit fix (GAP_ANALYSIS.md, "Portal renderable as a woman"): was the
  // non-reactive `me()` accessor, which pinned this to one male member and
  // would not re-render when the demo subject changed.
  const client = useMeClient();
  const state = roomFor(apptId);
  const [joined, setJoined] = useState(false);

  if (!state) {
    return (
      <EmptyState
        title="We can't find that visit"
        hint="It may have been rebooked. Your upcoming visits are on your home screen."
      />
    );
  }

  const plan = buildPlanOfCare(client);
  const lastConsult = latestConsult(client.id);
  const clinician = staffMap[state.appointment.staffId];

  return (
    <MotionConfig reducedMotion="user">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* ── The room ───────────────────────────────────────────────────── */}
        <div className="space-y-5">
          <Card>
            <CardContent className="pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="label-eyebrow">{state.appointment.type}</p>
                  <h2 className="mt-1.5 font-display text-title font-semibold leading-tight text-ink-50">
                    {formatDateTime(state.appointment.start)}
                  </h2>
                  <p className="mt-1 text-detail text-ink-400">
                    {clinician?.name ?? "Your care team"}
                    {clinician?.credentials ? `, ${clinician.credentials}` : ""} ·{" "}
                    {locationName(state.appointment.locationId)}
                  </p>
                </div>
                <Badge tone={state.joinable ? "optimal" : state.joinState === "expired" ? "high" : "neutral"}>
                  {state.joinState === "in-progress"
                    ? "In progress"
                    : state.joinState === "open"
                      ? "Room open"
                      : state.joinState === "too-early"
                        ? "Opens soon"
                        : state.joinState === "expired"
                          ? "Closed"
                          : "In clinic"}
                </Badge>
              </div>

              <p className="mt-3 text-detail leading-relaxed text-ink-400">{state.joinHint}</p>

              {/* The stage. A frame rather than a fake video feed — a mocked
                  face on a screenshot is the kind of thing that ends up in a
                  slide deck being mistaken for a working product. */}
              <div className="mt-4 overflow-hidden rounded-panel border border-ink-700 bg-ink-900/70">
                <div className="flex aspect-video flex-col items-center justify-center gap-2 px-5 text-center">
                  {joined ? (
                    <>
                      <Loader2 className="h-6 w-6 animate-spin text-gold-300 motion-reduce:animate-none" />
                      <p className="text-detail font-medium text-ink-100">Connecting to the room…</p>
                      <p className="max-w-sm text-micro leading-relaxed text-ink-500">
                        Demo build — no session is established and no media is captured.
                      </p>
                    </>
                  ) : (
                    <>
                      <Video className="h-6 w-6 text-ink-500" />
                      <p className="text-detail font-medium text-ink-200">
                        {state.ready ? "Ready when you are" : "Finish the checks below first"}
                      </p>
                      <p className="max-w-sm text-micro leading-relaxed text-ink-500">
                        You'll see your own preview before anyone else can see you.
                      </p>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-700 bg-ink-850/70 px-4 py-3">
                  <div className="flex items-center gap-2 text-micro text-ink-400">
                    <Lock className="h-3.5 w-3.5" />
                    <span>Not recorded</span>
                    <Circle className="h-1 w-1 fill-ink-600 text-ink-600" />
                    <span>
                      Link expires in <span className="stat-mono">{state.linkTtlMinutes}</span> min
                    </span>
                  </div>
                  {joined ? (
                    <Button variant="danger" size="sm" onClick={() => setJoined(false)}>
                      <X className="h-3.5 w-3.5" /> Leave
                    </Button>
                  ) : (
                    <Button variant="primary" size="sm" disabled={!state.joinable} onClick={() => setJoined(true)}>
                      <Video className="h-3.5 w-3.5" /> Join visit
                    </Button>
                  )}
                </div>
              </div>

              {state.room && (
                <p className="mt-3 text-micro leading-relaxed text-ink-500">
                  Room <span className="stat-mono">{state.room.roomId}</span> · roster of{" "}
                  <span className="stat-mono">{state.room.participants.length}</span>. {state.disclosure}
                </p>
              )}
              {state.error && <p className="mt-3 text-detail text-high">{state.error}</p>}
            </CardContent>
          </Card>

          {/* ── Pre-flight ─────────────────────────────────────────────────── */}
          <Card>
            <CardContent className="pt-5">
              <p className="label-eyebrow">Before you join</p>
              <Stagger className="mt-3 grid grid-cols-1 gap-2">
                {state.preflight.map((c) => (
                  <StaggerItem key={c.id}>
                    <CheckRow check={c} />
                  </StaggerItem>
                ))}
              </Stagger>
              {!state.ready && (
                <p className="mt-3 text-detail leading-relaxed text-watch">
                  We can't start without a microphone — a visit you can't speak in isn't a visit. Everything else is
                  optional: audio-only is a real telehealth visit and your provider is used to it.
                </p>
              )}
            </CardContent>
          </Card>

          {/* ── What we promise about the room ─────────────────────────────── */}
          <Card>
            <CardContent className="pt-5">
              <p className="label-eyebrow">About this room</p>
              <ul className="mt-3 space-y-2">
                {ROOM_ASSURANCES.map((a) => (
                  <li key={a} className="flex gap-2.5 text-detail leading-relaxed text-ink-300">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-optimal" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* ── Not a cold start ───────────────────────────────────────────── */}
        <div className="space-y-5">
          <FadeIn>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="label-eyebrow">Your plan, in front of you</p>
                  <Badge tone="neutral">{plan.status}</Badge>
                </div>
                <p className="mt-2.5 text-detail leading-relaxed text-ink-300">{plan.summary}</p>

                <div className="mt-4 space-y-2.5">
                  {plan.protocol.slice(0, 3).map((item) => (
                    <div key={item.id} className="rounded-panel border border-ink-700 bg-ink-900/50 p-3">
                      <p className="text-detail font-medium text-ink-50">{item.title}</p>
                      {/* Member voice, always. The engine's own `detail` is
                          written for a chart. */}
                      <p className="mt-1 text-detail leading-relaxed text-ink-400">{memberSummary(item)}</p>
                      {memberReasons(item)
                        .slice(0, 2)
                        .map((r) => (
                          <p key={r} className="mt-1.5 flex gap-1.5 text-micro leading-relaxed text-ink-500">
                            <Check className="mt-0.5 h-3 w-3 shrink-0 text-optimal" />
                            <span>{r}</span>
                          </p>
                        ))}
                      {item.cadence && (
                        <p className="mt-2 text-micro text-ink-500">
                          Cadence: <span className="stat-mono">{item.cadence}</span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {plan.macros && (
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { k: "kcal", v: plan.macros.calories },
                      { k: "protein", v: `${plan.macros.proteinG}g` },
                      { k: "carbs", v: `${plan.macros.carbsG}g` },
                      { k: "fat", v: `${plan.macros.fatG}g` },
                    ].map((m) => (
                      <div key={m.k} className="rounded-panel border border-ink-700 bg-ink-900/50 p-2.5 text-center">
                        <p className="stat-mono text-detail text-ink-50">{m.v}</p>
                        <p className="mt-0.5 text-micro uppercase tracking-wide text-ink-500">{m.k}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </FadeIn>

          <FadeIn delay={0.06}>
            <Card>
              <CardContent className="pt-5">
                <p className="label-eyebrow">Last time you spoke</p>
                {lastConsult ? (
                  <>
                    <p className="mt-2 text-detail text-ink-500">
                      {lastConsult.kind} · {lastConsult.channel} · {formatDate(lastConsult.startedAt)}
                    </p>
                    {/* Only what a human signed. An unsigned AI summary is a
                        draft, and a draft is not something to hand a member
                        thirty seconds before their provider joins. */}
                    {lastConsult.finalSummary ? (
                      <>
                        <p className="mt-2.5 text-detail leading-relaxed text-ink-200">
                          {lastConsult.finalSummary.headline}
                        </p>
                        {lastConsult.finalSummary.actionItems.length > 0 && (
                          <ul className="mt-3 space-y-1.5">
                            {lastConsult.finalSummary.actionItems.slice(0, 4).map((a, i) => (
                              <li key={i} className="flex gap-2 text-detail leading-relaxed text-ink-300">
                                <Circle className="mt-1.5 h-1.5 w-1.5 shrink-0 fill-gold-400 text-gold-400" />
                                <span>{a.value}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    ) : (
                      <p className="mt-2.5 text-detail leading-relaxed text-ink-400">
                        Your coach hasn't signed off on the notes from that conversation yet, so we're not showing you a
                        draft. They'll be here as soon as they are.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-2.5 text-detail leading-relaxed text-ink-400">
                    This is your first visit with us. Nothing to catch up on — come as you are.
                  </p>
                )}
              </CardContent>
            </Card>
          </FadeIn>

          <FadeIn delay={0.12}>
            <Card>
              <CardContent className="pt-5">
                <p className="label-eyebrow">Who's in the room</p>
                <div className="mt-3 space-y-2">
                  {state.attendees.map((a) => (
                    <div key={a.name} className="flex items-center justify-between gap-3">
                      <span className="truncate text-detail text-ink-100">{a.name}</span>
                      <span className="shrink-0 text-micro text-ink-500">{a.role}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 flex items-start gap-2 text-micro leading-relaxed text-ink-500">
                  <Clock className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>
                    Open from <span className="stat-mono">{state.opensAt.slice(11, 16)}</span> until{" "}
                    <span className="stat-mono">{state.closesAt.slice(11, 16)}</span>. Nobody else can be admitted.
                  </span>
                </p>
              </CardContent>
            </Card>
          </FadeIn>
        </div>
      </div>
    </MotionConfig>
  );
}

function CheckRow({ check }: { check: PreflightCheck }) {
  const Icon = CHECK_ICON[check.id];
  const tone =
    check.status === "ok" ? "text-optimal" : check.status === "warn" ? "text-watch" : "text-high";
  const StatusIcon = check.status === "ok" ? Check : check.status === "warn" ? AlertTriangle : X;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-panel border p-3",
        check.status === "ok" ? "border-ink-700 bg-ink-900/40" : "border-watch/25 bg-watch/5",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-detail font-medium text-ink-50">{check.label}</p>
          <StatusIcon className={cn("h-3.5 w-3.5", tone)} />
          {check.blocking && check.status !== "ok" && <Badge tone="high">Required</Badge>}
        </div>
        <p className="mt-0.5 text-detail leading-relaxed text-ink-400">{check.detail}</p>
        {check.fix && <p className="mt-1 text-micro leading-relaxed text-ink-500">{check.fix}</p>}
      </div>
    </div>
  );
}
