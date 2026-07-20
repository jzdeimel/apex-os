"use client";

/**
 * The wins wall.
 *
 * ── Why this is the first tab ─────────────────────────────────────────────
 * The member's own Progress page answers "am I working?". This one answers a
 * different and, for adherence, more powerful question: "are people like me
 * still here?". Month four is where members quit — the newness is gone, the
 * scale has stalled, and the only thing that keeps someone in the building is
 * evidence that the boring middle is survivable. A wall of people saying "12
 * weeks consistent" is that evidence.
 *
 * ── What is deliberately absent ───────────────────────────────────────────
 *  - No lab values, no weights, no body-fat percentages, no protocol mentions.
 *    A wall of "down 31 lbs" posts is a comparison engine, and this population
 *    responds to unfavourable comparison by leaving, not by trying harder.
 *  - No comments. Cheers only. A reply box under a stranger's vulnerable post
 *    is where the wall turns into a forum, and a forum is where the dosing
 *    conversation starts. Conversation belongs in the moderated group, under a
 *    named coach, where a human is reading — see CoachGroup.tsx.
 *  - No handle is a real name unless that member separately opted in. The
 *    identity substitution happens in lib/mock/community.ts before anything
 *    reaches this component; there is no clientId in this file at all.
 */

import { useMemo, useState } from "react";
import { Heart, MapPin } from "lucide-react";
import type { Win, WinCategory } from "@/lib/community/types";
import { locationName } from "@/lib/mock/locations";
import { Badge, Button, Card, CardContent, EmptyState } from "@/components/ui/primitives";
import { Stagger, StaggerItem } from "@/components/motion";
import { cn, relativeDays } from "@/lib/utils";

const CATEGORY_TONE: Record<WinCategory, "gold" | "optimal" | "info" | "neutral" | "watch"> = {
  Consistency: "gold",
  Training: "optimal",
  Nutrition: "info",
  Recovery: "watch",
  Life: "neutral",
};

const FILTERS: ("All" | WinCategory)[] = [
  "All",
  "Consistency",
  "Training",
  "Nutrition",
  "Recovery",
  "Life",
];

export function WinsWall({ wins }: { wins: Win[] }) {
  const [filter, setFilter] = useState<"All" | WinCategory>("All");

  /**
   * Cheers are held locally and rendered as base + 1.
   *
   * In production this is a write. Here it is state, because a cheer that does
   * not visibly land is worse than no cheer button — the entire mechanic is the
   * half-second of feedback.
   */
  const [cheered, setCheered] = useState<Record<string, boolean>>({});

  const shown = useMemo(
    () =>
      (filter === "All" ? wins : wins.filter((w) => w.category === filter))
        .slice()
        .sort((a, b) => b.postedAt.localeCompare(a.postedAt)),
    [wins, filter],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3 py-1 text-detail font-medium transition-colors focus-ring",
              filter === f
                ? "border-gold-400/40 bg-gold-400/15 text-gold-200"
                : "border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-100",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title="No wins here yet"
          hint="Post the first one — it counts even if it feels small."
        />
      ) : (
        /* Explicit base grid-cols-1: without it the implicit column sizes to
           content and the longest headline pushes the card off a 390px screen. */
        <Stagger className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((w) => {
            const isCheered = !!cheered[w.id];
            return (
              <StaggerItem key={w.id}>
                <Card className="flex h-full flex-col">
                  <CardContent className="flex flex-1 flex-col gap-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Handle initial, not a Monogram — Monogram takes a
                            real first/last name and there isn't one here. */}
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-700/70 font-display text-detail font-semibold text-ink-200">
                          {w.handle.slice(0, 2)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-body font-medium text-ink-100">{w.handle}</p>
                          <p className="flex items-center gap-1 text-micro text-ink-500">
                            <MapPin className="h-3 w-3" />
                            {locationName(w.locationId)}
                            <span aria-hidden>·</span>
                            {relativeDays(w.postedAt)}
                          </p>
                        </div>
                      </div>
                      <Badge tone={CATEGORY_TONE[w.category]}>{w.category}</Badge>
                    </div>

                    <p className="font-display text-heading font-semibold leading-snug text-ink-50">
                      {w.headline}
                    </p>
                    {w.detail && (
                      <p className="text-body leading-relaxed text-ink-400">{w.detail}</p>
                    )}

                    <div className="mt-auto pt-1">
                      <Button
                        variant={isCheered ? "success" : "outline"}
                        size="sm"
                        aria-pressed={isCheered}
                        onClick={() => setCheered((c) => ({ ...c, [w.id]: !c[w.id] }))}
                      >
                        <Heart className={cn("h-3.5 w-3.5", isCheered && "fill-current")} />
                        <span className="stat-mono">{w.cheers + (isCheered ? 1 : 0)}</span>
                        <span className="sr-only">cheers</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
    </div>
  );
}
