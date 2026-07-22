"use client";

import { AgentChat } from "@/components/AgentChat";
import { Disclaimer } from "@/components/Disclaimer";
import { Bot, ShieldCheck, Database } from "lucide-react";

export default function AgentPage() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label-eyebrow">AI Coach Copilot · answers from mock data</p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-title font-bold tracking-tight text-ink-50">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-gold-300 to-gold-600 text-white">
              <Bot className="h-5 w-5" />
            </span>
            Coach Copilot
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 text-micro">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-700 bg-ink-850/60 px-2.5 py-1 text-ink-400">
            <Database className="h-3 w-3 text-gold-400" /> Deterministic · no external LLM
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-700 bg-ink-850/60 px-2.5 py-1 text-ink-400">
            <ShieldCheck className="h-3 w-3 text-gold-400" /> Cites internal records
          </span>
        </div>
      </div>

      <AgentChat />

      <Disclaimer compact />
    </div>
  );
}
