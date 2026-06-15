import type { TimelineEvent, TimelineEventType, ClientStatus } from "@/lib/types";
import { clients } from "@/lib/mock/clients";

// How far through the journey each status implies the client has progressed.
const JOURNEY: TimelineEventType[] = [
  "Lead created",
  "Consult booked",
  "Intake submitted",
  "Labs ordered",
  "Results received",
  "Body scan completed",
  "AI recommendations generated",
  "Coach reviewed",
  "Provider approved",
  "Follow-up scheduled",
];

const STATUS_DEPTH: Record<ClientStatus, number> = {
  Lead: 1,
  "Consult Booked": 2,
  "Labs Ordered": 4,
  "Results Ready": 6,
  "Plan Review": 8,
  "Active Protocol": 10,
  "Follow-Up Due": 10,
  Inactive: 10,
};

const DETAIL: Record<TimelineEventType, string> = {
  "Lead created": "Lead captured from website intake quiz.",
  "Consult booked": "Initial consultation scheduled.",
  "Intake submitted": "Health history & goals intake completed.",
  "Labs ordered": "Alpha Base Panel ordered.",
  "Results received": "Lab results resulted and attached to chart.",
  "Body scan completed": "InBody body composition scan recorded.",
  "AI recommendations generated": "AI-assisted recommendations generated for provider/coach review.",
  "Coach reviewed": "Coach reviewed recommendations and added notes.",
  "Provider approved": "Licensed provider reviewed and approved protocol direction.",
  "Follow-up scheduled": "Follow-up visit scheduled.",
};

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 19);
}

export const timelineEvents: TimelineEvent[] = clients.flatMap((c) => {
  const depth = STATUS_DEPTH[c.status];
  const start = c.joinedOn;
  const events: TimelineEvent[] = [];
  for (let i = 0; i < depth; i++) {
    const type = JOURNEY[i];
    // Spread events across the client's tenure, weighting later ones near labs.
    const day = Math.round((i + 1) * 6 + (i > 3 ? 8 : 0));
    const actor =
      type === "Provider approved"
        ? c.providerId
        : type === "Coach reviewed"
          ? c.coachId
          : undefined;
    events.push({
      id: `tl-${c.id}-${i}`,
      clientId: c.id,
      type,
      detail: DETAIL[type],
      at: addDays(start, day),
      actorId: actor,
    });
  }
  return events;
});

export function timelineForClient(clientId: string): TimelineEvent[] {
  return timelineEvents
    .filter((e) => e.clientId === clientId)
    .sort((a, b) => b.at.localeCompare(a.at));
}

export const recentActivity = [...timelineEvents]
  .sort((a, b) => b.at.localeCompare(a.at))
  .slice(0, 12);

export const timelineCount = timelineEvents.length;
