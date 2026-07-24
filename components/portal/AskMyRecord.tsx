"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Lock,
  Send,
  FlaskConical,
  ClipboardList,
  MessageSquare,
  Package,
  FileText,
  ArrowUpRight,
  UserRound,
} from "lucide-react";
import {
  answer,
  SUGGESTED_QUESTIONS,
  SCOPE_NOTICE,
  type Citation,
  type CitationKind,
  type RecordAnswer,
} from "@/lib/assistant/myRecord";
import { getClient } from "@/lib/mock/clients";
import { sendMessage } from "@/lib/comms/send";
import { appendLedger } from "@/lib/trace/ledger";
import { Card, CardContent, Button, Input, Badge } from "@/components/ui/primitives";
import { SwitchView, FadeIn } from "@/components/portal/still";
import { useToast } from "@/components/ui/Toast";
import { formatDate, cn } from "@/lib/utils";

/**
 * Ask your own record.
 *
 * The design problem here is not the answer, it is the refusal. A member asks
 * "is it safe to drink on this?" and gets told no — that moment either reads as
 * *the tool is broken* or as *this is a real clinic and a real person is about
 * to answer me*. Which one it reads as is entirely a matter of how it is
 * rendered.
 *
 * So refusals here are not errors. No red, no warning triangle, no "I'm sorry,
 * I can't". They render as a warm handoff card naming the actual human on this
 * member's care team, with one button that sends the question to them. The
 * member's next action after a refusal is the same as their next action after a
 * good answer: forward motion.
 *
 * The scope line under the box is permanent and quiet. It is stated once, always
 * visible, never as a modal or an interruption — because it is not a warning,
 * it is the product's honest description of itself.
 */

const CITATION_ICON: Record<CitationKind, typeof FlaskConical> = {
  lab: FlaskConical,
  consult: MessageSquare,
  plan: ClipboardList,
  order: Package,
  document: FileText,
};

function CitationChip({ citation }: { citation: Citation }) {
  const Icon = CITATION_ICON[citation.kind];

  const inner = (
    <>
      <Icon className="h-3.5 w-3.5 shrink-0 text-gold-300" aria-hidden />
      <span className="truncate">{citation.label}</span>
      <span className="stat-mono shrink-0 text-ink-500">{formatDate(citation.at)}</span>
      {citation.href && <ArrowUpRight className="h-3 w-3 shrink-0 text-ink-500" aria-hidden />}
    </>
  );

  const shell =
    "inline-flex max-w-full items-center gap-1.5 rounded-control border border-ink-700 bg-ink-900/60 px-2.5 py-1 text-micro text-ink-300";

  // Every chip points into the member's own portal. There is deliberately no
  // path here that can produce a staff route.
  return citation.href ? (
    <Link href={citation.href} className={cn(shell, "focus-ring hover:border-gold-400/40 hover:text-ink-100")}>
      {inner}
    </Link>
  ) : (
    <span className={shell}>{inner}</span>
  );
}

function AnswerBlock({ result }: { result: RecordAnswer }) {
  const quoted = result.citations.filter((c) => c.quote);

  return (
    <div className="space-y-3">
      <p className="text-body leading-relaxed text-ink-100">{result.answer}</p>

      {quoted.length > 0 && (
        <blockquote className="border-l-2 border-gold-400/40 pl-3 text-detail italic leading-relaxed text-ink-300">
          &ldquo;{quoted[0].quote}&rdquo;
        </blockquote>
      )}

      {result.citations.length > 0 && (
        <div>
          <p className="label-eyebrow">From your record</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {result.citations.map((c, i) => (
              <CitationChip key={`${c.kind}-${c.label}-${i}`} citation={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Handoff({
  result,
  onSend,
  sent,
  sending,
}: {
  result: RecordAnswer;
  onSend: () => void;
  sent: boolean;
  sending: boolean;
}) {
  const refusal = result.refused!;

  return (
    // Gold, not red. This is a routing decision, not a failure.
    <div className="rounded-panel border border-gold-400/25 bg-gold-400/[0.05] p-4">
      <div className="flex gap-3">
        <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-body leading-relaxed text-ink-100">{refusal.reason}</p>

          <p className="mt-3 text-detail text-ink-300">
            {refusal.handoffTo === "provider" ? "Your provider" : "Your coach"},{" "}
            <span className="font-medium text-ink-100">{refusal.handoffName}</span>, can answer this
            properly.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" onClick={onSend} disabled={sent || sending}>
              <Send className="h-3.5 w-3.5" />
              {sending
                ? "Sending..."
                : sent
                  ? "Sent to your care team"
                  : `Send this to ${refusal.handoffName}`}
            </Button>
            {sent && <Badge tone="optimal">You&rsquo;ll get a reply in your messages</Badge>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AskMyRecord({ clientId }: { clientId: string }) {
  const [draft, setDraft] = useState("");
  const [result, setResult] = useState<RecordAnswer | null>(null);
  const [checking, setChecking] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  const client = getClient(clientId);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  if (!client) return null;

  const ask = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed) return;
    setDraft(trimmed);
    setSent(false);
    setResult(null);
    setChecking(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setResult(answer(clientId, trimmed));
      setChecking(false);
      timerRef.current = null;
    }, 420);
  };

  /**
   * Actually send it.
   *
   * This button only appears when the answer engine REFUSED — i.e. on the
   * clinically sensitive questions, the ones that most need a human. It used to
   * be `setSent(true)` plus a toast reading "Sent to your care team… They'll
   * reply in your messages", and nothing was sent to anybody. A member asked
   * the question they were most worried about, was told a clinician had it, and
   * no clinician ever did.
   *
   * It now goes through the same guarded `sendMessage` path the messages page
   * uses — consent-checked, idempotent, ledger-witnessed — and reports failure
   * instead of asserting success.
   */
  const handoff = async () => {
    if (sending) return;
    setSending(true);
    const question = draft.trim();
    const recipientId = client?.providerId ?? client?.coachId ?? "unknown";
    try {
      const result = await sendMessage({
        clientId,
        staffId: recipientId,
        channel: "Portal message",
        scope: "clinical",
        body: question,
        to: client?.email,
        idempotencyKey: `ask-${clientId}-${question.length}-${question.slice(0, 32)}`,
      });
      if (!result.ok) {
        toast("Not sent", { tone: "warn", desc: result.message });
        return;
      }
      appendLedger(result.ledgerEvent);
      setSent(true);
      toast("Sent to your care team", { desc: "They'll reply in your messages." });
    } catch {
      toast("Not sent", {
        tone: "warn",
        desc: "We couldn't reach the server. Your question was not sent.",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" aria-hidden />
          <div className="min-w-0">
            <h3 className="font-display text-body font-semibold text-ink-50">Ask your record</h3>
            <p className="mt-1 text-detail leading-relaxed text-ink-400">
              Your labs, your plan, your orders, your visits. Answers come with a link to the exact
              thing they came from.
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Ask about your record, ${client.firstName}…`}
            aria-label="Ask a question about your record"
            className="sm:flex-1"
          />
          <Button type="submit" variant="primary" disabled={!draft.trim() || checking} className="sm:w-auto">
            <Send className="h-3.5 w-3.5" />
            {checking ? "Checking" : "Ask"}
          </Button>
        </form>

        <div>
          <p className="label-eyebrow">Try one of these</p>
          {/* Explicit base grid-cols-1: a bare `sm:grid-cols-2` sizes the
              implicit column to content and overflows a 390px screen. */}
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SUGGESTED_QUESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={checking}
                onClick={() => ask(s)}
                className="focus-ring rounded-control border border-ink-700 bg-ink-900/40 px-3 py-2 text-left text-micro text-ink-300 transition-colors hover:border-gold-400/40 hover:text-ink-100 disabled:pointer-events-none disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {checking && (
          <SwitchView k={`checking-${draft}`}>
            <FadeIn>
              <div className="flex items-start gap-3 border-t border-ink-700/70 pt-4">
                <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-400 opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-gold-300" />
                </span>
                <div>
                  <p className="text-detail font-medium text-ink-200">
                    Reading your labs, orders and notes.
                  </p>
                  <p className="mt-1 text-micro leading-relaxed text-ink-500">
                    Apex only answers from your own record, and hands clinical judgement to your care team.
                  </p>
                </div>
              </div>
            </FadeIn>
          </SwitchView>
        )}

        {result && (
          <SwitchView k={result.question}>
            <FadeIn>
              <div className="space-y-3 border-t border-ink-700/70 pt-4">
                <p className="text-detail font-medium text-ink-200">
                  <span className="text-ink-500">You asked:</span> {result.question}
                </p>
                {result.refused ? (
                  <Handoff result={result} onSend={handoff} sent={sent} sending={sending} />
                ) : (
                  <AnswerBlock result={result} />
                )}
              </div>
            </FadeIn>
          </SwitchView>
        )}

        {/* Permanent, quiet, never dismissible. */}
        <p className="flex items-start gap-2 border-t border-ink-700/70 pt-4 text-micro leading-relaxed text-ink-500">
          <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>{SCOPE_NOTICE}</span>
        </p>
      </CardContent>
    </Card>
  );
}

export default AskMyRecord;
