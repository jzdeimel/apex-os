"use client";

import Link from "next/link";
import type { Client } from "@/lib/types";
import { clientName } from "@/lib/mock/clients";
import { staffName } from "@/lib/mock/staff";
import { locationName } from "@/lib/mock/locations";
import { formatDate, relativeDays } from "@/lib/utils";
import { ClientStatusBadge } from "@/components/StatusBadge";
import { RiskBadge } from "@/components/RiskBadge";
import { Monogram } from "@/components/Monogram";
import { AlphaScoreChip } from "@/components/AlphaScoreRing";
import { FavoriteStar } from "@/components/FavoriteStar";
import { alphaScore } from "@/lib/alphaScore";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { ChevronRight, Users } from "lucide-react";

function topRisk(c: Client) {
  const order = { high: 3, moderate: 2, low: 1, none: 0 };
  return c.riskFlags.slice().sort((a, b) => order[b.level] - order[a.level])[0];
}

export function ClientTable({ clients }: { clients: Client[] }) {
  if (clients.length === 0) {
    return <EmptyState icon={<Users className="h-6 w-6" />} title="No clients match these filters" hint="Try clearing search or location." />;
  }

  return (
    <div className="card overflow-hidden">
      {/* Desktop table */}
      <table className="hidden w-full text-sm md:table">
        <thead>
          <tr className="border-b border-ink-800 text-left text-[11px] uppercase tracking-wider text-ink-500">
            <th className="w-8 px-2 py-3" />
            <th className="px-4 py-3 font-medium">Client</th>
            <th className="px-4 py-3 font-medium">Score</th>
            <th className="px-4 py-3 font-medium">Location</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Goals</th>
            <th className="px-4 py-3 font-medium">Latest lab</th>
            <th className="px-4 py-3 font-medium">Next appt</th>
            <th className="px-4 py-3 font-medium">Risk</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-800/70">
          {clients.map((c) => {
            const risk = topRisk(c);
            return (
              <tr key={c.id} className="group transition-colors hover:bg-ink-850/60">
                <td className="px-2 py-3"><FavoriteStar clientId={c.id} size={15} /></td>
                <td className="px-4 py-3">
                  <Link href={`/clients/${c.id}`} className="flex items-center gap-3">
                    <Monogram client={c} size="sm" />
                    <span>
                      <span className="block font-medium text-ink-50">{clientName(c)}</span>
                      <span className="block text-xs text-ink-500">
                        {c.age} · {c.sex === "male" ? "M" : "F"} · {staffName(c.coachId).split(" ")[0]}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3"><AlphaScoreChip result={alphaScore(c)} /></td>
                <td className="px-4 py-3 text-ink-300">{locationName(c.locationId)}</td>
                <td className="px-4 py-3"><ClientStatusBadge status={c.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {c.goals.slice(0, 2).map((g) => (
                      <Badge key={g}>{g}</Badge>
                    ))}
                    {c.goals.length > 2 && <Badge>+{c.goals.length - 2}</Badge>}
                  </div>
                </td>
                <td className="px-4 py-3 text-ink-300 stat-mono text-xs">{formatDate(c.latestLabDate)}</td>
                <td className="px-4 py-3 text-ink-300 text-xs">
                  {c.nextAppointment ? relativeDays(c.nextAppointment) : <span className="text-ink-600">—</span>}
                </td>
                <td className="px-4 py-3">{risk ? <RiskBadge level={risk.level} /> : <RiskBadge level="none" />}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/clients/${c.id}`} className="inline-flex text-ink-500 group-hover:text-gold-400">
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile cards */}
      <div className="divide-y divide-ink-800/70 md:hidden">
        {clients.map((c) => {
          const risk = topRisk(c);
          return (
            <Link key={c.id} href={`/clients/${c.id}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-ink-850">
              <Monogram client={c} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-ink-50">{clientName(c)}</span>
                  <ClientStatusBadge status={c.status} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                  <AlphaScoreChip result={alphaScore(c)} />
                  <span>{locationName(c.locationId)}</span>
                  <span>·</span>
                  <span>{c.age}{c.sex === "male" ? "M" : "F"}</span>
                  {risk && risk.level !== "none" && (
                    <>
                      <span>·</span>
                      <RiskBadge level={risk.level} />
                    </>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-600" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
