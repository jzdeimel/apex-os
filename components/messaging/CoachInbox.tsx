"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowUpRight, Inbox, Loader2, MessageSquare, Send, Stethoscope } from "lucide-react";
import { Badge, Button, EmptyState, Select, Textarea } from "@/components/ui/primitives";

type MessageRow = {
  id: string;
  clientId: string;
  senderKind: string;
  body: string;
  sentAt: string;
  readAt: string | null;
  escalationId: string | null;
};

type Thread = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  unreadCount: number;
  latest: MessageRow;
};

type Patient = { id: string; name: string; locationName: string | null };

function when(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(value));
}

async function payloadFor(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

export function CoachInbox() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [escalating, setEscalating] = useState<MessageRow | null>(null);
  const [question, setQuestion] = useState("");
  const [kind, setKind] = useState("Clinical question");
  const [priority, setPriority] = useState("Prompt");
  const [escalationNotice, setEscalationNotice] = useState<string | null>(null);

  async function loadInbox(preferredId?: string) {
    const response = await fetch("/api/coach/messages", { cache: "no-store" });
    const payload = await payloadFor(response);
    if (!response.ok) throw new Error(String(payload.error ?? "The inbox could not be loaded."));
    const next = (payload.threads ?? []) as Thread[];
    setThreads(next);
    const target = preferredId ?? selected ?? next[0]?.id ?? null;
    if (target && target !== selected) setSelected(target);
    return target;
  }

  async function loadThread(clientId: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/coach/messages?clientId=${encodeURIComponent(clientId)}`, { cache: "no-store" });
      const payload = await payloadFor(response);
      if (!response.ok) throw new Error(String(payload.error ?? "The thread could not be loaded."));
      setPatient(payload.patient as Patient);
      setMessages((payload.messages ?? []) as MessageRow[]);
      const marked = await fetch("/api/coach/messages", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      if (marked.ok) {
        setThreads((current) => current.map((thread) => thread.id === clientId ? { ...thread, unreadCount: 0 } : thread));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The thread could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInbox().catch((err) => {
      setError(err instanceof Error ? err.message : "The inbox could not be loaded.");
      setLoading(false);
    });
    // The initial fetch owns initial selection; subsequent selection is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selected) void loadThread(selected);
  }, [selected]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!selected || !draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/coach/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: selected, body: draft.trim(), requestId: crypto.randomUUID() }),
      });
      const payload = await payloadFor(response);
      if (!response.ok) throw new Error(String(payload.error ?? "The reply was not confirmed as sent."));
      const sent = payload.message as MessageRow;
      setMessages((current) => current.some((item) => item.id === sent.id) ? current : [...current, sent]);
      setDraft("");
      await loadInbox(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The reply was not confirmed as sent.");
    } finally {
      setBusy(false);
    }
  }

  async function pushToMedical(event: FormEvent) {
    event.preventDefault();
    if (!selected || !escalating || !question.trim() || busy) return;
    setBusy(true);
    setError(null);
    setEscalationNotice(null);
    try {
      const response = await fetch("/api/messages/escalate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: selected,
          messageId: escalating.id,
          memberQuote: escalating.body,
          question: question.trim(),
          kind,
          priority,
        }),
      });
      const payload = await payloadFor(response);
      if (!response.ok) throw new Error(String(payload.error ?? "The Medical handoff was not saved."));
      setEscalationNotice(`Sent to Medical. Due ${when(String(payload.dueAt))}.`);
      setEscalating(null);
      setQuestion("");
      await loadThread(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The Medical handoff was not saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-[36rem] overflow-hidden rounded-panel border border-ink-700 bg-ink-900/30 lg:grid-cols-[20rem_1fr]">
      <aside className="border-b border-ink-700 lg:border-b-0 lg:border-r" aria-label="Patient message threads">
        <div className="border-b border-ink-700 p-4">
          <p className="text-detail font-medium text-ink-200">Assigned patient threads</p>
          <p className="mt-1 text-micro text-ink-500">Newest activity first</p>
        </div>
        <div className="max-h-[42rem] overflow-y-auto">
          {threads.length ? threads.map((thread) => {
            const name = thread.preferredName || `${thread.firstName} ${thread.lastName}`.trim();
            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => setSelected(thread.id)}
                className={`w-full border-b border-ink-800 p-4 text-left transition-colors ${selected === thread.id ? "bg-blue-400/10" : "hover:bg-ink-800/60"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-ink-100">{name}</span>
                  {thread.unreadCount > 0 && <Badge tone="high">{thread.unreadCount} new</Badge>}
                </div>
                <p className="mt-2 truncate text-detail text-ink-400">{thread.latest.body}</p>
                <p className="mt-1 text-micro text-ink-600">{when(thread.latest.sentAt)}</p>
              </button>
            );
          }) : !loading && (
            <div className="p-5"><EmptyState icon={<Inbox className="h-6 w-6" />} title="No patient messages" hint="New secure messages will appear here." /></div>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-col" aria-label="Selected message thread">
        <header className="border-b border-ink-700 p-5">
          <h2 className="font-display text-heading text-ink-50">{patient?.name ?? "Coach inbox"}</h2>
          <p className="mt-1 text-detail text-ink-400">
            {patient ? `${patient.locationName ?? "Clinic assignment pending"} · You are this patient's main contact.` : "Select a thread."}
          </p>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5" aria-live="polite">
          {loading && <div className="flex items-center gap-2 text-detail text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading secure messages…</div>}
          {!loading && selected && messages.map((entry) => {
            const fromPatient = entry.senderKind === "member";
            return (
              <article key={entry.id} className={`max-w-[86%] rounded-control border p-4 ${fromPatient ? "border-ink-700 bg-ink-800/70" : "ml-auto border-blue-400/30 bg-blue-400/10"}`}>
                <p className="whitespace-pre-wrap text-body leading-relaxed text-ink-100">{entry.body}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-micro text-ink-500">{fromPatient ? patient?.name ?? "Patient" : "You"} · {when(entry.sentAt)}</p>
                  {fromPatient && (entry.escalationId ? (
                    <Badge tone="watch"><Stethoscope className="h-3 w-3" /> With Medical</Badge>
                  ) : (
                    <button type="button" className="inline-flex items-center gap-1 text-micro font-medium text-gold-300 hover:text-gold-200" onClick={() => { setEscalating(entry); setQuestion(""); }}>
                      Push to Medical <ArrowUpRight className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
          {!loading && selected && !messages.length && <EmptyState icon={<MessageSquare className="h-6 w-6" />} title="No messages in this thread" />}
        </div>

        {escalating && (
          <form className="border-t border-gold-400/30 bg-gold-400/5 p-5" onSubmit={pushToMedical}>
            <div className="flex items-center gap-2 text-detail font-medium text-gold-200"><Stethoscope className="h-4 w-4" /> Clinical handoff</div>
            <blockquote className="mt-3 border-l-2 border-gold-400/50 pl-3 text-detail italic text-ink-300">“{escalating.body}”</blockquote>
            <Textarea className="mt-3 min-h-20" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What do you need Medical to decide or answer?" maxLength={10_000} />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Escalation kind">
                <option>Clinical question</option><option>Dose change request</option><option>Side effect</option><option>Lab concern</option><option>Out of scope</option><option>Urgent symptom</option>
              </Select>
              <Select value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Escalation priority">
                <option>Prompt</option><option>Urgent</option><option>Routine</option>
              </Select>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEscalating(null)}>Cancel</Button>
              <Button type="submit" disabled={!question.trim() || busy}>{busy ? "Sending…" : "Create Medical task"}</Button>
            </div>
          </form>
        )}

        {selected && !escalating && (
          <form className="border-t border-ink-700 p-5" onSubmit={send}>
            <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} className="min-h-20" placeholder="Reply as the patient's coach…" maxLength={10_000} />
            <div className="mt-3 flex items-center justify-between gap-4">
              <p className="text-micro text-ink-500">Clinical uncertainty belongs in Medical’s queue, not in a guessed reply.</p>
              <Button type="submit" disabled={!draft.trim() || busy}><Send className="h-4 w-4" /> {busy ? "Sending…" : "Send reply"}</Button>
            </div>
          </form>
        )}
        {(error || escalationNotice) && (
          <div className={`border-t p-3 text-detail ${error ? "border-high/30 bg-high/5 text-high" : "border-teal-400/30 bg-teal-400/5 text-teal-300"}`} role={error ? "alert" : "status"}>
            {error ?? escalationNotice}
          </div>
        )}
      </section>
    </div>
  );
}

