"use client";

import type { Automation } from "@/lib/types";
import { useStore } from "@/lib/store";
import { Badge } from "@/components/ui/primitives";
import { formatDateTime, cn } from "@/lib/utils";
import { MessageSquare, Mail, Bell, ListChecks, Zap } from "lucide-react";

const CHANNEL_ICON = {
  SMS: MessageSquare,
  Email: Mail,
  "In-App": Bell,
  Task: ListChecks,
};

export function AutomationCard({ automation }: { automation: Automation }) {
  const { automationEnabled, toggleAutomation } = useStore();
  const enabled = automationEnabled[automation.id] ?? automation.enabled;
  const Icon = CHANNEL_ICON[automation.channel];

  return (
    <div className={cn("card card-hover p-5", enabled && "border-ink-700")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
              enabled ? "bg-gold-400/15 text-gold-300" : "bg-ink-800 text-ink-500",
            )}
          >
            <Zap className="h-[18px] w-[18px]" />
          </span>
          <div>
            <h3 className="font-display text-body font-semibold text-ink-50">{automation.name}</h3>
            <p className="mt-0.5 text-detail leading-relaxed text-ink-400">{automation.description}</p>
          </div>
        </div>

        {/* Toggle */}
        <button
          role="switch"
          aria-checked={enabled}
          onClick={() => toggleAutomation(automation.id)}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors focus-ring",
            enabled ? "bg-gold-400" : "bg-ink-700",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-5 w-5 rounded-full bg-ink-950 transition-transform",
              enabled ? "translate-x-[22px]" : "translate-x-0.5",
            )}
          />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-detail">
        <Meta label="Trigger" value={automation.trigger} />
        <Meta label="Audience" value={automation.audience} />
        <Meta
          label="Channel"
          value={
            <span className="inline-flex items-center gap-1">
              <Icon className="h-3 w-3 text-gold-400" /> {automation.channel}
            </span>
          }
        />
        <Meta label="Runs / month" value={<span className="stat-mono">{automation.runsThisMonth}</span>} />
        <Meta label="Last run" value={formatDateTime(automation.lastRun)} />
        <Meta label="Next run" value={enabled ? formatDateTime(automation.nextRun) : "Paused"} />
      </div>

      <div className="mt-4 rounded-lg border border-ink-800 bg-ink-900/50 p-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="label-eyebrow">Message preview</span>
          <Badge tone={enabled ? "optimal" : "neutral"}>{enabled ? "Enabled" : "Disabled"}</Badge>
        </div>
        <p className="text-detail italic leading-relaxed text-ink-400">“{automation.previewMessage}”</p>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="block text-micro uppercase tracking-wide text-ink-600">{label}</span>
      <span className="text-ink-200">{value}</span>
    </div>
  );
}
