"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { automations } from "@/lib/mock/automations";
import { AutomationCard } from "@/components/AutomationCard";
import { DashboardCard } from "@/components/DashboardCard";
import { Disclaimer } from "@/components/Disclaimer";
import { Workflow, Zap, ZapOff, Send } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AutomationsPage() {
  const { automationEnabled } = useStore();
  const [filter, setFilter] = useState<"all" | "enabled" | "disabled">("all");

  const enabledCount = automations.filter((a) => automationEnabled[a.id] ?? a.enabled).length;
  const totalRuns = automations.reduce((s, a) => s + a.runsThisMonth, 0);

  const shown = useMemo(() => {
    return automations.filter((a) => {
      const on = automationEnabled[a.id] ?? a.enabled;
      if (filter === "enabled") return on;
      if (filter === "disabled") return !on;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, automationEnabled]);

  return (
    <div className="space-y-5">
      <div>
        <p className="label-eyebrow">Automation center · lifecycle messaging &amp; ops</p>
        <h1 className="mt-1 font-display text-title font-bold tracking-tight text-ink-50">Automations</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DashboardCard label="Total automations" value={automations.length} icon={<Workflow className="h-4 w-4" />} accent />
        <DashboardCard label="Enabled" value={enabledCount} icon={<Zap className="h-4 w-4" />} />
        <DashboardCard label="Disabled" value={automations.length - enabledCount} icon={<ZapOff className="h-4 w-4" />} />
        <DashboardCard label="Runs this month" value={totalRuns} icon={<Send className="h-4 w-4" />} delta="+8%" />
      </div>

      <Disclaimer compact />

      <div className="flex gap-2">
        {(["all", "enabled", "disabled"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3.5 py-1 text-detail font-medium capitalize transition-colors",
              filter === f
                ? "border-gold-400/40 bg-gold-400/10 text-gold-200"
                : "border-ink-700 text-ink-400 hover:text-ink-100",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((a) => (
          <AutomationCard key={a.id} automation={a} />
        ))}
      </div>
    </div>
  );
}
