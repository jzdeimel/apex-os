"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FileCheck2, Loader2, Save } from "lucide-react";

import { Badge, Button, Select, Textarea } from "@/components/ui/primitives";

type ClinicalNote = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

const EMPTY_NOTE: ClinicalNote = {
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
};

export function AuthoritativeConsultNote({ clientId }: { clientId: string }) {
  const [role, setRole] = useState<"Coach" | "Medical" | null>(null);
  const [kinds, setKinds] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [kind, setKind] = useState("");
  const [channel, setChannel] = useState("");
  const [rawNotes, setRawNotes] = useState("");
  const [clinicalNote, setClinicalNote] = useState<ClinicalNote>(EMPTY_NOTE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [signedId, setSignedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/consults/draft?clientId=${encodeURIComponent(clientId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error || "The note workspace is unavailable.");
        if (!active) return;
        const allowedKinds = Array.isArray(payload.allowedKinds) ? payload.allowedKinds : [];
        const allowedChannels = Array.isArray(payload.allowedChannels) ? payload.allowedChannels : [];
        setRole(payload.authorRole);
        setKinds(allowedKinds);
        setChannels(allowedChannels);
        setKind(payload.draft?.kind || payload.suggestedKind || allowedKinds[0] || "");
        setChannel(payload.draft?.channel || payload.suggestedChannel || allowedChannels[0] || "");
        setRawNotes(payload.draft?.rawNotes || "");
        setClinicalNote(payload.draft?.clinicalNote || EMPTY_NOTE);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "The note workspace is unavailable.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [clientId]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/consults/draft", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          kind,
          channel,
          rawNotes,
          clinicalNote: role === "Medical" ? clinicalNote : undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The note was not saved.");
      setSaved(true);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The note was not saved.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function sign() {
    setBusy(true);
    setError(null);
    try {
      const saveResponse = await fetch("/api/consults/draft", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          kind,
          channel,
          rawNotes,
          clinicalNote: role === "Medical" ? clinicalNote : undefined,
        }),
      });
      const savedPayload = await saveResponse.json();
      if (!saveResponse.ok || !savedPayload.ok) throw new Error(savedPayload.error || "The note was not saved.");
      const response = await fetch("/api/consults/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The note was not signed.");
      setSignedId(payload.consultId);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The note was not signed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 py-8 text-detail text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading durable note workspace…</div>;
  }
  if (signedId) {
    return (
      <div className="rounded-panel border border-optimal/30 bg-optimal/5 p-5">
        <CheckCircle2 className="h-6 w-6 text-optimal" />
        <h2 className="mt-2 font-display text-heading text-ink-50">Visit note signed</h2>
        <p className="mt-1 text-detail text-ink-300">
          The immutable record and audit witness were committed together as <span className="stat-mono">{signedId}</span>.
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-panel border border-ink-700 bg-ink-900/30 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label-eyebrow">{role === "Medical" ? "MEDICAL VISIT NOTE" : "COACH CONSULT NOTE"}</p>
          <h2 className="mt-1 font-display text-heading text-ink-50">Document this visit</h2>
          <p className="mt-1 max-w-3xl text-detail text-ink-400">
            Drafts save in Apex PostgreSQL. Signing makes the note immutable and records the signer in the audit ledger.
          </p>
        </div>
        <Badge tone="optimal">DATABASE-BACKED</Badge>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-detail text-ink-300">
          Visit type
          <Select className="mt-1" value={kind} onChange={(event) => { setKind(event.target.value); setSaved(false); }}>
            {kinds.map((value) => <option key={value}>{value}</option>)}
          </Select>
        </label>
        <label className="text-detail text-ink-300">
          Channel
          <Select className="mt-1" value={channel} onChange={(event) => { setChannel(event.target.value); setSaved(false); }}>
            {channels.map((value) => <option key={value}>{value}</option>)}
          </Select>
        </label>
      </div>

      <label className="mt-4 block text-detail text-ink-300">
        Visit narrative
        <Textarea
          className="mt-1 min-h-40"
          value={rawNotes}
          onChange={(event) => { setRawNotes(event.target.value); setSaved(false); }}
          maxLength={50_000}
          placeholder="Write the visit notes, decisions, questions, follow-up, and client context."
        />
      </label>

      {role === "Medical" && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {(["subjective", "objective", "assessment", "plan"] as const).map((field) => (
            <label key={field} className="text-detail capitalize text-ink-300">
              {field}
              <Textarea
                className="mt-1 min-h-28"
                value={clinicalNote[field]}
                onChange={(event) => {
                  setClinicalNote((current) => ({ ...current, [field]: event.target.value }));
                  setSaved(false);
                }}
                maxLength={50_000}
              />
            </label>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-control border border-watch/25 bg-watch/5 p-3 text-detail text-ink-400">
        AI synthesis and microphone transcription stay off on this production-like surface until an approved model and transcription provider are configured. No scripted summary is presented as AI.
      </div>
      {error && <p className="mt-4 rounded-control border border-high/30 bg-high/5 p-3 text-detail text-high" role="alert">{error}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => void save()} disabled={busy || !rawNotes.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saved ? "Saved" : "Save draft"}
        </Button>
        <Button onClick={() => void sign()} disabled={busy || !rawNotes.trim()}>
          <FileCheck2 className="h-4 w-4" /> Sign note
        </Button>
      </div>
    </section>
  );
}
