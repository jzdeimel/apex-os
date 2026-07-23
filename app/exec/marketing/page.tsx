"use client";

import * as React from "react";
import { Megaphone, TrendingUp, AlertTriangle, Users, ArrowRight } from "lucide-react";
import { Card, Badge } from "@/components/ui/primitives";
import { locationName } from "@/lib/mock/locations";

/**
 * ACQUISITION — where new patients actually come from.
 *
 * This reads REAL lead rows from Postgres (/api/leads, gated on
 * read:business-metrics),
 * not a seeded funnel. Every row here was created by someone submitting the
 * public booking form or a receptionist capturing a walk-in, and the `source`
 * field is what finally separates "the website is working" from "Raleigh's desk
 * is carrying us".
 *
 * WHY THIS IS ON THE OWNER CONSOLE AND NOWHERE ELSE. Acquisition performance is
 * commercial information — the same rule that keeps revenue off the coach and
 * member surfaces. The endpoint enforces it server-side; this page is not the
 * gate.
 *
 * WHAT IT DELIBERATELY DOES NOT CLAIM. There is no spend data in Apex, so there
 * is no CAC, no ROAS, and no channel "score". Inventing those from nothing is
 * how a dashboard starts lying. What can be known from these rows — volume by
 * source, stage progression, conversion, and where leads stall — is what is
 * shown.
 */

interface Lead {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  track: string | null;
  preferredLocationId: string | null;
  source: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  ownerStaffId: string | null;
  stage: string;
  createdAt: string;
  convertedClientId: string | null;
  reason: string | null;
}

const STAGE_ORDER = [
  "new",
  "contacted",
  "intake-submitted",
  "consult-booked",
  "converted",
  "lost",
];

export default function MarketingPage() {
  const [leads, setLeads] = React.useState<Lead[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busyLead, setBusyLead] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/leads");
        const res = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (r.ok && res.ok) setLeads(res.leads);
        else setError(res.error || `Could not load leads (HTTP ${r.status}).`);
      } catch {
        if (!cancelled) setError("Could not reach the server.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const workLead = async (
    leadId: string,
    action: "claim" | "release" | "advance",
    toStage?: string,
  ) => {
    setBusyLead(leadId);
    setError(null);
    try {
      const r = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, action, toStage }),
      });
      const res = await r.json().catch(() => ({}));
      if (!r.ok || !res.ok) {
        setError(res.error || `Could not update lead (HTTP ${r.status}).`);
        return;
      }
      setLeads((current) =>
        current?.map((lead) => (lead.id === leadId ? res.lead : lead)) ?? current,
      );
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusyLead(null);
    }
  };

  const bySource = React.useMemo(() => {
    if (!leads) return [];
    const m = new Map<string, { total: number; converted: number; submitted: number }>();
    for (const l of leads) {
      const k = l.utmSource ?? l.source ?? "unknown";
      const e = m.get(k) ?? { total: 0, converted: 0, submitted: 0 };
      e.total += 1;
      if (l.convertedClientId) e.converted += 1;
      if (l.stage !== "new") e.submitted += 1;
      m.set(k, e);
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [leads]);

  const byStage = React.useMemo(() => {
    if (!leads) return [];
    const m = new Map<string, number>();
    for (const l of leads) m.set(l.stage, (m.get(l.stage) ?? 0) + 1);
    return STAGE_ORDER.filter((s) => m.has(s)).map((s) => [s, m.get(s)!] as const);
  }, [leads]);

  const stalled = React.useMemo(
    () => (leads ?? []).filter((l) => l.stage === "new"),
    [leads],
  );

  return (
    <div className="space-y-5">
      <header>
        <p className="label-eyebrow">Owner console</p>
        <h1 className="mt-0.5 flex items-center gap-2 font-display text-title font-semibold tracking-tight text-ink-50">
          <Megaphone className="h-5 w-5 text-gold-400" /> Acquisition
        </h1>
        <p className="mt-1 max-w-prose text-detail leading-relaxed text-ink-500">
          Real leads, from the public booking form and front-desk walk-ins. Spend is not in
          Apex, so this shows what can be known — volume, progression and conversion by
          channel — and does not invent a cost per acquisition.
        </p>
      </header>

      {error && (
        <Card className="flex items-start gap-2 border-critical/40 bg-critical/10 p-4 text-detail text-critical">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </Card>
      )}

      {!leads && !error && (
        <Card className="p-5 text-detail text-ink-500">Loading the funnel…</Card>
      )}

      {leads && leads.length === 0 && (
        <Card className="p-6 text-center">
          <Users className="mx-auto h-6 w-6 text-ink-600" />
          <p className="mt-2 text-body text-ink-200">No leads captured yet.</p>
          <p className="mt-1 text-detail text-ink-500">
            The public booking form and the front desk&apos;s walk-in page both land here the
            moment they are used.
          </p>
        </Card>
      )}

      {leads && leads.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label="Leads captured" value={leads.length} />
            <Stat
              label="Completed intake"
              value={leads.filter((l) => l.stage !== "new").length}
              hint={`${pct(leads.filter((l) => l.stage !== "new").length, leads.length)} of captured`}
            />
            <Stat
              label="Converted to client"
              value={leads.filter((l) => l.convertedClientId).length}
              hint={`${pct(leads.filter((l) => l.convertedClientId).length, leads.length)} of captured`}
            />
          </div>

          <Card className="p-5">
            <p className="label-eyebrow">By channel</p>
            <div className="mt-3 space-y-2">
              {bySource.map(([source, s]) => (
                <div key={source} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-detail capitalize text-ink-200">
                    {source}
                  </span>
                  <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-ink-800">
                    <div
                      className="h-full rounded-full bg-gold-400/70"
                      style={{ width: `${(s.total / leads.length) * 100}%` }}
                    />
                  </div>
                  <span className="stat-mono w-28 shrink-0 text-right text-detail text-ink-400">
                    {s.total} · {pct(s.submitted, s.total)} intake
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <p className="label-eyebrow">Funnel</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {byStage.map(([stage, n], i) => (
                <React.Fragment key={stage}>
                  {i > 0 && <ArrowRight className="h-3.5 w-3.5 text-ink-500" />}
                  <div className="rounded-lg border border-ink-700 bg-ink-900/50 px-3 py-2">
                    <p className="stat-mono text-body text-ink-50">{n}</p>
                    <p className="text-micro capitalize text-ink-500">{stage.replace("-", " ")}</p>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <p className="label-eyebrow">Campaign attribution</p>
            <p className="mt-1 text-detail text-ink-500">
              First-touch UTM values captured with the lead. Blank means the booking
              arrived without campaign parameters; Apex does not guess.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-detail">
                <thead className="text-micro uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="pb-2 pr-3 font-medium">Lead</th>
                    <th className="pb-2 pr-3 font-medium">Source</th>
                    <th className="pb-2 pr-3 font-medium">Medium</th>
                    <th className="pb-2 pr-3 font-medium">Campaign</th>
                    <th className="pb-2 font-medium">Captured</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-800">
                  {leads.slice(0, 25).map((lead) => (
                    <tr key={lead.id}>
                      <td className="py-2 pr-3 text-ink-200">
                        {[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unnamed lead"}
                      </td>
                      <td className="py-2 pr-3 text-ink-400">
                        {lead.utmSource ?? lead.source ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-ink-400">{lead.utmMedium ?? "—"}</td>
                      <td className="py-2 pr-3 text-ink-400">{lead.utmCampaign ?? "—"}</td>
                      <td className="stat-mono py-2 text-ink-500">
                        {new Date(lead.createdAt).toISOString().slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {stalled.length > 0 && (
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-high" />
                <p className="text-body font-medium text-ink-100">
                  {stalled.length} captured but no intake yet
                </p>
              </div>
              <p className="mt-1 text-detail text-ink-500">
                These people raised their hand and stopped. This is the highest-yield call
                list in the business.
              </p>
              <ul className="mt-3 divide-y divide-ink-800">
                {stalled.slice(0, 12).map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <span className="min-w-0 flex-1 truncate text-detail text-ink-200">
                      {[l.firstName, l.lastName].filter(Boolean).join(" ") || "Unnamed lead"}
                    </span>
                    <Badge tone="neutral">{l.source ?? "unknown"}</Badge>
                    <Badge tone={l.ownerStaffId ? "optimal" : "watch"}>
                      {l.ownerStaffId ? "Owned" : "Unassigned"}
                    </Badge>
                    {l.preferredLocationId && (
                      <span className="text-micro text-ink-500">
                        {locationName(l.preferredLocationId as never)}
                      </span>
                    )}
                    <span className="stat-mono text-micro text-ink-600">
                      {new Date(l.createdAt).toISOString().slice(0, 10)}
                    </span>
                    {!l.ownerStaffId && (
                      <button
                        type="button"
                        disabled={busyLead === l.id}
                        onClick={() => void workLead(l.id, "claim")}
                        className="focus-ring rounded-lg border border-ink-700 px-2.5 py-1 text-micro text-ink-300 transition-colors hover:border-ink-500 hover:text-ink-100 disabled:opacity-50"
                      >
                        Claim
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyLead === l.id}
                      onClick={() => void workLead(l.id, "advance", "contacted")}
                      className="focus-ring rounded-lg border border-gold-400/40 bg-gold-400/10 px-2.5 py-1 text-micro text-gold-200 transition-colors hover:bg-gold-400/20 disabled:opacity-50"
                    >
                      Mark contacted
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function pct(n: number, d: number) {
  return d === 0 ? "0%" : `${Math.round((n / d) * 100)}%`;
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="label-eyebrow">{label}</p>
      <p className="stat-mono mt-1 text-display font-semibold text-ink-50">{value}</p>
      {hint && <p className="mt-0.5 text-micro text-ink-500">{hint}</p>}
    </Card>
  );
}
