"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";

/**
 * The seal that stamps down when a consult is signed. Staff-facing only.
 *
 * This is the one celebration in the product that is not allowed to be fun.
 * Signing a note is an attestation — a named clinician putting their name to a
 * clinical record that will be read years from now, possibly by a lawyer. The
 * animation has to carry that weight, so it borrows from a physical stamp
 * rather than from a game: mass coming down fast, a hard landing with a small
 * overshoot, and then it settles and stops moving. No confetti, no colour spray,
 * no bounce loop.
 *
 * The ledger id underneath is the actual point. The seal is theatre; the hash is
 * the evidence. It renders in mono, selectable, and it never animates — a number
 * somebody may need to copy into an audit response should not be moving.
 */

const STAMP_MS = 0.62;

export function SignedSeal({
  trigger,
  ledgerId,
  hash,
  signedBy,
  signedAt,
  label = "Signed",
  className,
}: {
  /** Changing to a new truthy value stamps the seal. */
  trigger: number | boolean;
  /** Ledger row id this signature was written to. */
  ledgerId: string;
  /** Short chain hash, if the caller has it. */
  hash?: string;
  signedBy: string;
  /** ISO timestamp. */
  signedAt: string;
  label?: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const fired = typeof trigger === "boolean" ? trigger : trigger > 0;

  // Reduced motion lands on the *final* state — the seal is present and settled,
  // it simply never travelled. A signature that silently fails to appear would
  // be a worse accessibility outcome than one that doesn't animate.
  const stamp = reduced
    ? { initial: { opacity: 1, scale: 1, rotate: -4 }, animate: { opacity: 1, scale: 1, rotate: -4 } }
    : {
        initial: { opacity: 0, scale: 2.3, rotate: -16 },
        animate: { opacity: 1, scale: [2.3, 0.93, 1.02, 1], rotate: [-16, -4, -4, -4] },
      };

  return (
    <AnimatePresence>
      {fired && (
        <motion.div
          key="seal"
          className={cn("flex flex-col items-center gap-3 py-2", className)}
          initial={{ opacity: reduced ? 1 : 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.2 }}
        >
          <div className="relative grid place-items-center">
            {/* Impact shockwave — the paper reacting to the stamp landing. */}
            {!reduced && (
              <motion.span
                aria-hidden
                className="absolute h-28 w-28 rounded-full border border-gold-400/40"
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: [0.7, 0.7, 1.45], opacity: [0, 0.7, 0] }}
                transition={{ duration: 0.75, times: [0, 0.42, 1], ease: "easeOut" }}
              />
            )}

            <motion.div
              initial={stamp.initial}
              animate={stamp.animate}
              transition={
                reduced
                  ? { duration: 0 }
                  : { duration: STAMP_MS, times: [0, 0.55, 0.78, 1], ease: [0.4, 0, 0.2, 1] }
              }
              className={cn(
                "relative grid h-24 w-24 place-items-center rounded-full",
                // Embossed: a bright inner top edge and a dark inner bottom edge
                // read as a raised die pressed into the surface.
                "border-2 border-gold-500/70 bg-ink-900",
                "shadow-[inset_0_2px_0_rgba(255,255,255,0.08),inset_0_-3px_6px_rgba(0,0,0,0.6),0_10px_24px_-8px_rgba(0,0,0,0.9)]",
              )}
            >
              <span className="absolute inset-1.5 rounded-full border border-dashed border-gold-500/30" />
              <ShieldCheck className="h-7 w-7 text-gold-400" strokeWidth={1.75} />
              <span className="mt-0.5 text-micro font-semibold uppercase tracking-[0.18em] text-gold-300">
                {label}
              </span>
            </motion.div>
          </div>

          {/* The evidence. Static, selectable, never animated. */}
          <div className="text-center">
            <p className="text-detail font-medium text-ink-200">{signedBy}</p>
            <p className="mt-0.5 text-micro text-ink-500">{formatDateTime(signedAt)}</p>
            <p className="stat-mono mt-2 select-all text-micro text-ink-400">
              {ledgerId}
              {hash && <span className="text-ink-600"> · {hash}</span>}
            </p>
            <p className="mt-1 text-micro text-ink-600">
              Written to the audit ledger. Corrections are filed as addenda.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
