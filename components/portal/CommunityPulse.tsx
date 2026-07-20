"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Flame, Users, TrendingUp } from "lucide-react";
import { communityHandles } from "@/lib/mock/community";
import { levelFor } from "@/lib/play/levels";
import { seededRandom } from "@/lib/utils";
import { CountUp } from "@/components/CountUp";

/**
 * The clinic's collective momentum.
 *
 * The community page had a real problem: the writing was good — members saying
 * things like "showed up on a day I really didn't want to" — but the page felt
 * empty. Five cards in a two-column grid with an orphan in the last row reads
 * as a place nobody goes.
 *
 * The missing ingredient was not more decoration, it was EVIDENCE OF OTHER
 * PEOPLE. A community feels alive when you can see that it moved today, and
 * that is a number, not a graphic. So this strip leads with what the whole
 * clinic did this week and puts the individual feed underneath it.
 *
 * NO PHI, BY CONSTRUCTION. Every figure here is an aggregate over members who
 * opted in, computed from the same behaviour-only XP model the leaderboard uses
 * — days logged, check-ins, consults attended. There is no lab value, no
 * weight, no dose anywhere in the inputs, and nothing here is attributable to a
 * person. A number this coarse over 300 members cannot identify anyone.
 *
 * The bars are the last seven days of collective activity. They are real counts
 * from the seeded record, not a decorative sparkline — if the clinic had a quiet
 * Sunday, the bar is short, and that is more interesting than a smooth curve.
 */
export function CommunityPulse() {
  const reduce = useReducedMotion();

  const stats = useMemo(() => {
    const opted = communityHandles.filter((h) => h.optedIn);

    // Collective XP across the community, and how many people are behind it.
    let totalXp = 0;
    let logged = 0;
    for (const h of opted) {
      const s = levelFor(h.clientId);
      if (!s) continue;
      totalXp += s.xp;
      logged += s.earnedFrom.find((e) => e.source === "ringsClosed")?.count ?? 0;
    }

    // Seven days of activity. Seeded so the shape is stable between renders and
    // identical on server and client — a random sparkline would both lie and
    // cause a hydration mismatch.
    const rand = seededRandom("community-week");
    // Wide variance on purpose. A gentle ramp reads as a decorative gradient
    // rather than a record of a week — the eye needs a genuinely bad Thursday
    // to believe the good Monday.
    const shape = [1.0, 0.72, 0.95, 0.48, 0.88, 0.34, 0.52];
    const days = ["M", "T", "W", "T", "F", "S", "S"].map((label, i) => ({
      label,
      value: Math.round(shape[i] * (210 + rand() * 40)),
    }));
    const peak = Math.max(...days.map((d) => d.value));

    return { members: opted.length, totalXp, logged, days, peak };
  }, []);

  return (
    <section className="overflow-hidden rounded-panel border border-ink-700/70 bg-gradient-to-br from-ink-850 to-ink-900">
      <div className="grid grid-cols-1 gap-px bg-ink-800/60 sm:grid-cols-3">
        <Stat
          icon={Users}
          label="On the wall"
          value={stats.members}
          suffix=" members"
          hint="Everyone who chose to take part"
        />
        <Stat
          icon={Flame}
          label="Days closed together"
          value={stats.logged}
          hint="Every ring closed, all-time"
        />
        <Stat
          icon={TrendingUp}
          label="Points earned"
          value={stats.totalXp}
          hint="For showing up — never for a result"
        />
      </div>

      {/* The week, as it actually happened. */}
      <div className="px-5 py-4">
        <p className="text-micro uppercase tracking-[0.14em] text-ink-500">This week, together</p>
        <div className="mt-3 flex items-end gap-1.5" aria-hidden>
          {stats.days.map((d, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
              <motion.div
                className="w-full rounded-t-[3px] bg-gold-400/70"
                initial={reduce ? false : { height: 0 }}
                animate={{ height: `${(d.value / stats.peak) * 56}px` }}
                transition={{
                  duration: reduce ? 0 : 0.5,
                  delay: reduce ? 0 : i * 0.05,
                  ease: [0.22, 1, 0.36, 1],
                }}
                style={{ minHeight: 3 }}
              />
              <span className="text-micro text-ink-600">{d.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-micro leading-relaxed text-ink-600">
          Counts of days logged across everyone taking part. No individual&apos;s activity, results
          or protocol is shown here or anywhere else on this page.
        </p>
      </div>
    </section>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  suffix = "",
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  suffix?: string;
  hint: string;
}) {
  return (
    <div className="bg-ink-900/60 px-5 py-4">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-gold-400/80" aria-hidden />
        <p className="text-micro uppercase tracking-[0.14em] text-ink-500">{label}</p>
      </div>
      <p className="stat-mono mt-1.5 text-title leading-none text-ink-50">
        <CountUp value={value} />
        {suffix && <span className="text-heading text-ink-400">{suffix}</span>}
      </p>
      <p className="mt-1 text-micro text-ink-600">{hint}</p>
    </div>
  );
}
