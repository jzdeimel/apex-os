import type { MockMindbodyRecord } from "@/lib/types";
import { clients } from "@/lib/mock/clients";
import { seededRandom } from "@/lib/utils";

const TIERS: MockMindbodyRecord["membershipType"][] = [
  "Single Visit",
  "Alpha Monthly",
  "Alpha Elite",
  "Alpha Concierge",
];

// Simulated Mindbody source-of-record. In production this would sync via API.
export const mindbodyRecords: MockMindbodyRecord[] = clients.map((c) => {
  const rand = seededRandom(c.id + "mb");
  const tierIdx =
    c.lifetimeValue > 9000 ? 3 : c.lifetimeValue > 5000 ? 2 : c.lifetimeValue > 1000 ? 1 : 0;
  const statusRoll = rand();
  return {
    mindbodyId: c.mindbodyId,
    clientId: c.id,
    membershipType: TIERS[tierIdx],
    lastSyncedAt: "2026-06-12T06:00:00",
    source: "Mindbody (simulated)",
    visitsYTD: Math.round(2 + rand() * 22),
    lifetimeSpend: c.lifetimeValue,
    status: statusRoll > 0.9 ? "Conflict" : statusRoll > 0.78 ? "Pending Sync" : "Synced",
  };
});

export const mindbodyByClient = Object.fromEntries(
  mindbodyRecords.map((m) => [m.clientId, m]),
);

export function mindbodyForClient(clientId: string) {
  return mindbodyByClient[clientId];
}
