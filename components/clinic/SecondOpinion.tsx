"use client";

import * as React from "react";
import { GitCompare, ArrowRight, Info, CircleDot, AlertTriangle } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, CardTitle, Select, EmptyState } from "@/components/ui/primitives";
import { Monogram } from "@/components/Monogram";
import { clients, clientMap, clientName } from "@/lib/mock/clients";
import { locationName } from "@/lib/mock/locations";
import { recommendationsForClient } from "@/lib/mock/recommendations";
import {
  compareRuleSets,
  RULE_SET_PRESETS,
  ruleSetById,
  type OnlyIn,
  type RuleSetConfig,
} from "@/lib/rules/secondOpinion";
import { cn } from "@/lib/utils";

/**
 * Second Opinion — the disagreement between two rule-set configurations,
 * rendered side by side.
 *
 * The middle column is the boring one on purpose: findings that survive both
 * configurations need no argument. The outer columns are where a clinician's
 * attention belongs, because a finding that exists under exactly one rule set
 * is a finding whose strongest supporting fact is a toggle.
 */

/** Members with at least one recommendation under the shipped rules. */
function comparableClients() {
  return clients.filter((c) => recommendationsForClient(c.id).length > 0).slice(0, 24);
}

function ratioTone(ratio: number): "optimal" | "watch" | "high" {
  if (ratio >= 0.85) return "optimal";
  if (ratio >= 0.6) return "watch";
  return "high";
}

function DivergenceCard({ d, set }: { d: OnlyIn; set: RuleSetConfig }) {
  const rec = d.recommendation;
  const labs = rec.supporting.labs;
  return (
    <li className="rounded-xl border border-gold-400/30 bg-gold-400/[0.06] p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 font-display text-body font-semibold leading-snug text-ink-50">
          {rec.title}
        </p>
        <Badge tone="gold">only here</Badge>
      </div>
      <p className="mt-1 text-micro text-ink-500">
        {set.label} · rule <span className="stat-mono">{d.ruleId}</span>
      </p>

      <p
        className={cn(
          "mt-2 rounded-lg px-2.5 py-1.5 text-micro leading-snug",
          d.cause === "displaced"
            ? "border border-high/30 bg-high/10 text-high"
            : "bg-ink-900/70 text-ink-400",
        )}
      >
        {d.cause === "displaced" && <AlertTriangle className="mr-1 inline h-3 w-3" />}
        {d.causeLabel}
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge tone="neutral">
          <span className="stat-mono">{Math.round(rec.confidence * 100)}%</span>
        </Badge>
        <Badge tone={rec.riskLevel === "high" || rec.riskLevel === "moderate" ? "high" : "neutral"}>
          {rec.riskLevel} risk
        </Badge>
      </div>

      <p className="mt-2 text-detail leading-relaxed text-ink-300">{rec.rationale}</p>

      {labs.length > 0 && (
        <ul className="mt-2 space-y-1">
          {labs.map((l) => (
            <li key={l.name} className="flex items-center justify-between gap-2 text-micro">
              <span className="min-w-0 truncate text-ink-400">{l.name}</span>
              <span className="stat-mono text-ink-200">{l.value}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function SecondOpinion({ initialClientId }: { initialClientId?: string }) {
  const pool = React.useMemo(comparableClients, []);
  const [clientId, setClientId] = React.useState(initialClientId ?? pool[0]?.id ?? clients[0].id);
  const [setAId, setSetAId] = React.useState("production");
  const [setBId, setSetBId] = React.useState("conservative");

  const client = clientMap[clientId] ?? pool[0];
  const setA = ruleSetById(setAId);
  const setB = ruleSetById(setBId);

  const result = React.useMemo(
    () => (client ? compareRuleSets(client, setA, setB) : undefined),
    [client, setA, setB],
  );

  if (!client || !result) {
    return <EmptyState title="No comparable member" hint="No member currently produces a recommendation." />;
  }

  const ratioPct = Math.round(result.agreementRatio * 100);

  return (
    <div className="space-y-4">
      {/* Controls — base grid-cols-1 so the three selects stack on a phone. */}
      <Card>
        <CardHeader className="flex flex-wrap items-center gap-2">
          <GitCompare className="h-4 w-4 text-gold-300" />
          <CardTitle>Second opinion</CardTitle>
          <Badge tone={ratioTone(result.agreementRatio)} className="ml-auto">
            <span className="stat-mono">{ratioPct}%</span> agreement
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="label-eyebrow">MEMBER</span>
              <Select
                className="mt-1"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                {pool.map((c) => (
                  <option key={c.id} value={c.id}>
                    {clientName(c)} — {locationName(c.locationId)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="label-eyebrow">RULE SET A</span>
              <Select className="mt-1" value={setAId} onChange={(e) => setSetAId(e.target.value)}>
                {RULE_SET_PRESETS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="label-eyebrow">RULE SET B</span>
              <Select className="mt-1" value={setBId} onChange={(e) => setSetBId(e.target.value)}>
                {RULE_SET_PRESETS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div className="mt-3 flex items-center gap-3 rounded-xl border border-ink-700/70 bg-ink-900/60 p-3">
            <Monogram client={client} />
            <div className="min-w-0">
              <p className="truncate text-body font-medium text-ink-50">{clientName(client)}</p>
              <p className="truncate text-detail text-ink-400">
                {client.status} · {client.goals.join(", ") || "no goals recorded"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* What the disagreement means, in plain language, before the columns. */}
      <Card>
        <CardHeader className="flex items-center gap-2">
          <Info className="h-4 w-4 text-ink-400" />
          <CardTitle>What this disagreement means</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {result.summary.map((s, i) => (
              <li key={i} className="flex gap-2 text-body leading-relaxed text-ink-300">
                <CircleDot className="mt-1 h-3 w-3 shrink-0 text-gold-400" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Two columns with agreement between them. Base grid-cols-1: on a phone
          this reads as A → agreed → B top to bottom, which is the same story. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="h-full">
            <CardHeader>
              <p className="label-eyebrow">ONLY UNDER A</p>
              <CardTitle className="mt-1">{setA.label}</CardTitle>
              <p className="mt-1 text-detail leading-relaxed text-ink-500">{setA.description}</p>
            </CardHeader>
            <CardContent>
              {result.onlyInA.length === 0 ? (
                <p className="text-detail text-ink-500">Nothing unique to this configuration.</p>
              ) : (
                <ul className="space-y-3">
                  {result.onlyInA.map((d) => (
                    <DivergenceCard key={d.ruleId} d={d} set={setA} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="h-full">
            <CardHeader>
              <p className="label-eyebrow">AGREED BY BOTH</p>
              <CardTitle className="mt-1">
                {result.agreed.length} finding{result.agreed.length === 1 ? "" : "s"}
              </CardTitle>
              <p className="mt-1 text-detail leading-relaxed text-ink-500">
                Survives a change of assumptions. Least of the reviewer&apos;s attention belongs here.
              </p>
            </CardHeader>
            <CardContent>
              {result.agreed.length === 0 ? (
                <p className="text-detail text-ink-500">The two configurations share nothing.</p>
              ) : (
                <ul className="space-y-2">
                  {result.agreed.map((a) => (
                    <li
                      key={a.ruleId}
                      className="rounded-xl border border-optimal/25 bg-optimal/[0.06] p-3"
                    >
                      <p className="text-body font-medium leading-snug text-ink-100">{a.title}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge tone="optimal">
                          <span className="stat-mono">{Math.round(a.confidence * 100)}%</span>
                        </Badge>
                        <Badge tone="neutral">{a.riskLevel} risk</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {result.changedConfidence.length > 0 && (
                <div className="mt-4 border-t border-ink-800 pt-3">
                  <p className="label-eyebrow">SAME FINDING, DIFFERENT EMPHASIS</p>
                  <ul className="mt-2 space-y-2">
                    {result.changedConfidence.map((c) => (
                      <li key={c.ruleId} className="rounded-lg bg-ink-900/70 p-2.5">
                        <p className="text-detail font-medium text-ink-200">{c.title}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-detail text-ink-400">
                          <span className="stat-mono">{Math.round(c.confidenceA * 100)}%</span>
                          <ArrowRight className="h-3 w-3" />
                          <span
                            className={cn(
                              "stat-mono",
                              c.delta > 0 ? "text-high" : "text-low",
                            )}
                          >
                            {Math.round(c.confidenceB * 100)}%
                          </span>
                          {c.riskChanged && (
                            <Badge tone="watch">
                              risk {c.riskA} → {c.riskB}
                            </Badge>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="h-full">
            <CardHeader>
              <p className="label-eyebrow">ONLY UNDER B</p>
              <CardTitle className="mt-1">{setB.label}</CardTitle>
              <p className="mt-1 text-detail leading-relaxed text-ink-500">{setB.description}</p>
            </CardHeader>
            <CardContent>
              {result.onlyInB.length === 0 ? (
                <p className="text-detail text-ink-500">Nothing unique to this configuration.</p>
              ) : (
                <ul className="space-y-3">
                  {result.onlyInB.map((d) => (
                    <DivergenceCard key={d.ruleId} d={d} set={setB} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
      </div>

      <p className="text-detail leading-relaxed text-ink-500">
        Both columns are the same engine over the same chart — only the rule configuration differs.
        Neither is authoritative, and every finding still requires provider approval before any
        protocol detail is written.
      </p>
    </div>
  );
}
