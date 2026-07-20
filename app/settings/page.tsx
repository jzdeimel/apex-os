"use client";

import { useStore } from "@/lib/store";
import { locations } from "@/lib/mock/locations";
import { staff } from "@/lib/mock/staff";
import { recommendationRules } from "@/lib/rules";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import {
  MapPin,
  Users,
  Tag,
  SlidersHorizontal,
  Plug,
  ShieldCheck,
  Building2,
  Video,
  RotateCcw,
} from "lucide-react";
import type { RecommendationCategory } from "@/lib/types";
import { AZURE_SERVICES } from "@/lib/azure/registry";

/**
 * Status wording. Kept here rather than in the registry because it is UI copy —
 * "adapter" is accurate but means nothing to someone reading a settings screen.
 */
const STATUS_LABEL: Record<string, string> = {
  wired: "Live",
  adapter: "Adapter",
  planned: "Planned",
};

const SERVICE_CATEGORIES: RecommendationCategory[] = [
  "Recovery / tissue support",
  "Metabolic / weight management",
  "Hormone optimization discussion",
  "Sleep / recovery support",
  "Libido / sexual wellness",
  "Skin / hair / aesthetics support",
  "Energy / mitochondrial support",
  "Inflammation / gut support",
  "Thyroid optimization discussion",
];

/**
 * Apex runs on Azure and nothing else.
 *
 * There is deliberately no CRM, no scheduling system and no marketing platform
 * in this list: Apex owns those records itself. The only entries here are Azure
 * platform services and the two genuine outside parties — the lab and the
 * fulfillment partner — which are contracts, not systems we sync a copy of our
 * data into.
 */

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label-eyebrow">{label}</p>
      <p className="mt-0.5 text-detail leading-relaxed text-ink-300">{value}</p>
    </div>
  );
}

export default function SettingsPage() {
  const { ruleEnabled, toggleRule, resetDemo } = useStore();

  return (
    <div className="space-y-5">
      <div>
        <p className="label-eyebrow">Configuration · demo environment</p>
        <h1 className="mt-1 font-display text-title font-bold tracking-tight text-ink-50">Settings</h1>
      </div>

      {/* Locations */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-4 w-4 text-gold-400" /> Locations</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {locations.map((l) => (
              <div key={l.id} className="rounded-xl border border-ink-800 bg-ink-900/40 p-4">
                <div className="flex items-center justify-between">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-ink-800 text-gold-400">
                    {l.type === "virtual" ? <Video className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                  </span>
                  <Badge tone={l.type === "virtual" ? "info" : "optimal"}>{l.type}</Badge>
                </div>
                <p className="mt-3 font-display text-body font-semibold text-ink-50">{l.short}</p>
                <p className="text-micro text-ink-500">{l.address ?? "Virtual care, all states served"}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Staff */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4 text-gold-400" /> Staff, coaches &amp; providers</CardTitle>
          <Badge>{staff.length} members</Badge>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {staff.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-800 text-detail font-semibold text-ink-200">{s.avatarInitials}</span>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-body font-medium text-ink-100">{s.name}{s.credentials ? `, ${s.credentials}` : ""}</span>
                  <span className="text-micro text-ink-500">{s.role} · {s.locationIds.length} location(s)</span>
                </div>
                {s.canApprove && (
                  <Badge tone="optimal"><ShieldCheck className="h-3 w-3" /> Can approve</Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Service categories */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Tag className="h-4 w-4 text-gold-400" /> Service categories</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {SERVICE_CATEGORIES.map((c) => <Badge key={c} tone="gold">{c}</Badge>)}
          </div>
        </CardContent>
      </Card>

      {/* Recommendation rules editor */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-gold-400" /> Recommendation rules editor</CardTitle>
          <p className="text-detail text-ink-500">Toggle which rules the engine evaluates. Every rule produces category-level, provider-approval-required recommendations — never dosing.</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {recommendationRules.map((r) => {
              const on = ruleEnabled[r.id] ?? r.enabled;
              return (
                <div key={r.id} className="rounded-xl border border-ink-800 bg-ink-900/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-body font-semibold text-ink-50">{r.name}</span>
                        <Badge tone={r.defaultRisk === "high" ? "high" : r.defaultRisk === "moderate" ? "watch" : "neutral"}>
                          {r.defaultRisk} risk
                        </Badge>
                        <Badge>conf {Math.round(r.defaultConfidence * 100)}%</Badge>
                      </div>
                      <p className="mt-1 text-detail text-ink-400">{r.description}</p>
                      <p className="mt-1.5 text-micro text-ink-500">
                        <span className="text-ink-400">Trigger:</span> {r.triggerSummary}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {r.candidateNames.map((c) => <Badge key={c} tone="info">{c}</Badge>)}
                      </div>
                    </div>
                    <button
                      role="switch"
                      aria-checked={on}
                      onClick={() => toggleRule(r.id)}
                      className={cn(
                        "relative h-6 w-11 shrink-0 rounded-full transition-colors focus-ring",
                        on ? "bg-gold-400" : "bg-ink-700",
                      )}
                    >
                      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-ink-950 transition-transform", on ? "translate-x-[22px]" : "translate-x-0.5")} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Platform */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-gold-400" /> Azure estate
          </CardTitle>
          <p className="mt-1 text-detail text-ink-500">
            Apex is the system of record and runs entirely on Azure. There is no CRM,
            scheduling platform or marketing tool to sync with — which is why no screen
            in Apex has ever shown you a &ldquo;last synced&rdquo; timestamp or a sync
            conflict to resolve.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Rendered from lib/azure/registry.ts rather than a hand-kept list, so
              this panel cannot drift from what the adapters actually claim. The
              status is deliberately honest: most of these are adapters, not live. */}
          {AZURE_SERVICES.map((svc) => (
            <details
              key={svc.id}
              className="group rounded-xl border border-ink-800 bg-ink-900/40 p-4 open:border-ink-700"
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3 focus-ring">
                <span className="min-w-0">
                  <span className="block text-body font-medium text-ink-100">{svc.name}</span>
                  <span className="mt-0.5 block text-micro leading-relaxed text-ink-500">
                    {svc.purpose}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Badge
                    tone={
                      svc.status === "wired"
                        ? "optimal"
                        : svc.status === "adapter"
                          ? "watch"
                          : "neutral"
                    }
                  >
                    {STATUS_LABEL[svc.status]}
                  </Badge>
                  {svc.baaCovered ? (
                    <span className="inline-flex items-center gap-1 text-micro text-optimal">
                      <ShieldCheck className="h-2.5 w-2.5" /> BAA
                    </span>
                  ) : (
                    <span className="text-micro text-ink-600">no PHI</span>
                  )}
                </span>
              </summary>
              <div className="mt-3 space-y-2 border-t border-ink-800 pt-3">
                <Fact label="What it does" value={svc.whatItDoes} />
                <Fact label="What we do now" value={svc.whatWeDoNow} />
                <Fact label="To go live" value={svc.toGoLive} />
              </div>
            </details>
          ))}
        </CardContent>
      </Card>

      {/* Demo controls */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><RotateCcw className="h-4 w-4 text-gold-400" /> Demo controls</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body text-ink-400">
            Your changes (approvals, favorites, tasks, toggles) persist across refreshes. Reset to return the demo to its original seeded state.
          </p>
          <Button variant="outline" onClick={resetDemo} className="shrink-0">
            <RotateCcw className="h-3.5 w-3.5" /> Reset demo data
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
