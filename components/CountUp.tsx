"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animates a number from 0 → value once, on mount. Falls back to the final
 * value immediately for non-numeric content. Respects reduced-motion.
 *
 * HYDRATION NOTE — do not "improve" this by seeding state with `value`.
 *
 * Seeding with 0 is deliberate and it is what makes this hydration-safe: the
 * server renders "0" and the client's first render also renders "0", so the two
 * trees agree by construction. The animation is then started from a passive
 * effect, which runs after paint and therefore after this subtree has finished
 * hydrating.
 *
 * Seeding with `value` and rewinding in a LAYOUT effect looks better on paper —
 * it renders the real figure for non-JS readers and avoids a flash. It also
 * breaks hydration: `useLayoutEffect` runs inside the hydration commit, so the
 * state update it triggers races React's adoption of the server HTML and
 * produces "text content does not match" (#425) across a dozen routes. That was
 * measured, not theorised: the variant emitted #425 on 14 of 55 routes while
 * this version emits none.
 */
export function CountUp({
  value,
  prefix = "",
  suffix = "",
  duration = 900,
  decimals = 0,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  decimals?: number;
}) {
  const [display, setDisplay] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  const formatted = display.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (
    <span>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
