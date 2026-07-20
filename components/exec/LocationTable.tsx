"use client";

import * as React from "react";
import { locationRows } from "@/lib/exec/business";
import { TRAILING_DAYS } from "@/lib/exec/morning";
import { currency, cn } from "@/lib/utils";

/**
 * CROSS-LOCATION BREAKDOWN.
 *
 * Sorted by MRR descending. Size is the honest first sort when an owner is
 * comparing sites: ranking by a risk RATE puts whichever location is smallest on
 * top the first week it has a bad day, which is the small-denominator trap
 * `lib/analytics/attendance.ts` spends forty lines guarding against one level
 * down.
 *
 * ---------------------------------------------------------------------------
 * WHY YESTERDAY AND THIRTY DAYS SIT IN THE SAME CELL
 * ---------------------------------------------------------------------------
 * Split across five locations, one clinic day contains three or four bookings
 * per site and often zero initial consults. A column headed "Consults" showing
 * `0` for Myrtle Beach is a true statement that will be read as a dead site.
 *
 * So the daily figure renders with its 30-day companion immediately beside it in
 * a dimmer weight — `0 · 11 in 30d` — rather than in a separate column the eye
 * has to travel to and mentally join. The reader cannot see the alarming number
 * without also seeing the number that contextualises it. Two columns would have
 * let them.
 *
 * Telehealth appears as a row because this codebase models it as a location
 * (`lib/mock/locations.ts`). That is a real modelling weakness the audit names —
 * telehealth is a modality, a visit can be telehealth *at* Raleigh — and the
 * table footnotes it rather than dropping the row, because a fifth of the book
 * sits there and silently omitting it would be the same class of error as
 * `app/supply-chain/page.tsx:112` dropping raleigh-boutique from its chart.
 */
export function LocationTable() {
  const rows = React.useMemo(() => locationRows(), []);
  const totals = React.useMemo(
    () =>
      rows.reduce(
        (a, r) => ({
          members: a.members + r.members,
          mrr: a.mrr + r.mrr,
          atRiskMrr: a.atRiskMrr + r.atRiskMrr,
          held: a.held + r.held,
          consultsHeld: a.consultsHeld + r.consultsHeld,
          trailingHeld: a.trailingHeld + r.trailingHeld,
          trailingConsultsHeld: a.trailingConsultsHeld + r.trailingConsultsHeld,
          lost: a.lost + r.lost,
          highChurn: a.highChurn + r.highChurn,
        }),
        {
          members: 0,
          mrr: 0,
          atRiskMrr: 0,
          held: 0,
          consultsHeld: 0,
          trailingHeld: 0,
          trailingConsultsHeld: 0,
          lost: 0,
          highChurn: 0,
        },
      ),
    [rows],
  );

  return (
    <div className="card p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="label-eyebrow">By location</p>
        <p className="text-micro text-ink-500">
          Daily figures show yesterday · trailing {TRAILING_DAYS}d beside them
        </p>
      </div>

      {/* Scrolls inside its own container so the page body never scrolls
          horizontally on a phone. */}
      <div className="mt-2.5 overflow-x-auto">
        <table className="w-full min-w-[46rem] text-left">
          <thead>
            <tr className="border-b border-ink-700/70 text-micro uppercase tracking-wide text-ink-500">
              <th className="py-1.5 pr-3 font-medium">Location</th>
              <th className="py-1.5 pr-3 text-right font-medium">Members</th>
              <th className="py-1.5 pr-3 text-right font-medium">MRR</th>
              <th className="py-1.5 pr-3 text-right font-medium">Not billing</th>
              <th className="py-1.5 pr-3 text-right font-medium">At risk</th>
              <th className="py-1.5 pr-3 text-right font-medium">Visits held</th>
              <th className="py-1.5 pr-3 text-right font-medium">Consults held</th>
              <th className="py-1.5 text-right font-medium">Slots lost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-ink-800/60 last:border-0">
                <td className="py-2 pr-3">
                  <span className="text-detail font-medium text-ink-100">{r.label}</span>
                  {r.id === "telehealth" && (
                    <span className="ml-1.5 text-micro text-ink-600">modality*</span>
                  )}
                </td>
                <td className="stat-mono py-2 pr-3 text-right text-detail text-ink-200">
                  {r.members}
                </td>
                <td className="stat-mono py-2 pr-3 text-right text-detail text-ink-100">
                  {currency(r.mrr)}
                </td>
                <td
                  className={cn(
                    "stat-mono py-2 pr-3 text-right text-detail",
                    r.atRiskMrr > 0 ? "text-watch" : "text-ink-500",
                  )}
                >
                  {currency(r.atRiskMrr)}
                </td>
                <td className="stat-mono py-2 pr-3 text-right text-detail text-ink-200">
                  {r.highChurn}
                </td>
                <Paired value={r.held} trailing={r.trailingHeld} />
                <Paired value={r.consultsHeld} trailing={r.trailingConsultsHeld} />
                <td
                  className={cn(
                    "stat-mono py-2 text-right text-detail",
                    r.lost > 0 ? "text-watch" : "text-ink-500",
                  )}
                >
                  {r.lost}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-ink-700/70">
              <td className="py-2 pr-3 text-detail font-semibold text-ink-200">All sites</td>
              <td className="stat-mono py-2 pr-3 text-right text-detail font-semibold text-ink-100">
                {totals.members}
              </td>
              <td className="stat-mono py-2 pr-3 text-right text-detail font-semibold text-ink-50">
                {currency(totals.mrr)}
              </td>
              <td className="stat-mono py-2 pr-3 text-right text-detail font-semibold text-watch">
                {currency(totals.atRiskMrr)}
              </td>
              <td className="stat-mono py-2 pr-3 text-right text-detail font-semibold text-ink-100">
                {totals.highChurn}
              </td>
              <Paired value={totals.held} trailing={totals.trailingHeld} bold />
              <Paired value={totals.consultsHeld} trailing={totals.trailingConsultsHeld} bold />
              <td className="stat-mono py-2 text-right text-detail font-semibold text-ink-100">
                {totals.lost}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-2.5 text-micro leading-snug text-ink-500">
        Members, MRR and not-billing are measured — counted from membership records
        (lib/mock/memberships.ts). Visits, consults and slots lost are counted from the
        synthesised booking history (lib/analytics/attendance.ts): the arithmetic is real, the
        bookings are seeded. At risk is modelled by lib/aiInsights.ts:churnRisk.
        {" "}
        <span className="text-ink-600">
          *Telehealth is modelled as a fifth location rather than as a modality, so a Raleigh
          member seen by video counts here and not at Raleigh.
        </span>
      </p>
    </div>
  );
}

/**
 * A daily figure and its trailing-window companion in one cell.
 *
 * The pair is the point — see the header note. Rendering the 30-day figure at
 * `text-micro` in `ink-600` keeps the daily number the one the eye lands on
 * while making the context impossible to miss on the way past.
 */
function Paired({
  value,
  trailing,
  bold,
}: {
  value: number;
  trailing: number;
  bold?: boolean;
}) {
  return (
    <td className="py-2 pr-3 text-right">
      <span
        className={cn(
          "stat-mono text-detail",
          bold ? "font-semibold text-ink-100" : "text-ink-200",
        )}
      >
        {value}
      </span>
      <span className="stat-mono ml-1.5 text-micro text-ink-600">· {trailing} in 30d</span>
    </td>
  );
}
