"use client";

/**
 * MechanismDiagram — "compound → what it binds → what that changes → the effect".
 *
 * ONE SHAPE, PARAMETERISED. Every compound in the library declares the same
 * three-or-four-stage `pathway`, and this component renders it. A bespoke
 * drawing per compound would look better in a screenshot and would rot within
 * two months — nobody maintains thirteen hand-drawn SVGs, and the moment one
 * falls out of step with its `howItWorks` copy the diagram is quietly asserting
 * something the text does not.
 *
 * Every label here traces back to `PeptideEntry.pathway` in the library. The
 * component invents nothing.
 *
 * ORIENTATION WITHOUT A MEDIA-QUERY HOOK
 * The chain runs vertically on a phone and horizontally from `sm` up. Reading
 * `window.matchMedia` to pick one would desync server and client render, so the
 * travelling pulse animates its `top` AND `left` together: on a vertical
 * connector (1px wide, 32px tall) only the vertical movement is visible, on a
 * horizontal one (1px tall, flexible width) only the horizontal. One animation,
 * correct in both orientations, no hydration risk.
 */

import { motion, useReducedMotion } from "framer-motion";
import { Activity, Crosshair, FlaskConical, Target } from "lucide-react";
import type { PathwayStage, PeptideEntry } from "@/lib/peptides/library";
import { cn } from "@/lib/utils";

const KIND_ICON = {
  compound: FlaskConical,
  target: Crosshair,
  signal: Activity,
  effect: Target,
} as const;

const KIND_LABEL = {
  compound: "The compound",
  target: "What it acts on",
  signal: "What changes",
  effect: "The intended effect",
} as const;

export function MechanismDiagram({
  entry,
  className,
}: {
  entry: PeptideEntry;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const stages = entry.pathway;

  return (
    <div className={cn("w-full", className)}>
      <div className="flex flex-col items-stretch sm:flex-row sm:items-start">
        {stages.map((stage, i) => (
          <div key={stage.label} className="contents">
            <Stage stage={stage} accent={entry.accent} />
            {i < stages.length - 1 && (
              <Connector accent={entry.accent} index={i} reduce={!!reduce} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Stage({ stage, accent }: { stage: PathwayStage; accent: string }) {
  const Icon = KIND_ICON[stage.kind];
  return (
    <div className="flex min-w-0 flex-1 flex-row items-start gap-3 sm:flex-col sm:items-center sm:gap-2 sm:text-center">
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border"
        style={{ color: accent, borderColor: `${accent}40`, background: `${accent}14` }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="label-eyebrow">{KIND_LABEL[stage.kind]}</p>
        <p className="mt-1 font-display text-body font-semibold leading-tight text-ink-50">
          {stage.label}
        </p>
        <p className="mt-1 text-detail leading-relaxed text-ink-400">{stage.detail}</p>
      </div>
    </div>
  );
}

function Connector({
  accent,
  index,
  reduce,
}: {
  accent: string;
  index: number;
  reduce: boolean;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        // Vertical rail on mobile, hairline rail on sm+. Both are 1px on their
        // short axis, which is what lets one animation serve both.
        "relative my-1 ml-5 h-8 w-px shrink-0 self-start",
        "sm:my-0 sm:ml-0 sm:mt-5 sm:h-px sm:w-auto sm:flex-1 sm:self-auto",
      )}
      style={{ background: `${accent}30` }}
    >
      <motion.span
        className="absolute h-1.5 w-1.5 rounded-full"
        style={{ background: accent, x: "-50%", y: "-50%", boxShadow: `0 0 8px ${accent}` }}
        initial={false}
        animate={
          reduce
            ? // Degrade to the FINAL state — a pulse resting at the far end of
              // the connector — rather than to nothing.
              { top: "100%", left: "100%", opacity: 0.9 }
            : { top: ["0%", "100%"], left: ["0%", "100%"], opacity: [0, 1, 1, 0] }
        }
        transition={
          reduce
            ? { duration: 0 }
            : {
                duration: 2.2,
                // Cascade down the chain so the pulse reads as one signal
                // travelling, not four blinking dots.
                delay: index * 0.55,
                repeat: Infinity,
                repeatDelay: 0.7,
                ease: "easeInOut",
                times: [0, 1],
                opacity: { duration: 2.2, times: [0, 0.15, 0.85, 1], repeat: Infinity, repeatDelay: 0.7, delay: index * 0.55 },
              }
        }
      />
    </div>
  );
}
