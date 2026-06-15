"use client";

import type { InventoryItem } from "@/lib/types";
import { InventoryStatusBadge } from "@/components/StatusBadge";
import { PeptideIcon } from "@/components/PeptideIcon";
import { locationName } from "@/lib/mock/locations";
import { vendorMap } from "@/lib/mock/vendors";
import { formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/ui/primitives";
import { Boxes } from "lucide-react";

export function InventoryTable({ items }: { items: InventoryItem[] }) {
  if (items.length === 0) {
    return <EmptyState icon={<Boxes className="h-6 w-6" />} title="No inventory matches these filters" />;
  }
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-ink-800 text-left text-[11px] uppercase tracking-wider text-ink-500">
            <th className="px-4 py-3 font-medium">Product</th>
            <th className="px-4 py-3 font-medium">SKU</th>
            <th className="px-4 py-3 font-medium">Location</th>
            <th className="px-4 py-3 font-medium text-right">Qty</th>
            <th className="px-4 py-3 font-medium">Lot</th>
            <th className="px-4 py-3 font-medium">Expires</th>
            <th className="px-4 py-3 font-medium">Vendor</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-800/70">
          {items.map((i) => (
            <tr key={i.id} className="hover:bg-ink-850/60">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <PeptideIcon name={i.name} size="sm" />
                  <div>
                    <span className="block font-medium text-ink-50">{i.name}</span>
                    <span className="text-[11px] text-ink-500">{i.category}</span>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 stat-mono text-xs text-ink-400">{i.sku}</td>
              <td className="px-4 py-3 text-ink-300">{locationName(i.locationId)}</td>
              <td className="px-4 py-3 text-right">
                <span className="stat-mono font-semibold text-ink-50">{i.quantity}</span>
                <span className="ml-1 text-[11px] text-ink-500">{i.unit}</span>
                <div className="text-[10px] text-ink-600">reorder ≤ {i.reorderPoint}</div>
              </td>
              <td className="px-4 py-3 stat-mono text-xs text-ink-400">{i.lotNumber}</td>
              <td className="px-4 py-3 stat-mono text-xs text-ink-300">{formatDate(i.expirationDate)}</td>
              <td className="px-4 py-3 text-xs text-ink-300">{vendorMap[i.vendorId]?.name ?? i.vendorId}</td>
              <td className="px-4 py-3"><InventoryStatusBadge status={i.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
