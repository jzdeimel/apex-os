"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  FileText,
  Loader2,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Badge, Button, Card, CardContent, EmptyState } from "@/components/ui/primitives";

type Patient = {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  status: string;
  homeLocationId: string | null;
  consultCount: number | null;
  contactCount: number;
};

type Appointment = {
  id: string;
  clientId: string;
  clientFirstName: string;
  clientLastName: string;
  clientPreferredName: string | null;
  staffName: string | null;
  locationName: string | null;
  visitType: string;
  modality: string;
  startAt: string;
  endAt: string;
  status: string;
};

function todayBounds() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function time(value: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function AuthoritativeCareHome({ consoleName }: { consoleName: "Coach" | "Medical" }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientCount, setPatientCount] = useState(0);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [ledgerId, setLedgerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const bounds = todayBounds();
      const [directoryResponse, scheduleResponse] = await Promise.all([
        fetch("/api/clients?page=0", { cache: "no-store" }),
        fetch(`/api/appointments?from=${encodeURIComponent(bounds.from)}&to=${encodeURIComponent(bounds.to)}`, { cache: "no-store" }),
      ]);
      const directory = await directoryResponse.json();
      const schedule = await scheduleResponse.json();
      if (!directoryResponse.ok || !directory.ok) throw new Error(directory.error || "Your patient book could not be loaded.");
      if (!scheduleResponse.ok || !schedule.ok) throw new Error(schedule.error || "Your schedule could not be loaded.");
      setPatients(directory.patients ?? []);
      setPatientCount(directory.matching ?? 0);
      setLedgerId(directory.ledgerId ?? "");
      setAppointments(schedule.appointments ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The care workspace could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const consults = useMemo(
    () => patients.reduce((total, patient) => total + (patient.consultCount ?? 0), 0),
    [patients],
  );
  const contacts = useMemo(
    () => patients.reduce((total, patient) => total + patient.contactCount, 0),
    [patients],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="optimal">AUTHORITATIVE WORKSPACE</Badge>
            <Badge>{consoleName.toUpperCase()} CONSOLE</Badge>
          </div>
          <h1 className="mt-2 font-display text-title font-semibold tracking-tight text-ink-50">Today</h1>
          <p className="mt-1 max-w-3xl text-detail text-ink-400">
            Your working book and schedule come from Apex PostgreSQL. There are no substituted patients,
            pinned dates, scripted alerts, or illustrative clinical metrics on this screen.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </header>

      {error && <p className="rounded-control border border-high/30 bg-high/5 p-4 text-detail text-high" role="alert">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-4"><Users className="h-4 w-4 text-gold-300" /><p className="mt-2 label-eyebrow">My approved book</p><p className="mt-1 stat-mono text-title text-ink-50">{patientCount.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="p-4"><CalendarClock className="h-4 w-4 text-info" /><p className="mt-2 label-eyebrow">Today&apos;s visits</p><p className="mt-1 stat-mono text-title text-ink-50">{appointments.length.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="p-4"><FileText className="h-4 w-4 text-optimal" /><p className="mt-2 label-eyebrow">Imported consults in view</p><p className="mt-1 stat-mono text-title text-ink-50">{consults.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="p-4"><MessageSquare className="h-4 w-4 text-watch" /><p className="mt-2 label-eyebrow">Imported touches in view</p><p className="mt-1 stat-mono text-title text-ink-50">{contacts.toLocaleString()}</p></CardContent></Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-panel border border-ink-700 bg-ink-900/30">
          <header className="flex items-center justify-between border-b border-ink-800 px-5 py-4">
            <div>
              <p className="label-eyebrow">LIVE APEX SCHEDULE</p>
              <h2 className="mt-1 font-display text-heading text-ink-50">Visits today</h2>
            </div>
            <Link href="/schedule" className="text-detail text-gold-300 hover:text-gold-200">Open schedule</Link>
          </header>
          {loading ? (
            <div className="flex items-center gap-2 p-5 text-detail text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading visits…</div>
          ) : appointments.length ? (
            <div className="divide-y divide-ink-800">
              {appointments.map((row) => (
                <Link key={row.id} href={`/clients/${row.clientId}`} className="flex gap-3 p-4 transition-colors hover:bg-ink-800/30">
                  <span className="w-20 shrink-0 stat-mono text-detail text-ink-300">{time(row.startAt)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink-100">{row.clientPreferredName || row.clientFirstName} {row.clientLastName}</span>
                    <span className="mt-1 block text-micro text-ink-500">{row.visitType} · {row.modality} · {row.locationName || "Clinic unresolved"}</span>
                  </span>
                  <Badge>{row.status}</Badge>
                </Link>
              ))}
            </div>
          ) : <EmptyState title="No authoritative appointments in your schedule today" />}
        </section>

        <section className="rounded-panel border border-ink-700 bg-ink-900/30">
          <header className="flex items-center justify-between border-b border-ink-800 px-5 py-4">
            <div>
              <p className="label-eyebrow">ASSIGNED SCOPE</p>
              <h2 className="mt-1 font-display text-heading text-ink-50">Patient book</h2>
            </div>
            <Link href="/clients" className="text-detail text-gold-300 hover:text-gold-200">All patients</Link>
          </header>
          {loading ? (
            <div className="flex items-center gap-2 p-5 text-detail text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading patients…</div>
          ) : patients.length ? (
            <div className="divide-y divide-ink-800">
              {patients.slice(0, 10).map((patient) => (
                <Link key={patient.id} href={`/clients/${patient.id}`} className="flex items-center gap-3 p-4 transition-colors hover:bg-ink-800/30">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-ink-800 text-micro font-semibold text-ink-200">
                    {patient.firstName.slice(0, 1)}{patient.lastName.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink-100">{patient.preferredName || patient.firstName} {patient.lastName}</span>
                    <span className="mt-1 block stat-mono text-micro text-ink-500">{patient.mrn} · {patient.homeLocationId || "Clinic unresolved"}</span>
                  </span>
                  <Badge>{patient.status}</Badge>
                </Link>
              ))}
            </div>
          ) : <EmptyState title="No authoritative patients are assigned to your current scope" />}
        </section>
      </div>

      {ledgerId && (
        <p className="flex items-center gap-2 text-micro text-ink-600">
          <ShieldCheck className="h-4 w-4 text-optimal" /> Directory access witnessed as {ledgerId}.
        </p>
      )}
    </div>
  );
}
