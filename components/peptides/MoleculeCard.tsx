"use client";

/**
 * MoleculeCard — the visual centrepiece of the library.
 *
 * The job is to make a compound *memorable* before it is understood: a member
 * who can picture the five-node ring of ipamorelin next to the 15-node ring of
 * BPC-157 has already learned something true (these are different sizes of the
 * same kind of thing) without reading a word.
 *
 * Three constraints shaped the implementation:
 *
 *  1. DETERMINISTIC. Node jitter, drift tempo and phase all come from
 *     `seededRandom(entry.key)`. The same compound draws identically on the
 *     server, on the client and in a screenshot six months from now.
 *
 *  2. CHEAP. Node count is capped at 18 regardless of chain length, and the
 *     whole chain drifts as ONE animated group rather than per-node
 *     animations — a gallery of thirteen cards is thirteen transforms, not two
 *     hundred. No React state changes during animation; the only state here is
 *     the expand toggle, which a human triggers.
 *
 *  3. HONEST. Two entries in the library are not peptides at all (NAD+ is a
 *     coenzyme, testosterone cypionate a steroid ester) and therefore carry no
 *     `chainLength`. Rather than inventing a chain for them, the card draws a
 *     small cluster and says "not a peptide" where the amino-acid count would
 *     be. The visual is not allowed to make a claim the data does not.
 */

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Lock } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import {
  evidenceTierBlurb,
  evidenceTierLabel,
  evidenceTierTone,
  type PeptideEntry,
} from "@/lib/peptides/library";
import { cn, clamp, seededRandom } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

const W = 264;
const H = 168;
const CX = W / 2;
const CY = 80;

/** Hard ceiling on drawn nodes. hCG is 237 amino acids; nobody needs 237 dots. */
const MAX_NODES = 18;

interface Node {
  x: number;
  y: number;
  r: number;
  /** Front half of the ring — drawn larger and brighter to read as depth. */
  front: boolean;
}

interface Geometry {
  nodes: Node[];
  /** Sequential path through the nodes, closed back to the start. */
  path: string;
  drawn: number;
  abridged: boolean;
  /** Seconds for one full drift cycle — per-compound so a grid never pulses in lockstep. */
  driftSeconds: number;
  tilt: number;
}

/**
 * Lay the chain out on a tilted ellipse.
 *
 * An ellipse rather than a straight line because a card is roughly square and a
 * 15-node line either runs off the edge or shrinks to dust. The vertical squash
 * plus the front/back size difference gives the ring a helix-like read at a
 * glance, which is the correct intuition for a folded peptide without
 * pretending to be a structural rendering.
 */
function geometry(entry: PeptideEntry): Geometry {
  const rand = seededRandom(entry.key);

  const isPeptide = typeof entry.chainLength === "number";
  const drawn = isPeptide ? clamp(entry.chainLength as number, 5, MAX_NODES) : 6;
  const abridged = isPeptide && (entry.chainLength as number) > MAX_NODES;

  // Small rings get a tighter radius so a 5-node peptide does not look sparse.
  const baseR = drawn <= 7 ? 46 : drawn <= 12 ? 54 : 60;
  const squash = 0.58;

  const nodes: Node[] = [];
  for (let i = 0; i < drawn; i++) {
    const t = (i / drawn) * Math.PI * 2 - Math.PI / 2;
    const jitter = 0.88 + rand() * 0.24;
    const lift = (rand() - 0.5) * 9;
    const front = Math.sin(t) > 0;
    nodes.push({
      x: CX + Math.cos(t) * baseR * jitter,
      y: CY + Math.sin(t) * baseR * squash * jitter + lift,
      r: (front ? 4.4 : 3.1) + rand() * 1.4,
      front,
    });
  }

  const path =
    nodes.map((n, i) => `${i === 0 ? "M" : "L"}${n.x.toFixed(2)} ${n.y.toFixed(2)}`).join(" ") + " Z";

  return {
    nodes,
    path,
    drawn,
    abridged,
    driftSeconds: 16 + Math.round(rand() * 10),
    tilt: 3 + rand() * 3,
  };
}

export function MoleculeCard({
  entry,
  /** Set when this compound appears on the viewing member's plan. */
  planChip,
  className,
}: {
  entry: PeptideEntry;
  planChip?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const geo = geometry(entry);

  const glowId = `mol-glow-${entry.key}`;
  const chainId = `mol-chain-${entry.key}`;
  const panelId = `mol-panel-${entry.key}`;

  return (
    <motion.article
      // `group` drives every hover/focus reveal below in CSS, so pointer state
      // never becomes React state.
      className={cn(
        "card group relative flex flex-col overflow-hidden transition-colors",
        planChip ? "border-gold-400/40" : "hover:border-ink-600",
        className,
      )}
      whileHover={reduce ? undefined : { y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
    >
      {planChip && (
        <span className="absolute right-3 top-3 z-10">
          <Badge tone="gold">{planChip}</Badge>
        </span>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* The molecule                                                      */}
      {/* ---------------------------------------------------------------- */}
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full"
          role="img"
          aria-label={`${entry.name} — ${
            entry.chainLength ? `${entry.chainLength} amino acids` : "not a peptide"
          }, ${entry.family}`}
        >
          <defs>
            <radialGradient id={glowId} cx="50%" cy="48%" r="50%">
              <stop offset="0%" stopColor={entry.accent} stopOpacity="0.34" />
              <stop offset="55%" stopColor={entry.accent} stopOpacity="0.09" />
              <stop offset="100%" stopColor={entry.accent} stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Soft accent glow. One breathing element, not per-node. */}
          <motion.ellipse
            cx={CX}
            cy={CY}
            rx={96}
            ry={62}
            fill={`url(#${glowId})`}
            initial={false}
            animate={reduce ? { scale: 1.03, opacity: 0.9 } : { scale: [1, 1.07, 1], opacity: [0.75, 1, 0.75] }}
            transition={
              reduce
                ? { duration: 0 }
                : { duration: geo.driftSeconds * 0.75, repeat: Infinity, ease: "easeInOut" }
            }
            style={{ transformOrigin: `${CX}px ${CY}px` }}
          />

          {/* The chain. Whole group drifts — a single transform per card. */}
          <motion.g
            id={chainId}
            initial={false}
            animate={
              reduce
                ? { rotate: 0, y: 0 }
                : { rotate: [-geo.tilt, geo.tilt, -geo.tilt], y: [-2.5, 2.5, -2.5] }
            }
            transition={
              reduce
                ? { duration: 0 }
                : { duration: geo.driftSeconds, repeat: Infinity, ease: "easeInOut" }
            }
            style={{ transformOrigin: `${CX}px ${CY}px` }}
            className="transition-opacity duration-300 opacity-80 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <path
              d={geo.path}
              fill="none"
              stroke={entry.accent}
              strokeOpacity={0.42}
              strokeWidth={1.4}
              strokeLinejoin="round"
            />
            {geo.nodes.map((n, i) => (
              <g key={i}>
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.r + 3.4}
                  fill={entry.accent}
                  opacity={n.front ? 0.16 : 0.08}
                />
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.r}
                  fill={entry.accent}
                  opacity={n.front ? 0.95 : 0.55}
                />
              </g>
            ))}
          </motion.g>
        </svg>

        {/* Chain length sits on the art, not in the prose — it is a property of
            the picture. "Not a peptide" is a real answer, not a gap. */}
        <span className="stat-mono absolute left-4 top-3 text-[11px] text-ink-400">
          {entry.chainLength
            ? `${entry.chainLength} aa${geo.abridged ? ` · ${geo.drawn} shown` : ""}`
            : "not a peptide"}
        </span>

        {/* Hover/focus reveal. Also duplicated in the expand panel below so a
            touch device is never the reason a member cannot read the route. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-x-3 gap-y-1 bg-gradient-to-t from-ink-850 to-transparent px-4 pb-2 pt-6 text-[11px] opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
          <span className="font-medium" style={{ color: entry.accent }}>
            {entry.family}
          </span>
          <span className="text-ink-400">{entry.route}</span>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Identity                                                          */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-1 flex-col gap-3 px-5 pb-5 pt-1">
        <div>
          <h3 className="font-display text-base font-semibold text-ink-50">{entry.name}</h3>
          {entry.aka.length > 0 && (
            <p className="mt-0.5 truncate text-xs text-ink-500">{entry.aka.join(" · ")}</p>
          )}
        </div>

        <p className="text-sm leading-relaxed text-ink-300">{entry.memberSafeCopy}</p>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={evidenceTierTone[entry.evidenceTier]}>
            {evidenceTierLabel[entry.evidenceTier]}
          </Badge>
          <Badge tone="neutral">
            <Lock className="h-3 w-3" />
            Prescription only
          </Badge>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="focus-ring -mx-1 mt-auto flex items-center justify-between rounded-lg px-1 py-1.5 text-left text-xs font-medium text-ink-300 transition-colors hover:text-ink-50"
        >
          <span>{open ? "Hide the detail" : "What it is, and how it works"}</span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 transition-transform duration-200", open && "rotate-180")}
          />
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              id={panelId}
              key="panel"
              initial={reduce ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.28, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="space-y-3 border-t border-ink-700/70 pt-3 text-sm leading-relaxed">
                <Detail label="What it is" body={entry.whatItIs} />
                <Detail label="How it works" body={entry.howItWorks} />
                <Detail label="How it goes in" body={entry.route} />
                <Detail
                  label="What we actually know"
                  body={entry.evidenceNote}
                  hint={evidenceTierBlurb[entry.evidenceTier]}
                />
                {entry.onsetWeeks ? (
                  <Detail
                    label="When people notice change"
                    body={`Most commonly reported between weeks ${entry.onsetWeeks[0]} and ${entry.onsetWeeks[1]}. Your own timeline is a conversation with your provider.`}
                  />
                ) : (
                  <Detail
                    label="When people notice change"
                    body="Not established. There is no reliable human data on timing for this compound, so we are not going to give you a number."
                  />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.article>
  );
}

function Detail({ label, body, hint }: { label: string; body: string; hint?: string }) {
  return (
    <div>
      <p className="label-eyebrow">{label}</p>
      <p className="mt-1 text-ink-300">{body}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}
