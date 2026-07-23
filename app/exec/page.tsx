import Link from "next/link";
import { ArrowUpRight, Gauge, Network } from "lucide-react";
import { VIEWER } from "@/lib/viewer";
import {
  FigureTile,
  NotComputableCard,
  ProvenanceLegend,
} from "@/components/exec/Figure";
import { AttentionList } from "@/components/exec/AttentionList";
import { LocationTable } from "@/components/exec/LocationTable";
import { CrossLocationMoney } from "@/components/exec/CrossLocationMoney";
import { yesterdayFigures, YESTERDAY, TODAY, TRAILING_DAYS } from "@/lib/exec/morning";
import { businessFigures, unanswerable } from "@/lib/exec/business";
import { formatDate } from "@/lib/utils";
import { Stagger, StaggerItem } from "@/components/motion";
import { OwnerMorningBrief } from "@/components/exec/OwnerMorningBrief";

/**
 * OWNER CONSOLE · Morning.
 *
 * The screen Zack checks with a coffee. One pass, under a minute, three
 * questions in the order he actually asks them: what happened yesterday, what
 * needs me today, is the business healthy.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS WHEN app/admin/daily-report ALREADY DOES
 * ---------------------------------------------------------------------------
 * `app/admin/daily-report/page.tsx` is 383 real lines of good work — genuinely
 * computed from order line items, failures pulled to the top, a print view ops
 * actually uses. The audit's finding was not that it is bad. It was that it is
 * in no navigation tree, reachable only by typing the URL, and that it answers
 * a fulfilment question. An owner does not open an app to read an order report;
 * he opens it for consults, conversions, revenue and who is about to leave.
 *
 * So this console does not replace it or restate it. The 24-hour order figure
 * here links straight into it, and the stranded-order rows in the attention
 * list link into it. It stays the system of record for fulfilment; this becomes
 * the way anyone finds it.
 *
 * ---------------------------------------------------------------------------
 * THE LAYOUT RULE FOR THIS SCREEN
 * ---------------------------------------------------------------------------
 * YESTERDAY AND "NEEDS YOU" SHARE THE FIRST VIEWPORT. Everything below —
 * business health, the location table, the questions this console refuses to
 * answer — is scroll. `app/coach/page.tsx` states the equivalent rule for the
 * coach ("the first queue row is visible without scrolling") and the reasoning
 * carries: whitespace above the fold on a screen someone checks daily is not
 * elegance, it is the thing they came for pushed out of sight.
 *
 * Hence the legend is one dense strip rather than a card per level, and the
 * four morning tiles sit at `sm:grid-cols-2 lg:grid-cols-4` so a phone shows two
 * across rather than one tall column.
 */
export default function ExecMorningPage() {
  const yesterday = yesterdayFigures("all");
  const business = businessFigures("all");
  const gaps = unanswerable();

  // Zack's own name, from the signed-in account. This is the one console in the
  // product rendered for a specific person rather than for a role, and the
  // greeting says so — `lib/viewer.ts` already holds the owner account.
  const firstName = VIEWER.name.split(" ")[0];

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="label-eyebrow">OWNER CONSOLE</p>
          <h1 className="mt-0.5 font-display text-title font-semibold tracking-tight text-ink-50">
            Good morning, {firstName}
          </h1>
        </div>
        <p className="text-micro text-ink-500">
          Preview data as of {formatDate(TODAY)} · yesterday was {formatDate(YESTERDAY)} · all four
          locations and telehealth
        </p>
      </header>

      <ProvenanceLegend className="mt-4" />

      {/* ---- 1. WHAT HAPPENED YESTERDAY ---------------------------------- */}
      <section className="mt-5">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-heading font-semibold text-ink-50">
            What happened yesterday
          </h2>
          <p className="text-micro text-ink-500">
            Each tile carries its trailing {TRAILING_DAYS}-day count — one clinic day is too thin
            to read alone
          </p>
        </div>
        <Stagger className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {yesterday.map((f) => (
            <StaggerItem key={f.id}>
              <FigureTile figure={f} size="lead" />
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ---- 2. WHAT NEEDS YOU ------------------------------------------- */}
      <section className="mt-6">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-heading font-semibold text-ink-50">Needs you</h2>
          <p className="text-micro text-ink-500">
            Ranked in disjoint bands — a member waiting always outranks a larger number of dollars
          </p>
        </div>
        <AttentionList />
      </section>

      <section className="mt-6">
        <OwnerMorningBrief />
      </section>

      {/* ---- 3. IS THE BUSINESS HEALTHY ---------------------------------- */}
      <section className="mt-8 border-t border-ink-800/60 pt-6">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-heading font-semibold text-ink-50">
            The state of the book
          </h2>
          <Link
            href="/coach/winback"
            className="focus-ring inline-flex items-center gap-1 rounded text-micro text-gold-300 transition-colors hover:text-gold-200"
          >
            Work the lapsed list
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <Stagger className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {business.map((f) => (
            <StaggerItem key={f.id}>
              <FigureTile figure={f} />
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ---- 4. CROSS-LOCATION MONEY ------------------------------------- */}
      {/* The owner's compare-and-contrast: which site is working, which is
          leaking, ranked on money. The operational LocationTable sits under it
          for the by-site visit/consult detail. */}
      <section className="mt-8 border-t border-ink-800/60 pt-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-heading font-semibold text-ink-50">
            Which location is working
          </h2>
          <p className="text-micro text-ink-500">Ranked on money — all sites, side by side</p>
        </div>
        <CrossLocationMoney />
      </section>

      <section className="mt-5">
        <LocationTable />
      </section>

      {/* ---- 5. THE REFUSALS --------------------------------------------- */}
      {/*
        Placed last and NOT hidden.

        The temptation is to bury this behind a link — it is four cards that all
        say "no". Keeping it on the morning screen is the single most important
        editorial decision on this page. The audit's meta-finding was that a
        demo audience cannot tell the real numbers from the invented ones; the
        fix is not only labelling what is shown, it is being visibly explicit
        about what is NOT, in the same place, at the same weight. An owner who
        scrolls to the bottom of his morning screen and reads "we cannot tell
        you what the clinic made last month" has learned something true and
        important about his own system in about eight seconds.
      */}
      <section className="mt-8 border-t border-ink-800/60 pt-6">
        <div className="mb-2">
          <h2 className="font-display text-heading font-semibold text-ink-50">
            What this console will not tell you
          </h2>
          <p className="mt-1 max-w-3xl text-detail leading-snug text-ink-400">
            Four questions an owner asks that Apex cannot currently answer from any record it
            holds. Each names the surface elsewhere in the app that answers it anyway, with an
            invented figure, so the omission here can be checked rather than trusted. A number
            derived from a magic constant is worse than no number, because it gets quoted.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {gaps.map((g) => (
            <NotComputableCard key={g.id} item={g} />
          ))}
        </div>
      </section>

      {/* ---- Where to go next -------------------------------------------- */}
      <section className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <DeepLink
          href="/exec/capacity"
          icon={<Gauge className="h-4 w-4" />}
          title="Capacity and load"
          detail="Where the clinic is busy, who has room, and the hours booked onto nobody's roster. Not a staff leaderboard."
        />
        <DeepLink
          href="/exec/pipeline"
          icon={<Network className="h-4 w-4" />}
          title="Lead pipeline"
          detail="What acquisition Apex can measure — and the plain statement of what it cannot capture at all."
        />
      </section>
    </div>
  );
}

function DeepLink({
  href,
  icon,
  title,
  detail,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <Link href={href} className="card card-hover focus-ring block min-w-0 p-3.5">
      <div className="flex items-center gap-2 text-gold-300">
        {icon}
        <p className="font-display text-heading font-semibold text-ink-50">{title}</p>
        <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-ink-600" />
      </div>
      <p className="mt-1.5 text-detail leading-snug text-ink-400">{detail}</p>
    </Link>
  );
}
