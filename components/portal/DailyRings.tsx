"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Lock, Flame, Check, Shield } from "lucide-react";
import { buildDailyPlan, ringHistory, hasDose, type Ring, type DailyPlan } from "@/lib/daily/today";
import { getClient } from "@/lib/mock/clients";
import { Card, CardContent, Badge } from "@/components/ui/primitives";
import { Stagger, StaggerItem } from "@/components/portal/still";
import { useMemberLog } from "@/lib/member/logStore";
import { RingCloseBurst } from "@/components/celebrate/RingCloseBurst";
import { useCelebrations } from "@/components/celebrate/CelebrationProvider";

/**
 * The daily loop, on one screen.
 *
 * Three rings — Protocol, Fuel, Train. Close all three and the day counts. The
 * mechanic is deliberately small: a member who has to learn a system will not
 * open it on day nine.
 *
 * Two details that are product decisions rather than styling:
 *
 *  - A **held** day renders differently from a **missed** day. If a provider
 *    paused an item, the streak holds. A system that costs someone a 60-day
 *    streak for following medical advice teaches them to hide it next time.
 *  - There is **no comparison to any other member** anywhere on this component.
 *    Two people's protocols are two different medical situations; ranking them
 *    is both a PHI leak and a shame mechanic.
 */

const RING_R = 46;
const RING_C = 2 * Math.PI * RING_R;

export function DailyRings({ clientId }: { clientId: string }) {
  const client = getClient(clientId);
  const reduced = useReducedMotion();
  const [openRing, setOpenRing] = useState<Ring["id"] | null>(null);
  const [ringBursts, setRingBursts] = useState<Record<string, number>>({});
  const previousProgress = useRef<Record<string, number> | null>(null);
  const { emit } = useCelebrations();

  /**
   * The member's REAL log, not a seeded guess.
   *
   * `buildDailyPlan` fills `taken` from a PRNG so the demo has a plausible
   * shape, and the checkbox next to each item used to be a decorative <span>
   * with no handler — so the single action this whole screen exists to
   * support, "I took it", was impossible, and the tick you saw was fiction.
   * Both halves are fixed here: state comes from the log store, and the control
   * is a real button that writes through it (which now persists to Postgres via
   * /api/member/log).
   */
  const { isDoseLogged, logDose, undoDose, hydrated } = useMemberLog();

  const plan = useMemo<DailyPlan | null>(
    () => (client ? buildDailyPlan(client) : null),
    [client],
  );
  const history = useMemo(() => (client ? ringHistory(client, 28) : []), [client]);

  /** Logged, per the member's own record. Empty until the store hydrates. */
  const takenNow = (id: string) => (hydrated ? !!isDoseLogged(id) : false);

  /**
   * The Protocol ring counts what the member actually logged, so the ring and
   * the checkboxes below it can never disagree. Held items are excluded from
   * the target rather than counted as missed — pausing on medical advice must
   * not read as a failure (see the header note).
   */
  const actionable = useMemo(() => plan?.doses.filter((d) => !d.heldReason) ?? [], [plan]);
  const loggedCount = useMemo(
    () => actionable.filter((d) => takenNow(d.id)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actionable, hydrated, isDoseLogged],
  );
  const rings = useMemo(
    () =>
      (plan?.rings ?? []).map((r) =>
        r.id === "protocol"
          ? {
              ...r,
              done: loggedCount,
              target: actionable.length,
              progress: actionable.length === 0 ? 1 : loggedCount / actionable.length,
            }
          : r,
      ),
    [actionable.length, loggedCount, plan],
  );

  const closed = rings.filter((r) => r.progress >= 1).length;
  const ringSignature = rings.map((r) => `${r.id}:${r.progress >= 1 ? "closed" : "open"}`).join("|");

  useEffect(() => {
    if (!hydrated) return;
    const current = Object.fromEntries(rings.map((r) => [r.id, r.progress]));
    const previous = previousProgress.current;
    previousProgress.current = current;
    if (!previous) return;

    const newlyClosed = rings.filter((r) => (previous[r.id] ?? 0) < 1 && r.progress >= 1);
    if (newlyClosed.length === 0) return;
    setRingBursts((state) => {
      const next = { ...state };
      for (const ring of newlyClosed) next[ring.id] = (next[ring.id] ?? 0) + 1;
      return next;
    });
  }, [hydrated, ringSignature, rings]);

  if (!plan) return null;

  return (
    <div className="space-y-4">
      {/* ── Rings + streak ─────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="flex shrink-0 items-center justify-center gap-4">
              {rings.map((ring, i) => (
                <RingCloseBurst key={ring.id} trigger={ringBursts[ring.id] ?? 0} hex={ring.hex}>
                  <button
                    onClick={() => setOpenRing((v) => (v === ring.id ? null : ring.id))}
                    className="group relative grid place-items-center rounded-panel p-1 focus-ring"
                    aria-label={`${ring.label}: ${ring.done} of ${ring.target} ${ring.unit}`}
                  >
                    <svg width="104" height="104" viewBox="0 0 104 104" className="-rotate-90">
                      <circle
                        cx="52" cy="52" r={RING_R}
                        fill="none" stroke="var(--chart-grid)" strokeWidth="9"
                      />
                      <motion.circle
                        cx="52" cy="52" r={RING_R}
                        fill="none"
                        stroke={ring.hex}
                        strokeWidth="9"
                        strokeLinecap="round"
                        strokeDasharray={RING_C}
                        initial={{ strokeDashoffset: RING_C }}
                        animate={{ strokeDashoffset: RING_C - RING_C * Math.min(1, ring.progress) }}
                        transition={
                          reduced
                            ? { duration: 0 }
                            : { duration: 1.05, ease: [0.22, 1, 0.36, 1], delay: 0.12 * i }
                        }
                      />
                    </svg>
                    <span className="absolute flex flex-col items-center">
                      <span className="stat-mono text-heading font-semibold text-ink-50">
                        {Math.round(ring.progress * 100)}
                        <span className="text-micro text-ink-500">%</span>
                      </span>
                      <span className="text-micro uppercase tracking-wide text-ink-500">
                        {ring.label}
                      </span>
                    </span>
                  </button>
                </RingCloseBurst>
              ))}
            </div>

            <div className="min-w-0 flex-1">
              <p className="label-eyebrow">Today</p>
              <p className="mt-1 font-display text-heading font-semibold text-ink-50">
                {plan.focus}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-control border border-gold-400/30 bg-gold-400/12 px-2.5 py-1">
                  <Flame className="h-3.5 w-3.5 text-gold-300" />
                  <span className="stat-mono text-micro font-semibold text-gold-200">
                    {plan.streak.current}
                  </span>
                  <span className="text-micro text-ink-300">day streak</span>
                </span>
                <span className="text-micro text-ink-500">
                  best <span className="stat-mono text-ink-300">{plan.streak.best}</span>
                </span>
                <span className="text-micro text-ink-600">·</span>
                <span className="text-micro text-ink-500">
                  <span className="stat-mono text-ink-300">{closed}</span> of 3 rings closed
                </span>
              </div>

              {plan.streak.protectedDays > 0 && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-micro text-ink-500">
                  <Shield className="h-3 w-3 text-optimal" />
                  <span className="stat-mono text-ink-300">{plan.streak.protectedDays}</span>
                  held day{plan.streak.protectedDays === 1 ? "" : "s"} — your provider paused
                  something. Your streak is safe.
                </p>
              )}
            </div>
          </div>

          {/* Expanded ring detail */}
          {openRing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-4 overflow-hidden border-t border-ink-800/60 pt-4"
            >
              {rings
                .filter((r) => r.id === openRing)
                .map((r) => (
                  <div key={r.id}>
                    <p className="text-detail text-ink-200">{r.detail}</p>
                    <p className="mt-1 text-micro text-ink-500">
                      <span className="stat-mono text-ink-300">{r.done}</span> of{" "}
                      <span className="stat-mono text-ink-300">{r.target}</span> {r.unit}
                    </p>
                  </div>
                ))}
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* ── What to take today ─────────────────────────────────────── */}
      <Card>
        <CardContent className="p-5">
          <p className="label-eyebrow">Protocol · today</p>
          {plan.doses.length === 0 ? (
            <p className="mt-2 text-detail text-ink-400">Nothing scheduled today.</p>
          ) : (
            <Stagger className="mt-3 space-y-2">
              {plan.doses.map((d) => (
                <StaggerItem key={d.id}>
                  <div
                    className={`flex items-center gap-3 rounded-panel border px-4 py-3 ${
                      d.heldReason
                        ? "border-watch/25 bg-watch/5"
                        : "border-ink-800 bg-ink-900/40"
                    }`}
                  >
                    <button
                      type="button"
                      // A provider hold is not the member's to override. It stays
                      // visible and stays uncheckable, with the reason shown.
                      disabled={!!d.heldReason}
                      aria-pressed={takenNow(d.id)}
                      aria-label={
                        d.heldReason
                          ? `${d.name} — paused by your provider`
                          : takenNow(d.id)
                            ? `Undo — mark ${d.name} as not taken`
                            : `Mark ${d.name} as taken`
                      }
                      onClick={() =>
                        takenNow(d.id)
                          ? undoDose(d.id)
                          : (() => {
                              logDose(d.id, d.name);
                              emit({ type: "doseLogged", name: d.name });
                            })()
                      }
                      className={`focus-ring grid h-7 w-7 shrink-0 place-items-center rounded-control border transition-colors ${
                        takenNow(d.id)
                          ? "border-optimal/40 bg-optimal/15 text-optimal"
                          : "border-ink-700 bg-ink-800 text-ink-500"
                      } ${
                        d.heldReason
                          ? "cursor-not-allowed opacity-50"
                          : "hover:border-optimal/40 hover:text-optimal"
                      }`}
                    >
                      {takenNow(d.id) ? <Check className="h-3.5 w-3.5" /> : null}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-detail font-medium text-ink-100">{d.name}</p>
                      <p className="mt-0.5 text-micro text-ink-500">
                        {d.timing} · {d.route}
                      </p>
                      {d.heldReason && (
                        <p className="mt-1 text-micro text-watch">{d.heldReason}</p>
                      )}
                    </div>
                    {/* The dose is never shown to the member — it lives on the
                        provider-signed prescription. A coaching session has no
                        dose, so it gets no lock. */}
                    {hasDose(d.route) && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-control border border-ink-700 bg-ink-800/60 px-2 py-0.5 text-micro text-ink-400">
                        <Lock className="h-2.5 w-2.5" /> Dose set by your provider
                      </span>
                    )}
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </CardContent>
      </Card>

      {/* ── Fuel + Train ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <p className="label-eyebrow">Fuel · today</p>
            <p className="mt-1">
              <span className="stat-mono text-title font-semibold text-ink-50">
                {plan.meals.calories.toLocaleString()}
              </span>
              <span className="ml-1 text-micro text-ink-500">kcal</span>
            </p>
            <div className="mt-3 space-y-2">
              {[plan.meals.protein, plan.meals.carbs, plan.meals.fat].map((m) => (
                <div key={m.label} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-detail text-ink-200">{m.label}</p>
                    <p className="text-micro text-ink-600">{m.hint}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="stat-mono text-detail text-ink-100">{m.grams}g</span>
                    {m.hit && <Check className="h-3.5 w-3.5 text-optimal" />}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="label-eyebrow">Train · today</p>
            <p className="mt-1 font-display text-heading font-semibold text-ink-50">
              {plan.workout.focus}
            </p>
            <p className="mt-1 text-detail text-ink-400">{plan.workout.detail}</p>
            <div className="mt-3">
              <Badge tone={plan.workout.completed ? "optimal" : "neutral"}>
                {plan.workout.isRest
                  ? "Rest day"
                  : plan.workout.completed
                    ? "Done"
                    : "Not logged yet"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 28-day strip ───────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <p className="label-eyebrow">Last 28 days</p>
            <p className="text-micro text-ink-600">
              held days count — they are not misses
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {history.map((d) => (
              <span
                key={d.date}
                title={`${d.date}${d.protectedDay ? " — held" : d.closed ? " — closed" : " — missed"}`}
                className={`h-6 flex-1 rounded ${
                  d.protectedDay
                    ? "border border-optimal/40 bg-optimal/10"
                    : d.closed
                      ? "bg-optimal/70"
                      : "bg-ink-800"
                }`}
                style={{ minWidth: 10 }}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Wins ───────────────────────────────────────────────────── */}
      {plan.wins.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {plan.wins.map((w) => (
            <div
              key={w.label}
              className="rounded-panel border border-gold-400/25 bg-gradient-to-br from-gold-500/12 to-transparent p-4"
            >
              <p className="font-display text-detail font-semibold text-gold-200">{w.label}</p>
              <p className="mt-1 text-detail leading-relaxed text-ink-300">{w.detail}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
