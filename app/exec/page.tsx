"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  Loader2,
  PackageCheck,
  RefreshCw,
  Users,
  Workflow,
} from "lucide-react";

import { Badge, Button, Card, CardContent } from "@/components/ui/primitives";

type Summary = {
  asOf: string;
  patients: { total: number; active: number };
  consults: number;
  sales: { lifetimeCount: number; lifetimeCents: number; trailingThirtyCount: number; trailingThirtyCents: number };
  appointments: { today: number; nextSevenDays: number };
  tasks: { open: number; overdue: number };
  cases: { open: number };
  leads: { active: number };
  memberships: { active: number };
  invoices: { openCount: number; balanceCents: number };
  fulfillment: { backlog: number };
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Users }) {
  return (
    <Card>
      <CardContent className="p-5">
        <Icon className="h-5 w-5 text-gold-300" />
        <p className="mt-3 label-eyebrow">{label}</p>
        <p className="mt-1 stat-mono text-title text-ink-50">{value}</p>
        <p className="mt-1 text-micro text-ink-500">{detail}</p>
      </CardContent>
    </Card>
  );
}

export default function ExecutivePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/executive/summary", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The executive summary could not be loaded.");
      setSummary(payload.summary);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The executive summary could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2"><Badge tone="optimal">AUTHORITATIVE</Badge><Badge>NO ILLUSTRATIVE METRICS</Badge></div>
          <h1 className="mt-2 font-display text-title font-semibold text-ink-50">Executive overview</h1>
          <p className="mt-1 max-w-3xl text-detail text-ink-400">Every number is calculated from imported or live Apex PostgreSQL records. Missing operational records remain zero.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
      </header>

      {error && <p className="rounded-control border border-high/30 bg-high/5 p-4 text-detail text-high" role="alert">{error}</p>}
      {loading && !summary ? (
        <div className="flex items-center gap-2 py-12 text-detail text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Calculating operational facts…</div>
      ) : summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Patients" value={summary.patients.total.toLocaleString()} detail={`${summary.patients.active.toLocaleString()} active`} icon={Users} />
            <Metric label="Historical sales" value={money(summary.sales.lifetimeCents)} detail={`${summary.sales.lifetimeCount.toLocaleString()} imported/live transactions`} icon={CircleDollarSign} />
            <Metric label="Last 30 days" value={money(summary.sales.trailingThirtyCents)} detail={`${summary.sales.trailingThirtyCount.toLocaleString()} transactions`} icon={CircleDollarSign} />
            <Metric label="Consult records" value={summary.consults.toLocaleString()} detail="Imported and Apex-authored" icon={ClipboardList} />
            <Metric label="Visits today" value={summary.appointments.today.toLocaleString()} detail={`${summary.appointments.nextSevenDays.toLocaleString()} next 7 days`} icon={CalendarDays} />
            <Metric label="Open tasks" value={summary.tasks.open.toLocaleString()} detail={`${summary.tasks.overdue.toLocaleString()} overdue`} icon={ClipboardList} />
            <Metric label="Active leads" value={summary.leads.active.toLocaleString()} detail={`${summary.cases.open.toLocaleString()} open operational cases`} icon={Workflow} />
            <Metric label="Fulfillment backlog" value={summary.fulfillment.backlog.toLocaleString()} detail={`${summary.memberships.active.toLocaleString()} active memberships · ${money(summary.invoices.balanceCents)} open A/R`} icon={PackageCheck} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/clients"><Button>Patient directory</Button></Link>
            <Link href="/tasks"><Button variant="outline">Task board</Button></Link>
            <Link href="/admin/cases"><Button variant="outline">Cases</Button></Link>
            <Link href="/exec/pipeline"><Button variant="outline">Lead pipeline</Button></Link>
          </div>
          <p className="text-micro text-ink-600">Calculated {new Date(summary.asOf).toLocaleString()}.</p>
        </>
      ) : null}
    </div>
  );
}
