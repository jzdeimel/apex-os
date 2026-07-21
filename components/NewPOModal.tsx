"use client";
import { appendLedger } from "@/lib/trace/ledger";
import { VIEWER } from "@/lib/viewer";

import { useState } from "react";
import { commitPurchaseOrder, vendors } from "@/lib/mock/vendors";
import { inventory } from "@/lib/mock/inventory";
import { locations, locationName } from "@/lib/mock/locations";
import { Button, Select, Badge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { PeptideIcon } from "@/components/PeptideIcon";
import { currency } from "@/lib/utils";
import { Plus, X, Trash2, ShoppingCart, Check } from "lucide-react";

interface Line {
  name: string;
  qty: number;
  unitCost: number;
}

const PRODUCTS = Array.from(new Set(inventory.map((i) => i.name)));

export function NewPOModal() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [vendorId, setVendorId] = useState(vendors[0].id);
  const [locId, setLocId] = useState(locations[0].id);
  const [lines, setLines] = useState<Line[]>([{ name: PRODUCTS[0], qty: 10, unitCost: inventory.find((i) => i.name === PRODUCTS[0])?.unitCost ?? 60 }]);

  const total = lines.reduce((s, l) => s + l.qty * l.unitCost, 0);

  const addLine = () => setLines((l) => [...l, { name: PRODUCTS[0], qty: 5, unitCost: inventory.find((i) => i.name === PRODUCTS[0])?.unitCost ?? 60 }]);
  const removeLine = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));
  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((l) => l.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const submit = () => {
    // "Purchase order submitted" was the entire handler — a toast quoting a
    // vendor and a dollar total while nothing was written, so an ops manager
    // believed stock was on order and none was. It now commits a real DRAFT
    // purchase order that the list beside this button reads, and witnesses it
    // in the ledger. The word is "drafted", not "submitted": nothing is
    // transmitted to a vendor from here, and saying so is the point.
    const vendor = vendors.find((v) => v.id === vendorId);
    const po = commitPurchaseOrder({
      vendorId,
      vendorName: vendor?.name ?? vendorId,
      lines: lines.map((l) => ({ name: l.name, qty: l.qty, unitCost: l.unitCost })),
    });
    const row = appendLedger({
      actorId: VIEWER.id,
      actorName: VIEWER.name,
      actorRole: "Admin",
      action: "create",
      entity: "order",
      entityId: po.id,
      reason: `Purchase order drafted: ${lines.length} line(s) to ${vendor?.name ?? vendorId}`,
      after: { status: "Draft", total: currency(total), lines: lines.length },
    });
    setOpen(false);
    toast("Purchase order drafted", {
      desc: `${po.id} · ${lines.length} line(s) · ${currency(total)} to ${vendor?.name} · ledger ${row.id}`,
    });
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> New PO
      </Button>

      {open && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center px-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-ink-700 bg-ink-850 shadow-glow animate-fade-up">
            <div className="flex items-center justify-between border-b border-ink-800 px-5 py-3.5">
              <h3 className="flex items-center gap-2 font-display text-body font-semibold text-ink-50">
                <ShoppingCart className="h-4 w-4 text-gold-400" /> New purchase order
              </h3>
              <button onClick={() => setOpen(false)} className="text-ink-500 hover:text-ink-200"><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-4 overflow-y-auto p-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="label-eyebrow">Vendor</span>
                  <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="mt-1.5">
                    {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </Select>
                </div>
                <div>
                  <span className="label-eyebrow">Ship to</span>
                  <Select value={locId} onChange={(e) => setLocId(e.target.value as never)} className="mt-1.5">
                    {locations.filter((l) => l.type === "clinic").map((l) => <option key={l.id} value={l.id}>{l.short}</option>)}
                  </Select>
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="label-eyebrow">Line items</span>
                  <button onClick={addLine} className="inline-flex items-center gap-1 text-detail text-gold-300 hover:text-gold-200">
                    <Plus className="h-3 w-3" /> Add
                  </button>
                </div>
                <div className="space-y-2">
                  {lines.map((l, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border border-ink-800 bg-ink-900/40 p-2">
                      <PeptideIcon name={l.name} size="sm" />
                      <select
                        value={l.name}
                        onChange={(e) => setLine(i, { name: e.target.value, unitCost: inventory.find((x) => x.name === e.target.value)?.unitCost ?? l.unitCost })}
                        className="h-8 min-w-0 flex-1 rounded-md border border-ink-700 bg-ink-900/70 px-2 text-detail text-ink-100 focus-ring"
                      >
                        {PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <input
                        type="number"
                        value={l.qty}
                        min={1}
                        onChange={(e) => setLine(i, { qty: Math.max(1, Number(e.target.value)) })}
                        className="h-8 w-16 rounded-md border border-ink-700 bg-ink-900/70 px-2 text-detail text-ink-100 focus-ring"
                      />
                      <span className="w-16 text-right stat-mono text-detail text-ink-300">{currency(l.qty * l.unitCost)}</span>
                      {lines.length > 1 && (
                        <button onClick={() => removeLine(i)} className="text-ink-600 hover:text-high"><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2.5">
                <span className="text-body text-ink-300">Order total · {locationName(locId)}</span>
                <span className="stat-mono text-body font-bold text-ink-50">{currency(total)}</span>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-ink-800 px-5 py-3.5">
              <Badge tone="neutral">Draft · demo</Badge>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button size="sm" variant="primary" onClick={submit}>
                  <Check className="h-3.5 w-3.5" /> Submit PO
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
