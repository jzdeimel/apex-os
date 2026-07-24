"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Database, Search } from "lucide-react";
import { Button, Card, CardContent, Input } from "@/components/ui/primitives";

interface Answer {
  answer: string;
  facts: Array<{ label: string; value: string; href?: string; recordId?: string }>;
  scopeNote: string;
}

export function RecordAssistant() {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setState("loading");
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      setState("error");
      return;
    }
    setAnswer(payload);
    setState("idle");
  }

  return (
    <div className="space-y-5">
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3 sm:flex-row">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask about your schedule, tasks, patient count, or directory…" className="flex-1" />
        <Button type="submit" disabled={state === "loading"}><Search className="h-4 w-4" /> {state === "loading" ? "Querying…" : "Query Apex"}</Button>
      </form>
      {state === "error" && <p className="rounded-control border border-high/30 bg-high/5 p-4 text-high">The live record query failed.</p>}
      {answer && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-3"><Database className="mt-1 h-5 w-5 shrink-0 text-teal-300" /><div><p className="text-body leading-relaxed text-ink-100">{answer.answer}</p><p className="mt-2 text-micro text-ink-500">{answer.scopeNote}</p></div></div>
            <div className="mt-5 space-y-3">{answer.facts.map((fact, index) => {
              const content = <div className="rounded-control border border-ink-700 bg-ink-900/40 p-4"><p className="text-micro uppercase text-ink-500">{fact.label}</p><p className="mt-1 text-detail text-ink-200">{fact.value}</p>{fact.recordId && <p className="mt-1 stat-mono text-micro text-ink-600">{fact.recordId}</p>}</div>;
              return fact.href ? <Link key={`${fact.label}-${index}`} href={fact.href} className="block hover:border-gold-400/50">{content}</Link> : <div key={`${fact.label}-${index}`}>{content}</div>;
            })}</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
