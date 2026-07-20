import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CapacityPanels } from "@/components/exec/CapacityPanels";

/**
 * OWNER CONSOLE · Capacity and load.
 *
 * The coach-and-clinician view the brief asked for, built on
 * `lib/analytics/capacity.ts` — rostered hours against booked hours, which is
 * the only pair of numbers that can tell an owner whether to hire, whether to
 * open Saturdays, or whether the 2pm bottleneck is a room problem or a
 * rostering one. "Appointments per day", the figure the audited system reports,
 * cannot distinguish a provider who saw nine members across a nine-hour shift
 * from one who saw nine in four hours and went home.
 *
 * ---------------------------------------------------------------------------
 * TWO THINGS THIS PAGE REFUSES TO BE
 * ---------------------------------------------------------------------------
 * 1. A LEADERBOARD. `docs/audit/ENGAGEMENT.md` records that this codebase
 *    deliberately avoids ranking people against one another, and staff are the
 *    case where it matters most: a ranked list of clinicians silently converts
 *    a rostering fact into a performance verdict, and the person at the bottom
 *    has no way to appeal a number that cannot see they were rostered onto a
 *    quiet site. So: sorted by absolute booked hours, no rank column, and the
 *    operative column is OPEN HOURS — "who has room", a scheduling question
 *    with an action attached.
 *
 * 2. A UTILISATION HEADLINE. The clinic-wide ratio computes to about 4% and
 *    every step of that arithmetic is correct. See the scale notice at the top
 *    of the page and `lib/exec/capacity.ts` for why it is nonetheless unusable,
 *    and why that makes it the most instructive number in the product.
 */
export default function ExecCapacityPage() {
  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <Link
            href="/exec"
            className="focus-ring inline-flex items-center gap-1 rounded text-micro text-ink-500 transition-colors hover:text-ink-300"
          >
            <ArrowLeft className="h-3 w-3" />
            Morning
          </Link>
          <p className="label-eyebrow mt-1">OWNER CONSOLE</p>
          <h1 className="mt-0.5 font-display text-title font-semibold tracking-tight text-ink-50">
            Capacity and load
          </h1>
        </div>
        <p className="max-w-md text-micro leading-snug text-ink-500">
          Rostered hours against booked hours, by site, by hour and by clinician. Sorted by
          workload, never ranked by performance.
        </p>
      </header>

      <section className="mt-4">
        <CapacityPanels />
      </section>
    </div>
  );
}
