"use client";

import * as React from "react";
import { Search, Send, CornerDownLeft, ShieldCheck, ShieldAlert, Pencil, AlertTriangle } from "lucide-react";
import { Badge, Button, Input, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { getClient, clientName } from "@/lib/mock/clients";
import { staffMap } from "@/lib/mock/staff";
import { appendLedger } from "@/lib/trace/ledger";
import { previewSend, sendMessage } from "@/lib/comms/send";
import { SCOPE_LABEL } from "@/lib/comms/consent";
import {
  TEMPLATES_ARE_DRAFTS,
  renderTemplate,
  suggestTemplates,
  type MessageTemplate,
  type TemplateId,
} from "@/lib/staff/templates";
import { cn } from "@/lib/utils";
import type { ConsentScope } from "@/lib/comms/types";

/**
 * QUICK REPLY — pick a template, see it resolved against this member, edit, send.
 *
 * ── The three seconds this component is fighting for ──────────────────────
 * A coach with forty replies to write does not want a modal, a wizard, or a
 * mouse. So: type to filter, arrows to move, Enter to load, edit in place,
 * Cmd/Ctrl+Enter to send. The mouse works too, but nothing here requires it.
 *
 * ── Why the draft is editable and pre-focused ─────────────────────────────
 * Because a template is a starting point (lib/staff/templates.ts). The textarea
 * is the primary surface, not a preview pane — the coach is expected to change
 * it, and the "edited" state is shown as approval rather than as a warning.
 * An untouched draft still sends: sometimes the boilerplate really is right,
 * and nagging about it is how coaches learn to ignore the whole bar.
 *
 * ── Why consent is visible before the send button ─────────────────────────
 * The scope chip and the guard verdict sit ABOVE the button, in the coach's
 * eyeline, resolved for this specific member. `previewSend` runs the same
 * predicates the send path runs, so the button never promises something the
 * guard will refuse a keystroke later.
 */

const SCOPE_TONE: Record<ConsentScope, "optimal" | "info" | "watch"> = {
  clinical: "optimal",
  operational: "info",
  // Marketing is the TCPA one. It gets the colour that makes a coach look twice.
  marketing: "watch",
};

export interface QuickReplyProps {
  clientId: string;
  /** Sending staff member. Defaults to the member's own coach. */
  staffId?: string;
  defaultTemplateId?: TemplateId;
  /** Fired after a successful send, with the text that actually went out. */
  onSent?: (info: { templateId: TemplateId; body: string; deliveryId?: string }) => void;
  className?: string;
}

export function QuickReply({
  clientId,
  staffId,
  defaultTemplateId,
  onSent,
  className,
}: QuickReplyProps) {
  const { toast } = useToast();
  const client = getClient(clientId);

  const searchRef = React.useRef<HTMLInputElement>(null);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);

  const [query, setQuery] = React.useState("");
  const [cursor, setCursor] = React.useState(0);
  const [activeId, setActiveId] = React.useState<TemplateId | undefined>(defaultTemplateId);
  const [body, setBody] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const actorId = staffId ?? client?.coachId ?? "st-005";
  const actor = staffMap[actorId];

  const ranked = React.useMemo(
    () => (client ? suggestTemplates(client.id) : []),
    [client],
  );

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ranked;
    return ranked.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.situation.toLowerCase().includes(q) ||
        t.scope.includes(q),
    );
  }, [ranked, query]);

  const rendered = React.useMemo(
    () => (activeId && client ? renderTemplate(activeId, client.id) : undefined),
    [activeId, client],
  );

  // Loading a template replaces the draft. Deliberate: a coach who picks a
  // second template wants the second template, and silently merging two
  // drafts produces text nobody wrote.
  const load = React.useCallback(
    (template: MessageTemplate) => {
      if (!client) return;
      const r = renderTemplate(template.id, client.id);
      setActiveId(template.id);
      setBody(r?.text ?? "");
      // Focus lands in the body, because editing is the expected next act.
      window.requestAnimationFrame(() => bodyRef.current?.focus());
    },
    [client],
  );

  React.useEffect(() => {
    if (defaultTemplateId && client) {
      const r = renderTemplate(defaultTemplateId, client.id);
      setBody(r?.text ?? "");
    }
  }, [defaultTemplateId, client]);

  // Keep the highlight inside the list as it shrinks under the query.
  React.useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, matches.length - 1)));
  }, [matches.length]);

  const edited = Boolean(rendered && body.trim() !== rendered.text.trim());
  const blocked = (rendered?.unresolved.length ?? 0) > 0;

  const guard = React.useMemo(() => {
    if (!client || !rendered) return undefined;
    return previewSend({
      clientId: client.id,
      staffId: actorId,
      channel: rendered.channel,
      scope: rendered.scope,
      body,
      to: rendered.channel === "Email" ? (client.email ?? "") : (client.phone ?? ""),
    });
  }, [client, rendered, body, actorId]);

  const canSend =
    Boolean(client && rendered && body.trim().length > 0) &&
    !blocked &&
    !sending &&
    (guard?.allowed ?? false);

  async function handleSend() {
    if (!client || !rendered || !canSend) return;
    setSending(true);
    try {
      const result = await sendMessage({
        clientId: client.id,
        staffId: actorId,
        channel: rendered.channel,
        scope: rendered.scope,
        subject: rendered.subject,
        body,
        to: rendered.channel === "Email" ? (client.email ?? "") : (client.phone ?? ""),
        // Idempotent on (staff, member, template, exact text). A double-click,
        // or a coach hammering Cmd+Enter, is one message — not two.
        idempotencyKey: `qr:${actorId}:${client.id}:${rendered.template.id}:${body.length}:${body.slice(0, 24)}`,
      });

      // The guard hands back exactly what belongs on the chain, refusal or not.
      // Writing it either way is the point: a blocked send is the most
      // audit-relevant thing that can happen and must not be the one event
      // that leaves no trace.
      appendLedger(result.ledgerEvent);

      if (result.ok) {
        toast(`Sent to ${client.firstName}`, {
          desc: `${rendered.channel} · ${SCOPE_LABEL[rendered.scope]}`,
        });
        onSent?.({ templateId: rendered.template.id, body, deliveryId: result.deliveryId });
      } else {
        toast("Send refused", { desc: result.message, tone: "warn" });
      }
    } finally {
      setSending(false);
    }
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const t = matches[cursor];
      if (t) load(t);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
    }
  }

  function onBodyKeyDown(e: React.KeyboardEvent) {
    // Cmd/Ctrl+Enter sends. A bare Enter must never send — the body is
    // multi-paragraph and a coach pressing Enter is writing, not committing.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSend();
    } else if (e.key === "Escape") {
      e.preventDefault();
      searchRef.current?.focus();
    }
  }

  if (!client) {
    return (
      <div className={cn("card p-5 text-sm text-ink-400", className)}>
        No member selected.
      </div>
    );
  }

  return (
    <div className={cn("card overflow-hidden", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700/70 p-4">
        <div className="min-w-0">
          <p className="label-eyebrow">Quick reply</p>
          <h3 className="font-display text-base font-semibold text-ink-50">
            {clientName(client)}
          </h3>
        </div>
        <p className="text-xs text-ink-500">
          {actor?.name ?? "Coach"} · <kbd className="stat-mono">↑↓</kbd> pick ·{" "}
          <kbd className="stat-mono">⏎</kbd> load · <kbd className="stat-mono">⌘⏎</kbd> send
        </p>
      </div>

      {/* Base grid-cols-1 so 390px stacks; the two-pane layout only appears
          once there is room for a list and an editor side by side. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        {/* ── Template picker ───────────────────────────────────────────── */}
        <div className="border-b border-ink-700/70 p-3 lg:border-b-0 lg:border-r">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onListKeyDown}
              placeholder="Situation…"
              aria-label="Search message templates"
              className="pl-8"
            />
          </div>

          <ul role="listbox" aria-label="Message templates" className="mt-2 max-h-72 space-y-1 overflow-y-auto">
            {matches.map((t, i) => {
              const on = t.id === activeId;
              return (
                <li key={t.id}>
                  <button
                    role="option"
                    aria-selected={on}
                    onClick={() => {
                      setCursor(i);
                      load(t);
                    }}
                    className={cn(
                      "w-full rounded-lg px-2.5 py-2 text-left transition-colors focus-ring",
                      on
                        ? "bg-gold-400/15 text-gold-200"
                        : i === cursor
                          ? "bg-ink-800 text-ink-100"
                          : "text-ink-300 hover:bg-ink-800",
                    )}
                  >
                    <span className="block truncate text-sm font-medium">{t.name}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-ink-500">
                      {t.situation}
                    </span>
                  </button>
                </li>
              );
            })}
            {matches.length === 0 && (
              <li className="px-2.5 py-6 text-center text-xs text-ink-500">
                Nothing matches “{query}”.
              </li>
            )}
          </ul>
        </div>

        {/* ── Draft ─────────────────────────────────────────────────────── */}
        <div className="p-4">
          {!rendered ? (
            <p className="py-10 text-center text-sm text-ink-500">
              Pick a situation on the left. {TEMPLATES_ARE_DRAFTS}
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge tone={SCOPE_TONE[rendered.scope]}>
                  <ShieldCheck className="h-3 w-3" />
                  {SCOPE_LABEL[rendered.scope]}
                </Badge>
                <Badge tone="neutral">{rendered.channel}</Badge>
                {edited && (
                  <Badge tone="gold">
                    <Pencil className="h-3 w-3" />
                    Edited
                  </Badge>
                )}
              </div>

              <p className="mb-3 text-xs leading-relaxed text-ink-500">
                {rendered.template.scopeNote}
              </p>

              {rendered.subject && (
                <div className="mb-2">
                  <label className="label-eyebrow" htmlFor="qr-subject">
                    Subject
                  </label>
                  <Input id="qr-subject" defaultValue={rendered.subject} readOnly />
                </div>
              )}

              <label className="label-eyebrow" htmlFor="qr-body">
                Message
              </label>
              <Textarea
                id="qr-body"
                ref={bodyRef}
                rows={10}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={onBodyKeyDown}
                className="mt-1 font-sans leading-relaxed"
              />

              <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-500">
                <Pencil className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{rendered.template.editHint}</span>
              </p>

              {/* A draft with holes cannot be sent. Not a warning — a block.
                  "[Next visit — not on file]" reaching a member is the exact
                  failure this whole module exists to prevent. */}
              {blocked && (
                <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-high/30 bg-high/10 p-2.5 text-xs text-high">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Missing from this record:{" "}
                    <span className="stat-mono">{rendered.unresolved.join(", ")}</span>. Fix the
                    record or rewrite the line — this draft cannot send with a placeholder in it.
                  </span>
                </p>
              )}

              {guard && !guard.allowed && !blocked && (
                <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-watch/30 bg-watch/10 p-2.5 text-xs text-watch">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{guard.message}</span>
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-ink-600">{TEMPLATES_ARE_DRAFTS}</p>
                <Button variant="primary" onClick={handleSend} disabled={!canSend}>
                  <Send className="h-3.5 w-3.5" />
                  {sending ? "Sending…" : "Send"}
                  <CornerDownLeft className="h-3 w-3 opacity-60" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default QuickReply;
