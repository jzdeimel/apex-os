"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DoorOpen, Loader2, Plus, RefreshCw, ShieldAlert, Wrench } from "lucide-react";

import { Badge, Button, EmptyState, Input, Select, Textarea } from "@/components/ui/primitives";
import { RESOURCE_KINDS, RESOURCE_TYPES } from "@/lib/clinic-resources/lifecycle";

type Resource = {
  id: string;
  locationId: string;
  label: string;
  resourceType: string;
  kind: string;
  capacity: number;
  status: string;
  note: string | null;
};

type Reservation = {
  id: string;
  resourceId: string;
  appointmentId: string | null;
  encounterId: string | null;
  status: string;
  startAt: string;
  endAt: string;
};

type Location = { id: string; name: string };

function todayWindow() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function requestId() {
  return crypto.randomUUID().replaceAll("-", "_");
}

export function AuthoritativeResourceBoard() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [mayAdmin, setMayAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationId, setLocationId] = useState("");
  const [label, setLabel] = useState("");
  const [resourceType, setResourceType] = useState("room");
  const [kind, setKind] = useState("exam");
  const [capacity, setCapacity] = useState("1");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const range = todayWindow();
      const [resourceResponse, referenceResponse, meResponse] = await Promise.all([
        fetch(`/api/clinic/resources?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`, { cache: "no-store" }),
        fetch("/api/scheduling/reference", { cache: "no-store" }),
        fetch("/api/me", { cache: "no-store" }),
      ]);
      const resourcePayload = await resourceResponse.json() as { resources?: Resource[]; reservations?: Reservation[]; error?: string };
      const referencePayload = await referenceResponse.json() as { locations?: Location[]; error?: string };
      const mePayload = await meResponse.json() as { may?: { adminLocations?: { allowed?: boolean } } };
      if (!resourceResponse.ok) throw new Error(resourcePayload.error ?? "Clinic resources could not be loaded.");
      if (!referenceResponse.ok) throw new Error(referencePayload.error ?? "Clinic locations could not be loaded.");
      setResources(resourcePayload.resources ?? []);
      setReservations(resourcePayload.reservations ?? []);
      setLocations(referencePayload.locations ?? []);
      setLocationId((value) => value || referencePayload.locations?.[0]?.id || "");
      setMayAdmin(Boolean(mePayload.may?.adminLocations?.allowed));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clinic resources could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const occupied = useMemo(() => new Map(
    reservations.filter((row) => row.status === "in-use" || row.status === "reserved").map((row) => [row.resourceId, row]),
  ), [reservations]);

  async function createResource() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/clinic/resources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locationId, label, resourceType, kind, capacity: Number(capacity), note, requestId: requestId() }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The clinic resource was not created.");
      setLabel(""); setNote(""); setCapacity("1");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The clinic resource was not created.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleService(resource: Resource) {
    setSaving(true);
    setError(null);
    const next = resource.status === "active" ? "out-of-service" : "active";
    try {
      const response = await fetch("/api/clinic/resources", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: resource.id, status: next, reason: next === "active" ? "Returned to service by facilities operations." : "Taken out of service by facilities operations." }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The service status was not changed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The service status was not changed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label-eyebrow">AUTHORITATIVE FACILITY REGISTER</p>
          <h2 className="mt-1 font-display text-heading text-ink-50">Rooms and equipment</h2>
          <p className="mt-1 max-w-3xl text-detail text-ink-400">Postgres owns service status and reservations. Rooming commits the appointment and resource allocation together, rejects overlaps, and releases the room at checkout.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
      </div>

      {error && <div role="alert" className="rounded-control border border-high/30 bg-high/5 p-3 text-detail text-high">{error}</div>}
      {loading && !resources.length ? <div className="flex items-center gap-2 py-8 text-detail text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading facility register…</div> : resources.length ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {resources.map((resource) => {
            const reservation = occupied.get(resource.id);
            const location = locations.find((row) => row.id === resource.locationId)?.name ?? resource.locationId;
            return <article key={resource.id} className="card p-4">
              <div className="flex items-start justify-between gap-2"><div><p className="font-medium text-ink-100">{resource.label}</p><p className="mt-0.5 text-micro text-ink-500">{location} · {resource.resourceType} · {resource.kind}</p></div><Badge tone={resource.status === "active" ? reservation ? "gold" : "optimal" : "neutral"}>{resource.status === "active" ? reservation ? reservation.status : "free" : resource.status}</Badge></div>
              {resource.note && <p className="mt-2 text-detail text-ink-400">{resource.note}</p>}
              {reservation && <p className="mt-2 rounded-control bg-ink-900 p-2 text-micro text-ink-400">{reservation.appointmentId ? `Appointment ${reservation.appointmentId}` : "Operational reservation"}<span className="block">{new Date(reservation.startAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–{new Date(reservation.endAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></p>}
              {mayAdmin && resource.status !== "retired" && <Button className="mt-3" size="sm" variant="ghost" disabled={saving || Boolean(reservation)} onClick={() => void toggleService(resource)}><Wrench className="h-3.5 w-3.5" /> {resource.status === "active" ? "Take out of service" : "Return to service"}</Button>}
            </article>;
          })}
        </div>
      ) : <EmptyState icon={<ShieldAlert className="h-6 w-6" />} title="No facility resources are configured" hint="Rooming is intentionally blocked until operations verifies and enters each clinic’s real rooms and equipment." />}

      {mayAdmin && <div className="rounded-panel border border-ink-700 bg-ink-900/60 p-4">
        <div className="flex items-center gap-2"><Plus className="h-4 w-4 text-gold-300" /><h3 className="font-display text-body font-semibold text-ink-100">Add verified resource</h3></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-detail text-ink-300">Clinic<Select className="mt-1" value={locationId} onChange={(event) => setLocationId(event.target.value)}>{locations.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select></label>
          <label className="text-detail text-ink-300">Label<Input className="mt-1" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Exam 1" maxLength={100} /></label>
          <label className="text-detail text-ink-300">Type<Select className="mt-1" value={resourceType} onChange={(event) => setResourceType(event.target.value)}>{RESOURCE_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}</Select></label>
          <label className="text-detail text-ink-300">Clinical use<Select className="mt-1" value={kind} onChange={(event) => setKind(event.target.value)}>{RESOURCE_KINDS.map((value) => <option key={value} value={value}>{value}</option>)}</Select></label>
          <label className="text-detail text-ink-300">Capacity<Input className="mt-1" type="number" min={1} max={100} value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label>
          <label className="text-detail text-ink-300 sm:col-span-2 lg:col-span-3">Facilities note<Textarea className="mt-1 min-h-20" value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} placeholder="Verified equipment or access notes" /></label>
        </div>
        <div className="mt-3 flex justify-end"><Button onClick={() => void createResource()} disabled={saving || !locationId || !label.trim()}><DoorOpen className="h-4 w-4" /> {saving ? "Saving…" : "Add resource"}</Button></div>
      </div>}
    </section>
  );
}
