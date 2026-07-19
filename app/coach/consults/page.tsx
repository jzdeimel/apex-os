"use client";

import * as React from "react";
import Link from "next/link";
import { PenLine, CheckCircle2, FileText, MessageSquare, Phone, Video, User } from "lucide-react";
import type { Consult, ConsultChannel } from "@/lib/consult/types";
import { consults, unsignedConsultsFor } from "@/lib/mock/consults";
import { findingCount } from "@/lib/consult/summarize";
import { getClient, clientName } from "@/lib/mock/clients";
import { staffName } from "@/lib/mock/staff";
import { Badge, Button, EmptyState } from "@/components/ui/primitives";
import { Tabs } from "@/components/ui/Tabs";
import { FadeIn, Stagger, StaggerItem, SwitchView } from "@/components/motion";
import { Monogram } from "@/components/Monogram";
import { ME_COACH } from "@/components/coach/TodayQueue";
import { formatDateTime, relativeDays } from "@/lib/utils";

/**
 * Coach · Consults
 *
 * The signature queue. Every card shows the AI headline and a findings count so
 * the coach knows the size of the review before opening it — an unsigned intake
 * with fourteen findings is a different commitment than a four-line check-in,
 * and a queue that hides that difference gets worked in the wrong order.
 */

const CHANNEL_ICON: Record<ConsultChannel, React.ElementType> = {
  "In person": User,
  Phone: Phone,
  Video: Video,
  Messaging: MessageSquare,
};

function ConsultCard({ consult }: { consult: Consult }) {
  const client = getClient(consult.clientId);
  if (!client) return null;

  const summary = consult.finalSummary ?? consult.aiSummary;
  const findings = summary ? findingCount(summary) : 0;
  const signed = consult.status === "Signed";
  const ChannelIcon = CHANNEL_ICON[consult.channel];

  return (
    <div className="card card-hover p-4">
      <div className="flex items-start gap-3">
        <Monogram client={client} size="md" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/clients/${client.id}`}
              className="truncate text-sm font-medium text-ink-50 hover:text-gold-300 focus-ring rounded"
            >
              {clientName(client)}
            </Link>
            <Badge tone={signed ? "optimal" : "high"}>
              {signed ? <CheckCircle2 className="h-3 w-3" /> : <PenLine className="h-3 w-3" />}
              {signed ? "Signed" : consult.status}
            </Badge>
            <Badge tone="neutral">
              <ChannelIcon className="h-3 w-3" />
              {consult.kind}
            </Badge>
          </div>

          {/* The AI's own headline, verbatim. Never paraphrased in the queue —
              the coach must review what the engine actually wrote. */}
          {summary && (
            <p className="mt-2 text-sm leading-relaxed text-ink-200">{summary.headline}</p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-500">
            <span className="stat-mono">{formatDateTime(consult.startedAt)}</span>
            <span className="text-ink-700">·</span>
            <span className="stat-mono">{relativeDays(consult.startedAt)}</span>
            {consult.durationMin !== undefined && (
              <>
                <span className="text-ink-700">·</span>
                <span className="stat-mono">{consult.durationMin} min</span>
              </>
            )}
            <span className="text-ink-700">·</span>
            <span className="inline-flex items-center gap-1">
              <FileText className="h-3 w-3" />
              <span className="stat-mono">{findings}</span> finding{findings === 1 ? "" : "s"}
            </span>
            {consult.aiProvenance && (
              <>
                <span className="text-ink-700">·</span>
                <span className="stat-mono" title={`Input hash ${consult.aiProvenance.inputHash}`}>
                  {consult.aiProvenance.engine} v{consult.aiProvenance.engineVersion}
                </span>
              </>
            )}
            {signed && consult.signedBy && (
              <>
                <span className="text-ink-700">·</span>
                <span>signed by {staffName(consult.signedBy)}</span>
              </>
            )}
          </div>
        </div>

        <Link href={`/clients/${client.id}`} className="shrink-0">
          <Button size="sm" variant={signed ? "ghost" : "primary"}>
            {signed ? "View" : "Review"}
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function CoachConsultsPage() {
  const unsigned = React.useMemo(() => unsignedConsultsFor(ME_COACH), []);

  const recentlySigned = React.useMemo(
    () =>
      consults
        .filter((c) => c.authorId === ME_COACH && c.status === "Signed")
        .sort((a, b) => (b.signedAt ?? b.startedAt).localeCompare(a.signedAt ?? a.startedAt))
        .slice(0, 12),
    [],
  );

  const [tab, setTab] = React.useState("unsigned");
  const list = tab === "unsigned" ? unsigned : recentlySigned;

  return (
    <div className="space-y-6">
      <FadeIn>
        <p className="label-eyebrow">COACH CONSOLE</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink-50">
          Consults
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          Notes you have written and not yet signed, and the ones you have. Signed consults are
          immutable — corrections are addenda, never a silent rewrite.
        </p>
      </FadeIn>

      <FadeIn delay={0.05}>
        <Tabs
          tabs={[
            { id: "unsigned", label: "Awaiting your signature", count: unsigned.length },
            { id: "signed", label: "Recently signed", count: recentlySigned.length },
          ]}
          active={tab}
          onChange={setTab}
        />
      </FadeIn>

      <SwitchView k={tab}>
        {list.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="h-6 w-6" />}
            title={tab === "unsigned" ? "No consults awaiting signature" : "Nothing signed yet"}
            hint={
              tab === "unsigned"
                ? "Every chart you opened is closed."
                : "Signed consults will appear here with their provenance stamp."
            }
          />
        ) : (
          <Stagger className="space-y-2">
            {list.map((c) => (
              <StaggerItem key={c.id}>
                <ConsultCard consult={c} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </SwitchView>
    </div>
  );
}
