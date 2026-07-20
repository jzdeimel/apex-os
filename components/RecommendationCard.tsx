"use client";
import { appendLedger } from "@/lib/trace/ledger";
import { VIEWER } from "@/lib/viewer";

import { useState } from "react";
import Link from "next/link";
import type { Recommendation } from "@/lib/types";
import { useStore } from "@/lib/store";
import { RecStatusBadge } from "@/components/StatusBadge";
import { RiskBadge } from "@/components/RiskBadge";
import { AiLabel } from "@/components/Disclaimer";
import { Button, Badge } from "@/components/ui/primitives";
import { getClient, clientName } from "@/lib/mock/clients";
import { PeptideIcon } from "@/components/PeptideIcon";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  Package,
  PackageX,
  ChevronDown,
  StickyNote,
  ListPlus,
  Target,
  FlaskConical,
  Activity,
  Lock,
} from "lucide-react";

export function RecommendationCard({
  rec,
  showClient = false,
  defaultOpen = false,
}: {
  rec: Recommendation;
  showClient?: boolean;
  defaultOpen?: boolean;
}) {
  const { recStatus, setRecStatus, role, addNote, addTask } = useStore();
  const status = recStatus[rec.id] ?? rec.status;
  const [open, setOpen] = useState(defaultOpen);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  const client = getClient(rec.clientId);
  const canApprove = role === "Medical";
  const confidencePct = Math.round(rec.confidence * 100);
  const flaggedContra = rec.contraindicationChecks.filter((c) => !c.passed);

  const toast = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2200);
  };

  return (
    <div className="card card-hover overflow-hidden">
      <div className="p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <Badge tone="gold">{rec.category}</Badge>
              <AiLabel />
            </div>
            <h3 className="font-display text-body font-semibold text-ink-50">{rec.title}</h3>
            {showClient && client && (
              <Link href={`/clients/${client.id}`} className="mt-0.5 inline-block text-detail text-ink-400 hover:text-gold-300">
                {clientName(client)} · {client.age}
                {client.sex === "male" ? "M" : "F"}
              </Link>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <RecStatusBadge status={status} />
            <RiskBadge level={rec.riskLevel} />
          </div>
        </div>

        {/* Rationale */}
        <p className="mt-3 text-body leading-relaxed text-ink-300">
          <span className="font-medium text-ink-200">Why: </span>
          {rec.rationale}
        </p>

        {/* Confidence + approval requirement */}
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2">
            <div className="flex items-center justify-between text-detail">
              <span className="text-ink-400">Confidence</span>
              <span className="stat-mono font-semibold text-ink-100">{confidencePct}%</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
              <div
                className={cn(
                  "h-full rounded-full",
                  confidencePct >= 78 ? "bg-optimal" : confidencePct >= 65 ? "bg-gold-400" : "bg-low",
                )}
                style={{ width: `${confidencePct}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-gold-400/25 bg-gold-400/[0.06] px-3 py-2 text-detail text-gold-200">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            Requires provider approval
          </div>
        </div>

        {/* Triggered by */}
        <div className="mt-3">
          <span className="label-eyebrow">Triggered by</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {rec.triggeredBy.map((t) => (
              <Badge key={t} tone="info">{t}</Badge>
            ))}
          </div>
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-3 flex w-full items-center justify-between rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2 text-detail font-medium text-ink-300 hover:text-ink-100"
        >
          <span>{open ? "Hide" : "Show"} supporting evidence, candidates & contraindication checks</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>

        {open && (
          <div className="mt-3 grid grid-cols-1 gap-3 animate-fade-in lg:grid-cols-2">
            {/* Supporting evidence */}
            <div className="rounded-xl border border-ink-800 bg-ink-900/40 p-3">
              <span className="label-eyebrow">Supporting</span>
              <div className="mt-2 space-y-2 text-detail">
                {rec.supporting.goals.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-400" />
                    <span className="text-ink-300">Goals: {rec.supporting.goals.join(", ")}</span>
                  </div>
                )}
                {rec.supporting.symptoms.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-low" />
                    <span className="text-ink-300">Symptoms: {rec.supporting.symptoms.join(", ")}</span>
                  </div>
                )}
                {rec.supporting.labs.length > 0 && (
                  <div className="flex items-start gap-2">
                    <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-watch" />
                    <div className="space-y-0.5 text-ink-300">
                      {rec.supporting.labs.map((l) => (
                        <div key={l.name}>
                          {l.name}: <span className="stat-mono">{l.value}</span>{" "}
                          <span className="text-ink-500">({l.status})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {rec.supporting.goals.length === 0 &&
                  rec.supporting.symptoms.length === 0 &&
                  rec.supporting.labs.length === 0 && (
                    <p className="text-ink-500">Goal-based recommendation; no abnormal labs required.</p>
                  )}
              </div>
            </div>

            {/* Candidate protocols + inventory */}
            <div className="rounded-xl border border-ink-800 bg-ink-900/40 p-3">
              <span className="label-eyebrow">Candidate options (no dosing)</span>
              <div className="mt-2 space-y-1.5">
                {rec.candidates.map((c) => (
                  <div key={c.name} className="flex items-center justify-between gap-2 text-detail">
                    <span className="flex items-center gap-2 text-ink-200">
                      <PeptideIcon name={c.name} size="xs" />
                      {c.name}
                    </span>
                    {c.inventoryAvailable === null ? (
                      <Badge>Service</Badge>
                    ) : c.inventoryAvailable ? (
                      <span className="inline-flex items-center gap-1 text-optimal">
                        <Package className="h-3 w-3" /> In stock
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-high">
                        <PackageX className="h-3 w-3" /> Reorder
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Contraindication checks */}
            <div className="rounded-xl border border-ink-800 bg-ink-900/40 p-3 lg:col-span-2">
              <span className="label-eyebrow">Contraindication checks</span>
              <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {rec.contraindicationChecks.map((c) => (
                  <div key={c.label} className="flex items-start gap-2 text-detail">
                    {c.passed ? (
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-optimal" />
                    ) : (
                      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-high" />
                    )}
                    <span className={c.passed ? "text-ink-300" : "text-high"}>
                      <span className="font-medium">{c.label}:</span> {c.note}
                    </span>
                  </div>
                ))}
              </div>
              {flaggedContra.length > 0 && (
                <p className="mt-2 text-micro text-high">
                  {flaggedContra.length} flag(s) require provider attention before any plan.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Suggested next step */}
        <div className="mt-3 rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2 text-detail">
          <span className="font-medium text-ink-200">Suggested next step: </span>
          <span className="text-ink-400">{rec.suggestedNextStep}</span>
        </div>

        {/* Note composer */}
        {noteOpen && (
          <div className="mt-3 animate-fade-in">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a coach/provider note for this recommendation…"
              rows={2}
              className="w-full rounded-lg border border-ink-700 bg-ink-900/70 px-3 py-2 text-body text-ink-100 placeholder:text-ink-500 focus-ring"
            />
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="primary"
                disabled={!noteText.trim()}
                onClick={() => {
                  addNote({
                    clientId: rec.clientId,
                    author: role === "Medical" ? "Provider" : "Coach",
                    body: `[${rec.title}] ${noteText.trim()}`,
                  });
                  setNoteText("");
                  setNoteOpen(false);
                  toast("Note added to client chart");
                }}
              >
                Save note
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNoteOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="success"
            disabled={!canApprove || status === "provider approved"}
            title={canApprove ? "" : "Switch to the Medical role to approve"}
            onClick={() => {
              setRecStatus(rec.id, "provider approved");
              toast("Approved by provider");
            }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
          </Button>
          {/*
            AUDIT 2.2: Decline was ungated while Approve required Medical, and it
            wrote NO ledger row. Declining a pending TRT recommendation is the
            negative half of a clinical sign-off — the decision that a patient
            does not get a therapy — and it was available to anyone and left no
            trace. Both halves of a signature belong to the same role, and both
            belong in the audit chain.
          */}
          <Button
            size="sm"
            variant="danger"
            disabled={!canApprove || status === "declined"}
            title={!canApprove ? "Declining a clinical recommendation is a provider decision." : undefined}
            onClick={() => {
              const row = appendLedger({
                actorId: VIEWER.id,
                actorName: VIEWER.name,
                actorRole: role,
                action: "deny",
                entity: "recommendation",
                entityId: rec.id,
                subjectId: rec.clientId,
                reason: "Recommendation declined by provider",
                before: { status },
                after: { status: "declined" },
              });
              setRecStatus(rec.id, "declined");
              toast(`Recommendation declined · ledger ${row.id}`);
            }}
          >
            <XCircle className="h-3.5 w-3.5" /> Decline
          </Button>
          {status === "draft" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setRecStatus(rec.id, "coach reviewed");
                toast("Marked coach reviewed");
              }}
            >
              Mark coach reviewed
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setNoteOpen((o) => !o)}>
            <StickyNote className="h-3.5 w-3.5" /> Add Note
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              addTask({
                clientId: rec.clientId,
                type: "Provider approval needed",
                title: `Provider approval needed — ${client ? clientName(client) : rec.clientId}: ${rec.title}`,
                assigneeId: client?.providerId ?? "st-001",
                dueDate: "2026-06-14T12:00:00",
                priority: "high",
                done: false,
              });
              toast("Task created");
            }}
          >
            <ListPlus className="h-3.5 w-3.5" /> Create Task
          </Button>
          {flash && <span className="ml-auto text-detail text-optimal animate-fade-in">{flash}</span>}
        </div>
      </div>
    </div>
  );
}
