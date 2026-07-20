"use client";

import { useState, useRef, useEffect } from "react";
import { answerFor, SUGGESTED_PROMPTS, type AgentBlock } from "@/lib/agentResponses";
import { Bot, User, Send, Sparkles, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface Msg {
  id: number;
  role: "user" | "agent";
  blocks: AgentBlock[];
}

let mid = 0;

export function AgentChat() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: mid++,
      role: "agent",
      blocks: [
        {
          text:
            "I'm the Alpha Coach Copilot. I answer from Apex mock data and cite the internal records I used. Pick a suggested prompt below to get started.",
        },
      ],
    },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  // Auto-run a prompt passed via ?q= (from the global command bar). Client-only
  // read of the query string avoids a Suspense boundary requirement.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      send(q);
      window.history.replaceState(null, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = (text: string) => {
    const q = text.trim();
    if (!q) return;
    setMessages((m) => [...m, { id: mid++, role: "user", blocks: [{ text: q }] }]);
    setInput("");
    setThinking(true);
    // Deterministic, local "thinking" delay — no real LLM call.
    setTimeout(() => {
      const res = answerFor(q);
      setMessages((m) => [...m, { id: mid++, role: "agent", blocks: res.blocks }]);
      setThinking(false);
    }, 550);
  };

  return (
    <div className="flex h-[calc(100vh-13rem)] min-h-[480px] flex-col">
      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-ink-700/70 bg-ink-850/60 p-4">
        {messages.map((m) => (
          <div key={m.id} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
            <span
              className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-full",
                m.role === "agent"
                  ? "bg-gradient-to-br from-gold-300 to-gold-600 text-ink-950"
                  : "bg-ink-700 text-ink-200",
              )}
            >
              {m.role === "agent" ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
            </span>
            <div
              className={cn(
                "max-w-[85%] space-y-2 rounded-2xl px-4 py-3 text-body leading-relaxed",
                m.role === "agent"
                  ? "bg-ink-800/80 text-ink-200"
                  : "bg-gold-400/15 text-gold-50",
              )}
            >
              {m.blocks.map((b, i) => (
                <div key={i}>
                  <p className={cn(b.text.startsWith("Note:") && "text-micro text-ink-500")}>{b.text}</p>
                  {b.citations && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {b.citations.map((c) => (
                        <span
                          key={c}
                          className="inline-flex items-center gap-1 rounded-md border border-ink-700 bg-ink-900/60 px-1.5 py-0.5 text-micro text-ink-400"
                        >
                          <FileText className="h-2.5 w-2.5" /> {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-ink-950">
              <Bot className="h-4 w-4" />
            </span>
            <div className="flex items-center gap-1 rounded-2xl bg-ink-800/80 px-4 py-3.5">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-ink-400" />
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-ink-400 [animation-delay:0.2s]" />
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-ink-400 [animation-delay:0.4s]" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Suggested prompts */}
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTED_PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => send(p)}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink-700 bg-ink-850/60 px-3 py-1.5 text-detail text-ink-300 transition-colors hover:border-gold-400/40 hover:text-gold-200"
          >
            <Sparkles className="h-3 w-3 text-gold-400" />
            {p}
          </button>
        ))}
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about clients, labs, recommendations, inventory…"
          className="h-11 flex-1 rounded-xl border border-ink-700 bg-ink-900/70 px-4 text-body text-ink-100 placeholder:text-ink-500 focus-ring"
        />
        <button
          type="submit"
          className="grid h-11 w-11 place-items-center rounded-xl bg-gold-400 text-ink-950 transition-colors hover:bg-gold-300 focus-ring"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
