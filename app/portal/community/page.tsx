"use client";

/**
 * Community — the member-facing surface.
 *
 * ── What this page is for ─────────────────────────────────────────────────
 * Everything else in the portal is about the member's own body: their labs,
 * their plan, their numbers. This is the only page about everyone else, and it
 * covers the 80% of the journey that is not medical — training, food,
 * consistency, showing up. That 80% is where retention actually lives. Members
 * do not quit because a protocol stopped working; they quit in month four
 * because nothing about the process felt like theirs.
 *
 * ── And what it is deliberately not ───────────────────────────────────────
 * It is not a place to discuss what anyone is taking. Every tab here is built
 * so that conversation cannot start: wins have no clinical fields and no reply
 * box, challenges compare group totals rather than bodies, and the only place
 * a member can type free text runs through lib/community/guard.ts first, which
 * routes anything clinical to their provider as an escalation with an SLA on
 * it instead of publishing it.
 *
 * The tab order is the argument: wins (proof other people are still here),
 * challenges (a reason to move today), the group (a human who answers), then
 * meetups (the thing that actually changes attrition).
 */

import { useState } from "react";
import { COACH_GROUP_ID, challenges, groupFor, handleFor, meetups, postsForGroup, wins } from "@/lib/mock/community";
import { Tabs } from "@/components/ui/Tabs";
import { SwitchView } from "@/components/motion";
import { ME, me, PortalPageHeader } from "@/components/portal/PortalHeader";
import { WinsWall } from "@/components/community/WinsWall";
import { Challenges } from "@/components/community/Challenges";
import { CoachGroup } from "@/components/community/CoachGroup";
import { Meetups } from "@/components/community/Meetups";

const TABS = [
  { id: "wins", label: "Wins" },
  { id: "challenges", label: "Challenges" },
  { id: "group", label: "My group" },
  { id: "meetups", label: "Meetups" },
];

export default function PortalCommunityPage() {
  const client = me();
  const [tab, setTab] = useState("wins");

  // The identity substitution happens once, here, at the boundary. Nothing
  // below this line receives a clientId except CoachGroup, which needs it only
  // to address an escalation to the member's own provider — never to render.
  const myHandle = handleFor(ME);
  const group = groupFor(ME);
  const posts = postsForGroup(group?.id ?? COACH_GROUP_ID);

  return (
    <div className="space-y-7">
      <PortalPageHeader
        eyebrow="Community"
        title="You're not doing this alone"
        subtitle={`Training, food and the unglamorous business of showing up — with the people doing it alongside you. You appear here as ${myHandle}, not by name.`}
      />

      <Tabs
        tabs={TABS.map((t) =>
          t.id === "wins"
            ? { ...t, count: wins.length }
            : t.id === "meetups"
              ? { ...t, count: meetups.length }
              : t,
        )}
        active={tab}
        onChange={setTab}
      />

      <SwitchView k={tab}>
        {tab === "wins" && <WinsWall wins={wins} />}
        {tab === "challenges" && (
          <Challenges challenges={challenges} myLocationId={client.locationId} />
        )}
        {tab === "group" && group && (
          <CoachGroup group={group} posts={posts} me={client} myHandle={myHandle} />
        )}
        {tab === "meetups" && <Meetups meetups={meetups} />}
      </SwitchView>

      {/* The rule, said plainly to the member once per page rather than only at
          the moment they trip it. People follow a norm they were told about;
          they resent one they only discover by being blocked. */}
      <p className="max-w-prose border-t border-ink-700/60 pt-5 text-xs leading-relaxed text-ink-500">
        Anything about medication, dosing or your lab results goes to your care team, not the
        group — post it here and we&apos;ll offer to send it straight to your provider instead.
        What works for someone else can be wrong for you, and nobody here can see your chart.
      </p>
    </div>
  );
}
