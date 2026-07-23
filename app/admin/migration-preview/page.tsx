"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Database,
  FileClock,
  Loader2,
  RefreshCcw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Badge, Button, Card, CardContent, Input } from "@/components/ui/primitives";

interface PreviewPatient {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  dateOfBirth: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  homeLocationId: string | null;
  sourceUpdatedAt: string | null;
  consultCount: number;
  contactCount: number;
  saleCount: number;
  netSalesCents: number;
  fulfillmentCount: number;
}

interface Preview {
  summary: {
    clients: number;
    staff: number;
    consults: number;
    contacts: number;
    sales: number;
    saleLines: number;
    fulfillment: number;
    exceptions: number;
    pendingExceptions: number;
  };
  latestRun: {
    id: string;
    mode: string;
    status: string;
    checksum: string | null;
    startedAt: string;
    completedAt: string | null;
  } | null;
  query: string;
  page: number;
  pageSize: number;
  matching: number;
  patients: PreviewPatient[];
  ledgerId: string;
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function date(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })
    : value;
}

export default function AlphaMigrationPreviewPage() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextPage = 0, nextQuery = "") => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(nextPage) });
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      const response = await fetch(`/api/admin/migration-preview?${params}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load imported Alpha data.");
      setPreview(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load imported Alpha data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function search(event: FormEvent) {
    event.preventDefault();
    void load(0, query);
  }

  const first = preview ? preview.page * preview.pageSize + (preview.patients.length ? 1 : 0) : 0;
  const last = preview ? preview.page * preview.pageSize + preview.patients.length : 0;
  const canNext = Boolean(preview && last < preview.matching);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="gold">APEX NONPRODUCTION</Badge>
            <Badge tone="high">RESTRICTED PHI</Badge>
            <Badge tone="optimal">ALPHA READ-ONLY SOURCE</Badge>
          </div>
          <h1 className="mt-3 font-display text-display text-ink-50">Imported Alpha patients</h1>
          <p className="mt-2 max-w-3xl text-body leading-relaxed text-ink-400">
            A familiar patient-list view backed only by Alpha records copied into Apex.
            There is no demo fallback. Source identifiers and migration exception payloads stay private.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load(preview?.page ?? 0, preview?.query ?? "")}>
          <RefreshCcw className="h-4 w-4" aria-hidden /> Refresh
        </Button>
      </header>

      {preview && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card><CardContent className="p-5"><p className="text-detail text-ink-400">Patients</p><p className="mt-2 font-display text-display text-ink-50">{preview.summary.clients.toLocaleString()}</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-detail text-ink-400">Consult notes</p><p className="mt-2 font-display text-display text-ink-50">{preview.summary.consults.toLocaleString()}</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-detail text-ink-400">Contact history</p><p className="mt-2 font-display text-display text-ink-50">{preview.summary.contacts.toLocaleString()}</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-detail text-ink-400">Historical sales</p><p className="mt-2 font-display text-display text-ink-50">{preview.summary.sales.toLocaleString()}</p><p className="mt-1 text-micro text-ink-500">{preview.summary.saleLines.toLocaleString()} line items</p></CardContent></Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-panel border border-ink-700 bg-ink-900/35 p-4 text-detail text-ink-300">
              <Database className="mr-2 inline h-4 w-4 text-teal-300" />
              {preview.summary.staff.toLocaleString()} staff/history authors · {preview.summary.fulfillment.toLocaleString()} fulfillment records
            </div>
            <div className="rounded-panel border border-ink-700 bg-ink-900/35 p-4 text-detail text-ink-300">
              <FileClock className="mr-2 inline h-4 w-4 text-watch" />
              {preview.summary.pendingExceptions.toLocaleString()} pending of {preview.summary.exceptions.toLocaleString()} migration exceptions
            </div>
            <div className="rounded-panel border border-ink-700 bg-ink-900/35 p-4 text-detail text-ink-300">
              <ShieldCheck className="mr-2 inline h-4 w-4 text-optimal" />
              This view was audit-witnessed as {preview.ledgerId}
            </div>
          </div>

          {preview.latestRun && (
            <p className="text-detail text-ink-500">
              Latest import: <span className="text-ink-300">{preview.latestRun.mode} · {preview.latestRun.status}</span>
              {" · "}{date(preview.latestRun.completedAt ?? preview.latestRun.startedAt)}
              {preview.latestRun.checksum ? " · reconciled checksum recorded" : ""}
            </p>
          )}
        </>
      )}

      <form onSubmit={search} className="flex max-w-2xl gap-2">
        <label className="sr-only" htmlFor="alpha-patient-search">Search imported Alpha patients</label>
        <Input
          id="alpha-patient-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, MRN, email, or phone"
          maxLength={80}
        />
        <Button type="submit"><Search className="h-4 w-4" /> Search</Button>
      </form>

      {error && <p className="rounded-control border border-high/30 bg-high/5 p-4 text-detail text-high">{error}</p>}

      {loading && !preview ? (
        <div className="flex items-center gap-2 py-12 text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading protected records…</div>
      ) : preview && preview.patients.length === 0 ? (
        <div className="rounded-panel border border-dashed border-ink-700 p-12 text-center">
          <Users className="mx-auto h-7 w-7 text-ink-500" />
          <p className="mt-3 text-body font-medium text-ink-200">
            {preview.summary.clients === 0 ? "No Alpha data has been imported into Apex yet." : "No imported patients match this search."}
          </p>
          <p className="mt-1 text-detail text-ink-500">No synthetic patients are substituted here.</p>
        </div>
      ) : preview ? (
        <section className="overflow-hidden rounded-panel border border-ink-700 bg-ink-900/30">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-800 px-4 py-3">
            <p className="text-detail text-ink-400">
              Showing {first.toLocaleString()}–{last.toLocaleString()} of {preview.matching.toLocaleString()} imported patients
            </p>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-ink-500" />}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-detail">
              <thead className="bg-ink-900/70 text-micro uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="p-3">Patient</th>
                  <th className="p-3">DOB</th>
                  <th className="p-3">Contact</th>
                  <th className="p-3">Clinic / status</th>
                  <th className="p-3">Consults</th>
                  <th className="p-3">Touches</th>
                  <th className="p-3">Sales</th>
                  <th className="p-3">Fulfillment</th>
                </tr>
              </thead>
              <tbody>
                {preview.patients.map((patient) => (
                  <tr key={patient.id} className="border-t border-ink-800 align-top">
                    <td className="p-3">
                      <p className="font-medium text-ink-100">{patient.preferredName || patient.firstName} {patient.lastName}</p>
                      <p className="mt-1 stat-mono text-micro text-ink-500">{patient.mrn}</p>
                    </td>
                    <td className="p-3 text-ink-300">{patient.dateOfBirth || "—"}</td>
                    <td className="p-3 text-ink-300">
                      <p>{patient.email || "—"}</p>
                      <p className="mt-1 text-ink-500">{patient.phone || "—"}</p>
                    </td>
                    <td className="p-3"><p className="text-ink-300">{patient.homeLocationId || "Unresolved"}</p><Badge className="mt-2">{patient.status}</Badge></td>
                    <td className="p-3 stat-mono text-ink-100">{patient.consultCount.toLocaleString()}</td>
                    <td className="p-3 stat-mono text-ink-100">{patient.contactCount.toLocaleString()}</td>
                    <td className="p-3"><p className="stat-mono text-ink-100">{money(patient.netSalesCents)}</p><p className="mt-1 text-micro text-ink-500">{patient.saleCount} transactions</p></td>
                    <td className="p-3 stat-mono text-ink-100">{patient.fulfillmentCount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-ink-800 px-4 py-3">
            <Button variant="ghost" disabled={preview.page === 0 || loading} onClick={() => void load(preview.page - 1, preview.query)}>Previous</Button>
            <p className="text-micro text-ink-500">Page {preview.page + 1}</p>
            <Button variant="ghost" disabled={!canNext || loading} onClick={() => void load(preview.page + 1, preview.query)}>Next</Button>
          </div>
        </section>
      ) : null}

      <div className="rounded-panel border border-optimal/25 bg-optimal/[0.04] p-4 text-detail text-ink-300">
        <CheckCircle2 className="mr-2 inline h-4 w-4 text-optimal" />
        Alpha remains the live system until Friday. This screen reads the isolated Apex copy only.
      </div>
    </div>
  );
}
