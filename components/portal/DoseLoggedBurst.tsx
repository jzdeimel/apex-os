"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { sequenceFor, residues, CLASS_COLOR } from "@/lib/peptides/sequence";
import { pkFor, concentrationCurve } from "@/lib/peptides/pharmacokinetics";

/**
 * The moment a dose is logged.
 *
 * WHAT THIS IS NOW, AND WHAT IT WAS
 * ---------------------------------
 * AUDIT FINDING P0-2 (docs/audit/ENGAGEMENT.md): this was a blocking
 * `fixed inset-0` overlay with a backdrop blur, held for 2.1 seconds with no way
 * to dismiss it, captioned *"your level steps up"*.
 *
 * That is the richest variable reward in the entire product, and it was firing
 * on medication administration. The scoring layer goes to real lengths to avoid
 * exactly this — `XP_WEIGHTS` (lib/play/levels.ts) contains no dose count, and
 * `lib/play/quests.ts:73` drops dose-shaped quests at RUNTIME with a console
 * warning. The rules were enforced in the maths and then broken by the interface
 * that sits on top of it, using the word "level" while it did so.
 *
 * Three things changed and none of them is cosmetic:
 *
 *   1. **The caption is gone.** No "level", no score, no progress language.
 *      Nothing here tells a member they gained anything by injecting.
 *   2. **It does not block.** `pointer-events-none` on the positioner, exactly
 *      like `components/portal/DayComplete.tsx`, which got this right. The only
 *      thing that takes a tap is the card itself, and the tap dismisses it. A
 *      member who wants to log the next dose can, immediately, without waiting.
 *   3. **It is short** — ~1.1s of animation, retired at 1.4s. The old duration
 *      was long enough to be a gate rather than an acknowledgement.
 *
 * WHAT SURVIVES, AND WHY IT SHOULD
 * --------------------------------
 * The molecular backbone stays. It is not a prize — it is a fact about what the
 * member just put in their body, drawn from the same published sequence data the
 * peptide library renders. BPC-157 really is fifteen residues with five prolines;
 * the animation differs per compound because the molecule does. Showing someone
 * their own medication is information, and information is allowed to be
 * beautiful. What is not allowed is telling them they scored.
 *
 * The concentration curve stays for the same reason and is now unlabelled: it is
 * the real superposition maths from lib/peptides/pharmacokinetics, showing blood
 * concentration one dose further along. Silent, because the moment a caption
 * called that "your level" it stopped reading as pharmacology.
 *
 * Falls back to a clean pulse for compounds with no published sequence, rather
 * than inventing one. Reduced motion gets the end state and no travel.
 */

const W = 300;
const H = 92;

export function DoseLoggedBurst({
  show,
  libraryKey,
  name,
  onDone,
}: {
  show: boolean;
  libraryKey?: string;
  name: string;
  onDone?: () => void;
}) {
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(false);

  const dismiss = () => {
    setVisible(false);
    onDone?.();
  };

  useEffect(() => {
    if (!show) return;
    setVisible(true);
    // Short enough to read as an acknowledgement rather than a gate. The old
    // 2100ms was two full seconds of a member being unable to do anything else.
    const t = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, reduce ? 700 : 1400);
    return () => clearTimeout(t);
  }, [show, reduce, onDone]);

  const seq = libraryKey ? sequenceFor(libraryKey) : undefined;
  const pk = libraryKey ? pkFor(libraryKey) : undefined;

  // Residues, capped so a 43-mer still reads at this size.
  const rs = seq ? residues(seq.seq).slice(0, 22) : [];
  const step = rs.length > 1 ? (W - 36) / (rs.length - 1) : 0;
  const pts = rs.map((r, i) => ({
    x: 18 + i * step,
    // Hydropathy drives height, same as the library diagram.
    y: 32 + (0.5 - (r.hydropathy + 4.5) / 9) * 24,
    color: CLASS_COLOR[r.cls],
    kink: r.code === "P",
  }));
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  // Concentration, two doses' worth, so the step up is visible.
  const curve =
    pk?.characterised && pk.halfLifeHours && pk.typicalIntervalHours
      ? concentrationCurve({
          halfLifeHours: pk.halfLifeHours,
          intervalHours: pk.typicalIntervalHours,
          doses: 4,
          resolution: 12,
          tailIntervals: 0,
        })
      : null;
  const cMax = curve ? Math.max(...curve.map((c) => c.level)) || 1 : 1;
  const cPath = curve
    ? curve
        .map((c, i) => {
          const x = 18 + (i / (curve.length - 1)) * (W - 36);
          const y = H - 12 - (c.level / cMax) * 24;
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(" ")
    : null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ type: "spring", stiffness: 320, damping: 26 }}
          /**
           * `pointer-events-none` on the positioner and `inset-x-0 bottom-24` in
           * place of `inset-0`. The whole screen stays live underneath — the
           * only element that captures a tap is the card, and that tap closes
           * it. Matches DayComplete's geometry so the two celebrations do not
           * arrive from different places on the same screen.
           */
          className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex justify-center px-4 lg:bottom-10"
        >
          <button
            type="button"
            onClick={dismiss}
            aria-label={`${name} logged. Dismiss.`}
            className="pointer-events-auto w-full max-w-sm rounded-panel border border-optimal/25 bg-ink-900/95 p-4 text-left shadow-glow backdrop-blur focus-ring"
          >
            {/* Spans, not paragraphs. A <button> may only contain phrasing
                content, and a <p> inside one is invalid HTML that browsers
                resolve by breaking the button out of its own layout. */}
            <span className="block text-micro uppercase tracking-[0.14em] text-optimal">Logged</span>
            <span className="mt-1 block text-body font-medium leading-tight text-ink-50">{name}</span>

            <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full text-ink-400" aria-hidden>
              {seq && pts.length > 1 ? (
                <>
                  {/* Beat 1 — the chain draws itself. */}
                  <motion.path
                    d={path}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeOpacity="0.5"
                    initial={reduce ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: reduce ? 0 : 0.4, ease: "easeOut" }}
                  />
                  {pts.map((p, i) =>
                    p.kink ? (
                      <motion.rect
                        key={i}
                        x={p.x - 3}
                        y={p.y - 3}
                        width={6}
                        height={6}
                        fill={p.color}
                        transform={`rotate(45 ${p.x} ${p.y})`}
                        initial={reduce ? false : { scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: reduce ? 0 : 0.04 + i * 0.014, type: "spring", stiffness: 600, damping: 20 }}
                        style={{ transformOrigin: `${p.x}px ${p.y}px` }}
                      />
                    ) : (
                      <motion.circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={3}
                        fill={p.color}
                        initial={reduce ? false : { scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: reduce ? 0 : 0.04 + i * 0.014, type: "spring", stiffness: 600, damping: 20 }}
                        style={{ transformOrigin: `${p.x}px ${p.y}px` }}
                      />
                    ),
                  )}

                  {/* Beat 2 — a pulse runs N to C, the direction the chain is
                      read and synthesised. */}
                  {!reduce && (
                    <circle r="4" fill="var(--c-optimal)">
                      <animateMotion dur="0.5s" begin="0.35s" fill="freeze" path={path} />
                      <animate attributeName="opacity" values="0;1;1;0" dur="0.5s" begin="0.35s" fill="freeze" />
                    </circle>
                  )}
                </>
              ) : (
                <motion.circle
                  cx={W / 2}
                  cy={32}
                  r="10"
                  fill="none"
                  stroke="var(--c-optimal)"
                  strokeWidth="2"
                  initial={reduce ? false : { scale: 0.4, opacity: 1 }}
                  animate={{ scale: 2.2, opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.6, ease: "easeOut" }}
                  style={{ transformOrigin: `${W / 2}px 32px` }}
                />
              )}

              {/* Beat 3 — blood concentration, one dose further along. Real
                  superposition maths, drawn and left unlabelled. This line used
                  to be captioned "your level steps up", which turned a
                  pharmacokinetic curve into a score. */}
              {cPath && (
                <>
                  <line x1="18" y1={H - 12} x2={W - 18} y2={H - 12} stroke="currentColor" strokeOpacity="0.18" />
                  <motion.path
                    d={cPath}
                    fill="none"
                    stroke="var(--c-watch)"
                    strokeWidth="1.8"
                    initial={reduce ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 0.5, ease: "easeOut" }}
                  />
                </>
              )}
            </svg>

            {/* A receipt, not a reward. It names what was recorded and where it
                went, and says nothing about the member having earned anything. */}
            <span className="block text-detail leading-relaxed text-ink-400">
              {seq
                ? `${seq.seq.length} residues · recorded on your chart`
                : "Recorded on your chart"}
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
