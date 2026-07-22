"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  CornerDownRight,
  Eye,
  Quote,
  Stethoscope,
} from "lucide-react";
import type { Escalation, EscalationPriority } from "@/lib/escalations/types";
import {
  dueAt,
  formatSla,
  isResolved,
  slaState,
} from "@/lib/escalations/queue";
import { getClient, clientName } from "@/lib/mock/clients";
import { staffMap, staffName } from "@/lib/mock/staff";
import { shortHash } from "@/lib/trace/hash";
import { Badge, Button, Textarea } from "@/components/ui/primitives";
import { Monogram } from "@/components/Monogram";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime, relativeDays } from "@/lib/utils";

/**
 * One escalation, as a provider reads it.
 *
 * The SLA clock is the hero and everything else is arranged around it. A
 * provider working this queue has one question — "what will hurt someone if I
 * leave it" — and the clock answers it before they have read a word of the
 * question text.
 *
 * Below the coach's question sits the member's exact quoted words. That pairing
 * is the whole traceability argument in one card: the provider is never acting
 * on a summary of a summary, and can see for themselves whether the coach's
 * framing matches what the member actually said.
 */

const PRIORITY_TONE: Record<EscalationPriority, "high" | "watch" | "neutral"> = {
  Urgent: "high",
  Prompt: "watch",
  Routine: "neutral",
};

const SLA_STYLE = {
  "on-track": { text: "text-optimal", ring: "border-optimal/30 bg-optimal/10", icon: Clock },
  "due-soon": { text: "text-watch", ring: "border-watch/40 bg-watch/10", icon: Clock },
  overdue: { text: "text-high", ring: "border-high/45 bg-high/12", icon: AlertTriangle },
} as const;

export function EscalationCard({
  escalation,
  now,
  onChange,
}: {
  escalation: Escalation;
  now: string;
  onChange: (next: Escalation) => void;
}) {
  const { toast } = useToast();
  const [drafting, setDrafting] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const client = getClient(escalation.clientId);
  if (!client) return null;

  const resolved = isResolved(escalation);
  const state = slaState(escalation, now);
  const style = SLA_STYLE[state];
  const ClockIcon = style.icon;

  async function transition(action: "acknowledge" | "start-review" | "answer", answer?: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/escalations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: escalation.id, action, answer }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) {
        setError(body.error || `The escalation update failed (HTTP ${response.status}).`);
        return false;
      }
      onChange(body.escalation);
      toast(`Escalation ${body.escalation.status.toLowerCase()}`, {
        desc: `Durable ledger ${body.ledger.id} · ${shortHash(body.ledger.hash)}`,
        tone: action === "answer" ? "success" : "info",
      });
      return true;
    } catch {
      setError("The escalation update could not reach the server. Nothing changed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const onAcknowledge = () => void transition("acknowledge");
  const onStartReview = () => void transition("start-review");

  const onAnswer = async () => {
    const text = draft.trim();
    if (!text) return;
    if (await transition("answer", text)) {
      setDrafting(false);
      setDraft("");
    }
  };

  return (
    <div
      className={[
        "card p-4",
        state === "overdue" && !resolved ? "border-high/35" : "",
      ].join(" ")}
    >
      {/* ── Who, and the clock ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start gap-3">
        <Monogram client={client} size="md" />

        {/* `basis-[calc(100%-4rem)]` is what forces the SLA clock onto its own
            row below ~640px. Without it the clock's shrink-0 ~200px plus the
            monogram left roughly 120px for this column on a 390px phone, so the
            member's name truncated to "Tony Callow..." and the raised-by line
            wrapped into a four-word-tall sliver. The clock deserves its width;
            the name should not pay for it. */}
        <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/clients/${client.id}`}
              className="truncate rounded text-body font-medium text-ink-50 hover:text-gold-300 focus-ring"
            >
              {clientName(client)}
            </Link>
            <Badge tone={PRIORITY_TONE[escalation.priority]}>
              {escalation.priority === "Urgent" && <AlertTriangle className="h-3 w-3" />}
              {escalation.priority}
            </Badge>
            <Badge tone="neutral">{escalation.kind}</Badge>
            {resolved && (
              <Badge tone="optimal">
                <CheckCircle2 className="h-3 w-3" />
                Answered
              </Badge>
            )}
            {!resolved && escalation.status !== "Open" && (
              <Badge tone="info">
                <Eye className="h-3 w-3" />
                {escalation.status}
              </Badge>
            )}
          </div>

          <p className="mt-1 text-micro text-ink-500">
            Raised by {staffName(escalation.raisedByStaffId)} ·{" "}
            <span className="stat-mono">{formatDateTime(escalation.raisedAt)}</span> ·{" "}
            <span className="stat-mono">{relativeDays(escalation.raisedAt)}</span>
          </p>
        </div>

        {/* THE CLOCK. Deliberately the largest, highest-contrast thing on the
            card — a provider scanning at arm's length should be able to work
            this queue top-down without reading any prose. */}
        <div
          className={[
            // Full width on a phone (it has wrapped onto its own row by then, so
            // stretching reads as deliberate rather than orphaned), natural
            // width once there is room beside the name.
            "flex w-full shrink-0 items-center gap-2 rounded-xl border px-3 py-2 sm:w-auto",
            style.ring,
          ].join(" ")}
        >
          <ClockIcon className={["h-4 w-4", style.text].join(" ")} />
          <div className="leading-tight">
            <p className={["stat-mono text-body font-semibold", style.text].join(" ")}>
              {formatSla(escalation, now)}
            </p>
            <p className="text-micro text-ink-500">
              {resolved ? (
                <>by {staffName(escalation.answeredByStaffId)}</>
              ) : (
                <>due <span className="stat-mono">{formatDateTime(dueAt(escalation))}</span></>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* ── The coach's question ──────────────────────────────────────────── */}
      <p className="mt-3 text-body leading-relaxed text-ink-200">{escalation.question}</p>

      {/* ── The source it came from ───────────────────────────────────────── */}
      <figure className="mt-3 rounded-lg border-l-2 border-gold-400/50 bg-ink-900/50 px-3 py-2">
        <div className="flex items-start gap-2">
          <Quote className="mt-0.5 h-3 w-3 shrink-0 text-gold-400/70" />
          <blockquote className="min-w-0 text-detail italic leading-relaxed text-ink-300">
            &ldquo;{escalation.sourceQuote}&rdquo;
          </blockquote>
        </div>
        <figcaption className="mt-1.5 pl-5 text-micro text-ink-500">
          Member&rsquo;s own words, preserved with the audited Medical handoff
          {escalation.sourceConsultId ? (
            <> from consult <span className="stat-mono">{escalation.sourceConsultId}</span></>
          ) : null}
        </figcaption>
      </figure>

      {/* ── The answer, once there is one ─────────────────────────────────── */}
      {resolved && escalation.answer && (
        <div className="mt-3 rounded-lg border border-optimal/25 bg-optimal/[0.06] p-3">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-3.5 w-3.5 text-optimal" />
            <p className="text-micro font-medium text-optimal">
              {staffName(escalation.answeredByStaffId)}
              {staffMap[escalation.answeredByStaffId ?? ""]?.credentials
                ? `, ${staffMap[escalation.answeredByStaffId ?? ""].credentials}`
                : ""}
            </p>
            <span className="stat-mono text-micro text-ink-500">
              {formatDateTime(escalation.answeredAt)}
            </span>
          </div>
          <p className="mt-1.5 text-body leading-relaxed text-ink-200">{escalation.answer}</p>
        </div>
      )}

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      {!resolved && (
        <div className="mt-3.5">
          {drafting ? (
            <div className="space-y-2">
              <Textarea
                autoFocus
                rows={4}
                value={draft}
                onChange={(ev) => setDraft(ev.target.value)}
                placeholder={`Answer ${client.firstName}'s question. This goes back to ${staffName(escalation.raisedByStaffId)} and onto the record.`}
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="primary" onClick={onAnswer} disabled={!draft.trim() || busy}>
                  <Check className="h-3.5 w-3.5" />
                  Send answer
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDrafting(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {escalation.status === "Open" && (
                <Button size="sm" variant="outline" onClick={onAcknowledge} disabled={busy}>
                  <Eye className="h-3.5 w-3.5" />
                  Acknowledge
                </Button>
              )}
              {escalation.status === "Acknowledged" && (
                <Button size="sm" variant="outline" onClick={onStartReview} disabled={busy}>
                  <CornerDownRight className="h-3.5 w-3.5" />
                  Start review
                </Button>
              )}
              <Button
                size="sm"
                variant={escalation.status === "In review" ? "primary" : "secondary"}
                onClick={() => setDrafting(true)}
                disabled={busy}
              >
                <Stethoscope className="h-3.5 w-3.5" />
                Answer
              </Button>
              <span className="text-micro text-ink-500">
                Assigned to {staffName(escalation.assignedToStaffId)}
              </span>
            </div>
          )}
          {error && <p className="mt-2 text-micro text-critical">{error}</p>}
        </div>
      )}
    </div>
  );
}
