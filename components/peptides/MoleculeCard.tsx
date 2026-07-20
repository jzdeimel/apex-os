"use client";

/**
 * MoleculeCard — a compound in the member-facing library.
 *
 * The card leads with WHAT THIS IS FOR, not what it is made of.
 *
 * It previously led with a large molecular diagram. That diagram was accurate —
 * real published residues, real hydropathy, real bonds — and it was still the
 * wrong thing to show. A member scanning for "what helps me sleep" cannot read a
 * backbone, and plotting hydropathy raw produced visual noise because the value
 * flips sign at almost every residue, so thirteen cards read as thirteen
 * scribbles. Accuracy did not rescue it.
 *
 * So the hero is now an icon for the outcome the compound is associated with,
 * plus a spec row a clinician would actually use: half-life, route, onset,
 * evidence. The structure is still there, one tap down, for anyone who wants it.
 *
 * HONESTY. Several fields here are allowed to say "we do not know", and that is
 * the most valuable thing on the card. BPC-157 has no characterised human
 * half-life; semaglutide has a well-studied one. Showing both truthfully, side
 * by side, is the difference between a catalogue and a sales page.
 */

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Lock } from "lucide-react";
import { BackboneDiagram } from "@/components/peptides/BackboneDiagram";
import { sequenceFor } from "@/lib/peptides/sequence";
import { pkFor } from "@/lib/peptides/pharmacokinetics";
import { PKCurve } from "@/components/peptides/PKCurve";
import { iconForUses, primaryUse } from "@/lib/peptides/useIcons";
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
  // Real published sequence where we have one; undefined is a supported state.
  const seq = sequenceFor(entry.key);
  const pk = pkFor(entry.key);
  const UseIcon = iconForUses(entry.commonlyUsedFor);
  const lead = primaryUse(entry.commonlyUsedFor);

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
      {/*
        Header: what this compound is FOR.

        This replaced a large molecular diagram that occupied roughly 40% of the
        card. The diagram was accurate — real residues, real hydropathy — but it
        answered a question neither a member nor a coach was asking, and plotting
        hydropathy raw produced visual noise because it flips sign almost every
        residue. Leading with the outcome makes the grid scannable, which is the
        actual job of a card. The structure is still available, one tap down, for
        anyone who wants it.
      */}
      <div className="flex items-center gap-3 px-5 pb-3 pt-5">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
          style={{ backgroundColor: `${entry.accent}1f`, color: entry.accent }}
        >
          <UseIcon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-detail font-medium text-ink-200">{lead ?? entry.family}</p>
          <p className="truncate text-micro text-ink-500">{entry.family}</p>
        </div>
      </div>


      {/* ---------------------------------------------------------------- */}
      {/* Identity                                                          */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-1 flex-col gap-3 px-5 pb-5 pt-1">
        <div>
          <h3 className="font-display text-body font-semibold text-ink-50">{entry.name}</h3>
          {entry.aka.length > 0 && (
            <p className="mt-0.5 truncate text-detail text-ink-500">{entry.aka.join(" · ")}</p>
          )}
        </div>

        <p className="text-body leading-relaxed text-ink-300">{entry.memberSafeCopy}</p>

        {/* The spec row. This is the density that makes the card read as a
            reference tool rather than a tile. Every value is allowed to be
            "not characterised" — that is a finding, not a hole. */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-ink-900/50 px-3 py-2.5">
          <Spec
            label="Half-life"
            value={pk ? pk.display : "—"}
            muted={!pk?.characterised}
          />
          <Spec
            label="Onset"
            value={
              entry.onsetWeeks ? `weeks ${entry.onsetWeeks[0]}–${entry.onsetWeeks[1]}` : "not established"
            }
            muted={!entry.onsetWeeks}
          />
        </dl>

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
          className="focus-ring -mx-1 mt-auto flex items-center justify-between rounded-lg px-1 py-1.5 text-left text-detail font-medium text-ink-300 transition-colors hover:text-ink-50"
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
              <div className="space-y-3 border-t border-ink-700/70 pt-3 text-body leading-relaxed">
                <Detail label="What it is" body={entry.whatItIs} />
                <Detail label="How it works" body={entry.howItWorks} />
                <Detail label="How it goes in" body={entry.route} />
                {pk?.characterised && pk.typicalIntervalHours !== null && (
                  <div>
                    <p className="label-eyebrow">What the level does over time</p>
                    <div className="mt-1.5 text-ink-200">
                      <PKCurve pk={pk} accent={entry.accent} />
                    </div>
                  </div>
                )}
                {pk && (
                  <Detail
                    label="How long it stays in you"
                    body={
                      pk.characterised
                        ? `Half-life ${pk.display} — the time for half of what is present to be cleared.`
                        : pk.display
                    }
                    hint={pk.basis}
                  />
                )}
                {seq && (
                  <div>
                    <p className="label-eyebrow">Structure</p>
                    <div className="mt-1.5 text-ink-200">
                      <BackboneDiagram sequence={seq} accent={entry.accent} width={280} compact />
                    </div>
                    <p className="mt-1 text-detail text-ink-500">
                      {seq.seq.length} amino acids, N-terminus to C-terminus
                      {seq.cyclic ? ", closed into a ring" : ""}. Height follows each residue&apos;s
                      water affinity; diamonds mark proline, which bends the chain.
                    </p>
                  </div>
                )}
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

function Spec({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-micro uppercase tracking-[0.14em] text-ink-500">{label}</dt>
      <dd className={cn("truncate text-detail", muted ? "text-ink-500 italic" : "text-ink-200")}>
        {value}
      </dd>
    </div>
  );
}

function Detail({ label, body, hint }: { label: string; body: string; hint?: string }) {
  return (
    <div>
      <p className="label-eyebrow">{label}</p>
      <p className="mt-1 text-ink-300">{body}</p>
      {hint && <p className="mt-1 text-detail text-ink-500">{hint}</p>}
    </div>
  );
}
