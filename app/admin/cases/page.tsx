"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  FileClock,
  LifeBuoy,
  Loader2,
  Plus,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";

interface CaseEvent {
  id: string;
  action: string;
  note: string | null;
  actorName: string;
  at: string;
}

interface OperationalCase {
  id: string;
  kind: string;
  status: string;
  priority: "urgent" | "high" | "normal" | "low";
  subject: string;
  detail: string;
  clientId: string | null;
  requestedByName: string;
  ownerStaffId: string | null;
  ownerName: string | null;
  firstResponseDueAt: string;
  firstRespondedAt: string | null;
  dueAt: string;
  identityVerificationStatus: string;
  recordScope: string | null;
  requestedFormat: string | null;
  recipient: string | null;
  amendmentRecordReference: string | null;
  amendmentRequestedText: string | null;
  resolution: string | null;
  denialReason: string | null;
  createdAt: string;
  events: CaseEvent[];
}

interface Candidate {
  id: string;
  name: string;
}

const KINDS = [
  ["support", "Support"],
  ["complaint", "Complaint / service recovery"],
  ["record-access", "Record access"],
  ["record-release", "Record release"],
  ["record-amendment", "Record amendment"],
] as const;

const STATUSES = [
  "assigned",
  "in-progress",
  "waiting-on-patient",
  "fulfilled",
  "denied",
  "closed",
] as const;

function tone(priority: OperationalCase["priority"]) {
  if (priority === "urgent") return "high" as const;
  if (priority === "high") return "watch" as const;
  if (priority === "normal") return "low" as const;
  return "neutral" as const;
}

function dateTime(value: string) {
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export default function OperationalCasesPage() {
  const [cases, setCases] = useState<OperationalCase[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [includeClosed, setIncludeClosed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [nextStatus, setNextStatus] = useState("in-progress");
  const [ownerStaffId, setOwnerStaffId] = useState("");
  const [resolution, setResolution] = useState("");
  const [denialReason, setDenialReason] = useState("");
  const [newKind, setNewKind] = useState("support");
  const [newPriority, setNewPriority] = useState("normal");
  const [newSubject, setNewSubject] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [newClientId, setNewClientId] = useState("");
  const [newRecordScope, setNewRecordScope] = useState("");

  const selected = useMemo(
    () => cases.find((item) => item.id === selectedId) ?? cases[0] ?? null,
    [cases, selectedId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/operations/cases?closed=${includeClosed}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load cases.");
      setCases(payload.cases);
      setCandidates(payload.candidates);
      setSelectedId((current) => current && payload.cases.some((item: OperationalCase) => item.id === current) ? current : payload.cases[0]?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load cases.");
    } finally {
      setLoading(false);
    }
  }, [includeClosed]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    setOwnerStaffId(selected.ownerStaffId ?? "");
    setResolution(selected.resolution ?? "");
    setDenialReason(selected.denialReason ?? "");
    setNextStatus(selected.status === "new" ? "assigned" : "in-progress");
    setNote("");
  }, [selected]);

  async function workCase(extra: Record<string, unknown> = {}) {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/operations/cases", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          ownerStaffId: ownerStaffId || undefined,
          status: nextStatus || undefined,
          note,
          resolution,
          denialReason,
          ...extra,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The case action was not confirmed.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The case action was not confirmed.");
    } finally {
      setSaving(false);
    }
  }

  async function createCase(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/operations/cases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: newKind,
          priority: newPriority,
          subject: newSubject,
          detail: newDetail,
          clientId: newClientId || undefined,
          recordScope: newKind.startsWith("record-") ? newRecordScope : undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The case was not confirmed.");
      setCreating(false);
      setNewSubject("");
      setNewDetail("");
      setNewClientId("");
      setNewRecordScope("");
      await load();
      setSelectedId(payload.case.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The case was not confirmed.");
    } finally {
      setSaving(false);
    }
  }

  const now = Date.now();
  const overdue = cases.filter((item) => new Date(item.dueAt).getTime() < now && !["fulfilled", "denied", "closed"].includes(item.status)).length;
  const unowned = cases.filter((item) => !item.ownerStaffId).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-detail text-teal-300">
            <LifeBuoy className="h-4 w-4" aria-hidden />
            Authoritative operations queue
          </div>
          <h1 className="mt-2 font-display text-display text-ink-50">Support, recovery & records</h1>
          <p className="mt-2 max-w-3xl text-body leading-relaxed text-ink-400">
            One owner, one clock, and an immutable timeline from intake through resolution.
            A record request is never treated as permission to disclose PHI.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCcw className="h-4 w-4" aria-hidden /> Refresh
          </Button>
          <Button onClick={() => setCreating((value) => !value)}>
            <Plus className="h-4 w-4" aria-hidden /> New case
          </Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-5"><p className="text-detail text-ink-400">Open queue</p><p className="mt-2 font-display text-display text-ink-50">{cases.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-detail text-ink-400">Unowned</p><p className="mt-2 font-display text-display text-watch">{unowned}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-detail text-ink-400">Past action deadline</p><p className="mt-2 font-display text-display text-high">{overdue}</p></CardContent></Card>
      </div>

      <label className="flex items-center gap-2 text-detail text-ink-400">
        <input type="checkbox" checked={includeClosed} onChange={(event) => setIncludeClosed(event.target.checked)} />
        Include fulfilled, denied, and closed cases
      </label>

      {creating && (
        <form onSubmit={createCase} className="space-y-4 rounded-panel border border-gold-400/30 bg-gold-400/[0.04] p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-detail text-ink-300">Kind<Select className="mt-2" value={newKind} onChange={(event) => setNewKind(event.target.value)}>{KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
            <label className="text-detail text-ink-300">Priority<Select className="mt-2" value={newPriority} onChange={(event) => setNewPriority(event.target.value)}><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></Select></label>
            <label className="text-detail text-ink-300">Patient ID, if known<Input className="mt-2" value={newClientId} onChange={(event) => setNewClientId(event.target.value)} /></label>
          </div>
          <label className="block text-detail text-ink-300">Subject<Input className="mt-2" value={newSubject} onChange={(event) => setNewSubject(event.target.value)} required /></label>
          <label className="block text-detail text-ink-300">Details<Textarea className="mt-2 min-h-24" value={newDetail} onChange={(event) => setNewDetail(event.target.value)} required /></label>
          {newKind.startsWith("record-") && <label className="block text-detail text-ink-300">Record scope<Input className="mt-2" value={newRecordScope} onChange={(event) => setNewRecordScope(event.target.value)} required /></label>}
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit" disabled={saving}>Create durable case</Button></div>
        </form>
      )}

      {error && <p className="rounded-control border border-high/30 bg-high/5 p-4 text-detail text-high">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading queue…</div>
      ) : cases.length === 0 ? (
        <div className="rounded-panel border border-dashed border-ink-700 p-12 text-center text-ink-400">No cases match this queue.</div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(340px,0.9fr)_minmax(520px,1.4fr)]">
          <ol className="space-y-3">
            {cases.map((item) => {
              const late = new Date(item.dueAt).getTime() < now && !["fulfilled", "denied", "closed"].includes(item.status);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`w-full rounded-panel border p-4 text-left transition ${selected?.id === item.id ? "border-gold-400/55 bg-gold-400/[0.06]" : "border-ink-700 bg-ink-900/35 hover:border-ink-600"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-ink-100">{item.subject}</p>
                      <Badge tone={tone(item.priority)}>{item.priority}</Badge>
                    </div>
                    <p className="mt-2 text-detail text-ink-400">{item.kind.replaceAll("-", " ")} · {item.status.replaceAll("-", " ")}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-micro text-ink-500">
                      <span>{item.ownerName ?? "Unowned"}</span>
                      <span className={late ? "text-high" : ""}>Due {dateTime(item.dueAt)}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>

          {selected && (
            <article className="rounded-panel border border-ink-700 bg-ink-900/35 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-micro uppercase tracking-wide text-ink-500">{selected.id}</p>
                  <h2 className="mt-2 font-display text-heading text-ink-50">{selected.subject}</h2>
                  <p className="mt-2 text-detail text-ink-400">Requested by {selected.requestedByName} · {dateTime(selected.createdAt)}</p>
                </div>
                <Badge>{selected.status.replaceAll("-", " ")}</Badge>
              </div>
              <p className="mt-5 whitespace-pre-wrap text-body leading-relaxed text-ink-300">{selected.detail}</p>

              <div className="mt-5 grid gap-3 rounded-control border border-ink-800 bg-ink-950/40 p-4 text-detail sm:grid-cols-2">
                <p><Clock3 className="mr-2 inline h-4 w-4 text-watch" />First response: {selected.firstRespondedAt ? dateTime(selected.firstRespondedAt) : `due ${dateTime(selected.firstResponseDueAt)}`}</p>
                <p><FileClock className="mr-2 inline h-4 w-4 text-teal-300" />Action due: {dateTime(selected.dueAt)}</p>
                {selected.recordScope && <p className="sm:col-span-2">Record scope: <span className="text-ink-200">{selected.recordScope}</span></p>}
                {selected.amendmentRecordReference && <p className="sm:col-span-2">Amend: <span className="text-ink-200">{selected.amendmentRecordReference} — {selected.amendmentRequestedText}</span></p>}
              </div>

              <div className="mt-6 space-y-4 border-t border-ink-800 pt-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-detail text-ink-300">Owner<Select className="mt-2" value={ownerStaffId} onChange={(event) => setOwnerStaffId(event.target.value)}><option value="">Claim as me</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</Select></label>
                  <label className="text-detail text-ink-300">Next state<Select className="mt-2" value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>{STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll("-", " ")}</option>)}</Select></label>
                </div>
                <label className="block text-detail text-ink-300">Case note<Textarea className="mt-2 min-h-20" value={note} onChange={(event) => setNote(event.target.value)} placeholder="What happened, what is next, and who was informed?" /></label>
                {(nextStatus === "fulfilled" || nextStatus === "closed") && <label className="block text-detail text-ink-300">Resolution<Textarea className="mt-2" value={resolution} onChange={(event) => setResolution(event.target.value)} /></label>}
                {nextStatus === "denied" && <label className="block text-detail text-ink-300">Denial reason<Textarea className="mt-2" value={denialReason} onChange={(event) => setDenialReason(event.target.value)} /></label>}
                <div className="flex flex-wrap justify-between gap-3">
                  {selected.kind.startsWith("record-") && selected.identityVerificationStatus !== "verified" ? (
                    <Button type="button" variant="outline" disabled={saving} onClick={() => void workCase({ status: undefined, identityVerificationStatus: "verified", note: note || "Identity verified before records fulfillment." })}>
                      <ShieldCheck className="h-4 w-4" /> Verify identity
                    </Button>
                  ) : <span />}
                  <Button type="button" disabled={saving} onClick={() => void workCase()}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Save case action
                  </Button>
                </div>
              </div>

              <section className="mt-7 border-t border-ink-800 pt-5">
                <h3 className="font-display text-body text-ink-100">Immutable timeline</h3>
                <ol className="mt-4 space-y-3">
                  {selected.events.map((event) => (
                    <li key={event.id} className="border-l border-ink-700 pl-4 text-detail">
                      <p className="text-ink-200">{event.action.replaceAll("-", " ")} · {event.actorName}</p>
                      <p className="mt-1 text-micro text-ink-500">{dateTime(event.at)}</p>
                      {event.note && <p className="mt-2 whitespace-pre-wrap text-ink-400">{event.note}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            </article>
          )}
        </div>
      )}
    </div>
  );
}
