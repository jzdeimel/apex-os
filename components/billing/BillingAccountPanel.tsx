"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CreditCard, FileText, RefreshCw } from "lucide-react";

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";

type BillingAccount = {
  person: { id: string; firstName: string; lastName: string; preferredName: string | null; status: string; homeLocationId: string | null };
  memberships: Array<{ id: string; planCode: string; planName: string; status: string; monthlyRateCents: number; startedOn: string; nextBillOn: string | null; merchantAccountId: string; ledgerId: string | null }>;
  events: Array<{ id: string; membershipId: string; fromStatus: string | null; toStatus: string; effectiveAt: string; reason: string; ledgerId: string }>;
  paymentMethods: Array<{ id: string; processor: string; brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null; isDefault: boolean; removedAt: string | null }>;
  invoices: Array<{ id: string; number: string; issuedAt: string; dueAt: string | null; subtotalCents: number; discountCents: number; taxCents: number; totalCents: number; paidCents: number; status: string; ledgerId: string | null }>;
  lines: Array<{ id: string; invoiceId: string; description: string; quantity: number; unitPriceCents: number; totalCents: number; hsaEligibility: string }>;
  attempts: Array<{ id: string; invoiceId: string | null; amountCents: number; status: string; processor: string; attemptedAt: string; failureMessage: string | null }>;
};

type Permissions = { manageMembership: boolean; createInvoice: boolean; reconcilePayment: boolean; refund: boolean };

function newRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function day(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function BillingAccountPanel({ clientId }: { clientId: string }) {
  const [account, setAccount] = useState<BillingAccount | null>(null);
  const [permissions, setPermissions] = useState<Permissions>({ manageMembership: false, createInvoice: false, reconcilePayment: false, refund: false });
  const [transport, setTransport] = useState("not-enabled");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [planName, setPlanName] = useState("Alpha Health Membership");
  const [planCode, setPlanCode] = useState("ALPHA-MONTHLY");
  const [monthlyRate, setMonthlyRate] = useState("");
  const [startedOn, setStartedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [nextBillOn, setNextBillOn] = useState("");
  const [membershipRequest, setMembershipRequest] = useState(newRequestId);
  const [transitionReason, setTransitionReason] = useState("");
  const [transitionRequest, setTransitionRequest] = useState(newRequestId);

  const [lineDescription, setLineDescription] = useState("");
  const [lineAmount, setLineAmount] = useState("");
  const [hsaEligibility, setHsaEligibility] = useState<"eligible" | "ineligible" | "unknown">("unknown");
  const [invoiceRequest, setInvoiceRequest] = useState(newRequestId);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/billing/accounts?clientId=${encodeURIComponent(clientId)}`, { headers: { Accept: "application/json" } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Billing history is unavailable.");
      setAccount(body.account);
      setPermissions(body.permissions);
      setTransport(body.paymentTransport);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Billing history is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  const currentMembership = useMemo(
    () => account?.memberships.find((row) => ["active", "paused", "past_due"].includes(row.status)) ?? null,
    [account],
  );

  async function mutate(path: string, method: "POST" | "PATCH", body: Record<string, unknown>, success: string) {
    setWorking(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error ?? "The billing update was not confirmed.");
      setNotice(`${success}${result.duplicate ? " (existing request returned safely)" : ""}`);
      await load();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The billing update was not confirmed.");
      return false;
    } finally {
      setWorking(false);
    }
  }

  async function createMembership() {
    const cents = Math.round(Number(monthlyRate) * 100);
    if (!monthlyRate || !Number.isSafeInteger(cents) || cents < 0) return setError("Enter a valid monthly rate.");
    const ok = await mutate("/api/billing/memberships", "POST", {
      clientId,
      requestId: membershipRequest,
      planCode,
      planName,
      monthlyRateCents: cents,
      startedOn,
      nextBillOn: nextBillOn || undefined,
    }, "Membership created and audit-witnessed.");
    if (ok) setMembershipRequest(newRequestId());
  }

  async function transition(toStatus: "active" | "paused" | "cancelled") {
    if (!currentMembership || transitionReason.trim().length < 3) return setError("Enter a reason before changing the membership.");
    const ok = await mutate("/api/billing/memberships", "PATCH", {
      membershipId: currentMembership.id,
      requestId: transitionRequest,
      toStatus,
      reason: transitionReason.trim(),
      nextBillOn: toStatus === "active" && nextBillOn ? nextBillOn : undefined,
    }, `Membership moved to ${toStatus}.`);
    if (ok) {
      setTransitionReason("");
      setTransitionRequest(newRequestId());
    }
  }

  async function createInvoice() {
    const cents = Math.round(Number(lineAmount) * 100);
    if (!lineDescription.trim() || !lineAmount || !Number.isSafeInteger(cents) || cents < 0) return setError("Enter an invoice description and valid amount.");
    const ok = await mutate("/api/billing/invoices", "POST", {
      clientId,
      requestId: invoiceRequest,
      membershipId: currentMembership?.id,
      lines: [{ description: lineDescription.trim(), quantity: 1, unitPriceCents: cents, hsaEligibility }],
    }, "Invoice issued and audit-witnessed.");
    if (ok) {
      setLineDescription("");
      setLineAmount("");
      setInvoiceRequest(newRequestId());
    }
  }

  if (loading && !account) return <p className="text-detail text-ink-500">Loading authoritative billing record…</p>;
  if (!account) return <EmptyState icon={<CreditCard className="h-6 w-6" />} title={error ?? "Billing record unavailable"} />;

  return (
    <div className="space-y-5">
      {error && <p className="rounded-lg border border-high/30 bg-high/[0.06] px-3 py-2 text-detail text-high">{error}</p>}
      {notice && <p className="rounded-lg border border-optimal/30 bg-optimal/[0.06] px-3 py-2 text-detail text-optimal">{notice}</p>}

      <Card>
        <CardHeader className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Membership contract</CardTitle>
            <p className="mt-1 text-detail text-ink-500">Current state is derived from immutable lifecycle events.</p>
          </div>
          {currentMembership && <Badge tone={currentMembership.status === "active" ? "optimal" : currentMembership.status === "past_due" ? "high" : "watch"}>{currentMembership.status}</Badge>}
        </CardHeader>
        <CardContent className="space-y-4">
          {currentMembership ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <Fact label="Plan" value={currentMembership.planName} />
              <Fact label="Monthly rate" value={money(currentMembership.monthlyRateCents)} />
              <Fact label="Started" value={day(currentMembership.startedOn)} />
              <Fact label="Next bill" value={day(currentMembership.nextBillOn)} />
            </div>
          ) : <EmptyState title="No current membership" hint="Billing staff can create a verified contract below." />}

          {permissions.manageMembership && !currentMembership && (
            <div className="grid grid-cols-1 gap-2 rounded-xl border border-ink-800 bg-ink-900/40 p-4 sm:grid-cols-2">
              <Input label="Plan name" value={planName} onChange={setPlanName} />
              <Input label="Plan code" value={planCode} onChange={setPlanCode} />
              <Input label="Monthly rate ($)" value={monthlyRate} onChange={setMonthlyRate} inputMode="decimal" />
              <Input label="Start date" value={startedOn} onChange={setStartedOn} type="date" />
              <Input label="First bill date (optional)" value={nextBillOn} onChange={setNextBillOn} type="date" />
              <div className="flex items-end"><Button variant="primary" disabled={working} onClick={() => void createMembership()}>Create membership</Button></div>
            </div>
          )}

          {permissions.manageMembership && currentMembership && (
            <div className="rounded-xl border border-ink-800 bg-ink-900/40 p-4">
              <Input label="Required change reason" value={transitionReason} onChange={setTransitionReason} />
              <div className="mt-3 flex flex-wrap gap-2">
                {currentMembership.status !== "active" && <Button variant="primary" disabled={working} onClick={() => void transition("active")}>Resume</Button>}
                {currentMembership.status !== "paused" && <Button variant="outline" disabled={working} onClick={() => void transition("paused")}>Pause</Button>}
                <Button variant="outline" disabled={working} onClick={() => void transition("cancelled")}>Cancel</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoices and collections</CardTitle>
          <p className="mt-1 text-detail text-ink-500">Issued invoices are immutable. Payments become collected cash only after processor reconciliation.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {transport !== "clover-configured" && (
            <div className="flex items-start gap-2 rounded-lg border border-watch/25 bg-watch/[0.06] p-3 text-detail text-ink-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-watch" />
              Clover transport is not enabled. Apex will preserve contracts and invoices but will not pretend a card was charged.
            </div>
          )}
          {account.invoices.length === 0 ? <EmptyState icon={<FileText className="h-6 w-6" />} title="No authoritative invoices" /> : account.invoices.map((bill) => (
            <div key={bill.id} className="rounded-xl border border-ink-800 bg-ink-900/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="stat-mono text-body text-ink-100">{bill.number}</p><p className="text-micro text-ink-500">Issued {day(bill.issuedAt)} · ledger {bill.ledgerId?.slice(0, 12) ?? "pending"}</p></div>
                <div className="text-right"><Badge tone={bill.status === "paid" ? "optimal" : bill.status === "open" ? "watch" : "neutral"}>{bill.status}</Badge><p className="stat-mono mt-1 text-heading text-ink-50">{money(bill.totalCents)}</p><p className="text-micro text-ink-500">{money(bill.paidCents)} collected</p></div>
              </div>
              <div className="mt-3 space-y-1 border-t border-ink-800 pt-3">
                {account.lines.filter((line) => line.invoiceId === bill.id).map((line) => <div key={line.id} className="flex justify-between gap-3 text-detail"><span className="text-ink-300">{line.description} × {line.quantity}</span><span className="stat-mono text-ink-200">{money(line.totalCents)}</span></div>)}
              </div>
            </div>
          ))}

          {permissions.createInvoice && (
            <div className="grid grid-cols-1 gap-2 rounded-xl border border-ink-800 bg-ink-900/40 p-4 sm:grid-cols-3">
              <Input label="Invoice description" value={lineDescription} onChange={setLineDescription} />
              <Input label="Amount ($)" value={lineAmount} onChange={setLineAmount} inputMode="decimal" />
              <label className="text-micro text-ink-500">HSA/FSA eligibility<select value={hsaEligibility} onChange={(event) => setHsaEligibility(event.target.value as typeof hsaEligibility)} className="mt-1 h-9 w-full rounded-lg border border-ink-700 bg-ink-900 px-3 text-body text-ink-100"><option value="unknown">Unknown</option><option value="eligible">Eligible</option><option value="ineligible">Ineligible</option></select></label>
              <div className="sm:col-span-3"><Button variant="primary" disabled={working} onClick={() => void createInvoice()}><FileText className="h-4 w-4" /> Issue invoice</Button></div>
            </div>
          )}
          <Button variant="ghost" size="sm" disabled={loading} onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" /> Refresh billing record</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-3"><p className="label-eyebrow">{label}</p><p className="mt-1 text-body text-ink-100">{value}</p></div>;
}

function Input({ label, value, onChange, type = "text", inputMode }: { label: string; value: string; onChange: (value: string) => void; type?: string; inputMode?: "decimal" }) {
  return <label className="text-micro text-ink-500">{label}<input type={type} inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-ink-700 bg-ink-900 px-3 text-body text-ink-100" /></label>;
}
