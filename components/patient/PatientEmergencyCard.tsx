"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, ShieldAlert, Trash2 } from "lucide-react";

import { Badge, Button } from "@/components/ui/primitives";

type CardStatus = {
  active: boolean;
  card: { id: string; createdAt: string; expiresAt: string } | null;
};

export function PatientEmergencyCard() {
  const [status, setStatus] = useState<CardStatus | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/patient/emergency-card", {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Emergency-card status is unavailable.");
    }
    setStatus({ active: payload.active, card: payload.card });
  }, []);

  useEffect(() => {
    void load().catch((error) =>
      setMessage(error instanceof Error ? error.message : "Status unavailable."),
    );
  }, [load]);

  async function issue() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/patient/emergency-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "The emergency card was not issued.");
      }
      setPath(payload.path);
      setStatus({
        active: true,
        card: {
          id: payload.cardId,
          createdAt: new Date().toISOString(),
          expiresAt: payload.expiresAt,
        },
      });
      setMessage(
        "New card issued. Save this link now; Apex stores only its secure digest.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The card was not issued.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/patient/emergency-card", {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "The card was not revoked.");
      }
      setStatus({ active: false, card: null });
      setPath(null);
      setMessage("Emergency-card access revoked.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The card was not revoked.",
      );
    } finally {
      setBusy(false);
    }
  }

  const fullUrl =
    path && typeof window !== "undefined"
      ? new URL(path, window.location.origin).toString()
      : null;

  return (
    <section className="rounded-panel border border-high/30 bg-high/[0.04] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-high" aria-hidden />
            <h2 className="font-display text-title text-ink-50">
              Emergency summary
            </h2>
            {status?.active && <Badge tone="optimal">ACTIVE</Badge>}
          </div>
          <p className="mt-2 text-body leading-relaxed text-ink-400">
            Create a 14-day link showing only identity, active medications,
            recorded allergies, active problems and your care team. Amounts are
            never shown. Every view is written to your access ledger.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void issue()} disabled={busy}>
            {status?.active ? "Replace link" : "Create link"}
          </Button>
          {status?.active && (
            <Button
              variant="outline"
              onClick={() => void revoke()}
              disabled={busy}
            >
              <Trash2 className="h-4 w-4" /> Revoke
            </Button>
          )}
        </div>
      </div>

      {status?.card && (
        <p className="mt-4 text-detail text-ink-400">
          Expires {new Date(status.card.expiresAt).toLocaleString()}.
        </p>
      )}
      {fullUrl && (
        <div className="mt-4 rounded-control border border-ink-700 bg-ink-950/60 p-4">
          <p className="break-all font-mono text-detail text-ink-200">{fullUrl}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(fullUrl);
                setMessage("Emergency-card link copied.");
              }}
            >
              <Copy className="h-4 w-4" /> Copy
            </Button>
            <a href={fullUrl} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline">
                <ExternalLink className="h-4 w-4" /> Open
              </Button>
            </a>
          </div>
        </div>
      )}
      {message && (
        <p className="mt-4 text-detail text-ink-300" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
