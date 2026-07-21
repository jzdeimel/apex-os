import { locationRows } from "@/lib/exec/business";
import { clients } from "@/lib/mock/clients";
import type { LocationId } from "@/lib/types";

/**
 * Cross-location money comparison — the owner's "what's working, what isn't".
 *
 * The existing LocationTable lists the sites; this ranks and JUDGES them on
 * money so the owner can see, in one glance, which location is carrying the
 * business and which is quietly leaking it. Every number is measured from the
 * same membership/client records the rest of the exec console uses — MRR from
 * active memberships, at-risk from paused/lapsed paid memberships, LTV from the
 * client record. Nothing new is invented; it is re-cut for comparison.
 *
 * The "signal" is the only opinion here, and it is a transparent one: it reads a
 * location's share of the book against how much of its own revenue is at risk.
 * A big site bleeding a fifth of its MRR is a different problem from a small site
 * doing the same, and the owner should see both framed as money, not as a table
 * to squint at.
 */

export type MoneySignal = "leading" | "steady" | "watch" | "at-risk";

export interface LocationMoney {
  id: LocationId;
  label: string;
  mrr: number; // monthly recurring, $
  annualRunRate: number; // mrr × 12
  atRiskMrr: number; // paused + lapsed paid, $
  atRiskPct: number; // 0..1 of (mrr + atRiskMrr)
  members: number;
  avgLtv: number; // mean lifetime value of clients at this site
  totalLtv: number;
  /** Share of total MRR across all sites. */
  shareOfMrr: number;
  signal: MoneySignal;
  signalReason: string;
}

function ltvFor(locationId: LocationId): { avg: number; total: number; n: number } {
  const at = clients.filter((c) => c.locationId === locationId);
  const total = at.reduce((s, c) => s + (c.lifetimeValue ?? 0), 0);
  return { avg: at.length ? Math.round(total / at.length) : 0, total, n: at.length };
}

export function locationMoney(): LocationMoney[] {
  const rows = locationRows();
  const totalMrr = rows.reduce((s, r) => s + r.mrr, 0) || 1;

  const out = rows.map((r) => {
    const ltv = ltvFor(r.id as LocationId);
    const denom = r.mrr + r.atRiskMrr || 1;
    const atRiskPct = r.atRiskMrr / denom;
    const shareOfMrr = r.mrr / totalMrr;

    // The judgement: money share vs money at risk.
    let signal: MoneySignal;
    let signalReason: string;
    if (atRiskPct >= 0.28) {
      signal = "at-risk";
      signalReason = `${Math.round(atRiskPct * 100)}% of this site's revenue is paused or lapsed — the leak is here.`;
    } else if (atRiskPct >= 0.16) {
      signal = "watch";
      signalReason = `${Math.round(atRiskPct * 100)}% of revenue at risk — worth a retention push before it lapses.`;
    } else if (shareOfMrr >= 0.24) {
      signal = "leading";
      signalReason = `Carries ${Math.round(shareOfMrr * 100)}% of the book with revenue holding — this is what working looks like.`;
    } else {
      signal = "steady";
      signalReason = `Revenue holding; ${Math.round(shareOfMrr * 100)}% of the book.`;
    }

    return {
      id: r.id as LocationId,
      label: r.label,
      mrr: r.mrr,
      annualRunRate: r.mrr * 12,
      atRiskMrr: r.atRiskMrr,
      atRiskPct,
      members: r.members,
      avgLtv: ltv.avg,
      totalLtv: ltv.total,
      shareOfMrr,
      signal,
      signalReason,
    };
  });

  return out.sort((a, b) => b.mrr - a.mrr);
}

export interface MoneyContrast {
  totalMrr: number;
  totalAnnualRunRate: number;
  totalAtRiskMrr: number;
  bestSite: LocationMoney | null; // most money, holding
  weakestSite: LocationMoney | null; // biggest money problem
  topLtvSite: LocationMoney | null;
}

export function moneyContrast(): MoneyContrast {
  const sites = locationMoney();
  const totalMrr = sites.reduce((s, r) => s + r.mrr, 0);
  const totalAtRiskMrr = sites.reduce((s, r) => s + r.atRiskMrr, 0);
  const best = sites.find((s) => s.signal === "leading") ?? sites[0] ?? null;
  // Weakest = the most at-risk DOLLARS (not just rate — a big site's leak matters more).
  const weakest = [...sites].sort((a, b) => b.atRiskMrr - a.atRiskMrr)[0] ?? null;
  const topLtv = [...sites].sort((a, b) => b.avgLtv - a.avgLtv)[0] ?? null;
  return {
    totalMrr,
    totalAnnualRunRate: totalMrr * 12,
    totalAtRiskMrr,
    bestSite: best,
    weakestSite: weakest && weakest.atRiskMrr > 0 ? weakest : null,
    topLtvSite: topLtv,
  };
}
