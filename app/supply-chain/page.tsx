import { Boxes } from "lucide-react";

import { AuthoritativeInventoryPanel } from "@/components/inventory/AuthoritativeInventoryPanel";
import { AuthoritativeOrderBoard } from "@/components/orders/AuthoritativeOrderBoard";
import { Badge } from "@/components/ui/primitives";

export default function SupplyChainPage() {
  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-2"><Badge tone="optimal">AUTHORITATIVE</Badge><Badge>INVENTORY &amp; FULFILLMENT</Badge></div>
        <h1 className="mt-2 flex items-center gap-2 font-display text-title font-semibold text-ink-50"><Boxes className="h-6 w-6 text-gold-300" /> Supply chain</h1>
        <p className="mt-2 max-w-3xl text-detail text-ink-400">
          Stock comes from lot receipts and signed inventory movements. Patient orders and status history come from Apex PostgreSQL.
          Vendor scorecards, suggested transfers, seeded purchase orders, and illustrative on-hand charts are not shown.
        </p>
      </header>
      <AuthoritativeInventoryPanel />
      <AuthoritativeOrderBoard />
    </div>
  );
}
