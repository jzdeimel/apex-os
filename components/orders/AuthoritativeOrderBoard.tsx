"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, PackageCheck, RefreshCw, Truck } from "lucide-react";

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import { canAdvance, SLA_HOURS, statusTone } from "@/lib/orders/lifecycle";
import type { OrderStatus } from "@/lib/orders/types";

type Line = { id: string; sku: string; name: string; quantity: number; unitPriceCents: number };
type Event = { id: string; toStatus: string; applied: boolean; at: string; actorName: string; note: string | null; rejectionReason: string | null };
type Outbox = { id: string; kind: string; status: string; attempts: number; lastError: string | null };
type OrderRow = {
  id: string; clientId: string; status: OrderStatus; locationId: string; placedAt: string; lastActivity: string;
  fulfillmentPartner: string; totalCents: number; tracking: string | null; carrier: string | null;
  patient: { patientMrn: string; patientFirstName: string; patientLastName: string; patientPreferredName: string | null };
  lines: Line[]; events: Event[]; outbox: Outbox[];
};

const NEXT: OrderStatus[] = ["Accepted", "Insufficient stock", "Picking", "QC hold", "Packed", "Label created", "In transit", "Out for delivery", "Delivered", "Cancelled", "Failed"];
function requestId() { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
function date(value: string) { return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }); }

export function AuthoritativeOrderBoard() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [canFulfill, setCanFulfill] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [toStatus, setToStatus] = useState<OrderStatus>("Accepted");
  const [reason, setReason] = useState("");
  const [tracking, setTracking] = useState("");
  const [carrier, setCarrier] = useState("UPS");
  const [transitionRequest, setTransitionRequest] = useState(requestId);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/orders", { cache: "no-store", headers: { Accept: "application/json" } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Orders are unavailable.");
      setOrders(body.orders ?? []);
      setCanFulfill(body.permissions?.canFulfill === true);
      setSelectedId((current) => current || body.orders?.[0]?.id || "");
      setError(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Orders are unavailable."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const selected = orders.find((order) => order.id === selectedId) ?? null;
  const availableNext = useMemo(
    () => selected ? NEXT.filter((status) => canAdvance(selected.status, status)) : NEXT,
    [selected],
  );
  useEffect(() => {
    if (selected && !availableNext.includes(toStatus)) setToStatus(availableNext[0] ?? "Accepted");
  }, [availableNext, selected, toStatus]);
  const stuck = useMemo(() => orders.filter((order) => {
    const hours = SLA_HOURS[order.status];
    return hours !== null && Date.now() - new Date(order.lastActivity).getTime() > hours * 3_600_000;
  }), [orders]);
  const owed = useMemo(() => orders.flatMap((order) => order.outbox).filter((entry) => entry.status !== "delivered"), [orders]);

  async function transition() {
    if (!selected) return;
    setWorking(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/orders", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: transitionRequest, orderId: selected.id, toStatus, reason,
          tracking: tracking || undefined,
          carrier: toStatus === "Label created" || toStatus === "In transit" ? carrier : undefined,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error ?? "The fulfillment update was refused.");
      setNotice(body.duplicate ? "The existing transition was returned safely." : `Order moved to ${toStatus} with audit evidence.`);
      setTransitionRequest(requestId()); setReason(""); setTracking("");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The fulfillment update was refused."); }
    finally { setWorking(false); }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="label-eyebrow">AUTHORITATIVE FULFILLMENT</p><h2 className="mt-1 font-display text-heading font-semibold text-ink-50">Orders owed to patients</h2><p className="mt-1 text-detail text-ink-500">Order facts, status history and partner handoff debt come from Postgres—not browser memory.</p></div>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
      </div>
      {error && <p className="rounded-lg border border-high/30 bg-high/[0.06] px-3 py-2 text-detail text-high">{error}</p>}
      {notice && <p className="rounded-lg border border-optimal/30 bg-optimal/[0.06] px-3 py-2 text-detail text-optimal">{notice}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Fact label="Orders in scope" value={String(orders.length)} icon={<PackageCheck className="h-4 w-4" />} />
        <Fact label="Partner intents owed" value={String(owed.length)} icon={<Truck className="h-4 w-4" />} />
        <Fact label="Past SLA" value={String(stuck.length)} icon={<Clock3 className="h-4 w-4" />} />
        <Fact label="Exceptions" value={String(orders.filter((order) => ["Insufficient stock", "QC hold", "Failed"].includes(order.status)).length)} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>
      {loading && orders.length === 0 ? <p className="text-detail text-ink-500">Loading authoritative orders…</p> : orders.length === 0 ? <EmptyState icon={<PackageCheck className="h-6 w-6" />} title="No authoritative orders in scope" hint="Apex has no live fulfillment obligations in your current scope." /> : (
        <div className="overflow-x-auto rounded-xl border border-ink-800"><table className="w-full min-w-[820px] text-left text-detail"><thead className="bg-ink-900/70 text-ink-500"><tr><th className="p-3">Patient / order</th><th className="p-3">Items</th><th className="p-3">Status</th><th className="p-3">Handoff</th><th className="p-3">Last activity</th><th className="p-3">Total</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-t border-ink-800"><td className="p-3"><p className="font-medium text-ink-100">{order.patient.patientPreferredName || order.patient.patientFirstName} {order.patient.patientLastName}</p><button className="stat-mono text-micro text-gold-300" onClick={() => setSelectedId(order.id)}>{order.id} · {order.patient.patientMrn}</button></td><td className="p-3 text-ink-300">{order.lines.map((line) => `${line.quantity}× ${line.name}`).join(", ")}</td><td className="p-3"><Badge tone={statusTone(order.status)}>{order.status}</Badge></td><td className="p-3 text-ink-300">{order.fulfillmentPartner}{order.outbox.some((entry) => entry.status !== "delivered") && <Badge tone="watch" className="ml-2">owed</Badge>}</td><td className="p-3 text-ink-400">{date(order.lastActivity)}</td><td className="p-3 stat-mono text-ink-100">{money(order.totalCents)}</td></tr>)}</tbody></table></div>
      )}
      {selected && <Card><CardHeader><CardTitle>Order {selected.id}</CardTitle></CardHeader><CardContent className="space-y-3"><div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{selected.events.map((event) => <div key={event.id} className={`rounded-lg border p-3 ${event.applied ? "border-ink-800" : "border-high/30 bg-high/[0.04]"}`}><div className="flex justify-between gap-2"><Badge tone={event.applied ? "neutral" : "high"}>{event.toStatus}</Badge><span className="text-micro text-ink-600">{date(event.at)}</span></div><p className="mt-2 text-detail text-ink-300">{event.actorName}</p><p className="text-micro text-ink-500">{event.rejectionReason || event.note || "No note"}</p></div>)}</div>{canFulfill && availableNext.length > 0 && <div className="grid grid-cols-1 gap-2 border-t border-ink-800 pt-3 sm:grid-cols-4"><SelectInput label="Next status" value={toStatus} onChange={(value) => setToStatus(value as OrderStatus)} options={availableNext} /><Input label="Required reason" value={reason} onChange={setReason} />{(toStatus === "Label created" || toStatus === "In transit") && <><SelectInput label="Carrier" value={carrier} onChange={setCarrier} options={["UPS", "FedEx", "USPS", "Courier"]} /><Input label="Tracking" value={tracking} onChange={setTracking} /></>}<div className="sm:col-span-4"><Button variant="primary" disabled={working || reason.trim().length < 3 || ((toStatus === "Label created" || toStatus === "In transit") && tracking.trim().length < 4)} onClick={() => void transition()}><CheckCircle2 className="h-4 w-4" /> Commit status</Button></div></div>}</CardContent></Card>}
    </section>
  );
}

function Fact({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) { return <div className="rounded-xl border border-ink-800 bg-ink-900/40 p-4"><div className="flex items-center justify-between text-ink-500"><p className="label-eyebrow">{label}</p>{icon}</div><p className="stat-mono mt-1 text-title text-ink-50">{value}</p></div>; }
function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-micro text-ink-500">{label}<input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-ink-700 bg-ink-900 px-3 text-body text-ink-100" /></label>; }
function SelectInput({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) { return <label className="text-micro text-ink-500">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-ink-700 bg-ink-900 px-3 text-body text-ink-100">{options.map((option) => <option key={option}>{option}</option>)}</select></label>; }
