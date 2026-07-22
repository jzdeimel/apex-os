"use client";

import { useMemo } from "react";
import { Trophy, ShieldCheck, Users } from "lucide-react";
import { buildLeaderboard, standingBand } from "@/lib/play/leaderboard";
import { cn } from "@/lib/utils";

/**
 * The community board.
 *
 * Three things carry the design, all of them about not making people feel
 * worse:
 *
 *  1. THE BASIS IS ON SCREEN, not in a help article. A member looking at a
 *     ranking's first thought is "ranked on WHAT?", and in a health product the
 *     honest answer — attendance and logging, never a lab value or a dose — is
 *     reassuring rather than boring. Hiding it invites the darker assumption.
 *
 *  2. YOUR OWN ROW IS ALWAYS VISIBLE, pinned below the top slice if you are not
 *     in it, and shown as a BAND rather than an exact number. "47th of 61" is a
 *     demotivating fact with no action attached; "top half" says the same thing
 *     without the sting.
 *
 *  3. NO PODIUM, NO MEDALS. First place gets a slightly warmer row and nothing
 *     else. A three-tier podium turns everyone below it into an also-ran, which
 *     in a clinic full of people paying to improve their health is the precise
 *     opposite of useful.
 *
 * Everything rendered here is a handle. The row type has no clientId and no name
 * field at all — see lib/play/leaderboard.ts.
 */
export function Leaderboard({
  clientId,
  limit = 5,
  personal = true,
}: {
  clientId: string;
  limit?: number;
  personal?: boolean;
}) {
  // Five, not ten. The board is a reason to come back, not the page — a long
  // list pushed the actual community feed clean off the screen, which inverted
  // what the page is for.
  const board = useMemo(() => buildLeaderboard(clientId, limit), [clientId, limit]);

  if (!board.ok) {
    return (
      <section className="rounded-panel border border-ink-800 bg-ink-900/40 p-5">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-ink-500" aria-hidden />
          <h2 className="text-heading text-ink-100">Community board</h2>
        </div>
        <p className="mt-2 text-detail leading-relaxed text-ink-400">{board.reason}</p>
      </section>
    );
  }

  const youInSlice = personal && board.rows.some((r) => r.isYou);

  return (
    <section className="rounded-panel border border-ink-800 bg-ink-900/40">
      <header className="border-b border-ink-800/70 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-gold-400" aria-hidden />
            <h2 className="text-heading text-ink-50">Community board</h2>
          </div>
          <span className="inline-flex items-center gap-1.5 text-detail text-ink-500">
            <Users className="h-3.5 w-3.5" />
            <span className="stat-mono">{board.participants}</span> taking part
          </span>
        </div>

        {/* The basis, stated up front. */}
        <p className="mt-2 flex items-start gap-1.5 text-micro leading-relaxed text-ink-500">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-optimal/70" aria-hidden />
          <span>{board.basis}</span>
        </p>
      </header>

      <ol className="divide-y divide-ink-800/60">
        {board.rows.map((row) => (
          <li
            key={row.handle}
            className={cn(
              "flex items-center gap-3 px-5 py-3",
              personal && row.isYou && "bg-gold-400/[0.07]",
            )}
          >
            <span
              className={cn(
                "stat-mono w-7 shrink-0 text-detail",
                row.rank === 1 ? "text-gold-300" : "text-ink-500",
              )}
            >
              {row.rank}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-body", personal && row.isYou ? "text-gold-200" : "text-ink-100")}>
                {row.handle}
                {personal && row.isYou && <span className="ml-2 text-micro text-ink-500">you</span>}
              </p>
              <p className="truncate text-micro text-ink-500">
                Level {row.level} · {row.title}
              </p>
            </div>
            <span className="stat-mono shrink-0 text-detail text-ink-300">
              {row.xp.toLocaleString("en-US")}
            </span>
          </li>
        ))}
      </ol>

      {/* Pinned own-row for anyone outside the visible slice, as a band. */}
      {personal && !youInSlice && board.you && (
        <div className="flex items-center gap-3 border-t border-ink-800 bg-gold-400/[0.07] px-5 py-3">
          <span className="w-7 shrink-0 text-detail text-ink-500">·</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-body text-gold-200">
              {board.you.handle}
              <span className="ml-2 text-micro text-ink-500">you</span>
            </p>
            <p className="truncate text-micro text-ink-500">
              Level {board.you.level} · {standingBand(board.you.rank, board.participants)}
            </p>
          </div>
          <span className="stat-mono shrink-0 text-detail text-ink-300">
            {board.you.xp.toLocaleString("en-US")}
          </span>
        </div>
      )}

      <p className="border-t border-ink-800/70 px-5 py-3 text-micro leading-relaxed text-ink-600">
        Everyone here chose to take part, and everyone appears under a handle. Your name, your
        protocol and your results are never on this board.
      </p>
    </section>
  );
}
