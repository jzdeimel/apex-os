"use client";

import { useState } from "react";
import { CheckCircle2, LifeBuoy, Loader2, ShieldAlert } from "lucide-react";

import { Badge, Button, Input, Select, Textarea } from "@/components/ui/primitives";

export default function OpenSupportCasePage() {
  const [kind, setKind] = useState("support");
  const [priority, setPriority] = useState("normal");
  const [subject, setSubject] = useState("");
  const [detail, setDetail] = useState("");
  const [clientId, setClientId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [saving, setSaving] = useState(false);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setCaseId(null);
    try {
      const response = await fetch("/api/operations/cases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          priority,
          subject,
          detail,
          clientId: clientId || undefined,
          locationId: locationId || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The case was not confirmed.");
      setCaseId(payload.case.id);
      setSubject("");
      setDetail("");
      setClientId("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The case was not confirmed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <div className="flex items-center gap-2 text-detail text-teal-300">
          <LifeBuoy className="h-4 w-4" aria-hidden />
          Service recovery
        </div>
        <h1 className="mt-2 font-display text-display text-ink-50">Open an operations case</h1>
        <p className="mt-3 max-w-2xl text-body leading-relaxed text-ink-400">
          Capture the issue while the details are fresh. Apex assigns a response clock,
          keeps the history, and gives operations one accountable queue.
        </p>
      </header>

      <div className="flex items-start gap-3 rounded-control border border-watch/30 bg-watch/[0.06] p-4 text-detail leading-relaxed text-ink-300">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-watch" aria-hidden />
        This is not the clinical emergency or adverse-event channel. Use the clinical
        safety workflow when patient harm or urgent medical review may be involved.
      </div>

      {caseId && (
        <div className="rounded-panel border border-optimal/30 bg-optimal/[0.06] p-5">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-optimal" aria-hidden />
            <p className="font-medium text-ink-100">Case confirmed</p>
          </div>
          <p className="mt-2 text-detail text-ink-300">Tracking number: <span className="font-mono text-ink-100">{caseId}</span></p>
        </div>
      )}
      {error && <p className="rounded-control border border-high/30 bg-high/5 p-4 text-detail text-high">{error}</p>}

      <form onSubmit={submit} className="space-y-5 rounded-panel border border-ink-700 bg-ink-900/40 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-detail text-ink-300">
            Case type
            <Select className="mt-2" value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="support">Support</option>
              <option value="complaint">Complaint / service recovery</option>
            </Select>
          </label>
          <label className="text-detail text-ink-300">
            Priority
            <Select className="mt-2" value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option value="urgent">Urgent — operational response now</option>
              <option value="high">High — response within an hour</option>
              <option value="normal">Normal — response today</option>
              <option value="low">Low — routine request</option>
            </Select>
          </label>
        </div>
        <label className="block text-detail text-ink-300">
          Subject
          <Input className="mt-2" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} required />
        </label>
        <label className="block text-detail text-ink-300">
          What happened, what has already been tried, and what outcome is needed?
          <Textarea className="mt-2 min-h-36" value={detail} onChange={(event) => setDetail(event.target.value)} maxLength={5000} required />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-detail text-ink-300">
            Patient ID, if applicable
            <Input className="mt-2" value={clientId} onChange={(event) => setClientId(event.target.value)} />
          </label>
          <label className="text-detail text-ink-300">
            Clinic ID, if applicable
            <Input className="mt-2" value={locationId} onChange={(event) => setLocationId(event.target.value)} />
          </label>
        </div>
        <div className="flex items-center justify-between gap-4">
          <Badge>Durable · ledger witnessed</Badge>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Open case
          </Button>
        </div>
      </form>
    </div>
  );
}
