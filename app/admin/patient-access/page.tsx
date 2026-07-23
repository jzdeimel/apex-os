"use client";

import { FormEvent, useState } from "react";
import { Copy, KeyRound, Loader2, Search, ShieldAlert } from "lucide-react";

import { Badge, Button, Input } from "@/components/ui/primitives";

type Patient = {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string | null;
  status: string;
};

export default function PatientAccessPage() {
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selected, setSelected] = useState<Patient | null>(null);
  const [issued, setIssued] = useState<{ signInUrl: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setIssued(null);
    try {
      const params = new URLSearchParams({ q: query.trim(), page: "0" });
      const response = await fetch(`/api/clients?${params}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Patients could not be searched.");
      setPatients(payload.patients ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Patients could not be searched.");
    } finally {
      setBusy(false);
    }
  }

  async function issue() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setIssued(null);
    try {
      const response = await fetch("/api/patient-auth/pilot-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: selected.id }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Patient access could not be issued.");
      setIssued(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Patient access could not be issued.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-2"><Badge tone="high">SENSITIVE ADMIN ACTION</Badge><Badge>PATIENT IDENTITY</Badge></div>
        <h1 className="mt-2 flex items-center gap-2 font-display text-title font-semibold text-ink-50"><KeyRound className="h-6 w-6 text-gold-300" /> Patient access</h1>
        <p className="mt-2 max-w-3xl text-detail text-ink-400">
          Issue one-time access only to a verified pilot patient. Apex creates a real patient identity and a single-use,
          short-lived sign-in link; this page never bulk-enrolls or sends communications.
        </p>
      </header>

      <form onSubmit={search} className="flex max-w-2xl gap-2">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patient name, MRN, or email" maxLength={80} required />
        <Button type="submit" disabled={busy || !query.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search</Button>
      </form>
      {error && <p className="rounded-control border border-high/30 bg-high/5 p-4 text-detail text-high" role="alert">{error}</p>}

      {patients.length > 0 && (
        <section className="overflow-hidden rounded-panel border border-ink-700 bg-ink-900/30">
          {patients.map((patient) => (
            <button
              key={patient.id}
              className={`flex w-full items-center gap-3 border-b border-ink-800 p-4 text-left last:border-0 ${selected?.id === patient.id ? "bg-gold-400/10" : "hover:bg-ink-800/30"}`}
              onClick={() => { setSelected(patient); setIssued(null); }}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink-100">{patient.preferredName || patient.firstName} {patient.lastName}</span>
                <span className="mt-1 block stat-mono text-micro text-ink-500">{patient.mrn} · {patient.email || "No email"}</span>
              </span>
              <Badge>{patient.status}</Badge>
            </button>
          ))}
        </section>
      )}

      {selected && !issued && (
        <section className="rounded-panel border border-watch/30 bg-watch/5 p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 text-watch" />
            <div className="flex-1">
              <h2 className="font-display text-heading text-ink-50">Confirm verified recipient</h2>
              <p className="mt-2 text-detail text-ink-300">
                Issue a portal identity for {selected.preferredName || selected.firstName} {selected.lastName} at {selected.email || "an unavailable email"}.
                Verify the person and delivery channel outside Apex before continuing.
              </p>
              <Button className="mt-4" onClick={() => void issue()} disabled={busy || !selected.email}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Issue one-time link
              </Button>
            </div>
          </div>
        </section>
      )}

      {issued && (
        <section className="rounded-panel border border-optimal/30 bg-optimal/5 p-5">
          <h2 className="font-display text-heading text-ink-50">One-time sign-in link issued</h2>
          <p className="mt-2 break-all rounded-control border border-ink-700 bg-ink-950/50 p-3 stat-mono text-detail text-ink-200">{issued.signInUrl}</p>
          <p className="mt-2 text-detail text-ink-400">Expires {new Date(issued.expiresAt).toLocaleString()}. This link is shown only in this response.</p>
          <Button className="mt-4" variant="outline" onClick={() => void navigator.clipboard.writeText(issued.signInUrl)}><Copy className="h-4 w-4" /> Copy link</Button>
        </section>
      )}
    </div>
  );
}
