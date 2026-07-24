"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, MessageSquare, Send } from "lucide-react";
import { Button, Textarea } from "@/components/ui/primitives";

type PatientMessage = {
  id: string;
  senderKind: string;
  body: string;
  sentAt: string;
  readAt?: string | null;
  escalationId?: string | null;
};

type ApiFailure = { ok?: false; error?: string; correlationId?: string };

function stamp(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone,
  }).format(new Date(value));
}

export function PatientCoachMessages({
  initialMessages,
  coachName,
  timezone,
}: {
  initialMessages: PatientMessage[];
  coachName: string | null;
  timezone: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function send(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || busy || !coachName) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/patient/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, requestId: crypto.randomUUID() }),
      });
      const payload = (await response.json()) as ApiFailure & {
        message?: PatientMessage & { sentAt: string | Date };
        urgentLanguageDetected?: boolean;
        urgentNotice?: string;
      };
      if (!response.ok || !payload.message) {
        throw new Error(payload.error ?? "The message was not confirmed as sent.");
      }
      const sent = { ...payload.message, sentAt: new Date(payload.message.sentAt).toISOString() };
      setMessages((current) => current.some((entry) => entry.id === sent.id) ? current : [...current, sent]);
      setDraft("");
      setNotice(
        payload.urgentLanguageDetected
          ? payload.urgentNotice ?? "For an emergency, call 911 instead of waiting for a reply."
          : `Sent securely to ${coachName}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "The message was not confirmed as sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="patient-coach-messages">
      <div className="flex items-center gap-3">
        <MessageSquare className="h-5 w-5 text-blue-300" aria-hidden />
        <div>
          <h2 id="patient-coach-messages" className="font-display text-title text-ink-50">Message your coach</h2>
          <p className="mt-1 text-detail text-ink-400">
            {coachName ? `${coachName} is your main Alpha Health contact.` : "Coach assignment pending."}
          </p>
        </div>
      </div>

      <div className="mt-5 max-h-[28rem] space-y-3 overflow-y-auto pr-1" aria-live="polite">
        {messages.length ? messages.map((entry) => {
          const mine = entry.senderKind === "member";
          return (
            <article
              key={entry.id}
              className={`max-w-[88%] rounded-control border p-4 ${mine
                ? "ml-auto border-blue-400/30 bg-blue-400/10"
                : "border-ink-700 bg-ink-900/60"}`}
            >
              <p className="whitespace-pre-wrap text-body leading-relaxed text-ink-100">{entry.body}</p>
              <p className="mt-2 text-micro text-ink-500">
                {mine ? "You" : coachName ?? "Coach"} · {stamp(entry.sentAt, timezone)}
                {mine && entry.readAt ? " · Read" : ""}
                {entry.escalationId ? " · Coach sent to Medical" : ""}
              </p>
            </article>
          );
        }) : <p className="text-body text-ink-400">No secure coach messages yet.</p>}
      </div>

      <form className="mt-5 border-t border-ink-700/70 pt-5" onSubmit={send}>
        <label htmlFor="patient-message" className="text-detail font-medium text-ink-200">Routine question or update</label>
        <Textarea
          id="patient-message"
          className="mt-2 min-h-28"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={10_000}
          placeholder={coachName ? `Write to ${coachName}…` : "Coach assignment required"}
          disabled={!coachName || busy}
        />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-micro text-ink-500">Patients cannot message Medical directly. Your coach can escalate clinical questions.</p>
          <Button type="submit" disabled={!coachName || !draft.trim() || busy} className="shrink-0">
            <Send className="h-4 w-4" aria-hidden />
            {busy ? "Sending…" : "Send securely"}
          </Button>
        </div>
        {notice && <p className="mt-3 text-detail text-teal-300" role="status">{notice}</p>}
        {error && <p className="mt-3 text-detail text-high" role="alert">{error}</p>}
      </form>

      <div className="mt-5 flex gap-3 rounded-control border border-high/30 bg-high/5 p-4 text-detail leading-relaxed text-ink-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-high" aria-hidden />
        <p>Messages are not monitored for emergencies. Call 911 or seek immediate care for urgent or life-threatening symptoms.</p>
      </div>
    </section>
  );
}

