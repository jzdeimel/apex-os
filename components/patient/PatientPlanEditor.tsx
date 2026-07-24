"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, CardContent, Input } from "@/components/ui/primitives";

interface Plan {
  id: string;
  category: "nutrition" | "training";
  title: string;
  summary: string | null;
  status: string;
  version: number;
  effectiveOn: string | null;
  content: Array<{ heading: string; body: string }>;
}

export function PatientPlanEditor({
  clientId,
  canNutrition,
  canTraining,
}: {
  clientId: string;
  canNutrition: boolean;
  canTraining: boolean;
}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [category, setCategory] = useState<"nutrition" | "training">(
    canNutrition ? "nutrition" : "training",
  );
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [guidance, setGuidance] = useState("");
  const [state, setState] = useState("idle");

  const load = useCallback(async () => {
    const response = await fetch(`/api/patient-plans?clientId=${encodeURIComponent(clientId)}`, {
      cache: "no-store",
    });
    const payload = await response.json();
    if (response.ok && payload.ok) setPlans(payload.plans);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!title.trim() || !guidance.trim()) return;
    setState("saving");
    const response = await fetch("/api/patient-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        category,
        requestId: crypto.randomUUID(),
        title,
        summary,
        content: [{ heading: "Coach guidance", body: guidance }],
      }),
    });
    setState(response.ok ? "saved" : "error");
    if (response.ok) {
      setTitle("");
      setSummary("");
      setGuidance("");
      await load();
    }
  }

  async function publish(plan: Plan) {
    setState(`publishing-${plan.id}`);
    const response = await fetch("/api/patient-plans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "publish",
        id: plan.id,
        clientId,
        category: plan.category,
        effectiveOn: new Date().toISOString().slice(0, 10),
      }),
    });
    setState(response.ok ? "saved" : "error");
    if (response.ok) await load();
  }

  if (!canNutrition && !canTraining) return null;

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="font-display text-title text-ink-50">Food and training plans</h2>
        <p className="mt-2 text-detail text-ink-400">
          Drafts remain staff-only. Publishing creates an immutable patient-visible version and replaces the previous active plan.
        </p>
        <div className="mt-5 grid gap-3">
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as "nutrition" | "training")}
            className="focus-ring h-11 rounded-control border border-ink-700 bg-ink-900 px-3 text-ink-100"
          >
            {canNutrition && <option value="nutrition">Nutrition</option>}
            {canTraining && <option value="training">Training</option>}
          </select>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Plan title" />
          <Input value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Short patient-facing summary" />
          <textarea
            value={guidance}
            onChange={(event) => setGuidance(event.target.value)}
            placeholder="Specific guidance, targets, progression, and review timing. Do not put medication doses here."
            className="focus-ring min-h-36 rounded-control border border-ink-700 bg-ink-900 p-3 text-body text-ink-100"
          />
          <div><Button onClick={() => void create()} disabled={state === "saving"}>{state === "saving" ? "Saving…" : "Save draft"}</Button></div>
          {state === "error" && <p className="text-detail text-high">The plan change was not confirmed.</p>}
        </div>
        <div className="mt-6 space-y-3">
          {plans.map((plan) => (
            <div key={plan.id} className="rounded-control border border-ink-700 bg-ink-900/40 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium capitalize text-ink-100">{plan.category} · {plan.title}</span>
                <span className="rounded-full bg-ink-800 px-2 py-1 text-micro text-ink-300">v{plan.version} · {plan.status}</span>
                {plan.status === "draft" && (
                  <Button className="ml-auto" size="sm" variant="outline" onClick={() => void publish(plan)} disabled={state === `publishing-${plan.id}`}>
                    {state === `publishing-${plan.id}` ? "Publishing…" : "Publish"}
                  </Button>
                )}
              </div>
              {plan.summary && <p className="mt-2 text-detail text-ink-400">{plan.summary}</p>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
