"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCcw, Search, ShieldCheck, Users } from "lucide-react";

import { Badge, Button, Card, CardContent, Input } from "@/components/ui/primitives";

interface DirectoryPatient {
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
  consultCount: number | null;
  contactCount: number;
  saleCount: number | null;
  netSalesCents: number | null;
  fulfillmentCount: number | null;
}

interface DirectoryPayload {
  page: number;
  pageSize: number;
  matching: number;
  query: string;
  ledgerId: string;
  patients: DirectoryPatient[];
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function PatientDirectoryPage() {
  const [directory, setDirectory] = useState<DirectoryPayload | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (page = 0, nextQuery = "") => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      const response = await fetch(`/api/clients?${params}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load patients.");
      setDirectory(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load patients.");
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

  const first = directory ? directory.page * directory.pageSize + (directory.patients.length ? 1 : 0) : 0;
  const last = directory ? directory.page * directory.pageSize + directory.patients.length : 0;
  const canNext = Boolean(directory && last < directory.matching);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="optimal">AUTHORITATIVE APEX DATA</Badge>
            <Badge tone="high">RESTRICTED PHI</Badge>
          </div>
          <h1 className="mt-3 font-display text-display text-ink-50">Patients</h1>
          <p className="mt-2 max-w-3xl text-body leading-relaxed text-ink-400">
            The working patient directory, backed by records imported into Apex PostgreSQL.
            Results are limited to your assigned book, clinic scope, or approved organization-wide access.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load(directory?.page ?? 0, directory?.query ?? "")}>
          <RefreshCcw className="h-4 w-4" aria-hidden /> Refresh
        </Button>
      </header>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <ShieldCheck className="h-5 w-5 text-optimal" aria-hidden />
          <p className="text-detail text-ink-300">
            Every directory search and chart open is recorded in the durable access ledger.
            {directory ? ` Current view: ${directory.ledgerId}.` : ""}
          </p>
        </CardContent>
      </Card>

      <form onSubmit={search} className="flex max-w-2xl gap-2">
        <label className="sr-only" htmlFor="patient-search">Search patients</label>
        <Input
          id="patient-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, MRN, email, or phone"
          maxLength={80}
        />
        <Button type="submit"><Search className="h-4 w-4" /> Search</Button>
      </form>

      {error && <p className="rounded-control border border-high/30 bg-high/5 p-4 text-detail text-high">{error}</p>}

      {loading && !directory ? (
        <div className="flex items-center gap-2 py-12 text-ink-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading protected records…
        </div>
      ) : directory && directory.patients.length === 0 ? (
        <div className="rounded-panel border border-dashed border-ink-700 p-12 text-center">
          <Users className="mx-auto h-7 w-7 text-ink-500" />
          <p className="mt-3 text-body font-medium text-ink-200">
            {directory.matching === 0 && !directory.query
              ? "No patients are currently assigned to your approved scope."
              : "No patients match this search."}
          </p>
          <p className="mt-1 text-detail text-ink-500">Apex does not substitute seeded patients.</p>
        </div>
      ) : directory ? (
        <section className="overflow-hidden rounded-panel border border-ink-700 bg-ink-900/30">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-800 px-4 py-3">
            <p className="text-detail text-ink-400">
              Showing {first.toLocaleString()}–{last.toLocaleString()} of {directory.matching.toLocaleString()} patients
            </p>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-ink-500" />}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-detail">
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
                {directory.patients.map((patient) => (
                  <tr key={patient.id} className="border-t border-ink-800 align-top">
                    <td className="p-3">
                      <Link
                        href={`/clients/${patient.id}`}
                        className="font-medium text-ink-100 underline-offset-4 hover:text-gold-300 hover:underline"
                      >
                        {patient.preferredName || patient.firstName} {patient.lastName}
                      </Link>
                      <p className="mt-1 stat-mono text-micro text-ink-500">{patient.mrn}</p>
                    </td>
                    <td className="p-3 text-ink-300">{patient.dateOfBirth || "—"}</td>
                    <td className="p-3 text-ink-300">
                      <p>{patient.email || "—"}</p>
                      <p className="mt-1 text-ink-500">{patient.phone || "—"}</p>
                    </td>
                    <td className="p-3">
                      <p className="text-ink-300">{patient.homeLocationId || "Clinic unresolved"}</p>
                      <Badge className="mt-2">{patient.status}</Badge>
                    </td>
                    <td className="p-3 stat-mono text-ink-100">{patient.consultCount ?? "Restricted"}</td>
                    <td className="p-3 stat-mono text-ink-100">{patient.contactCount.toLocaleString()}</td>
                    <td className="p-3">
                      {patient.netSalesCents === null
                        ? <span className="text-ink-600">Restricted</span>
                        : <><p className="stat-mono text-ink-100">{money(patient.netSalesCents)}</p><p className="mt-1 text-micro text-ink-500">{patient.saleCount} transactions</p></>}
                    </td>
                    <td className="p-3 stat-mono text-ink-100">{patient.fulfillmentCount ?? "Restricted"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2 border-t border-ink-800 p-4">
            <Button
              variant="outline"
              disabled={loading || directory.page === 0}
              onClick={() => void load(directory.page - 1, directory.query)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={loading || !canNext}
              onClick={() => void load(directory.page + 1, directory.query)}
            >
              Next
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
