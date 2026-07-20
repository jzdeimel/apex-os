"use client";

import { useState } from "react";
import type { Client } from "@/lib/types";
import { useStore } from "@/lib/store";
import {
  buildScheduleItems,
  cadenceDays,
  CADENCE_OPTIONS,
  DAYS,
  DEFAULT_CHECKPOINTS,
  type Cadence,
} from "@/lib/protocolSchedule";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, EmptyState, Select } from "@/components/ui/primitives";
import { Disclaimer, AiLabel } from "@/components/Disclaimer";
import { PeptideIcon } from "@/components/PeptideIcon";
import { cn } from "@/lib/utils";
import { CalendarClock, Lock, Check, ListPlus, Flag } from "lucide-react";

const TIMING_SLOTS = ["AM", "Midday", "PM"];

export function ProtocolScheduleBuilder({ client }: { client: Client }) {
  const { addTask } = useStore();
  const items = buildScheduleItems(client);
  const [cadence, setCadence] = useState<Record<string, Cadence>>(
    Object.fromEntries(items.map((i) => [i.name, i.sampleCadence])),
  );
  const [timing, setTiming] = useState<Record<string, string[]>>(
    Object.fromEntries(items.map((i) => [i.name, i.timing])),
  );
  const [pushed, setPushed] = useState(false);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock className="h-6 w-6" />}
        title="No protocol candidates yet"
        hint="Schedule items appear once recommendations are generated or a program is active."
      />
    );
  }

  const toggleTiming = (name: string, slot: string) =>
    setTiming((prev) => {
      const cur = prev[name] ?? [];
      return { ...prev, [name]: cur.includes(slot) ? cur.filter((s) => s !== slot) : [...cur, slot] };
    });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-heading font-semibold text-ink-50">Protocol schedule builder</h3>
          <p className="mt-0.5 text-body text-ink-400">
            Build the cadence &amp; timing scaffold. <span className="text-gold-300">Dose, exact frequency and route are confirmed by the provider</span> — no dosing is generated here.
          </p>
        </div>
        <AiLabel />
      </div>

      <Disclaimer />

      {/* Schedule items */}
      <div className="space-y-3">
        {items.map((it) => {
          const days = cadenceDays(cadence[it.name]);
          return (
            <Card key={it.name} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <PeptideIcon name={it.name} size="md" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-body font-semibold text-ink-50">{it.name}</span>
                      <Badge tone={it.source === "approved" ? "optimal" : it.source === "program" ? "gold" : "neutral"}>
                        {it.source === "approved" ? "Provider approved" : it.source === "program" ? "Active program" : "Candidate"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-micro text-ink-500">{it.category} · route: {it.route}</p>
                  </div>
                </div>
                {/* Dose locked field */}
                <div className="inline-flex items-center gap-1.5 rounded-lg border border-gold-400/25 bg-gold-400/[0.06] px-2.5 py-1.5 text-micro text-gold-200">
                  <Lock className="h-3 w-3" /> Dose: added by provider
                </div>
              </div>

              {/* Controls */}
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <span className="label-eyebrow">Cadence (provider confirms)</span>
                  <div className="mt-1.5">
                    <Select
                      value={cadence[it.name]}
                      onChange={(e) => setCadence((p) => ({ ...p, [it.name]: e.target.value as Cadence }))}
                    >
                      {CADENCE_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </Select>
                  </div>
                </div>
                <div>
                  <span className="label-eyebrow">Timing</span>
                  <div className="mt-1.5 flex gap-1.5">
                    {TIMING_SLOTS.map((slot) => {
                      const on = (timing[it.name] ?? []).includes(slot);
                      return (
                        <button
                          key={slot}
                          onClick={() => toggleTiming(it.name, slot)}
                          className={cn(
                            "flex-1 rounded-lg border px-2 py-1.5 text-detail font-medium transition-colors",
                            on ? "border-gold-400/50 bg-gold-400/15 text-gold-100" : "border-ink-700 text-ink-400 hover:text-ink-100",
                          )}
                        >
                          {slot}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Weekly preview */}
              <div className="mt-3">
                <span className="label-eyebrow">Sample week (provider confirms)</span>
                <div className="mt-1.5 grid grid-cols-7 gap-1.5">
                  {DAYS.map((d, i) => (
                    <div
                      key={d}
                      className={cn(
                        "rounded-lg border py-2 text-center",
                        days[i] ? "border-gold-400/40 bg-gold-400/10" : "border-ink-800 bg-ink-900/40",
                      )}
                    >
                      <span className="block text-micro text-ink-500">{d}</span>
                      {days[i] ? (
                        <Check className="mx-auto mt-0.5 h-3.5 w-3.5 text-gold-300" />
                      ) : (
                        <span className="block text-ink-700">·</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Checkpoints */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Flag className="h-4 w-4 text-gold-400" /> Monitoring checkpoints</CardTitle></CardHeader>
        <CardContent>
          <ol className="relative space-y-3 pl-1">
            <span className="absolute left-[15px] top-2 bottom-2 w-px bg-ink-800" aria-hidden />
            {DEFAULT_CHECKPOINTS.map((c) => (
              <li key={c.week} className="relative flex gap-3">
                <span className="z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-800 stat-mono text-micro font-bold text-gold-300 ring-4 ring-ink-850">
                  W{c.week}
                </span>
                <p className="pt-1.5 text-body text-ink-300">{c.label}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={pushed}
          onClick={() => {
            addTask({
              clientId: client.id,
              type: "Provider approval needed",
              title: `Provider to finalize protocol schedule (dose & frequency) — ${client.firstName} ${client.lastName}`,
              assigneeId: client.providerId,
              dueDate: "2026-06-16T12:00:00",
              priority: "high",
              done: false,
            });
            setPushed(true);
          }}
        >
          {pushed ? <Check className="h-3.5 w-3.5" /> : <ListPlus className="h-3.5 w-3.5" />}
          {pushed ? "Sent to provider" : "Send to provider to finalize dosing"}
        </Button>
        <span className="text-micro text-ink-500">
          Schedule scaffold only. No dose is set until the provider completes and approves it.
        </span>
      </div>
    </div>
  );
}
