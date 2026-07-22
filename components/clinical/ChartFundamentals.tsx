"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, Loader2, Plus, ShieldAlert, X } from "lucide-react";
import { Badge, Button, EmptyState, Input, Select, Textarea } from "@/components/ui/primitives";

type Allergy = { id: string; substance: string; reaction: string | null; severity: string; noKnownAllergies: boolean; recordedAt: string; endedAt: string | null };
type Problem = { id: string; label: string; icd10: string | null; status: string; onsetOn: string | null; resolvedOn: string | null; recordedAt: string };
type Medication = { id: string; name: string; dose: string | null; frequency: string | null; prescriber: string | null; external: boolean; startedOn: string | null; stoppedOn: string | null; recordedAt: string };
type Fundamentals = { allergies: Allergy[]; problems: Problem[]; medications: Medication[] };

type EndTarget = { kind: "allergy" | "problem" | "medication"; id: string; label: string };

const EMPTY: Fundamentals = { allergies: [], problems: [], medications: [] };

export function ChartFundamentals({ clientId }: { clientId: string }) {
  const [data, setData] = useState<Fundamentals>(EMPTY);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [kind, setKind] = useState<"allergy" | "problem" | "medication">("medication");
  const [primary, setPrimary] = useState("");
  const [detail, setDetail] = useState("");
  const [secondary, setSecondary] = useState("");
  const [severity, setSeverity] = useState("unknown");
  const [ending, setEnding] = useState<EndTarget | null>(null);
  const [endReason, setEndReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/chart/fundamentals?clientId=${encodeURIComponent(clientId)}`, { cache: "no-store" });
      const payload = await response.json() as { fundamentals?: Fundamentals; canEdit?: boolean; error?: string };
      if (!response.ok || !payload.fundamentals) throw new Error(payload.error ?? "Chart reconciliation data could not be loaded.");
      setData(payload.fundamentals); setCanEdit(Boolean(payload.canEdit));
    } catch (err) { setError(err instanceof Error ? err.message : "Chart reconciliation data could not be loaded."); }
    finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  const active = useMemo(() => ({
    allergies: data.allergies.filter((row) => !row.endedAt),
    problems: data.problems.filter((row) => row.status !== "resolved"),
    medications: data.medications.filter((row) => !row.stoppedOn),
  }), [data]);

  async function change(body: Record<string, unknown>) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/chart/fundamentals", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, ...body }),
      });
      const payload = await response.json() as { fundamentals?: Fundamentals; ledgerId?: string; error?: string };
      if (!response.ok || !payload.fundamentals) throw new Error(payload.error ?? "The chart update was not confirmed.");
      setData(payload.fundamentals);
      setNotice(`Saved to the chart and audit ledger ${payload.ledgerId ?? ""}.`);
      return true;
    } catch (err) { setError(err instanceof Error ? err.message : "The chart update was not confirmed."); return false; }
    finally { setBusy(false); }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!primary.trim()) return;
    const ok = await change(kind === "allergy"
      ? { kind, operation: "add", substance: primary.trim(), reaction: detail.trim(), severity }
      : kind === "problem"
        ? { kind, operation: "add", label: primary.trim(), icd10: secondary.trim(), onsetOn: detail.trim() || undefined }
        : { kind, operation: "add", name: primary.trim(), dose: detail.trim(), frequency: secondary.trim() });
    if (ok) { setPrimary(""); setDetail(""); setSecondary(""); setSeverity("unknown"); }
  }

  async function end() {
    if (!ending || !endReason.trim()) return;
    if (await change({ kind: ending.kind, operation: "end", id: ending.id, reason: endReason.trim() })) {
      setEnding(null); setEndReason("");
    }
  }

  async function noKnownAllergies() {
    await change({ kind: "allergy", operation: "add", noKnownAllergies: true });
  }

  async function reconcile() {
    await change({ kind: "reconcile", operation: "reconcile", reason: "Medical reviewed the active allergy, problem, and medication lists with available sources." });
  }

  if (loading) return <div className="flex items-center gap-2 py-12 text-detail text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading live chart fundamentals…</div>;

  const section = (title: string, rows: Array<{ id: string; label: string; detail: string; tone?: "high" | "watch" | "info" }>, targetKind: EndTarget["kind"]) => (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-3"><h3 className="font-display text-heading text-ink-50">{title}</h3><Badge tone={rows.length ? "info" : "neutral"}>{rows.length} active</Badge></div>
      {rows.length ? <ul className="mt-4 divide-y divide-ink-800">{rows.map((row) => <li key={row.id} className="flex items-start justify-between gap-4 py-3"><div><p className="font-medium text-ink-100">{row.label}</p><p className="mt-1 text-detail text-ink-500">{row.detail}</p></div>{canEdit && <Button size="sm" variant="ghost" onClick={() => { setEnding({ kind: targetKind, id: row.id, label: row.label }); setEndReason(""); }}><X className="h-3.5 w-3.5" /> End</Button>}</li>)}</ul> : <EmptyState title={`No active ${title.toLowerCase()}`} hint="An empty list is not the same as a completed reconciliation." />}
    </section>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-panel border border-teal-400/25 bg-teal-400/5 p-5">
        <div><div className="flex items-center gap-2 text-detail font-medium text-teal-300"><ClipboardCheck className="h-4 w-4" /> Medication and history reconciliation</div><p className="mt-2 max-w-3xl text-detail leading-relaxed text-ink-300">Coaches may read this shared record. Only Medical can add, resolve, stop, or attest reconciliation. Ending a record preserves it in history.</p></div>
        {canEdit && <Button variant="outline" onClick={() => void reconcile()} disabled={busy}><CheckCircle2 className="h-4 w-4" /> Mark all reviewed today</Button>}
      </div>

      {error && <div className="rounded-control border border-high/30 bg-high/5 p-4 text-detail text-high" role="alert">{error}</div>}
      {notice && <div className="rounded-control border border-teal-400/30 bg-teal-400/5 p-4 text-detail text-teal-300" role="status">{notice}</div>}

      <div className="grid gap-4 xl:grid-cols-3">
        {section("Allergies", active.allergies.map((row) => ({ id: row.id, label: row.substance, detail: row.noKnownAllergies ? "Medical attestation · no known allergies" : `${row.reaction || "Reaction not recorded"} · ${row.severity}` })), "allergy")}
        {section("Problems", active.problems.map((row) => ({ id: row.id, label: row.label, detail: [row.icd10, row.onsetOn ? `Onset ${row.onsetOn}` : null].filter(Boolean).join(" · ") || "Code and onset not recorded" })), "problem")}
        {section("Outside medications", active.medications.map((row) => ({ id: row.id, label: row.name, detail: [row.dose, row.frequency, row.prescriber ? `Prescriber ${row.prescriber}` : null].filter(Boolean).join(" · ") || "Dose and frequency not recorded" })), "medication")}
      </div>

      {canEdit && (
        <form className="card p-5" onSubmit={add}>
          <div className="flex items-center gap-2"><Plus className="h-4 w-4 text-gold-300" /><h3 className="font-display text-heading text-ink-50">Add reconciled item</h3></div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <Select value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); setPrimary(""); setDetail(""); setSecondary(""); }} aria-label="Record kind"><option value="medication">Outside medication</option><option value="allergy">Allergy</option><option value="problem">Problem</option></Select>
            <Input value={primary} onChange={(event) => setPrimary(event.target.value)} placeholder={kind === "medication" ? "Medication name" : kind === "allergy" ? "Allergen" : "Problem / diagnosis"} required />
            <Input value={detail} onChange={(event) => setDetail(event.target.value)} placeholder={kind === "medication" ? "Dose" : kind === "allergy" ? "Reaction" : "Onset YYYY-MM-DD"} />
            {kind === "allergy" ? <Select value={severity} onChange={(event) => setSeverity(event.target.value)}><option>unknown</option><option>mild</option><option>moderate</option><option>severe</option><option>anaphylaxis</option></Select> : <Input value={secondary} onChange={(event) => setSecondary(event.target.value)} placeholder={kind === "medication" ? "Frequency" : "ICD-10 (if known)"} />}
          </div>
          <div className="mt-4 flex flex-wrap justify-between gap-3">{kind === "allergy" && <Button type="button" variant="outline" onClick={() => void noKnownAllergies()} disabled={busy}><ShieldAlert className="h-4 w-4" /> Document no known allergies</Button>}<Button type="submit" className="ml-auto" disabled={busy || !primary.trim()}>{busy ? "Saving…" : "Add to chart"}</Button></div>
        </form>
      )}

      {ending && <div className="card border-watch/30 p-5"><h3 className="font-display text-heading text-ink-50">End “{ending.label}”</h3><p className="mt-1 text-detail text-ink-400">The original record remains visible. State why Medical is changing its active status.</p><Textarea className="mt-3 min-h-20" value={endReason} onChange={(event) => setEndReason(event.target.value)} placeholder="Reconciliation / correction reason (required)" /><div className="mt-3 flex justify-end gap-2"><Button variant="ghost" onClick={() => setEnding(null)}>Back</Button><Button variant="danger" onClick={() => void end()} disabled={!endReason.trim() || busy}>Confirm and preserve history</Button></div></div>}

      <details className="card p-5"><summary className="cursor-pointer text-detail font-medium text-ink-300">Inactive / resolved history ({data.allergies.length + data.problems.length + data.medications.length - active.allergies.length - active.problems.length - active.medications.length})</summary><div className="mt-3 space-y-2 text-detail text-ink-500">{data.allergies.filter((row) => row.endedAt).map((row) => <p key={row.id}>Allergy ended · {row.substance} · {row.endedAt?.slice(0, 10)}</p>)}{data.problems.filter((row) => row.status === "resolved").map((row) => <p key={row.id}>Problem resolved · {row.label} · {row.resolvedOn}</p>)}{data.medications.filter((row) => row.stoppedOn).map((row) => <p key={row.id}>Medication stopped · {row.name} · {row.stoppedOn}</p>)}</div></details>
    </div>
  );
}

