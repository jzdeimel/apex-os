// =============================================================================
// Apex — Alpha Score (composite wellness score, 0–100)
// Deterministic, mock-only. A brandable roll-up across biomarker domains +
// body composition + risk flags. Not a diagnosis; for visualization only.
// =============================================================================

import type { Client, Biomarker } from "@/lib/types";
import { getLabsForClient } from "@/lib/mock/labs";
import { getScanForClient } from "@/lib/mock/bodyscans";
import { seededRandom, clamp } from "@/lib/utils";

const DOMAIN_WEIGHT: Record<string, number> = {
  Hormones: 0.22,
  Metabolic: 0.2,
  Inflammation: 0.14,
  Thyroid: 0.12,
  Nutrients: 0.12,
  Lipids: 0.12,
  Organ: 0.05,
  Blood: 0.03,
};

const RISK_PENALTY = { none: 0, low: 1, moderate: 4, high: 8 };

export interface DomainScore {
  name: string;
  score: number;
  markers: number;
}

export interface AlphaScoreResult {
  score: number;
  label: string;
  band: "optimal" | "strong" | "building" | "focus";
  domains: DomainScore[];
  hasLabs: boolean;
  trend: { date: string; value: number }[];
}

function bandFor(score: number): AlphaScoreResult["band"] {
  if (score >= 85) return "optimal";
  if (score >= 70) return "strong";
  if (score >= 55) return "building";
  return "focus";
}
const LABEL: Record<AlphaScoreResult["band"], string> = {
  optimal: "Optimal",
  strong: "Strong",
  building: "Building",
  focus: "Needs focus",
};

function domainScore(markers: Biomarker[]): number {
  if (markers.length === 0) return 0;
  let pts = 0;
  for (const b of markers) {
    if (b.status === "optimal") pts += 1;
    else if (b.status === "watch") pts += 0.5;
    // low / high contribute 0
  }
  return (pts / markers.length) * 100;
}

export function alphaScore(client: Client): AlphaScoreResult {
  const labs = getLabsForClient(client.id);
  const scan = getScanForClient(client.id);
  const riskPenalty = clamp(
    client.riskFlags.reduce((s, f) => s + RISK_PENALTY[f.level], 0),
    0,
    15,
  );

  let score: number;
  let domains: DomainScore[] = [];

  if (labs) {
    const byCat = new Map<string, Biomarker[]>();
    for (const b of labs.biomarkers) {
      if (b.category === "Prostate") continue;
      if (!byCat.has(b.category)) byCat.set(b.category, []);
      byCat.get(b.category)!.push(b);
    }
    domains = Array.from(byCat.entries())
      .filter(([cat]) => DOMAIN_WEIGHT[cat] !== undefined)
      .map(([cat, ms]) => ({ name: cat, score: Math.round(domainScore(ms)), markers: ms.length }))
      .sort((a, b) => (DOMAIN_WEIGHT[b.name] ?? 0) - (DOMAIN_WEIGHT[a.name] ?? 0));

    let weighted = 0;
    let wsum = 0;
    for (const d of domains) {
      const w = DOMAIN_WEIGHT[d.name] ?? 0;
      weighted += w * d.score;
      wsum += w;
    }
    let base = wsum ? weighted / wsum : 60;

    // Body-composition nudge.
    if (scan) {
      const bfTarget = client.sex === "male" ? 18 : 26;
      base += clamp((bfTarget - scan.bodyFatPct) * 0.4, -6, 4);
    }
    score = clamp(Math.round(base - riskPenalty), 0, 100);
  } else {
    // Provisional (no labs yet) — light heuristic so cards still read well.
    const provisional = 64 - client.symptoms.length * 3 - riskPenalty;
    score = clamp(Math.round(provisional), 30, 80);
    domains = [];
  }

  // Trend: ease up from an earlier value toward current (on-protocol clients improve more).
  const rand = seededRandom(client.id + "ascore");
  const onProtocol = client.programs.length > 0;
  const start = score - (labs && onProtocol ? 13 : 6) - Math.round(rand() * 4);
  const dates = ["2026-01-15", "2026-02-26", "2026-04-09", "2026-05-20", client.latestLabDate ?? "2026-06-01"];
  const trend = dates.map((date, i) => {
    const t = i / (dates.length - 1);
    const v = clamp(Math.round(start + (score - start) * t + (rand() - 0.5) * 3), 0, 100);
    return { date, value: i === dates.length - 1 ? score : v };
  });

  return { score, label: LABEL[bandFor(score)], band: bandFor(score), domains, hasLabs: !!labs, trend };
}

export function scoreColor(band: AlphaScoreResult["band"]): string {
  // Health-quality gradient (semantic, not brand): green → lime → amber → coral.
  return band === "optimal" ? "var(--c-optimal)" : band === "strong" ? "var(--c-optimal)" : band === "building" ? "var(--c-watch)" : "var(--c-high)";
}
