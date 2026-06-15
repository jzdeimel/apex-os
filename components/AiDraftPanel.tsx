"use client";

import { useState } from "react";
import type { Client } from "@/lib/types";
import { useStore } from "@/lib/store";
import {
  generateVisitSummary,
  visitSummaryToText,
  generateFollowUpMessage,
  type MessageTone,
} from "@/lib/aiDrafts";
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from "@/components/ui/primitives";
import { AiLabel } from "@/components/Disclaimer";
import { cn } from "@/lib/utils";
import { Sparkles, FileText, MessageSquare, Save, Copy, Check, RefreshCw } from "lucide-react";

const TONES: MessageTone[] = ["Check-in", "Results ready", "Re-engagement", "Booking nudge"];

export function AiDraftPanel({ client }: { client: Client }) {
  const { addNote, role } = useStore();
  const [mode, setMode] = useState<"visit" | "message">("visit");
  const [summary, setSummary] = useState<ReturnType<typeof generateVisitSummary> | null>(null);
  const [tone, setTone] = useState<MessageTone>("Check-in");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const runVisit = () => {
    setBusy(true);
    setSaved(false);
    setTimeout(() => {
      setSummary(generateVisitSummary(client));
      setBusy(false);
    }, 500);
  };
  const runMessage = (t: MessageTone) => {
    setTone(t);
    setBusy(true);
    setCopied(false);
    setTimeout(() => {
      setMessage(generateFollowUpMessage(client, t));
      setBusy(false);
    }, 400);
  };

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gold-400" /> AI drafting studio
        </CardTitle>
        <AiLabel />
      </CardHeader>
      <CardContent className="space-y-3">
        {/* mode toggle */}
        <div className="flex gap-1 rounded-lg border border-ink-800 bg-ink-900/60 p-0.5">
          <button
            onClick={() => setMode("visit")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "visit" ? "bg-gold-400/15 text-gold-200" : "text-ink-400 hover:text-ink-100",
            )}
          >
            <FileText className="h-3.5 w-3.5" /> Visit summary
          </button>
          <button
            onClick={() => setMode("message")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "message" ? "bg-gold-400/15 text-gold-200" : "text-ink-400 hover:text-ink-100",
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" /> Client message
          </button>
        </div>

        {mode === "visit" && (
          <div className="space-y-3">
            <Button variant="primary" className="w-full" onClick={runVisit} disabled={busy}>
              {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {summary ? "Regenerate visit summary" : "Generate SOAP visit summary"}
            </Button>

            {summary && (
              <div className="animate-fade-in space-y-2 rounded-xl border border-ink-800 bg-ink-900/40 p-3 text-xs leading-relaxed">
                <SoapRow label="S" body={summary.subjective} />
                <SoapRow label="O" body={summary.objective} />
                <SoapRow label="A" body={summary.assessment} />
                <div>
                  <span className="mr-1.5 inline-grid h-5 w-5 place-items-center rounded bg-gold-400/15 stat-mono text-[10px] font-bold text-gold-300">P</span>
                  <span className="whitespace-pre-line text-ink-300">{summary.plan}</span>
                </div>
                <p className="border-t border-ink-800 pt-2 text-[10px] text-gold-300/80">{summary.disclaimer}</p>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="success"
                    onClick={() => {
                      addNote({
                        clientId: client.id,
                        author: "AI",
                        body: visitSummaryToText(summary),
                      });
                      setSaved(true);
                    }}
                    disabled={saved}
                  >
                    {saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                    {saved ? "Saved to chart" : "Save to notes"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {mode === "message" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {TONES.map((t) => (
                <button
                  key={t}
                  onClick={() => runMessage(t)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    tone === t && message
                      ? "border-gold-400/50 bg-gold-400/15 text-gold-100"
                      : "border-ink-700 text-ink-300 hover:text-ink-100",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            {busy && <p className="text-xs text-ink-500">Drafting…</p>}

            {message && !busy && (
              <div className="animate-fade-in space-y-2 rounded-xl border border-ink-800 bg-ink-900/40 p-3">
                <Badge tone="gold">{tone}</Badge>
                <p className="text-xs leading-relaxed text-ink-300">{message}</p>
                <p className="text-[10px] text-ink-500">Generic, non-medical. Channel delivery is simulated in this demo.</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard?.writeText(message).catch(() => {});
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1600);
                    }}
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      addNote({
                        clientId: client.id,
                        author: role === "Provider" ? "Provider" : "Coach",
                        body: `[Draft ${tone} message] ${message}`,
                      })
                    }
                  >
                    <Save className="h-3.5 w-3.5" /> Log to notes
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SoapRow({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <span className="mr-1.5 inline-grid h-5 w-5 place-items-center rounded bg-gold-400/15 stat-mono text-[10px] font-bold text-gold-300">
        {label}
      </span>
      <span className="text-ink-300">{body}</span>
    </div>
  );
}
