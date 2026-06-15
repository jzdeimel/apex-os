"use client";

import { useMemo, useState } from "react";
import { clients, clientName, getClient } from "@/lib/mock/clients";
import { getLabsForClient } from "@/lib/mock/labs";
import { recommendationsForClient } from "@/lib/mock/recommendations";
import { appointmentsForClient } from "@/lib/mock/appointments";
import { staffName, staffMap } from "@/lib/mock/staff";
import { alphaScore, scoreColor } from "@/lib/alphaScore";
import { AlphaScoreRing } from "@/components/AlphaScoreRing";
import { Card, CardHeader, CardTitle, CardContent, Select, Badge } from "@/components/ui/primitives";
import { formatDateTime, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  Smartphone,
  CalendarClock,
  Activity,
  ClipboardList,
  Bell,
  Send,
  ShieldCheck,
  Eye,
} from "lucide-react";

export default function PortalPage() {
  const withLabs = clients.filter((c) => getLabsForClient(c.id));
  const [clientId, setClientId] = useState(withLabs[0]?.id ?? clients[0].id);
  const client = getClient(clientId)!;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label-eyebrow">Patient portal · read-only preview</p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-ink-50">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-gold-300 to-gold-600 text-ink-950">
              <Smartphone className="h-5 w-5" />
            </span>
            Client App Preview
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="info"><Eye className="h-3 w-3" /> What the client sees</Badge>
          <div className="w-52">
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{clientName(c)}</option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Phone frame */}
        <div className="flex justify-center">
          <PhonePreview clientId={clientId} key={clientId} />
        </div>

        {/* Messaging inbox */}
        <PortalInbox client={client} />
      </div>

      <p className="text-[11px] text-ink-600">
        Demo preview of the patient-facing experience. Read-only. Client-facing copy is intentionally
        supportive and non-clinical; all protocol &amp; dosing detail is handled by the provider.
      </p>
    </div>
  );
}

function PhonePreview({ clientId }: { clientId: string }) {
  const client = getClient(clientId)!;
  const result = alphaScore(client);
  const labs = getLabsForClient(clientId);
  const appt = appointmentsForClient(clientId).find((a) => a.start >= "2026-06-12");
  const approved = recommendationsForClient(clientId).filter((r) => r.status === "provider approved");

  // Friendly, non-alarming result chips.
  const highlights =
    labs?.biomarkers
      .filter((b) => ["total_t", "vitd", "a1c", "ft3", "hscrp", "igf1", "ferritin"].includes(b.key))
      .slice(0, 4) ?? [];
  const friendly = (s: string) => (s === "optimal" ? "In range" : s === "watch" ? "Monitoring" : "Discuss with team");

  return (
    <div className="w-full max-w-[340px] overflow-hidden rounded-[2.2rem] border-[10px] border-ink-800 bg-ink-950 shadow-glow">
      {/* status bar */}
      <div className="flex items-center justify-between bg-ink-900 px-5 py-2 text-[10px] text-ink-500">
        <span>9:41</span>
        <span className="h-3 w-16 rounded-full bg-ink-800" />
        <span>Alpha</span>
      </div>
      <div className="max-h-[640px] space-y-3 overflow-y-auto p-4">
        {/* greeting + score */}
        <div className="rounded-2xl border border-gold-400/20 bg-gradient-to-br from-gold-400/10 to-transparent p-4 text-center">
          <p className="text-xs text-ink-400">Good morning,</p>
          <p className="font-display text-lg font-bold text-ink-50">{client.firstName}</p>
          <div className="mt-3 flex justify-center">
            <AlphaScoreRing result={result} size={96} showLabel={false} />
          </div>
          <p className="mt-2 text-sm font-medium" style={{ color: scoreColor(result.band) }}>
            Your Alpha Score is {result.label.toLowerCase()}
          </p>
        </div>

        {/* next appt */}
        <PortalTile icon={CalendarClock} title="Next appointment">
          {appt ? (
            <>
              <p className="text-sm text-ink-100">{appt.type}</p>
              <p className="text-xs text-ink-500">{formatDateTime(appt.start)} · {staffName(appt.staffId)}</p>
            </>
          ) : (
            <p className="text-sm text-ink-500">No upcoming visit — tap to book.</p>
          )}
        </PortalTile>

        {/* results */}
        <PortalTile icon={Activity} title="Your latest results">
          {highlights.length ? (
            <div className="space-y-1.5">
              {highlights.map((b) => (
                <div key={b.key} className="flex items-center justify-between">
                  <span className="text-xs text-ink-300">{b.name}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      b.status === "optimal" ? "bg-optimal/15 text-optimal" : b.status === "watch" ? "bg-watch/15 text-watch" : "bg-low/15 text-low",
                    )}
                  >
                    {friendly(b.status)}
                  </span>
                </div>
              ))}
              <p className="pt-1 text-[10px] text-ink-600">Your care team reviews every result with you.</p>
            </div>
          ) : (
            <p className="text-sm text-ink-500">Results coming soon.</p>
          )}
        </PortalTile>

        {/* plan */}
        <PortalTile icon={ClipboardList} title="Your plan">
          {approved.length ? (
            <div className="space-y-1.5">
              {approved.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-optimal" />
                  <span className="text-xs text-ink-200">{r.category}</span>
                </div>
              ))}
              <p className="pt-1 text-[10px] text-ink-600">Your provider sets the details at your visit.</p>
            </div>
          ) : (
            <p className="text-sm text-ink-500">Your personalized plan is being prepared.</p>
          )}
        </PortalTile>

        {/* reminders */}
        <PortalTile icon={Bell} title="Reminders">
          <ul className="space-y-1 text-xs text-ink-300">
            <li>• Hydrate before your next lab draw</li>
            <li>• Log your weekly check-in</li>
            {appt && <li>• Confirm your {formatDate(appt.start)} appointment</li>}
          </ul>
        </PortalTile>
      </div>
    </div>
  );
}

function PortalTile({ icon: Icon, title, children }: { icon: typeof Bell; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-900/50 p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-gold-400" />
        <span className="text-xs font-semibold text-ink-200">{title}</span>
      </div>
      {children}
    </div>
  );
}

function PortalInbox({ client }: { client: ReturnType<typeof getClient> }) {
  const c = client!;
  const coach = staffMap[c.coachId];
  const [msgs, setMsgs] = useState(() => [
    { from: "coach" as const, text: `Hi ${c.firstName}! Great to have you with Alpha. How are you feeling this week?`, t: "Mon 9:12 AM" },
    { from: "client" as const, text: "Pretty good — energy is better than last month.", t: "Mon 9:40 AM" },
    { from: "coach" as const, text: "Love that. Your latest results are in and your provider will review them at your next visit.", t: "Tue 8:05 AM" },
  ]);
  const [input, setInput] = useState("");

  const send = () => {
    if (!input.trim()) return;
    setMsgs((m) => [...m, { from: "client", text: input.trim(), t: "Now" }]);
    setInput("");
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Messages</CardTitle>
        <Badge tone="neutral">with {coach?.name.split(" ")[0]} (coach)</Badge>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <div className="flex-1 space-y-2.5 overflow-y-auto pb-2">
          {msgs.map((m, i) => (
            <div key={i} className={cn("flex", m.from === "client" && "justify-end")}>
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                  m.from === "coach" ? "bg-ink-800 text-ink-200" : "bg-gold-400/15 text-gold-50",
                )}
              >
                <p>{m.text}</p>
                <span className="mt-0.5 block text-[10px] text-ink-500">{m.t}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2 border-t border-ink-800 pt-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Message your care team…"
            className="h-10 flex-1 rounded-xl border border-ink-700 bg-ink-900/70 px-3 text-sm text-ink-100 placeholder:text-ink-500 focus-ring"
          />
          <button onClick={send} className="grid h-10 w-10 place-items-center rounded-xl bg-gold-400 text-ink-950 hover:bg-gold-300 focus-ring" aria-label="Send">
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-[10px] text-ink-600">Simulated messaging. In production this routes through a HIPAA-compliant channel.</p>
      </CardContent>
    </Card>
  );
}
