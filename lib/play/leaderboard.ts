import { levelFor } from "@/lib/play/levels";
import { communityHandles } from "@/lib/mock/community";
import type { CommunityHandle } from "@/lib/community/types";
import { K_MIN } from "@/lib/cohort/trajectory";

/**
 * The community leaderboard.
 *
 * WHY THIS IS SAFE TO SHIP, WHEN A HEALTH LEADERBOARD USUALLY IS NOT
 * ------------------------------------------------------------------
 * Ranking patients against each other is normally a bad idea twice over: it
 * leaks health information, and it pressures people toward behaviour that is
 * not in their interest. Neither applies here, but only because of decisions
 * made elsewhere that this file depends on and must not undermine.
 *
 * 1. XP CONTAINS NO CLINICAL INFORMATION. `lib/play/levels.ts` awards points for
 *    BEHAVIOURS only — showing up, logging, getting the panel drawn — and its
 *    header records that an outcome-based scoreboard was shipped once and had
 *    to be pulled. There is no biomarker, no weight delta and no dose count
 *    anywhere in the XP model. So a rank reveals how consistently someone
 *    engages, and nothing whatsoever about their health.
 *
 * 2. IT CANNOT REWARD TAKING MORE MEDICINE. Because dose count earns nothing, a
 *    member cannot climb by dosing more. This is the property that matters most
 *    and the one to re-check if anyone ever extends XP_WEIGHTS.
 *
 * 3. A PAUSED MEMBER IS NOT PUNISHED. `protectedDays` scores identically to a
 *    fully closed day, so somebody held off protocol on provider instruction
 *    keeps climbing. Without that, the board would quietly penalise people for
 *    following clinical advice — the exact inversion this product exists to
 *    avoid.
 *
 * WHAT THIS FILE ADDS
 * -------------------
 * Everything above is inherited. What this file must guarantee itself:
 *
 *  - OPT-IN. Only members who joined the community appear. Consent gates
 *    inclusion at the source rather than being checked by the UI, so a caller
 *    cannot forget.
 *  - HANDLES, NEVER NAMES. The returned type has no clientId and no name field.
 *    Not "we don't render it" — it is not in the object, so it cannot leak
 *    through a stray prop or a console.log.
 *  - A FLOOR. Below K_MIN participants a ranking becomes a re-identification
 *    tool in a clinic this size, so the board refuses rather than degrading.
 */

/**
 * One row. Deliberately carries no identity beyond the handle — see rule above.
 * If you find yourself wanting to add clientId here, add a separate lookup
 * instead and leave this type unable to leak.
 */
export interface LeaderboardRow {
  rank: number;
  handle: string;
  level: number;
  title: string;
  xp: number;
  /** True for the viewer's own row, so the UI can mark it without a name. */
  isYou: boolean;
}

export interface Leaderboard {
  ok: boolean;
  /** Present only when ok is false — why there is no board to show. */
  reason?: string;
  rows: LeaderboardRow[];
  /** The viewer's row, even when they fall outside the visible top slice. */
  you?: LeaderboardRow;
  participants: number;
  /** What the ranking is computed from, rendered next to the board. */
  basis: string;
}

export const LEADERBOARD_BASIS =
  "Ranked on points earned for showing up — days logged, check-ins, consults attended, panels drawn. " +
  "Nothing here is scored on a lab value, a weight, or how much of anything you take. Days paused on " +
  "your provider's instruction count in full.";

/**
 * Build the board.
 *
 * `limit` is the visible slice, not the participant count — the floor check
 * always runs against everyone who opted in, so a small clinic cannot be
 * unmasked by asking for a short list.
 */
export function buildLeaderboard(viewerClientId: string, limit = 10): Leaderboard {
  const optedIn = communityHandles.filter((p: CommunityHandle) => p.optedIn);

  const scored = optedIn
    .map((p: CommunityHandle) => {
      const state = levelFor(p.clientId);
      if (!state) return null;
      return {
        handle: p.handle,
        level: state.level,
        title: state.name,
        xp: state.xp,
        isYou: p.clientId === viewerClientId,
      };
    })
    .filter((x): x is Exclude<typeof x, null> => x !== null);

  if (scored.length < K_MIN) {
    return {
      ok: false,
      reason: `A leaderboard needs at least ${K_MIN} members taking part before it can be shown. With fewer than that, a position on the board starts to identify the person holding it. ${scored.length} have joined so far.`,
      rows: [],
      participants: scored.length,
      basis: LEADERBOARD_BASIS,
    };
  }

  // Ties resolve by handle so the order is stable between renders rather than
  // shuffling on every build — a board that reorders itself for no reason reads
  // as broken.
  const ranked = [...scored]
    .sort((a, b) => (b.xp - a.xp) || a.handle.localeCompare(b.handle))
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const you = ranked.find((r) => r.isYou);

  return {
    ok: true,
    rows: ranked.slice(0, limit),
    you,
    participants: ranked.length,
    basis: LEADERBOARD_BASIS,
  };
}

/**
 * A coarse standing, for members who would rather not see an exact position.
 *
 * Being 47th of 61 is a demotivating fact with no action attached to it. The
 * band says the same thing without the sting, and it is what the board shows
 * anyone outside the visible slice.
 */
export function standingBand(rank: number, total: number): string {
  const pct = rank / total;
  if (pct <= 0.1) return "Top 10%";
  if (pct <= 0.25) return "Top quarter";
  if (pct <= 0.5) return "Top half";
  return "Building";
}
