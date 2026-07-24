"use client";

import { useState } from "react";
import { Button, Card, CardContent, Input } from "@/components/ui/primitives";

export function PatientRecommendationEditor({ clientId }: { clientId: string }) {
  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const [rationale, setRationale] = useState("");
  const [discussion, setDiscussion] = useState("");
  const [evidenceId, setEvidenceId] = useState("");
  const [evidenceLabel, setEvidenceLabel] = useState("");
  const [state, setState] = useState("idle");

  async function createAndSubmit() {
    if (!category.trim() || !title.trim() || !rationale.trim() || !discussion.trim() || !evidenceId.trim() || !evidenceLabel.trim()) return;
    setState("saving");
    const requestId = crypto.randomUUID();
    const response = await fetch("/api/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        requestId,
        category,
        title,
        rationale,
        proposedDiscussion: discussion,
        evidence: [{ kind: "record", id: evidenceId, label: evidenceLabel }],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      setState("error");
      return;
    }
    const submitted = await fetch("/api/recommendations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: payload.recommendation.id,
        clientId,
        action: "submit",
      }),
    });
    if (!submitted.ok) {
      setState("error");
      return;
    }
    setState("saved");
    setCategory("");
    setTitle("");
    setRationale("");
    setDiscussion("");
    setEvidenceId("");
    setEvidenceLabel("");
  }

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="font-display text-title text-ink-50">Care recommendation</h2>
        <p className="mt-2 text-detail text-ink-400">
          Human-authored and evidence-linked. No model generates treatment suggestions in shared Apex; a licensed provider must approve every row.
        </p>
        <div className="mt-5 grid gap-3">
          <Input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Category" />
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Recommendation title" />
          <textarea value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="Clinical or coaching rationale" className="focus-ring min-h-24 rounded-control border border-ink-700 bg-ink-900 p-3 text-body text-ink-100" />
          <textarea value={discussion} onChange={(event) => setDiscussion(event.target.value)} placeholder="What the provider should discuss or consider — no medication dose" className="focus-ring min-h-24 rounded-control border border-ink-700 bg-ink-900 p-3 text-body text-ink-100" />
          <div className="grid gap-3 sm:grid-cols-2"><Input value={evidenceId} onChange={(event) => setEvidenceId(event.target.value)} placeholder="Evidence record id" /><Input value={evidenceLabel} onChange={(event) => setEvidenceLabel(event.target.value)} placeholder="Evidence label" /></div>
          <div><Button onClick={() => void createAndSubmit()} disabled={state === "saving"}>{state === "saving" ? "Submitting…" : "Submit for provider review"}</Button></div>
          {state === "saved" && <p className="text-detail text-optimal">The recommendation is in the licensed review queue.</p>}
          {state === "error" && <p className="text-detail text-high">The recommendation was not submitted.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
