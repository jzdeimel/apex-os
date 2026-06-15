import { clients, clientName } from "@/lib/mock/clients";
import { labByClient } from "@/lib/mock/labs";
import { seededRecommendations } from "@/lib/mock/recommendations";
import { inventory } from "@/lib/mock/inventory";
import { locationName } from "@/lib/mock/locations";
import { formatDate } from "@/lib/utils";
import { rankByTriage, rankByChurn, nextBestAction, cohortAnalytics } from "@/lib/aiInsights";
import { sourcingForecasts, draftReorderPOs } from "@/lib/aiSourcing";
import { generateVisitSummary, visitSummaryToText } from "@/lib/aiDrafts";

export interface AgentBlock {
  text: string;
  citations?: string[];
}

export interface AgentResponse {
  blocks: AgentBlock[];
}

export const SUGGESTED_PROMPTS = [
  "Summarize today's clients who need attention",
  "Give me today's Next-Best-Actions",
  "Which clients are at churn risk?",
  "Which clients have lab results ready?",
  "Which recommendations need provider approval?",
  "Find clients with low energy goals and abnormal vitamin D",
  "Forecast peptide reorders this week",
  "What inventory is at risk this week?",
  "Summarize population health trends",
  "Draft a visit summary for the top-priority client",
];

const DISCLAIMER =
  "Note: AI-assisted, from mock data only. Not medical advice — all clinical actions require licensed provider review.";

export function answerFor(prompt: string): AgentResponse {
  switch (prompt) {
    case "Summarize today's clients who need attention": {
      const attention = clients.filter((c) =>
        ["Results Ready", "Follow-Up Due", "Plan Review"].includes(c.status),
      );
      return {
        blocks: [
          {
            text: `${attention.length} clients need attention today across all locations. The priority list:`,
          },
          ...attention.slice(0, 6).map((c) => ({
            text: `• ${clientName(c)} (${locationName(c.locationId)}) — ${c.status}${c.riskFlags[0] ? `; ${c.riskFlags[0].label} flag: ${c.riskFlags[0].detail}` : ""}`,
            citations: [`Client: ${clientName(c)}, ${c.mindbodyId}`],
          })),
          { text: DISCLAIMER },
        ],
      };
    }

    case "Give me today's Next-Best-Actions": {
      const ranked = rankByTriage(clients).slice(0, 6);
      return {
        blocks: [
          { text: `Top ${ranked.length} clients by AI triage score, with the single next-best-action for each:` },
          ...ranked.map((t) => {
            const c = t.client;
            const nba = nextBestAction(c);
            return {
              text: `• [${t.score}] ${clientName(c)} — ${nba.action} (${nba.owner}). ${nba.reason}`,
              citations: [`Triage: ${clientName(c)}, score ${t.score}`],
            };
          }),
          { text: DISCLAIMER },
        ],
      };
    }

    case "Which clients are at churn risk?": {
      const ranked = rankByChurn(clients).filter((c) => c.level !== "low").slice(0, 6);
      return {
        blocks: [
          { text: `${ranked.length} clients show elevated retention risk:` },
          ...ranked.map((ch) => ({
            text: `• [${ch.score}] ${clientName(ch.client)} (${ch.level}) — ${ch.drivers.join(", ")}.`,
            citations: [`Churn model: ${clientName(ch.client)}, ${ch.level}`],
          })),
          { text: "Suggested play: prioritize re-engagement outreach for the high-risk segment. " + DISCLAIMER },
        ],
      };
    }

    case "Which clients have lab results ready?": {
      const ready = clients.filter((c) => c.status === "Results Ready");
      return {
        blocks: [
          { text: `${ready.length} clients have lab results ready for review:` },
          ...ready.map((c) => ({
            text: `• ${clientName(c)} — Alpha Base Panel resulted ${formatDate(c.latestLabDate)} (${locationName(c.locationId)}).`,
            citations: [`Labs: ${clientName(c)}, ${formatDate(c.latestLabDate)}`],
          })),
          { text: DISCLAIMER },
        ],
      };
    }

    case "Which recommendations need provider approval?": {
      const pending = seededRecommendations.filter(
        (r) => r.status === "draft" || r.status === "coach reviewed",
      );
      const byClient = new Map<string, number>();
      pending.forEach((r) => byClient.set(r.clientId, (byClient.get(r.clientId) ?? 0) + 1));
      return {
        blocks: [
          {
            text: `${pending.length} AI-assisted recommendations are awaiting provider approval, across ${byClient.size} clients. Top of the queue:`,
          },
          ...pending.slice(0, 6).map((r) => {
            const c = clients.find((x) => x.id === r.clientId)!;
            return {
              text: `• ${clientName(c)} — "${r.title}" (${r.category}); confidence ${Math.round(r.confidence * 100)}%, risk ${r.riskLevel}.`,
              citations: [`Recommendation: ${clientName(c)}, ${r.category}`],
            };
          }),
          { text: DISCLAIMER },
        ],
      };
    }

    case "Find clients with low energy goals and abnormal vitamin D": {
      const matches = clients.filter((c) => {
        if (!c.goals.includes("Energy")) return false;
        const vitd = labByClient[c.id]?.biomarkers.find((b) => b.key === "vitd");
        return vitd && vitd.status !== "optimal";
      });
      return {
        blocks: [
          {
            text: `Found ${matches.length} clients with an Energy goal and a sub-optimal Vitamin D:`,
          },
          ...matches.map((c) => {
            const vitd = labByClient[c.id]?.biomarkers.find((b) => b.key === "vitd")!;
            return {
              text: `• ${clientName(c)} — Vitamin D ${vitd.value} ${vitd.unit} (${vitd.status}); goals: ${c.goals.join(", ")}.`,
              citations: [`Labs: ${clientName(c)}, Vitamin D ${vitd.value} ${vitd.unit}`],
            };
          }),
          {
            text: "Suggested pathway: nutrient optimization discussion + nutrition coaching. " + DISCLAIMER,
          },
        ],
      };
    }

    case "Forecast peptide reorders this week": {
      const fc = sourcingForecasts().filter((f) => f.riskScore >= 25).slice(0, 6);
      const pos = draftReorderPOs();
      return {
        blocks: [
          { text: `${fc.length} SKUs warrant a reorder this week (third-party vendors). Highest-risk first:` },
          ...fc.map((f) => ({
            text: `• ${f.item.name} @ ${locationName(f.item.locationId)} — risk ${f.riskScore}, ~${f.daysToStockout}d to stockout; order ${f.recommendedOrderQty} ${f.item.unit} from ${f.bestVendor?.name ?? "vendor"}.`,
            citations: [`Sourcing: ${f.item.sku}, ${locationName(f.item.locationId)}`],
          })),
          { text: `${pos.length} draft PO(s) auto-generated on the Supply Chain page. ` + DISCLAIMER },
        ],
      };
    }

    case "What inventory is at risk this week?": {
      const atRisk = inventory.filter((i) => i.status !== "in stock");
      const out = atRisk.filter((i) => i.status === "out of stock");
      const exp = atRisk.filter((i) => i.status === "expiring soon");
      const low = atRisk.filter((i) => i.status === "low");
      return {
        blocks: [
          {
            text: `${atRisk.length} inventory items are at risk: ${out.length} out of stock, ${low.length} low, ${exp.length} expiring soon.`,
          },
          ...atRisk.slice(0, 7).map((i) => ({
            text: `• ${i.name} @ ${locationName(i.locationId)} — ${i.quantity} ${i.unit} (${i.status}); lot ${i.lotNumber}, exp ${formatDate(i.expirationDate)}.`,
            citations: [`Inventory: ${i.sku}, ${locationName(i.locationId)}`],
          })),
          { text: "Reorder + transfer suggestions are drafted on the Supply Chain page. " + DISCLAIMER },
        ],
      };
    }

    case "Summarize population health trends": {
      const co = cohortAnalytics(clients);
      const topGoals = co.goals.slice(0, 3).map((g) => `${g.name} (${g.value})`).join(", ");
      const topMarkers = co.markers.slice(0, 4).map((m) => `${m.name} (${m.value})`).join(", ");
      return {
        blocks: [
          { text: `Population snapshot across ${co.total} clients (avg age ${co.avgAge}, ${co.withLabs} with labs):` },
          { text: `• Top goals: ${topGoals}.`, citations: ["Cohort: goal distribution"] },
          { text: `• Most common abnormal markers: ${topMarkers}.`, citations: ["Cohort: marker prevalence"] },
          { text: `• Active protocols: ${co.funnel.find((f) => f.name === "Active Protocol")?.value ?? 0}; results-ready: ${co.funnel.find((f) => f.name === "Results Ready")?.value ?? 0}.`, citations: ["Cohort: lifecycle funnel"] },
          { text: "Full breakdown on the AI Insights page. " + DISCLAIMER },
        ],
      };
    }

    case "Draft a visit summary for the top-priority client": {
      const top = rankByTriage(clients)[0].client;
      const s = generateVisitSummary(top);
      return {
        blocks: [
          { text: `Highest-priority client by triage is ${clientName(top)}. AI-assisted SOAP draft (provider must finalize):` },
          { text: visitSummaryToText(s), citations: [`Visit draft: ${clientName(top)} (review required)`] },
          { text: DISCLAIMER },
        ],
      };
    }

    default:
      return {
        blocks: [
          {
            text:
              "I can answer from Apex mock data. Try a suggested prompt — today's next-best-actions, churn risk, recommendations pending approval, peptide reorder forecast, population trends, or a visit-summary draft.",
          },
          { text: DISCLAIMER },
        ],
      };
  }
}
