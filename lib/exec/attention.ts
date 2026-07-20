import { buildDailyOrderReport } from "@/lib/reports/dailyOrders";
import { consults } from "@/lib/mock/consults";
import { capacitySummary, capacityFindings } from "@/lib/analytics/capacity";
import { clients } from "@/lib/mock/clients";
import { triageScore } from "@/lib/aiInsights";
import { absolute } from "@/lib/utils";
import type { Provenance } from "@/lib/exec/provenance";
import { bookState } from "@/lib/exec/business";
import { NOW_ISO } from "@/lib/exec/morning";

/**
 * WHAT NEEDS THE OWNER.
 *
 * The hard part of this list is not gathering the items — it is refusing to
 * gather most of them. An owner's attention list that reports everything wrong
 * in the clinic is a list he reads once. Every row here has to survive one
 * question: *would this still be broken tomorrow if the owner did nothing, and
 * is he the person who unblocks it?* A coach's overdue check-in fails that test
 * — it has an owner already, and it is on `TodayQueue`. Sixty orders that never
 * reached the pharmacy passes it, because nobody below him is measured on it.
 *
 * ---------------------------------------------------------------------------
 * RANKING: DISJOINT ADDITIVE BANDS, THE SAME SHAPE AS TodayQueue
 * ---------------------------------------------------------------------------
 * `components/coach/TodayQueue.tsx:117` ranks a coach's morning with three
 * bands — 900 signatures, 400 triage, 100 staleness — so that the ordering is
 * explainable rather than a weighted score nobody can audit. The same argument
 * applies here and the same structure is used:
 *
 *   900+   A MEMBER IS WAITING on something that is broken and silent.
 *   600+   A CLINICAL OBLIGATION is ageing (an unsigned chart is an open chart).
 *   400+   MONEY CONTRACTED AND NOT COLLECTED.
 *   200+   AN OPERATIONAL DEFECT with no owner.
 *
 * The bands are disjoint, so a large number in a low band can never outrank a
 * small number in a high band. That is deliberate and it is the whole design:
 * $22,337 of lapsed membership is a bigger figure than two failed orders and it
 * is emphatically less urgent, because the two failed orders are two people who
 * think medication is coming and it is not. A single blended severity score
 * would have sorted those the wrong way round and given no way to see that it
 * had.
 *
 * ---------------------------------------------------------------------------
 * SUB-BANDS, BECAUSE "SIZE DECIDES WITHIN A BAND" IS NOT ENOUGH
 * ---------------------------------------------------------------------------
 * The first version of this ranked purely on count inside each band, and it had
 * a bug that only shows up on a bad day. An order that never reached MedSource
 * and an order that is merely past its SLA both sit in `member-waiting`, so with
 * count alone, 70 late orders would outrank 60 orders the pharmacy has never
 * seen. Those are not the same event: one is a delay, the other is silence, and
 * silence does not resolve itself.
 *
 * So each band is subdivided by severity FIRST and sized within that, with the
 * count contribution capped so the sub-bands cannot overlap:
 *
 *   960-999  never reached the partner      930-959  held on stock/QC
 *   900-929  past SLA
 *   660-699  patient waiting on a clinician 600-659  documentation ageing
 *   400-499  contracted and not collected, ranked by DOLLARS not by count
 *   200-299  operational defect
 *
 * The money band ranks on dollars deliberately: it is the band whose whole
 * subject is money, and ranking it by membership count would let 90 lapsed
 * Single-Visit records outrank a handful of lapsed Concierge plans worth far
 * more.
 */

export type AttentionKind =
  | "member-waiting"
  | "clinical-ageing"
  | "money-uncollected"
  | "ops-defect";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  /** The finding, stated as a fact with its number in it. */
  headline: string;
  /** What it means and what unblocks it. Two sentences at most. */
  detail: string;
  /** Sort key. See the band table above. */
  priority: number;
  /** The figure at stake, for the reader to weigh — count or dollars. */
  magnitude: string;
  provenance: Provenance;
  source: string;
  href?: string;
  linkLabel?: string;
}

export const BAND_META: Record<
  AttentionKind,
  { label: string; floor: number; tone: "high" | "watch" | "neutral" }
> = {
  "member-waiting": { label: "A member is waiting", floor: 900, tone: "high" },
  "clinical-ageing": { label: "Clinical obligation ageing", floor: 600, tone: "high" },
  "money-uncollected": { label: "Contracted, not collected", floor: 400, tone: "watch" },
  "ops-defect": { label: "Operational defect", floor: 200, tone: "neutral" },
};

const DAY_MS = 86_400_000;

export function attentionItems(): AttentionItem[] {
  const out: AttentionItem[] = [];
  const report = buildDailyOrderReport();

  // ---- 900: a member is waiting -----------------------------------------
  // Evidence-based, not status-based: `reachedPartner` asks whether MedSource
  // has ever spoken about the order, because an order can sit in "Submitted"
  // looking healthy while the submit call is still undelivered in the outbox.
  if (report.neverLanded.length > 0) {
    out.push({
      id: "orders-never-landed",
      kind: "member-waiting",
      headline: `${report.neverLanded.length} orders never reached MedSource`,
      detail:
        "Apex sent them; the pharmacy has never acknowledged them. Nothing is being picked and each one is a member expecting medication that is not coming. Re-driving is safe — the idempotency key makes a resend a no-op if it did land.",
      // 960+ — the top of the top band. Silence from the partner outranks any
      // volume of orders that are merely late.
      priority: 960 + Math.min(39, report.neverLanded.length),
      magnitude: `${report.neverLanded.length} orders`,
      provenance: "measured",
      source:
        "Orders with no status event sourced from 'medsource' and a non-terminal status (lib/reports/dailyOrders.ts:91, reachedPartner).",
      href: "/admin/daily-report",
      linkLabel: "Open the daily order report",
    });
  }

  if (report.exceptions.length > 0) {
    out.push({
      id: "orders-exception",
      kind: "member-waiting",
      headline: `${report.exceptions.length} orders held on stock or QC`,
      detail:
        "A line cannot be filled or a pharmacist has held it for review. These do not clear on their own — each needs someone to substitute, split or release it.",
      // 930+ — a human decision is required, but the order is at least visible
      // to the partner. Below silence, above a simple delay.
      priority: 930 + Math.min(29, report.exceptions.length),
      magnitude: `${report.exceptions.length} orders`,
      provenance: "measured",
      source:
        "Orders in an exception status — Insufficient stock, QC hold (lib/orders/lifecycle.ts:isException).",
      href: "/coach/orders",
      linkLabel: "Open the order board",
    });
  }

  if (report.stuck.length > 0) {
    out.push({
      id: "orders-stuck",
      kind: "member-waiting",
      headline: `${report.stuck.length} orders are past their service window`,
      detail:
        "Accepted somewhere in the pipeline and stalled with nobody named against them. Past SLA is not yet a failure, which is exactly why these are the ones that quietly become one.",
      // 900+ — the floor of the band. Late, but moving and acknowledged.
      priority: 900 + Math.min(29, report.stuck.length),
      magnitude: `${report.stuck.length} orders`,
      provenance: "measured",
      source: "lib/orders/lifecycle.ts:isStuck against the pinned clock 2026-06-12T09:00.",
      href: "/admin/daily-report",
      linkLabel: "Open the daily order report",
    });
  }

  // ---- 600: clinical obligation ageing -----------------------------------
  const unsigned = consults.filter((c) => c.status !== "Signed");
  if (unsigned.length > 0) {
    const oldest = unsigned.reduce((a, c) => (c.startedAt < a.startedAt ? c : a));
    const ageDays = Math.round(
      (absolute(NOW_ISO).getTime() - absolute(oldest.startedAt).getTime()) / DAY_MS,
    );
    out.push({
      id: "unsigned-consults",
      kind: "clinical-ageing",
      headline: `${unsigned.length} consults are unsigned`,
      detail: `An unsigned consult is an open chart. The oldest has been open ${ageDays} days. This is a documentation obligation that only accrues — it does not resolve by itself and it does not age out.`,
      // 600+ — the floor. Ranked by the age of the oldest open chart rather
      // than by how many are open: one chart open 90 days is a bigger problem
      // than thirty opened this week.
      priority: 600 + Math.min(59, ageDays),
      magnitude: `${unsigned.length} charts · oldest ${ageDays}d`,
      provenance: "measured",
      source: "Consults where status ≠ 'Signed' (lib/mock/consults.ts).",
      href: "/coach/consults",
      linkLabel: "Open the consult list",
    });
  }

  const critical = clients.filter((c) => triageScore(c).score >= 70);
  if (critical.length > 0) {
    out.push({
      id: "critical-triage",
      kind: "clinical-ageing",
      headline: `${critical.length} members score critical on attention triage`,
      detail:
        "Resulted labs nobody has interpreted, recommendations awaiting sign-off, overdue appointments — stacked on the same person. Each already sits on a coach's or clinician's queue; the reason it is here is that the count is the signal.",
      // 660+ — above unsigned charts. A member waiting on someone to read their
      // labs outranks a documentation obligation, however old: one is care
      // delayed, the other is paperwork owed.
      priority: 660 + Math.min(39, critical.length),
      magnitude: `${critical.length} members`,
      provenance: "modelled",
      source:
        "lib/aiInsights.ts:triageScore ≥ 70, summing status, risk flags, pending recommendations and appointment lateness.",
      href: "/clients",
      linkLabel: "Open the patient list",
    });
  }

  // ---- 400: contracted and not collected ---------------------------------
  const b = bookState("all");
  if (b.lapsedMrr > 0) {
    out.push({
      id: "lapsed-mrr",
      kind: "money-uncollected",
      headline: `${money(b.lapsedMrr)}/mo lapsed across ${b.lapsedCount} memberships`,
      detail:
        "Plans that stopped billing. Apex has no dunning ladder, no card-update flow and no retry — so nothing in the product is currently trying to recover any of this, and no code path can tell you why any single one lapsed.",
      priority: 400 + dollarRank(b.lapsedMrr),
      magnitude: `${money(b.lapsedMrr)}/mo`,
      provenance: "measured",
      source:
        "Σ monthlyRate over paid memberships with status = Lapsed (lib/mock/memberships.ts). The sum is real; the status is a seeded roll, not a recorded transition.",
      href: "/coach/winback",
      linkLabel: "Open lapsed members",
    });
  }

  if (b.pausedMrr > 0) {
    out.push({
      id: "paused-mrr",
      kind: "money-uncollected",
      headline: `${money(b.pausedMrr)}/mo paused across ${b.pausedCount} memberships`,
      detail:
        "A pause is reversible and a lapse usually is not, which makes this the cheaper of the two to work. Nothing in Apex records a pause reason or an intended resume date, so there is no way to tell a holiday from a soft cancellation.",
      priority: 400 + dollarRank(b.pausedMrr),
      magnitude: `${money(b.pausedMrr)}/mo`,
      provenance: "measured",
      source: "Σ monthlyRate over paid memberships with status = Paused (lib/mock/memberships.ts).",
      href: "/coach/winback",
      linkLabel: "Open lapsed members",
    });
  }

  // ---- 200: operational defect -------------------------------------------
  // Bookings against a clinician with no shift that day. `capacity.ts` refuses
  // to fold these into utilisation and counts them separately, because either
  // the roster is wrong or the booking is and both need a person.
  const cap = capacitySummary("all");
  if (cap.unrosteredHours > 0) {
    out.push({
      id: "unrostered",
      kind: "ops-defect",
      headline: `${cap.unrosteredHours.toFixed(1)}h booked outside anyone's roster`,
      detail:
        "Members are scheduled onto clinicians who are not rostered at that time. Either the roster is wrong or the booking is — both need a human, and neither shows up as a problem anywhere else in the app.",
      priority: 200 + Math.min(99, Math.round(cap.unrosteredHours)),
      magnitude: `${cap.unrosteredHours.toFixed(1)} hours`,
      provenance: "measured",
      source:
        "Booked minutes with no covering shift for that clinician and date (lib/analytics/capacity.ts, unrosteredHours).",
      href: "/exec/capacity",
      linkLabel: "Open capacity",
    });
  }

  const bottlenecks = capacityFindings("all").filter((f) => f.kind === "bottleneck");
  if (bottlenecks.length > 0) {
    out.push({
      id: "bottlenecks",
      kind: "ops-defect",
      headline: `${bottlenecks.length} clinicians are above 85% booked this week`,
      detail:
        "No slack for a visit that runs long, so every overrun cascades through the rest of the day. This is a hiring or rostering decision and it is one only the owner makes.",
      priority: 200 + Math.min(99, bottlenecks.length),
      magnitude: `${bottlenecks.length} clinicians`,
      provenance: "measured",
      source:
        "Booked ÷ rostered hours ≥ 0.85 per clinician for the week of 2026-06-08 (lib/analytics/capacity.ts, BOTTLENECK_THRESHOLD).",
      href: "/exec/capacity",
      linkLabel: "Open capacity",
    });
  }

  // Stable tiebreak on id so the order is byte-identical on every render.
  return out.sort((a, b2) => b2.priority - a.priority || a.id.localeCompare(b2.id));
}

/**
 * Monthly dollars → a 0-99 rank contribution, so the money band sorts by value
 * rather than by how many membership rows happen to make it up.
 *
 * $500/mo per step, capped at 99, which keeps the band inside 400-499 and
 * therefore disjoint from the clinical band above it. The cap means anything
 * over $49,500/mo ranks equal at the top — acceptable, because at that size the
 * owner is not choosing between two rows, he is already on the phone.
 */
function dollarRank(monthly: number): number {
  return Math.min(99, Math.round(monthly / 500));
}

function money(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}
