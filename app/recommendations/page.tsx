"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { seededRecommendations } from "@/lib/mock/recommendations";
import { getClient } from "@/lib/mock/clients";
import { providers, staffName } from "@/lib/mock/staff";
import { locations } from "@/lib/mock/locations";
import { RecommendationCard } from "@/components/RecommendationCard";
import { DashboardCard } from "@/components/DashboardCard";
import { Select, Button, Badge, EmptyState } from "@/components/ui/primitives";
import { Disclaimer } from "@/components/Disclaimer";
import { Sparkles, ShieldCheck, Clock, Lock } from "lucide-react";
import type { RecommendationStatus, RiskLevel } from "@/lib/types";

export default function RecommendationsPage() {
  const { locationFilter, recStatus, setRecStatus, role } = useStore();
  const [risk, setRisk] = useState<string>("all");
  const [provider, setProvider] = useState<string>("all");
  const [status, setStatus] = useState<string>("pending");

  const liveStatus = (recId: string, fallback: RecommendationStatus) => recStatus[recId] ?? fallback;

  const filtered = useMemo(() => {
    return seededRecommendations.filter((r) => {
      const client = getClient(r.clientId);
      if (!client) return false;
      if (locationFilter !== "all" && client.locationId !== locationFilter) return false;
      if (risk !== "all" && r.riskLevel !== risk) return false;
      if (provider !== "all" && client.providerId !== provider) return false;
      const s = liveStatus(r.id, r.status);
      if (status === "pending" && !(s === "draft" || s === "coach reviewed")) return false;
      if (status !== "pending" && status !== "all" && s !== status) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationFilter, risk, provider, status, recStatus]);

  const stats = useMemo(() => {
    const all = seededRecommendations.map((r) => liveStatus(r.id, r.status));
    return {
      total: seededRecommendations.length,
      pending: all.filter((s) => s === "draft" || s === "coach reviewed").length,
      approved: all.filter((s) => s === "provider approved").length,
      highRisk: seededRecommendations.filter(
        (r) => r.riskLevel === "high" || r.riskLevel === "moderate",
      ).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recStatus]);

  const bulkApprove = () => {
    if (role !== "Medical") return;
    filtered.forEach((r) => setRecStatus(r.id, "provider approved"));
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="label-eyebrow">Global review queue · human approval required</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink-50">Recommendations</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DashboardCard label="Total generated" value={stats.total} icon={<Sparkles className="h-4 w-4" />} accent />
        <DashboardCard label="Pending approval" value={stats.pending} icon={<Clock className="h-4 w-4" />} hint="Draft + coach reviewed" />
        <DashboardCard label="Provider approved" value={stats.approved} icon={<ShieldCheck className="h-4 w-4" />} />
        <DashboardCard label="Mod/high risk" value={stats.highRisk} icon={<Lock className="h-4 w-4" />} />
      </div>

      <Disclaimer />

      {/* Filters + bulk */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid flex-1 grid-cols-2 gap-2.5 sm:grid-cols-3 lg:max-w-2xl">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">Pending approval</option>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="coach reviewed">Coach reviewed</option>
            <option value="provider approved">Provider approved</option>
            <option value="declined">Declined</option>
          </Select>
          <Select value={risk} onChange={(e) => setRisk(e.target.value)}>
            <option value="all">All risk levels</option>
            {(["none", "low", "moderate", "high"] as RiskLevel[]).map((r) => (
              <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)} risk</option>
            ))}
          </Select>
          <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="all">All providers</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{staffName(p.id)}</option>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Badge>{filtered.length} in queue</Badge>
          <Button
            variant="primary"
            size="sm"
            disabled={role !== "Medical" || filtered.length === 0}
            onClick={bulkApprove}
            title={role === "Medical" ? "Approve all filtered recommendations" : "Switch to the Medical role to bulk approve"}
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Bulk approve filtered
          </Button>
        </div>
      </div>

      {role !== "Medical" && (
        <p className="text-xs text-ink-500">
          You are viewing as <span className="text-ink-300">{role}</span>. Switch to{" "}
          <span className="text-gold-300">Provider</span> (top bar) to approve recommendations.
        </p>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={<Sparkles className="h-6 w-6" />} title="No recommendations match these filters" hint="Try widening the status or location filters." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((r) => (
            <RecommendationCard key={r.id} rec={r} showClient />
          ))}
        </div>
      )}

      {/* Locations covered footnote */}
      <p className="text-[11px] text-ink-600">
        Queue spans {locations.length} locations. Every recommendation is AI-assisted and requires
        review and approval by a licensed provider before any clinical action.
      </p>
    </div>
  );
}
