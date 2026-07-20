"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { sequenceFor, residues, CLASS_COLOR } from "@/lib/peptides/sequence";
import { pkFor, concentrationCurve } from "@/lib/peptides/pharmacokinetics";

/**
 * The moment a dose is logged.
 *
 * The first pass at this was a small tick in the corner, and it was boring —
 * correctly criticised. A tick is a receipt, not a reward, and the daily action
 * this product is built around deserves more than an acknowledgement.
 *
 * The fix is not more confetti. It is to show the thing that actually happened,
 * which no other health app is in a position to do: the compound the member
 * just took, drawn as its real backbone, and their concentration stepping up.
 *
 * The sequence runs in three beats over about 1.6 seconds:
 *
 *   1. The peptide's ACTUAL primary sequence draws itself left to right, residue
 *      by residue, coloured by side-chain class. This is the same published data
 *      the library renders — BPC-157 really is fifteen residues with five
 *      prolines, so the animation differs per compound because the molecule does.
 *   2. A pulse travels the chain, N-terminus to C-terminus, the direction it is
 *      read and synthesised.
 *   3. The concentration curve steps up by one dose, using the real
 *      superposition maths from lib/peptides/pharmacokinetics.
 *
 * Everything on screen is derived. Nothing is decorative, which is exactly why
 * it does not feel like a mobile game — it is the product showing off what it
 * knows, and that is a more adult kind of satisfying.
 *
 * Falls back to a clean pulse for compounds with no published sequence, rather
 * than inventing one. Reduced motion gets the end state and no travel.
 */

const W = 300;
const H = 96;

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

  useEffect(() => {
    if (!show) return;
    setVisible(true);
    const t = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, reduce ? 900 : 2100);
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
    y: 34 + (0.5 - (r.hydropathy + 4.5) / 9) * 26,
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
          const y = H - 14 - (c.level / cMax) * 26;
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(" ")
    : null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-ink-950/80 px-6 backdrop-blur-sm"
        >
          <motion.div
            initial={reduce ? false : { scale: 0.94, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className="w-full max-w-sm rounded-panel border border-optimal/25 bg-ink-900/95 p-5 shadow-glow"
          >
            <p className="text-micro uppercase tracking-[0.14em] text-optimal">Logged</p>
            <p className="mt-1 text-title leading-tight text-ink-50">{name}</p>

            <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full text-ink-400" aria-hidden>
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
                    transition={{ duration: reduce ? 0 : 0.6, ease: "easeOut" }}
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
                        transition={{ delay: reduce ? 0 : 0.05 + i * 0.025, type: "spring", stiffness: 600, damping: 20 }}
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
                        transition={{ delay: reduce ? 0 : 0.05 + i * 0.025, type: "spring", stiffness: 600, damping: 20 }}
                        style={{ transformOrigin: `${p.x}px ${p.y}px` }}
                      />
                    ),
                  )}

                  {/* Beat 2 — a pulse runs N to C. */}
                  {!reduce && (
                    <circle r="4" fill="#34d399">
                      <animateMotion dur="0.7s" begin="0.55s" fill="freeze" path={path} />
                      <animate attributeName="opacity" values="0;1;1;0" dur="0.7s" begin="0.55s" fill="freeze" />
                    </circle>
                  )}
                </>
              ) : (
                <motion.circle
                  cx={W / 2}
                  cy={34}
                  r="10"
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="2"
                  initial={reduce ? false : { scale: 0.4, opacity: 1 }}
                  animate={{ scale: 2.2, opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.9, ease: "easeOut" }}
                  style={{ transformOrigin: `${W / 2}px 34px` }}
                />
              )}

              {/* Beat 3 — the level steps up. */}
              {cPath && (
                <>
                  <line x1="18" y1={H - 14} x2={W - 18} y2={H - 14} stroke="currentColor" strokeOpacity="0.18" />
                  <motion.path
                    d={cPath}
                    fill="none"
                    stroke="#e0bd6e"
                    strokeWidth="1.8"
                    initial={reduce ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : 0.75, ease: "easeOut" }}
                  />
                </>
              )}
            </svg>

            <p className="mt-1 text-detail leading-relaxed text-ink-400">
              {seq
                ? `${seq.seq.length} residues${cPath ? " · your level steps up" : ""}`
                : "Recorded on your chart"}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
