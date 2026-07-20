"use client";

import { useMemo, useState } from "react";
import { sourcingForecasts, compareVendors, draftReorderPOs } from "@/lib/aiSourcing";
import { inventory } from "@/lib/mock/inventory";
import { locationName } from "@/lib/mock/locations";
import { Card, CardHeader, CardTitle, CardContent, Button, Badge, Select } from "@/components/ui/primitives";
import { PeptideIcon } from "@/components/PeptideIcon";
import { AiLabel } from "@/components/Disclaimer";
import { currency, cn } from "@/lib/utils";
import { Brain, TrendingDown, Star, Truck, FileSpreadsheet, Check, Sparkles } from "lucide-react";

const PEPTIDE_PRODUCTS = Array.from(
  new Set(inventory.filter((i) => i.category === "Peptide" || i.category === "Medication").map((i) => i.name)),
);

export function AiSourcing({ locationFilter }: { locationFilter: string }) {
  const [product, setProduct] = useState(PEPTIDE_PRODUCTS[0]);
  const [drafted, setDrafted] = useState(false);

  const scoped = useMemo(
    () => inventory.filter((i) => locationFilter === "all" || i.locationId === locationFilter),
    [locationFilter],
  );
  const forecasts = useMemo(() => sourcingForecasts(scoped).slice(0, 6), [scoped]);
  const vendorScores = useMemo(() => compareVendors(product), [product]);
  const draftPOs = useMemo(() => draftReorderPOs(scoped), [scoped]);

  return (
    <Card className="border-gold-400/25 bg-gradient-to-br from-gold-400/[0.05] to-transparent">
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-gold-400" /> AI peptide sourcing &amp; demand forecast
        </CardTitle>
        <AiLabel />
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Forecast */}
        <div>
          <div className="mb-2 flex items-center gap-2 text-detail text-ink-400">
            <TrendingDown className="h-3.5 w-3.5 text-gold-400" /> Reorder forecast (by risk)
          </div>
          <div className="space-y-2">
            {forecasts.map((f) => (
              <div key={f.item.id} className="rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2">
                <div className="flex items-center gap-2">
                  <PeptideIcon name={f.item.name} size="xs" />
                  <span className="truncate text-body font-medium text-ink-100">{f.item.name}</span>
                  <Badge tone={f.riskScore >= 60 ? "high" : f.riskScore >= 30 ? "watch" : "neutral"} className="ml-auto">
                    risk {f.riskScore}
                  </Badge>
                </div>
                <p className="mt-0.5 text-micro text-ink-500">{locationName(f.item.locationId)} · {f.reason}</p>
                <div className="mt-1.5 flex items-center justify-between text-micro">
                  <span className="text-ink-400">
                    Suggest order <span className="stat-mono text-gold-300">{f.recommendedOrderQty} {f.item.unit}</span>
                  </span>
                  {f.bestVendor && (
                    <span className="inline-flex items-center gap-1 text-ink-400">
                      <Truck className="h-3 w-3" /> {f.bestVendor.name} ({f.bestVendor.leadTimeDays}d)
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Vendor comparison + draft PO */}
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-detail text-ink-400">
                <Star className="h-3.5 w-3.5 text-gold-400" /> Vendor comparison
              </span>
              <div className="w-44">
                <Select value={product} onChange={(e) => setProduct(e.target.value)}>
                  {PEPTIDE_PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
                </Select>
              </div>
            </div>
            {vendorScores.length === 0 ? (
              <p className="text-detail text-ink-500">No third-party vendors carry this product in the mock catalog.</p>
            ) : (
              <div className="space-y-1.5">
                {vendorScores.map((v, i) => (
                  <div key={v.vendor.id} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2", i === 0 ? "border-gold-400/30 bg-gold-400/[0.06]" : "border-ink-800 bg-ink-900/40")}>
                    {i === 0 && <Sparkles className="h-3.5 w-3.5 shrink-0 text-gold-400" />}
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-body text-ink-100">{v.vendor.name}</span>
                      <span className="text-micro text-ink-500">
                        ★ {v.vendor.rating} · {v.vendor.leadTimeDays}d lead · est {currency(v.estUnitCost)}/unit
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="stat-mono text-body font-bold text-ink-50">{v.score}</span>
                      {i === 0 && <span className="block text-micro text-gold-300">AI pick</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Auto-draft POs */}
          <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-detail text-ink-400">
                <FileSpreadsheet className="h-3.5 w-3.5 text-gold-400" /> Auto-drafted reorder POs
              </span>
              <Button size="sm" variant={drafted ? "success" : "primary"} onClick={() => setDrafted(true)}>
                {drafted ? <Check className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                {drafted ? "Drafted" : "Generate"}
              </Button>
            </div>
            {drafted && (
              <div className="mt-2 space-y-2 animate-fade-in">
                {draftPOs.length === 0 ? (
                  <p className="text-micro text-ink-500">No reorders needed in this view.</p>
                ) : (
                  draftPOs.map((po) => (
                    <div key={po.vendorId} className="rounded-md border border-ink-800 bg-ink-950/40 px-2.5 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-detail font-medium text-ink-100">{po.vendorName}</span>
                        <span className="stat-mono text-detail text-gold-300">{currency(po.total)}</span>
                      </div>
                      <p className="mt-0.5 text-micro text-ink-500">
                        {po.lines.map((l) => `${l.name} ×${l.quantity} (${locationName(l.locationId as never)})`).join(" · ")} · lead {po.leadTimeDays}d
                      </p>
                    </div>
                  ))
                )}
                <p className="text-micro text-ink-600">Draft only — operations reviews & submits. Pricing simulated.</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
