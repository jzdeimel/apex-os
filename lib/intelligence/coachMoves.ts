import { clients, clientName } from "@/lib/mock/clients";
import { triageScore, churnRisk, nextBestAction } from "@/lib/aiInsights";
import type { NextMove } from "@/lib/intelligence/types";
import { toneForScore } from "@/lib/intelligence/types";

export function coachMoves(coachId: string, limit = 4): NextMove[] {
  return clients
    .filter((c) => c.coachId === coachId)
    .map((client) => {
      const triage = triageScore(client);
      const churn = churnRisk(client);
      const nba = nextBestAction(client);
      const priority = triage.score + churn.score * 0.55;
      return {
        priority,
        move: {
          id: `coach-${client.id}`,
          owner: nba.owner,
          title: `${clientName(client)}: ${nba.action}`,
          detail: [nba.reason, ...triage.factors, ...churn.drivers].slice(0, 2).join(" "),
          href: `/clients/${client.id}`,
          metric: `${Math.round(priority)} attention`,
          tone: toneForScore(priority),
          icon: churn.level === "high" ? "shield" : triage.score >= 45 ? "spark" : "message",
        } satisfies NextMove,
      };
    })
    .sort((a, b) => b.priority - a.priority || a.move.id.localeCompare(b.move.id))
    .slice(0, limit)
    .map((x) => x.move);
}
