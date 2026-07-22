"use client";

import { motion } from "framer-motion";
import {
  CalendarDays,
  HeartHandshake,
  MessageSquareWarning,
  ShieldCheck,
  Sparkles,
  Trophy,
  UsersRound,
} from "lucide-react";
import type { PortalId } from "@/lib/portals";
import {
  challenges,
  COACH_GROUP_ID,
  communityHandles,
  meetups,
  postsForGroup,
  wins,
} from "@/lib/mock/community";
import { levelFor } from "@/lib/play/levels";
import { Badge, Progress } from "@/components/ui/primitives";
import { cn, formatDateShort } from "@/lib/utils";

const ROLE_COPY: Record<
  PortalId,
  {
    label: string;
    title: string;
    detail: string;
    tone: "gold" | "optimal" | "watch" | "low" | "neutral";
  }
> = {
  patient: {
    label: "Member view",
    title: "Your social loop",
    detail: "Use the room for habits, food, training, events and wins. Medical questions still go to your care team.",
    tone: "optimal",
  },
  coach: {
    label: "Coach view",
    title: "Retention happens between visits",
    detail: "Watch where members are showing up, amplify wins, and turn clinical questions into owned escalations.",
    tone: "watch",
  },
  clinic: {
    label: "Clinical view",
    title: "Community without clinical advice",
    detail: "The feed stays pseudonymous and behavior-only; medication and lab questions are routed instead of published.",
    tone: "gold",
  },
  desk: {
    label: "Front desk view",
    title: "A reason to come back",
    detail: "Use events, squads and local wins as safe conversation starters when members are waiting or checking out.",
    tone: "low",
  },
  exec: {
    label: "Owner view",
    title: "The retention layer",
    detail: "A quick read on participation, live events and member-created momentum without turning it into PHI.",
    tone: "neutral",
  },
};

const TONE_CLASS: Record<PortalId, string> = {
  patient: "border-optimal/30 bg-optimal/[0.05]",
  coach: "border-watch/30 bg-watch/[0.05]",
  clinic: "border-gold-400/30 bg-gold-400/[0.05]",
  desk: "border-low/30 bg-low/[0.05]",
  exec: "border-ink-500/30 bg-ink-200/[0.04]",
};

export function CommunityRoleBrief({
  portalId,
  clientId,
  myHandle,
  groupName,
}: {
  portalId: PortalId;
  clientId: string;
  myHandle: string;
  groupName: string;
}) {
  const role = ROLE_COPY[portalId];
  const opted = communityHandles.filter((h) => h.optedIn);
  const level = levelFor(clientId);
  const groupPosts = postsForGroup(COACH_GROUP_ID).length;
  const nextEvent = [...meetups].sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  const progress = Math.min(100, Math.round((wins.length / Math.max(1, opted.length)) * 100));

  const metrics = [
    {
      label: "Taking part",
      value: opted.length.toLocaleString("en-US"),
      hint: "opted-in handles",
      icon: UsersRound,
    },
    {
      label: "Wins posted",
      value: wins.length.toLocaleString("en-US"),
      hint: "public, pseudonymous",
      icon: Trophy,
    },
    {
      label: "Events live",
      value: meetups.length.toLocaleString("en-US"),
      hint: nextEvent ? `next ${formatDateShort(nextEvent.startsAt)}` : "none scheduled",
      icon: CalendarDays,
    },
    {
      label: "Group posts",
      value: groupPosts.toLocaleString("en-US"),
      hint: "coach-hosted",
      icon: MessageSquareWarning,
    },
  ];

  const signals =
    portalId === "patient"
      ? [
          `You post as ${myHandle}`,
          level ? `Level ${level.level}: ${level.name}` : "Progress stays behavior-only",
          `${groupName} is your hosted room`,
        ]
      : [
          "Members appear by handle, not legal name",
          "No lab values, dosing or protocols appear in the feed",
          `${challenges.length} active challenge${challenges.length === 1 ? "" : "s"} create non-clinical momentum`,
        ];

  return (
    <section className={cn("overflow-hidden rounded-panel border", TONE_CLASS[portalId])}>
      <div className="grid grid-cols-1 gap-px bg-ink-800/60 xl:grid-cols-[0.95fr_1.35fr]">
        <div className="bg-ink-950/65 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={role.tone}>{role.label}</Badge>
            <Badge tone="neutral">
              <ShieldCheck className="h-3 w-3" />
              Pseudonymous
            </Badge>
          </div>
          <h2 className="mt-4 font-display text-title font-semibold leading-tight text-ink-50">
            {role.title}
          </h2>
          <p className="mt-2 max-w-prose text-body leading-relaxed text-ink-400">{role.detail}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {signals.map((signal) => (
              <span
                key={signal}
                className="inline-flex items-center gap-1.5 rounded-control border border-ink-700 bg-ink-900/55 px-2.5 py-1 text-micro text-ink-300"
              >
                <Sparkles className="h-3 w-3 text-gold-300" />
                {signal}
              </span>
            ))}
          </div>
        </div>

        <div className="bg-ink-900/55 p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {metrics.map((metric, index) => {
              const Icon = metric.icon;
              return (
                <motion.div
                  key={metric.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.32, delay: index * 0.045, ease: [0.22, 1, 0.36, 1] }}
                  className="rounded-lg border border-ink-800 bg-ink-950/45 p-3"
                >
                  <p className="label-eyebrow flex items-center gap-1.5 truncate">
                    <Icon className="h-3 w-3" />
                    {metric.label}
                  </p>
                  <p className="stat-mono mt-2 text-title font-semibold leading-none text-ink-50">
                    {metric.value}
                  </p>
                  <p className="mt-1 truncate text-micro text-ink-500" title={metric.hint}>
                    {metric.hint}
                  </p>
                </motion.div>
              );
            })}
          </div>

          <div className="mt-4 rounded-lg border border-ink-800 bg-ink-950/35 p-3.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="label-eyebrow flex items-center gap-1.5">
                <HeartHandshake className="h-3 w-3" />
                Momentum density
              </p>
              <span className="stat-mono text-micro text-ink-500">{progress}%</span>
            </div>
            <Progress value={progress} tone={portalId === "desk" ? "low" : "gold"} />
            <p className="mt-2 text-micro leading-relaxed text-ink-500">
              Wins per opted-in handle. This is a demo signal for participation, not a clinical
              outcome score.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
