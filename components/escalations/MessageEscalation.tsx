"use client";

import * as React from "react";
import { ArrowUpRight, Check, X } from "lucide-react";

import { useCurrentStaff } from "@/lib/auth/useCurrentStaff";
import type { EscalationPriority } from "@/lib/escalations/types";
import { Badge, Button, Textarea } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";

/**
 * The coach's handoff from a member message to Medical.
 *
 * The member never gets a second Medical thread. Their original words travel
 * with the escalation, Medical answers internally, and the coach remains the
 * person who closes the loop with the member.
 */
export function MessageEscalation({
  clientId,
  messageId,
  memberQuote,
}: {
  clientId: string;
  messageId: string;
  memberQuote: string;
}) {
  const staff = useCurrentStaff();
  const [open, setOpen] = React.useState(false);
  const [priority, setPriority] = React.useState<EscalationPriority>("Prompt");
  const [question, setQuestion] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dueAt, setDueAt] = React.useState<string | null>(null);

  if (staff?.role !== "Coach") return null;

  async function send() {
    if (!question.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/messages/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          kind: "Clinical question",
          priority,
          question: question.trim(),
          memberQuote,
          messageId,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) {
        setError(body.error || `Medical handoff failed (HTTP ${response.status}).`);
        return;
      }
      setDueAt(body.dueAt);
      setOpen(false);
    } catch {
      setError("The Medical handoff could not reach the server. Nothing was sent.");
    } finally {
      setSending(false);
    }
  }

  if (dueAt) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge tone="optimal">
          <Check className="h-3 w-3" /> Sent to Medical
        </Badge>
        <span className="text-micro text-ink-500">
          Answer due <span className="stat-mono">{formatDateTime(dueAt)}</span> · you relay it to the member
        </span>
      </div>
    );
  }

  return (
    <div className="mt-2">
      {!open ? (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <ArrowUpRight className="h-3.5 w-3.5" /> Ask Medical
        </Button>
      ) : (
        <div className="rounded-lg border border-gold-500/25 bg-gold-500/[0.05] p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-detail font-medium text-ink-100">Send this question up to Medical</p>
              <p className="mt-1 text-micro leading-relaxed text-ink-500">
                The member&apos;s exact message is attached. Medical&apos;s answer comes back here for you to communicate.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cancel Medical handoff"
              className="focus-ring rounded-control p-1 text-ink-500 hover:text-ink-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[9rem_1fr]">
            <label className="text-micro font-medium uppercase tracking-wide text-ink-500">
              SLA
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as EscalationPriority)}
                className="focus-ring mt-1 block w-full rounded-control border border-ink-700 bg-ink-950 px-2.5 py-2 text-detail normal-case tracking-normal text-ink-100"
              >
                <option value="Routine">Routine · 72h</option>
                <option value="Prompt">Prompt · 24h</option>
                <option value="Urgent">Urgent · 2h</option>
              </select>
            </label>
            <label className="text-micro font-medium uppercase tracking-wide text-ink-500">
              What do you need Medical to answer?
              <Textarea
                rows={3}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="State the clinical decision or guidance you need."
                className="mt-1 normal-case tracking-normal"
              />
            </label>
          </div>
          {error && <p className="mt-2 text-micro text-critical">{error}</p>}
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="primary" disabled={!question.trim() || sending} onClick={send}>
              <ArrowUpRight className="h-3.5 w-3.5" /> {sending ? "Sending…" : "Send to Medical"}
            </Button>
            <span className="text-micro text-ink-600">No direct Medical message is opened for the member.</span>
          </div>
        </div>
      )}
      {error && !open && <p className="mt-2 text-micro text-critical">{error}</p>}
    </div>
  );
}
