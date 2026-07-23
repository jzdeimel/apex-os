"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldAlert } from "lucide-react";

import { Badge, Button, EmptyState, Input, Select, Textarea } from "@/components/ui/primitives";
import { ADVERSE_EVENT_SEVERITIES, adverseEventRequiresUrgentReview, type AdverseEventSeverity } from "@/lib/clinical-safety/lifecycle";

type Event = {
  id: string;
  reportedAt: string;
  reportedBy: string;
  reporterKind: string;
  suspectSku: string | null;
  description: string;
  severity: AdverseEventSeverity;
  outcome: string | null;
  actionTaken: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  externalReportRef: string | null;
};

function requestId() {
  return crypto.randomUUID().replaceAll("-", "_");
}

export function ClinicalSafetyPanel({ clientId }: { clientId: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [canReport, setCanReport] = useState(false);
  const [canReview, setCanReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [severity, setSeverity] = useState<AdverseEventSeverity>("mild");
  const [suspectSku, setSuspectSku] = useState("");
  const [description, setDescription] = useState("");
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [outcome, setOutcome] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [externalReportRef, setExternalReportRef] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/clinical-safety/adverse-events?clientId=${encodeURIComponent(clientId)}`, { cache: "no-store" });
      const payload = await response.json() as { events?: Event[]; canReport?: boolean; canReview?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Clinical safety records could not be loaded.");
      setEvents(payload.events ?? []);
      setCanReport(Boolean(payload.canReport));
      setCanReview(Boolean(payload.canReview));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clinical safety records could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  async function report() {
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/clinical-safety/adverse-events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, severity, suspectSku, description, requestId: requestId() }),
      });
      const payload = await response.json() as { error?: string; urgent?: boolean; escalationId?: string | null };
      if (!response.ok) throw new Error(payload.error ?? "The adverse-event report was not confirmed.");
      setDescription(""); setSuspectSku(""); setSeverity("mild");
      if (payload.urgent) setError(`Urgent licensed review was opened${payload.escalationId ? ` as ${payload.escalationId}` : ""}. Follow emergency procedures when immediate harm is possible.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The adverse-event report was not confirmed.");
    } finally { setSaving(false); }
  }

  async function review(event: Event) {
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/clinical-safety/adverse-events", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: event.id, outcome, actionTaken, externalReportRef }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The licensed review was not confirmed.");
      setReviewing(null); setOutcome(""); setActionTaken(""); setExternalReportRef("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The licensed review was not confirmed.");
    } finally { setSaving(false); }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="label-eyebrow">CLINICAL SAFETY</p><h2 className="mt-1 font-display text-heading text-ink-50">Suspected adverse events</h2><p className="mt-1 max-w-3xl text-detail text-ink-400">Any care-team member can record a concern. Severe reports open the Medical escalation queue atomically; only the assigned licensed provider can sign the review.</p></div><Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button></div>
    {error && <div role="alert" className="rounded-control border border-watch/30 bg-watch/5 p-3 text-detail text-watch">{error}</div>}
    {canReport && <div className="rounded-panel border border-ink-700 bg-ink-900/60 p-4"><h3 className="font-medium text-ink-100">Report a suspected event</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-detail text-ink-300">Severity<Select className="mt-1" value={severity} onChange={(event) => setSeverity(event.target.value as AdverseEventSeverity)}>{ADVERSE_EVENT_SEVERITIES.map((value) => <option key={value} value={value}>{value}</option>)}</Select></label><label className="text-detail text-ink-300">Suspected product / medication<Input className="mt-1" value={suspectSku} onChange={(event) => setSuspectSku(event.target.value)} maxLength={200} placeholder="Unknown is acceptable" /></label><label className="text-detail text-ink-300 sm:col-span-2">What happened<Textarea className="mt-1 min-h-28" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={20000} /></label></div>{adverseEventRequiresUrgentReview(severity) && <p className="mt-3 flex items-start gap-2 rounded-control border border-high/30 bg-high/5 p-3 text-detail text-high"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Saving this report also opens an urgent Medical escalation. Use emergency procedures now if there is immediate danger.</p>}<div className="mt-3 flex justify-end"><Button onClick={() => void report()} disabled={saving || description.trim().length < 5}><ShieldAlert className="h-4 w-4" /> {saving ? "Recording…" : "Record event"}</Button></div></div>}
    {loading && !events.length ? <div className="flex items-center gap-2 py-8 text-detail text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading clinical safety record…</div> : events.length ? <div className="space-y-3">{events.map((event) => <article key={event.id} className="card p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-body font-medium text-ink-100">{event.suspectSku || "Suspected product unknown"}</p><p className="mt-0.5 text-micro text-ink-500">{new Date(event.reportedAt).toLocaleString()} · reported by {event.reporterKind}</p></div><Badge tone={event.severity === "life-threatening" || event.severity === "severe" ? "high" : event.severity === "moderate" ? "watch" : "neutral"}>{event.severity}</Badge></div><p className="mt-3 whitespace-pre-wrap text-detail text-ink-300">{event.description}</p>{event.reviewedAt ? <div className="mt-3 rounded-control border border-optimal/25 bg-optimal/5 p-3"><p className="flex items-center gap-2 text-detail font-medium text-optimal"><CheckCircle2 className="h-4 w-4" /> Licensed review signed</p><p className="mt-2 text-detail text-ink-300"><span className="text-ink-500">Outcome:</span> {event.outcome}</p><p className="mt-1 text-detail text-ink-300"><span className="text-ink-500">Action:</span> {event.actionTaken}</p>{event.externalReportRef && <p className="mt-1 text-micro text-ink-500">External report {event.externalReportRef}</p>}</div> : canReview ? reviewing === event.id ? <div className="mt-3 space-y-2 rounded-control border border-gold-400/25 bg-ink-900 p-3"><Textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Clinical outcome (required)" maxLength={10000} /><Textarea value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} placeholder="Action taken and follow-up (required)" maxLength={10000} /><Input value={externalReportRef} onChange={(e) => setExternalReportRef(e.target.value)} placeholder="FDA/manufacturer report reference, if applicable" maxLength={500} /><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setReviewing(null)}>Back</Button><Button onClick={() => void review(event)} disabled={saving || !outcome.trim() || !actionTaken.trim()}>Sign review</Button></div></div> : <Button className="mt-3" size="sm" onClick={() => setReviewing(event.id)}>Review and sign</Button> : <p className="mt-3 text-detail text-watch">Awaiting assigned provider review.</p>}</article>)}</div> : <EmptyState icon={<ShieldAlert className="h-6 w-6" />} title="No adverse events recorded" hint="This is the authoritative clinical safety record, not a seeded empty state." />}
  </div>;
}
