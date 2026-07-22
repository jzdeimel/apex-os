"use client";

import { useState } from "react";
import { Lock, Plus, StickyNote, Boxes, Mail } from "lucide-react";
import { getClient, clientName } from "@/lib/mock/clients";
import { CallPatient } from "@/components/comms/CallPatient";
import { staffName } from "@/lib/mock/staff";
import { buildPlanOfCare } from "@/lib/planOfCare/engine";
import type { PlanItem } from "@/lib/planOfCare/types";
import { consultsForClient } from "@/lib/mock/consults";
import { ordersForClient } from "@/lib/mock/orders";
import { isStuck, clientFacingStatus, progressPercent } from "@/lib/orders/lifecycle";
import { contactLogForClient } from "@/lib/mock/contactLog";
import { ConsultComposer } from "@/components/consult/ConsultComposer";
import { ConsultCard } from "@/components/consult/ConsultCard";
import { ProvenanceDrawer, WhyButton } from "@/components/trace/ProvenanceDrawer";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  EmptyState,
} from "@/components/ui/primitives";
import { formatDateTime, currency } from "@/lib/utils";

/** Pinned demo clock, matching every other module. */
const NOW = "2026-06-12T09:00:00";

/**
 * The four tabs that close the biggest gap in the system Apex replaces.
 *
 * There, a coach cannot open the plan of care, the H&P or the intake form —
 * `canViewClinical` is restricted to MEDICAL and owners. The coach still has to
 * coach off that plan; the gate only forces them to phone someone to find out
 * what is in it.
 *
 * Every tab here renders identically for Coach and Medical. What narrows is
 * authorship, not reading — see lib/authz/capabilities.ts. The dose is the line.
 */

// ---------------------------------------------------------------------------
// Plan of Care — protocol + nutrition + training as one artifact
// ---------------------------------------------------------------------------
export function PlanTab({ id }: { id: string }) {
  const client = getClient(id);
  const [why, setWhy] = useState<PlanItem | null>(null);
  if (!client) return null;

  const plan = buildPlanOfCare(client);

  const sections: { key: string; label: string; items: PlanItem[]; note: string }[] = [
    {
      key: "protocol",
      label: "Protocol",
      items: plan.protocol,
      note: "Modality and cadence only — dose is set and signed by the provider.",
    },
    {
      key: "nutrition",
      label: "Nutrition",
      items: plan.nutrition,
      note: "Owned by the coach. No provider countersignature needed.",
    },
    {
      key: "training",
      label: "Training",
      items: plan.training,
      note: "Owned by the coach.",
    },
  ];

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="label-eyebrow">{plan.durationWeeks}-week block</p>
              <p className="mt-1.5 max-w-2xl text-body leading-relaxed text-ink-200">
                {plan.summary}
              </p>
            </div>
            <Badge
              tone={
                plan.status === "Active"
                  ? "optimal"
                  : plan.status === "Awaiting provider"
                    ? "watch"
                    : "neutral"
              }
            >
              {plan.status}
            </Badge>
          </div>

          {plan.macros && (
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-4">
              <MacroTile label="Daily target" value={plan.macros.calories.toLocaleString()} unit="kcal" />
              <MacroTile label="Protein" value={String(plan.macros.proteinG)} unit="g" />
              <MacroTile label="Carbs" value={String(plan.macros.carbsG)} unit="g" />
              <MacroTile label="Fat" value={String(plan.macros.fatG)} unit="g" />
              <p className="text-micro leading-relaxed text-ink-500 sm:col-span-4">
                {plan.macros.basis}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {sections.map((s) => (
        <Card key={s.key}>
          <CardHeader>
            <CardTitle>{s.label}</CardTitle>
            <p className="mt-1 text-micro text-ink-500">{s.note}</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {s.items.length === 0 ? (
              <EmptyState title={`No ${s.label.toLowerCase()} items`} />
            ) : (
              s.items.map((item) => (
                <div key={item.id} className="rounded-xl border border-ink-800 bg-ink-900/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-body font-medium text-ink-100">{item.title}</p>
                      <p className="mt-0.5 text-detail leading-relaxed text-ink-400">
                        {item.detail}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {item.requiresProviderApproval && <Badge tone="watch">Provider signs</Badge>}
                      <WhyButton onClick={() => setWhy(item)} />
                    </div>
                  </div>

                  {item.modality && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone="neutral">{item.modality}</Badge>
                      {item.cadence && <Badge tone="neutral">{item.cadence}</Badge>}
                      {/* The dose field does not exist on PlanItem. This chip is
                          the visible consequence of that structural decision. */}
                      <span className="inline-flex items-center gap-1 rounded-full border border-ink-700 bg-ink-800/60 px-2 py-0.5 text-micro text-ink-400">
                        <Lock className="h-3 w-3" /> Dose set by provider
                      </span>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Monitoring</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {plan.monitoring.map((m) => (
            <div
              key={m.week}
              className="flex items-start gap-3 rounded-lg border border-ink-800 bg-ink-900/40 px-4 py-2.5"
            >
              <span className="stat-mono mt-0.5 shrink-0 rounded-md border border-ink-700 bg-ink-800 px-2 py-0.5 text-micro text-ink-300">
                W{m.week}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body text-ink-100">{m.label}</p>
                <p className="mt-0.5 text-micro text-ink-500">{m.detail}</p>
              </div>
              <Badge
                tone={m.owner === "Provider" ? "optimal" : m.owner === "Coach" ? "gold" : "neutral"}
              >
                {m.owner}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <ProvenanceDrawer
        open={why !== null}
        onClose={() => setWhy(null)}
        title={why?.title ?? ""}
        provenance={plan.provenance}
        because={why?.because}
        ruleIds={why?.ruleIds}
        confidence={why?.confidence}
      />
    </div>
  );
}

function MacroTile({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900/40 px-3 py-2.5">
      <p className="label-eyebrow">{label}</p>
      <p className="mt-0.5">
        <span className="stat-mono text-heading font-semibold text-ink-50">{value}</span>
        <span className="ml-1 text-micro text-ink-500">{unit}</span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Consults
// ---------------------------------------------------------------------------
export function ConsultsTab({ id }: { id: string }) {
  const [composing, setComposing] = useState(false);
  const list = consultsForClient(id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body text-ink-400">
          <span className="stat-mono text-ink-200">{list.length}</span> consult
          {list.length === 1 ? "" : "s"} on record. Raw notes are kept immutable alongside every
          summary.
        </p>
        <Button variant="primary" size="sm" onClick={() => setComposing((v) => !v)}>
          <Plus className="h-3.5 w-3.5" />
          {composing ? "Close" : "New consult"}
        </Button>
      </div>

      {composing && <ConsultComposer clientId={id} onSigned={() => setComposing(false)} />}

      {list.length === 0 ? (
        <EmptyState
          icon={<StickyNote className="h-6 w-6" />}
          title="No consults yet"
          hint="Start one above."
        />
      ) : (
        <div className="space-y-3">
          {list.map((c, i) => (
            <ConsultCard key={c.id} consult={c} defaultOpen={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Orders — end-to-end status, which the current system cannot show past
// "has a tracking number"
// ---------------------------------------------------------------------------
export function OrdersTab({ id }: { id: string }) {
  const list = ordersForClient(id);

  if (list.length === 0) {
    return <EmptyState icon={<Boxes className="h-6 w-6" />} title="No orders" />;
  }

  return (
    <div className="space-y-3">
      {list.map((o) => {
        const stuck = isStuck(o, NOW);
        const total = o.lines.reduce((s, l) => s + l.unitPriceCents * l.qty, 0) / 100;
        return (
          <Card key={o.id}>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="stat-mono text-body text-ink-100">{o.id}</span>
                    <Badge
                      tone={stuck ? "high" : o.status === "Delivered" ? "optimal" : "neutral"}
                    >
                      {o.status}
                    </Badge>
                    {stuck && <Badge tone="high">Needs attention</Badge>}
                  </div>
                  <p className="mt-1.5 text-detail text-ink-400">
                    {o.lines.map((l) => `${l.name} x${l.qty}`).join(", ")}
                  </p>
                  <p className="mt-1 text-micro text-ink-500">{clientFacingStatus(o.status)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="stat-mono text-body text-ink-200">{currency(total)}</p>
                  {o.tracking && (
                    <p className="stat-mono mt-0.5 text-micro text-ink-500">{o.tracking}</p>
                  )}
                </div>
              </div>

              <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-ink-800">
                <div
                  className={`h-full rounded-full ${stuck ? "bg-high" : "bg-optimal"}`}
                  style={{ width: `${progressPercent(o.status)}%` }}
                />
              </div>

              {/* Every hop carries WHO moved it. The audited system's
                  statusHistory has no actor field at all. */}
              <div className="mt-2.5 space-y-1">
                {o.statusHistory.slice(-4).map((e, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 text-micro text-ink-500">
                    <span className="stat-mono">{formatDateTime(e.at)}</span>
                    <span className="text-ink-300">{e.status}</span>
                    <span>·</span>
                    <span>{e.actor}</span>
                    <span className="text-ink-500">({e.source})</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contact log — every touch, both directions
// ---------------------------------------------------------------------------
export function ContactTab({ id }: { id: string }) {
  const entries = contactLogForClient(id);
  const client = getClient(id);

  return (
    <div className="space-y-4">
      {/* Reach the patient — voice/video/text over ACS — above the log that
          records every attempt. */}
      <CallPatient clientId={id} />

      {entries.length === 0 ? (
        <EmptyState icon={<Mail className="h-6 w-6" />} title="No contact yet" />
      ) : (
        <ContactLogList entries={entries} client={client} />
      )}
    </div>
  );
}

function ContactLogList({
  entries,
  client,
}: {
  entries: ReturnType<typeof contactLogForClient>;
  client: ReturnType<typeof getClient>;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y divide-ink-800/60">
          {entries.slice(0, 40).map((e) => (
            <li key={e.id} className="flex items-start gap-3 p-4">
              {/* Inbound and outbound render differently. The audited system
                  renders every touch as an outbound coach bubble regardless of
                  direction, so client replies read as staff messages. */}
              <span
                className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-micro font-semibold ${
                  e.direction === "inbound"
                    ? "border-low/30 bg-low/12 text-low"
                    : "border-ink-700 bg-ink-800 text-ink-400"
                }`}
              >
                {e.direction === "inbound" ? "IN" : "OUT"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-body text-ink-100">
                    {e.direction === "inbound" && client
                      ? clientName(client)
                      : staffName(e.staffId)}
                  </span>
                  <Badge tone="neutral">{e.channel}</Badge>
                  <Badge
                    tone={
                      e.outcome === "Opted out" || e.outcome === "Bounced" ? "high" : "neutral"
                    }
                  >
                    {e.outcome}
                  </Badge>
                </div>
                {e.body && (
                  <p className="mt-1 text-detail leading-relaxed text-ink-300">{e.body}</p>
                )}
                <p className="mt-1 text-micro text-ink-600">
                  <span className="stat-mono">{formatDateTime(e.at)}</span> · consent:{" "}
                  {e.consentScopeUsed}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
