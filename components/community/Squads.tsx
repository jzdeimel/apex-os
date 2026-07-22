"use client";

import { Syringe, Flame, Shield, Dumbbell, FlaskConical, Users, Check, Plus } from "lucide-react";
import { Card, CardContent, Badge, Button, Progress } from "@/components/ui/primitives";
import { Stagger, StaggerItem } from "@/components/motion";
import { useToast } from "@/components/ui/Toast";
import { useSquads, postTime, handleFor, type Squad, type SquadIcon } from "@/lib/community/squads";
import { relativeDays } from "@/lib/utils";

/**
 * Squads — small groups around a shared goal. Join one and its thread + members
 * open up; the ones you haven't joined show enough to make you want to.
 */

const ICON: Record<SquadIcon, typeof Syringe> = {
  cycle: Syringe,
  cut: Flame,
  over40: Shield,
  strength: Dumbbell,
  peptide: FlaskConical,
};

export function Squads({
  clientId,
  memberActions = true,
}: {
  clientId: string;
  memberActions?: boolean;
}) {
  const { toast } = useToast();
  const { squads, isJoined, toggle, hydrated } = useSquads();

  return (
    <div className="space-y-4">
      <p className="max-w-prose text-body leading-relaxed text-ink-400">
        Smaller than the whole community, more honest than a feed. Join the room that fits where you
        are — you can be in more than one.
      </p>
      <Stagger className="space-y-4">
        {squads.map((s) => (
          <StaggerItem key={s.id}>
            <SquadCard
              squad={s}
              clientId={clientId}
              memberActions={memberActions}
              joined={hydrated && isJoined(s.id)}
              onToggle={() => {
                const was = isJoined(s.id);
                toggle(s.id);
                if (!was) toast(`Joined ${s.name}`, { desc: s.tagline });
              }}
            />
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}

function SquadCard({
  squad,
  clientId,
  memberActions,
  joined,
  onToggle,
}: {
  squad: Squad;
  clientId: string;
  memberActions: boolean;
  joined: boolean;
  onToggle: () => void;
}) {
  const Icon = ICON[squad.icon];
  const memberCount = squad.memberClientIds.length + (joined ? 1 : 0);
  const inSquad = squad.memberClientIds.includes(clientId) || joined || !memberActions;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold-500/12 text-gold-300">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-heading font-semibold tracking-tight text-ink-50">{squad.name}</h3>
              <p className="mt-0.5 text-detail leading-relaxed text-ink-400">{squad.tagline}</p>
            </div>
          </div>
          {memberActions ? (
          <Button size="sm" variant={joined ? "success" : "primary"} onClick={onToggle}>
            {joined ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {joined ? "Joined" : "Join"}
          </Button>
          ) : (
            <Badge tone="neutral">Staff view</Badge>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2 text-micro text-ink-500">
          <Users className="h-3.5 w-3.5" />
          <span className="stat-mono">{memberCount}</span> in this squad
        </div>

        {/* Squad challenge */}
        <div className="mt-3 rounded-control border border-ink-800 bg-ink-900/40 p-3">
          <div className="flex items-center justify-between">
            <p className="text-detail font-medium text-ink-100">{squad.challenge.title}</p>
            <span className="stat-mono text-micro text-gold-300">{squad.challenge.pct}%</span>
          </div>
          <p className="mt-0.5 text-micro text-ink-500">{squad.challenge.detail}</p>
          <Progress className="mt-2" value={squad.challenge.pct} tone="gold" />
        </div>

        {/* Thread — only once you're in the room. */}
        {inSquad && squad.thread.length > 0 && (
          <div className="mt-3 space-y-2 border-t border-ink-800/70 pt-3">
            {squad.thread.map((post, i) => (
              <div key={i} className="flex gap-2.5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink-800 text-micro font-semibold text-ink-300">
                  {post.handle.slice(0, 2)}
                </span>
                <div className="min-w-0">
                  <p className="text-detail leading-relaxed text-ink-200">
                    <span className="font-medium text-ink-50">{post.handle}</span>{" "}
                    <span className="text-ink-600">· {relativeDays(postTime(post.atDaysAgo))}</span>
                  </p>
                  <p className="text-detail leading-relaxed text-ink-400">{post.body}</p>
                </div>
              </div>
            ))}
            {memberActions && (
              <p className="pl-9 text-micro text-ink-600">You&apos;re in — say something when you&apos;re ready.</p>
            )}
          </div>
        )}
        {memberActions && !inSquad && (
          <Badge tone="neutral" className="mt-3">
            Join to see the conversation
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
