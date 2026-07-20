import type { LocationId } from "@/lib/types";
import { clients } from "@/lib/mock/clients";
import { memberships } from "@/lib/mock/memberships";
import { churnRisk } from "@/lib/aiInsights";
import { locations } from "@/lib/mock/locations";
import {
  countFigure,
  moneyFigure,
  type Figure,
  type NotComputable,
} from "@/lib/exec/provenance";
import type { LocationScope } from "@/lib/exec/morning";
import { activityOn, trailingActivity, YESTERDAY } from "@/lib/exec/morning";

/**
 * IS THE BUSINESS HEALTHY.
 *
 * Three numbers an owner can defend, and a loud refusal to print the fourth.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MODULE DELIBERATELY DOES NOT IMPORT
 * ---------------------------------------------------------------------------
 * `lib/analytics.ts`. Not one figure from it.
 *
 * That file is where owner-facing revenue currently comes from, and the audit
 * traced its headline to `grossMonthly = mrr + Σ(lifetimeValue) × 0.02 + 12000`.
 * The `+ 12000` is not a bug to be corrected — there is nothing to correct it
 * TO. Apex has no invoice entity, no charge, no payment and no billing engine,
 * so one-off and in-clinic revenue has no record to be summed from. The constant
 * exists because a shape was needed where a measurement was impossible.
 *
 * The service-line mix has the same problem one layer down: no order line,
 * membership or charge in this build carries a ServiceLine, so the mix is six
 * hardcoded weights. The MRR trend is eased from `mrr × 0.62` because no dated
 * subscription event exists. The retention curve is the literal array
 * `[100,94,88,83,79,76,73]`, identical for every location filter.
 *
 * Importing any of those and labelling it would still put an invented number in
 * front of the one person in the building whose decisions move payroll. The
 * labelling is a mitigation for a figure that has to be there. None of these
 * have to be there, so they are not, and `unanswerable()` below states each
 * missing question in the space where its tile would have gone.
 *
 * ---------------------------------------------------------------------------
 * WHAT MRR HERE ACTUALLY MEANS
 * ---------------------------------------------------------------------------
 * Σ `monthlyRate` over memberships whose status is Active and whose rate is
 * above zero. That is a real sum over real records and it is reproducible by
 * hand. It is NOT revenue collected. Nothing in Apex charges a card, so this is
 * contracted recurring value — what the book WOULD bill if every plan billed
 * successfully. The gap between that and cash is exactly the dunning, failed-
 * payment and proration machinery the audit found missing at zero, and an owner
 * should read this figure as a ceiling.
 */

// ---------------------------------------------------------------------------
// Scoping
// ---------------------------------------------------------------------------

function clientIdsIn(scope: LocationScope): Set<string> {
  return new Set(
    clients.filter((c) => scope === "all" || c.locationId === scope).map((c) => c.id),
  );
}

export interface BookState {
  /** Memberships in an Active state, including $0 pay-as-you-go tiers. */
  activeCount: number;
  /** Active memberships that actually bill. The MRR population. */
  billingCount: number;
  mrr: number;
  pausedCount: number;
  pausedMrr: number;
  lapsedCount: number;
  lapsedMrr: number;
  /** Paused + lapsed recurring value. Money the book is contracted for and is not billing. */
  atRiskMrr: number;
  /** Members scored high-churn by lib/aiInsights.ts. Modelled, not counted. */
  highChurn: number;
  mediumChurn: number;
  memberCount: number;
}

export function bookState(scope: LocationScope = "all"): BookState {
  const ids = clientIdsIn(scope);
  const scoped = memberships.filter((m) => ids.has(m.clientId));
  const paid = scoped.filter((m) => m.monthlyRate > 0);

  const sum = (rows: typeof scoped) => rows.reduce((s, m) => s + m.monthlyRate, 0);

  const active = paid.filter((m) => m.status === "Active");
  const paused = paid.filter((m) => m.status === "Paused");
  const lapsed = paid.filter((m) => m.status === "Lapsed");

  const scopedClients = clients.filter((c) => ids.has(c.id));
  const risk = scopedClients.map((c) => churnRisk(c));

  return {
    activeCount: scoped.filter((m) => m.status === "Active").length,
    billingCount: active.length,
    mrr: sum(active),
    pausedCount: paused.length,
    pausedMrr: sum(paused),
    lapsedCount: lapsed.length,
    lapsedMrr: sum(lapsed),
    atRiskMrr: sum(paused) + sum(lapsed),
    highChurn: risk.filter((r) => r.level === "high").length,
    mediumChurn: risk.filter((r) => r.level === "medium").length,
    memberCount: scopedClients.length,
  };
}

const STATUS_CAVEAT =
  "Membership status is assigned by a seeded roll in lib/mock/memberships.ts:56 — no code transitions a plan to Paused or Lapsed, so these are records rather than outcomes. The sum over them is real; the reason a given plan is paused is not modelled.";

export function businessFigures(scope: LocationScope = "all"): Figure[] {
  const b = bookState(scope);

  return [
    countFigure({
      id: "active-members",
      label: "Active members",
      value: b.activeCount,
      provenance: "measured",
      source:
        "Memberships with status = Active (lib/mock/memberships.ts), joined to clients in scope.",
      caveat: `${b.billingCount} of these carry a monthly rate; the remainder are Single Visit at $0. ${STATUS_CAVEAT}`,
      hint: "The book. Includes pay-as-you-go tiers that bill nothing.",
      tone: "neutral",
    }),
    moneyFigure({
      id: "mrr",
      label: "MRR contracted",
      value: b.mrr,
      provenance: "measured",
      source: `Σ monthlyRate over ${b.billingCount} memberships where status = Active and rate > 0 (lib/mock/memberships.ts). Reproducible by hand.`,
      caveat:
        "Contracted, not collected. Apex has no billing engine, no invoice entity and no payment record — nothing here charges a card, so read this as a ceiling on cash, not as cash.",
      hint: "What the book would bill if every active plan billed successfully.",
      tone: "neutral",
    }),
    moneyFigure({
      id: "mrr-at-risk",
      label: "MRR not billing",
      value: b.atRiskMrr,
      provenance: "measured",
      source: `Σ monthlyRate over ${b.pausedCount} Paused + ${b.lapsedCount} Lapsed paid memberships (lib/mock/memberships.ts).`,
      caveat: STATUS_CAVEAT,
      hint: `Paused ${money(b.pausedMrr)} · lapsed ${money(b.lapsedMrr)}. Recurring value the book holds and is not collecting.`,
      tone: b.atRiskMrr > 0 ? "watch" : "optimal",
      href: "/coach/winback",
    }),
    countFigure({
      id: "high-churn",
      label: "Members at risk",
      value: b.highChurn,
      provenance: "modelled",
      source:
        "lib/aiInsights.ts:churnRisk scores ≥ 50. Drivers are inactive status, overdue follow-up, no future appointment, no programme, labs > 120d, low lifetime value.",
      caveat: `A scoring opinion with thresholds a person chose, not a count of anyone who left — Apex records no cancellation event. ${b.mediumChurn} more score medium.`,
      hint: "Who a coach should call this week. Argue with the drivers, not the number.",
      tone: b.highChurn > 0 ? "watch" : "optimal",
      href: "/coach/gaps",
    }),
  ];
}

function money(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

// ---------------------------------------------------------------------------
// Per-location
// ---------------------------------------------------------------------------

export interface LocationRow {
  id: LocationId;
  label: string;
  members: number;
  mrr: number;
  atRiskMrr: number;
  highChurn: number;
  /** Yesterday. */
  held: number;
  lost: number;
  consultsHeld: number;
  /** Trailing 30 days, for the thin-day problem. */
  trailingHeld: number;
  trailingConsultsHeld: number;
}

/**
 * Cross-location table.
 *
 * Sorted by MRR descending rather than by name or by any risk metric: this is
 * the one view where an owner is comparing sites against each other, and size
 * is the honest first sort. Ranking sites by a risk RATE puts the smallest
 * location on top the first week it has a bad day, which is the same
 * small-denominator trap `lib/analytics/attendance.ts` guards against with
 * MIN_SLOT_N.
 *
 * Telehealth is included as a row because it is modelled as a location in this
 * codebase (`lib/mock/locations.ts`). That is a real modelling weakness the
 * audit names — telehealth is a modality, not a site — and the table labels it
 * rather than silently dropping it, because a fifth of the book sits there.
 */
export function locationRows(): LocationRow[] {
  return locations
    .map((l) => {
      const b = bookState(l.id);
      const y = activityOn(YESTERDAY, l.id);
      const t = trailingActivity(l.id);
      return {
        id: l.id,
        label: l.short,
        members: b.memberCount,
        mrr: b.mrr,
        atRiskMrr: b.atRiskMrr,
        highChurn: b.highChurn,
        held: y.held,
        lost: y.lost,
        consultsHeld: y.consultsHeld,
        trailingHeld: t.held,
        trailingConsultsHeld: t.consultsHeld,
      };
    })
    .sort((a, b) => b.mrr - a.mrr);
}

// ---------------------------------------------------------------------------
// The questions this console will not answer
// ---------------------------------------------------------------------------

/**
 * Stated as questions, rendered as cards, at the weight a figure would get.
 *
 * Each one names the surface that currently answers it with an invented number,
 * so the claim "we left this out on purpose" is checkable against the file
 * rather than taken on trust.
 */
export function unanswerable(): NotComputable[] {
  return [
    {
      id: "gross-revenue",
      question: "What did the clinic actually make last month?",
      why:
        "There is no invoice, charge, payment or refund entity anywhere in Apex, so non-membership revenue — in-clinic services, one-off panels, aesthetics, IV — has no record to be summed from. Only contracted recurring value and placed-order value can be counted at all.",
      needs:
        "A billing engine: payment method, invoice, charge/capture/refund, and a collected-vs-contracted distinction. Until then MRR is a ceiling and order value is intent, not cash.",
      replaces:
        "lib/analytics.ts:48 renders grossMonthly = mrr + Σ(lifetimeValue) × 0.02 + 12000 as a headline figure.",
    },
    {
      id: "service-mix",
      question: "Which service line is carrying the business?",
      why:
        "No order line, membership or charge in this build carries a service line, so the mix cannot be derived from anything. The six percentages on the analytics page are hand-picked constants multiplied by an already-invented total.",
      needs:
        "A service-line dimension on the catalog item and on every membership tier, then revenue attribution at the line level.",
      replaces: "lib/analytics.ts:39-47 multiplies the invented gross by six hardcoded weights.",
    },
    {
      id: "conversion",
      question: "What share of consults converted, and how fast?",
      why:
        "Apex stores no dated conversion event. Client status is a snapshot of where someone is now, so a member who converted in March and cancelled in May still counts as converted, forever, and no window can be applied to it.",
      needs:
        "The lead and lead_stage_event tables in lib/db/schema.ts — a dated transition per stage, plus convertedAt on the lead. Both are defined and neither is populated or wired.",
      replaces:
        "lib/analytics.ts:82 presents a current-status snapshot as a funnel; app/analytics/page.tsx:52 prints '+12% MoM' as a hardcoded string.",
    },
    {
      id: "retention",
      question: "How many members are still with us at month six?",
      why:
        "A cohort curve needs join-dated members and dated churn events. Clients carry joinedOn, but nothing anywhere records a cancellation, so the denominator exists and the numerator does not.",
      needs:
        "A membership lifecycle: dated pause, resume and cancel transitions with a reason, replacing the seeded status roll.",
      replaces:
        "lib/analytics.ts:96 returns the literal array [100,94,88,83,79,76,73], identical for every location filter.",
    },
  ];
}
