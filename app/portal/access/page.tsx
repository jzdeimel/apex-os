"use client";

/**
 * Who's seen my chart — the showpiece.
 *
 * HIPAA §164.528 already gives every patient the right to an accounting of
 * disclosures. In practice almost every clinic makes you submit a written
 * request, waits up to 60 days, and hands back a PDF. The data was always
 * there; the friction was the product decision.
 *
 * Apex logs reads as first-class ledger events (see lib/trace/ledger.ts —
 * `view`, `export` and `break-glass` are actions, not side effects), which
 * means this page is a query, not a compliance project. Shipping it as a
 * feature rather than a form is the entire point: a member who can see exactly
 * who opened their chart and why does not have to take "we take your privacy
 * seriously" on faith.
 */

import { useMemo, useState } from "react";
import { accessLogForSubject } from "@/lib/trace/ledger";
import type { LedgerRow } from "@/lib/trace/ledger";
import { shortHash } from "@/lib/trace/hash";
import { staffMap } from "@/lib/mock/staff";
import { Card, CardContent, Badge, EmptyState } from "@/components/ui/primitives";
import { Tabs } from "@/components/ui/Tabs";
import { Stagger, StaggerItem, SwitchView } from "@/components/motion";
import { formatDateTime, relativeDays, cn } from "@/lib/utils";
import { ME, PortalPageHeader } from "@/components/portal/PortalHeader";
import { Eye, Download, ShieldAlert, Fingerprint, ScrollText } from "lucide-react";

/** Pinned clock — "this month" has to mean the same thing forever. */
const NOW = "2026-06-12T09:00:00";
const THIS_MONTH = NOW.slice(0, 7); // "2026-06"

type Filter = "all" | "month" | "emergency";

/** Internal entity names are jargon. Say what was actually opened. */
const WHAT: Record<string, string> = {
  chart: "Your full chart",
  lab: "Your lab results",
  note: "A visit note",
  recommendation: "Your plan recommendations",
  protocol: "Your protocol",
  order: "An order or refill",
  consent: "Your consent settings",
};

const ACTION_COPY: Record<string, { verb: string; icon: typeof Eye; tone: "neutral" | "watch" | "high" }> = {
  view: { verb: "Opened", icon: Eye, tone: "neutral" },
  export: { verb: "Downloaded a copy of", icon: Download, tone: "watch" },
  "break-glass": { verb: "Used emergency access on", icon: ShieldAlert, tone: "high" },
};

export default function PortalAccessPage() {
  const [filter, setFilter] = useState<Filter>("all");

  // The ledger is the source of truth; nothing here is a separate "audit copy"
  // that could drift from what actually happened.
  const all = useMemo(() => accessLogForSubject(ME), []);

  const rows = useMemo(() => {
    if (filter === "month") return all.filter((r) => r.at.slice(0, 7) === THIS_MONTH);
    if (filter === "emergency") return all.filter((r) => r.action === "break-glass");
    return all;
  }, [all, filter]);

  const monthCount = all.filter((r) => r.at.slice(0, 7) === THIS_MONTH).length;
  const emergencyCount = all.filter((r) => r.action === "break-glass").length;
  const people = new Set(all.map((r) => r.actorId)).size;

  return (
    <div className="space-y-6">
      <PortalPageHeader
        eyebrow="Privacy"
        title="Who's seen my chart"
        subtitle="Every single time someone at Alpha Health opened your record — who, when, what they looked at, and why."
      />

      {/* The honest explainer. Not a disclaimer — a claim we then back up. */}
      <div className="rounded-2xl border border-optimal/20 bg-optimal/[0.06] p-5">
        <div className="flex items-start gap-3">
          <ScrollText className="mt-0.5 h-5 w-5 shrink-0 text-optimal" />
          <div>
            <p className="text-sm font-medium text-ink-50">
              You have always had a legal right to this. Most places just make it hard.
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-300">
              Federal privacy law gives you the right to an accounting of who has accessed your health
              information. At almost every clinic you exercise it by filing a written request and waiting —
              often up to <span className="stat-mono">60</span> days — for a printout. The record existed the
              whole time; you just could not see it.
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-300">
              Apex writes every read to an append-only, tamper-evident log at the moment it happens, so this
              page is simply that log filtered to you. No request, no waiting, no PDF. If a name on this list
              surprises you, ask us about it — that is what it is for.
            </p>
          </div>
        </div>
      </div>

      {/* Counts -------------------------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Times opened, all time", value: all.length, tone: "neutral" as const },
          { label: "This month", value: monthCount, tone: "neutral" as const },
          { label: "People who looked", value: people, tone: "neutral" as const },
          { label: "Emergency access", value: emergencyCount, tone: emergencyCount ? ("high" as const) : ("optimal" as const) },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <p className="text-[11px] uppercase tracking-wide text-ink-500">{k.label}</p>
              <p
                className={cn(
                  "stat-mono mt-1 text-3xl font-semibold",
                  k.tone === "high" ? "text-high" : "text-ink-50",
                )}
              >
                {k.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Break-glass explainer, shown only when there is one to explain. */}
      {emergencyCount > 0 && (
        <div className="rounded-2xl border border-high/30 bg-high/10 p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-high" />
            <div>
              <p className="text-sm font-medium text-ink-50">
                What &ldquo;emergency access&rdquo; means, in plain terms
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-300">
                Normally a clinician can only open the charts they are assigned to. Emergency access is a
                deliberate override for the case where that rule would hurt you — you are in front of someone
                who is not on your care team and they need your history now.
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-300">
                It is never silent. Using it requires a typed reason, it is flagged red in your record and in
                ours, it is reviewed by our privacy officer, and it appears on this page immediately —{" "}
                <span className="text-ink-100">including to you</span>. If you see one below and the reason
                does not match your memory of that day, that is worth a conversation.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filter -------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={[
            { id: "all", label: "All access", count: all.length },
            { id: "month", label: "This month", count: monthCount },
            { id: "emergency", label: "Emergency access", count: emergencyCount },
          ]}
          active={filter}
          onChange={(id) => setFilter(id as Filter)}
        />
        <p className="text-xs text-ink-500">
          Showing <span className="stat-mono text-ink-300">{rows.length}</span> of{" "}
          <span className="stat-mono text-ink-300">{all.length}</span>
        </p>
      </div>

      {/* The log -------------------------------------------------------------- */}
      <SwitchView k={filter}>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Eye className="h-6 w-6" />}
            title={filter === "emergency" ? "No emergency access on your record" : "Nothing in this window"}
            hint={
              filter === "emergency"
                ? "Nobody has ever needed to override the normal rules to see your chart."
                : "Try widening the filter to all access."
            }
          />
        ) : (
          <Stagger className="space-y-2">
            {rows.map((row) => (
              <StaggerItem key={row.id}>
                <AccessRow row={row} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </SwitchView>

      <p className="text-[11px] leading-relaxed text-ink-500">
        Each entry is sealed with a cryptographic fingerprint that includes the one before it. Altering or
        deleting any single line would break every line after it, which is what makes this a record rather
        than a claim.
      </p>
    </div>
  );
}

function AccessRow({ row }: { row: LedgerRow }) {
  const meta = ACTION_COPY[row.action] ?? ACTION_COPY.view;
  const Icon = meta.icon;
  const emergency = row.action === "break-glass";
  const person = staffMap[row.actorId];

  return (
    <div
      className={cn(
        "hairline rounded-xl p-4",
        emergency ? "border-high/40 bg-high/[0.07]" : "bg-ink-900/50",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
            emergency ? "bg-high/20 text-high" : "bg-ink-800 text-ink-400",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className="text-sm font-medium text-ink-50">{row.actorName}</p>
            <span className="text-[11px] uppercase tracking-wide text-ink-500">
              {person?.role ?? row.actorRole}
              {person?.credentials ? ` · ${person.credentials}` : ""}
            </span>
            {emergency && <Badge tone="high">Emergency access</Badge>}
          </div>

          <p className="mt-1 text-sm text-ink-300">
            {meta.verb} <span className="text-ink-100">{WHAT[row.entity] ?? "part of your record"}</span>
          </p>

          {row.reason && (
            <p className="mt-2 text-xs leading-relaxed text-ink-400">
              <span className="text-ink-500">Reason given: </span>
              <span className={cn(emergency && "text-high")}>{row.reason}</span>
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <p className="stat-mono text-xs text-ink-200">{formatDateTime(row.at)}</p>
          <p className="text-[10px] text-ink-600">{relativeDays(row.at)}</p>
          <p className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-ink-600">
            <Fingerprint className="h-3 w-3" />
            <span className="stat-mono">{shortHash(row.hash)}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
