"use client";

/**
 * Coach · Win-backs.
 *
 * The list is ranked by winnability rather than by lifetime value, which is the
 * one design decision on this page worth defending. Sorting by spend puts the
 * clinic's biggest historical account at the top even when that member has been
 * dark for a year and is not coming back; the coach burns their morning on the
 * least recoverable name on the list and concludes the feature doesn't work.
 *
 * Volume is capped by attention, not by data. Ten plays is roughly a morning of
 * real calls, so ten is what we show — a list of eighty lapsed members is a
 * report, and nobody works a report.
 */

import * as React from "react";
import { HeartHandshake } from "lucide-react";

import { Card, CardContent, EmptyState } from "@/components/ui/primitives";
import { cn, currency } from "@/lib/utils";
import { staffMap, staffName } from "@/lib/mock/staff";
import { ME_COACH } from "@/components/coach/TodayQueue";
import { lapsedMembers } from "@/lib/growth/winback";
import { WinBackPlay } from "@/components/coach/WinBackPlay";

const NOW = "2026-06-12T09:00:00";

/** A morning's worth of calls. See the note at the top of the file. */
const SHOWN = 10;

const ACTOR = {
  id: ME_COACH,
  name: staffName(ME_COACH),
  role: staffMap[ME_COACH]?.role ?? "Coach",
};

export default function CoachWinBackPage() {
  const all = React.useMemo(() => lapsedMembers(ME_COACH, NOW), []);
  const [selected, setSelected] = React.useState<string | null>(() => all[0]?.client.id ?? null);
  const [handled, setHandled] = React.useState<string[]>([]);

  const shown = all.slice(0, SHOWN);
  const current = all.find((r) => r.client.id === selected) ?? shown[0];

  const recoverable = all.reduce((s, r) => s + r.lifetimeValue, 0);

  return (
    <div className="space-y-8">
      <header>
        <p className="label-eyebrow">COACH CONSOLE</p>
        <h1 className="mt-1 font-display text-title font-semibold tracking-tight text-ink-50">
          Win-backs
        </h1>
        <p className="mt-2 max-w-prose text-body text-ink-400">
          Members on your book who stopped — with a play built from what each of them actually did
          here, and the records it came from sitting next to it. Nothing on this page sends anything.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Lapsed on your book" value={String(all.length)} />
        <Stat label="Plays worth working today" value={String(shown.length)} tone="gold" />
        <Stat label="Lifetime value at stake" value={currency(recoverable, true)} />
      </div>

      {all.length === 0 ? (
        <EmptyState
          icon={<HeartHandshake className="h-6 w-6" />}
          title="Nobody on your book has lapsed"
          hint="Members show up here when billing stops, a chart goes inactive, or nobody has spoken to them in six weeks with nothing booked."
        />
      ) : (
        // Explicit base grid-cols-1: the picker stacks above the play on a
        // phone and only becomes a rail once there is room for one.
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
          <div className="space-y-2">
            {shown.map((r) => {
              const active = current?.client.id === r.client.id;
              const done = handled.includes(r.client.id);
              return (
                <button
                  key={r.client.id}
                  onClick={() => setSelected(r.client.id)}
                  className={cn(
                    "w-full rounded-2xl border p-3 text-left transition-colors focus-ring",
                    active
                      ? "border-gold-400/40 bg-gold-400/[0.07]"
                      : "border-ink-700/70 bg-ink-850/60 hover:border-ink-600",
                    done && "opacity-50",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-body font-medium text-ink-50">
                      {r.client.firstName} {r.client.lastName}
                    </span>
                    <span
                      className={cn(
                        "stat-mono shrink-0 text-body",
                        r.winnability >= 60
                          ? "text-optimal"
                          : r.winnability >= 40
                            ? "text-watch"
                            : "text-ink-500",
                      )}
                    >
                      {r.winnability}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-micro text-ink-500">{r.trigger}</p>
                  <p className="stat-mono mt-1 text-micro text-ink-600">
                    {currency(r.lifetimeValue)} · {r.tenureMonths}mo
                  </p>
                </button>
              );
            })}

            {all.length > SHOWN && (
              <p className="px-1 pt-1 text-micro leading-relaxed text-ink-500">
                <span className="stat-mono">{all.length - SHOWN}</span> more below the line. They
                aren&rsquo;t hidden because they don&rsquo;t matter — they&rsquo;re hidden because a
                list you can&rsquo;t finish is a list you don&rsquo;t start.
              </p>
            )}
          </div>

          {current && (
            <WinBackPlay
              key={current.client.id}
              record={current}
              actor={ACTOR}
              onActed={(id) => setHandled((h) => (h.includes(id) ? h : [...h, id]))}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "gold";
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="label-eyebrow">{label}</p>
        <p
          className={cn(
            "stat-mono mt-2 text-title font-semibold",
            tone === "gold" ? "text-gold-300" : "text-ink-50",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
