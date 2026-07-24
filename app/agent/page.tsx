import { Bot, Database, ShieldCheck } from "lucide-react";
import { RecordAssistant } from "@/components/agent/RecordAssistant";

export default function AgentPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="label-eyebrow">Live Apex record retrieval</p>
        <h1 className="mt-2 flex items-center gap-3 font-display text-title text-ink-50"><Bot className="h-7 w-7 text-gold-300" /> Ask Apex</h1>
        <p className="mt-2 max-w-3xl text-body text-ink-400">A scoped natural-language front end to authoritative tasks, schedules, counts, and the patient directory. It returns record ids and links; it does not generate clinical answers.</p>
        <div className="mt-4 flex flex-wrap gap-2 text-micro text-ink-400"><span className="inline-flex items-center gap-1.5 rounded-full border border-ink-700 px-2.5 py-1"><Database className="h-3 w-3 text-teal-300" /> PostgreSQL records</span><span className="inline-flex items-center gap-1.5 rounded-full border border-ink-700 px-2.5 py-1"><ShieldCheck className="h-3 w-3 text-teal-300" /> Role and assignment scoped</span></div>
      </header>
      <RecordAssistant />
    </div>
  );
}
