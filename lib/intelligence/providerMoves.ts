import type { Client } from "@/lib/types";
import { clients, clientName, clientMap } from "@/lib/mock/clients";
import { staffMap } from "@/lib/mock/staff";
import { consults } from "@/lib/mock/consults";
import { seededRecommendations, recommendationsForClient } from "@/lib/mock/recommendations";
import { triageScore } from "@/lib/aiInsights";
import type { NextMove } from "@/lib/intelligence/types";
import { toneForScore } from "@/lib/intelligence/types";

function pendingRecs(clientId: string) {
  return recommendationsForClient(clientId).filter(
    (r) => r.status === "draft" || r.status === "coach reviewed",
  );
}

export function providerMoves(providerId: string, limit = 5): NextMove[] {
  const provider = staffMap[providerId];
  const scope = new Set(provider?.locationIds ?? []);
  const inScope = (client?: Client): client is Client =>
    Boolean(client && (client.providerId === providerId || scope.has(client.locationId)));

  const unsigned = consults
    .filter((c) => c.status !== "Signed")
    .flatMap((consult) => {
      const client = clientMap[consult.clientId];
      return inScope(client) ? [{ consult, client }] : [];
    })
    .slice(0, 3)
    .map(({ consult, client }) => ({
      weight: 900,
      move: {
        id: `provider-consult-${consult.id}`,
        owner: provider?.name ?? "Provider",
        title: `Sign ${clientName(client)}'s consult`,
        detail: consult.aiSummary?.headline ?? consult.rawNotes.slice(0, 140),
        href: "/clinic/sign",
        metric: consult.status,
        tone: "high",
        icon: "signature",
      } satisfies NextMove,
    }));

  const recs = seededRecommendations
    .filter((r) => r.status === "draft" || r.status === "coach reviewed")
    .flatMap((rec) => {
      const client = clientMap[rec.clientId];
      return inScope(client) ? [{ rec, client }] : [];
    })
    .sort((a, b) => b.rec.confidence - a.rec.confidence || a.rec.id.localeCompare(b.rec.id))
    .slice(0, 3)
    .map(({ rec, client }) => ({
      weight: 760 + Math.round(rec.confidence * 100),
      move: {
        id: `provider-rec-${rec.id}`,
        owner: provider?.name ?? "Provider",
        title: `Review ${rec.title}`,
        detail: `${clientName(client)} - ${rec.rationale}`,
        href: "/clinic/sign",
        metric: `${Math.round(rec.confidence * 100)}% sourced`,
        tone: rec.riskLevel === "high" || rec.riskLevel === "moderate" ? "watch" : "info",
        icon: "flask",
      } satisfies NextMove,
    }));

  const clinical = clients
    .filter(inScope)
    .map((client) => ({ client, triage: triageScore(client), pending: pendingRecs(client.id).length }))
    .filter((x) => x.triage.score >= 45 || x.pending > 0)
    .sort((a, b) => b.triage.score - a.triage.score || a.client.id.localeCompare(b.client.id))
    .slice(0, 3)
    .map(({ client, triage, pending }) => ({
      weight: 620 + triage.score,
      move: {
        id: `provider-client-${client.id}`,
        owner: provider?.name ?? "Provider",
        title: `${clientName(client)} needs clinical review`,
        detail: triage.factors[0] ?? `${pending} recommendation(s) awaiting decision.`,
        href: `/clients/${client.id}`,
        metric: `${triage.score} triage`,
        tone: toneForScore(triage.score),
        icon: "shield",
      } satisfies NextMove,
    }));

  return [...unsigned, ...recs, ...clinical]
    .sort((a, b) => b.weight - a.weight || a.move.id.localeCompare(b.move.id))
    .slice(0, limit)
    .map((x) => x.move);
}
