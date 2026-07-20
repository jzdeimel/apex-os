"use client";

import * as React from "react";
import {
  Search,
  Minus,
  Plus,
  Truck,
  Store,
  AlertTriangle,
  Info,
  CheckCircle2,
  X,
  ShieldCheck,
  Package,
} from "lucide-react";

import { Card, CardContent, Badge, Button, Input, Select, Textarea, EmptyState } from "@/components/ui/primitives";
import { FadeIn } from "@/components/motion";
import { useToast } from "@/components/ui/Toast";
import { Monogram } from "@/components/Monogram";
import { cn } from "@/lib/utils";

import { clients, clientName, getClient } from "@/lib/mock/clients";
import { staffMap, staffName } from "@/lib/mock/staff";
import { locationMap, locations } from "@/lib/mock/locations";
import { membershipForClient } from "@/lib/mock/memberships";
import { appendLedger, type LedgerRow } from "@/lib/trace/ledger";
import { commitOrder } from "@/lib/mock/orders";
import { shortHash } from "@/lib/trace/hash";
import { ME_COACH } from "@/components/coach/TodayQueue";

import { catalogFor, searchCatalog, SERVICE_LINES, KIND_LABEL } from "@/lib/catalog/catalog";
import type { CatalogItem, ServiceLine } from "@/lib/catalog/types";
import {
  placeOrder,
  priceLines,
  validateOrder,
  centsToDollars,
  type OrderLineInput,
  type OrderProblem,
  type PlaceOrderInput,
  type ShippingMode,
  type PlacingActor,
} from "@/lib/orders/place";
import type { Order } from "@/lib/orders/types";
import type { Client, LocationId } from "@/lib/types";

/**
 * ORDER PLACEMENT.
 *
 * Apex could render orders long before it could create one; this is the screen
 * that closes that gap. It is modelled on the one thing the audited order screen
 * genuinely got right — a single page where picking the member fills in
 * everything the clinic already knows about them, so the coach types a name and
 * nothing else — and then fixes the four things it got wrong:
 *
 *   1. The total was computed on submit, so nobody knew the price until after
 *      the order existed. Here the total is LIVE and itemised as you click.
 *   2. A discount was a bare number field. Here it requires a reason, and the
 *      reason lands in the ledger row.
 *   3. Validation surfaced one error at a time, on submit. Here every problem is
 *      listed continuously and Place is disabled until they are gone.
 *   4. Unlisted products were silently dropped at submit. Here that is
 *      structurally impossible — you can only add items that exist in the
 *      catalog, and an unknown SKU is a blocking error (lib/orders/place.ts).
 *
 * DEMO-SHAPED: placing an order constructs the record and appends a real ledger
 * row in memory. Nothing leaves the browser. The MedSource submit is an
 * interface with a demo implementation (lib/orders/medsource.ts) and is not
 * wired here.
 */

const NOW = "2026-06-12T09:00:00";

/** The coach whose console this is. Matches the rest of the coach surfaces. */
const ACTOR: PlacingActor = {
  id: ME_COACH,
  name: staffName(ME_COACH),
  role: staffMap[ME_COACH]?.role ?? "Coach",
};

type QtyMap = Record<string, number>;

export function OrderForm() {
  const { toast } = useToast();

  // --- member selection ----------------------------------------------------
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [clientId, setClientId] = React.useState<string>("");

  /**
   * Debounce the type-ahead. 180ms is the threshold where a coach typing a name
   * on a phone stops seeing the list thrash under their thumb.
   */
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 180);
    return () => clearTimeout(t);
  }, [query]);

  const matches = React.useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (q.length < 2) return [];
    return clients
      .filter(
        (c) =>
          clientName(c).toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.mrn.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [debounced]);

  const client = clientId ? getClient(clientId) : undefined;
  const membership = clientId ? membershipForClient(clientId) : undefined;

  // --- order state ---------------------------------------------------------
  const [locationId, setLocationId] = React.useState<LocationId>("raleigh");
  const [qty, setQty] = React.useState<QtyMap>({});
  const [shipping, setShipping] = React.useState<ShippingMode>("ship");
  const [addr, setAddr] = React.useState({ line1: "", line2: "", city: "", state: "", postal: "" });
  const [discountDollars, setDiscountDollars] = React.useState("");
  const [discountReason, setDiscountReason] = React.useState("");
  const [note, setNote] = React.useState("");
  const [line, setLine] = React.useState<ServiceLine | "all">("all");
  const [catalogQuery, setCatalogQuery] = React.useState("");
  const [placed, setPlaced] = React.useState<{ order: Order; row: LedgerRow; totalCents: number } | null>(null);

  /**
   * Selecting a member autofills everything the clinic already knows: their home
   * location, their coach, their provider, their plan and their default
   * fulfillment preference. The audited screen made staff re-key all of it,
   * which is both slow and the origin of most wrong-location orders.
   */
  function selectClient(id: string) {
    const c = getClient(id);
    if (!c) return;
    setClientId(id);
    setQuery(clientName(c));
    setLocationId(c.locationId);
    // Telehealth members can only receive by shipment; clinic members default to
    // shipping too, but the toggle is right there.
    setShipping("ship");
    const loc = locationMap[c.locationId];
    // Apex stores the member's shipping address on the chart; the demo seeds the
    // city/state from their home clinic so the address block starts realistic.
    setAddr({ line1: "", line2: "", city: loc?.city === "Virtual" ? "" : (loc?.city ?? ""), state: loc?.state === "—" ? "" : (loc?.state ?? ""), postal: "" });
    setQty({});
    setPlaced(null);
  }

  function clearClient() {
    setClientId("");
    setQuery("");
    setQty({});
    setPlaced(null);
  }

  // --- catalog -------------------------------------------------------------
  const available = React.useMemo(() => catalogFor(locationId), [locationId]);

  const visible = React.useMemo(() => {
    const scoped = line === "all" ? available : available.filter((c) => c.serviceLine === line);
    return searchCatalog(catalogQuery, scoped);
  }, [available, line, catalogQuery]);

  const linesPresent: ServiceLine[] = React.useMemo(
    () => SERVICE_LINES.filter((l) => available.some((c) => c.serviceLine === l)),
    [available],
  );

  function bump(sku: string, by: number) {
    setPlaced(null);
    setQty((q) => {
      const next = Math.max(0, (q[sku] ?? 0) + by);
      const copy = { ...q };
      if (next === 0) delete copy[sku];
      else copy[sku] = next;
      return copy;
    });
  }

  const orderLines: OrderLineInput[] = React.useMemo(
    () => Object.entries(qty).map(([sku, n]) => ({ sku, qty: n })),
    [qty],
  );

  // --- money ---------------------------------------------------------------
  /**
   * Dollars in the box, integer cents in the model. Parsed once, here, so no
   * float ever reaches the pricing engine.
   */
  const discountCents = React.useMemo(() => {
    const n = Number.parseFloat(discountDollars.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100);
  }, [discountDollars]);

  const pricing = React.useMemo(
    () => priceLines(orderLines, membership, discountCents, discountReason),
    [orderLines, membership, discountCents, discountReason],
  );

  const input: PlaceOrderInput = React.useMemo(
    () => ({
      clientId,
      clientName: client ? clientName(client) : undefined,
      coachId: client?.coachId ?? ME_COACH,
      locationId,
      lines: orderLines,
      shipping,
      shipTo: shipping === "ship" ? addr : undefined,
      discountCents,
      discountReason,
      membership,
      note: note.trim() || undefined,
      at: NOW,
      origin: "coach",
    }),
    [clientId, client, locationId, orderLines, shipping, addr, discountCents, discountReason, membership, note],
  );

  const problems = React.useMemo(() => validateOrder(input), [input]);
  const errors = problems.filter((p) => p.severity === "error");
  const warnings = problems.filter((p) => p.severity === "warning");
  const ready = errors.length === 0;

  // --- place ---------------------------------------------------------------
  function handlePlace() {
    // A second click must not produce a second order.
    //
    // `orderIdFor` is deterministic over client + clock + lines, so re-running
    // placeOrder with unchanged input returns the SAME order id — and appended
    // a second `create` row against it, which reads in the ledger as one order
    // created twice. That is the duplicate-shipment scenario the idempotency
    // key and the refill claim-lock exist to prevent; the ordering surface had
    // no equivalent guard.
    if (placed) return;

    const result = placeOrder(input, ACTOR);
    if (!result.ok) {
      toast("Order not placed", {
        tone: "warn",
        desc: `${result.problems.filter((p) => p.severity === "error").length} problem(s) still open.`,
      });
      return;
    }
    // The ledger row is appended HERE, by the caller, exactly as placeOrder's
    // contract requires. In production this insert shares a transaction with the
    // order insert, so an order that cannot be recorded does not exist.
    const row = appendLedger(result.ledgerDraft, NOW);
    // Put it in the book. Without this the ledger recorded the creation of an
    // order that no board, portal or lookup could resolve — and the panel below
    // claimed it was "visible in the member's portal", which was not true.
    commitOrder(result.order);
    setPlaced({ order: result.order, row, totalCents: result.pricing.totalCents });
    toast(`Order ${result.order.id} placed`, {
      desc: `Ledger ${row.id} · ${shortHash(row.hash)} · ${centsToDollars(result.pricing.totalCents)}`,
    });
  }

  // -------------------------------------------------------------------------

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* ------------------------------------------------ left: build it */}
      <div className="min-w-0 space-y-5">
        <MemberPicker
          query={query}
          setQuery={setQuery}
          matches={matches}
          client={client}
          onSelect={selectClient}
          onClear={clearClient}
          membershipTier={membership?.tier}
        />

        {/* Location — autofilled, still overridable, because a member really
            does sometimes pick up at a different clinic. */}
        <Card>
          <CardContent className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <div>
              <p className="label-eyebrow">FULFILLING LOCATION</p>
              <Select
                className="mt-2"
                value={locationId}
                onChange={(e) => {
                  setLocationId(e.target.value as LocationId);
                  setPlaced(null);
                }}
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.short}
                  </option>
                ))}
              </Select>
              <p className="mt-2 text-detail text-ink-500">
                The catalog below is filtered to what this location may sell.
              </p>
            </div>
            <div>
              <p className="label-eyebrow">FULFILLMENT</p>
              <div className="mt-2 flex rounded-lg border border-ink-700 bg-ink-900/70 p-1">
                <ToggleHalf
                  active={shipping === "ship"}
                  onClick={() => setShipping("ship")}
                  icon={<Truck className="h-3.5 w-3.5" />}
                  label="Ship"
                />
                <ToggleHalf
                  active={shipping === "pickup"}
                  onClick={() => setShipping("pickup")}
                  icon={<Store className="h-3.5 w-3.5" />}
                  label="Clinic pickup"
                />
              </div>
              <p className="mt-2 text-detail text-ink-500">
                {shipping === "ship"
                  ? "In-clinic services cannot ship and will flag below."
                  : `Held for pickup at ${locationMap[locationId]?.short ?? "the clinic"}.`}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* The address block exists ONLY when shipping. An address field on a
            pickup order is a field somebody eventually fills in wrongly. */}
        {shipping === "ship" && (
          <FadeIn>
            <Card>
              <CardContent className="p-5">
                <p className="label-eyebrow">SHIP TO</p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    className="sm:col-span-2"
                    placeholder="Street address"
                    value={addr.line1}
                    onChange={(e) => setAddr({ ...addr, line1: e.target.value })}
                  />
                  <Input
                    className="sm:col-span-2"
                    placeholder="Apt / Suite (optional)"
                    value={addr.line2}
                    onChange={(e) => setAddr({ ...addr, line2: e.target.value })}
                  />
                  <Input
                    placeholder="City"
                    value={addr.city}
                    onChange={(e) => setAddr({ ...addr, city: e.target.value })}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      placeholder="State"
                      value={addr.state}
                      onChange={(e) => setAddr({ ...addr, state: e.target.value })}
                    />
                    <Input
                      placeholder="ZIP"
                      inputMode="numeric"
                      value={addr.postal}
                      onChange={(e) => setAddr({ ...addr, postal: e.target.value })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </FadeIn>
        )}

        <CatalogPicker
          items={visible}
          qty={qty}
          onBump={bump}
          line={line}
          setLine={(l) => setLine(l)}
          lines={linesPresent}
          query={catalogQuery}
          setQuery={setCatalogQuery}
        />
      </div>

      {/* ------------------------------------------------ right: the money */}
      <div className="min-w-0 space-y-5 lg:sticky lg:top-4 lg:self-start">
        <SummaryPanel
          pricing={pricing}
          onBump={bump}
          membershipTier={membership?.tier}
        />

        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="label-eyebrow">DISCOUNT</p>
            <div className="grid grid-cols-1 gap-3">
              <Input
                placeholder="0.00"
                inputMode="decimal"
                value={discountDollars}
                onChange={(e) => setDiscountDollars(e.target.value)}
              />
              {/* A discount with no reason is how margin leaks. The field is
                  required by validateOrder, and the reason is written to the
                  ledger row, so every dollar given away is attributable. */}
              <Textarea
                rows={2}
                placeholder="Reason — service recovery, promotion, staff rate…"
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
              />
            </div>
            <p className="text-detail text-ink-500">
              Applied after the membership credit. The reason is recorded on the ledger row.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="label-eyebrow">ORDER NOTE</p>
            <Textarea
              rows={2}
              placeholder="Anything fulfillment needs to know."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </CardContent>
        </Card>

        <ValidationPanel errors={errors} warnings={warnings} />

        <Button
          variant="primary"
          className="h-11 w-full"
          disabled={!ready || placed !== null}
          onClick={handlePlace}
        >
          <Package className="h-4 w-4" />
          {ready
            ? `Place order · ${centsToDollars(pricing.totalCents)}`
            : `${errors.length} problem${errors.length === 1 ? "" : "s"} to resolve`}
        </Button>

        {placed && <PlacedPanel placed={placed} onReset={clearClient} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Member picker
// ---------------------------------------------------------------------------

function MemberPicker({
  query,
  setQuery,
  matches,
  client,
  onSelect,
  onClear,
  membershipTier,
}: {
  query: string;
  setQuery: (v: string) => void;
  matches: Client[];
  client?: Client;
  onSelect: (id: string) => void;
  onClear: () => void;
  membershipTier?: string;
}) {
  const showResults = !client && matches.length > 0;

  return (
    <Card>
      <CardContent className="p-5">
        <p className="label-eyebrow">MEMBER</p>

        {client ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-ink-700 bg-ink-900/60 p-3">
            <Monogram client={client} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-medium text-ink-50">{clientName(client)}</p>
              <p className="stat-mono truncate text-detail text-ink-500">
                {client.mrn} · {locationMap[client.locationId]?.short}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {membershipTier && <Badge tone="gold">{membershipTier}</Badge>}
              <Badge tone="neutral">Coach {staffName(client.coachId)}</Badge>
              <Badge tone="neutral">Provider {staffName(client.providerId)}</Badge>
              <Button variant="ghost" size="icon" onClick={onClear} aria-label="Clear member">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
            <Input
              className="pl-9"
              placeholder="Search by name, email or MRN…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {showResults && (
              <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-ink-700 bg-ink-850 shadow-card">
                {matches.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onSelect(c.id)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-ink-800 focus-ring"
                  >
                    <Monogram client={c} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body text-ink-100">{clientName(c)}</span>
                      <span className="stat-mono block truncate text-micro text-ink-500">
                        {c.mrn} · {locationMap[c.locationId]?.short}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <p className="mt-2 text-detail text-ink-500">
              Selecting a member fills in their location, coach, provider and plan.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

function CatalogPicker({
  items,
  qty,
  onBump,
  line,
  setLine,
  lines,
  query,
  setQuery,
}: {
  items: CatalogItem[];
  qty: QtyMap;
  onBump: (sku: string, by: number) => void;
  line: ServiceLine | "all";
  setLine: (l: ServiceLine | "all") => void;
  lines: ServiceLine[];
  query: string;
  setQuery: (v: string) => void;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="label-eyebrow">CATALOG</p>
          <span className="stat-mono text-detail text-ink-500">{items.length} items</span>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <Input
            className="pl-9"
            placeholder="Filter the catalog…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Chips scroll horizontally inside their own container so the page
            itself never scrolls sideways at 390px. */}
        <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
          <Chip active={line === "all"} onClick={() => setLine("all")}>
            All
          </Chip>
          {lines.map((l) => (
            <Chip key={l} active={line === l} onClick={() => setLine(l)}>
              {l}
            </Chip>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {items.length === 0 && (
            <EmptyState
              title="Nothing matches"
              hint="Clear the filter, or check whether this item is offered at this location."
            />
          )}
          {items.map((item) => (
            <CatalogRow key={item.sku} item={item} qty={qty[item.sku] ?? 0} onBump={onBump} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CatalogRow({
  item,
  qty,
  onBump,
}: {
  item: CatalogItem;
  qty: number;
  onBump: (sku: string, by: number) => void;
}) {
  const selected = qty > 0;
  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition-colors",
        selected ? "border-gold-500/40 bg-gold-500/[0.06]" : "border-ink-700 bg-ink-900/40",
      )}
    >
      <div className="flex items-start gap-3">
        {/* The whole row is the add target — clicking again increments, which is
            what a coach actually does when a member takes two vials. */}
        <button
          onClick={() => onBump(item.sku, 1)}
          className="min-w-0 flex-1 text-left focus-ring rounded-lg"
          aria-label={`Add ${item.name}`}
        >
          <p className="truncate text-body font-medium text-ink-50">{item.name}</p>
          <p className="stat-mono mt-0.5 truncate text-micro text-ink-500">
            {item.sku}
            {item.packSize ? ` · ${item.packSize}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">{KIND_LABEL[item.kind]}</Badge>
            {item.fulfillment === "in-clinic" && <Badge tone="info">In clinic</Badge>}
            {item.requiresProviderApproval && (
              <Badge tone="watch">
                <ShieldCheck className="h-3 w-3" />
                Rx sign-off
              </Badge>
            )}
          </div>
        </button>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="stat-mono text-body text-ink-100">{centsToDollars(item.unitPriceCents)}</span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={qty === 0}
              onClick={() => onBump(item.sku, -1)}
              aria-label={`Remove one ${item.name}`}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <span className="stat-mono w-6 text-center text-body text-ink-100">{qty}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onBump(item.sku, 1)}
              aria-label={`Add one ${item.name}`}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-detail transition-colors focus-ring",
        active
          ? "border-gold-500/50 bg-gold-500/15 text-gold-300"
          : "border-ink-700 text-ink-300 hover:border-ink-600 hover:text-ink-100",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Live total
// ---------------------------------------------------------------------------

function SummaryPanel({
  pricing,
  onBump,
  membershipTier,
}: {
  pricing: ReturnType<typeof priceLines>;
  onBump: (sku: string, by: number) => void;
  membershipTier?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="label-eyebrow">THIS ORDER</p>
          {membershipTier && <Badge tone="gold">{membershipTier}</Badge>}
        </div>

        {pricing.lines.length === 0 ? (
          <p className="mt-3 text-body text-ink-500">
            Nothing added yet. Tap a catalog row to add it.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {pricing.lines.map((l) => (
              <li key={l.sku} className="flex items-start gap-2">
                <button
                  onClick={() => onBump(l.sku, -1)}
                  className="mt-0.5 shrink-0 rounded text-ink-500 transition-colors hover:text-high focus-ring"
                  aria-label={`Remove one ${l.name}`}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-ink-100">{l.name}</span>
                  <span className="stat-mono block text-micro text-ink-500">
                    {l.qty} × {centsToDollars(l.unitPriceCents)}
                  </span>
                </span>
                <span className="stat-mono shrink-0 text-body text-ink-100">
                  {centsToDollars(l.extendedCents)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 space-y-2 border-t border-ink-700 pt-4">
          <MoneyRow label="Subtotal" cents={pricing.subtotalCents} basis={pricing.basis.subtotal} />
          <MoneyRow
            label="Protocol credit"
            cents={-pricing.creditAppliedCents}
            basis={pricing.basis.credit}
            tone={pricing.creditAppliedCents > 0 ? "optimal" : "muted"}
          />
          <MoneyRow
            label="Discount"
            cents={-pricing.discountCents}
            basis={pricing.basis.discount}
            tone={pricing.discountCents > 0 ? "watch" : "muted"}
          />
          <div className="flex items-baseline justify-between gap-3 border-t border-ink-700 pt-3">
            <span className="text-body font-medium text-ink-100">Total due</span>
            <span className="stat-mono text-heading font-semibold text-ink-50">
              {centsToDollars(pricing.totalCents)}
            </span>
          </div>
          {/* The read-aloud line. A coach should never have to guess why an
              order costs what it costs. */}
          <p className="text-micro leading-relaxed text-ink-500">{pricing.basis.total}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MoneyRow({
  label,
  cents,
  basis,
  tone = "muted",
}: {
  label: string;
  cents: number;
  basis: string;
  tone?: "muted" | "optimal" | "watch";
}) {
  const color =
    tone === "optimal" ? "text-optimal" : tone === "watch" ? "text-watch" : "text-ink-300";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-detail text-ink-400">{label}</span>
        <span className={cn("stat-mono text-body", color)}>
          {cents === 0 ? centsToDollars(0) : centsToDollars(cents)}
        </span>
      </div>
      <p className="mt-0.5 text-micro leading-relaxed text-ink-600">{basis}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function ValidationPanel({
  errors,
  warnings,
}: {
  errors: OrderProblem[];
  warnings: OrderProblem[];
}) {
  if (errors.length === 0 && warnings.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-optimal/25 bg-optimal/[0.06] p-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-optimal" />
        <p className="text-detail text-ink-300">Nothing blocking. This order is ready to place.</p>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <p className="label-eyebrow">BEFORE THIS CAN BE PLACED</p>
        {errors.map((p, i) => (
          <ProblemRow key={`e${i}`} problem={p} />
        ))}
        {warnings.map((p, i) => (
          <ProblemRow key={`w${i}`} problem={p} />
        ))}
      </CardContent>
    </Card>
  );
}

function ProblemRow({ problem }: { problem: OrderProblem }) {
  const isError = problem.severity === "error";
  const Icon = isError ? AlertTriangle : Info;
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border p-2.5",
        isError ? "border-high/25 bg-high/[0.06]" : "border-ink-700 bg-ink-900/50",
      )}
    >
      <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", isError ? "text-high" : "text-watch")} />
      <div className="min-w-0">
        <p className="text-detail text-ink-100">{problem.message}</p>
        <p className="mt-0.5 text-micro text-ink-500">{problem.fix}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

function PlacedPanel({
  placed,
  onReset,
}: {
  placed: { order: Order; row: LedgerRow; totalCents: number };
  onReset: () => void;
}) {
  const { order, row, totalCents } = placed;
  return (
    <FadeIn>
      <Card className="border-optimal/30">
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="label-eyebrow">ORDER PLACED</p>
            <Badge tone="optimal">{order.status}</Badge>
          </div>

          <p className="stat-mono text-heading font-semibold text-ink-50">{order.id}</p>

          <ul className="space-y-1">
            {order.lines.map((l) => (
              <li key={l.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-detail text-ink-300">
                  {l.qty} × {l.name}
                </span>
                <span className="stat-mono shrink-0 text-detail text-ink-400">
                  {centsToDollars(l.unitPriceCents * l.qty)}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex items-baseline justify-between gap-3 border-t border-ink-700 pt-3">
            <span className="text-detail text-ink-400">Charged</span>
            <span className="stat-mono text-body text-ink-50">{centsToDollars(totalCents)}</span>
          </div>

          {/* The committed ledger row id, shown rather than hidden. This is the
              receipt: the order and the record of it are the same event. */}
          <p className="stat-mono text-micro text-ink-500">
            Ledger {row.id} · {shortHash(row.hash)}
          </p>
          <p className="text-micro leading-relaxed text-ink-600">
            Submitted to fulfillment and now visible in the member&apos;s portal. The MedSource
            hand-off is demo-only — nothing left this browser.
          </p>

          <Button variant="outline" className="w-full" onClick={onReset}>
            Place another order
          </Button>
        </CardContent>
      </Card>
    </FadeIn>
  );
}

function ToggleHalf({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-detail transition-colors focus-ring",
        active ? "bg-gold-500 text-white" : "text-ink-300 hover:text-ink-100",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

export default OrderForm;
