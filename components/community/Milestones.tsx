"use client";

import { useMemo } from "react";
import {
  Trophy,
  CalendarCheck,
  Scale,
  Flame,
  Zap,
  Dumbbell,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, Badge } from "@/components/ui/primitives";
import { Stagger, StaggerItem } from "@/components/motion";
import { KudosButton } from "@/components/community/KudosButton";
import { milestoneFeed, milestonesFor, type Milestone, type MilestoneKind } from "@/lib/community/milestones";
import { handleFor } from "@/lib/mock/community";
import { formatDate, relativeDays } from "@/lib/utils";

/**
 * The milestone feed — progress, witnessed. The viewer's own milestones sit at
 * the top (theirs to be proud of), then the community's recent ones, each with
 * one-tap kudos. Handle-based throughout.
 */

const ICON: Record<MilestoneKind, typeof Trophy> = {
  "protocol-30": CalendarCheck,
  "protocol-90": CalendarCheck,
  "protocol-180": CalendarCheck,
  "protocol-365": Trophy,
  "weight-10": Scale,
  "weight-25": Scale,
  "streak-7": Flame,
  "streak-30": Flame,
  "energy-up": Zap,
  "first-pr": Dumbbell,
  welcome: Sparkles,
};

export function Milestones({ clientId, personal = true }: { clientId: string; personal?: boolean }) {
  const mine = useMemo(() => milestonesFor(clientId), [clientId]);
  const feed = useMemo(() => milestoneFeed(40), []);
  const myHandle = handleFor(clientId);

  // The community feed minus the viewer's own (those are shown above).
  const others = feed.filter((m) => m.clientId !== clientId);

  return (
    <div className="space-y-6">
      {personal && mine.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-heading text-ink-50">
            <Trophy className="h-4 w-4 text-gold-400" /> Your milestones
          </h3>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {mine.slice(0, 6).map((m) => (
              <MilestoneRow key={m.id} m={m} mine />
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-1 flex items-center gap-2 text-heading text-ink-50">
          <Sparkles className="h-4 w-4 text-gold-400" /> The community, this month
        </h3>
        <p className="mb-3 text-detail text-ink-500">
          Every one of these is a real person, further along than they were.
          {personal ? ` You appear here as ${myHandle}.` : " Members appear by handle, never by name."}
        </p>
        <Stagger className="space-y-2.5">
          {others.map((m) => (
            <StaggerItem key={m.id}>
              <MilestoneRow m={m} />
            </StaggerItem>
          ))}
        </Stagger>
      </section>
    </div>
  );
}

function MilestoneRow({ m, mine }: { m: Milestone; mine?: boolean }) {
  const Icon = ICON[m.kind] ?? Trophy;
  return (
    <Card className={mine ? "border-gold-400/20" : undefined}>
      <CardContent className="flex items-center gap-3 p-3.5">
        <span
          className={
            "grid h-9 w-9 shrink-0 place-items-center rounded-full " +
            (mine ? "bg-gold-400/15 text-gold-300" : "bg-ink-800 text-ink-300")
          }
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body text-ink-100">
            <span className="font-medium text-ink-50">{mine ? "You" : m.handle}</span>{" "}
            <span className="text-ink-400">hit</span>{" "}
            <span className="font-medium text-ink-50">{m.label}</span>
          </p>
          <p className="truncate text-micro text-ink-500">
            {m.detail} · {relativeDays(m.achievedAt)}
          </p>
        </div>
        {!mine && <KudosButton itemId={m.id} />}
        {mine && <Badge tone="gold">Yours</Badge>}
      </CardContent>
    </Card>
  );
}
