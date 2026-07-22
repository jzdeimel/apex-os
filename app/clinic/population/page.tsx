"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Activity, Droplets, FlaskConical, CalendarClock, BadgeAlert, ShieldAlert, ChevronRight } from "lucide-react";
import { usePortal } from "@/lib/portalStore";
import { staffIdForPortal, visibleClientIdSet } from "@/lib/access/clientScope";
import { scopeFor } from "@/lib/frontdesk/scope";
import { populationRisk, type RiskItem, type RiskSeverity } from "@/lib/clinical/population";
import { locationName } from "@/lib/mock/locations";

/**
 * The population-health risk radar, rendered.
 *
 * One screen, four columns: haematocrit past caution, estradiol out of range,
 * monitoring overdue, credentials lapsing — across every site the viewer may
 * see. It is the owner's and the medical director's "where is the risk" view,
 * and it reuses the exact per-member engines so it can never disagree with a
 * chart.
 */

const SEV_STYLE: Record<RiskSeverity, string> = {
  urgent: "text-high border-high/40 bg-high/10",
  action: "text-gold-300 border-gold-400/30 bg-gold-400/5",
  watch: "text-low border-low/30 bg-low/5",
};

export default function PopulationPage() {
  const { portal } = usePortal();
  const staffId = staffIdForPortal(portal.id);
  const allowed = portal.id === "clinic" || portal.id === "exec";

  const scope = useMemo(() => scopeFor(staffId), [staffId]);
  const visibleIds = useMemo(() => visibleClientIdSet(staffId), [staffId]);
  const risk = useMemo(() => populationRisk(visibleIds), [visibleIds]);

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md rounded-panel border border-ink-800 bg-ink-900/40 px-6 py-10 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-watch" aria-hidden />
        <h1 className="mt-3 text-heading text-ink-50">Restricted</h1>
        <p className="mt-2 text-detail leading-relaxed text-ink-400">
          The population risk radar is for the medical team and ownership.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-gold-400" aria-hidden />
          <h1 className="font-display text-title font-bold tracking-tight text-ink-50">Population risk radar</h1>
        </div>
        <p className="mt-1 text-detail text-ink-400">
          Clinical risk across {risk.scopeSize} patients · {scope.unrestricted ? "all locations" : scope.reason}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <RiskColumn
          title="Haematocrit"
          subtitle="Past the 52% caution line"
          icon={Droplets}
          items={risk.hematocrit}
          emptyText="No haematocrit in the caution zone."
        />
        <RiskColumn
          title="Estradiol"
          subtitle="Out of the optimal window, on therapy"
          icon={FlaskConical}
          items={risk.estradiol}
          emptyText="Estradiol within range across the book."
        />
        <RiskColumn
          title="Monitoring overdue"
          subtitle={`On therapy, no panel in ${"120"}+ days`}
          icon={CalendarClock}
          items={risk.overdueLabs}
          emptyText="Everyone on therapy is current on labs."
        />
        <CredentialColumn items={risk.credentials} />
      </div>
    </div>
  );
}

function RiskColumn({
  title,
  subtitle,
  icon: Icon,
  items,
  emptyText,
}: {
  title: string;
  subtitle: string;
  icon: typeof Droplets;
  items: RiskItem[];
  emptyText: string;
}) {
  return (
    <section className="rounded-panel border border-ink-700/70 bg-ink-850/60">
      <header className="flex items-center justify-between border-b border-ink-800/70 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-ink-400" aria-hidden />
          <div>
            <h2 className="text-heading text-ink-50">{title}</h2>
            <p className="text-micro text-ink-500">{subtitle}</p>
          </div>
        </div>
        <span className={"stat-mono rounded-full px-2.5 py-0.5 text-body font-semibold " + (items.length ? "text-gold-300" : "text-emerald")}>
          {items.length}
        </span>
      </header>
      <div className="p-3">
        {items.length === 0 ? (
          <p className="px-2 py-4 text-center text-detail text-ink-500">{emptyText}</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((it, i) => (
              <motion.li
                key={it.clientId + i}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.2) }}
              >
                <Link
                  href={`/clients/${it.clientId}`}
                  className="flex items-center justify-between gap-3 rounded-control border border-ink-800 bg-ink-900/40 px-3 py-2 transition-colors hover:border-ink-700"
                >
                  <div className="min-w-0">
                    <p className="truncate text-detail font-medium text-ink-50">{it.clientName}</p>
                    <p className="truncate text-micro text-ink-500">
                      {locationName(it.locationId)} · {it.detail}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={"stat-mono rounded-control border px-2 py-0.5 text-micro " + SEV_STYLE[it.severity]}>
                      {it.value}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-ink-600" aria-hidden />
                  </div>
                </Link>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function CredentialColumn({ items }: { items: { staffId: string; name: string; issue: string; date: string; severity: RiskSeverity }[] }) {
  return (
    <section className="rounded-panel border border-ink-700/70 bg-ink-850/60">
      <header className="flex items-center justify-between border-b border-ink-800/70 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <BadgeAlert className="h-4 w-4 text-ink-400" aria-hidden />
          <div>
            <h2 className="text-heading text-ink-50">Prescriber credentials</h2>
            <p className="text-micro text-ink-500">DEA &amp; licence, clinic-wide</p>
          </div>
        </div>
        <span className={"stat-mono rounded-full px-2.5 py-0.5 text-body font-semibold " + (items.length ? "text-gold-300" : "text-emerald")}>
          {items.length}
        </span>
      </header>
      <div className="p-3">
        {items.length === 0 ? (
          <p className="px-2 py-4 text-center text-detail text-ink-500">Every prescriber credential is current.</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((it, i) => (
              <li key={it.staffId + i} className="flex items-center justify-between gap-3 rounded-control border border-ink-800 bg-ink-900/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-detail font-medium text-ink-50">{it.name}</p>
                  <p className="truncate text-micro text-ink-500">{it.issue}</p>
                </div>
                <span className={"stat-mono rounded-control border px-2 py-0.5 text-micro " + SEV_STYLE[it.severity]}>
                  {it.date.slice(5)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
