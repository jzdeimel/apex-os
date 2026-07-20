import { absolute } from "@/lib/utils";
// =============================================================================
// Apex — AI Insights engine (deterministic, mock-data only)
// Next-Best-Action, attention triage scoring, churn/retention risk, cohorts.
// No external LLM. Every output is AI-assisted and requires human review.
// =============================================================================

import type { Client, RiskLevel } from "@/lib/types";
import { clients } from "@/lib/mock/clients";
import { getLabsForClient } from "@/lib/mock/labs";
import { recommendationsForClient } from "@/lib/mock/recommendations";

const NOW = absolute("2026-06-12T09:00:00");

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  return Math.round((NOW.getTime() - absolute(iso).getTime()) / (1000 * 60 * 60 * 24));
}
function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  return Math.round((absolute(iso).getTime() - NOW.getTime()) / (1000 * 60 * 60 * 24));
}

const riskWeight: Record<RiskLevel, number> = { none: 0, low: 8, moderate: 18, high: 30 };

// ---------------------------------------------------------------------------
// Attention triage score (0–100) — who needs a human today, and why.
// ---------------------------------------------------------------------------
export interface TriageResult {
  clientId: string;
  score: number;
  level: "critical" | "high" | "medium" | "low";
  factors: string[];
}

export function triageScore(client: Client): TriageResult {
  let score = 0;
  const factors: string[] = [];

  const statusBoost: Partial<Record<Client["status"], number>> = {
    "Results Ready": 28,
    "Follow-Up Due": 30,
    "Plan Review": 22,
    "Labs Ordered": 10,
    "Consult Booked": 8,
  };
  if (statusBoost[client.status]) {
    score += statusBoost[client.status]!;
    factors.push(`${client.status}`);
  }

  // Risk flags
  for (const f of client.riskFlags) {
    score += riskWeight[f.level];
    if (f.level === "high" || f.level === "moderate") factors.push(`${f.label} risk: ${f.detail}`);
  }

  // Pending recommendations
  const pending = recommendationsForClient(client.id).filter(
    (r) => r.status === "draft" || r.status === "coach reviewed",
  );
  if (pending.length) {
    score += Math.min(20, pending.length * 8);
    factors.push(`${pending.length} recommendation(s) awaiting approval`);
  }

  // Overdue follow-up signal
  const apptIn = daysUntil(client.nextAppointment);
  if (client.nextAppointment && apptIn !== null && apptIn <= 0) {
    score += 12;
    factors.push("Appointment is today / overdue");
  }
  if (!client.nextAppointment && client.status !== "Inactive") {
    score += 8;
    factors.push("No upcoming appointment booked");
  }

  // Stale labs while active
  const labAge = daysSince(client.latestLabDate);
  if (client.status === "Active Protocol" && labAge !== null && labAge > 90) {
    score += 6;
    factors.push("Labs older than 90 days");
  }

  score = Math.max(0, Math.min(100, score));
  const level: TriageResult["level"] =
    score >= 70 ? "critical" : score >= 45 ? "high" : score >= 22 ? "medium" : "low";

  return { clientId: client.id, score, level, factors: factors.slice(0, 4) };
}

// ---------------------------------------------------------------------------
// Next-Best-Action — the single most useful next step for this client.
// ---------------------------------------------------------------------------
export interface NextBestAction {
  clientId: string;
  action: string;
  reason: string;
  owner: "Provider" | "Coach" | "Front Desk" | "Operations";
}

export function nextBestAction(client: Client): NextBestAction {
  const pending = recommendationsForClient(client.id).filter(
    (r) => r.status === "draft" || r.status === "coach reviewed",
  );

  if (client.status === "Results Ready") {
    return {
      clientId: client.id,
      action: "Review results & book plan review",
      reason: "Labs are resulted and the client is waiting on interpretation.",
      owner: "Provider",
    };
  }
  if (pending.length) {
    return {
      clientId: client.id,
      action: `Approve / decline ${pending.length} recommendation(s)`,
      reason: "AI-assisted recommendations are queued and require provider sign-off.",
      owner: "Provider",
    };
  }
  if (client.status === "Follow-Up Due") {
    return {
      clientId: client.id,
      action: "Call to schedule follow-up",
      reason: "Follow-up window has lapsed for an active client.",
      owner: "Coach",
    };
  }
  if (client.status === "Plan Review") {
    return {
      clientId: client.id,
      action: "Finalize plan with provider",
      reason: "Draft plan is ready for provider review and approval.",
      owner: "Provider",
    };
  }
  if (client.status === "Labs Ordered") {
    return {
      clientId: client.id,
      action: "Send lab reminder",
      reason: "Lab kit ordered but draw not yet completed.",
      owner: "Coach",
    };
  }
  if (client.status === "Consult Booked" || client.status === "Lead") {
    return {
      clientId: client.id,
      action: "Confirm consult & complete intake",
      reason: "Early-funnel client; convert to a booked, prepared visit.",
      owner: "Front Desk",
    };
  }
  if (client.status === "Inactive") {
    return {
      clientId: client.id,
      action: "Reactivation outreach",
      reason: "No recent activity; candidate for a win-back touch.",
      owner: "Coach",
    };
  }
  return {
    clientId: client.id,
    action: "Routine check-in",
    reason: "Active and on track — light-touch progress check.",
    owner: "Coach",
  };
}

// ---------------------------------------------------------------------------
// Churn / retention risk
// ---------------------------------------------------------------------------
export interface ChurnResult {
  clientId: string;
  score: number; // 0..100 (higher = more likely to lapse)
  level: "high" | "medium" | "low";
  drivers: string[];
}

export function churnRisk(client: Client): ChurnResult {
  let score = 0;
  const drivers: string[] = [];

  if (client.status === "Inactive") {
    score += 55;
    drivers.push("Currently inactive");
  }
  if (client.status === "Follow-Up Due") {
    score += 28;
    drivers.push("Follow-up overdue");
  }
  if (!client.nextAppointment && client.status !== "Active Protocol") {
    score += 16;
    drivers.push("No future appointment");
  }
  if (client.programs.length === 0) {
    score += 14;
    drivers.push("Not enrolled in a program");
  }
  const labAge = daysSince(client.latestLabDate);
  if (labAge !== null && labAge > 120) {
    score += 12;
    drivers.push("Labs >120 days old");
  }
  if (client.lifetimeValue < 1500) {
    score += 10;
    drivers.push("Low lifetime engagement");
  }
  if (client.planStatus === "Needs review") {
    score += 8;
    drivers.push("Plan needs review");
  }

  score = Math.max(0, Math.min(100, score));
  const level: ChurnResult["level"] = score >= 50 ? "high" : score >= 25 ? "medium" : "low";
  return { clientId: client.id, score, level, drivers: drivers.slice(0, 3) };
}

// ---------------------------------------------------------------------------
// Cohort / population analytics
// ---------------------------------------------------------------------------
export function cohortAnalytics(scope: Client[]) {
  const goalCounts = new Map<string, number>();
  scope.forEach((c) => c.goals.forEach((g) => goalCounts.set(g, (goalCounts.get(g) ?? 0) + 1)));
  const goals = Array.from(goalCounts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Funnel by status
  const FUNNEL: Client["status"][] = [
    "Lead",
    "Consult Booked",
    "Labs Ordered",
    "Results Ready",
    "Plan Review",
    "Active Protocol",
    "Follow-Up Due",
    "Inactive",
  ];
  const funnel = FUNNEL.map((s) => ({ name: s, value: scope.filter((c) => c.status === s).length }));

  // Most common abnormal biomarkers across the cohort
  const markerCounts = new Map<string, number>();
  scope.forEach((c) => {
    const labs = getLabsForClient(c.id);
    labs?.biomarkers
      .filter((b) => b.status !== "optimal")
      .forEach((b) => markerCounts.set(b.name, (markerCounts.get(b.name) ?? 0) + 1));
  });
  const markers = Array.from(markerCounts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const withLabs = scope.filter((c) => getLabsForClient(c.id)).length;
  const avgAge = scope.length ? Math.round(scope.reduce((s, c) => s + c.age, 0) / scope.length) : 0;

  return { goals, funnel, markers, withLabs, avgAge, total: scope.length };
}

// Convenience: full insight bundle for a client.
export function clientInsights(client: Client) {
  return {
    triage: triageScore(client),
    nba: nextBestAction(client),
    churn: churnRisk(client),
  };
}

export function rankByTriage(scope: Client[]) {
  return scope
    .map((c) => ({ client: c, ...triageScore(c) }))
    .sort((a, b) => b.score - a.score);
}

export function rankByChurn(scope: Client[]) {
  return scope
    .map((c) => ({ client: c, ...churnRisk(c) }))
    .sort((a, b) => b.score - a.score);
}

void clients;
