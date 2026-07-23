"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertTriangle, Beaker, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

import { Badge, Button, EmptyState, Input, Select, Textarea } from "@/components/ui/primitives";

type LabOrderRow = {
  order: {
    id: string;
    clientId: string;
    panelName: string;
    vendor: string | null;
    priority: string;
    fastingRequired: boolean;
    status: string;
    orderedAt: string;
  };
  clientFirstName: string;
  clientLastName: string;
  clientPreferredName: string | null;
  locationName: string;
};

type ReviewRow = {
  result: { id: string; critical: boolean; abnormal: boolean; resultedAt: string; vendor: string };
  order: { id: string; panelName: string };
  clientFirstName: string;
  clientLastName: string;
  clientPreferredName: string | null;
  observations: Array<{ id: string; name: string; valueText: string | null; valueNumeric: number | null; unit: string | null; flag: string; referenceRange: string | null }>;
};

type HeldReleaseRow = {
  result: { id: string; critical: boolean };
  order: { panelName: string };
  review: { summary: string; reviewedAt: string };
  clientFirstName: string;
  clientLastName: string;
  clientPreferredName: string | null;
};

type Action =
  | { kind: "collect"; row: LabOrderRow }
  | { kind: "result"; row: LabOrderRow }
  | { kind: "review"; row: ReviewRow }
  | { kind: "release"; row: HeldReleaseRow };

function patientName(row: { clientFirstName: string; clientLastName: string; clientPreferredName: string | null }) {
  return row.clientPreferredName || `${row.clientFirstName} ${row.clientLastName}`;
}

export function LabOperationsBoard() {
  const [orders, setOrders] = useState<LabOrderRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [heldReleases, setHeldReleases] = useState<HeldReleaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [vendor, setVendor] = useState("Quest");
  const [accession, setAccession] = useState("");
  const [specimenType, setSpecimenType] = useState("whole blood");
  const [externalResultId, setExternalResultId] = useState("");
  const [markerName, setMarkerName] = useState("");
  const [markerValue, setMarkerValue] = useState("");
  const [markerUnit, setMarkerUnit] = useState("");
  const [referenceRange, setReferenceRange] = useState("");
  const [flag, setFlag] = useState("normal");
  const [summary, setSummary] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [criticalAcknowledged, setCriticalAcknowledged] = useState(false);
  const [releaseToPatient, setReleaseToPatient] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ordersResponse, reviewsResponse] = await Promise.all([
        fetch("/api/labs/orders", { cache: "no-store" }),
        fetch("/api/labs/reviews", { cache: "no-store" }),
      ]);
      const orderPayload = await ordersResponse.json() as { orders?: LabOrderRow[]; error?: string };
      if (!ordersResponse.ok) throw new Error(orderPayload.error ?? "The lab worklist could not be loaded.");
      setOrders(orderPayload.orders ?? []);
      if (reviewsResponse.ok) {
        const reviewPayload = await reviewsResponse.json() as { results?: ReviewRow[]; heldReleases?: HeldReleaseRow[] };
        setReviews(reviewPayload.results ?? []);
        setHeldReleases(reviewPayload.heldReleases ?? []);
      } else {
        setReviews([]); // Nursing has no sign:labs capability; this is expected.
        setHeldReleases([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The lab worklist could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function open(next: Action) {
    setAction(next);
    setError(null);
    if (next.kind === "collect" || next.kind === "result") setVendor(next.row.order.vendor ?? "Quest");
    setAccession("");
    setExternalResultId("");
    setMarkerName("");
    setMarkerValue("");
    setMarkerUnit("");
    setReferenceRange("");
    setFlag("normal");
    setSummary("");
    setFollowUp("");
    setCriticalAcknowledged(false);
    setReleaseToPatient(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!action || busy) return;
    setBusy(true);
    setError(null);
    try {
      let endpoint = "/api/labs/specimens";
      let body: Record<string, unknown>;
      if (action.kind === "collect") {
        body = { orderId: action.row.order.id, requestId: crypto.randomUUID(), accession, vendor, specimenType, collectedAt: new Date().toISOString() };
      } else if (action.kind === "result") {
        endpoint = "/api/labs/results";
        const numeric = markerValue.trim() && Number.isFinite(Number(markerValue)) ? Number(markerValue) : undefined;
        body = {
          orderId: action.row.order.id,
          clientId: action.row.order.clientId,
          requestId: crypto.randomUUID(),
          vendor,
          externalResultId,
          status: "final",
          resultedAt: new Date().toISOString(),
          observations: [{
            name: markerName,
            ...(numeric === undefined ? { valueText: markerValue } : { valueNumeric: numeric }),
            unit: markerUnit,
            referenceRange,
            flag,
          }],
        };
      } else if (action.kind === "review") {
        endpoint = "/api/labs/reviews";
        body = {
          resultId: action.row.result.id,
          requestId: crypto.randomUUID(),
          summary,
          followUp,
          criticalAcknowledged,
          releaseToPatient,
        };
      } else {
        endpoint = "/api/labs/reviews";
        body = { action: "release", resultId: action.row.result.id, requestId: crypto.randomUUID(), reason: followUp };
      }
      const response = await fetch(endpoint, { method: action.kind === "release" ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The lab action was not committed.");
      setAction(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The lab action was not committed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !orders.length) return <div className="flex items-center gap-2 py-8 text-detail text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading authoritative lab operations…</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div><p className="label-eyebrow">AUTHORITATIVE LAB CHAIN</p><p className="mt-1 text-detail text-ink-400">Orders, specimen identity, immutable result versions, critical alerts, and licensed review.</p></div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
      </div>
      {error && <div className="rounded-control border border-high/30 bg-high/5 p-4 text-detail text-high" role="alert">{error}</div>}

      {reviews.length > 0 && (
        <section className="card border-gold-400/25 p-4">
          <h2 className="font-display text-heading text-ink-50">Provider review queue</h2>
          <div className="mt-3 space-y-2">
            {reviews.map((row) => <div key={row.result.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-ink-700 p-3"><div><p className="font-medium text-ink-100">{patientName(row)} · {row.order.panelName}</p><p className="text-micro text-ink-500">{row.observations.length} observations · {row.result.vendor}</p></div><div className="flex items-center gap-2">{row.result.critical && <Badge tone="high">Critical</Badge>}{!row.result.critical && row.result.abnormal && <Badge tone="watch">Abnormal</Badge>}<Button size="sm" onClick={() => open({ kind: "review", row })}>Review and sign</Button></div></div>)}
          </div>
        </section>
      )}
      {heldReleases.length > 0 && (
        <section className="card p-4">
          <h2 className="font-display text-heading text-ink-50">Reviewed and held</h2>
          <p className="mt-1 text-detail text-ink-400">Release later without rewriting the signed review.</p>
          <div className="mt-3 space-y-2">{heldReleases.map((row) => <div key={row.result.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-ink-700 p-3"><div><p className="font-medium text-ink-100">{patientName(row)} · {row.order.panelName}</p><p className="text-micro text-ink-500">Provider reviewed · held from patient portal</p></div><Button size="sm" variant="outline" onClick={() => open({ kind: "release", row })}>Release result</Button></div>)}</div>
        </section>
      )}

      {orders.length ? (
        <div className="overflow-x-auto rounded-panel border border-ink-700">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead className="bg-ink-900/80 text-micro uppercase tracking-wide text-ink-500"><tr><th className="p-3">Patient</th><th className="p-3">Panel</th><th className="p-3">Clinic</th><th className="p-3">State</th><th className="p-3 text-right">Action</th></tr></thead>
            <tbody>{orders.map((row) => <tr key={row.order.id} className="border-t border-ink-800"><td className="p-3 text-body text-ink-100">{patientName(row)}<span className="block text-micro text-ink-600">{row.order.clientId}</span></td><td className="p-3 text-detail text-ink-300">{row.order.panelName}<span className="block text-micro text-ink-600">{row.order.vendor ?? "Vendor pending"}{row.order.fastingRequired ? " · fasting" : ""}</span></td><td className="p-3 text-detail text-ink-300">{row.locationName}</td><td className="p-3"><Badge tone={row.order.status === "reviewed" ? "optimal" : row.order.status === "resulted" ? "gold" : "info"}>{row.order.status}</Badge></td><td className="p-3 text-right">{row.order.status === "ordered" && <Button size="sm" onClick={() => open({ kind: "collect", row })}><Beaker className="h-4 w-4" /> Record collection</Button>}{(row.order.status === "collected" || row.order.status === "partial" || row.order.status === "in-transit") && <Button size="sm" onClick={() => open({ kind: "result", row })}>Record result</Button>}{row.order.status === "resulted" && <span className="text-micro text-ink-500">Awaiting provider</span>}{row.order.status === "reviewed" && <CheckCircle2 className="ml-auto h-5 w-5 text-optimal" />}</td></tr>)}</tbody>
          </table>
        </div>
      ) : <EmptyState icon={<Beaker className="h-6 w-6" />} title="No authoritative lab orders" hint="This is an empty Postgres worklist, not fixture data." />}

      {action && (
        <form className="card space-y-4 border-gold-400/25 p-5" onSubmit={submit}>
          <h2 className="font-display text-heading text-ink-50">{action.kind === "collect" ? "Record specimen collection" : action.kind === "result" ? "Record a result for provider review" : action.kind === "review" ? "Licensed result review" : "Release reviewed result"}</h2>
          {action.kind === "collect" && <div className="grid gap-3 sm:grid-cols-3"><label className="text-detail text-ink-300">Vendor<Input className="mt-1" value={vendor} onChange={(event) => setVendor(event.target.value)} required /></label><label className="text-detail text-ink-300">Accession<Input className="mt-1" value={accession} onChange={(event) => setAccession(event.target.value)} required /></label><label className="text-detail text-ink-300">Specimen type<Input className="mt-1" value={specimenType} onChange={(event) => setSpecimenType(event.target.value)} required /></label></div>}
          {action.kind === "result" && <><div className="rounded-control border border-watch/25 bg-watch/5 p-3 text-detail text-ink-300"><AlertTriangle className="mr-2 inline h-4 w-4 text-watch" />Manual result entry is an exception path. Enter one observation exactly as reported; vendor interfaces will use the same held-for-review workflow.</div><div className="grid gap-3 sm:grid-cols-2"><label className="text-detail text-ink-300">Vendor<Input className="mt-1" value={vendor} onChange={(event) => setVendor(event.target.value)} required /></label><label className="text-detail text-ink-300">Vendor result ID<Input className="mt-1" value={externalResultId} onChange={(event) => setExternalResultId(event.target.value)} required /></label><label className="text-detail text-ink-300">Observation<Input className="mt-1" value={markerName} onChange={(event) => setMarkerName(event.target.value)} required /></label><label className="text-detail text-ink-300">Value<Input className="mt-1" value={markerValue} onChange={(event) => setMarkerValue(event.target.value)} required /></label><label className="text-detail text-ink-300">Unit<Input className="mt-1" value={markerUnit} onChange={(event) => setMarkerUnit(event.target.value)} /></label><label className="text-detail text-ink-300">Reference range<Input className="mt-1" value={referenceRange} onChange={(event) => setReferenceRange(event.target.value)} /></label><label className="text-detail text-ink-300">Flag<Select className="mt-1" value={flag} onChange={(event) => setFlag(event.target.value)}><option value="normal">Normal</option><option value="abnormal-low">Abnormal low</option><option value="abnormal-high">Abnormal high</option><option value="critical-low">Critical low</option><option value="critical-high">Critical high</option><option value="unknown">Unknown / verify</option></Select></label></div></>}
          {action.kind === "review" && <><div className="rounded-control border border-ink-700 p-3 text-detail text-ink-300">{action.row.observations.map((row) => <p key={row.id}><span className="font-medium text-ink-100">{row.name}</span> · {row.valueNumeric ?? row.valueText} {row.unit ?? ""} · {row.flag}{row.referenceRange ? ` · ref ${row.referenceRange}` : ""}</p>)}</div><label className="block text-detail text-ink-300">Provider interpretation<Textarea className="mt-1 min-h-24" value={summary} onChange={(event) => setSummary(event.target.value)} required /></label><label className="block text-detail text-ink-300">Follow-up action<Textarea className="mt-1 min-h-20" value={followUp} onChange={(event) => setFollowUp(event.target.value)} required={action.row.result.critical} /></label>{action.row.result.critical && <label className="flex items-center gap-2 text-detail text-high"><input type="checkbox" checked={criticalAcknowledged} onChange={(event) => setCriticalAcknowledged(event.target.checked)} /> I explicitly acknowledge this critical value and documented the follow-up.</label>}<label className="flex items-center gap-2 text-detail text-ink-300"><input type="checkbox" checked={releaseToPatient} onChange={(event) => setReleaseToPatient(event.target.checked)} /> Release this reviewed result to the patient portal.</label></>}
          {action.kind === "release" && <><p className="rounded-control border border-ink-700 p-3 text-detail text-ink-300">The signed review remains immutable. This creates a separate audited release event.</p><label className="block text-detail text-ink-300">Why release now?<Textarea className="mt-1 min-h-20" value={followUp} onChange={(event) => setFollowUp(event.target.value)} required /></label></>}
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setAction(null)}>Back</Button><Button type="submit" disabled={busy || (action.kind === "collect" && (!vendor.trim() || !accession.trim() || !specimenType.trim())) || (action.kind === "result" && (!vendor.trim() || !externalResultId.trim() || !markerName.trim() || !markerValue.trim())) || (action.kind === "review" && (!summary.trim() || (action.row.result.critical && (!criticalAcknowledged || !followUp.trim())))) || (action.kind === "release" && !followUp.trim())}>{busy ? "Committing…" : "Commit with audit witness"}</Button></div>
        </form>
      )}
    </div>
  );
}
