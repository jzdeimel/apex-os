"use client";

import { Receipt, CalendarClock, PiggyBank, Info } from "lucide-react";
import type { Client } from "@/lib/types";
import {
  HSA_DISCLAIMER,
  HSA_FLAG_LABEL,
  ONE_OFF_WINDOW_DAYS,
  dollars,
  dollarsRounded,
  monthlyBreakdown,
  type CostLine,
  type HsaFlag,
} from "@/lib/costs/breakdown";
import { membershipForClient, TIER_BENEFITS } from "@/lib/mock/memberships";
import { Card, CardContent, Badge, EmptyState } from "@/components/ui/primitives";
import { formatDay } from "@/lib/protocol/runway";
import { cn } from "@/lib/utils";

/**
 * COST CLARITY.
 *
 * The clinic's site says "HSA/FSA accepted" and then nobody does the maths.
 * This page does it, in front of the member, with the working shown.
 *
 * Two editorial rules that are really safety rules:
 *  - Every number is followed by the sentence that produced it. A figure a
 *    member cannot reconstruct is a figure they suspect.
 *  - Eligibility is stated as LIKELY, never as settled. The plan administrator
 *    decides, and a clinic that implies otherwise is writing someone else's
 *    rejection letter. `HSA_DISCLAIMER` is rendered here, not buried.
 */

const NOW = "2026-06-12T09:00:00";

const HSA_TONE: Record<HsaFlag, "optimal" | "neutral" | "watch"> = {
  likely: "optimal",
  unlikely: "neutral",
  unknown: "watch",
};

/** One row: label, basis, money, eligibility. Used by all three sections. */
function LineRow({ line }: { line: CostLine }) {
  const isCredit = line.cents < 0;
  return (
    <li className="hairline rounded-2xl bg-ink-900/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 text-[15px] font-medium leading-snug text-ink-50">{line.label}</p>
        <p
          className={cn(
            "stat-mono shrink-0 text-[15px] font-semibold",
            isCredit ? "text-optimal" : "text-ink-50",
          )}
        >
          {isCredit ? "−" : ""}
          {dollars(Math.abs(line.cents))}
        </p>
      </div>
      {/* The basis is the point of the row. It renders verbatim. */}
      <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-ink-400">{line.basis}</p>
      <Badge tone={HSA_TONE[line.hsa]} className="mt-2.5">
        {HSA_FLAG_LABEL[line.hsa]}
      </Badge>
    </li>
  );
}

function Stat({
  label,
  value,
  basis,
  lead,
}: {
  label: string;
  value: string;
  basis: string;
  lead?: boolean;
}) {
  return (
    <div
      className={cn(
        "hairline rounded-2xl p-4",
        lead ? "border-gold-400/25 bg-gold-400/[0.06]" : "bg-ink-900/50",
      )}
    >
      <p className="text-[10px] uppercase tracking-wide text-ink-500">{label}</p>
      <p className="stat-mono mt-1.5 text-2xl font-semibold text-ink-50">{value}</p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-500">{basis}</p>
    </div>
  );
}

export function CostClarity({ client }: { client: Client }) {
  const b = monthlyBreakdown(client.id, NOW);
  const membership = membershipForClient(client.id);

  if (!b) {
    return <EmptyState title="We could not build your breakdown" hint="Ask your coach and we will sort it." />;
  }

  return (
    <div className="space-y-5">
      {/* The three numbers ------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          lead
          label="A typical month"
          value={dollarsRounded(b.netMonthlyCents)}
          basis={
            b.creditCents > 0
              ? `${dollars(b.grossMonthlyCents)} before the ${dollars(b.creditCents)} your membership covers.`
              : "Membership plus your recurring protocol, averaged over a month."
          }
        />
        <Stat
          label="Likely HSA/FSA eligible"
          value={dollarsRounded(b.likelyEligibleMonthlyCents)}
          basis="Of that monthly figure, this much is the kind of thing plans usually accept. Yours decides."
        />
        <Stat
          label="Last 12 months"
          value={dollarsRounded(b.twelveMonthCents)}
          basis={b.twelveMonthBasis}
        />
      </div>

      {/* Eligibility disclaimer — rendered, not buried -------------------- */}
      <Card className="border-ink-600/60">
        <CardContent className="flex items-start gap-3 p-5">
          <PiggyBank className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-50">About HSA and FSA</p>
            <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-ink-400">
              {HSA_DISCLAIMER}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Monthly breakdown --------------------------------------------------- */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-optimal" />
            <h2 className="font-display text-xl font-semibold text-ink-50">What a month costs</h2>
          </div>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-400">
            Your membership and anything on auto-refill. Items on a cycle longer than a month are shown as a
            monthly average so they can be compared — the charge itself still lands on its own date.
          </p>

          <ul className="mt-4 space-y-2.5">
            {b.membership && <LineRow line={b.membership} />}
            {b.recurring.map((l) => (
              <LineRow key={l.id} line={l} />
            ))}
            {b.credit && <LineRow line={b.credit} />}
          </ul>

          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-2xl border border-ink-700 bg-ink-900 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink-50">Typical month, after credit</p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-500">
                {dollars(b.membershipCents)} membership + {dollars(b.recurringMonthlyCents)} protocol
                {b.creditCents > 0 ? ` − ${dollars(b.creditCents)} credit` : ""}.
              </p>
            </div>
            <p className="stat-mono shrink-0 font-display text-2xl font-semibold text-ink-50">
              {dollars(b.netMonthlyCents)}
            </p>
          </div>

          {membership && (
            <div className="mt-4">
              <p className="label-eyebrow">What your {membership.tier} plan already includes</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {TIER_BENEFITS[membership.tier].map((x) => (
                  <Badge key={x} tone="neutral">
                    {x}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* One-offs ----------------------------------------------------------- */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <h2 className="font-display text-xl font-semibold text-ink-50">
            One-offs, last {ONE_OFF_WINDOW_DAYS} days
          </h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-400">
            Things bought once rather than on a cycle. They are listed separately so they never inflate the
            monthly figure above — a lab panel in April is not a monthly cost.
          </p>

          {b.oneOffs.length === 0 ? (
            <p className="mt-4 text-sm text-ink-400">
              Nothing outside your recurring items in the last {ONE_OFF_WINDOW_DAYS} days.
            </p>
          ) : (
            <>
              <ul className="mt-4 space-y-2.5">
                {b.oneOffs.map((l) => (
                  <LineRow key={l.id} line={l} />
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-2xl border border-ink-700 bg-ink-900 p-4">
                <p className="text-sm font-medium text-ink-50">
                  Total over {ONE_OFF_WINDOW_DAYS} days
                </p>
                <p className="stat-mono shrink-0 text-lg font-semibold text-ink-50">
                  {dollars(b.oneOffWindowCents)}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Next month --------------------------------------------------------- */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-optimal" />
            <h2 className="font-display text-xl font-semibold text-ink-50">Coming up next month</h2>
          </div>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-400">{b.nextMonth.basis}</p>

          {b.nextMonth.lines.length > 0 && (
            <>
              <ul className="mt-4 space-y-2">
                {b.nextMonth.lines.map((l) => (
                  <li
                    key={`${l.label}-${l.on}`}
                    className="hairline flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-2xl bg-ink-900/50 p-4"
                  >
                    <span className="min-w-0">
                      <span className="block text-[15px] text-ink-50">{l.label}</span>
                      <span className="mt-1 block text-[12px] leading-relaxed text-ink-500">{l.basis}</span>
                    </span>
                    <span className="stat-mono shrink-0 text-[15px] font-semibold text-ink-50">
                      {dollars(l.cents)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-2xl border border-ink-700 bg-ink-900 p-4">
                <p className="text-sm font-medium text-ink-50">Scheduled in the next 30 days</p>
                <p className="stat-mono shrink-0 text-lg font-semibold text-ink-50">
                  {dollars(b.nextMonth.cents)}
                </p>
              </div>
            </>
          )}

          <p className="mt-4 flex items-start gap-2 text-[12px] leading-relaxed text-ink-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Dates come from your actual refill schedule and renewal date, not an estimate. If one moves, this
            moves with it. As of {formatDay(b.asOf)}.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
