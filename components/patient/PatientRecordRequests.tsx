"use client";

import { useCallback, useEffect, useState } from "react";
import { FileClock, Loader2, Plus, ShieldCheck } from "lucide-react";

import { Badge, Button, Input, Select, Textarea } from "@/components/ui/primitives";

interface RecordCase {
  id: string;
  kind: "record-access" | "record-release" | "record-amendment";
  status: string;
  subject: string;
  recordScope: string | null;
  identityVerificationStatus: string;
  dueAt: string;
  createdAt: string;
  resolution: string | null;
  denialReason: string | null;
}

const KIND_LABELS = {
  "record-access": "Access my record",
  "record-release": "Send records elsewhere",
  "record-amendment": "Request a correction",
} as const;

export function PatientRecordRequests() {
  const [cases, setCases] = useState<RecordCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<RecordCase["kind"]>("record-access");
  const [subject, setSubject] = useState("Request for my health records");
  const [recordScope, setRecordScope] = useState("My complete designated record set");
  const [detail, setDetail] = useState("Please provide the records described above.");
  const [requestedFormat, setRequestedFormat] = useState("electronic");
  const [recipient, setRecipient] = useState("self");
  const [amendmentRecordReference, setAmendmentRecordReference] = useState("");
  const [amendmentRequestedText, setAmendmentRequestedText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/patient/record-requests", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load requests.");
      setCases(payload.cases);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/patient/record-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          subject,
          detail,
          recordScope,
          requestedFormat,
          recipient,
          amendmentRecordReference: kind === "record-amendment" ? amendmentRecordReference : undefined,
          amendmentRequestedText: kind === "record-amendment" ? amendmentRequestedText : undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The request was not confirmed.");
      setOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The request was not confirmed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <FileClock className="h-5 w-5 text-teal-300" aria-hidden />
            <h1 className="font-display text-display text-ink-50">Record requests</h1>
          </div>
          <p className="mt-3 max-w-2xl text-body leading-relaxed text-ink-400">
            Ask to access, send, or amend your record. Every request receives a tracking
            number, accountable owner, deadline, and audit history.
          </p>
        </div>
        <Button onClick={() => setOpen((value) => !value)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          New request
        </Button>
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-control border border-teal-400/25 bg-teal-400/[0.06] p-4 text-detail leading-relaxed text-ink-300">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" aria-hidden />
        Opening a request does not automatically release information. Alpha verifies identity
        and the destination before fulfillment.
      </div>

      {open && (
        <form onSubmit={submit} className="mt-6 space-y-4 rounded-panel border border-ink-700 bg-ink-900/45 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-detail text-ink-300">
              Request type
              <Select className="mt-2" value={kind} onChange={(event) => setKind(event.target.value as RecordCase["kind"])}>
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </label>
            <label className="text-detail text-ink-300">
              Subject
              <Input className="mt-2" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} required />
            </label>
          </div>
          <label className="block text-detail text-ink-300">
            Which records?
            <Input className="mt-2" value={recordScope} onChange={(event) => setRecordScope(event.target.value)} required />
          </label>
          <label className="block text-detail text-ink-300">
            Details
            <Textarea className="mt-2 min-h-24" value={detail} onChange={(event) => setDetail(event.target.value)} required />
          </label>
          {kind !== "record-amendment" && (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-detail text-ink-300">
                Format
                <Select className="mt-2" value={requestedFormat} onChange={(event) => setRequestedFormat(event.target.value)}>
                  <option value="electronic">Electronic copy</option>
                  <option value="paper">Paper copy</option>
                </Select>
              </label>
              <label className="text-detail text-ink-300">
                Recipient
                <Input className="mt-2" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Self or verified recipient" />
              </label>
            </div>
          )}
          {kind === "record-amendment" && (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-detail text-ink-300">
                Record, date, or entry
                <Input className="mt-2" value={amendmentRecordReference} onChange={(event) => setAmendmentRecordReference(event.target.value)} required />
              </label>
              <label className="text-detail text-ink-300">
                Requested correction
                <Textarea className="mt-2" value={amendmentRequestedText} onChange={(event) => setAmendmentRequestedText(event.target.value)} required />
              </label>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Submit request
            </Button>
          </div>
        </form>
      )}

      {error && <p className="mt-5 rounded-control border border-high/30 bg-high/5 p-4 text-detail text-high">{error}</p>}
      {loading ? (
        <div className="mt-8 flex items-center gap-2 text-detail text-ink-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading requests…
        </div>
      ) : cases.length ? (
        <ol className="mt-8 space-y-4">
          {cases.map((item) => (
            <li key={item.id} className="rounded-panel border border-ink-700 bg-ink-900/40 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink-100">{item.subject}</p>
                  <p className="mt-1 text-detail text-ink-400">{KIND_LABELS[item.kind]} · {item.id}</p>
                </div>
                <Badge>{item.status.replaceAll("-", " ")}</Badge>
              </div>
              <div className="mt-4 grid gap-3 text-detail text-ink-400 sm:grid-cols-3">
                <p>Opened <span className="text-ink-200">{new Date(item.createdAt).toLocaleDateString()}</span></p>
                <p>Action due <span className="text-ink-200">{new Date(item.dueAt).toLocaleDateString()}</span></p>
                <p>Identity <span className="text-ink-200">{item.identityVerificationStatus}</span></p>
              </div>
              {item.resolution && <p className="mt-4 text-detail text-ink-300">Resolution: {item.resolution}</p>}
              {item.denialReason && <p className="mt-4 text-detail text-high">Denial: {item.denialReason}</p>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-8 text-body text-ink-400">You have no record requests yet.</p>
      )}
    </section>
  );
}
