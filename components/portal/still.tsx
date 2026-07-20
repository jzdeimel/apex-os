"use client";

/**
 * Static stand-ins for the decorative motion wrappers, for the member portal.
 *
 * WHY THIS EXISTS
 *
 * The portal wrapped almost every static card in `<FadeIn>` and almost every
 * static list in `<Stagger>/<StaggerItem>`. Nothing about that motion carried
 * information: the content was fully known at render time, so the animation
 * only delayed it. Content that rises and fades in one row at a time, on every
 * screen, for content that never changes, is one of the most recognisable
 * fingerprints of a generated interface — and on a phone, where the member is
 * usually reading one screen and leaving, it is a tax on the only thing they
 * came for.
 *
 * It was also a correctness problem. A verification pass caught the member home
 * page rendering its greeting at `opacity: 0` on a 390px viewport: the entry
 * animation had not settled, and the most important element on the screen was
 * measurably invisible. Static content cannot fail that way.
 *
 * WHY A MODULE RATHER THAN UNWRAPPING THE JSX
 *
 * These components render a `motion.div` with the caller's `className`. The
 * versions here render a plain `div` with the same `className`, so the DOM tree
 * and every layout-bearing class are byte-for-byte identical — only the
 * animation is gone. Deleting the wrappers from ~24 files by hand would have
 * changed nesting and risked dropping a `space-y` or a grid child; swapping the
 * import cannot.
 *
 * WHAT IS DELIBERATELY STILL ANIMATED
 *
 * `SwitchView` and `Lift` are re-exported from the real motion module, unchanged.
 * A crossfade between tab panels marks a state change the member initiated, and
 * a hover lift is feedback on a pointer. Both convey something. Anything that
 * conveys something keeps its motion — the ring fills in `DailyRings`, the
 * count-ups, the disclosure heights are all untouched by this file.
 */

import * as React from "react";

/** Was: fade + 10px rise on mount. Now: nothing, immediately. */
export function FadeIn({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
  /** Accepted and ignored so call sites need no edit. */
  delay?: number;
  y?: number;
}) {
  return <div className={className}>{children}</div>;
}

/** Was: a staggered container. Now: a plain container. */
export function Stagger({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}

/** Was: one staggered child. Now: a plain child. */
export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}

// Motion that earns its place, passed straight through.
export { SwitchView, Lift, motion, AnimatePresence } from "@/components/motion";
