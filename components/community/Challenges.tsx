"use client";

/**
 * Location challenges.
 *
 * ── The one design decision that matters here ─────────────────────────────
 * You compete as a CLINIC against other clinics, against a group total. There
 * is no member-vs-member leaderboard anywhere in this feature, and there never
 * will be, for three reasons that are worth writing down because the request
 * for one will come:
 *
 *  1. RANKING BODIES IS RANKING PATIENTS. A leaderboard of weight lost or body
 *     fat dropped is a public ordering of people by how their disease is
 *     responding to treatment. The member at the bottom of that list is the
 *     one who most needs to stay enrolled, and he is the one it drives out.
 *     The clinical population here — men with metabolic disease, people on
 *     GLP-1s — is precisely the population where that ordering does harm.
 *  2. IT REWARDS THE WRONG BEHAVIOUR. An individual leaderboard on a weight
 *     metric pays out for under-eating and over-training, which is the exact
 *     behaviour every coach in this building spends their day arguing against.
 *     A team step total cannot be gamed in a way that hurts you.
 *  3. RESPONSE RATES ARE NOT EFFORT. Two members doing identical work get
 *     different numbers, because biology. Ranking them tells the loser a lie
 *     about himself.
 *
 * So the metrics are all things a person DOES — steps, protein days, sessions
 * — never things a body IS. And the unit of comparison is the clinic, which
 * means the member who had a bad week is still carried by his team instead of
 * being exposed by it. The type system backs this up: ChallengeTeam has no
 * per-member score field to render even if someone wanted to.
 *
 * Goals scale per participant so the biggest clinic doesn't win by headcount —
 * see buildTeams in lib/mock/community.ts.
 */

import { Flag, Users } from "lucide-react";
import type { Challenge, ChallengeTeam } from "@/lib/community/types";
import type { LocationId } from "@/lib/types";
import { Badge, Card, CardContent, Progress } from "@/components/ui/primitives";
import { Stagger, StaggerItem } from "@/components/motion";
import { cn, formatDate } from "@/lib/utils";

const pct = (t: ChallengeTeam) => Math.round((t.total / t.goal) * 100);

/** Compact "1.2M" / "48k" — six-digit step totals wreck a mobile row. */
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function Challenges({
  challenges,
  myLocationId,
}: {
  challenges: Challenge[];
  /** Highlights the reader's own team. The only personalisation here. */
  myLocationId: LocationId;
}) {
  return (
    <Stagger className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {challenges.map((c) => {
        // Sorted by percent of goal, not raw total — raw total would just be a
        // headcount ranking wearing a competition costume.
        const teams = c.teams.slice().sort((a, b) => pct(b) - pct(a));
        const combined = c.teams.reduce((s, t) => s + t.total, 0);
        const participants = c.teams.reduce((s, t) => s + t.participants, 0);

        return (
          <StaggerItem key={c.id}>
            <Card className="h-full">
              <CardContent className="space-y-5 p-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="gold">
                      <Flag className="h-3 w-3" />
                      {c.metric}
                    </Badge>
                    <span className="text-micro text-ink-500">
                      {formatDate(c.startsOn)} – {formatDate(c.endsOn)}
                    </span>
                  </div>
                  <h3 className="mt-2 font-display text-heading font-semibold tracking-tight text-ink-50">
                    {c.name}
                  </h3>
                  <p className="mt-1.5 text-body leading-relaxed text-ink-400">{c.premise}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-ink-900/70 p-3">
                    <p className="label-eyebrow">Everyone, together</p>
                    <p className="stat-mono mt-1 text-heading text-ink-50">{compact(combined)}</p>
                    <p className="text-micro text-ink-500">{c.unit}</p>
                  </div>
                  <div className="rounded-xl bg-ink-900/70 p-3">
                    <p className="label-eyebrow">In it</p>
                    <p className="stat-mono mt-1 text-heading text-ink-50">{participants}</p>
                    <p className="text-micro text-ink-500">members across 4 teams</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {teams.map((t, i) => {
                    const p = pct(t);
                    const mine = t.locationId === myLocationId;
                    return (
                      <div
                        key={t.locationId}
                        className={cn(
                          "rounded-xl border p-3 transition-colors",
                          mine
                            ? "border-gold-400/35 bg-gold-400/[0.07]"
                            : "border-ink-700/60 bg-ink-900/40",
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="stat-mono w-4 shrink-0 text-detail text-ink-500">
                              {i + 1}
                            </span>
                            <span className="truncate text-body font-medium text-ink-100">
                              {t.name}
                            </span>
                            {mine && <Badge tone="gold">Your team</Badge>}
                          </div>
                          <span className="stat-mono shrink-0 text-body text-ink-200">{p}%</span>
                        </div>
                        <Progress
                          value={p}
                          tone={mine ? "gold" : "optimal"}
                          className="mt-2.5"
                        />
                        <div className="mt-1.5 flex items-center justify-between text-micro text-ink-500">
                          <span className="stat-mono">
                            {compact(t.total)} / {compact(t.goal)} {c.unit}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            <span className="stat-mono">{t.participants}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Said out loud, to the member, so the absence of an individual
                    leaderboard reads as a choice rather than a missing feature. */}
                <p className="border-t border-ink-700/60 pt-3 text-micro leading-relaxed text-ink-500">
                  Team totals only. We don&apos;t rank members against each other here — your
                  numbers are between you, your coach and your provider.
                </p>
              </CardContent>
            </Card>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}
