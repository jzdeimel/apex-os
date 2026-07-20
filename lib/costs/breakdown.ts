import type { Order } from "@/lib/orders/types";
import type { CatalogItem } from "@/lib/catalog/types";
import { membershipForClient, TIER_BENEFITS } from "@/lib/mock/memberships";
import { subscriptionsForClient } from "@/lib/mock/subscriptions";
import { ordersForClient } from "@/lib/mock/orders";
import { catalogItem } from "@/lib/catalog/catalog";
import { addDays, dayOf, daysBetween } from "@/lib/subscriptions/engine";
import { getClient } from "@/lib/mock/clients";
// `formatDay` lives with the runway because that is where the date-only
// rendering bug was found; it is shared rather than re-implemented so the two
// member-facing money surfaces cannot disagree about what day something is.
import { formatDay } from "@/lib/protocol/runway";
import { formatDate } from "@/lib/utils";

/**
 * COST CLARITY.
 *
 * Alpha Health advertises "HSA/FSA accepted" on the website (see PROOF in
 * lib/brand.ts) and then shows a member a card charge. Nobody does the
 * arithmetic for them, so the member does it badly in their head, decides the
 * clinic is expensive, and cancels a protocol that was working.
 *
 * ── FOUR RULES ────────────────────────────────────────────────────────────
 *
 * 1. **INTEGER CENTS, EVERYWHERE.** Every figure in this module is cents as a
 *    whole number. Floating-point dollars are how a total ends in .999999 on a
 *    screen a member is deciding their money against.
 *
 * 2. **EVERY FIGURE CARRIES ITS BASIS.** `CostLine.basis` is a sentence a
 *    member could read aloud to explain the number: "$129 every 28 days works
 *    out to about $138 a month." A figure a member cannot reconstruct is a
 *    figure they do not believe.
 *
 * 3. **WE DO NOT PROMISE A TAX OUTCOME.** Items are flagged as *likely*
 *    eligible. Eligibility is decided by the member's plan administrator, and
 *    saying otherwise on a screen is both wrong and the clinic's problem later.
 *    See `HSA_DISCLAIMER` — it is rendered, not just exported.
 *
 * 4. **A MONTHLY EQUIVALENT IS NOT A CHARGE.** A 56-day item shown as a
 *    monthly figure is a useful comparison and a misleading bill. Anything
 *    normalised to a month says so in its own basis line.
 */

const NOW = "2026-06-12T09:00:00";

/** Days of one-off history the breakdown looks back over. */
export const ONE_OFF_WINDOW_DAYS = 90;

/** Days of a "typical month" used to normalise a cadence. */
const MONTH_DAYS = 30;

// ---------------------------------------------------------------------------
// HSA / FSA
// ---------------------------------------------------------------------------

/**
 * How confident we are that a line is HSA/FSA eligible.
 *
 * Three values, not two, because "we do not know" is a real and common answer
 * and collapsing it into "no" costs the member money they were entitled to.
 */
export type HsaFlag = "likely" | "unlikely" | "unknown";

export const HSA_DISCLAIMER =
  "Eligibility is decided by your HSA or FSA plan administrator, not by Alpha Health. We flag what is usually eligible so you know what to submit — we cannot tell you what your plan will approve, and nothing here is tax advice.";

export const HSA_FLAG_LABEL: Record<HsaFlag, string> = {
  likely: "Likely eligible",
  unlikely: "Usually not eligible",
  unknown: "Ask your administrator",
};

/**
 * Classify a catalog line.
 *
 * Prescribed therapy, diagnostics and the supplies required to administer them
 * are the categories members most often successfully submit. Membership and
 * retainer fees are the category most often rejected — so that one is called
 * out rather than quietly bundled into a total the member then tries to claim.
 */
export function hsaFlagFor(item?: CatalogItem): HsaFlag {
  if (!item) return "unknown";
  switch (item.kind) {
    case "medication":
    case "compound":
    case "lab-panel":
    case "supply":
      return "likely";
    case "service":
    case "package":
      // Clinical services and infusions are usually claimable; anything else
      // sold as a service is genuinely uncertain, so we say uncertain.
      return item.serviceLine === "Clinical Services" ||
        item.serviceLine === "Recovery & Performance" ||
        item.requiresProviderApproval
        ? "likely"
        : "unknown";
    default:
      return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

export type CostKind = "membership" | "recurring" | "one-off" | "credit";

export interface CostLine {
  id: string;
  label: string;
  /** Integer cents. Negative for a credit. */
  cents: number;
  kind: CostKind;
  /** One sentence a member could read aloud. Always populated. */
  basis: string;
  hsa: HsaFlag;
  /** ISO date the charge happened or is expected. */
  on?: string;
}

export interface UpcomingLine {
  label: string;
  cents: number;
  on: string;
  basis: string;
}

export interface MonthlyBreakdown {
  clientId: string;
  asOf: string;

  membership?: CostLine;
  /** Auto-refilling protocol items, normalised to a month. */
  recurring: CostLine[];
  /** Everything else bought in the last 90 days, newest first. */
  oneOffs: CostLine[];
  /** What the membership already covers. Negative cents. */
  credit?: CostLine;

  membershipCents: number;
  recurringMonthlyCents: number;
  creditCents: number;
  /** Membership + recurring, before the credit. */
  grossMonthlyCents: number;
  /** What a typical month actually costs. Never below zero. */
  netMonthlyCents: number;

  /** Sum of one-offs inside the window. Not part of the monthly figure. */
  oneOffWindowCents: number;
  /** Of the monthly figure, how much is plausibly submittable. */
  likelyEligibleMonthlyCents: number;

  twelveMonthCents: number;
  twelveMonthBasis: string;

  nextMonth: { lines: UpcomingLine[]; cents: number; basis: string };
}

/** Cents → "$1,234.56". Two decimals always: money with one decimal reads broken. */
export function dollars(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Whole-dollar form for headline figures where cents are noise. */
export function dollarsRounded(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100));
}

/** A cadence priced per month. Rounded to whole cents at the boundary. */
function monthlyEquivalentCents(priceCents: number, cadenceDays: number): number {
  return Math.round((priceCents * MONTH_DAYS) / Math.max(1, cadenceDays));
}

/** Orders that represent money the member actually spent. */
function billableOrders(clientId: string): Order[] {
  return ordersForClient(clientId).filter(
    (o) => o.visibleToClient && o.status !== "Draft" && o.status !== "Cancelled",
  );
}

function orderTotalCents(order: Order): number {
  return order.lines.reduce((sum, l) => sum + l.unitPriceCents * l.qty, 0);
}

// ---------------------------------------------------------------------------
// The breakdown
// ---------------------------------------------------------------------------

export function monthlyBreakdown(clientId: string, nowIso: string = NOW): MonthlyBreakdown | null {
  const client = getClient(clientId);
  if (!client) return null;

  const today = dayOf(nowIso);
  const membership = membershipForClient(clientId);

  // ── Membership ──────────────────────────────────────────────────────────
  // `monthlyRate` is whole dollars on the record; it becomes cents here and
  // stays cents from this line down.
  const membershipCents =
    membership && membership.status === "Active" ? membership.monthlyRate * 100 : 0;

  const membershipLine: CostLine | undefined = membership
    ? {
        id: `cost-mem-${membership.id}`,
        label: `${membership.tier} membership`,
        cents: membershipCents,
        kind: "membership",
        basis:
          membership.status === "Active"
            ? `${dollars(membershipCents)} a month${membership.renewsOn ? `, next billed ${formatDay(membership.renewsOn)}` : ""}. Includes ${TIER_BENEFITS[membership.tier].length} things — see below.`
            : `Your membership is ${membership.status.toLowerCase()}, so nothing is billing right now.`,
        // Membership and retainer fees are the classic rejection. Say so here
        // rather than letting a member submit the whole total and get knocked back.
        hsa: "unlikely",
        on: membership.renewsOn,
      }
    : undefined;

  // ── Recurring protocol ──────────────────────────────────────────────────
  const recurring: CostLine[] = subscriptionsForClient(clientId)
    .filter((s) => s.status === "Active")
    .map((sub) => {
      const item = catalogItem(sub.sku);
      const monthly = monthlyEquivalentCents(sub.priceCents, sub.cadenceDays);
      return {
        id: `cost-sub-${sub.id}`,
        label: item?.name ?? sub.sku,
        cents: monthly,
        kind: "recurring" as const,
        basis:
          sub.cadenceDays === MONTH_DAYS
            ? `${dollars(sub.priceCents)} every ${sub.cadenceDays} days — that is your monthly figure.`
            : `${dollars(sub.priceCents)} every ${sub.cadenceDays} days, which averages ${dollars(monthly)} a month. You are not charged monthly; this is the comparison.`,
        hsa: hsaFlagFor(item),
        on: sub.nextRefillOn,
      };
    })
    .sort((a, b) => b.cents - a.cents);

  const recurringMonthlyCents = recurring.reduce((s, l) => s + l.cents, 0);

  // ── Credit ──────────────────────────────────────────────────────────────
  // Capped at what there is to spend it against. A credit larger than the
  // protocol spend is not cash back, and showing it as if it were would make
  // the net figure a lie.
  const rawCredit = membership?.protocolCreditCents ?? 0;
  const creditCents = Math.min(rawCredit, recurringMonthlyCents);

  const creditLine: CostLine | undefined =
    rawCredit > 0
      ? {
          id: "cost-credit",
          label: "Protocol credit included in your membership",
          cents: -creditCents,
          kind: "credit",
          basis:
            creditCents < rawCredit
              ? `Your ${membership?.tier} plan includes ${dollars(rawCredit)} of protocol credit a month. You are using ${dollars(creditCents)} of it — the rest does not carry over as cash.`
              : `Your ${membership?.tier} plan includes ${dollars(rawCredit)} of protocol credit a month, applied to the items above before you are charged.`,
          hsa: "unlikely",
        }
      : undefined;

  // ── One-offs ────────────────────────────────────────────────────────────
  const cutoff = addDays(today, -ONE_OFF_WINDOW_DAYS);
  const recurringSkus = new Set(
    subscriptionsForClient(clientId)
      .filter((s) => s.status === "Active")
      .map((s) => s.sku),
  );

  const oneOffs: CostLine[] = billableOrders(clientId)
    .filter((o) => daysBetween(cutoff, dayOf(o.placedAt)) >= 0)
    .map((order): CostLine | null => {
      // An order made ENTIRELY of items the member also subscribes to is a
      // refill, and counting it here would double-count it against the
      // recurring figure directly above.
      const extra = order.lines.filter((l) => !recurringSkus.has(l.sku));
      if (extra.length === 0) return null;
      const cents = extra.reduce((s, l) => s + l.unitPriceCents * l.qty, 0);
      const first = catalogItem(extra[0].sku);
      const label =
        extra.length === 1
          ? extra[0].name
          : `${extra[0].name} + ${extra.length - 1} more`;
      return {
        id: `cost-ord-${order.id}`,
        label,
        cents,
        kind: "one-off" as const,
        basis: `Ordered ${formatDate(order.placedAt)}${extra.length > 1 ? ` — ${extra.length} items on one order` : ""}. Charged once, not part of your monthly.`,
        // Mixed orders are only flagged as likely when every line agrees;
        // otherwise the member is told to check, which is the truth.
        hsa: extra.every((l) => hsaFlagFor(catalogItem(l.sku)) === "likely")
          ? "likely"
          : hsaFlagFor(first),
        on: dayOf(order.placedAt),
      };
    })
    .filter((l): l is CostLine => l !== null);

  const oneOffWindowCents = oneOffs.reduce((s, l) => s + l.cents, 0);

  // ── Totals ──────────────────────────────────────────────────────────────
  const grossMonthlyCents = membershipCents + recurringMonthlyCents;
  const netMonthlyCents = Math.max(0, grossMonthlyCents - creditCents);

  const likelyEligibleMonthlyCents = recurring
    .filter((l) => l.hsa === "likely")
    .reduce((s, l) => s + l.cents, 0);

  // ── Twelve months ───────────────────────────────────────────────────────
  const yearCutoff = addDays(today, -365);
  const orderYearCents = billableOrders(clientId)
    .filter((o) => daysBetween(yearCutoff, dayOf(o.placedAt)) >= 0)
    .reduce((s, o) => s + orderTotalCents(o), 0);

  // Membership months are counted from when the member actually joined, capped
  // at twelve. Multiplying the rate by 12 for someone who joined in March
  // invents six months of charges that never happened.
  const monthsOnPlan =
    membership && membershipCents > 0
      ? Math.min(12, Math.max(0, Math.floor(daysBetween(membership.startedOn, today) / MONTH_DAYS)))
      : 0;
  const membershipYearCents = membershipCents * monthsOnPlan;
  const twelveMonthCents = orderYearCents + membershipYearCents;

  const twelveMonthBasis =
    monthsOnPlan > 0
      ? `${dollars(orderYearCents)} of orders in the last 12 months, plus ${monthsOnPlan} month${monthsOnPlan === 1 ? "" : "s"} of membership at ${dollars(membershipCents)}. Joined ${formatDay(client.joinedOn)}.`
      : `${dollars(orderYearCents)} of orders in the last 12 months. No membership billing in that period.`;

  // ── Next month ──────────────────────────────────────────────────────────
  const horizon = addDays(today, MONTH_DAYS);
  const upcoming: UpcomingLine[] = subscriptionsForClient(clientId)
    .filter((s) => s.status === "Active" && !s.heldReason)
    .filter((s) => daysBetween(today, s.nextRefillOn) >= 0 && daysBetween(s.nextRefillOn, horizon) >= 0)
    .map((s) => ({
      label: catalogItem(s.sku)?.name ?? s.sku,
      cents: s.priceCents,
      on: s.nextRefillOn,
      basis: `Refill due ${formatDay(s.nextRefillOn)} at the price you enrolled at, ${dollars(s.priceCents)}.`,
    }));

  if (membership?.renewsOn && daysBetween(today, membership.renewsOn) >= 0 && daysBetween(membership.renewsOn, horizon) >= 0 && membershipCents > 0) {
    upcoming.push({
      label: `${membership.tier} membership`,
      cents: membershipCents,
      on: membership.renewsOn,
      basis: `Renews ${formatDay(membership.renewsOn)}.`,
    });
  }

  upcoming.sort((a, b) => (a.on < b.on ? -1 : 1));
  const nextMonthCents = upcoming.reduce((s, l) => s + l.cents, 0);

  return {
    clientId,
    asOf: today,
    membership: membershipLine,
    recurring,
    oneOffs,
    credit: creditLine,
    membershipCents,
    recurringMonthlyCents,
    creditCents,
    grossMonthlyCents,
    netMonthlyCents,
    oneOffWindowCents,
    likelyEligibleMonthlyCents,
    twelveMonthCents,
    twelveMonthBasis,
    nextMonth: {
      lines: upcoming,
      cents: nextMonthCents,
      basis:
        upcoming.length === 0
          ? "Nothing is scheduled to bill in the next 30 days."
          : `${upcoming.length} charge${upcoming.length === 1 ? "" : "s"} scheduled in the next 30 days, ${dollars(nextMonthCents)} in total. These are the actual charges, not a monthly average.`,
    },
  };
}
