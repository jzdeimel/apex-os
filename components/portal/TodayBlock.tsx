"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { dosesDueOn } from "@/lib/dosing/prescriptions";
import { useMemberLog } from "@/lib/member/logStore";
import { TodayDoses } from "@/components/portal/TodayDoses";
import { QuickLog } from "@/components/portal/QuickLog";
import { useCelebrations } from "@/components/celebrate/CelebrationProvider";
import { cn } from "@/lib/utils";

/**
 * Everything a member logs, in one place, above everything they merely read.
 *
 * The dashboard used to be seventeen cards of read-only status, with the actual
 * logging scattered across four other routes — and in the case of taking a dose,
 * existing nowhere at all. A member opened the app, looked at a protocol ring
 * they had no way to move, and left having recorded nothing.
 *
 * This block inverts that. What you have to DO is at the top, in one card, and
 * everything that reports on what you have done sits below it. Food and training
 * stay on their own screens because they are genuinely bigger interactions; the
 * daily minimum — doses, weight, how you feel — is all here.
 *
 * The completion state is deliberately a single condition covering all three.
 * Celebrating doses alone would teach a member that the rest is optional.
 */
export function TodayBlock({ clientId, iso }: { clientId: string; iso: string }) {
  const { today } = useMemberLog();
  const { emit } = useCelebrations();
  const wasAllDone = useRef(false);
  const due = dosesDueOn(clientId, iso);

  const dosesLogged = today.doses.length >= due.length;
  const weightLogged = today.weightLb !== undefined;
  const feelLogged = !!today.feel;
  const allDone = dosesLogged && weightLogged && feelLogged;

  const remaining =
    (dosesLogged ? 0 : due.length - today.doses.length) +
    (weightLogged ? 0 : 1) +
    (feelLogged ? 0 : 1);
  const steps = [
    { id: "dose", label: due.length === 1 ? "Dose" : "Doses", done: dosesLogged },
    { id: "weight", label: "Weight", done: weightLogged },
    { id: "feel", label: "Feel", done: feelLogged },
  ];

  useEffect(() => {
    if (allDone && !wasAllDone.current) {
      emit({ type: "dayComplete", label: "Everything logged" });
    }
    wasAllDone.current = allDone;
  }, [allDone, emit]);

  return (
    <section className="rounded-panel border border-ink-700/70 bg-ink-850/60">
      <header className="border-b border-ink-800/70 px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-title text-ink-50">Today</h2>
          <p className="text-detail text-ink-400">
            {allDone ? (
              <span className="text-optimal">All logged</span>
            ) : (
              <>
                <span className="stat-mono text-ink-100">{remaining}</span>{" "}
                {remaining === 1 ? "thing" : "things"} left
              </>
            )}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2" aria-label="Today's logging progress">
          {steps.map((step) => (
            <div key={step.id} className="min-w-0">
              <div className="mb-1.5 flex items-center gap-1.5">
                <span
                  className={cn(
                    "grid h-4 w-4 shrink-0 place-items-center rounded-control border",
                    step.done
                      ? "border-optimal/40 bg-optimal/15 text-optimal"
                      : "border-ink-700 bg-ink-900 text-ink-600",
                  )}
                >
                  <AnimatePresence initial={false}>
                    {step.done && (
                      <motion.span
                        key="done"
                        initial={{ scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.4, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 520, damping: 24 }}
                      >
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
                <span className={cn("truncate text-micro uppercase", step.done ? "text-ink-300" : "text-ink-600")}>
                  {step.label}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-ink-800">
                <motion.div
                  className="h-full rounded-full bg-optimal"
                  initial={false}
                  animate={{ width: step.done ? "100%" : "0%" }}
                  transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
          ))}
        </div>
      </header>

      <div className="space-y-7 px-5 py-5">
        <TodayDoses clientId={clientId} iso={iso} />
        <div className="border-t border-ink-800/70 pt-6">
          <QuickLog />
        </div>
      </div>

    </section>
  );
}
