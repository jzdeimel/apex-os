"use client";

import { useState } from "react";
import {
  COACH_GROUP_ID,
  challenges,
  groupFor,
  handleFor,
  meetups,
  postsForGroup,
  wins,
} from "@/lib/mock/community";
import { Tabs } from "@/components/ui/Tabs";
import { SwitchView } from "@/components/portal/still";
import { useMe, useMeClient, PortalPageHeader } from "@/components/portal/PortalHeader";
import { usePortal } from "@/lib/portalStore";
import { CommunityPulse } from "@/components/portal/CommunityPulse";
import { WinsWall } from "@/components/community/WinsWall";
import { Challenges } from "@/components/community/Challenges";
import { CoachGroup } from "@/components/community/CoachGroup";
import { Meetups } from "@/components/community/Meetups";
import { Leaderboard } from "@/components/portal/Leaderboard";
import { BattleBuddy } from "@/components/community/BattleBuddy";
import { Milestones } from "@/components/community/Milestones";
import { PhotoWall } from "@/components/community/PhotoWall";
import { Squads } from "@/components/community/Squads";
import { Mentors } from "@/components/community/Mentors";
import { CommunityRoleBrief } from "@/components/community/CommunityRoleBrief";

const TABS = [
  { id: "milestones", label: "Milestones" },
  { id: "photos", label: "Photos" },
  { id: "squads", label: "Squads" },
  { id: "guides", label: "Guides" },
  { id: "wins", label: "Wins" },
  { id: "challenges", label: "Challenges" },
  { id: "group", label: "My group" },
  { id: "meetups", label: "Events" },
];

/** The pinned demo clock, so "upcoming" events are deterministic. */
const COMMUNITY_NOW = "2026-06-12T09:00:00";

const STAFF_HANDLE: Record<string, string> = {
  clinic: "Alpha Medical Team",
  coach: "Alpha Coach Team",
  desk: "Alpha Front Desk",
  exec: "Alpha Leadership",
};

export function CommunityHome() {
  const { portal } = usePortal();
  const meId = useMe();
  const client = useMeClient();
  const [tab, setTab] = useState("milestones");

  const myHandle = handleFor(meId);
  const group = groupFor(meId);
  const posts = postsForGroup(group?.id ?? COACH_GROUP_ID);
  const isMember = portal.id === "patient";
  const staffHandle = isMember ? undefined : STAFF_HANDLE[portal.id] ?? "Alpha Health Team";

  return (
    <div className="space-y-7">
      <PortalPageHeader
        eyebrow="Community"
        title={isMember ? "You're not doing this alone" : "The member community"}
        subtitle={
          isMember
            ? `Training, food and the unglamorous business of showing up, with the people doing it alongside you. You appear here as ${myHandle}, not by name.`
            : "A pseudonymous, behavior-only community view for every role: what members are joining, celebrating, asking and organizing without exposing charts."
        }
      />

      <CommunityRoleBrief
        portalId={portal.id}
        clientId={meId}
        myHandle={myHandle}
        groupName={group?.name ?? "Coach-hosted group"}
      />

      <CommunityPulse />

      {isMember && <BattleBuddy clientId={meId} />}

      <Leaderboard clientId={meId} limit={5} personal={isMember} />

      <Tabs
        tabs={TABS.map((t) =>
          t.id === "wins"
            ? { ...t, count: wins.length }
            : t.id === "meetups"
              ? { ...t, count: meetups.length }
              : t.id === "group" && !isMember
                ? { ...t, label: "Hosted group" }
              : t,
        )}
        active={tab}
        onChange={setTab}
      />

      <SwitchView k={tab}>
        {tab === "milestones" && <Milestones clientId={meId} personal={isMember} />}
        {tab === "photos" && (
          <PhotoWall
            clientId={meId}
            actorId={staffHandle ? `staff-${portal.id}` : meId}
            actorHandle={staffHandle}
          />
        )}
        {tab === "squads" && <Squads clientId={meId} memberActions={isMember} />}
        {tab === "guides" && <Mentors clientId={meId} memberActions={isMember} />}
        {tab === "wins" && <WinsWall wins={wins} />}
        {tab === "challenges" && (
          <Challenges challenges={challenges} myLocationId={client.locationId} />
        )}
        {tab === "group" && group && (
          <CoachGroup group={group} posts={posts} me={client} myHandle={myHandle} staffHandle={staffHandle} />
        )}
        {tab === "meetups" && (
          <Meetups
            nowIso={COMMUNITY_NOW}
            myHandle={staffHandle ?? myHandle}
            myCoachId={client.coachId}
            myLocationId={client.locationId}
          />
        )}
      </SwitchView>

      <p className="max-w-prose border-t border-ink-700/60 pt-5 text-micro leading-relaxed text-ink-500">
        Anything about medication, dosing or lab results goes to the care team, not the group.
        Post it here and Apex offers to route it to a provider instead. What works for someone
        else can be wrong for another member, and nobody in the community can see a chart.
      </p>
    </div>
  );
}
