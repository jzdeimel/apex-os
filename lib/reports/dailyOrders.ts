import type { Order, OrderStatus } from "@/lib/orders/types";
import { orders } from "@/lib/mock/orders";
import {
  isStuck,
  isException,
  isTerminal,
  stuckReason,
  orderTotalCents,
  hoursInStatus,
} from "@/lib/orders/lifecycle";
import { clientMap, clientName } from "@/lib/mock/clients";
import { staffName } from "@/lib/mock/staff";
import { locationName } from "@/lib/mock/locations";
import { currency, formatDateTime, absolute } from "@/lib/utils";

/**
 * THE DAILY ORDER REPORT.
 *
 * One page, every order the clinic placed today, grouped by the coach who
 * placed it, with the failures pulled to the top. Ops reads it at close of
 * business and the front desk reads it at open. It is the last systematic
 * chance to catch an order that never landed before a member notices first.
 *
 * ── WHY THE AUDITED SYSTEM'S VERSION UNDERCOUNTS ──────────────────────────
 * Its daily report is not derived from orders at all. It is derived from the
 * activity log: it scans audit rows and keeps the ones whose description
 * begins with a hardcoded set of prefixes — the string literals someone typed
 * while writing the report, matched against strings someone else typed while
 * writing the order-creation path. Those two sets of literals were never the
 * same set, and nothing in the type system or the tests could notice.
 *
 * The consequences are worse than "a few missing rows":
 *  - Orders created through any path whose log text drifted — a later refactor,
 *    a second entry point, a bulk reorder — are absent from the report with no
 *    error and no gap in the numbering.
 *  - The rows most likely to be missing are the unusual ones, because unusual
 *    paths are exactly the ones whose log text nobody kept in sync. The report
 *    is therefore least reliable precisely where it matters most.
 *  - A missing row is indistinguishable from a quiet day. Undercounting is
 *    invisible by construction: you cannot see the order that isn't there.
 *
 * So this report never reads log text. It derives from the order records
 * themselves — the same rows that drive fulfillment, the portal and billing.
 * If an order exists, it is on this report; if it is not on this report, it
 * does not exist. The audit ledger stays what it is: an attribution record,
 * not a source of operational counts.
 */

/** Pinned demo clock. */
export const NOW = "2026-06-12T09:00:00";

/** "The day" is a rolling 24h window ending now — the clinic doesn't stop at midnight. */
export const WINDOW_HOURS = 24;

const HOUR_MS = 1000 * 60 * 60;

function windowStart(nowIso: string, hours: number): string {
  const d = absolute(absolute(nowIso).getTime() - hours * HOUR_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  // Same naive local-wall-clock shape the order fixtures use — emitting UTC
  // here would reintroduce a timezone offset into every comparison below.
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

export type OrderFlagKind = "never-landed" | "stuck" | "exception" | "failed";

export interface OrderFlag {
  kind: OrderFlagKind;
  label: string;
  /** What ops does about it, in one sentence. */
  detail: string;
  severity: "critical" | "warning";
}

/**
 * Did this order actually reach the fulfillment partner?
 *
 * The test is evidence-based, not status-based: has MedSource ever spoken about
 * this order? A status of "Submitted" only proves Apex tried. A status event
 * sourced from `medsource` proves they received it. That distinction is the
 * entire failure mode — an order can sit in "Submitted" looking perfectly
 * normal while the submit call is still sitting undelivered in the outbox.
 */
export function reachedPartner(order: Order): boolean {
  return order.statusHistory.some((e) => e.source === "medsource");
}

export function flagsFor(order: Order, nowIso: string): OrderFlag[] {
  const flags: OrderFlag[] = [];

  if (order.status === "Failed") {
    flags.push({
      kind: "failed",
      label: "Failed",
      detail:
        "This order will not deliver. Confirm the member has been told, then replace it — a failed order nobody reissued is a member on no protocol.",
      severity: "critical",
    });
  }

  if (!isTerminal(order.status) && !reachedPartner(order)) {
    flags.push({
      kind: "never-landed",
      label: "Never reached MedSource",
      detail:
        order.status === "Draft"
          ? "Still a draft — it was never submitted. Nothing is being picked and the member is waiting on an order that does not exist."
          : "Apex sent it; MedSource has never acknowledged it. Check the outbox for an undelivered submit and re-drive it — the idempotency key makes a resend safe.",
      severity: "critical",
    });
  }

  if (isException(order.status)) {
    flags.push({
      kind: "exception",
      label: order.status,
      detail:
        order.status === "Insufficient stock"
          ? "MedSource cannot fill a line. Substitute, split the shipment, or cancel — nothing moves until a human decides."
          : "Held for pharmacist review. Needs a sign-off to release; it will not clear on its own.",
      severity: "warning",
    });
  }

  if (isStuck(order, nowIso)) {
    flags.push({
      kind: "stuck",
      label: "Past SLA",
      detail: stuckReason(order, nowIso) ?? "No movement past its service window.",
      severity: "warning",
    });
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Report shape
// ---------------------------------------------------------------------------

export interface ReportLine {
  sku: string;
  name: string;
  qty: number;
  extendedCents: number;
  isAddon: boolean;
  lotRef?: string;
}

export interface ReportOrder {
  id: string;
  clientId: string;
  clientName: string;
  mrn: string;
  locationLabel: string;
  status: OrderStatus;
  placedAt: string;
  lastActivity: string;
  hoursInStatus: number;
  medsourceRef?: string;
  tracking?: string;
  totalCents: number;
  lines: ReportLine[];
  flags: OrderFlag[];
  /**
   * True when the order fell outside today's window but is still open AND
   * flagged. Old failures do not age out of this report — an order stranded
   * six days ago is more urgent than one placed this morning, and a strict
   * 24-hour window would quietly drop it the day after it broke.
   */
  carriedForward: boolean;
}

export interface CoachGroup {
  coachId: string;
  coachName: string;
  orders: ReportOrder[];
  totalCents: number;
  flaggedCount: number;
}

export interface DailyOrderReport {
  generatedAt: string;
  windowStart: string;
  windowHours: number;
  groups: CoachGroup[];
  orderCount: number;
  unitCount: number;
  totalCents: number;
  /** Every flagged order across all coaches, most severe first. */
  flagged: ReportOrder[];
  neverLanded: ReportOrder[];
  stuck: ReportOrder[];
  exceptions: ReportOrder[];
  carriedForwardCount: number;
}

function toReportOrder(
  order: Order,
  nowIso: string,
  carriedForward: boolean,
): ReportOrder {
  const client = clientMap[order.clientId];
  return {
    id: order.id,
    clientId: order.clientId,
    clientName: client ? clientName(client) : order.clientId,
    mrn: client?.mrn ?? "—",
    locationLabel: locationName(order.locationId),
    status: order.status,
    placedAt: order.placedAt,
    lastActivity: order.lastActivity ?? order.placedAt,
    hoursInStatus: Math.round(hoursInStatus(order, nowIso)),
    medsourceRef: order.medsourceRef,
    tracking: order.tracking,
    totalCents: orderTotalCents(order),
    lines: order.lines.map((l) => ({
      sku: l.sku,
      name: l.name,
      qty: l.qty,
      extendedCents: l.unitPriceCents * l.qty,
      isAddon: l.isAddon,
      lotRef: l.lotRef,
    })),
    flags: flagsFor(order, nowIso),
    carriedForward,
  };
}

/** Any movement on this order inside the window? */
function touchedInWindow(order: Order, from: string, to: string): boolean {
  if (order.placedAt >= from && order.placedAt <= to) return true;
  return order.statusHistory.some((e) => e.at >= from && e.at <= to);
}

export function buildDailyOrderReport(
  nowIso: string = NOW,
  windowHours: number = WINDOW_HOURS,
): DailyOrderReport {
  const from = windowStart(nowIso, windowHours);

  const selected: ReportOrder[] = [];
  for (const o of orders) {
    const inWindow = touchedInWindow(o, from, nowIso);
    if (inWindow) {
      selected.push(toReportOrder(o, nowIso, false));
      continue;
    }
    // Carry-forward: still open and still broken. See ReportOrder.carriedForward.
    if (!isTerminal(o.status)) {
      const flags = flagsFor(o, nowIso);
      if (flags.length > 0) selected.push(toReportOrder(o, nowIso, true));
    }
  }

  const byCoach = new Map<string, ReportOrder[]>();
  for (const o of orders) {
    const row = selected.find((s) => s.id === o.id);
    if (!row) continue;
    const list = byCoach.get(o.coachId) ?? [];
    list.push(row);
    byCoach.set(o.coachId, list);
  }

  const groups: CoachGroup[] = Array.from(byCoach.entries())
    .map(([coachId, list]) => {
      // Flagged orders sort to the top of every coach's block. A coach reading
      // their own section should hit the problem before the routine work.
      const sorted = [...list].sort(
        (a, b) =>
          b.flags.length - a.flags.length ||
          (a.placedAt < b.placedAt ? 1 : -1),
      );
      return {
        coachId,
        coachName: staffName(coachId),
        orders: sorted,
        totalCents: sorted.reduce((s, o) => s + o.totalCents, 0),
        flaggedCount: sorted.filter((o) => o.flags.length > 0).length,
      };
    })
    .sort(
      (a, b) => b.flaggedCount - a.flaggedCount || a.coachName.localeCompare(b.coachName),
    );

  const flagged = selected
    .filter((o) => o.flags.length > 0)
    .sort((a, b) => {
      const sev = (r: ReportOrder) =>
        r.flags.some((f) => f.severity === "critical") ? 0 : 1;
      return sev(a) - sev(b) || b.hoursInStatus - a.hoursInStatus;
    });

  const has = (o: ReportOrder, kind: OrderFlagKind) =>
    o.flags.some((f) => f.kind === kind);

  return {
    generatedAt: nowIso,
    windowStart: from,
    windowHours,
    groups,
    orderCount: selected.length,
    unitCount: selected.reduce(
      (s, o) => s + o.lines.reduce((n, l) => n + l.qty, 0),
      0,
    ),
    totalCents: selected.reduce((s, o) => s + o.totalCents, 0),
    flagged,
    neverLanded: flagged.filter((o) => has(o, "never-landed") || has(o, "failed")),
    stuck: flagged.filter((o) => has(o, "stuck")),
    exceptions: flagged.filter((o) => has(o, "exception")),
    carriedForwardCount: selected.filter((o) => o.carriedForward).length,
  };
}

// ---------------------------------------------------------------------------
// Plain-text summary
// ---------------------------------------------------------------------------

/**
 * What lands in the clipboard when ops pastes the day into a shift-handoff
 * thread. Deliberately plain text, no markdown tables: it has to survive being
 * pasted into SMS, a Teams message, or an email from a phone.
 *
 * Failures come FIRST. A summary that opens with the revenue number and buries
 * the stranded order at the bottom will be read exactly as far as the revenue
 * number.
 */
export function summaryText(report: DailyOrderReport): string {
  const lines: string[] = [];
  lines.push(`ALPHA HEALTH — DAILY ORDER REPORT`);
  lines.push(
    `${formatDateTime(report.windowStart)} → ${formatDateTime(report.generatedAt)} (${report.windowHours}h)`,
  );
  lines.push("");

  if (report.flagged.length === 0) {
    lines.push("NO FAILURES. Every order in the window reached MedSource and is within SLA.");
  } else {
    lines.push(`!! ${report.flagged.length} ORDER(S) NEED ACTION`);
    for (const o of report.flagged) {
      const kinds = o.flags.map((f) => f.label).join(", ");
      lines.push(
        `  - ${o.id} · ${o.clientName} (${o.mrn}) · ${o.status} · ${kinds}${
          o.carriedForward ? " · carried forward" : ""
        }`,
      );
      for (const f of o.flags) lines.push(`      ${f.detail}`);
    }
  }

  lines.push("");
  lines.push(
    `TOTALS: ${report.orderCount} orders · ${report.unitCount} units · ${currency(report.totalCents / 100)}`,
  );
  lines.push("");

  for (const g of report.groups) {
    lines.push(
      `${g.coachName} — ${g.orders.length} order(s) · ${currency(g.totalCents / 100)}${
        g.flaggedCount ? ` · ${g.flaggedCount} flagged` : ""
      }`,
    );
    for (const o of g.orders) {
      lines.push(`  ${o.id} · ${o.clientName} · ${o.status} · ${currency(o.totalCents / 100)}`);
      for (const l of o.lines) {
        lines.push(`      ${l.qty}× ${l.name} [${l.sku}]${l.lotRef ? ` lot ${l.lotRef}` : ""}`);
      }
    }
    lines.push("");
  }

  lines.push(
    "Derived from order records, not from audit log text. Every order that exists appears above.",
  );
  return lines.join("\n");
}
