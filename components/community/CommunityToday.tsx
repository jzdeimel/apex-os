"use client";

import {
  ArrowRight,
  CalendarDays,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Trophy,
  UsersRound,
} from "lucide-react";

import type { PortalId } from "@/lib/portals";
import type { LocationId } from "@/lib/types";
import type { Challenge, GroupPost, Meetup, Win } from "@/lib/community/types";
import { locationName } from "@/lib/mock/locations";
import { Badge, Button, Card, CardContent } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";

type CommunityTab =
  | "milestones"
  | "photos"
  | "squads"
  | "guides"
  | "wins"
  | "challenges"
  | "group"
  | "meetups";

/**
 * A useful front door for Community.
 *
 * The individual modules are intentionally deep, but eight equal-weight tabs
 * make a member do product archaeology before they find the one thing worth
 * doing today. This view ranks the next event, the active team challenge, the
 * hosted conversation and recent wins, then hands off to the existing guarded
 * surfaces. It creates no new disclosure boundary: handles stay pseudonymous,
 * group posts still pass through the clinical-content guard, and the cards
 * never receive a client id or chart data.
 */
export function CommunityToday({
  portalId,
  myLocationId,
  groupName,
  wins,
  challenges,
  events,
  posts,
  onOpen,
}: {
  portalId: PortalId;
  myLocationId: LocationId;
  groupName: string;
  wins: Win[];
  challenges: Challenge[];
  events: Meetup[];
  posts: GroupPost[];
  onOpen: (tab: CommunityTab) => void;
}) {
  const isMember = portalId === "patient";
  const nextEvent = [...events]
    .filter((event) => event.virtual || event.locationId === myLocationId)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ??
    [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  const challenge = challenges[0];
  const team = challenge?.teams.find((candidate) => candidate.locationId === myLocationId);
  const latestPosts = [...posts].sort((a, b) => b.postedAt.localeCompare(a.postedAt)).slice(0, 2);
  const latestWins = [...wins].sort((a, b) => b.postedAt.localeCompare(a.postedAt)).slice(0, 3);

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <ActionCard
          icon={<CalendarDays className="h-4 w-4" />}
          eyebrow="Next event"
          title={nextEvent?.title ?? "Nothing scheduled yet"}
          detail={
            nextEvent
              ? `${formatDateTime(nextEvent.startsAt)} · ${
                  nextEvent.virtual ? "Virtual" : locationName(nextEvent.locationId)
                }`
              : "Create the first community event for your location."
          }
          action={nextEvent ? "View & RSVP" : "Create an event"}
          onClick={() => onOpen("meetups")}
          tone="gold"
        />

        <ActionCard
          icon={<Trophy className="h-4 w-4" />}
          eyebrow="Team challenge"
          title={challenge?.name ?? "No active challenge"}
          detail={
            challenge && team
              ? `${locationName(team.locationId)} is at ${Math.round(
                  (team.total / Math.max(1, team.goal)) * 100,
                )}% with ${team.participants} people contributing.`
              : "Challenges count team participation, never individual rankings."
          }
          action="Open challenge"
          onClick={() => onOpen("challenges")}
          tone="optimal"
        />

        <ActionCard
          icon={<UsersRound className="h-4 w-4" />}
          eyebrow={isMember ? "Your hosted circle" : "Moderated conversation"}
          title={groupName}
          detail={`${posts.length} posts · medication and lab questions are routed privately to the care team.`}
          action={isMember ? "Join the conversation" : "Review the group"}
          onClick={() => onOpen("group")}
          tone="info"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="label-eyebrow flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-gold-300" />
                  Fresh wins
                </p>
                <h3 className="mt-1 font-display text-heading font-semibold text-ink-50">
                  Proof that the boring middle works
                </h3>
              </div>
              <Button size="sm" variant="ghost" onClick={() => onOpen("wins")}>
                See all <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="mt-4 space-y-2">
              {latestWins.map((win) => (
                <button
                  type="button"
                  key={win.id}
                  onClick={() => onOpen("wins")}
                  className="focus-ring flex w-full items-start gap-3 rounded-lg border border-ink-800 bg-ink-900/45 p-3 text-left transition-colors hover:border-ink-700"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold-400/12 font-display text-detail font-semibold text-gold-200">
                    {win.handle.slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-medium text-ink-100">{win.headline}</span>
                    <span className="mt-0.5 block text-micro text-ink-500">
                      {win.handle} · {win.category} · {win.cheers} cheers
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="label-eyebrow flex items-center gap-1.5">
                  <MessageCircle className="h-3.5 w-3.5 text-optimal" />
                  In your group
                </p>
                <h3 className="mt-1 font-display text-heading font-semibold text-ink-50">
                  Coach-hosted, not an open forum
                </h3>
              </div>
              <Badge tone="optimal">
                <ShieldCheck className="h-3 w-3" /> Moderated
              </Badge>
            </div>

            <div className="mt-4 space-y-3">
              {latestPosts.map((post) => (
                <button
                  type="button"
                  key={post.id}
                  onClick={() => onOpen("group")}
                  className="focus-ring block w-full rounded-lg border border-ink-800 bg-ink-900/45 p-3 text-left transition-colors hover:border-ink-700"
                >
                  <span className="flex flex-wrap items-center gap-2 text-detail">
                    <span className="font-medium text-ink-100">{post.handle}</span>
                    {post.author === "coach" && <Badge tone="gold">Coach</Badge>}
                  </span>
                  <span className="mt-1.5 line-clamp-2 block text-body leading-relaxed text-ink-400">
                    {post.body}
                  </span>
                </button>
              ))}
            </div>

            <p className="mt-4 flex items-start gap-2 rounded-lg border border-ink-800 bg-ink-950/45 p-3 text-micro leading-relaxed text-ink-500">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-optimal" />
              Community never shows charts, legal names by default, doses or lab results. A
              clinical question is redirected into an owned private escalation.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function ActionCard({
  icon,
  eyebrow,
  title,
  detail,
  action,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  detail: string;
  action: string;
  onClick: () => void;
  tone: "gold" | "optimal" | "info";
}) {
  const tones = {
    gold: "border-gold-400/25 bg-gold-400/[0.045] text-gold-300",
    optimal: "border-optimal/25 bg-optimal/[0.045] text-optimal",
    info: "border-info/25 bg-info/[0.045] text-info",
  } as const;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`focus-ring group rounded-panel border p-5 text-left transition-colors hover:border-ink-600 ${tones[tone]}`}
    >
      <span className="flex items-center gap-2 text-micro font-semibold uppercase tracking-[0.12em]">
        {icon} {eyebrow}
      </span>
      <span className="mt-3 block font-display text-heading font-semibold text-ink-50">{title}</span>
      <span className="mt-1.5 block min-h-10 text-detail leading-relaxed text-ink-400">{detail}</span>
      <span className="mt-4 inline-flex items-center gap-1.5 text-detail font-medium text-ink-200 transition-colors group-hover:text-gold-200">
        {action} <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}
