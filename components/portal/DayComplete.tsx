"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";

/**
 * The moment everything for the day is logged.
 *
 * A completion needs to be FELT, not merely reported. A line of text saying
 * "3 of 3 logged" is information; a beat of motion is a reward, and the reward
 * is what makes someone come back tomorrow.
 *
 * Two constraints shaped this. It fires once per completion and then gets out of
 * the way — a celebration that has to be dismissed is a chore, so this one
 * retires itself after a couple of seconds. And it does not use confetti: the
 * audience is adults paying for medical care, and a burst of paper triangles
 * over a syringe log reads as a toy. A ring closing and a tick landing is the
 * same dopamine with none of the condescension.
 *
 * Respects reduced motion by showing the end state immediately.
 */
export function DayComplete({ show, label }: { show: boolean; label: string }) {
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [fired, setFired] = useState(false);

  useEffect(() => {
    if (show && !fired) {
      setVisible(true);
      setFired(true);
      const t = setTimeout(() => setVisible(false), reduce ? 1200 : 2600);
      return () => clearTimeout(t);
    }
    // Reset when the day's work is reopened, so undoing and redoing a dose can
    // celebrate again rather than staying silent for the rest of the day.
    if (!show && fired) setFired(false);
  }, [show, fired, reduce]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 320, damping: 24 }}
          className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-10"
        >
          <div className="flex items-center gap-3 rounded-panel border border-optimal/30 bg-ink-900/95 px-5 py-3.5 shadow-glow backdrop-blur">
            <span className="relative grid h-9 w-9 place-items-center">
              {/* The ring draws itself closed, then the tick lands. Sequencing
                  them reads as "completed" rather than "appeared". */}
              <svg viewBox="0 0 36 36" className="absolute inset-0 h-9 w-9 -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-optimal/20" />
                <motion.circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  className="text-optimal"
                  initial={{ pathLength: reduce ? 1 : 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: reduce ? 0 : 0.55, ease: "easeOut" }}
                  style={{ pathLength: 1 }}
                />
              </svg>
              <motion.span
                initial={{ scale: reduce ? 1 : 0, opacity: reduce ? 1 : 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: reduce ? 0 : 0.4, type: "spring", stiffness: 500, damping: 18 }}
                className="relative text-optimal"
              >
                <Check className="h-4 w-4" strokeWidth={3} />
              </motion.span>
            </span>
            <div>
              <p className="text-body font-medium text-ink-50">{label}</p>
              <p className="text-detail text-ink-400">That is today done.</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
