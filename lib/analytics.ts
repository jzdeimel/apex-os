// =============================================================================
// Apex — business analytics (deterministic, mock-only)
// MRR, revenue by service line, conversion funnel, retention, LTV by tier.
// =============================================================================

import type { Client, LocationId } from "@/lib/types";
import { clients } from "@/lib/mock/clients";
import { membershipByClient } from "@/lib/mock/memberships";

// Pricing is NOT redeclared here. The membership owns its own rate, so revenue
// is read off the record rather than re-derived from a lookup table that could
// silently drift from it — one number, one owner.

function scope(locationFilter: LocationId | "all"): Client[] {
  return clients.filter((c) => locationFilter === "all" || c.locationId === locationFilter);
}

export function analyticsFor(locationFilter: LocationId | "all") {
  const cl = scope(locationFilter);

  // MRR from membership tiers (active-ish clients only).
  const activeStatuses = ["Active Protocol", "Follow-Up Due", "Plan Review", "Results Ready"];
  const members = cl.filter((c) => activeStatuses.includes(c.status));
  const mrr = members.reduce((s, c) => {
    const m = membershipByClient[c.id];
    // A paused or lapsed plan bills nothing — status is part of the number.
    return s + (m && m.status === "Active" ? m.monthlyRate : 0);
  }, 0);

  // MRR trend (6 months, easing up to current).
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  const mrrTrend = months.map((m, i) => {
    const t = i / (months.length - 1);
    const start = mrr * 0.62;
    return { name: m, revenue: Math.round(start + (mrr - start) * t) };
  });

  // Revenue by service line (derived weights × volume).
  const serviceLines = [
    { name: "Weight mgmt", weight: 0.3 },
    { name: "Hormone", weight: 0.24 },
    { name: "Peptides", weight: 0.18 },
    { name: "Diagnostics", weight: 0.12 },
    { name: "IV / NAD+", weight: 0.1 },
    { name: "Aesthetics", weight: 0.06 },
  ];
  const grossMonthly = mrr + cl.reduce((s, c) => s + c.lifetimeValue, 0) * 0.02 + 12000;
  const revByService = serviceLines.map((s) => ({ name: s.name, revenue: Math.round(grossMonthly * s.weight) }));

  // Stacked revenue-by-service over the last 6 months.
  const serviceKeys = [
    { key: "weight", label: "Weight mgmt", color: "#e93d3d", weight: 0.3 },
    { key: "hormone", label: "Hormone", color: "#34d399", weight: 0.24 },
    { key: "peptides", label: "Peptides", color: "#60a5fa", weight: 0.18 },
    { key: "diagnostics", label: "Diagnostics", color: "#a78bfa", weight: 0.12 },
    { key: "iv", label: "IV / NAD+", color: "#2dd4bf", weight: 0.1 },
    { key: "aesthetics", label: "Aesthetics", color: "#e0bd6e", weight: 0.06 },
  ];
  const revByServiceTrend = months.map((m, i) => {
    const t = i / (months.length - 1);
    const monthGross = grossMonthly * (0.6 + 0.4 * t);
    const row: Record<string, number | string> = { name: m };
    serviceKeys.forEach((s) => {
      row[s.key] = Math.round(monthGross * s.weight);
    });
    return row;
  });

  // Conversion funnel with rates.
  const FUNNEL: { stage: string; statuses: Client["status"][] }[] = [
    { stage: "Leads", statuses: ["Lead"] },
    { stage: "Consult booked", statuses: ["Consult Booked"] },
    { stage: "Labs ordered", statuses: ["Labs Ordered"] },
    { stage: "Results / review", statuses: ["Results Ready", "Plan Review"] },
    { stage: "Active protocol", statuses: ["Active Protocol", "Follow-Up Due"] },
  ];
  // Cumulative-style funnel: each stage counts clients at-or-past it.
  const order: Client["status"][] = [
    "Lead", "Consult Booked", "Labs Ordered", "Results Ready", "Plan Review", "Active Protocol", "Follow-Up Due",
  ];
  const rank = (s: Client["status"]) => order.indexOf(s);
  const funnel = FUNNEL.map((f) => {
    const minRank = Math.min(...f.statuses.map(rank));
    const count = cl.filter((c) => c.status !== "Inactive" && rank(c.status) >= minRank).length;
    return { stage: f.stage, count };
  });
  const funnelWithRate = funnel.map((f, i) => ({
    ...f,
    rate: i === 0 ? 100 : funnel[0].count ? Math.round((f.count / funnel[0].count) * 100) : 0,
  }));

  // Retention cohort curve (months since join → % retained).
  const retention = [
    { month: "M0", pct: 100 },
    { month: "M1", pct: 94 },
    { month: "M2", pct: 88 },
    { month: "M3", pct: 83 },
    { month: "M4", pct: 79 },
    { month: "M5", pct: 76 },
    { month: "M6", pct: 73 },
  ];

  // LTV by membership tier.
  const tiers = ["Alpha Monthly", "Alpha Elite", "Alpha Concierge", "Single Visit"];
  const ltvByTier = tiers.map((tier) => {
    const inTier = cl.filter((c) => membershipByClient[c.id]?.tier === tier);
    const avg = inTier.length ? Math.round(inTier.reduce((s, c) => s + c.lifetimeValue, 0) / inTier.length) : 0;
    return { name: tier.replace("Alpha ", ""), revenue: avg, count: inTier.length };
  });

  const totalLtv = cl.reduce((s, c) => s + c.lifetimeValue, 0);
  const arpu = cl.length ? Math.round(totalLtv / cl.length) : 0;
  const consultToActive = funnelWithRate[funnelWithRate.length - 1].rate;

  return {
    mrr,
    mrrTrend,
    revByService,
    revByServiceTrend,
    serviceKeys: serviceKeys.map((s) => ({ key: s.key, label: s.label, color: s.color })),
    grossMonthly: Math.round(grossMonthly),
    funnel: funnelWithRate,
    retention,
    ltvByTier,
    totalLtv,
    arpu,
    members: members.length,
    consultToActive,
  };
}
