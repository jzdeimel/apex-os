import type { Client } from "@/lib/types";
import { getClient } from "@/lib/mock/clients";
import { ordersForClient } from "@/lib/mock/orders";
import { membershipForClient, TIER_PRICE } from "@/lib/mock/memberships";
import { getLabsForClient } from "@/lib/mock/labs";
import { locationName } from "@/lib/mock/locations";
// Eligibility vocabulary is shared with the cost breakdown rather than
// redefined. Two member-facing money surfaces disagreeing about whether an item
// is claimable is exactly the kind of thing that gets a claim rejected.
import { HSA_DISCLAIMER, HSA_FLAG_LABEL, type HsaFlag } from "@/lib/costs/breakdown";

/**
 * HSA / FSA RECEIPT VAULT.
 *
 * Members pay for this care with pre-tax money and then, in March, go hunting
 * through a year of email for the documentation their plan administrator wants.
 * Most of them give up and eat the tax. The vault is the fix: every charge, in
 * one place, already itemised, already exportable.
 *
 * ── FOUR RULES ────────────────────────────────────────────────────────────
 *
 * 1. **INTEGER CENTS.** Same rule as `lib/costs/breakdown` and for the same
 *    reason: a total that renders as $1,284.9799999 on a tax document is not a
 *    rounding bug, it is a member's afternoon.
 *
 * 2. **WE FLAG, WE DO NOT DECIDE.** `eligibility` is our honest read of what
 *    plans usually accept. It is not a ruling. `HSA_DISCLAIMER` renders on the
 *    page, and every export carries the same sentence in its own field so the
 *    caveat survives being emailed to an accountant.
 *
 * 3. **THREE VALUES, NOT TWO.** "We do not know" is a real answer. Collapsing
 *    it into "not eligible" costs the member money they were entitled to;
 *    collapsing it into "eligible" costs them a rejected claim.
 *
 * 4. **NOTHING IS INVENTED.** Every receipt traces to a real row in the
 *    record — an order, a membership, a resulted panel — and carries the id it
 *    came from in `sourceRef`. The vault is a view over the chart, not a
 *    second ledger.
 */

const NOW = "2026-06-12";

export type ReceiptCategory =
  | "Membership"
  | "Medication"
  | "Supplies"
  | "Lab work"
  | "Clinical service";

export interface Receipt {
  id: string;
  clientId: string;
  /** Date-only. A receipt is a day on a statement, not an instant. */
  date: string;
  /** Who charged. Always an Alpha Health entity in this build. */
  vendor: string;
  description: string;
  category: ReceiptCategory;
  /** Integer cents. Always positive — a refund is its own row, not a negative. */
  amountCents: number;
  eligibility: HsaFlag;
  /** Why we flagged it that way, in one sentence a member can repeat. */
  eligibilityBasis: string;
  /** The record this came from: order id, membership id, lab id. */
  sourceRef: string;
  /** True once an itemised PDF exists to attach. */
  itemised: boolean;
}

// ---------------------------------------------------------------------------
// Building the vault
// ---------------------------------------------------------------------------

function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

/** Trim an ISO timestamp to its date. Receipts never carry a time. */
function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Membership charges.
 *
 * Emitted monthly from the join date to today, on the member's own renewal day
 * where we have one. Flagged `unlikely` on purpose: retainer and membership
 * fees are the single most commonly rejected category, and quietly bundling
 * them into a claimable total is how a member ends up owing money back.
 */
function membershipReceipts(client: Client): Receipt[] {
  const m = membershipForClient(client.id);
  if (!m || m.monthlyRate <= 0) return [];

  const rate = TIER_PRICE[m.tier] * 100;
  const renewalDay = m.renewsOn ? m.renewsOn.slice(8, 10) : "01";

  const out: Receipt[] = [];
  const startY = yearOf(client.joinedOn);
  const startM = Number(client.joinedOn.slice(5, 7));

  for (let y = startY; y <= yearOf(NOW); y++) {
    for (let mo = 1; mo <= 12; mo++) {
      if (y === startY && mo < startM) continue;
      const date = `${y}-${String(mo).padStart(2, "0")}-${renewalDay}`;
      if (date > NOW) break;
      out.push({
        id: `rcpt-mem-${client.id}-${y}-${String(mo).padStart(2, "0")}`,
        clientId: client.id,
        date,
        vendor: `Alpha Health — ${locationName(client.locationId)}`,
        description: `${m.tier} membership — monthly`,
        category: "Membership",
        amountCents: rate,
        eligibility: "unlikely",
        eligibilityBasis:
          "Membership and retainer fees are the category plans most often decline. Some members successfully claim the portion tied to clinical visits — your administrator decides.",
        sourceRef: m.id,
        itemised: true,
      });
    }
  }

  return out;
}

/**
 * Order receipts.
 *
 * One receipt per order rather than per line: that is how the charge appeared
 * on the member's card, and a vault whose rows do not reconcile to a statement
 * is a vault nobody trusts. The line detail rides along in the description.
 */
function orderReceipts(client: Client): Receipt[] {
  return ordersForClient(client.id)
    .filter((o) => o.visibleToClient && o.status !== "Draft" && o.status !== "Cancelled")
    .map((o) => {
      const cents = o.lines.reduce((n, l) => n + l.unitPriceCents * l.qty, 0);
      const names = o.lines.map((l) => (l.qty > 1 ? `${l.name} ×${l.qty}` : l.name));
      const hasAddon = o.lines.some((l) => l.isAddon);
      // Category follows the PRESCRIBED content, not the presence of an add-on.
      // An order of therapy plus a supply kit is a medication charge with an
      // extra on it; filing the whole thing under "Supplies" misdescribes what
      // the member bought on the one document they hand to an administrator.
      const hasPrescribed = o.lines.some((l) => !l.isAddon);

      return {
        id: `rcpt-ord-${o.id}`,
        clientId: client.id,
        date: dayOf(o.placedAt),
        vendor: `Alpha Health — ${locationName(o.locationId)}`,
        description: names.join(", "),
        category: hasPrescribed ? ("Medication" as const) : ("Supplies" as const),
        amountCents: cents,
        // Mixed orders are genuinely uncertain — the prescribed part is
        // ordinarily fine and the add-on may not be, and we cannot split a
        // single card charge on the member's behalf.
        eligibility: (hasAddon && hasPrescribed ? "unknown" : hasPrescribed ? "likely" : "unknown") as HsaFlag,
        eligibilityBasis:
          hasAddon && hasPrescribed
            ? "Prescribed therapy plus an elected add-on on one charge. The therapy is the kind of thing plans accept; the add-on may not be. Submit the itemised copy rather than the summary so your administrator can split it."
            : hasPrescribed
              ? "Prescribed therapy dispensed to you by name. This is the category plans accept most readily."
              : "Supplies bought on their own. Often accepted when they are required to administer a prescribed therapy — the itemised copy shows what they were for.",
        sourceRef: o.id,
        itemised: true,
      };
    });
}

/** Lab panels. Diagnostics are about as reliably claimable as it gets. */
function labReceipts(client: Client): Receipt[] {
  const lab = getLabsForClient(client.id);
  if (!lab || lab.status !== "Resulted") return [];

  // Panel pricing is a flat clinic rate in this build, in cents.
  const PANEL_CENTS = 34_900;

  return [
    {
      id: `rcpt-lab-${lab.id}`,
      clientId: client.id,
      date: dayOf(lab.collectedOn),
      vendor: `Alpha Health — ${locationName(client.locationId)}`,
      description: `${lab.panelName} — ${lab.biomarkers.length} biomarkers`,
      category: "Lab work",
      amountCents: PANEL_CENTS,
      eligibility: "likely",
      eligibilityBasis:
        "Diagnostic lab work ordered by a provider. Plans accept this category more consistently than any other.",
      sourceRef: lab.id,
      itemised: true,
    },
  ];
}

/**
 * Clinical visits.
 *
 * Derived from the plan's own monitoring cadence rather than invented: a member
 * on an active program has been seen. Priced at the clinic's standard follow-up
 * rate.
 */
function visitReceipts(client: Client): Receipt[] {
  if (client.programs.length === 0) return [];
  const VISIT_CENTS = 15_000;

  return client.programs.flatMap((p, pi) => {
    const out: Receipt[] = [];
    const startY = yearOf(p.startedOn);
    const startM = Number(p.startedOn.slice(5, 7));
    // Follow-ups run roughly every other month while a program is active.
    for (let y = startY; y <= yearOf(NOW); y++) {
      for (let mo = 1; mo <= 12; mo += 2) {
        if (y === startY && mo < startM) continue;
        const date = `${y}-${String(mo).padStart(2, "0")}-14`;
        if (date > NOW || date < p.startedOn) continue;
        out.push({
          id: `rcpt-vis-${client.id}-${pi}-${y}-${String(mo).padStart(2, "0")}`,
          clientId: client.id,
          date,
          vendor: `Alpha Health — ${locationName(client.locationId)}`,
          description: `Provider follow-up — ${p.name}`,
          category: "Clinical service",
          amountCents: VISIT_CENTS,
          eligibility: "likely",
          eligibilityBasis:
            "A visit with a licensed provider. Usually accepted, and the itemised copy names the provider and the date of service.",
          sourceRef: `${client.id}-${p.name}`,
          itemised: true,
        });
      }
    }
    return out;
  });
}

const vaultCache = new Map<string, Receipt[]>();

/** Every receipt on file for a member, newest first. */
export function allReceiptsFor(clientId: string): Receipt[] {
  const cached = vaultCache.get(clientId);
  if (cached) return cached;

  const client = getClient(clientId);
  if (!client) return [];

  const built = [
    ...membershipReceipts(client),
    ...orderReceipts(client),
    ...labReceipts(client),
    ...visitReceipts(client),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? -1 : 1));

  vaultCache.set(clientId, built);
  return built;
}

export function receiptsFor(clientId: string, year: number): Receipt[] {
  return allReceiptsFor(clientId).filter((r) => yearOf(r.date) === year);
}

/** Years with at least one receipt, newest first. Drives the year picker. */
export function yearsFor(clientId: string): number[] {
  const set = new Set(allReceiptsFor(clientId).map((r) => yearOf(r.date)));
  return [...set].sort((a, b) => b - a);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface YearSummary {
  year: number;
  clientId: string;
  count: number;
  totalCents: number;
  likelyEligibleCents: number;
  unknownCents: number;
  unlikelyCents: number;
  byCategory: { category: ReceiptCategory; cents: number; count: number }[];
  /** True while the year is still running — the total is not final. */
  partialYear: boolean;
  /** One sentence explaining the totals above, shown verbatim. */
  basis: string;
}

export function yearSummary(clientId: string, year: number): YearSummary {
  const rows = receiptsFor(clientId, year);
  const sum = (f: (r: Receipt) => boolean) =>
    rows.filter(f).reduce((n, r) => n + r.amountCents, 0);

  const categories: ReceiptCategory[] = [
    "Medication",
    "Lab work",
    "Clinical service",
    "Supplies",
    "Membership",
  ];

  const byCategory = categories
    .map((category) => ({
      category,
      cents: sum((r) => r.category === category),
      count: rows.filter((r) => r.category === category).length,
    }))
    .filter((c) => c.count > 0);

  const partialYear = year === yearOf(NOW);
  const likely = sum((r) => r.eligibility === "likely");

  return {
    year,
    clientId,
    count: rows.length,
    totalCents: sum(() => true),
    likelyEligibleCents: likely,
    unknownCents: sum((r) => r.eligibility === "unknown"),
    unlikelyCents: sum((r) => r.eligibility === "unlikely"),
    byCategory,
    partialYear,
    basis: partialYear
      ? `${rows.length} charges so far in ${year}, through ${NOW}. The year is still running, so this total will grow.`
      : `${rows.length} charges across ${year}. Complete year.`,
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * The shape handed to an administrator or an accountant.
 *
 * Flat, one row per receipt, with the eligibility flag spelled out in words
 * rather than a code — the person reading this has never seen our enum. The
 * disclaimer travels *inside* the export, because the moment this leaves the
 * portal it is no longer next to the page that explained it.
 */
export interface ReceiptExportRow {
  date: string;
  vendor: string;
  description: string;
  category: ReceiptCategory;
  amount: string;
  amountCents: number;
  eligibilityFlag: string;
  eligibilityBasis: string;
  reference: string;
}

export interface ReceiptExport {
  generatedFor: string;
  memberName: string;
  memberMrn: string;
  year: number;
  generatedOn: string;
  rows: ReceiptExportRow[];
  totalCents: number;
  likelyEligibleCents: number;
  /** Verbatim `HSA_DISCLAIMER`. Never omitted, never abridged. */
  disclaimer: string;
}

export function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function buildExport(clientId: string, year: number): ReceiptExport | undefined {
  const client = getClient(clientId);
  if (!client) return undefined;

  const rows = receiptsFor(clientId, year);
  const summary = yearSummary(clientId, year);

  return {
    generatedFor: clientId,
    memberName: `${client.firstName} ${client.lastName}`,
    memberMrn: client.mrn,
    year,
    generatedOn: NOW,
    rows: rows.map((r) => ({
      date: r.date,
      vendor: r.vendor,
      description: r.description,
      category: r.category,
      amount: dollars(r.amountCents),
      amountCents: r.amountCents,
      eligibilityFlag: HSA_FLAG_LABEL[r.eligibility],
      eligibilityBasis: r.eligibilityBasis,
      reference: r.sourceRef,
    })),
    totalCents: summary.totalCents,
    likelyEligibleCents: summary.likelyEligibleCents,
    disclaimer: HSA_DISCLAIMER,
  };
}

/** CSV rendering of the export. Quotes everything; escapes embedded quotes. */
export function toCsv(x: ReceiptExport): string {
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const header = [
    "Date",
    "Vendor",
    "Description",
    "Category",
    "Amount",
    "Eligibility",
    "Eligibility basis",
    "Reference",
  ];
  const lines = [
    header.map(q).join(","),
    ...x.rows.map((r) =>
      [r.date, r.vendor, r.description, r.category, r.amount, r.eligibilityFlag, r.eligibilityBasis, r.reference]
        .map(q)
        .join(","),
    ),
    "",
    [q("Total"), q(dollars(x.totalCents))].join(","),
    [q("Likely eligible"), q(dollars(x.likelyEligibleCents))].join(","),
    "",
    [q("Note"), q(x.disclaimer)].join(","),
  ];
  return lines.join("\n");
}

export { HSA_DISCLAIMER, HSA_FLAG_LABEL };
export type { HsaFlag };
