"use client";

import * as React from "react";
import Link from "next/link";
import {
  PenLine,
  CheckCircle2,
  FileText,
  MessageSquare,
  Phone,
  Video,
  User,
  Clock,
  Timer,
} from "lucide-react";
import type { Consult, ConsultChannel } from "@/lib/consult/types";
import { consults, unsignedConsultsFor } from "@/lib/mock/consults";
import { findingCount } from "@/lib/consult/summarize";
import { getClient, clientName } from "@/lib/mock/clients";
import { staffName } from "@/lib/mock/staff";
import { Badge, Button, EmptyState } from "@/components/ui/primitives";
import { FadeIn, Stagger, StaggerItem } from "@/components/motion";
import { Monogram } from "@/components/Monogram";
import { ME_COACH } from "@/components/coach/TodayQueue";
import { ConsultPrepBrief } from "@/components/coach/ConsultPrepBrief";
import { appointments } from "@/lib/mock/appointments";
import { cn, formatDateTime, relativeDays, absolute, formatDate, formatTime } from "@/lib/utils";

/**
 * Coach · Consults
 *
 * The signature queue. Two sections, stacked, unsigned on top — not two tabs.
 * A tab is a place to hide a number, and the number being hidden here is "how
 * many open charts do I own", which is the one an auditor asks for.
 *
 * Every row shows the AI headline and a findings count so the coach knows the
 * size of the review before opening it — an unsigned intake with fourteen
 * findings is a different commitment than a four-line check-in, and a queue
 * that hides that difference gets worked in the wrong order.
 */

/** Pinned clock — nothing in Apex reads the wall clock. */
const NOW = absolute("2026-06-12T09:00:00");
const DAY_MS = 86_400_000;

function daysWaiting(iso: string): number {
  return Math.round((NOW.getTime() - absolute(iso).getTime()) / DAY_MS);
}

const CHANNEL_ICON: Record<ConsultChannel, React.ElementType> = {
  "In person": User,
  Phone: Phone,
  Video: Video,
  Messaging: MessageSquare,
};

/**
 * Age is the whole ranking signal here, so it gets a colour rather than a
 * sentence. A chart open a fortnight is not "older" than one open two days —
 * it is a different category of problem.
 */
function ageTone(days: number): "high" | "watch" | "neutral" {
  if (days >= 7) return "high";
  if (days >= 3) return "watch";
  return "neutral";
}

function ConsultRow({ consult }: { consult: Consult }) {
  const client = getClient(consult.clientId);
  if (!client) return null;

  const summary = consult.finalSummary ?? consult.aiSummary;
  const findings = summary ? findingCount(summary) : 0;
  const signed = consult.status === "Signed";
  const ChannelIcon = CHANNEL_ICON[consult.channel];
  const waiting = daysWaiting(consult.startedAt);
  const tone = ageTone(waiting);

  return (
    <div
      className={cn(
        "card card-hover relative overflow-hidden px-3 py-2.5",
        // A left rule keyed to age lets the coach see the shape of the backlog
        // by running one eye down the gutter, without reading a single word.
        !signed && tone === "high" && "border-l-2 border-l-high",
        !signed && tone === "watch" && "border-l-2 border-l-watch",
      )}
    >
      <div className="flex items-start gap-2.5">
        <Monogram client={client} size="sm" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={`/clients/${client.id}`}
              className="truncate text-[13px] font-medium text-ink-50 hover:text-gold-300 focus-ring rounded"
            >
              {clientName(client)}
            </Link>
            {signed ? (
              <Badge tone="optimal">
                <CheckCircle2 className="h-3 w-3" />
                Signed
              </Badge>
            ) : (
              // The wait, not the status word. "Awaiting review" is a fact
              // about the record; "waiting 9d" is a fact about the coach.
              <Badge tone={tone}>
                <Clock className="h-3 w-3" />
                waiting <span className="stat-mono">{waiting}d</span>
              </Badge>
            )}
            <Badge tone="neutral">
              <ChannelIcon className="h-3 w-3" />
              {consult.kind}
            </Badge>
          </div>

          {/* The AI's own headline, verbatim. Never paraphrased in the queue —
              the coach must review what the engine actually wrote. */}
          {summary && (
            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink-200">
              {summary.headline}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-ink-500">
            <span className="stat-mono">{formatDateTime(consult.startedAt)}</span>
            <span className="text-ink-700">·</span>
            <span className="stat-mono">{relativeDays(consult.startedAt)}</span>
            {consult.durationMin !== undefined && (
              <>
                <span className="text-ink-700">·</span>
                <span className="stat-mono">{consult.durationMin} min</span>
              </>
            )}
            <span className="text-ink-700">·</span>
            <span className="inline-flex items-center gap-1">
              <FileText className="h-3 w-3" />
              <span className="stat-mono">{findings}</span> finding{findings === 1 ? "" : "s"}
            </span>
            {consult.aiProvenance && (
              <>
                <span className="text-ink-700">·</span>
                <span className="stat-mono" title={`Input hash ${consult.aiProvenance.inputHash}`}>
                  {consult.aiProvenance.engine} v{consult.aiProvenance.engineVersion}
                </span>
              </>
            )}
            {signed && consult.signedBy && (
              <>
                <span className="text-ink-700">·</span>
                <span>signed by {staffName(consult.signedBy)}</span>
              </>
            )}
          </div>
        </div>

        {/* One click to the client's consult — no interstitial, no modal. */}
        <Link href={`/clients/${client.id}`} className="shrink-0">
          <Button size="sm" variant={signed ? "ghost" : "primary"}>
            {signed ? "View" : "Review"}
          </Button>
        </Link>
      </div>
    </div>
  );
}

/**
 * The calls this coach has coming, soonest first.
 *
 * Scoped to `staffId === ME_COACH` and to appointments that have not started.
 * A brief is worth sixty seconds BEFORE a call and nothing at all after it, so
 * anything already begun drops off rather than lingering as a to-do.
 */
function upcomingCallsFor(coachId: string) {
  return appointments
    .filter((a) => a.staffId === coachId && absolute(a.start).getTime() > NOW.getTime())
    .sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
}

export default function CoachConsultsPage() {
  /**
   * Oldest first. `unsignedConsultsFor` returns newest-first, which is the
   * right default for a client's chart history and exactly wrong for a work
   * queue: the note you have owed for eleven days is the one that matters, and
   * newest-first buries it at the bottom where it ages quietly forever.
   */
  const unsigned = React.useMemo(
    () =>
      [...unsignedConsultsFor(ME_COACH)].sort(
        (a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id),
      ),
    [],
  );

  const recentlySigned = React.useMemo(
    () =>
      consults
        .filter((c) => c.authorId === ME_COACH && c.status === "Signed")
        .sort((a, b) => (b.signedAt ?? b.startedAt).localeCompare(a.signedAt ?? a.startedAt))
        .slice(0, 12),
    [],
  );

  const oldest = unsigned.length ? daysWaiting(unsigned[0].startedAt) : 0;

  const upcoming = React.useMemo(() => upcomingCallsFor(ME_COACH), []);

  /**
   * Which call's brief is open.
   *
   * Defaults to the NEXT one rather than to nothing. A coach landing here
   * between calls wants the brief for the call that is about to happen; making
   * them click for it is a step that exists only because the component was
   * easier to write that way.
   */
  const [prepFor, setPrepFor] = React.useState<string | null>(
    () => upcomingCallsFor(ME_COACH)[0]?.clientId ?? null,
  );

  return (
    <div className="space-y-3">
      <FadeIn>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="label-eyebrow">COACH CONSOLE</p>
            <h1 className="mt-0.5 font-display text-xl font-semibold tracking-tight text-ink-50">
              Consults
            </h1>
          </div>
          <p className="text-[11px] text-ink-500">
            Signed consults are immutable — corrections are addenda, never a silent rewrite.
          </p>
        </div>
      </FadeIn>

      <FadeIn delay={0.04}>
        <div className="card grid grid-cols-3 divide-x divide-ink-700/60">
          {[
            {
              label: "Unsigned",
              value: String(unsigned.length),
              tone: unsigned.length ? "text-high" : "text-optimal",
            },
            {
              label: "Oldest wait",
              value: `${oldest}d`,
              tone: oldest >= 7 ? "text-high" : oldest >= 3 ? "text-watch" : "text-ink-50",
            },
            { label: "Recently signed", value: String(recentlySigned.length), tone: "text-ink-50" },
          ].map((s) => (
            <div key={s.label} className="px-3 py-2">
              <p className="label-eyebrow truncate">{s.label}</p>
              <p className={cn("stat-mono mt-0.5 text-xl font-semibold leading-none", s.tone)}>
                {s.value}
              </p>
            </div>
          ))}
        </div>
      </FadeIn>

      {/* --- Prep for your next calls ------------------------------------ */}
      {upcoming.length > 0 && (
        <>
          <FadeIn delay={0.05}>
            <div className="flex flex-wrap items-center gap-2">
              <Timer className="h-3.5 w-3.5 text-gold-300" />
              <h2 className="font-display text-sm font-semibold text-ink-100">
                Prep for your next call
              </h2>
              <span className="stat-mono text-[11px] text-ink-500">
                {upcoming.length} booked · soonest first
              </span>
            </div>
          </FadeIn>

          <FadeIn delay={0.055}>
            {/* Horizontal strip of the booked calls. Scrolls inside its own
                container so a coach with nine appointments never widens the
                page — the body must not scroll sideways at 390px. */}
            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <div className="flex min-w-0 gap-1.5">
                {upcoming.map((a) => {
                  const client = getClient(a.clientId);
                  const active = prepFor === a.clientId;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setPrepFor(active ? null : a.clientId)}
                      className={cn(
                        "focus-ring w-[190px] shrink-0 rounded-xl border px-2.5 py-2 text-left transition-colors",
                        active
                          ? "border-gold-400/40 bg-gold-400/[0.07]"
                          : "border-ink-700 bg-ink-900/40 hover:border-ink-600",
                      )}
                    >
                      <p className="truncate text-[13px] font-medium text-ink-50">
                        {client ? clientName(client) : a.clientName}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-ink-400">{a.type}</p>
                      <p className="stat-mono mt-0.5 text-[10px] text-ink-600">
                        {formatDate(a.start)} · {formatTime(a.start)} · {a.durationMin}m
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </FadeIn>

          {prepFor && (
            <FadeIn delay={0.06}>
              <ConsultPrepBrief clientId={prepFor} coachId={ME_COACH} />
            </FadeIn>
          )}
        </>
      )}

      {/* --- Awaiting your signature ------------------------------------- */}
      <FadeIn delay={0.06}>
        <div className="flex items-center gap-2">
          <PenLine className="h-3.5 w-3.5 text-high" />
          <h2 className="font-display text-sm font-semibold text-ink-100">
            Awaiting your signature
          </h2>
          <span className="stat-mono text-[11px] text-ink-500">
            {unsigned.length} · longest first
          </span>
        </div>
      </FadeIn>

      {unsigned.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6" />}
          title="No consults awaiting signature"
          hint="Every chart you opened is closed."
        />
      ) : (
        <Stagger className="space-y-1.5">
          {unsigned.map((c) => (
            <StaggerItem key={c.id}>
              <ConsultRow consult={c} />
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {/* --- Recently signed --------------------------------------------- */}
      <FadeIn delay={0.08}>
        <div className="flex items-center gap-2 pt-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-optimal" />
          <h2 className="font-display text-sm font-semibold text-ink-100">Recently signed</h2>
          <span className="stat-mono text-[11px] text-ink-500">{recentlySigned.length}</span>
        </div>
      </FadeIn>

      {recentlySigned.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6" />}
          title="Nothing signed yet"
          hint="Signed consults will appear here with their provenance stamp."
        />
      ) : (
        <Stagger className="space-y-1.5">
          {recentlySigned.map((c) => (
            <StaggerItem key={c.id}>
              <ConsultRow consult={c} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}
