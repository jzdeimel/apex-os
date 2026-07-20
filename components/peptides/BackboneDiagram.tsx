"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useId } from "react";
import {
  CLASS_COLOR,
  residues,
  type PeptideSequence,
  type Residue,
} from "@/lib/peptides/sequence";

/**
 * Primary-sequence backbone.
 *
 * Every coordinate here is derived from real chemistry, which is the whole
 * point. The previous graphic was a parametric ellipse with random jitter,
 * identical for every compound; it looked scientific and encoded nothing, and
 * it also drew linear peptides as rings, which is simply wrong.
 *
 * What is encoded now:
 *   - Position   — residue order, N-terminus to C-terminus, left to right,
 *                  serpentining onto a second row when the chain is long.
 *   - Height     — Kyte-Doolittle hydropathy. Hydrophobic residues ride high,
 *                  hydrophilic sit low, so the chain's silhouette IS its
 *                  solubility profile. Two molecules cannot look alike unless
 *                  they genuinely are alike.
 *   - Kinks      — proline bends the backbone, because in the real molecule it
 *                  does. BPC-157's five prolines are why it reads as jagged.
 *   - Colour     — side-chain class.
 *   - Bonds      — a cyclisation arc is drawn only where the molecule is truly
 *                  a macrocycle; an acylation branch only where a fatty acid is
 *                  really attached.
 *
 * Motion is directional rather than decorative: a pulse travels N-terminus to
 * C-terminus, which is the direction the chain is read and synthesised.
 */

const ROW_H = 54;
const PAD_X = 18;
const AMP = 15; // px of vertical travel across the full hydropathy range

interface Placed {
  r: Residue;
  i: number; // 0-based
  x: number;
  y: number;
  row: number;
  kink: boolean;
}

/** Hydropathy runs about -4.5..4.5; map to a 0..1 height. */
const heightOf = (h: number) => (h + 4.5) / 9;

function layout(seq: string, width: number, perRow: number): { placed: Placed[]; rows: number } {
  const rs = residues(seq);
  const rows = Math.ceil(rs.length / perRow);
  const usable = width - PAD_X * 2;
  const step = rs.length > 1 ? usable / (Math.min(perRow, rs.length) - 1 || 1) : 0;

  const placed = rs.map((r, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    // Odd rows run right-to-left so the chain is continuous, like a real
    // serpentine sequence viewer rather than a set of disconnected lines.
    const dir = row % 2 === 0 ? col : Math.min(perRow, rs.length - row * perRow) - 1 - col;
    return {
      r,
      i,
      x: PAD_X + dir * step,
      y: ROW_H / 2 + row * ROW_H + (0.5 - heightOf(r.hydropathy)) * AMP * 2,
      row,
      kink: r.code === "P",
    };
  });

  return { placed, rows };
}

/** Smooth path through the placed residues, broken between serpentine rows. */
function pathFor(placed: Placed[], width: number): string {
  if (!placed.length) return "";
  const segs: string[] = [];
  let row = -1;
  placed.forEach((p, i) => {
    if (p.row !== row) {
      const prev = placed[i - 1];
      row = p.row;
      if (!prev) {
        segs.push(`M${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
        return;
      }
      // Serpentine turn. Odd rows run right-to-left, so the last residue of one
      // row sits directly above the first of the next; a U-turn keeps the chain
      // visibly CONTINUOUS. Drawing separate lines would imply separate chains,
      // which is exactly the kind of quiet untruth this component exists to avoid.
      const bulge = (p.x > width / 2 ? 1 : -1) * 16;
      segs.push(
        `C${(prev.x + bulge).toFixed(1)} ${prev.y.toFixed(1)} ${(p.x + bulge).toFixed(1)} ${p.y.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
      );
      return;
    }
    const prev = placed[i - 1];
    // A proline gets a sharp corner; everything else flows through a curve.
    if (p.kink || prev.kink) {
      segs.push(`L${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    } else {
      const mx = (prev.x + p.x) / 2;
      segs.push(`Q${mx.toFixed(1)} ${prev.y.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    }
  });
  return segs.join(" ");
}

export function BackboneDiagram({
  sequence,
  accent,
  width = 320,
  compact = false,
  onResidueHover,
}: {
  sequence: PeptideSequence;
  accent: string;
  width?: number;
  /** Compact hides labels and shrinks beads — for grid cards. */
  compact?: boolean;
  onResidueHover?: (r: Residue | null, index: number) => void;
}) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, "");

  const perRow = sequence.seq.length <= 16 ? sequence.seq.length : Math.ceil(sequence.seq.length / Math.ceil(sequence.seq.length / 16));
  const { placed, rows } = layout(sequence.seq, width, perRow);

  const cyc = sequence.features.find((f) => f.kind === "cyclisation");
  const acyl = sequence.features.filter((f) => f.kind === "acylation");

  // Both the cyclisation arc and the acylation tail hang BELOW the backbone.
  // The viewBox has to reserve room for them or they spill over the card title
  // — so the extra space is computed from the features that are actually drawn
  // rather than padded blindly on every molecule.
  const cycDrop = cyc ? 34 : 0;
  const acylDrop = acyl.length ? 26 : 0;
  const height = rows * ROW_H + 12 + Math.max(cycDrop, acylDrop);

  const bead = compact ? 3.6 : 5;
  const path = pathFor(placed, width);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label={`Primary sequence: ${sequence.seq.length} residues, N-terminus to C-terminus`}
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={`bb-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={accent} stopOpacity="0.25" />
          <stop offset="50%" stopColor={accent} stopOpacity="0.75" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.25" />
        </linearGradient>
        <filter id={`gl-${uid}`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Cyclisation bond — drawn ONLY where the molecule really is a ring. */}
      {cyc && placed[cyc.at - 1] && placed[(cyc.to ?? 1) - 1] && (
        <path
          d={(() => {
            const a = placed[cyc.at - 1];
            const b = placed[(cyc.to ?? 1) - 1];
            // Clamped so a wide span cannot swing the arc outside the viewBox.
            const lift = Math.min(cycDrop - 6, Math.max(18, Math.abs(b.x - a.x) * 0.34));
            return `M${a.x} ${a.y} C${a.x} ${a.y + lift} ${b.x} ${b.y + lift} ${b.x} ${b.y}`;
          })()}
          fill="none"
          stroke={accent}
          strokeWidth="1.3"
          strokeDasharray="3 3"
          opacity="0.75"
        />
      )}

      {/* Backbone */}
      <path d={path} fill="none" stroke={`url(#bb-${uid})`} strokeWidth={compact ? 1.6 : 2.2} strokeLinecap="round" />

      {/* Directional pulse: N-terminus to C-terminus, the way a chain is read. */}
      {!reduce && (
        <motion.circle
          r={compact ? 2.6 : 3.4}
          fill={accent}
          filter={`url(#gl-${uid})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.95, 0.95, 0] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: "linear", times: [0, 0.08, 0.85, 1] }}
        >
          <animateMotion dur="3.4s" repeatCount="indefinite" path={path} />
        </motion.circle>
      )}

      {/* Acylation branches — a real fatty-acid tether, drawn where one exists. */}
      {acyl.map((f) => {
        const p = placed[f.at - 1];
        if (!p) return null;
        const tail = Array.from({ length: 5 }, (_, k) => `${p.x + 6 + k * 5} ${p.y + 14 + (k % 2 === 0 ? -3.5 : 3.5)}`);
        return (
          <g key={`acyl-${f.at}`} opacity="0.85">
            <polyline
              points={`${p.x} ${p.y} ${tail.join(" ")}`}
              fill="none"
              stroke={accent}
              strokeWidth="1.1"
              strokeLinejoin="round"
              opacity="0.6"
            />
            <circle cx={p.x} cy={p.y} r={bead + 2.4} fill="none" stroke={accent} strokeWidth="1" opacity="0.5" />
          </g>
        );
      })}

      {/* Residues */}
      {placed.map((p) => {
        const color = CLASS_COLOR[p.r.cls];
        return (
          <g
            key={p.i}
            onMouseEnter={() => onResidueHover?.(p.r, p.i)}
            onMouseLeave={() => onResidueHover?.(null, -1)}
            style={{ cursor: onResidueHover ? "pointer" : undefined }}
          >
            {/* Proline gets a diamond: a visual marker for a real structural kink. */}
            {p.kink ? (
              <rect
                x={p.x - bead}
                y={p.y - bead}
                width={bead * 2}
                height={bead * 2}
                fill={color}
                transform={`rotate(45 ${p.x} ${p.y})`}
                opacity="0.95"
              />
            ) : (
              <circle cx={p.x} cy={p.y} r={bead} fill={color} opacity="0.95" />
            )}
            {!compact && (
              <text
                x={p.x}
                y={p.y - bead - 5}
                textAnchor="middle"
                className="font-mono"
                fontSize="7.5"
                fill="currentColor"
                opacity="0.55"
              >
                {p.r.code}
              </text>
            )}
          </g>
        );
      })}

      {/* Terminus labels: orientation is information, not decoration. */}
      {!compact && placed.length > 0 && (
        <>
          <text x={2} y={placed[0].y + 3} fontSize="7.5" className="font-mono" fill="currentColor" opacity="0.4">
            N
          </text>
          <text
            x={width - 8}
            y={placed[placed.length - 1].y + 3}
            fontSize="7.5"
            className="font-mono"
            fill="currentColor"
            opacity="0.4"
          >
            C
          </text>
        </>
      )}
    </svg>
  );
}
