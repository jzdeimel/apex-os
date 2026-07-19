"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { inventory } from "@/lib/mock/inventory";
import { vendors, vendorMap, purchaseOrders } from "@/lib/mock/vendors";
import { locationName, locations } from "@/lib/mock/locations";
import { InventoryTable } from "@/components/InventoryTable";
import { AiSourcing } from "@/components/AiSourcing";
import { NewPOModal } from "@/components/NewPOModal";
import { PeptideIcon } from "@/components/PeptideIcon";
import { DashboardCard } from "@/components/DashboardCard";
import { Card, CardHeader, CardTitle, CardContent, Select, Badge, Button } from "@/components/ui/primitives";
import { DonutCount, RevenueBars, CountBars } from "@/components/charts";
import { InventoryStatusBadge } from "@/components/StatusBadge";
import { formatDate, currency } from "@/lib/utils";
import {
  Boxes,
  PackageX,
  CalendarX,
  ArrowLeftRight,
  Truck,
  Star,
  ShoppingCart,
  TrendingDown,
} from "lucide-react";

const PO_TONE: Record<string, "neutral" | "info" | "watch" | "optimal"> = {
  Draft: "neutral",
  Submitted: "info",
  Approved: "watch",
  Received: "optimal",
};

export default function SupplyChainPage() {
  const { locationFilter } = useStore();
  const [category, setCategory] = useState<string>("all");

  const inLoc = (loc: string) => locationFilter === "all" || loc === locationFilter;

  const items = useMemo(
    () =>
      inventory.filter(
        (i) => inLoc(i.locationId) && (category === "all" || i.category === category),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locationFilter, category],
  );

  const scoped = inventory.filter((i) => inLoc(i.locationId));
  const low = scoped.filter((i) => i.status === "low" || i.status === "out of stock");
  const expiring = scoped.filter((i) => i.status === "expiring soon");
  const totalValue = scoped.reduce((s, i) => s + i.quantity * i.unitCost, 0);

  // Transfer suggestions: an item low/out at one site that has surplus elsewhere.
  const transfers = useMemo(() => {
    const out: { name: string; from: string; to: string; qty: number }[] = [];
    for (const need of inventory.filter((i) => i.status === "low" || i.status === "out of stock")) {
      const source = inventory.find(
        (i) => i.name === need.name && i.locationId !== need.locationId && i.quantity > i.reorderPoint + 4,
      );
      if (source && (locationFilter === "all" || need.locationId === locationFilter || source.locationId === locationFilter)) {
        out.push({ name: need.name, from: source.locationId, to: need.locationId, qty: Math.max(3, Math.ceil((source.quantity - source.reorderPoint) / 2)) });
      }
    }
    return out.slice(0, 5);
  }, [locationFilter]);

  const categories = Array.from(new Set(inventory.map((i) => i.category)));

  return (
    <div className="space-y-5">
      <div>
        <p className="label-eyebrow">Inventory &amp; supply chain · {locations.length} locations</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink-50">Supply Chain</h1>
        <p className="mt-1 text-sm text-ink-400">
          Most peptides are sourced from <span className="text-gold-300">third-party vendors</span> —
          stock levels, lead times and reorders are tracked against external suppliers.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DashboardCard label="SKUs in view" value={scoped.length} icon={<Boxes className="h-4 w-4" />} accent />
        <DashboardCard label="Low / out of stock" value={low.length} icon={<PackageX className="h-4 w-4" />} deltaTone="down" />
        <DashboardCard label="Expiring ≤ 60d" value={expiring.length} icon={<CalendarX className="h-4 w-4" />} />
        <DashboardCard label="On-hand value" value={currency(totalValue, true)} icon={<TrendingDown className="h-4 w-4" />} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">Stock status</CardTitle></CardHeader>
          <CardContent>
            <DonutCount
              data={[
                { name: "In stock", value: scoped.filter((i) => i.status === "in stock").length, color: "#34d399" },
                { name: "Low", value: scoped.filter((i) => i.status === "low").length, color: "#e0bd6e" },
                { name: "Expiring", value: scoped.filter((i) => i.status === "expiring soon").length, color: "#f87171" },
                { name: "Out", value: scoped.filter((i) => i.status === "out of stock").length, color: "#7f1d1d" },
              ].filter((d) => d.value > 0)}
              height={160}
              centerValue={scoped.length}
              centerLabel="SKUs"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">On-hand value by location</CardTitle></CardHeader>
          <CardContent>
            <RevenueBars
              data={["raleigh", "southern-pines", "myrtle-beach"]
                .filter((l) => inLoc(l))
                .map((l) => ({
                  name: locationName(l as never),
                  revenue: Math.round(inventory.filter((i) => i.locationId === l).reduce((s, i) => s + i.quantity * i.unitCost, 0)),
                }))}
              height={160}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">Units by category</CardTitle></CardHeader>
          <CardContent>
            <CountBars
              data={Array.from(
                scoped.reduce<Map<string, number>>((m, i) => m.set(i.category, (m.get(i.category) ?? 0) + i.quantity), new Map()),
              ).map(([name, value]) => ({ name: name.split(" ")[0], value }))}
              height={160}
              label="Units"
            />
          </CardContent>
        </Card>
      </div>

      {/* AI sourcing */}
      <AiSourcing locationFilter={locationFilter} />

      {/* Alert cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><PackageX className="h-4 w-4 text-high" /> Low / reorder</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {low.length === 0 && <p className="text-sm text-ink-500">All stock above reorder points.</p>}
            {low.map((i) => (
              <div key={i.id} className="flex items-center gap-2.5 rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2">
                <PeptideIcon name={i.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-ink-100">{i.name}</span>
                  <span className="block text-[11px] text-ink-500">{locationName(i.locationId)} · {i.quantity} {i.unit}</span>
                </div>
                <InventoryStatusBadge status={i.status} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CalendarX className="h-4 w-4 text-watch" /> Expiring soon</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {expiring.length === 0 && <p className="text-sm text-ink-500">Nothing expiring within 60 days.</p>}
            {expiring.map((i) => (
              <div key={i.id} className="flex items-center gap-2.5 rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2">
                <PeptideIcon name={i.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-ink-100">{i.name}</span>
                  <span className="block text-[11px] text-ink-500">{locationName(i.locationId)} · lot {i.lotNumber}</span>
                </div>
                <span className="stat-mono text-xs text-watch">{formatDate(i.expirationDate)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ArrowLeftRight className="h-4 w-4 text-gold-400" /> Transfer suggestions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {transfers.length === 0 && <p className="text-sm text-ink-500">No inter-site transfers suggested.</p>}
            {transfers.map((t, i) => (
              <div key={i} className="rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2">
                <span className="text-sm font-medium text-ink-100">{t.name}</span>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-400">
                  <span>{locationName(t.from as never)}</span>
                  <ArrowLeftRight className="h-3 w-3 text-gold-400" />
                  <span>{locationName(t.to as never)}</span>
                  <span className="ml-auto stat-mono text-ink-300">×{t.qty}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Inventory table */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink-50">Inventory</h2>
        <div className="w-48">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
      </div>
      <InventoryTable items={items} />

      {/* Vendors + POs */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Truck className="h-4 w-4 text-gold-400" /> Third-party vendors</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {vendors.map((v) => (
                <div key={v.id} className="flex items-center justify-between rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-ink-100">{v.name}</span>
                    <span className="block truncate text-[11px] text-ink-500">{v.type} · {v.leadTimeDays}d lead · {v.contact}</span>
                  </div>
                  <span className="ml-2 inline-flex shrink-0 items-center gap-1 text-xs text-gold-300">
                    <Star className="h-3 w-3 fill-gold-400 text-gold-400" /> {v.rating}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-gold-400" /> Purchase orders</CardTitle>
            <NewPOModal />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {purchaseOrders.map((po) => {
                const total = po.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);
                return (
                  <div key={po.id} className="rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="stat-mono text-sm font-medium text-ink-100">{po.id}</span>
                      <Badge tone={PO_TONE[po.status]}>{po.status}</Badge>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-ink-500">
                      <span>{vendorMap[po.vendorId]?.name} · {locationName(po.locationId)}</span>
                      <span className="stat-mono text-ink-300">{currency(total)}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-ink-500">
                      {po.lines.map((l) => `${l.name} ×${l.quantity}`).join(" · ")}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
