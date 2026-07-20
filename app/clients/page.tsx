"use client";

import { useMemo, useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { usePortal } from "@/lib/portalStore";
import { visibleClientsForPortal, staffIdForPortal } from "@/lib/access/clientScope";
import { scopeFor } from "@/lib/frontdesk/scope";
import { ShieldAlert } from "lucide-react";
import { clients, clientName } from "@/lib/mock/clients";
import { coaches } from "@/lib/mock/staff";
import { alphaScore } from "@/lib/alphaScore";
import { ClientTable } from "@/components/ClientTable";
import { ClientGallery } from "@/components/ClientGallery";
import { Input, Select, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/primitives";
import { DonutCount, CountBars } from "@/components/charts";
import { Search, LayoutGrid, Table as TableIcon, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClientStatus } from "@/lib/types";

const STATUSES: ClientStatus[] = [
  "Lead",
  "Consult Booked",
  "Labs Ordered",
  "Results Ready",
  "Plan Review",
  "Active Protocol",
  "Follow-Up Due",
  "Inactive",
];

const STATUS_COLOR: Record<ClientStatus, string> = {
  Lead: "#6f7884",
  "Consult Booked": "#60a5fa",
  "Labs Ordered": "#38bdf8",
  "Results Ready": "#e93d3d",
  "Plan Review": "#e0bd6e",
  "Active Protocol": "#34d399",
  "Follow-Up Due": "#f87171",
  Inactive: "#4b525c",
};

const PROGRAMS = [
  "All programs",
  "Metabolic Reset",
  "GLP Weight Management",
  "Recovery Track",
  "Hormone Optimization",
  "NAD+ Vitality",
  "Aesthetics & Vitality",
];

export default function ClientsPage() {
  const { locationFilter, favorites } = useStore();
  const { portal } = usePortal();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [coach, setCoach] = useState<string>("all");
  const [program, setProgram] = useState<string>("All programs");
  const [view, setView] = useState<"gallery" | "table">("gallery");
  const [starredOnly, setStarredOnly] = useState(false);
  const PAGE = 36;
  const [limit, setLimit] = useState(PAGE);

  // reset pagination whenever the filters change
  useEffect(() => {
    setLimit(PAGE);
  }, [locationFilter, status, coach, program, query, starredOnly]);

  // AUDIT: the pool was the ENTIRE client book, filtered only by a topbar
  // location filter that defaults to "all" — so a coach or clinician at any
  // location could list every patient at every location. The pool is now the
  // caller's location scope (owner = all), and the topbar filter narrows within
  // it. "all" means "all locations I may see", never the whole clinic. See
  // lib/access/clientScope.ts.
  const visible = useMemo(() => visibleClientsForPortal(portal.id), [portal.id]);

  // A viewer with no client scope at all — the patient persona, or a staff
  // account with no location assigned — must be REFUSED here, not shown an empty
  // roster. An empty list on a directory reads as a broken page; "you do not
  // have access" is the honest state. A staff member whose location simply has
  // no clients is different (real scope, empty result) and still sees the page.
  const clientScope = useMemo(() => scopeFor(staffIdForPortal(portal.id)), [portal.id]);
  const noAccess = !clientScope.unrestricted && clientScope.allowed.length === 0;
  const base = useMemo(
    () => visible.filter((c) => locationFilter === "all" || c.locationId === locationFilter),
    [visible, locationFilter],
  );

  const filtered = useMemo(() => {
    return base.filter((c) => {
      if (starredOnly && !favorites[c.id]) return false;
      if (status !== "all" && c.status !== status) return false;
      if (coach !== "all" && c.coachId !== coach) return false;
      if (program !== "All programs" && !c.programs.some((p) => p.name === program)) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = `${clientName(c)} ${c.email} ${c.goals.join(" ")} ${c.symptoms.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [base, status, coach, program, query, starredOnly, favorites]);

  // Insight strip data (directory-specific — no overlap with Dashboard/Insights)
  const riskMix = useMemo(() => {
    const top = (c: (typeof base)[number]) => {
      const order = { high: 3, moderate: 2, low: 1, none: 0 } as const;
      return c.riskFlags.slice().sort((a, b) => order[b.level] - order[a.level])[0]?.level ?? "none";
    };
    const colors: Record<string, string> = { none: "#34d399", low: "#60a5fa", moderate: "#e0bd6e", high: "#f87171" };
    return (["none", "low", "moderate", "high"] as const)
      .map((lvl) => ({ name: lvl === "none" ? "No flags" : lvl, value: base.filter((c) => top(c) === lvl).length, color: colors[lvl] }))
      .filter((d) => d.value > 0);
  }, [base]);
  const scoreDist = useMemo(() => {
    const buckets = [
      { name: "<55", lo: 0, hi: 55 },
      { name: "55–69", lo: 55, hi: 70 },
      { name: "70–84", lo: 70, hi: 85 },
      { name: "85+", lo: 85, hi: 101 },
    ];
    return buckets.map((b) => ({ name: b.name, value: base.filter((c) => { const s = alphaScore(c).score; return s >= b.lo && s < b.hi; }).length }));
  }, [base]);
  const coachLoad = useMemo(() => {
    return coaches
      .map((co) => ({ name: co.name.split(" ")[0], value: base.filter((c) => c.coachId === co.id).length }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [base]);

  const counts = useMemo(() => STATUSES.map((s) => ({ s, n: base.filter((c) => c.status === s).length })), [base]);

  if (noAccess) {
    return (
      <div className="mx-auto max-w-md rounded-panel border border-ink-800 bg-ink-900/40 px-6 py-10 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-watch" aria-hidden />
        <h1 className="mt-3 text-heading text-ink-50">Staff directory</h1>
        <p className="mt-2 text-detail leading-relaxed text-ink-400">
          This is the clinic&apos;s patient directory, for staff. Your own health record is in your
          portal.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label-eyebrow">Member directory · {base.length} people</p>
          <h1 className="font-display text-title font-bold tracking-tight text-ink-50">Clients</h1>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setStarredOnly((s) => !s)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-detail font-medium transition-colors",
              starredOnly ? "border-gold-400/40 bg-gold-400/10 text-gold-200" : "border-ink-800 bg-ink-900/70 text-ink-400 hover:text-ink-100",
            )}
          >
            <Star className={cn("h-3.5 w-3.5", starredOnly && "fill-gold-400")} /> Starred
          </button>
          {/* View toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-ink-800 bg-ink-900/70 p-0.5">
            {([["gallery", LayoutGrid], ["table", TableIcon]] as const).map(([v, Icon]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-detail font-medium capitalize transition-colors",
                  view === v ? "bg-gold-400/15 text-gold-200" : "text-ink-400 hover:text-ink-100",
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Insight strip */}
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-body">Risk flags</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-3">
            <div className="w-32">
              <DonutCount data={riskMix} height={120} centerValue={base.length} centerLabel="clients" />
            </div>
            <div className="flex-1 space-y-1">
              {riskMix.map((s) => (
                <div key={s.name} className="flex items-center gap-2 text-micro">
                  <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                  <span className="flex-1 truncate capitalize text-ink-400">{s.name}</span>
                  <span className="stat-mono text-ink-500">{s.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-body">Alpha Score distribution</CardTitle></CardHeader>
          <CardContent><CountBars data={scoreDist} height={132} label="Clients" /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-body">Coach load</CardTitle></CardHeader>
          <CardContent><CountBars data={coachLoad} height={132} label="Clients" /></CardContent>
        </Card>
      </div>

      {/* Status pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatus("all")}
          className={cn(
            "rounded-full border px-3 py-1 text-detail font-medium transition-colors",
            status === "all" ? "border-gold-400/40 bg-gold-400/10 text-gold-200" : "border-ink-700 text-ink-400 hover:text-ink-100",
          )}
        >
          All {base.length}
        </button>
        {counts.filter((c) => c.n > 0).map(({ s, n }) => (
          <button
            key={s}
            onClick={() => setStatus(s === status ? "all" : s)}
            className={cn(
              "rounded-full border px-3 py-1 text-detail font-medium transition-colors",
              status === s ? "border-gold-400/40 bg-gold-400/10 text-gold-200" : "border-ink-700 text-ink-400 hover:text-ink-100",
            )}
          >
            {s} <span className="stat-mono text-ink-500">{n}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, goal, symptom…" className="pl-9" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select value={coach} onChange={(e) => setCoach(e.target.value)}>
          <option value="all">All coaches</option>
          {coaches.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select value={program} onChange={(e) => setProgram(e.target.value)}>
          {PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
      </div>

      {view === "gallery" ? (
        <ClientGallery clients={filtered.slice(0, limit)} />
      ) : (
        <ClientTable clients={filtered.slice(0, limit)} />
      )}

      {filtered.length > limit && (
        <div className="flex flex-col items-center gap-2 pt-1">
          <p className="text-detail text-ink-500">
            Showing <span className="stat-mono text-ink-300">{Math.min(limit, filtered.length)}</span> of{" "}
            <span className="stat-mono text-ink-300">{filtered.length}</span>
          </p>
          <button
            onClick={() => setLimit((l) => l + PAGE)}
            className="rounded-lg border border-ink-700 bg-ink-850/60 px-4 py-2 text-detail font-medium text-ink-200 transition-colors hover:border-gold-400/40 hover:text-gold-100"
          >
            Load more clients
          </button>
        </div>
      )}
    </div>
  );
}
