"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Loader2,
  MessageSquare,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";

import { CallPatient } from "@/components/comms/CallPatient";
import { AuthoritativeConsultNote } from "@/components/consult/AuthoritativeConsultNote";
import { PatientPlanEditor } from "@/components/patient/PatientPlanEditor";
import { PatientRecommendationEditor } from "@/components/patient/PatientRecommendationEditor";
import { Badge, Card, CardContent } from "@/components/ui/primitives";

interface PatientChart {
  ledgerId: string;
  canCall: boolean;
  permissions: { clinical: boolean; contacts: boolean; financial: boolean; fulfillment: boolean; writeConsult: boolean; writeNutrition: boolean; writeTraining: boolean };
  patient: {
    mrn: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    dateOfBirth: string | null;
    sex: string | null;
    email: string | null;
    phone: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    status: string;
    homeLocationId: string | null;
    sourceUpdatedAt: string | null;
  };
  consults: Array<{
    id: string; authorName: string | null; kind: string; channel: string; status: string;
    startedAt: string; rawNotes: string | null; subjective: string | null; objective: string | null;
    assessment: string | null; plan: string | null;
  }>;
  contacts: Array<{
    id: string; staffName: string | null; at: string; channel: string; direction: string;
    subject: string | null; outcome: string | null; notes: string | null; hasAttachments: boolean;
  }>;
  sales: Array<{
    id: string; kind: string; orderNumber: string | null; occurredAt: string; location: string | null;
    totalCents: number; lines: Array<{ id: string; description: string; quantity: number; totalCents: number }>;
  }>;
  fulfillment: Array<{
    id: string; recordKind: string; orderNumber: string | null; partner: string; status: string;
    occurredAt: string; itemName: string | null; quantity: number | null; delayed: boolean; delayReason: string | null;
  }>;
}

function dateTime(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : value;
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function Section({
  title,
  icon: Icon,
  count,
  allowed,
  children,
}: {
  title: string;
  icon: typeof FileText;
  count: number;
  allowed: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-panel border border-ink-700 bg-ink-900/30">
      <header className="flex items-center gap-3 border-b border-ink-800 px-5 py-4">
        <Icon className="h-5 w-5 text-gold-300" aria-hidden />
        <h2 className="font-display text-heading text-ink-100">{title}</h2>
        <Badge className="ml-auto">{allowed ? count.toLocaleString() : "Restricted"}</Badge>
      </header>
      {allowed ? <div className="divide-y divide-ink-800">{children}</div> : (
        <p className="p-5 text-detail text-ink-500">This section is outside your role and care scope.</p>
      )}
    </section>
  );
}

export default function PatientChartPage() {
  const { id } = useParams<{ id: string }>();
  const [chart, setChart] = useState<PatientChart | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/clients/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load this patient.");
        if (active) setChart(payload);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load this patient.");
      });
    return () => { active = false; };
  }, [id]);

  if (error) {
    return (
      <div className="space-y-5">
        <Link href="/clients" className="inline-flex items-center gap-2 text-detail text-ink-400 hover:text-ink-100">
          <ArrowLeft className="h-4 w-4" /> Patients
        </Link>
        <p className="rounded-panel border border-high/30 bg-high/5 p-5 text-high">{error}</p>
      </div>
    );
  }
  if (!chart) {
    return <div className="flex items-center gap-2 py-16 text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading protected patient record…</div>;
  }

  const p = chart.patient;
  const address = [p.address1, p.address2, [p.city, p.state, p.zip].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <Link href="/clients" className="inline-flex items-center gap-2 text-detail text-ink-400 hover:text-ink-100">
        <ArrowLeft className="h-4 w-4" /> Patients
      </Link>

      <header>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="optimal">AUTHORITATIVE APEX CHART</Badge>
          <Badge tone="high">RESTRICTED PHI</Badge>
        </div>
        <h1 className="mt-3 font-display text-display text-ink-50">
          {p.preferredName || p.firstName} {p.lastName}
        </h1>
        <p className="mt-1 stat-mono text-detail text-ink-500">{p.mrn}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-5"><p className="label-eyebrow">Identity</p><p className="mt-2 text-body text-ink-100">{p.dateOfBirth || "DOB unavailable"} · {p.sex || "Sex unavailable"}</p><Badge className="mt-3">{p.status}</Badge></CardContent></Card>
        <Card><CardContent className="p-5"><p className="label-eyebrow">Contact</p><p className="mt-2 text-body text-ink-100">{p.email || "Email unavailable"}</p><p className="mt-1 text-detail text-ink-400">{p.phone || "Phone unavailable"}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="label-eyebrow">Home</p><p className="mt-2 text-body text-ink-100">{p.homeLocationId || "Clinic unresolved"}</p><p className="mt-1 text-detail text-ink-400">{address || "Address unavailable"}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="label-eyebrow">Access witness</p><p className="mt-2 flex items-center gap-1.5 text-detail text-optimal"><ShieldCheck className="h-4 w-4" /> {chart.ledgerId}</p><p className="mt-2 text-micro text-ink-500">Source updated {dateTime(p.sourceUpdatedAt)}</p></CardContent></Card>
      </div>

      {chart.canCall && (
        <CallPatient clientId={id} clientName={`${p.preferredName || p.firstName} ${p.lastName}`} phone={p.phone} />
      )}

      {chart.permissions.writeConsult && <AuthoritativeConsultNote clientId={id} />}
      <PatientPlanEditor clientId={id} canNutrition={chart.permissions.writeNutrition} canTraining={chart.permissions.writeTraining} />
      {chart.permissions.writeConsult && <PatientRecommendationEditor clientId={id} />}

      <Section title="Consult and clinical notes" icon={FileText} count={chart.consults.length} allowed={chart.permissions.clinical}>
        {chart.consults.length ? chart.consults.map((row) => (
          <article key={row.id} className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{row.kind}</Badge><Badge>{row.channel}</Badge><Badge tone={row.status === "Signed" ? "optimal" : undefined}>{row.status}</Badge>
              <span className="ml-auto text-micro text-ink-500">{dateTime(row.startedAt)} · {row.authorName || "Historical author"}</span>
            </div>
            {row.rawNotes && <p className="mt-4 whitespace-pre-wrap text-body leading-relaxed text-ink-200">{row.rawNotes}</p>}
            {(row.subjective || row.objective || row.assessment || row.plan) && (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {(["subjective", "objective", "assessment", "plan"] as const).map((field) => row[field] ? (
                  <div key={field} className="rounded-control border border-ink-800 bg-ink-950/40 p-3">
                    <p className="label-eyebrow">{field}</p><p className="mt-2 whitespace-pre-wrap text-detail text-ink-300">{row[field]}</p>
                  </div>
                ) : null)}
              </div>
            )}
          </article>
        )) : <p className="p-5 text-detail text-ink-500">No linked consult notes.</p>}
      </Section>

      <Section title="Coach contact history" icon={MessageSquare} count={chart.contacts.length} allowed={chart.permissions.contacts}>
        {chart.contacts.length ? chart.contacts.map((row) => (
          <article key={row.id} className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{row.channel}</Badge><Badge>{row.direction}</Badge>
              {row.hasAttachments && <Badge tone="watch">attachments preserved</Badge>}
              <span className="ml-auto text-micro text-ink-500">{dateTime(row.at)} · {row.staffName || "Unassigned"}</span>
            </div>
            {row.subject && <p className="mt-3 font-medium text-ink-100">{row.subject}</p>}
            <p className="mt-2 whitespace-pre-wrap text-detail leading-relaxed text-ink-300">{row.notes || row.outcome || "No message body retained."}</p>
          </article>
        )) : <p className="p-5 text-detail text-ink-500">No linked contact history.</p>}
      </Section>

      <Section title="Historical sales" icon={ReceiptText} count={chart.sales.length} allowed={chart.permissions.financial}>
        {chart.sales.length ? chart.sales.map((row) => (
          <details key={row.id} className="group p-5">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
              <Badge>{row.kind}</Badge><span className="font-medium text-ink-100">{row.orderNumber || "Historical transaction"}</span>
              <span className="text-detail text-ink-500">{dateTime(row.occurredAt)} · {row.location || "Location unresolved"}</span>
              <span className="ml-auto stat-mono text-ink-100">{money(row.totalCents)}</span>
            </summary>
            <div className="mt-4 space-y-2">
              {row.lines.map((line) => (
                <div key={line.id} className="flex gap-3 rounded-control border border-ink-800 bg-ink-950/35 p-3 text-detail">
                  <span className="text-ink-500">{line.quantity}×</span><span className="flex-1 text-ink-300">{line.description}</span><span className="stat-mono text-ink-100">{money(line.totalCents)}</span>
                </div>
              ))}
            </div>
          </details>
        )) : <p className="p-5 text-detail text-ink-500">No linked sales.</p>}
      </Section>

      <Section title="Fulfillment history" icon={PackageCheck} count={chart.fulfillment.length} allowed={chart.permissions.fulfillment}>
        {chart.fulfillment.length ? chart.fulfillment.map((row) => (
          <article key={row.id} className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{row.recordKind}</Badge><Badge tone={row.delayed ? "high" : "optimal"}>{row.status}</Badge>
              <span className="font-medium text-ink-100">{row.orderNumber || "Historical fulfillment"}</span>
              <span className="ml-auto text-micro text-ink-500">{dateTime(row.occurredAt)}</span>
            </div>
            <p className="mt-2 text-detail text-ink-300">{row.itemName || "Structured items retained"}{row.quantity ? ` · ${row.quantity}` : ""} · {row.partner}</p>
            {row.delayReason && <p className="mt-2 text-detail text-high">{row.delayReason}</p>}
          </article>
        )) : <p className="p-5 text-detail text-ink-500">No linked fulfillment history.</p>}
      </Section>
    </div>
  );
}
