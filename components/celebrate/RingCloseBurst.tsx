"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * The moment a ring closes.
 *
 * Three things happen at once and then it is over: rays fire outward in the
 * ring's own colour, the ring itself pulses once, and the count ticks to its new
 * value. The whole thing lands in under 900ms because this fires several times a
 * day for an engaged member — anything longer stops being a reward and starts
 * being a wait.
 *
 * Constraints that are requirements, not polish:
 *  - **Never blocks interaction.** The overlay is `pointer-events-none` and
 *    absolutely positioned; the member can keep tapping straight through it.
 *  - **Reduced motion degrades to the final state, not to nothing.** The count
 *    lands on its new value immediately and the ring stays at rest. The member
 *    still sees that something completed — they just aren't made to watch it.
 *  - **Fires on a trigger.** Same discipline as `Confetti`: celebration marks an
 *    event, so mounting is not an event.
 *
 * Nothing in here knows *why* the ring closed. It closes the same way for a
 * member who trained and a member whose provider paused their week — a held day
 * gets the same burst as any other. That is deliberate.
 */

const RAYS = 12;
const BURST_MS = 720;
const COUNT_MS = 620;

export function RingCloseBurst({
  trigger,
  hex,
  count,
  label,
  children,
  className,
}: {
  /** Changing to a new truthy value fires the burst. */
  trigger: number | boolean;
  /** The ring's colour — the burst must read as *that* ring, not a generic win. */
  hex: string;
  /** Optional ticking counter, e.g. the streak going from 13 to 14. */
  count?: { from: number; to: number };
  /** Optional caption under the count. */
  label?: string;
  /** The ring (or card) the burst plays over. */
  children?: React.ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const fired = typeof trigger === "boolean" ? trigger : trigger > 0;

  const [visible, setVisible] = useState(false);
  const [display, setDisplay] = useState(count?.to ?? 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!fired) return;

    setVisible(true);
    const hide = window.setTimeout(() => setVisible(false), BURST_MS + 120);

    if (!count) return () => window.clearTimeout(hide);

    if (reduced) {
      setDisplay(count.to);
      return () => window.clearTimeout(hide);
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(count.from + (count.to - count.from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else rafRef.current = null;
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.clearTimeout(hide);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, fired, reduced, count?.from, count?.to]);

  const showBurst = visible && !reduced;

  return (
    <div className={cn("relative", className)}>
      {/* The ring pulses once. Scale only — a colour flash on a clinical ring
          risks reading as a status change. */}
      <motion.div
        animate={showBurst ? { scale: [1, 1.055, 1] } : { scale: 1 }}
        transition={showBurst ? { duration: 0.5, times: [0, 0.35, 1], ease: [0.22, 1, 0.36, 1] } : { duration: 0 }}
      >
        {children}
      </motion.div>

      <AnimatePresence>
        {showBurst && (
          <motion.div
            key="burst"
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 grid place-items-center"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {/* Expanding halo */}
            <motion.span
              className="absolute rounded-full border-2"
              style={{ borderColor: hex, width: "72%", height: "72%" }}
              initial={{ scale: 0.55, opacity: 0.85 }}
              animate={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: BURST_MS / 1000, ease: [0.16, 1, 0.3, 1] }}
            />
            {/* Rays */}
            {Array.from({ length: RAYS }, (_, i) => {
              const angle = (360 / RAYS) * i;
              return (
                <motion.span
                  key={i}
                  className="absolute h-[3px] w-[14%] origin-left rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${hex}, transparent)`,
                    transform: `rotate(${angle}deg)`,
                  }}
                  initial={{ scaleX: 0.2, opacity: 0.9, x: "18%" }}
                  animate={{ scaleX: 1, opacity: 0, x: "58%" }}
                  transition={{
                    duration: BURST_MS / 1000,
                    ease: [0.16, 1, 0.3, 1],
                    delay: (i % 3) * 0.03,
                  }}
                />
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {count && (
        <div className="mt-2 text-center">
          <p className="stat-mono text-title font-semibold leading-none" style={{ color: hex }}>
            {display}
          </p>
          {label && <p className="mt-1 text-micro uppercase tracking-wide text-ink-500">{label}</p>}
        </div>
      )}
    </div>
  );
}
