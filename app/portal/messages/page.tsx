"use client";

/**
 * Messages — a real thread with the care team.
 *
 * The bug this page exists to not repeat: in the system we're replacing, every
 * bubble renders with the outbound style, because the renderer never reads the
 * direction field. A member scrolling their own history sees their coach's
 * advice styled as if they had written it themselves. Inbound and outbound are
 * visually distinct here — different side, different fill, different corner —
 * and the underlying field is member-relative so it is hard to get wrong.
 *
 * The composer is deliberately non-persistent: this is a demo surface, and a
 * send box that silently drops what you typed is exactly the class of failure
 * (see: clinical notes with no autosave) we are calling out elsewhere. So the
 * draft stays in the box, the sent message appends locally, and a toast says
 * plainly what happened.
 */

import { useMemo, useRef, useState } from "react";
import { staffMap } from "@/lib/mock/staff";
import { Card, CardContent, Badge, Button, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { usePortal } from "@/lib/portalStore";
import { formatDate, formatTime, cn } from "@/lib/utils";
import { useMe, useMeClient, threadFor, PortalPageHeader, type PortalMessage } from "@/components/portal/PortalHeader";
import { sendMessage } from "@/lib/comms/send";
import { appendLedger } from "@/lib/trace/ledger";
import { shortHash } from "@/lib/trace/hash";
import { Send, Clock, Phone, ShieldAlert, MessageSquare } from "lucide-react";

/**
 * Threads. Only one is live in the demo, but the two-pane shape is the point —
 * a member has more than one relationship with the clinic, and collapsing them
 * into one undifferentiated inbox is how "I told someone about this already"
 * becomes true and useless at the same time.
 */
interface ThreadDef {
  id: string;
  staffId?: string;
  title: string;
  subtitle: string;
  messages: PortalMessage[];
}

/** Group consecutive same-sender messages so the thread reads as conversation. */
function dayKey(iso: string) {
  return iso.slice(0, 10);
}

export default function PortalMessagesPage() {
  // Audit fix (GAP_ANALYSIS.md, "Portal renderable as a woman"): this was the
  // module constant ME, which pinned the portal to one male member.
  const meId = useMe();
  const client = useMeClient();
  const { portal } = usePortal();
  const { toast } = useToast();
  const coach = staffMap[client.coachId];
  const provider = staffMap[client.providerId];

  // Sent messages are tracked PER THREAD. The previous version kept a single
  // `sent` array and always routed a send to the coach, so a message composed on
  // the provider thread was posted to the coach and never appeared where it was
  // typed — the member watched their clinical question vanish. Keying by thread
  // id means each thread shows exactly what was said in it.
  const [sentByThread, setSentByThread] = useState<Record<string, PortalMessage[]>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [activeId, setActiveId] = useState("t-coach");
  const seq = useRef(0);

  const threads: ThreadDef[] = useMemo(
    () => [
      {
        id: "t-coach",
        staffId: client.coachId,
        title: coach?.name ?? "Your coach",
        subtitle: "Your coach · usually replies same day",
        messages: [...threadFor(client), ...(sentByThread["t-coach"] ?? [])],
      },
      {
        id: "t-provider",
        staffId: client.providerId,
        title: provider?.name ?? "Your provider",
        subtitle: "Your provider · clinical questions",
        messages: [...(sentByThread["t-provider"] ?? [])],
      },
    ],
    [client, client.coachId, client.providerId, coach?.name, provider?.name, sentByThread],
  );

  const active = threads.find((t) => t.id === activeId) ?? threads[0];

  // Day dividers: a thread spanning three weeks with no date breaks is a wall.
  const days = useMemo(() => {
    const out: { day: string; items: PortalMessage[] }[] = [];
    for (const m of active.messages) {
      const k = dayKey(m.at);
      const cur = out[out.length - 1];
      if (cur && cur.day === k) cur.items.push(m);
      else out.push({ day: k, items: [m] });
    }
    return out;
  }, [active.messages]);

  /**
   * Sending goes through the guarded comms path rather than straight into
   * local state.
   *
   * `sendMessage` enforces consent for this exact scope and channel, quiet
   * hours, the weekly cap and an idempotency key, and refuses with a typed
   * reason rather than silently succeeding. On success its `ledgerEvent` is
   * appended to the hash chain and the committed row id is shown back to the
   * member — they watch the record of their own message being written.
   */
  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);

    // Route to WHOEVER this thread is with — the coach or the provider — not
    // always the coach. The active thread's staff id is the recipient.
    const threadId = active.id;
    const recipientId = active.staffId ?? coach?.id ?? "unknown";

    const result = await sendMessage({
      clientId: meId,
      staffId: recipientId,
      channel: "Portal message",
      // A member writing to their care team is clinical, never marketing.
      // Stating the scope at the call site means it cannot be inferred wrongly.
      scope: "clinical",
      body,
      to: client.email,
      idempotencyKey: `portal-${meId}-${threadId}-${body.length}-${body.slice(0, 24)}`,
    });

    if (!result.ok) {
      toast("Not sent", { tone: "warn", desc: result.message });
      setSending(false);
      return;
    }

    const row = appendLedger(result.ledgerEvent);
    seq.current += 1;
    setSentByThread((prev) => ({
      ...prev,
      [threadId]: [
        ...(prev[threadId] ?? []),
        {
          // Deterministic id and timestamp — the pinned demo clock, never Date.now().
          id: `msg-local-${seq.current}`,
          at: "2026-06-12T09:00:00",
          who: "me",
          from: client.firstName,
          body,
          channel: "Portal",
        },
      ],
    }));
    setDraft("");
    toast("Message sent", {
      desc: `Written to your record as ${row.id} · ${shortHash(row.hash)}`,
    });
    setSending(false);
  }

  return (
    <div className="space-y-6">
      <PortalPageHeader
        eyebrow="Messages"
        title="Talk to your team"
        subtitle="One thread per person, kept forever. You never have to re-explain something you already said here."
      />

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        {/* Thread list ------------------------------------------------------ */}
        <Card className="h-fit">
          <CardContent className="p-3">
            <div className="space-y-1">
              {threads.map((t) => {
                const last = t.messages[t.messages.length - 1];
                const isActive = t.id === active.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveId(t.id)}
                    className={cn(
                      "focus-ring w-full rounded-panel p-3 text-left transition-colors",
                      isActive ? "bg-ink-800" : "hover:bg-ink-800/50",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-micro font-semibold text-ink-950"
                        style={{ background: isActive ? portal.accent.hex : "#3a4048" }}
                      >
                        {staffMap[t.staffId ?? ""]?.avatarInitials ?? "AH"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-detail font-medium text-ink-50">{t.title}</p>
                        <p className="truncate text-micro text-ink-500">{t.subtitle}</p>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 text-micro text-ink-400">
                      {last ? last.body : "No messages yet — say hello."}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* The one accented thing on this screen, and the one that has
                earned it: a genuine risk notice. Border dropped so it separates
                from the thread list by tint alone rather than adding another
                drawn box inside the card. */}
            <div className="mt-4 flex items-start gap-2 rounded-control bg-high/10 p-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-high" />
              <p className="text-micro leading-relaxed text-ink-300">
                Messages are not monitored around the clock. If something feels like an emergency, call{" "}
                <span className="stat-mono">911</span> — not this box.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Thread ----------------------------------------------------------- */}
        <Card className="flex min-h-[34rem] flex-col">
          <div className="hairline flex items-center gap-3 p-4">
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-micro font-semibold text-ink-950"
              style={{ background: portal.accent.hex }}
            >
              {staffMap[active.staffId ?? ""]?.avatarInitials ?? "AH"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-detail font-medium text-ink-50">{active.title}</p>
              <p className="text-micro text-ink-500">{active.subtitle}</p>
            </div>
            {/* Not a green badge. "Typically under 4h" is an expectation, not
                a clinical status, and tone="optimal" spent the status colour on
                it — which left the genuine risk notice in the sidebar competing
                with a decoration for the member's attention. */}
            <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-micro text-ink-500">
              <Clock className="h-3 w-3" />
              Typically under 4h
            </span>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-4">
            {days.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <MessageSquare className="h-6 w-6 text-ink-600" />
                <p className="mt-2 text-detail text-ink-400">No messages with {active.title} yet.</p>
                <p className="mt-1 max-w-xs text-micro text-ink-500">
                  Clinical questions land here. Anything about food, training or scheduling is faster with your
                  coach.
                </p>
              </div>
            )}

            {days.map(({ day, items }) => (
              <div key={day} className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-ink-800" />
                  <span className="stat-mono text-micro uppercase tracking-wide text-ink-600">
                    {formatDate(day)}
                  </span>
                  <span className="h-px flex-1 bg-ink-800" />
                </div>

                {items.map((m) => {
                  const mine = m.who === "me";
                  return (
                    <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[80%]", mine ? "items-end" : "items-start")}>
                        {/* Attribution only on team messages — the member knows
                            who they are, and repeating "You" every bubble is noise. */}
                        {!mine && (
                          <p className="mb-1 pl-1 text-micro text-ink-500">
                            <span className="text-ink-300">{m.from}</span>
                            {m.role && <span> · {m.role}</span>}
                          </p>
                        )}
                        <div
                          /* The member's own bubbles were clinical green. Green
                             means "in range" everywhere else in this product,
                             so using it for "you said this" both wasted the
                             status colour and quietly implied something. A
                             lighter neutral surface plus the existing
                             right-alignment separates the two speakers
                             perfectly well, and leaves colour free to mean
                             something. */
                          className={cn(
                            "rounded-panel px-3.5 py-2.5 text-detail leading-relaxed",
                            mine
                              ? "rounded-br-control bg-ink-700 text-ink-50"
                              : "rounded-bl-control bg-ink-800 text-ink-200",
                          )}
                        >
                          {m.body}
                        </div>
                        <div
                          className={cn(
                            "mt-1 flex items-center gap-2 px-1 text-micro text-ink-600",
                            mine ? "justify-end" : "justify-start",
                          )}
                        >
                          <span className="stat-mono">{formatTime(m.at)}</span>
                          {m.channel === "SMS" && (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-2.5 w-2.5" />
                              text message
                            </span>
                          )}
                          {!mine && m.readAt && <span>read {formatTime(m.readAt)}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Composer -------------------------------------------------------- */}
          <div className="hairline p-4">
            <div className="flex items-end gap-2">
              <Textarea
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Message ${active.title.split(" ")[0]}…`}
                onKeyDown={(e) => {
                  // Enter sends, Shift+Enter newlines — the convention every
                  // member already has muscle memory for.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              {/* primary, not success: nothing has succeeded when you press
                  Send, and the green reads as a confirmation that has not
                  happened yet. */}
              <Button variant="primary" onClick={send} disabled={!draft.trim() || sending} className="h-9 shrink-0">
                <Send className="h-3.5 w-3.5" />
                Send
              </Button>
            </div>
            <p className="mt-2 text-micro text-ink-600">
              Your care team can see this thread. Nobody else can — check the{" "}
              <span className="text-ink-400">Who&rsquo;s seen my chart</span> page any time to confirm that
              yourself. Demo build: messages stay in this browser.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
