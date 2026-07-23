"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Database, Loader2, Plus } from "lucide-react";

import { Badge, Button, Input, Select, Textarea } from "@/components/ui/primitives";

type Decision = { allowed: boolean; reason: string };
type OrderRow = { order: { id: string; panelName: string; panelCode: string; status: string; priority: string; orderedAt: string; fastingRequired: boolean } };
type ResultRow = {
  result: { id: string; status: string; critical: boolean; abnormal: boolean; resultedAt: string };
  observations: Array<{ id: string; name: string; valueText: string | null; valueNumeric: number | null; unit: string | null; flag: string }>;
  review: { summary: string; patientReleaseStatus: string; reviewedAt: string } | null;
  release: { releasedAt: string } | null;
};

export function AuthoritativeLabsPanel({ clientId, locationId }: { clientId: string; locationId: string }) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [mayOrder, setMayOrder] = useState<Decision | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelCode, setPanelCode] = useState("ALPHA-BASE");
  const [panelName, setPanelName] = useState("Alpha Base Panel");
  const [vendor, setVendor] = useState("Quest");
  const [priority, setPriority] = useState("routine");
  const [fastingRequired, setFastingRequired] = useState(true);
  const [indications, setIndications] = useState("");
  const [instructions, setInstructions] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [meResponse, ordersResponse, resultsResponse] = await Promise.all([
        fetch("/api/me", { cache: "no-store" }),
        fetch(`/api/labs/orders?clientId=${encodeURIComponent(clientId)}`, { cache: "no-store" }),
        fetch(`/api/labs/results?clientId=${encodeURIComponent(clientId)}`, { cache: "no-store" }),
      ]);
      const me = await meResponse.json() as { may?: { orderLabs?: Decision } };
      setMayOrder(me.may?.orderLabs ?? null);
      const orderPayload = await ordersResponse.json() as { orders?: OrderRow[]; error?: string };
      const resultPayload = await resultsResponse.json() as { results?: ResultRow[]; error?: string };
      if (!ordersResponse.ok && ordersResponse.status !== 404) throw new Error(orderPayload.error ?? "Lab orders could not be loaded.");
      if (!resultsResponse.ok && resultsResponse.status !== 404) throw new Error(resultPayload.error ?? "Lab results could not be loaded.");
      setOrders(orderPayload.orders ?? []);
      setResults(resultPayload.results ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authoritative labs could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/labs/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          locationId,
          requestId: crypto.randomUUID(),
          panelCode,
          panelName,
          vendor,
          priority,
          fastingRequired,
          indications,
          instructions,
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The lab order was not committed.");
      setOpen(false);
      setIndications("");
      setInstructions("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The lab order was not committed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mb-5 border-gold-400/20 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="label-eyebrow">POSTGRES LAB RECORD</p><h2 className="mt-1 font-display text-heading text-ink-50">Order-to-review chain</h2><p className="mt-1 text-detail text-ink-400">This section is authoritative. The biomarker visualization below remains fixture-backed until V1 lab history is migrated.</p></div>
        {mayOrder?.allowed && <Button size="sm" onClick={() => setOpen((value) => !value)}><Plus className="h-4 w-4" /> New provider order</Button>}
      </div>
      {loading && <p className="mt-4 flex items-center gap-2 text-detail text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading authoritative labs…</p>}
      {error && <p className="mt-4 rounded-control border border-high/30 bg-high/5 p-3 text-detail text-high">{error}</p>}
      {!loading && !error && !orders.length && !results.length && <p className="mt-4 flex items-center gap-2 rounded-control border border-ink-700 p-4 text-detail text-ink-400"><Database className="h-4 w-4" /> No authoritative lab records for this patient.</p>}
      {orders.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{orders.map((row) => <Badge key={row.order.id} tone={row.order.status === "reviewed" ? "optimal" : row.order.status === "resulted" ? "gold" : "info"}>{row.order.panelName} · {row.order.status}</Badge>)}</div>}
      {results.length > 0 && <div className="mt-4 space-y-2">{results.map((row) => <div key={row.result.id} className="rounded-control border border-ink-700 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium text-ink-100">{row.observations.length} observations · {row.result.status}</p>{row.result.critical ? <Badge tone="high">Critical</Badge> : row.result.abnormal ? <Badge tone="watch">Abnormal</Badge> : <Badge tone="optimal">Normal</Badge>}</div><p className="mt-1 text-micro text-ink-500">{row.review ? `Provider reviewed · patient ${row.review.patientReleaseStatus === "released" || row.release ? "released" : "held"}` : "Held for provider review"}</p></div>)}</div>}

      {open && <form className="mt-5 space-y-4 border-t border-ink-800 pt-5" onSubmit={submit}><div className="grid gap-3 sm:grid-cols-2"><label className="text-detail text-ink-300">Panel code<Input className="mt-1" value={panelCode} onChange={(event) => setPanelCode(event.target.value)} required /></label><label className="text-detail text-ink-300">Panel name<Input className="mt-1" value={panelName} onChange={(event) => setPanelName(event.target.value)} required /></label><label className="text-detail text-ink-300">Vendor<Input className="mt-1" value={vendor} onChange={(event) => setVendor(event.target.value)} /></label><label className="text-detail text-ink-300">Priority<Select className="mt-1" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="routine">Routine</option><option value="urgent">Urgent</option></Select></label></div><label className="block text-detail text-ink-300">Clinical indications<Textarea className="mt-1 min-h-24" value={indications} onChange={(event) => setIndications(event.target.value)} required /></label><label className="block text-detail text-ink-300">Patient instructions<Textarea className="mt-1 min-h-20" value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label><label className="flex items-center gap-2 text-detail text-ink-300"><input type="checkbox" checked={fastingRequired} onChange={(event) => setFastingRequired(event.target.checked)} /> Fasting required</label><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy || !panelCode.trim() || !panelName.trim() || !indications.trim()}>{busy ? "Ordering…" : "Sign and order labs"}</Button></div></form>}
    </section>
  );
}
