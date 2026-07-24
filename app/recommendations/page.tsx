"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Badge, Button, Card, CardContent } from "@/components/ui/primitives";

interface Recommendation {
  id: string;
  clientId: string;
  patientFirstName: string;
  patientLastName: string;
  patientPreferredName: string | null;
  category: string;
  title: string;
  rationale: string;
  proposedDiscussion: string;
  evidence: Array<{ kind: string; id: string; label: string }>;
  status: string;
  createdAt: string;
  provenance: { method?: string; inputHash?: string };
}

export default function RecommendationsPage() {
  const [rows, setRows] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/recommendations", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) setError(payload.error || "The recommendation queue could not be loaded.");
    else { setRows(payload.recommendations); setError(null); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function decide(row: Recommendation, action: "approve" | "decline") {
    const reason = window.prompt(`${action === "approve" ? "Approval" : "Decline"} reason`);
    if (!reason?.trim()) return;
    const attestation = window.prompt("Type your attestation", "I reviewed the cited record and accept responsibility for this decision.");
    if (!attestation?.trim()) return;
    const response = await fetch("/api/recommendations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, clientId: row.clientId, action, reason, attestation }),
    });
    if (!response.ok) setError("The decision was not recorded.");
    else await load();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3"><div><div className="flex gap-2"><Badge tone="optimal">AUTHORITATIVE</Badge><Badge>HUMAN AUTHORED</Badge></div><h1 className="mt-2 font-display text-title text-ink-50">Care recommendation review</h1><p className="mt-2 max-w-3xl text-detail text-ink-400">Evidence-linked drafts from the care team. The unapproved model-generated queue has been removed; every approval is a licensed, attested database decision.</p></div><Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Refresh</Button></header>
      {error && <p className="rounded-control border border-high/30 bg-high/5 p-4 text-high">{error}</p>}
      {loading ? <p className="flex items-center gap-2 py-12 text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading review queue…</p> : rows.length ? <div className="space-y-4">{rows.map((row) => <Card key={row.id}><CardContent className="p-6"><div className="flex flex-wrap items-center gap-2"><Badge>{row.category}</Badge><Badge tone="watch">{row.status}</Badge><span className="ml-auto text-micro text-ink-500">{new Date(row.createdAt).toLocaleString()}</span></div><h2 className="mt-3 font-display text-heading text-ink-50"><Link href={`/clients/${row.clientId}`} className="hover:text-gold-300">{row.patientPreferredName || row.patientFirstName} {row.patientLastName}</Link> · {row.title}</h2><p className="mt-3 text-body text-ink-300">{row.rationale}</p><div className="mt-4 rounded-control border border-ink-700 bg-ink-900/40 p-4"><p className="label-eyebrow">Proposed discussion</p><p className="mt-2 text-detail text-ink-200">{row.proposedDiscussion}</p></div><ul className="mt-4 space-y-2">{(Array.isArray(row.evidence) ? row.evidence : []).map((item) => <li key={`${item.kind}-${item.id}`} className="text-detail text-ink-400">{item.label} · <span className="stat-mono">{item.id}</span></li>)}</ul>{row.status === "pending" && <div className="mt-5 flex gap-3"><Button onClick={() => void decide(row, "approve")}><CheckCircle2 className="h-4 w-4" /> Approve</Button><Button variant="outline" onClick={() => void decide(row, "decline")}><XCircle className="h-4 w-4" /> Decline</Button></div>}</CardContent></Card>)}</div> : <Card><CardContent className="p-8 text-center text-body text-ink-400">No recommendations are waiting in your licensed review scope.</CardContent></Card>}
    </div>
  );
}
