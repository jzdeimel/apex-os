"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Loader2 } from "lucide-react";
import { Button, Input, Select, Textarea } from "@/components/ui/primitives";

type ClientRef = { id: string; firstName: string; lastName: string; preferredName: string | null; homeLocationId: string | null };
type StaffRef = { id: string; name: string; role: string; title: string | null; locationIds: unknown };
type LocationRef = { id: string; name: string; timezone: string };
type Confirmation = { id: string; ledgerId: string | null; kind: "single" | "ncv"; count: number };

function initialTime(minutesFromNow: number) {
  const date = new Date(Date.now() + minutesFromNow * 60_000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function LiveBookingForm() {
  const [clients, setClients] = useState<ClientRef[]>([]);
  const [staff, setStaff] = useState<StaffRef[]>([]);
  const [locations, setLocations] = useState<LocationRef[]>([]);
  const [clientId, setClientId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [bookingKind, setBookingKind] = useState<"single" | "ncv">("single");
  const [visitType, setVisitType] = useState("Coach consult");
  const [modality, setModality] = useState("in-person");
  const [startAt, setStartAt] = useState(() => initialTime(60));
  const [endAt, setEndAt] = useState(() => initialTime(90));
  const [gapMinutes, setGapMinutes] = useState("10");
  const [reason, setReason] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Confirmation | null>(null);

  useEffect(() => {
    void fetch("/api/scheduling/reference", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { clients?: ClientRef[]; staff?: StaffRef[]; locations?: LocationRef[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "The booking directory could not be loaded.");
        setClients(payload.clients ?? []);
        setStaff(payload.staff ?? []);
        setLocations(payload.locations ?? []);
        setClientId(payload.clients?.[0]?.id ?? "");
        setLocationId(payload.clients?.[0]?.homeLocationId ?? payload.locations?.[0]?.id ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "The booking directory could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  const eligibleStaff = useMemo(() => staff.filter((person) => {
    const ids = Array.isArray(person.locationIds) ? person.locationIds as string[] : [];
    return !locationId || ids.includes(locationId);
  }), [staff, locationId]);

  useEffect(() => {
    if (!eligibleStaff.some((person) => person.id === staffId)) setStaffId(eligibleStaff[0]?.id ?? "");
  }, [eligibleStaff, staffId]);

  function selectClient(id: string) {
    setClientId(id);
    const person = clients.find((row) => row.id === id);
    if (person?.homeLocationId && locations.some((row) => row.id === person.homeLocationId)) setLocationId(person.homeLocationId);
  }

  async function book(event: FormEvent) {
    event.preventDefault();
    if (!clientId || !locationId || (bookingKind === "single" && !staffId) || busy) return;
    setBusy(true);
    setError(null);
    setConfirmed(null);
    try {
      const requestId = crypto.randomUUID();
      const response = await fetch(bookingKind === "ncv" ? "/api/appointments/ncv" : "/api/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bookingKind === "ncv"
          ? {
              clientId,
              locationId,
              startAt: new Date(startAt).toISOString(),
              gapMinutes: Number(gapMinutes),
              reason: reason.trim(),
              overrideReason: overrideReason.trim() || undefined,
              requestId,
            }
          : {
              clientId,
              staffId,
              locationId,
              visitType,
              modality,
              startAt: new Date(startAt).toISOString(),
              endAt: new Date(endAt).toISOString(),
              reason: reason.trim(),
              overrideReason: overrideReason.trim() || undefined,
              requestId,
            }),
      });
      const payload = await response.json() as {
        appointment?: { id: string };
        appointments?: Array<{ id: string; bookingGroupId?: string | null }>;
        ledgerId?: string | null;
        ledger?: { id: string } | null;
        error?: string;
        reason?: string;
        blockedOn?: string;
        issues?: string[];
      };
      if (!response.ok) {
        const blocked = payload.blockedOn ? ` The ${payload.blockedOn.replaceAll("-", " ")} could not be staffed.` : "";
        const detail = payload.issues?.length ? ` ${payload.issues.join(" ")}` : "";
        throw new Error(`${payload.error ?? payload.reason ?? "The appointment was not confirmed."}${blocked}${detail}`);
      }
      if (bookingKind === "ncv") {
        if (!payload.appointments?.length) throw new Error("The complete New Client Visit was not confirmed.");
        setConfirmed({
          id: payload.appointments[0].bookingGroupId ?? payload.appointments[0].id,
          ledgerId: payload.ledger?.id ?? null,
          kind: "ncv",
          count: payload.appointments.length,
        });
      } else {
        if (!payload.appointment) throw new Error("The appointment was not confirmed.");
        setConfirmed({ id: payload.appointment.id, ledgerId: payload.ledgerId ?? null, kind: "single", count: 1 });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The appointment was not confirmed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="flex items-center gap-2 py-12 text-detail text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading patients, staff, and clinics…</div>;
  if (confirmed) return (
    <div className="card border-optimal/30 p-6">
      <CalendarCheck className="h-7 w-7 text-optimal" />
      <h2 className="mt-3 font-display text-title text-ink-50">{confirmed.kind === "ncv" ? "Complete NCV confirmed" : "Appointment confirmed"}</h2>
      <p className="mt-2 text-body text-ink-300">
        {confirmed.kind === "ncv" ? `${confirmed.count} linked appointments` : "The appointment"} under <span className="stat-mono">{confirmed.id}</span> and audit witness <span className="stat-mono">{confirmed.ledgerId ?? "existing idempotent request"}</span> committed together.
      </p>
      <div className="mt-5 flex gap-2"><Link href="/desk"><Button>Open today</Button></Link><Button variant="outline" onClick={() => setConfirmed(null)}>Book another</Button></div>
    </div>
  );

  return (
    <form className="card space-y-5 p-5" onSubmit={book}>
      <div><p className="label-eyebrow">LIVE BOOKING</p><h2 className="mt-1 font-display text-heading text-ink-50">Create an authoritative appointment</h2><p className="mt-1 text-detail text-ink-400">Apex rechecks staff credentials, approved hours, Apex conflicts, patient conflicts, and connected-calendar busy time at commit.</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-detail text-ink-300">Booking type<Select className="mt-1" value={bookingKind} onChange={(event) => setBookingKind(event.target.value as "single" | "ncv")}><option value="single">Single appointment</option><option value="ncv">Complete New Client Visit</option></Select></label>
        <label className="text-detail text-ink-300">Patient<Select className="mt-1" value={clientId} onChange={(event) => selectClient(event.target.value)} required>{clients.map((person) => <option key={person.id} value={person.id}>{person.preferredName || `${person.firstName} ${person.lastName}`}</option>)}</Select></label>
        <label className="text-detail text-ink-300">Clinic<Select className="mt-1" value={locationId} onChange={(event) => setLocationId(event.target.value)} required>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select></label>
        {bookingKind === "single" && <label className="text-detail text-ink-300">Staff<Select className="mt-1" value={staffId} onChange={(event) => setStaffId(event.target.value)} required>{eligibleStaff.map((person) => <option key={person.id} value={person.id}>{person.name}{person.title ? ` · ${person.title}` : ""}</option>)}</Select></label>}
        {bookingKind === "single" && <label className="text-detail text-ink-300">Visit type<Select className="mt-1" value={visitType} onChange={(event) => setVisitType(event.target.value)}><option>Coach consult</option><option>Medical visit</option><option>Follow-up</option><option>Lab draw</option><option>Telehealth</option></Select></label>}
        <label className="text-detail text-ink-300">Start<Input type="datetime-local" className="mt-1" value={startAt} onChange={(event) => setStartAt(event.target.value)} required /></label>
        {bookingKind === "single" && <label className="text-detail text-ink-300">End<Input type="datetime-local" className="mt-1" value={endAt} onChange={(event) => setEndAt(event.target.value)} required /></label>}
        {bookingKind === "single" && <label className="text-detail text-ink-300">Modality<Select className="mt-1" value={modality} onChange={(event) => setModality(event.target.value)}><option value="in-person">In person</option><option value="telehealth">Telehealth</option><option value="phone">Phone</option></Select></label>}
        {bookingKind === "ncv" && <label className="text-detail text-ink-300">Minutes between components<Input type="number" min={0} max={30} step={5} className="mt-1" value={gapMinutes} onChange={(event) => setGapMinutes(event.target.value)} required /></label>}
      </div>
      {bookingKind === "ncv" && <div className="rounded-control border border-info/25 bg-info/5 p-4 text-detail text-ink-300">One confirmation creates coach introduction, lab draw, and physical appointments together. Apex assigns only eligible staff with approved clinic access, current in-state credentials, and available hours. If any component cannot be staffed, nothing is booked.</div>}
      <label className="block text-detail text-ink-300">Visit reason<Textarea className="mt-1 min-h-20" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={10_000} /></label>
      <label className="block text-detail text-ink-300">Approved-hours exception <span className="text-ink-600">(authorized profiles only; collisions, credentials, and location rules cannot be overridden)</span><Input className="mt-1" value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} /></label>
      {error && <div className="rounded-control border border-high/30 bg-high/5 p-4 text-detail text-high" role="alert">{error}</div>}
      <div className="flex justify-end"><Button type="submit" disabled={busy || !clientId || (bookingKind === "single" && !staffId) || !locationId}>{busy ? "Checking and booking…" : bookingKind === "ncv" ? "Confirm complete NCV" : "Confirm appointment"}</Button></div>
    </form>
  );
}
