import type { Recommendation } from "@/lib/types";
import { clients } from "@/lib/mock/clients";
import { getLabsForClient } from "@/lib/mock/labs";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { inventory } from "@/lib/mock/inventory";
import { recommendationRules } from "@/lib/rules";
import { generateRecommendations } from "@/lib/recommendationEngine";

// Pre-generate recommendations for every client deterministically.
export const allRecommendations: Recommendation[] = clients.flatMap((c) =>
  generateRecommendations(
    c,
    getLabsForClient(c.id),
    getScanForClient(c.id),
    inventory,
    recommendationRules,
  ),
);

// Seed a realistic distribution of review statuses so the queue looks lived-in.
// (The interactive store lets the user change these at runtime.)
const STATUS_SEED: Record<string, Recommendation["status"]> = {
  "c-001": "provider approved",
  "c-003": "coach reviewed",
  "c-004": "provider approved",
  "c-005": "coach reviewed",
  "c-007": "provider approved",
  "c-011": "provider approved",
  "c-013": "coach reviewed",
  "c-014": "provider approved",
  "c-019": "provider approved",
  "c-021": "coach reviewed",
  "c-024": "provider approved",
};

export const seededRecommendations: Recommendation[] = allRecommendations.map((r) => {
  const seed = STATUS_SEED[r.clientId];
  // Leave "Results Ready" / fresh clients in draft to populate the review queue.
  return seed ? { ...r, status: seed } : r;
});

export function recommendationsForClient(clientId: string): Recommendation[] {
  return seededRecommendations.filter((r) => r.clientId === clientId);
}

export const pendingApprovalCount = seededRecommendations.filter(
  (r) => r.status === "draft" || r.status === "coach reviewed",
).length;
