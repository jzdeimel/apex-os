"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Boxes, ClipboardCheck, PackagePlus, RotateCcw, ShieldAlert } from "lucide-react";

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";

type Movement = { id: string; kind: string; quantityDelta: number; at: string; reason: string | null; ledgerId: string | null };
type Lot = {
  id: string; sku: string; lotNumber: string; locationId: string; unitLabel: string; expiryOn: string | null;
  unitCostCents: number | null; vendorRef: string | null; requiresPrescription: boolean; controlledSchedule: string | null;
  status: string; onHand: number; ledgerId: string | null; recentMovements: Movement[];
};
type Recall = { id: string; sku: string; lotNumber: string; noticeRef: string; reason: string; status: string; initiatedAt: string; affectedDispenses: number; ledgerId: string };
type Permissions = { canWrite: boolean; canDispense: boolean; canRecall: boolean };
type Recipient = { dispenseId: string; clientId: string; firstName: string; lastName: string; preferredName: string | null; email: string | null; phone: string | null; locationId: string | null; quantity: number; method: string; dispensedAt: string };
type LocationReference = { id: string; name: string; timezone: string };

function requestId() { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function day(value: string | null) { return value ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value).toLocaleDateString("en-US", { timeZone: "UTC" }) : "—"; }

export function AuthoritativeInventoryPanel({ locationId }: { locationId?: string }) {
  const [lots, setLots] = useState<Lot[]>([]);
  const [recalls, setRecalls] = useState<Recall[]>([]);
  const [permissions, setPermissions] = useState<Permissions>({ canWrite: false, canDispense: false, canRecall: false });
  const [locations, setLocations] = useState<LocationReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [receive, setReceive] = useState({ locationId: locationId ?? "", sku: "", lotNumber: "", unitLabel: "vials", expiryOn: "", quantity: "", sourceDocumentRef: "", vendorRef: "", unitCost: "", requiresPrescription: false, controlledSchedule: "" });
  const [receiveRequest, setReceiveRequest] = useState(requestId);
  const [selectedLotId, setSelectedLotId] = useState("");
  const [actionKind, setActionKind] = useState<"waste" | "count-adjust" | "transfer">("count-adjust");
  const [actionQuantity, setActionQuantity] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [targetLocationId, setTargetLocationId] = useState("");
  const [actionRequest, setActionRequest] = useState(requestId);

  const [dispenseClientId, setDispenseClientId] = useState("");
  const [dispenseQuantity, setDispenseQuantity] = useState("1");
  const [dispenseMethod, setDispenseMethod] = useState<"picked-up" | "shipped" | "administered-in-clinic">("picked-up");
  const [prescriptionId, setPrescriptionId] = useState("");
  const [dispenseRequest, setDispenseRequest] = useState(requestId);

  const [recallSku, setRecallSku] = useState("");
  const [recallLot, setRecallLot] = useState("");
  const [recallNotice, setRecallNotice] = useState("");
  const [recallReason, setRecallReason] = useState("");
  const [recallRequest, setRecallRequest] = useState(requestId);
  const [recipients, setRecipients] = useState<{ recallId: string; rows: Recipient[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = locationId ? `?locationId=${encodeURIComponent(locationId)}` : "";
      const response = await fetch(`/api/inventory/lots${query}`, { headers: { Accept: "application/json" } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Inventory is unavailable.");
      setLots(body.inventory.lots ?? []);
      setRecalls(body.inventory.recalls ?? []);
      setLocations(body.locations ?? []);
      setPermissions(body.permissions);
      setSelectedLotId((current) => current || body.inventory.lots?.[0]?.id || "");
      setReceive((current) => ({
        ...current,
        locationId: locationId
          ?? ((body.locations ?? []).some(
            (row: LocationReference) => row.id === current.locationId,
          )
            ? current.locationId
            : body.locations?.[0]?.id || ""),
      }));
      setTargetLocationId((current) =>
        (body.locations ?? []).some((row: LocationReference) => row.id === current)
          ? current
          : body.locations?.[0]?.id || "",
      );
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Inventory is unavailable.");
    } finally { setLoading(false); }
  }, [locationId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (locationId) setReceive((current) => ({ ...current, locationId })); }, [locationId]);

  const selectedLot = lots.find((lot) => lot.id === selectedLotId) ?? null;
  useEffect(() => {
    if (!selectedLot || targetLocationId !== selectedLot.locationId) return;
    const alternative = locations.find((row) => row.id !== selectedLot.locationId);
    if (alternative) setTargetLocationId(alternative.id);
  }, [locations, selectedLot, targetLocationId]);
  const activeOnHand = useMemo(() => lots.filter((lot) => lot.status === "active").reduce((sum, lot) => sum + lot.onHand, 0), [lots]);
  const expiring = useMemo(() => lots.filter((lot) => lot.expiryOn && lot.expiryOn <= new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10) && lot.onHand > 0), [lots]);

  async function mutate(path: string, method: "POST" | "PATCH", payload: Record<string, unknown>, success: string) {
    setWorking(true); setError(null); setNotice(null);
    try {
      const response = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Inventory update was not confirmed.");
      setNotice(`${success}${body.duplicate ? " Existing request returned safely." : ""}`);
      await load();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Inventory update was not confirmed.");
      return false;
    } finally { setWorking(false); }
  }

  async function submitReceive() {
    const quantity = Number(receive.quantity);
    const unitCostCents = receive.unitCost ? Math.round(Number(receive.unitCost) * 100) : undefined;
    const ok = await mutate("/api/inventory/lots", "POST", {
      requestId: receiveRequest, ...receive, quantity, unitCostCents,
      expiryOn: receive.expiryOn || undefined, vendorRef: receive.vendorRef || undefined,
      controlledSchedule: receive.controlledSchedule || undefined,
    }, "Lot receipt committed with audit evidence.");
    if (ok) { setReceiveRequest(requestId()); setReceive((current) => ({ ...current, sku: "", lotNumber: "", expiryOn: "", quantity: "", sourceDocumentRef: "", vendorRef: "", unitCost: "", requiresPrescription: false, controlledSchedule: "" })); }
  }

  async function submitStockAction() {
    if (!selectedLot) return;
    const quantity = Number(actionQuantity);
    const path = actionKind === "transfer" ? "/api/inventory/transfers" : "/api/inventory/lots";
    const method = actionKind === "transfer" ? "POST" : "PATCH";
    const payload = actionKind === "transfer"
      ? { requestId: actionRequest, sourceLotId: selectedLot.id, targetLocationId, quantity, reason: actionReason }
      : { requestId: actionRequest, lotId: selectedLot.id, kind: actionKind, reason: actionReason, ...(actionKind === "waste" ? { quantity } : { countedQuantity: quantity }) };
    const ok = await mutate(path, method, payload, actionKind === "transfer" ? "Inter-clinic transfer committed atomically." : actionKind === "waste" ? "Waste recorded against the lot." : "Cycle count reconciled against the movement ledger.");
    if (ok) { setActionRequest(requestId()); setActionQuantity(""); setActionReason(""); }
  }

  async function submitDispense() {
    if (!selectedLot) return;
    const ok = await mutate("/api/inventory/dispenses", "POST", {
      requestId: dispenseRequest, clientId: dispenseClientId, lotId: selectedLot.id,
      quantity: Number(dispenseQuantity), method: dispenseMethod, prescriptionId: prescriptionId || undefined,
    }, "Patient dispense and stock decrement committed together.");
    if (ok) { setDispenseRequest(requestId()); setDispenseClientId(""); setPrescriptionId(""); }
  }

  async function submitRecall() {
    const ok = await mutate("/api/inventory/recalls", "POST", {
      requestId: recallRequest, sku: recallSku, lotNumber: recallLot, noticeRef: recallNotice, reason: recallReason,
    }, "Recall opened and matching stock quarantined from use.");
    if (ok) { setRecallRequest(requestId()); setRecallSku(""); setRecallLot(""); setRecallNotice(""); setRecallReason(""); }
  }

  async function loadRecipients(recallId: string) {
    setError(null);
    try {
      const response = await fetch(`/api/inventory/recalls?recallId=${encodeURIComponent(recallId)}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Recall recipients are unavailable.");
      setRecipients({ recallId, rows: body.recipients ?? [] });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Recall recipients are unavailable."); }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="label-eyebrow">AUTHORITATIVE INVENTORY</p><h2 className="mt-1 font-display text-heading font-semibold text-ink-50">Lot ledger &amp; patient traceability</h2><p className="mt-1 text-detail text-ink-500">These counts come only from committed receipts, transfers, dispenses, waste and cycle counts.</p></div>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}><RotateCcw className="h-3.5 w-3.5" /> Refresh</Button>
      </div>
      {error && <p className="rounded-lg border border-high/30 bg-high/[0.06] px-3 py-2 text-detail text-high">{error}</p>}
      {notice && <p className="rounded-lg border border-optimal/30 bg-optimal/[0.06] px-3 py-2 text-detail text-optimal">{notice}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Fact label="Lots in scope" value={String(lots.length)} /><Fact label="Active units" value={String(activeOnHand)} /><Fact label="Expiring ≤60d" value={String(expiring.length)} /><Fact label="Open recalls" value={String(recalls.filter((row) => row.status === "open").length)} />
      </div>

      {loading && lots.length === 0 ? <p className="text-detail text-ink-500">Loading lot ledger…</p> : lots.length === 0 ? <EmptyState icon={<Boxes className="h-6 w-6" />} title="No authoritative stock has been received" hint="Seeded planning inventory below is not stock on hand." /> : (
        <div className="overflow-x-auto rounded-xl border border-ink-800"><table className="w-full min-w-[760px] text-left text-detail"><thead className="bg-ink-900/70 text-ink-500"><tr><th className="p-3">Lot</th><th className="p-3">Clinic</th><th className="p-3">On hand</th><th className="p-3">Expiry</th><th className="p-3">Controls</th><th className="p-3">Evidence</th></tr></thead><tbody>{lots.map((lot) => <tr key={lot.id} className="border-t border-ink-800"><td className="p-3"><p className="font-medium text-ink-100">{lot.sku}</p><p className="stat-mono text-micro text-ink-500">{lot.lotNumber}</p></td><td className="p-3 text-ink-300">{lot.locationId}</td><td className="p-3 stat-mono text-ink-100">{lot.onHand} {lot.unitLabel}</td><td className="p-3 text-ink-300">{day(lot.expiryOn)}</td><td className="p-3"><div className="flex flex-wrap gap-1"><Badge tone={lot.status === "active" ? "optimal" : lot.status === "recalled" ? "high" : "watch"}>{lot.status}</Badge>{lot.requiresPrescription && <Badge tone="info">Rx</Badge>}{lot.controlledSchedule && <Badge tone="high">Schedule {lot.controlledSchedule}</Badge>}</div></td><td className="p-3"><Button variant="ghost" size="sm" onClick={() => setSelectedLotId(lot.id)}>Manage</Button></td></tr>)}</tbody></table></div>
      )}

      {permissions.canWrite && (
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><PackagePlus className="h-4 w-4 text-gold-400" /> Receive verified lot</CardTitle></CardHeader><CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <SelectInput label="Clinic" value={receive.locationId} onChange={(value) => setReceive({ ...receive, locationId: value })} options={locations.map((row) => [row.id, row.name])} disabled={Boolean(locationId)} />
          <Input label="SKU" value={receive.sku} onChange={(value) => setReceive({ ...receive, sku: value })} /><Input label="Lot number" value={receive.lotNumber} onChange={(value) => setReceive({ ...receive, lotNumber: value })} /><Input label="Unit" value={receive.unitLabel} onChange={(value) => setReceive({ ...receive, unitLabel: value })} />
          <Input label="Quantity" value={receive.quantity} onChange={(value) => setReceive({ ...receive, quantity: value })} inputMode="numeric" /><Input label="Expiry" value={receive.expiryOn} onChange={(value) => setReceive({ ...receive, expiryOn: value })} type="date" /><Input label="Unit cost ($)" value={receive.unitCost} onChange={(value) => setReceive({ ...receive, unitCost: value })} inputMode="decimal" /><Input label="Vendor reference" value={receive.vendorRef} onChange={(value) => setReceive({ ...receive, vendorRef: value })} />
          <Input label="PO / packing slip" value={receive.sourceDocumentRef} onChange={(value) => setReceive({ ...receive, sourceDocumentRef: value })} />
          <SelectInput label="Controlled schedule" value={receive.controlledSchedule} onChange={(value) => setReceive({ ...receive, controlledSchedule: value, requiresPrescription: value ? true : receive.requiresPrescription })} options={[["", "Not controlled"], ["II", "Schedule II"], ["III", "Schedule III"], ["IV", "Schedule IV"], ["V", "Schedule V"]]} />
          <label className="flex items-center gap-2 self-end pb-2 text-detail text-ink-300"><input type="checkbox" checked={receive.requiresPrescription} onChange={(event) => setReceive({ ...receive, requiresPrescription: event.target.checked })} /> Requires prescription</label>
          <div className="flex items-end"><Button variant="primary" disabled={working} onClick={() => void submitReceive()}>Commit receipt</Button></div>
        </CardContent></Card>
      )}

      {permissions.canWrite && selectedLot && (
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-gold-400" /> Manage {selectedLot.sku} · {selectedLot.lotNumber}</CardTitle></CardHeader><CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <SelectInput label="Action" value={actionKind} onChange={(value) => setActionKind(value as typeof actionKind)} options={[["count-adjust", "Cycle count"], ["waste", "Waste"], ["transfer", "Transfer"]]} />
          <Input label={actionKind === "count-adjust" ? "Counted quantity" : "Quantity"} value={actionQuantity} onChange={setActionQuantity} inputMode="numeric" />
          {actionKind === "transfer" && <SelectInput label="Destination" value={targetLocationId} onChange={setTargetLocationId} options={locations.filter((row) => row.id !== selectedLot.locationId).map((row) => [row.id, row.name])} />}
          <Input label="Required reason" value={actionReason} onChange={setActionReason} />
          <div className="sm:col-span-4"><Button variant="primary" disabled={working} onClick={() => void submitStockAction()}>{actionKind === "transfer" && <ArrowLeftRight className="h-4 w-4" />} Commit {actionKind}</Button></div>
        </CardContent></Card>
      )}

      {permissions.canDispense && selectedLot && (
        <Card><CardHeader><CardTitle>Dispense from selected lot</CardTitle><p className="mt-1 text-detail text-ink-500">The patient record and stock decrement commit together. Controlled stock also requires matching prescription and current PDMP evidence.</p></CardHeader><CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <Input label="Authoritative patient id" value={dispenseClientId} onChange={setDispenseClientId} /><Input label="Quantity" value={dispenseQuantity} onChange={setDispenseQuantity} inputMode="numeric" /><SelectInput label="Method" value={dispenseMethod} onChange={(value) => setDispenseMethod(value as typeof dispenseMethod)} options={[["picked-up", "Picked up"], ["shipped", "Shipped"], ["administered-in-clinic", "Administered in clinic"]]} /><Input label="Prescription id (when required)" value={prescriptionId} onChange={setPrescriptionId} />
          <div className="sm:col-span-4"><Button variant="primary" disabled={working} onClick={() => void submitDispense()}>Commit dispense</Button></div>
        </CardContent></Card>
      )}

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-high" /> Recall control</CardTitle></CardHeader><CardContent className="space-y-3">
        {permissions.canRecall && <div className="grid grid-cols-1 gap-2 sm:grid-cols-4"><Input label="SKU" value={recallSku} onChange={setRecallSku} /><Input label="Lot number" value={recallLot} onChange={setRecallLot} /><Input label="Vendor/FDA notice" value={recallNotice} onChange={setRecallNotice} /><Input label="Reason" value={recallReason} onChange={setRecallReason} /><div className="sm:col-span-4"><Button variant="outline" disabled={working} onClick={() => void submitRecall()}><AlertTriangle className="h-4 w-4" /> Open recall</Button></div></div>}
        {recalls.length === 0 ? <p className="text-detail text-ink-500">No recall notices on record.</p> : recalls.map((recall) => <div key={recall.id} className="rounded-lg border border-high/20 bg-high/[0.04] p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium text-ink-100">{recall.sku} · lot {recall.lotNumber}</p><p className="text-detail text-ink-400">{recall.noticeRef} · {recall.reason}</p></div><Badge tone="high">{recall.status}</Badge></div><div className="mt-2 flex items-center justify-between"><p className="text-micro text-ink-500">{recall.affectedDispenses} dispense record(s) in your assigned clinics</p><Button variant="ghost" size="sm" onClick={() => void loadRecipients(recall.id)}>Affected patients</Button></div>{recipients?.recallId === recall.id && <div className="mt-3 space-y-2 border-t border-high/20 pt-3">{recipients.rows.length === 0 ? <p className="text-detail text-ink-500">No affected patients in your assigned clinics.</p> : recipients.rows.map((row) => <div key={row.dispenseId} className="flex flex-wrap justify-between gap-2 text-detail"><span className="text-ink-100">{row.preferredName || row.firstName} {row.lastName} · {row.clientId}</span><span className="text-ink-400">{row.email || row.phone || "No contact on file"} · {day(row.dispensedAt)}</span></div>)}</div>}</div>)}
      </CardContent></Card>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-ink-800 bg-ink-900/40 p-4"><p className="label-eyebrow">{label}</p><p className="stat-mono mt-1 text-title text-ink-50">{value}</p></div>; }
function Input({ label, value, onChange, type = "text", inputMode }: { label: string; value: string; onChange: (value: string) => void; type?: string; inputMode?: "numeric" | "decimal" }) { return <label className="text-micro text-ink-500">{label}<input type={type} inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-ink-700 bg-ink-900 px-3 text-body text-ink-100" /></label>; }
function SelectInput({ label, value, onChange, options, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: string[][]; disabled?: boolean }) { return <label className="text-micro text-ink-500">{label}<select disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-ink-700 bg-ink-900 px-3 text-body text-ink-100 disabled:opacity-60">{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>; }
