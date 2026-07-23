"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileSignature, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

import { Badge, Button, EmptyState } from "@/components/ui/primitives";

type QueueNote = {
  id: string;
  clientId: string;
  patientFirstName: string;
  patientLastName: string;
  patientPreferredName: string | null;
  mrn: string;
  kind: string;
  channel: string;
  updatedAt: string;
  rawNotes: string | null;
  assessment: string | null;
  plan: string | null;
  locationId: string | null;
};

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function ClinicSignPage() {
  const [queue, setQueue] = useState<QueueNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/clinical/sign-queue", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The sign queue could not be loaded.");
      setQueue(payload.queue ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The sign queue could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2"><Badge tone="optimal">AUTHORITATIVE</Badge><Badge>LICENSED SIGNER ONLY</Badge></div>
          <h1 className="mt-2 flex items-center gap-2 font-display text-title font-semibold text-ink-50"><FileSignature className="h-6 w-6 text-gold-300" /> Sign queue</h1>
          <p className="mt-1 max-w-3xl text-detail text-ink-400">
            Only your unsigned PostgreSQL-backed clinical notes appear here. Signing happens from the patient chart,
            where the full record and SOAP note remain visible.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
      </header>

      {error && <p className="rounded-control border border-high/30 bg-high/5 p-4 text-detail text-high" role="alert">{error}</p>}
      {loading ? (
        <div className="flex items-center gap-2 py-12 text-detail text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading durable signing records…</div>
      ) : queue.length === 0 ? (
        <EmptyState title="No unsigned clinical notes are assigned to your signer identity" />
      ) : (
        <div className="space-y-3">
          {queue.map((note) => (
            <article key={note.id} className="rounded-panel border border-ink-700 bg-ink-900/30 p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><Badge>{note.kind}</Badge><Badge>{note.channel}</Badge><Badge tone="watch">Unsigned</Badge></div>
                  <h2 className="mt-3 font-display text-heading text-ink-50">{note.patientPreferredName || note.patientFirstName} {note.patientLastName}</h2>
                  <p className="mt-1 stat-mono text-micro text-ink-500">{note.mrn} · {note.locationId || "Clinic unresolved"} · updated {dateTime(note.updatedAt)}</p>
                  {note.assessment && <p className="mt-3 line-clamp-2 text-detail text-ink-300"><span className="font-medium text-ink-100">Assessment:</span> {note.assessment}</p>}
                  {note.plan && <p className="mt-2 line-clamp-2 text-detail text-ink-300"><span className="font-medium text-ink-100">Plan:</span> {note.plan}</p>}
                </div>
                <Link href={`/clients/${note.clientId}`}><Button>Review and sign</Button></Link>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="rounded-control border border-ink-800 bg-ink-900/30 p-4 text-detail text-ink-400">
        <ShieldCheck className="mr-2 inline h-4 w-4 text-optimal" />
        The old seeded recommendation approval queue is disabled. It will not return until recommendations have a durable schema, evidence provenance, decline state, and transactional signature witness.
      </div>
    </div>
  );
}
