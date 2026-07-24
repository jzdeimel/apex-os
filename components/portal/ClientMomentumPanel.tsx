"use client";

import type { ElementType } from "react";
import Link from "next/link";
import { ArrowRight, FlaskConical, MessageSquare, Package, Sparkles, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import type { Client } from "@/lib/types";
import { timelineForClient } from "@/lib/mock/timeline";
import { getLabsForClient } from "@/lib/mock/labs";
import { ordersForClient } from "@/lib/mock/orders";
import { topMoments } from "@/lib/engage/moments";
import { Card, CardContent, Badge } from "@/components/ui/primitives";
import { cn, formatDateShort } from "@/lib/utils";

const TYPE_ICON: Record<string, ElementType> = {
  "Lead created": Sparkles,
  "Consult booked": MessageSquare,
  "Intake submitted": MessageSquare,
  "Labs ordered": FlaskConical,
  "Results received": FlaskConical,
  "Body scan completed": TrendingUp,
  "AI recommendations generated": Sparkles,
  "Coach reviewed": MessageSquare,
  "Provider approved": Sparkles,
  "Follow-up scheduled": MessageSquare,
};

const LAB_STATUS_LABEL: Record<string, string> = {
  optimal: "in range",
  watch: "watch",
  high: "above lane",
  low: "below lane",
};

function distanceFromOptimal(marker: { value: number; optimalLow?: number; optimalHigh?: number }) {
  if (marker.optimalLow === undefined || marker.optimalHigh === undefined) return 0;
  if (marker.value >= marker.optimalLow && marker.value <= marker.optimalHigh) return 0;
  return marker.value < marker.optimalLow ? marker.optimalLow - marker.value : marker.value - marker.optimalHigh;
}

function labMoves(clientId: string) {
  const lab = getLabsForClient(clientId);
  if (!lab) return [];
  return lab.biomarkers
    .map((marker) => {
      const history = marker.history ?? [];
      const first = history[0];
      const last = history[history.length - 1];
      const before = first ? { ...marker, value: first.value } : marker;
      const after = last ? { ...marker, value: last.value } : marker;
      const improved = distanceFromOptimal(after) < distanceFromOptimal(before);
      const delta = last && first ? Math.round((last.value - first.value) * 10) / 10 : 0;
      return { marker, improved, delta };
    })
    .filter((x) => x.marker.status !== "optimal" || x.improved)
    .sort((a, b) => Number(b.improved) - Number(a.improved) || Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 4);
}

export function ClientMomentumPanel({ client }: { client: Client }) {
  const events = timelineForClient(client.id).slice(0, 5);
  const labs = labMoves(client.id);
  const order = ordersForClient(client.id).find((o) => o.visibleToClient);
  const moments = topMoments(client.id, 2);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_0.9fr]">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="label-eyebrow">Momentum timeline</p>
              <h2 className="mt-1 font-display text-title text-ink-50">Recent record movement</h2>
            </div>
            <Badge tone="gold">{events.length} recent milestones</Badge>
          </div>

          <div className="mt-5 space-y-3">
            {events.map((event, index) => {
              const Icon = TYPE_ICON[event.type] ?? Sparkles;
              return (
                <motion.div
                  key={event.id}
                  className="grid grid-cols-[2rem_1fr] gap-3"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.32, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="relative grid place-items-center">
                    {index < events.length - 1 && (
                      <span className="absolute top-7 h-[calc(100%+0.25rem)] w-px bg-ink-800" aria-hidden />
                    )}
                    <span className="relative grid h-8 w-8 place-items-center rounded-lg border border-ink-700 bg-ink-900 text-gold-300">
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="min-w-0 pb-2">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <p className="text-body font-semibold text-ink-50">{event.type}</p>
                      <span className="stat-mono text-micro text-ink-500">{formatDateShort(event.at)}</span>
                    </div>
                    <p className="mt-1 text-detail leading-snug text-ink-400">{event.detail}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-low" />
              <div className="min-w-0">
                <p className="label-eyebrow">Lab summary</p>
                <h3 className="mt-1 font-display text-heading font-semibold text-ink-50">
                  Markers grouped for discussion
                </h3>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {labs.map(({ marker, improved, delta }) => (
                <div key={marker.key} className="rounded-lg border border-ink-800 bg-ink-900/45 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-detail font-medium text-ink-100">{marker.name}</p>
                    <Badge tone={improved ? "optimal" : marker.status === "high" ? "high" : marker.status === "low" ? "low" : "watch"}>
                      {improved ? "improving" : LAB_STATUS_LABEL[marker.status] ?? marker.status}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="stat-mono text-body text-ink-50">
                      {marker.value} {marker.unit}
                    </span>
                    {delta !== 0 && (
                      <span className={cn("stat-mono text-micro", delta < 0 ? "text-optimal" : "text-watch")}>
                        {delta > 0 ? "+" : ""}
                        {delta}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {labs.length === 0 && <p className="text-detail text-ink-500">No new lab movement to explain today.</p>}
            </div>
            <Link
              href="/portal/labs"
              className="focus-ring mt-4 inline-flex items-center gap-1.5 rounded-control text-detail font-medium text-low hover:underline"
            >
              Open lab story
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="label-eyebrow">What changed</p>
            <div className="mt-3 space-y-2">
              {moments.map((m) => (
                <Link key={m.id} href={m.href} className="focus-ring block rounded-lg border border-ink-800 bg-ink-900/35 p-3 hover:border-ink-600">
                  <p className="text-detail font-medium text-ink-100">{m.headline}</p>
                  <p className="mt-1 line-clamp-2 text-micro leading-snug text-ink-500">{m.detail}</p>
                </Link>
              ))}
              {order && (
                <div className="rounded-lg border border-ink-800 bg-ink-900/35 p-3">
                  <div className="flex items-center gap-2">
                    <Package className="h-3.5 w-3.5 text-watch" />
                    <p className="text-detail font-medium text-ink-100">{order.status}</p>
                  </div>
                  <p className="mt-1 line-clamp-1 text-micro text-ink-500">
                    {order.lines.map((l) => l.name).join(", ")}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
