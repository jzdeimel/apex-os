"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";

import { Badge, Button, EmptyState } from "@/components/ui/primitives";

type LedgerRow = {
  id: string;
  seq: number;
  at: string;
  actorName: string;
  actorRole: string;
  action: string;
  entity: string;
  subjectName: string | null;
  reason: string | null;
  hash: string;
};

export default function ClinicLedgerPage() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/ledger", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "The audit ledger could not be loaded.");
      }
      setRows(payload.rows ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The audit ledger could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="optimal">AUTHORITATIVE</Badge>
            <Badge>HASH-CHAINED</Badge>
          </div>
          <h1 className="mt-2 flex items-center gap-2 font-display text-title font-semibold text-ink-50">
            <ShieldCheck className="h-6 w-6 text-gold-300" /> Clinical audit ledger
          </h1>
          <p className="mt-2 max-w-3xl text-detail text-ink-400">
            The newest durable Postgres witnesses for chart access, signatures,
            communications and operational changes.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </header>

      {error && (
        <p className="rounded-control border border-high/30 bg-high/5 p-4 text-detail text-high">
          {error}
        </p>
      )}
      {!loading && !error && rows.length === 0 && (
        <EmptyState title="No durable ledger entries have been recorded yet" />
      )}
      <div className="space-y-2">
        {rows.map((row) => (
          <article
            key={row.id}
            className="rounded-control border border-ink-800 bg-ink-900/35 p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{row.action}</Badge>
              <Badge>{row.entity}</Badge>
              <span className="stat-mono text-micro text-ink-500">
                #{row.seq} · {new Date(row.at).toLocaleString()}
              </span>
            </div>
            <p className="mt-2 text-detail text-ink-200">
              {row.actorName} ({row.actorRole})
              {row.subjectName ? ` · ${row.subjectName}` : ""}
            </p>
            {row.reason && (
              <p className="mt-1 text-detail text-ink-400">{row.reason}</p>
            )}
            <p className="mt-2 truncate font-mono text-[11px] text-ink-600">
              {row.hash}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
